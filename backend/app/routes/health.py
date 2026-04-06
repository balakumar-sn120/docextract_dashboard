from datetime import datetime, timezone
from fastapi import APIRouter
from app.config import settings
from app.schemas import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health_check():
    """
    Deep health check — verifies DB, Redis, and Groq connectivity.
    Used by Railway for uptime monitoring.
    """
    checks = {}

    # Check Supabase DB
    try:
        from app.database import get_db
        get_db().table("clients").select("id").limit(1).execute()
        checks["supabase"] = "ok"
    except Exception as e:
        checks["supabase"] = f"error: {str(e)[:60]}"

    # Check Redis
    try:
        import redis
        r = redis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        r.ping()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"unavailable: {str(e)[:60]}"

    # Check Groq API (lightweight)
    try:
        from groq import Groq
        g = Groq(api_key=settings.GROQ_API_KEY)
        g.models.list()
        checks["groq"] = "ok"
    except Exception as e:
        checks["groq"] = f"error: {str(e)[:60]}"

    overall = "healthy" if all(v == "ok" for v in checks.values()) else "degraded"

    return HealthResponse(
        status=overall,
        version=settings.APP_VERSION,
        environment=settings.ENVIRONMENT,
        timestamp=datetime.now(timezone.utc).isoformat(),
        checks=checks,
    )


@router.get("/ping")
def ping():
    """Lightweight ping for Railway TCP health checks."""
    return {"pong": True}
