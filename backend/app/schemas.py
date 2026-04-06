"""
All Pydantic schemas: document extraction models + API request/response models.
"""
from __future__ import annotations
from typing import Optional, List, Any
from pydantic import BaseModel, Field, field_validator
from datetime import datetime
import re


# ── Helpers ───────────────────────────────────────

def parse_amount(v):
    """Strip currency symbols and commas from amount strings."""
    if isinstance(v, str):
        cleaned = re.sub(r"[₹$€£,\s]", "", v)
        try:
            return float(cleaned)
        except ValueError:
            return None
    return v


# ── Document extraction schemas ───────────────────

class LineItem(BaseModel):
    description:  str
    quantity:     Optional[float] = None
    unit_price:   Optional[float] = None
    total:        Optional[float] = None
    tax_rate:     Optional[float] = None
    hsn_code:     Optional[str]   = None     # Indian GST field


class InvoiceData(BaseModel):
    vendor_name:      str
    vendor_address:   Optional[str]   = None
    vendor_gstin:     Optional[str]   = None  # Indian GST number
    invoice_number:   str
    invoice_date:     Optional[str]   = None
    due_date:         Optional[str]   = None
    po_number:        Optional[str]   = None
    line_items:       List[LineItem]  = Field(default_factory=list)
    subtotal:         Optional[float] = None
    discount:         Optional[float] = None
    tax_amount:       Optional[float] = None
    cgst:             Optional[float] = None  # Indian GST
    sgst:             Optional[float] = None
    igst:             Optional[float] = None
    total_amount:     float
    currency:         str             = "INR"
    payment_terms:    Optional[str]   = None
    bank_details:     Optional[str]   = None
    notes:            Optional[str]   = None
    confidence:       float           = Field(ge=0.0, le=1.0)

    @field_validator("total_amount", "subtotal", "tax_amount", mode="before")
    @classmethod
    def clean_amount(cls, v): return parse_amount(v)


class BankTransaction(BaseModel):
    date:         str
    description:  str
    reference:    Optional[str]   = None
    debit:        Optional[float] = None
    credit:       Optional[float] = None
    balance:      Optional[float] = None
    category:     Optional[str]   = None


class BankStatementData(BaseModel):
    bank_name:              str
    account_holder:         str
    account_number:         str
    ifsc_code:              Optional[str]   = None
    branch:                 Optional[str]   = None
    statement_period_start: Optional[str]   = None
    statement_period_end:   Optional[str]   = None
    opening_balance:        Optional[float] = None
    closing_balance:        Optional[float] = None
    total_debits:           Optional[float] = None
    total_credits:          Optional[float] = None
    transactions:           List[BankTransaction] = Field(default_factory=list)
    confidence:             float           = Field(ge=0.0, le=1.0)


class ContractClause(BaseModel):
    clause_type:    str   # payment_terms | termination | liability | confidentiality | etc.
    summary:        str
    original_text:  Optional[str] = None


class ContractData(BaseModel):
    contract_type:    str
    parties:          List[str]
    effective_date:   Optional[str]   = None
    expiry_date:      Optional[str]   = None
    auto_renewal:     Optional[bool]  = None
    notice_period:    Optional[str]   = None
    contract_value:   Optional[float] = None
    currency:         str             = "INR"
    governing_law:    Optional[str]   = None
    jurisdiction:     Optional[str]   = None
    key_clauses:      List[ContractClause] = Field(default_factory=list)
    renewal_terms:    Optional[str]   = None
    penalties:        Optional[str]   = None
    confidence:       float           = Field(ge=0.0, le=1.0)


# Schema registry
SCHEMAS = {
    "invoice":        InvoiceData,
    "bank_statement": BankStatementData,
    "contract":       ContractData,
}


# ── API request/response models ───────────────────

class JobStatus(BaseModel):
    id:             str
    client_id:      str
    filename:       str
    doc_type:       Optional[str]   = None
    status:         str             # queued | processing | complete | error
    result_data:    Optional[Any]   = None
    confidence:     Optional[float] = None
    flagged:        bool            = False
    error_message:  Optional[str]   = None
    created_at:     Optional[str]   = None
    completed_at:   Optional[str]   = None
    processing_ms:  Optional[int]   = None


class UploadResponse(BaseModel):
    job_id:   str
    status:   str
    message:  str
    filename: str


class DownloadResponse(BaseModel):
    download_url: str
    expires_in:   int
    filename:     str


class HealthResponse(BaseModel):
    status:      str
    version:     str
    environment: str
    timestamp:   str
    checks:      dict


class StatsResponse(BaseModel):
    total_jobs:      int
    completed:       int
    processing:      int
    failed:          int
    flagged:         int
    avg_confidence:  float
    docs_this_month: int
