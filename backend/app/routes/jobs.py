from fastapi import APIRouter, HTTPException, Depends, Query
from app.auth import require_api_key
from app.database import get_job, get_jobs_for_client, get_signed_download_url
from app.schemas import JobStatus, DownloadResponse

router = APIRouter()


@router.get("/jobs", response_model=list[JobStatus])
def list_jobs(
    status: str | None = Query(default=None, description="Filter by status"),
    limit: int = Query(default=50, le=200),
    client: dict = Depends(require_api_key),
):
    """List all jobs for this client, newest first."""
    jobs = get_jobs_for_client(client["id"], limit=limit)
    if status:
        jobs = [j for j in jobs if j.get("status") == status]
    return jobs


@router.get("/jobs/{job_id}", response_model=JobStatus)
def get_job_status(job_id: str, client: dict = Depends(require_api_key)):
    """Get status and result for a specific job."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["client_id"] != client["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    return job


@router.get("/jobs/{job_id}/download", response_model=DownloadResponse)
def download_job_result(job_id: str, client: dict = Depends(require_api_key)):
    """Get a signed download URL for the Excel result (valid 1 hour)."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["client_id"] != client["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if job["status"] != "complete":
        raise HTTPException(status_code=409, detail=f"Job is not complete (status: {job['status']})")

    storage_path = f"results/{client['id']}/{job_id}.xlsx"
    try:
        url = get_signed_download_url(storage_path, expires_in=3600)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Result file not found: {e}")

    return DownloadResponse(
        download_url=url,
        expires_in=3600,
        filename=f"{job['filename'].rsplit('.', 1)[0]}_extracted.xlsx",
    )


@router.post("/jobs/{job_id}/retry")
def retry_job(job_id: str, client: dict = Depends(require_api_key)):
    """Retry a failed job."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["client_id"] != client["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if job["status"] not in ("error", "flagged"):
        raise HTTPException(status_code=409, detail="Only error/flagged jobs can be retried")

    from app.database import update_job
    update_job(job_id, status="queued", error_message=None)

    # Re-queue (note: original file was deleted after first run, so this only works if re-upload is done)
    return {"message": "Job re-queued. Note: you may need to re-upload the file if original was deleted."}


@router.delete("/jobs/{job_id}")
def delete_job(job_id: str, client: dict = Depends(require_api_key)):
    """Delete a job record (does not delete result files from storage)."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["client_id"] != client["id"]:
        raise HTTPException(status_code=403, detail="Access denied")

    from app.database import get_db
    get_db().table("jobs").delete().eq("id", job_id).execute()
    return {"message": "Job deleted"}
