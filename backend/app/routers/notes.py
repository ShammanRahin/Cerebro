"""
POST /api/notes/suggest
  Body : { "text": "the OCR'd class-note text" }
  Reply: { "type": "complete"|"add_fact"|"clarify"|"fix",
           "suggestion": "short text to add to the notes",
           "has_error": false,
           "subject": "biology" }

Note Coach — helps a student take *better class notes*. It does NOT grade or solve;
it suggests ONE concise improvement (complete a trailing-off idea, add a key fact, or
tighten the wording) and corrects any factual error in what was written.

Stateless: no DB writes. Reuses classify_subject() and the Groq client pattern from
the step verifier.
"""
import json
import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.agents.step_checker import classify_subject
from app.services.mistake_graph import find_similar

logger = logging.getLogger(__name__)
router = APIRouter()

_GROQ_MODEL = "llama-3.3-70b-versatile"

_NOTE_PROMPT = """\
You are a note-taking assistant helping a student take better notes in class.
You do NOT grade or solve anything — you make their notes clearer and more complete,
and you reinforce the exact things this student has gotten wrong before.

THE STUDENT WROTE : {text}
SUBJECT           : {subject}
{past_mistakes}
Suggest exactly ONE concise improvement, choosing the single most useful of:
- "complete"  → finish an incomplete/trailing-off idea, formula, or definition
- "add_fact"  → add one important related fact, value, or example worth jotting down
- "clarify"   → reword messy or ambiguous wording into something cleaner
- "fix"       → correct a clear factual error in what they wrote

Reply with EXACTLY this JSON (no other text, no markdown fences):
{{"type":"complete"|"add_fact"|"clarify"|"fix","suggestion":"under 20 words, directly addable to the notes","has_error":true|false}}

Rules
- "suggestion" must be short and ready to write straight into the notes (no preamble).
- Set "has_error" true only when the student's note contains a factual mistake.
- If a RELATED PAST MISTAKE is shown above, PREFER a suggestion that fills that exact gap
  or emphasizes the point they previously got wrong, so the note prevents the repeat.
- Otherwise prefer "complete" or "add_fact" when the note is correct but thin.
- Do not repeat what they already wrote verbatim.
"""


class NoteSuggestRequest(BaseModel):
    text: str


class NoteSuggestResponse(BaseModel):
    type: str
    suggestion: str
    has_error: bool = False
    subject: str
    related_count: int = 0   # related past mistakes used to emphasise the note


@router.post("/suggest", response_model=NoteSuggestResponse)
def suggest_note(req: NoteSuggestRequest, db: Session = Depends(get_db)):
    text = req.text.strip()
    subject = classify_subject(text) if text else "unknown"

    if not text:
        return NoteSuggestResponse(
            type="clarify", suggestion="Write a bit more and I'll help improve it.",
            has_error=False, subject=subject,
        )

    # Pull related past mistakes so the note fills the student's recurring gaps
    similar = find_similar(db, text, k=3)
    past_mistakes = ""
    if similar:
        lines = []
        for m in similar:
            line = f'  • "{m.recognized_text}"'
            if m.correct_answer:
                line += f" (correct: {m.correct_answer})"
            elif m.misconception:
                line += f" → {m.misconception}"
            lines.append(line)
        past_mistakes = (
            "RELATED PAST MISTAKES BY THIS STUDENT (reinforce these in the note):\n"
            + "\n".join(lines)
            + "\n"
        )

    if not settings.groq_api_key:
        return NoteSuggestResponse(
            type="fix",
            suggestion="AI note help unavailable — add GROQ_API_KEY to backend/.env",
            has_error=False, subject=subject, related_count=len(similar),
        )

    try:
        from groq import Groq

        prompt = _NOTE_PROMPT.format(text=text, subject=subject, past_mistakes=past_mistakes)
        client = Groq(api_key=settings.groq_api_key)
        resp = client.chat.completions.create(
            model=_GROQ_MODEL,
            max_tokens=200,
            temperature=0.1,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = resp.choices[0].message.content.strip()
        # Strip accidental markdown fences
        raw = raw.strip("` \n")
        if raw.startswith("json"):
            raw = raw[4:].strip()
        data = json.loads(raw)

        return NoteSuggestResponse(
            type=data.get("type", "add_fact"),
            suggestion=(data.get("suggestion") or "").strip() or "Looks good — keep going.",
            has_error=bool(data.get("has_error", False)),
            subject=subject,
            related_count=len(similar),
        )
    except json.JSONDecodeError:
        logger.warning("Note coach returned non-JSON: %s", raw)
        return NoteSuggestResponse(
            type="clarify", suggestion="Couldn't read that clearly — try rewriting it.",
            has_error=False, subject=subject, related_count=len(similar),
        )
    except Exception:
        logger.exception("Note suggestion failed")
        return NoteSuggestResponse(
            type="clarify", suggestion="Note help is temporarily unavailable.",
            has_error=False, subject=subject, related_count=len(similar),
        )
