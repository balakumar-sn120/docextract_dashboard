from fastapi import Header, HTTPException, Depends
from app.database import get_client_by_api_key


async def require_api_key(x_api_key: str = Header(alias="X-API-Key")) -> dict:
    """FastAPI dependency: validates X-API-Key header against clients table."""
    client = get_client_by_api_key(x_api_key)
    if not client:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return client


async def require_admin(x_admin_key: str = Header(alias="X-Admin-Key")) -> bool:
    """Simple admin key check for admin endpoints."""
    import os
    if x_admin_key != os.getenv("ADMIN_SECRET_KEY", "change-me"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return True
