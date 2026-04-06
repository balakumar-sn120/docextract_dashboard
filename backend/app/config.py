from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    # App
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "production"
    SECRET_KEY: str = "change-this-in-production"

    # Supabase
    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: str        # service_role key (not anon) for backend
    SUPABASE_STORAGE_BUCKET: str = "documents"

    # Groq
    GROQ_API_KEY: str
    GROQ_MODEL: str = "llama-3.3-70b-versatile"

    # Redis (for Celery job queue)
    REDIS_URL: str = "redis://localhost:6379/0"

    # Email (Resend)
    RESEND_API_KEY: str = ""
    FROM_EMAIL: str = "DocExtract <notify@yourdomain.com>"

    # Sentry (error monitoring)
    SENTRY_DSN: str = ""

    # CORS — your Vercel frontend URL
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "https://your-dashboard.vercel.app",
    ]

    # File limits
    MAX_FILE_SIZE_MB: int = 50
    MAX_FILES_PER_REQUEST: int = 20
    UPLOAD_DIR: str = "/tmp/docextract_uploads"
    OUTPUT_DIR: str = "/tmp/docextract_outputs"

    # Processing
    CONFIDENCE_FLAG_THRESHOLD: float = 0.85
    MAX_TEXT_CHARS: int = 14000   # Groq context limit buffer

    # Rate limiting
    RATE_LIMIT_UPLOAD: str = "20/minute"
    RATE_LIMIT_API: str = "100/minute"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

# Ensure temp directories exist
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.OUTPUT_DIR, exist_ok=True)
