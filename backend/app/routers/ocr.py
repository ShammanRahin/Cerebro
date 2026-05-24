"""
OCR endpoint — powered by PaddleOCR 2.7 (runs locally, no API key needed).

POST /api/ocr/
  Body : { "image_data": "<data URL or raw base64 PNG>" }
  Reply: { "text": "...", "confidence": 0.0-1.0 }

PaddleOCR 2.x result format:
  result = ocr.ocr(img, cls=True)
  → [ [ [bbox, (text, score)], ... ] ]   one outer list per image
"""
import base64
import io
import logging
from functools import lru_cache

import numpy as np
from PIL import Image
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Lazy-init: first call downloads ~100 MB model weights, ~5 s ──────────────
@lru_cache(maxsize=1)
def _get_ocr():
    try:
        from paddleocr import PaddleOCR  # noqa: PLC0415
        return PaddleOCR(
            use_angle_cls=True,   # auto-rotate skewed text lines
            lang="en",
            use_gpu=False,
            show_log=False,
        )
    except ImportError as exc:
        raise RuntimeError(
            "PaddleOCR is not installed — run: pip install paddlepaddle paddleocr"
        ) from exc


# ── Schemas ───────────────────────────────────────────────────────────────────
class OcrRequest(BaseModel):
    image_data: str   # full data URL  OR  raw base64 PNG


class OcrResponse(BaseModel):
    text: str
    confidence: float


# ── Endpoint ──────────────────────────────────────────────────────────────────
@router.post("/", response_model=OcrResponse)
async def ocr_image(req: OcrRequest):
    # 1. Strip data-URL prefix (data:image/png;base64,...)
    raw = req.image_data
    if "," in raw:
        raw = raw.split(",", 1)[1]

    # 2. Decode base64 → bytes
    try:
        img_bytes = base64.b64decode(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="image_data is not valid base64")

    # 3. Bytes → PIL Image → numpy RGB array
    try:
        pil_img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        img_array = np.array(pil_img)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Cannot decode image: {exc}")

    # 4. Run PaddleOCR 2.x
    try:
        ocr = _get_ocr()
        result = ocr.ocr(img_array, cls=True)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.exception("PaddleOCR inference failed")
        raise HTTPException(status_code=500, detail=f"OCR engine error: {exc}")

    # 5. Parse 2.x result: [ [ [bbox, (text, score)], ... ] ]
    lines: list[str] = []
    scores: list[float] = []

    page = result[0] if result else []
    if page:
        for item in page:
            text, score = item[1]
            if text.strip():
                lines.append(text.strip())
                scores.append(float(score))

    combined_text = "\n".join(lines)
    avg_conf = float(np.mean(scores)) if scores else 0.0

    logger.info("OCR: %d line(s), avg_conf=%.2f", len(lines), avg_conf)
    return OcrResponse(text=combined_text, confidence=avg_conf)
