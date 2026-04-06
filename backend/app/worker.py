"""
Celery worker — processes document extraction jobs in the background.

Start with:
    celery -A app.worker worker --loglevel=info --concurrency=4

Monitor with Flower:
    celery -A app.worker flower --port=5555
"""
import os
from datetime import datetime, timezone
from pathlib import Path

import resend
from celery import Celery
from loguru import logger

from app.config import settings
from app.database import get_job, update_job, upload_file_to_storage
from app.extractor import run_extraction_pipeline, build_excel

# ── Celery app ────────────────────────────────────
celery_app = Celery(
    "docextract",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Kolkata",
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,          # process one job at a time per worker
    task_soft_time_limit=180,              # 3 min soft limit
    task_time_limit=240,                   # 4 min hard kill
    task_max_retries=2,
    broker_connection_retry_on_startup=True,
)


# ── Main extraction task ──────────────────────────

@celery_app.task(
    bind=True,
    name="docextract.process_document",
    max_retries=2,
    default_retry_delay=10,
)
def process_document(self, job_id: str, file_path: str, doc_type: str, client: dict):
    """
    Background task: runs the full extraction pipeline for one document.
    Called by POST /api/upload after file is saved.
    """
    logger.info(f"[{job_id}] Starting extraction — file: {Path(file_path).name}")

    try:
        # Mark as processing
        update_job(job_id, status="processing")

        # Run pipeline
        result = run_extraction_pipeline(file_path, doc_type)

        # Build Excel output
        output_path = f"{settings.OUTPUT_DIR}/{job_id}.xlsx"
        build_excel(result["result_data"], output_path, result["doc_type"])

        # Upload Excel to Supabase Storage
        with open(output_path, "rb") as f:
            upload_file_to_storage(
                path=f"results/{client['id']}/{job_id}.xlsx",
                data=f.read(),
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        os.unlink(output_path)  # Clean up local file

        # Update job record → complete
        update_job(
            job_id,
            status="complete",
            doc_type=result["doc_type"],
            result_data=result["result_data"],
            confidence=result["confidence"],
            flagged=result["flagged"],
            processing_ms=result["processing_ms"],
            completed_at=datetime.now(timezone.utc).isoformat(),
        )

        # Send email notification
        _send_completion_email(client, job_id, result["confidence"], result["flagged"])

        logger.success(f"[{job_id}] Complete — confidence {result['confidence']:.0%}")

    except Exception as exc:
        logger.error(f"[{job_id}] Failed: {exc}", exc_info=True)

        if self.request.retries < self.max_retries:
            logger.info(f"[{job_id}] Retrying ({self.request.retries + 1}/{self.max_retries})")
            update_job(job_id, status="queued", error_message=f"Retrying: {str(exc)[:200]}")
            raise self.retry(exc=exc)

        # Final failure
        update_job(
            job_id,
            status="error",
            error_message=str(exc)[:500],
            completed_at=datetime.now(timezone.utc).isoformat(),
        )

    finally:
        # Always clean up uploaded file
        if os.path.exists(file_path):
            os.unlink(file_path)


# ── Email notification ────────────────────────────

def _send_completion_email(client: dict, job_id: str, confidence: float, flagged: bool):
    if not settings.RESEND_API_KEY or not client.get("email"):
        return

    resend.api_key = settings.RESEND_API_KEY
    dashboard_url = f"{os.getenv('NEXT_PUBLIC_SITE_URL', 'https://your-dashboard.vercel.app')}/dashboard/results?job={job_id}"

    flag_note = ""
    if flagged:
        flag_note = """
        <div style="background:#fff8e1;border:1px solid #f0b429;border-radius:8px;padding:12px 16px;margin:16px 0">
            ⚠️ <strong>Needs review</strong> — confidence below 85%. Please verify the extracted data.
        </div>"""

    html = f"""
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111">
        <div style="background:#0b0d0b;padding:24px;border-radius:12px 12px 0 0">
            <span style="color:#6ee97b;font-size:18px;font-weight:700">DocExtract</span>
        </div>
        <div style="padding:28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
            <p>Hi {client.get('name', 'there')},</p>
            <p>Your document has been processed successfully.</p>

            <table style="width:100%;border-collapse:collapse;margin:20px 0">
                <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Confidence</td>
                    <td style="padding:8px 0;font-weight:700;color:{'#16a34a' if confidence >= 0.9 else '#d97706' if confidence >= 0.75 else '#dc2626'}">{confidence:.0%}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Job ID</td>
                    <td style="padding:8px 0;font-family:monospace;font-size:12px;color:#6b7280">{job_id}</td></tr>
            </table>

            {flag_note}

            <a href="{dashboard_url}" style="display:inline-block;background:#0b0d0b;color:#6ee97b;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:8px">
                View & download results →
            </a>

            <p style="margin-top:24px;font-size:12px;color:#9ca3af">
                DocExtract · Chennai, India
            </p>
        </div>
    </div>
    """

    try:
        resend.Emails.send({
            "from": settings.FROM_EMAIL,
            "to": client["email"],
            "subject": f"✓ Your document is ready — {confidence:.0%} confidence",
            "html": html,
        })
        logger.info(f"Email sent to {client['email']}")
    except Exception as e:
        logger.warning(f"Email send failed: {e}")
