"""
Core extraction engine.
Pipeline: File → Docling parse → Groq LLM extract → Pydantic validate → Result
"""
import json
import re
import time
from pathlib import Path
from typing import Optional

from groq import Groq
from loguru import logger

from app.config import settings
from app.schemas import SCHEMAS

# ── Groq client (singleton) ───────────────────────
_groq: Optional[Groq] = None

def get_groq() -> Groq:
    global _groq
    if _groq is None:
        _groq = Groq(api_key=settings.GROQ_API_KEY)
    return _groq


# ── STEP 1: Parse document with Docling ──────────

def parse_document(file_path: str) -> str:
    """Convert PDF/image/DOCX to clean Markdown text using Docling."""
    from docling.document_converter import DocumentConverter
    t0 = time.perf_counter()
    try:
        converter = DocumentConverter()
        result = converter.convert(file_path)
        text = result.document.export_to_markdown()
        ms = int((time.perf_counter() - t0) * 1000)
        logger.info(f"Docling parsed {Path(file_path).name}: {len(text)} chars in {ms}ms")
        return text
    except Exception as e:
        logger.warning(f"Docling failed ({e}), falling back to PyMuPDF")
        return _fallback_parse(file_path)


def _fallback_parse(file_path: str) -> str:
    """PyMuPDF fallback for simple text extraction."""
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(file_path)
        return "\n\n".join(page.get_text() for page in doc)
    except Exception as e:
        logger.error(f"Fallback parse failed: {e}")
        return ""


# ── STEP 2: Auto-detect document type ────────────

def detect_doc_type(text: str) -> str:
    """Ask Groq to classify the document type in one fast call."""
    prompt = (
        "Classify this document as exactly ONE of: invoice, bank_statement, contract, other.\n"
        "Reply with only the single word.\n\n"
        f"Document (first 600 chars):\n{text[:600]}"
    )
    try:
        resp = get_groq().chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=10,
            temperature=0,
        )
        result = resp.choices[0].message.content.strip().lower()
        return result if result in SCHEMAS else "invoice"
    except Exception as e:
        logger.warning(f"Type detection failed: {e}, defaulting to invoice")
        return "invoice"


# ── STEP 3: LLM extraction prompts ───────────────

PROMPTS = {
    "invoice": """Extract all invoice data. Return ONLY valid JSON (no markdown, no extra text):
{{
  "vendor_name": "string",
  "vendor_address": "string or null",
  "vendor_gstin": "GST number or null",
  "invoice_number": "string",
  "invoice_date": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null",
  "po_number": "string or null",
  "line_items": [{{"description":"str","quantity":number_or_null,"unit_price":number_or_null,"total":number_or_null,"hsn_code":"str or null"}}],
  "subtotal": number_or_null,
  "discount": number_or_null,
  "cgst": number_or_null,
  "sgst": number_or_null,
  "igst": number_or_null,
  "tax_amount": number_or_null,
  "total_amount": number,
  "currency": "INR",
  "payment_terms": "string or null",
  "bank_details": "string or null",
  "notes": "string or null",
  "confidence": 0.0_to_1.0
}}
Document:\n{text}""",

    "bank_statement": """Extract all bank statement data. Return ONLY valid JSON:
{{
  "bank_name": "string",
  "account_holder": "string",
  "account_number": "string",
  "ifsc_code": "string or null",
  "branch": "string or null",
  "statement_period_start": "YYYY-MM-DD or null",
  "statement_period_end": "YYYY-MM-DD or null",
  "opening_balance": number_or_null,
  "closing_balance": number_or_null,
  "total_debits": number_or_null,
  "total_credits": number_or_null,
  "transactions": [{{"date":"YYYY-MM-DD","description":"str","reference":"str or null","debit":number_or_null,"credit":number_or_null,"balance":number_or_null}}],
  "confidence": 0.0_to_1.0
}}
Document:\n{text}""",

    "contract": """Extract all contract data. Return ONLY valid JSON:
{{
  "contract_type": "string",
  "parties": ["Party A", "Party B"],
  "effective_date": "YYYY-MM-DD or null",
  "expiry_date": "YYYY-MM-DD or null",
  "auto_renewal": true_or_false_or_null,
  "notice_period": "string or null",
  "contract_value": number_or_null,
  "currency": "INR",
  "governing_law": "string or null",
  "jurisdiction": "string or null",
  "key_clauses": [{{"clause_type":"str","summary":"str","original_text":"str or null"}}],
  "renewal_terms": "string or null",
  "penalties": "string or null",
  "confidence": 0.0_to_1.0
}}
Document:\n{text}""",
}


