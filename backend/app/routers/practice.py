from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app.db import get_db
from app import models, schemas
from app.agents.step_checker import check_step
from app.config import settings

router = APIRouter()


@router.get("/problems", response_model=List[schemas.ProblemResponse])
def list_problems(subject: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(models.Problem)
    if subject:
        q = q.filter(models.Problem.subject == subject)
    return q.order_by(models.Problem.id).all()


@router.get("/problems/random", response_model=schemas.ProblemResponse)
def get_random_problem(subject: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(models.Problem)
    if subject:
        q = q.filter(models.Problem.subject == subject)
    problem = q.order_by(func.random()).first()
    if not problem:
        raise HTTPException(status_code=404, detail="No problems found — run the seed script first")
    return problem


@router.get("/problems/{problem_id}", response_model=schemas.ProblemResponse)
def get_problem(problem_id: int, db: Session = Depends(get_db)):
    problem = db.query(models.Problem).filter(models.Problem.id == problem_id).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")
    return problem


@router.post("/sessions", response_model=schemas.SessionResponse)
def create_session(data: schemas.SessionCreate, db: Session = Depends(get_db)):
    problem = db.query(models.Problem).filter(models.Problem.id == data.problem_id).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")
    session = models.PracticeSession(problem_id=data.problem_id)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.post("/sessions/{session_id}/complete", response_model=schemas.SessionResponse)
def complete_session(session_id: int, db: Session = Depends(get_db)):
    session = db.query(models.PracticeSession).filter(models.PracticeSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return session


@router.get("/sessions/{session_id}/steps", response_model=List[schemas.StepResponse])
def get_session_steps(session_id: int, db: Session = Depends(get_db)):
    return (
        db.query(models.StepRecord)
        .filter(models.StepRecord.session_id == session_id)
        .order_by(models.StepRecord.step_index)
        .all()
    )


@router.post("/sessions/{session_id}/steps", response_model=schemas.StepResponse)
def submit_step(session_id: int, data: schemas.StepSubmit, db: Session = Depends(get_db)):
    # ── 1. Validate session ────────────────────────────────────────────────
    session = (
        db.query(models.PracticeSession)
        .filter(models.PracticeSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # ── 2. Run verification pipeline ──────────────────────────────────────
    problem_statement = session.problem.statement if session.problem else ""
    result = check_step(problem_statement, data.recognized_text)

    # ── 3. Auto-log mistake when step is wrong or confidence is low ────────
    mistake_id = None
    should_log = (
        result.verdict == "wrong"
        or (result.verdict == "needs_review" and result.confidence < settings.confidence_threshold)
    )
    if should_log:
        mistake = models.Mistake(
            session_id=session_id,
            problem_id=session.problem_id,
            recognized_text=data.recognized_text,
            subject=result.subject,
            error_type=result.error_type,
            misconception=result.hint,
            confidence=result.confidence,
            strokes_json=data.strokes_json,
        )
        db.add(mistake)
        db.flush()          # get mistake.id before committing
        mistake_id = mistake.id

    # ── 4. Save step record ───────────────────────────────────────────────
    step = models.StepRecord(
        session_id=session_id,
        mistake_id=mistake_id,
        step_index=data.step_index,
        recognized_text=data.recognized_text,
        subject=result.subject,
        verdict=result.verdict,
        confidence=result.confidence,
        hint=result.hint,
    )
    db.add(step)
    db.commit()
    db.refresh(step)
    return step
