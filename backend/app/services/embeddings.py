"""
Embedding service — sentence-transformers all-MiniLM-L6-v2.

384-dim normalised vectors, runs on CPU, ~90 MB model download on first use.
Lazy-loaded: the model is only imported when the first embedding is requested
so the server starts instantly even without the model cached.
"""
import logging
from typing import List

logger = logging.getLogger(__name__)

_model = None  # module-level singleton


def _get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        logger.info("Loading embedding model all-MiniLM-L6-v2 (first use)…")
        _model = SentenceTransformer("all-MiniLM-L6-v2")
        logger.info("Embedding model ready.")
    return _model


def embed(text: str) -> List[float]:
    """
    Return a normalised 384-dim float vector for *text*.

    Vectors are L2-normalised so cosine similarity == dot product,
    which is cheaper to compute at retrieval time.
    """
    model = _get_model()
    vector = model.encode(text.strip(), normalize_embeddings=True)
    return vector.tolist()
