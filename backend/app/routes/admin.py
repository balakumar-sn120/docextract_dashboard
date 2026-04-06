from fastapi import APIRouter, Depends
from app.auth import require_admin
from app.database import get_db
from app.schemas import StatsResponse

router = APIRouter()


@router.get("/stats", response_model=StatsResponse, dependencies=[Depends(require_admin)])
def admin_stats():
    """Global stats across all clients."""
    db = get_db()
    jobs = db.table("jobs").select("status,confidence,flagged,created_at").execute().data

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    this_month = [j for j in jobs if j.get("created_at", "")[:7] == now.strftime("%Y-%m")]

    confidences = [j["confidence"] for j in jobs if j.get("confidence") is not None]
    avg_conf = sum(confidences) / len(confidences) if confidences else 0.0

    return StatsResponse(
        total_jobs=len(jobs),
        completed=sum(1 for j in jobs if j["status"] == "complete"),
        processing=sum(1 for j in jobs if j["status"] == "processing"),
        failed=sum(1 for j in jobs if j["status"] == "error"),
        flagged=sum(1 for j in jobs if j.get("flagged")),
        avg_confidence=round(avg_conf, 3),
        docs_this_month=len(this_month),
    )


@router.get("/clients", dependencies=[Depends(require_admin)])
def list_clients():
    """List all clients with usage counts."""
    db = get_db()
    clients = db.table("clients").select("id,name,email,plan,created_at").execute().data
    jobs = db.table("jobs").select("client_id,status").execute().data

    job_counts = {}
    for j in jobs:
        cid = j["client_id"]
        job_counts[cid] = job_counts.get(cid, 0) + 1

    for c in clients:
        c["total_jobs"] = job_counts.get(c["id"], 0)

    return clients


@router.get("/flagged", dependencies=[Depends(require_admin)])
def flagged_jobs():
    """All jobs flagged for review."""
    db = get_db()
    return db.table("jobs").select("*").eq("flagged", True)\
             .order("created_at", desc=True).limit(100).execute().data


@router.post("/clients", dependencies=[Depends(require_admin)])
def create_client(body: dict):
    """Manually create a client record (for new signups)."""
    import uuid
    db = get_db()
    client = {
        "id": str(uuid.uuid4()),
        "name": body.get("name", ""),
        "email": body["email"],
        "company": body.get("company", ""),
        "api_key": str(uuid.uuid4()),
        "plan": body.get("plan", "starter"),
    }
    db.table("clients").insert(client).execute()
    return client
