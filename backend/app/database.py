from supabase import create_client, Client
from loguru import logger
from app.config import settings

_client: Client | None = None


def get_db() -> Client:
    """Get Supabase client (singleton)."""
    global _client
    if _client is None:
        _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    return _client


async def init_db():
    """Verify DB connection on startup."""
    try:
        db = get_db()
        db.table("clients").select("id").limit(1).execute()
        logger.success("✓ Supabase connected")
    except Exception as e:
        logger.error(f"✗ Supabase connection failed: {e}")
        raise


# ── Helper functions ──────────────────────────────

def get_client_by_api_key(api_key: str) -> dict | None:
    db = get_db()
    result = db.table("clients").select("*").eq("api_key", api_key).execute()
    return result.data[0] if result.data else None


def create_job(job_id: str, client_id: str, filename: str, doc_type: str) -> dict:
    db = get_db()
    from datetime import datetime, timezone
    row = {
        "id": job_id,
        "client_id": client_id,
        "filename": filename,
        "doc_type": doc_type,
        "status": "queued",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    db.table("jobs").insert(row).execute()
    return row


def update_job(job_id: str, **kwargs) -> None:
    db = get_db()
    db.table("jobs").update(kwargs).eq("id", job_id).execute()


def get_job(job_id: str) -> dict | None:
    db = get_db()
    result = db.table("jobs").select("*").eq("id", job_id).execute()
    return result.data[0] if result.data else None


def get_jobs_for_client(client_id: str, limit: int = 50) -> list:
    db = get_db()
    result = (
        db.table("jobs")
        .select("*")
        .eq("client_id", client_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data


def upload_file_to_storage(path: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    """Upload file to Supabase Storage, return public/signed URL path."""
    db = get_db()
    db.storage.from_(settings.SUPABASE_STORAGE_BUCKET).upload(
        path=path, file=data,
        file_options={"content-type": content_type, "upsert": "true"},
    )
    return path


def get_signed_download_url(storage_path: str, expires_in: int = 3600) -> str:
    db = get_db()
    result = db.storage.from_(settings.SUPABASE_STORAGE_BUCKET).create_signed_url(
        storage_path, expires_in
    )
    return result["signedURL"]
