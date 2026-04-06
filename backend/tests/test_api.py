"""
Basic API tests — run with: pytest tests/ -v
"""
import os
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

# Set test env vars before importing app
os.environ.update({
    "SUPABASE_URL": "https://test.supabase.co",
    "SUPABASE_SERVICE_KEY": "test-key",
    "GROQ_API_KEY": "test-groq-key",
    "REDIS_URL": "redis://localhost:6379/0",
    "ENVIRONMENT": "test",
})

from app.main import app

client = TestClient(app)

# ── Health ────────────────────────────────────────

def test_ping():
    res = client.get("/ping")
    assert res.status_code == 200
    assert res.json() == {"pong": True}


@patch("app.routes.health.get_db")
@patch("app.routes.health.Groq")
@patch("redis.from_url")
def test_health_healthy(mock_redis, mock_groq, mock_db):
    mock_db.return_value.table.return_value.select.return_value.limit.return_value.execute.return_value = MagicMock(data=[])
    mock_redis.return_value.ping.return_value = True
    mock_groq.return_value.models.list.return_value = []

    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] in ("healthy", "degraded")
    assert "supabase" in data["checks"]


# ── Auth ──────────────────────────────────────────

def test_upload_no_api_key():
    res = client.post("/api/upload")
    assert res.status_code == 422  # Missing header


def test_upload_invalid_api_key():
    res = client.post(
        "/api/upload",
        headers={"X-API-Key": "invalid-key"},
        files={"file": ("test.pdf", b"%PDF-1.4 fake", "application/pdf")},
    )
    assert res.status_code == 401


# ── Upload validation ─────────────────────────────

@patch("app.routes.upload.get_client_by_api_key")
def test_upload_invalid_file_type(mock_auth):
    mock_auth.return_value = {"id": "test-client", "name": "Test"}
    res = client.post(
        "/api/upload",
        headers={"X-API-Key": "valid-key"},
        files={"file": ("test.exe", b"binary", "application/octet-stream")},
        data={"doc_type": "invoice"},
    )
    assert res.status_code == 400
    assert "Unsupported file type" in res.json()["detail"]


@patch("app.routes.upload.get_client_by_api_key")
def test_upload_invalid_doc_type(mock_auth):
    mock_auth.return_value = {"id": "test-client", "name": "Test"}
    res = client.post(
        "/api/upload",
        headers={"X-API-Key": "valid-key"},
        files={"file": ("test.pdf", b"%PDF fake content", "application/pdf")},
        data={"doc_type": "unknown_type"},
    )
    assert res.status_code == 400


# ── Extractor unit tests ──────────────────────────

def test_detect_doc_type_fallback():
    """detect_doc_type should return 'invoice' on failure."""
    with patch("app.extractor.get_groq") as mock_groq:
        mock_groq.side_effect = Exception("API error")
        from app.extractor import detect_doc_type
        result = detect_doc_type("Some document text")
        assert result == "invoice"


def test_validate_extraction_invalid_schema():
    """validate_extraction should return None for bad data."""
    from app.extractor import validate_extraction
    result = validate_extraction({"garbage": "data"}, "invoice")
    assert result is None


def test_validate_extraction_valid_invoice():
    """validate_extraction should pass for valid invoice data."""
    from app.extractor import validate_extraction
    data = {
        "vendor_name": "ACME Corp",
        "invoice_number": "INV-001",
        "total_amount": 10000.0,
        "confidence": 0.95,
    }
    result = validate_extraction(data, "invoice")
    assert result is not None
    assert result.vendor_name == "ACME Corp"
    assert result.confidence == 0.95


def test_amount_parsing():
    """Currency symbols should be stripped from amounts."""
    from app.extractor import validate_extraction
    data = {
        "vendor_name": "Test Vendor",
        "invoice_number": "INV-002",
        "total_amount": "₹45,000",
        "confidence": 0.9,
    }
    result = validate_extraction(data, "invoice")
    assert result is not None
    assert result.total_amount == 45000.0
