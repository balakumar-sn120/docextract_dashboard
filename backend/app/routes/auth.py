from fastapi import APIRouter
router = APIRouter()

@router.get("/me")
def me():
    """Placeholder — auth handled by Supabase on the frontend."""
    return {"message": "Auth is handled by Supabase SSO on the frontend dashboard"}
