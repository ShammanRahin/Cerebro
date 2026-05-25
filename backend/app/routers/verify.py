"""
POST /api/verify/
  Body : { "text": "the OCR'd step text" }
  Reply: { "verdict": "correct"|"wrong"|"needs_review",
           "confidence": 0.0-1.0,
           "hint": "...",
           "subject": "algebra",
           "correct_answer": "...",
           "similar_count": 2 }

Pipeline:
  1. find_similar() — retrieve semantically close past mistakes (RAG context)
  2. check_step()   — SymPy → Groq/Llama with past-mistake context injected
  3. store_mistake() — auto-log wrong steps to the mistake DB
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from app.agents.step_checker import check_step
from app.db import get_db
from app.services.mistake_graph import store_mistake, find_similar

router = APIRouter()


class VerifyRequest(BaseModel):
    text: str
    notebook_id: Optional[int] = None
    page_number: Optional[int] = None


class VerifyResponse(BaseModel):
    verdict: str
    confidence: float
    hint: Optional[str] = None
    subject: str
    recognized_text: str
    correct_answer: Optional[str] = None
    similar_count: int = 0   # how many past similar mistakes were found


@router.post("/", response_model=VerifyResponse)
def verify_step(req: VerifyRequest, db: Session = Depends(get_db)):
    text = req.text.strip()
    if not text:
        return VerifyResponse(
            verdict="needs_review", confidence=0.0,
            hint=None, subject="unknown", recognized_text="",
        )

    # 1. Retrieve similar past mistakes for RAG context
    similar = find_similar(db, text, k=3)

    # 2. Verify (SymPy first, then Groq with RAG context)
    result = check_step("", text, similar_mistakes=similar)

    # 3. Auto-log wrong steps so the mistake graph grows over time
    if result.verdict == "wrong":
        store_mistake(
            db,
            recognized_text=text,
            subject=result.subject,
            error_type=result.error_type,
            hint=result.hint,
            correct_answer=result.correct_answer,
            confidence=result.confidence,
            notebook_id=req.notebook_id,
            page_number=req.page_number,
        )

    return VerifyResponse(
        verdict=result.verdict,
        confidence=result.confidence,
        hint=result.hint,
        subject=result.subject,
        recognized_text=text,
        correct_answer=result.correct_answer,
        similar_count=len(similar),
    )
