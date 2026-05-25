"""
OCR endpoint — powered by Groq Llama 3.2 Vision (math-aware, no extra deps).

POST /api/ocr/
  Body : { "image_data": "<data URL or raw base64 PNG>" }
  Reply: { "text": "...", "confidence": 0.0-1.0 }

Why Groq Vision instead of PaddleOCR:
  PaddleOCR is trained on printed text and completely misses mathematical
  notation (∫ ∑ π ∂ etc.).  Llama 3.2 Vision understands math symbols,
  integral signs, exponents, Greek letters, and multi-line expressions.
"""
import base64
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"

_OCR_PROMPT = """\
You are reading a student's handwritten math or science work drawn with a stylus on a digital tablet.

Transcribe EXACTLY what is written. Rules:
- Return ONLY the transcribed content — no explanations, no extra words
- Preserve math notation:
    exponents    → x^2  (not x²)
    roots        → sqrt(x)
    fractions    → a/b
    integrals    → integral(a, b, f(x)) or ∫_a^b f(x) dx
    derivatives  → dy/dx or d/dx(f(x))
    limits       → lim(x→a) f(x)
- Preserve symbols: + − × ÷ = ≠ ≤ ≥ → ∫ Σ π θ α β λ
- Multiple lines/steps → separate with newlines
- If the canvas is blank or too faint to read → return exactly: [blank]
- Do NOT add LaTeX delimiters like $ or \\( \\)
"""


class OcrRequest(BaseModel):
    image_data: str   # full data URL  OR  raw base64 PNG


class OcrResponse(BaseModel):
    text: str
    confidence: float


@router.post("/", response_model=OcrResponse)
async def ocr_image(req: OcrRequest):
    if not settings.groq_api_key:
        raise HTTPException(
            status_code=503,
            detail="GROQ_API_KEY not set — add it to backend/.env",
        )

    # Strip data-URL prefix if present
    raw = req.image_data
    if "," in raw:
        raw = raw.split(",", 1)[1]

    try:
        base64.b64decode(raw, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="image_data is not valid base64")

    try:
        from groq import Groq
        client = Groq(api_key=settings.groq_api_key)

        resp = client.chat.completions.create(
            model=_VISION_MODEL,
            max_tokens=512,
            temperature=0.1,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{raw}",
                        },
                    },
                    {
                        "type": "text",
                        "text": _OCR_PROMPT,
                    },
                ],
            }],
        )

        text = resp.choices[0].message.content.strip()
        if text == "[blank]":
            text = ""

        # Groq vision doesn't return a confidence score; use a fixed high value
        # when text was found, 0 when blank
        confidence = 0.88 if text else 0.0
        logger.info("Vision OCR: %d chars", len(text))
        return OcrResponse(text=text, confidence=confidence)

    except Exception as exc:
        logger.exception("Groq Vision OCR failed")
        raise HTTPException(status_code=500, detail=f"OCR error: {exc}")
