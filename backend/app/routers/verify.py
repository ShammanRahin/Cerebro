"""
POST /api/verify/
  Body : { "text": "the OCR'd step text" }
  Reply: { "verdict": "correct"|"wrong"|"needs_review",
           "confidence": 0.0-1.0,
           "hint": "...",
           "subject": "algebra" }

No session, no problem context — verifies a single handwritten step on its own.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from app.agents.step_checker import check_step

router = APIRouter()


class VerifyRequest(BaseModel):
    text: str


class VerifyResponse(BaseModel):
    verdict: str
    confidence: float
    hint: Optional[str] = None
    subject: str
    recognized_text: str


@router.post("/", response_model=VerifyResponse)
def verify_step(req: VerifyRequest):
    text = req.text.strip()
    if not text:
        return VerifyResponse(
            verdict="needs_review", confidence=0.0,
            hint=None, subject="unknown", recognized_text="",
        )

    result = check_step("", text)   # no problem context — standalone check
    return VerifyResponse(
        verdict=result.verdict,
        confidence=result.confidence,
        hint=result.hint,
        subject=result.subject,
        recognized_text=text,
    )
