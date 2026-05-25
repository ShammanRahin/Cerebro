"""
Mistake Graph — semantic storage and retrieval of wrong steps.

store_mistake()  — embed + persist a wrong step to the DB
find_similar()   — retrieve past mistakes semantically close to a new step

Both functions degrade gracefully if the embedding model is unavailable:
  store_mistake → saves without an embedding vector
  find_similar  → returns []
"""
import json
import logging
from typing import List, Optional

from sqlalchemy.orm import Session

from app import models
from app.services.embeddings import embed

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _cosine(a: List[float], b: List[float]) -> float:
    """Dot product of two L2-normalised vectors equals cosine similarity."""
    return sum(x * y for x, y in zip(a, b))


# ── Public API ────────────────────────────────────────────────────────────────

def store_mistake(
    db: Session,
    recognized_text: str,
    subject: str,
    error_type: Optional[str],
    hint: Optional[str],
    correct_answer: Optional[str],
    confidence: Optional[float],
    notebook_id: Optional[int] = None,
    page_number: Optional[int] = None,
) -> models.Mistake:
    """
    Embed *recognized_text* and persist a Mistake record.

    The embedding is stored so future steps can be matched against it.
    If embedding fails the record is still saved (embedding_json = None).
    """
    embedding_json = None
    try:
        vector = embed(recognized_text)
        embedding_json = json.dumps(vector)
    except Exception as exc:
        logger.warning("Embedding failed — storing mistake without vector: %s", exc)

    mistake = models.Mistake(
        recognized_text=recognized_text,
        subject=subject,
        error_type=error_type,
        misconception=hint,
        correct_answer=correct_answer,
        confidence=confidence,
        notebook_id=notebook_id,
        page_number=page_number,
        embedding_json=embedding_json,
    )
    db.add(mistake)
    db.commit()
    db.refresh(mistake)
    logger.info("Stored mistake id=%d subject=%s error_type=%s", mistake.id, subject, error_type)
    return mistake


def find_similar(
    db: Session,
    text: str,
    subject: Optional[str] = None,
    k: int = 3,
    min_similarity: float = 0.50,
) -> List[models.Mistake]:
    """
    Return up to *k* past unresolved mistakes semantically similar to *text*.

    Similarity is cosine distance computed in Python over all stored vectors.
    This is fast enough for thousands of mistakes (typical student notebook).
    Returns [] if embedding fails or no similar mistakes exist.
    """
    try:
        q_vec = embed(text)
    except Exception as exc:
        logger.warning("Embedding for retrieval failed: %s", exc)
        return []

    query = db.query(models.Mistake).filter(
        models.Mistake.embedding_json.isnot(None),
        models.Mistake.resolved == False,  # noqa: E712
    )
    if subject:
        query = query.filter(models.Mistake.subject == subject)

    scored: List[tuple] = []
    for mistake in query.all():
        try:
            m_vec = json.loads(mistake.embedding_json)
            sim = _cosine(q_vec, m_vec)
            if sim >= min_similarity:
                scored.append((sim, mistake))
        except Exception:
            continue

    scored.sort(key=lambda x: x[0], reverse=True)
    similar = [m for _, m in scored[:k]]

    if similar:
        logger.info(
            "RAG: found %d similar mistake(s) for subject=%s (top sim=%.2f)",
            len(similar), subject, scored[0][0] if scored else 0,
        )
    return similar
