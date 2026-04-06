import uuid
import shutil
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Query
from fastapi import BackgroundTasks
from loguru import logger
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.auth import require_api_key
from app.config import settings
from app.database import create_job, upload_file_to_storage
from app.schemas import UploadResponse

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".docx", ".doc"}
MAX_BYTES = settings.MAX_FILE_SIZE_MB * 1024 * 1024


@router.post("/upload", response_model=UploadResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    doc_type: str = Query(default="auto", description="invoice | bank_statement | contract | auto"),
    client: dict = Depends(require_api_key),
):
    """
    Upload a single document for extraction.
    Returns a job_id immediately. Poll GET /jobs/{job_id} for status.
    """
    # Validate file type
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{suffix}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # Validate doc_type
    valid_types = {"invoice", "bank_statement", "contract", "auto"}
    if doc_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"doc_type must be one of {valid_types}")

    # Read file and check size
    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.MAX_FILE_SIZE_MB}MB limit")
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="File is empty")

    # Save locally for processing
    job_id = str(uuid.uuid4())
    local_path = f"{settings.UPLOAD_DIR}/{job_id}{suffix}"
    with open(local_path, "wb") as f_out:
        f_out.write(content)

    # Upload original to Supabase Storage (for audit trail)
    try:
        upload_file_to_storage(
            path=f"uploads/{client['id']}/{job_id}{suffix}",
            data=content,
            content_type=file.content_type or "application/octet-stream",
        )
    except Exception as e:
        logger.warning(f"Storage upload failed (non-fatal): {e}")

    # Create job record in DB
    create_job(job_id, client["id"], file.filename, doc_type)

    # Queue background processing
    background_tasks.add_task(_queue_job, job_id, local_path, doc_type, client)

    logger.info(f"Job {job_id} queued — {file.filename} ({len(content)/1024:.1f}KB) for client {client['id']}")

    return UploadResponse(
        job_id=job_id,
        status="queued",
        message=f"Extraction started. Poll GET /api/jobs/{job_id} for status.",
        filename=file.filename,
    )


def _queue_job(job_id: str, file_path: str, doc_type: str, client: dict):
    """Queue extraction to Celery (or run inline if Celery unavailable)."""
    try:
        from app.worker import process_document
        process_document.delay(job_id, file_path, doc_type, client)
        logger.info(f"Job {job_id} sent to Celery queue")
    except Exception as e:
        logger.warning(f"Celery unavailable ({e}), processing inline")
        # Fallback: run directly (blocks the request but works without Redis)
        from app.worker import process_document
        process_document(job_id, file_path, doc_type, client)
