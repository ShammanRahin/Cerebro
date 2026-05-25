from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import List, Optional

from app.db import get_db
from app import models, schemas

router = APIRouter()


@router.get("/", response_model=List[schemas.MistakeResponse])
def list_mistakes(
    subject: Optional[str] = None,
    error_type: Optional[str] = None,
    resolved: Optional[bool] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    q = db.query(models.Mistake)
    if subject:
        q = q.filter(models.Mistake.subject == subject)
    if error_type:
        q = q.filter(models.Mistake.error_type == error_type)
    if resolved is not None:
        q = q.filter(models.Mistake.resolved == resolved)
    return q.order_by(models.Mistake.created_at.desc()).limit(limit).all()


@router.get("/stats/weak-concepts", response_model=List[schemas.WeakConcept])
def get_weak_concepts(db: Session = Depends(get_db)):
    results = (
        db.query(
            models.Mistake.subject,
            models.Mistake.error_type,
            func.count().label("count"),
        )
        .filter(models.Mistake.resolved == False)  # noqa: E712
        .group_by(models.Mistake.subject, models.Mistake.error_type)
        .order_by(func.count().desc())
        .limit(10)
        .all()
    )
    return [{"subject": r.subject, "error_type": r.error_type, "count": r.count} for r in results]


@router.get("/stats/by-subject")
def get_stats_by_subject(db: Session = Depends(get_db)):
    total = (
        db.query(models.Mistake.subject, func.count().label("total"))
        .group_by(models.Mistake.subject)
        .all()
    )
    wrong = (
        db.query(models.Mistake.subject, func.count().label("wrong"))
        .filter(models.Mistake.resolved == False)  # noqa: E712
        .group_by(models.Mistake.subject)
        .all()
    )
    wrong_map = {r.subject: r.wrong for r in wrong}
    return [
        {
            "subject": r.subject,
            "total": r.total,
            "unresolved": wrong_map.get(r.subject, 0),
        }
        for r in total
    ]


@router.post("/backfill-embeddings")
def backfill_embeddings(db: Session = Depends(get_db)):
    """
    Re-embed every mistake that was stored without a vector (e.g. saved while
    the embedding model was unavailable). Lets old mistakes appear in the tree.
    """
    import json
    from app.services.embeddings import embed

    rows = (
        db.query(models.Mistake)
        .filter(models.Mistake.embedding_json.is_(None))
        .all()
    )

    done, failed = 0, 0
    for m in rows:
        try:
            m.embedding_json = json.dumps(embed(m.recognized_text))
            done += 1
        except Exception:
            failed += 1
    db.commit()
    return {"backfilled": done, "failed": failed, "total": len(rows)}


@router.get("/graph")
def get_mistake_graph(threshold: float = 0.40, db: Session = Depends(get_db)):
    """
    Embedding similarity graph for the 'mistake tree' visualisation.

    Nodes  = mistakes that have an embedding vector.
    Edges  = pairs whose cosine similarity ≥ threshold (vectors are L2-normalised
             so cosine == dot product).
    """
    import json

    rows = (
        db.query(models.Mistake)
        .filter(models.Mistake.embedding_json.isnot(None))
        .order_by(models.Mistake.created_at.desc())
        .limit(200)
        .all()
    )

    nodes, vecs = [], []
    for m in rows:
        try:
            v = json.loads(m.embedding_json)
        except Exception:
            continue
        vecs.append(v)
        nodes.append({
            "id": m.id,
            "text": m.recognized_text,
            "subject": m.subject,
            "error_type": m.error_type,
            "hint": m.misconception,
            "correct_answer": m.correct_answer,
            "resolved": m.resolved,
        })

    edges = []
    n = len(vecs)
    for i in range(n):
        vi = vecs[i]
        for j in range(i + 1, n):
            vj = vecs[j]
            sim = sum(a * b for a, b in zip(vi, vj))
            if sim >= threshold:
                edges.append({
                    "source": nodes[i]["id"],
                    "target": nodes[j]["id"],
                    "weight": round(float(sim), 3),
                })

    return {"nodes": nodes, "edges": edges}


@router.get("/{mistake_id}", response_model=schemas.MistakeResponse)
def get_mistake(mistake_id: int, db: Session = Depends(get_db)):
    mistake = db.query(models.Mistake).filter(models.Mistake.id == mistake_id).first()
    if not mistake:
        raise HTTPException(status_code=404, detail="Mistake not found")
    return mistake


@router.post("/", response_model=schemas.MistakeResponse)
def create_mistake(data: schemas.MistakeCreate, db: Session = Depends(get_db)):
    import json

    embedding_json = json.dumps(data.embedding) if data.embedding else None
    mistake = models.Mistake(
        session_id=data.session_id,
        problem_id=data.problem_id,
        recognized_text=data.recognized_text,
        subject=data.subject,
        error_type=data.error_type,
        misconception=data.misconception,
        confidence=data.confidence,
        strokes_json=data.strokes_json,
        embedding_json=embedding_json,
    )
    db.add(mistake)
    db.commit()
    db.refresh(mistake)
    return mistake


@router.post("/{mistake_id}/resolve")
def resolve_mistake(mistake_id: int, db: Session = Depends(get_db)):
    mistake = db.query(models.Mistake).filter(models.Mistake.id == mistake_id).first()
    if not mistake:
        raise HTTPException(status_code=404, detail="Mistake not found")
    mistake.resolved = True
    db.commit()
    return {"resolved": True, "id": mistake_id}