# ── STEP 3: Extract with Groq ─────────────────────

def extract_with_groq(text: str, doc_type: str) -> dict:
    """Send text to Groq LLM and return parsed JSON dict. Retries once on failure."""
    prompt_template = PROMPTS.get(doc_type, PROMPTS["invoice"])
    prompt = prompt_template.format(text=text[:settings.MAX_TEXT_CHARS])

    for attempt in range(2):
        try:
            t0 = time.perf_counter()
            resp = get_groq().chat.completions.create(
                model=settings.GROQ_MODEL,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=4096,
                temperature=0.05,
            )
            raw = resp.choices[0].message.content.strip()
            ms = int((time.perf_counter() - t0) * 1000)
            logger.info(f"Groq extraction in {ms}ms (attempt {attempt+1})")

            # Strip markdown fences if model added them
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)

            data = json.loads(raw)
            return data

        except json.JSONDecodeError as e:
            logger.warning(f"JSON parse failed attempt {attempt+1}: {e}")
            if attempt == 0:
                # Ask model to fix its own output
                prompt = f"This JSON is broken. Fix it and return ONLY valid JSON:\n{raw}"
        except Exception as e:
            logger.error(f"Groq call failed: {e}")
            if attempt == 1:
                raise

    return {}


# ── STEP 4: Validate with Pydantic ───────────────

def validate_extraction(data: dict, doc_type: str):
    """Validate raw dict against the appropriate Pydantic schema."""
    schema = SCHEMAS.get(doc_type)
    if not schema:
        logger.warning(f"No schema for doc_type: {doc_type}")
        return None
    try:
        validated = schema(**data)
        logger.info(f"Validation passed — confidence: {getattr(validated, 'confidence', 0):.0%}")
        return validated
    except Exception as e:
        logger.warning(f"Validation failed: {e}")
        return None


# ── STEP 5: Build Excel output ────────────────────

def build_excel(result_data: dict, output_path: str, doc_type: str) -> str:
    """Convert extracted data dict to a clean Excel file."""
    import pandas as pd

    rows = []
    for key, val in result_data.items():
        if isinstance(val, list):
            for i, item in enumerate(val):
                if isinstance(item, dict):
                    for k, v in item.items():
                        rows.append({"section": key, "field": f"{key}[{i}].{k}", "value": str(v or "")})
                else:
                    rows.append({"section": key, "field": f"{key}[{i}]", "value": str(item)})
        elif key != "confidence":
            rows.append({"section": "main", "field": key, "value": str(val or "")})

    df = pd.DataFrame(rows)
    with pd.ExcelWriter(output_path, engine="xlsxwriter") as writer:
        df.to_excel(writer, index=False, sheet_name="Extracted Data")
        ws = writer.sheets["Extracted Data"]
        ws.set_column("A:A", 18)
        ws.set_column("B:B", 38)
        ws.set_column("C:C", 52)

    logger.info(f"Excel written: {output_path} ({len(rows)} rows)")
    return output_path


# ── Full pipeline ─────────────────────────────────

def run_extraction_pipeline(
    file_path: str,
    doc_type: str | None = None,
) -> dict:
    """
    Full extraction pipeline. Returns result dict with all extraction info.
    Called by Celery worker (app/worker.py).
    """
    t_start = time.perf_counter()

    # Step 1: Parse
    text = parse_document(file_path)
    if not text.strip():
        raise ValueError("Document parsed to empty text — check file format")

    # Step 2: Detect type
    if not doc_type or doc_type == "auto":
        doc_type = detect_doc_type(text)

    # Step 3: Extract
    raw_data = extract_with_groq(text, doc_type)
    if not raw_data:
        raise ValueError("LLM returned no data after 2 attempts")

    # Step 4: Validate
    validated = validate_extraction(raw_data, doc_type)
    confidence = getattr(validated, "confidence", 0.0) if validated else 0.0
    result_data = validated.model_dump() if validated else raw_data

    total_ms = int((time.perf_counter() - t_start) * 1000)
    logger.success(
        f"Pipeline complete: {doc_type} | confidence={confidence:.0%} | {total_ms}ms"
    )

    return {
        "doc_type":     doc_type,
        "result_data":  result_data,
        "confidence":   confidence,
        "flagged":      confidence < settings.CONFIDENCE_FLAG_THRESHOLD,
        "processing_ms": total_ms,
    }
