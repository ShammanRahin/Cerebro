"""
Cerebro Phase 3 — step verification pipeline.

check_step(problem_statement, step_text) → CheckResult
  1. classify_subject(text)  → algebra | calculus | chemistry | biology | physics
  2a. algebra/calculus first: SymPy symbolic check (no API key, instant)
  2b. fallback: Claude 3.5 Haiku (needs ANTHROPIC_API_KEY; degrades gracefully)
"""
import json
import logging
import re
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Result type
# ─────────────────────────────────────────────────────────────────────────────
@dataclass
class CheckResult:
    verdict: str           # "correct" | "wrong" | "needs_review"
    confidence: float      # 0.0 – 1.0
    hint: Optional[str]    # short coaching note; None when correct
    subject: str           # detected subject
    error_type: Optional[str] = None   # algebra | arithmetic | sign | conceptual | …


# ─────────────────────────────────────────────────────────────────────────────
# Subject classifier  (pure regex, no API)
# ─────────────────────────────────────────────────────────────────────────────
_CALCULUS = re.compile(
    r'\b(integral|derivative|d/d[a-z]|lim\b|∫|limit|antiderivative|'
    r'converge|diverge|series|taylor|maclaurin)\b', re.I)
# Chemical formulas must be case-SENSITIVE (H2O ≠ h2o; re.I would match "Solve" as a formula)
_CHEM_FORMULA = re.compile(r'(?:[A-Z][a-z]?\d*){2,}')
_CHEM_KEYWORDS = re.compile(
    r'→|⇌|\bmol(e)?\b|\breaction\b|\bacid\b|\bbase\b|pH'
    r'|\boxidation\b|\breduction\b|\btitrat', re.I)
_BIOLOGY = re.compile(
    r'\b(cell|dna|rna|protein|enzyme|meiosis|mitosis|chromosome|'
    r'photosynthesis|respiration|atp|organism|species|gene|allele)\b', re.I)
_PHYSICS = re.compile(
    r'\b(force|velocity|acceleration|momentum|energy|joule|newton|watt|'
    r'torque|friction|gravity|F\s*=\s*ma|E\s*=\s*mc)\b', re.I)


def classify_subject(text: str) -> str:
    if _CALCULUS.search(text):                               return "calculus"
    if _CHEM_FORMULA.search(text) or _CHEM_KEYWORDS.search(text): return "chemistry"
    if _BIOLOGY.search(text):                                return "biology"
    if _PHYSICS.search(text):                                return "physics"
    return "algebra"


# ─────────────────────────────────────────────────────────────────────────────
# SymPy verifier  (algebra + simple calculus equations)
# ─────────────────────────────────────────────────────────────────────────────
def _normalise(text: str) -> str:
    """Clean OCR output so SymPy can parse it."""
    text = text.strip()
    # strip prose prefix ("Solve:", "Find x:", …)
    text = re.sub(r'^(solve|find|simplify|evaluate|compute|calculate)\s*[:\s]*',
                  '', text, flags=re.I)
    text = text.replace("×", "*").replace("÷", "/")
    text = text.replace("−", "-").replace("–", "-")
    text = text.replace("^", "**")
    text = text.rstrip(".")
    # implicit multiplication: 2x → 2*x, x2 → x*2
    text = re.sub(r'(\d)([a-zA-Z])', r'\1*\2', text)
    text = re.sub(r'([a-zA-Z])(\d)', r'\1*\2', text)
    return text.strip()


def _parse_eq(raw: str):
    """Return (lhs, rhs) SymPy expressions, or None."""
    try:
        from sympy.parsing.sympy_parser import (
            parse_expr, standard_transformations,
            implicit_multiplication_application,
        )
        T = standard_transformations + (implicit_multiplication_application,)
        norm = _normalise(raw)
        if "=" not in norm:
            expr = parse_expr(norm, transformations=T)
            return expr, None          # single expression (no RHS)
        lhs_s, rhs_s = norm.split("=", 1)
        lhs = parse_expr(lhs_s, transformations=T)
        rhs = parse_expr(rhs_s, transformations=T)
        return lhs, rhs
    except Exception:
        return None


def _sympy_check(problem_text: str, step_text: str) -> Optional[CheckResult]:
    """
    Returns a CheckResult if SymPy can fully evaluate the step, else None.

    Strategy
    ────────
    Solve both the problem equation and the step equation for their free
    variable.  If the solution sets match → correct; if they differ → wrong.
    """
    try:
        from sympy import solve, Eq, simplify, Symbol

        parsed_step = _parse_eq(step_text)
        if parsed_step is None:
            return None

        s_lhs, s_rhs = parsed_step

        # ── pure expression (no "=") ──────────────────────────────────────
        if s_rhs is None:
            # can't verify without an equation; skip
            return None

        diff = simplify(s_lhs - s_rhs)
        free = (s_lhs - s_rhs).free_symbols

        # ── numerical equality (no variables) ────────────────────────────
        if not free:
            if diff == 0:
                return CheckResult("correct", 0.97, None, "algebra")
            return CheckResult(
                "wrong", 0.95,
                f"The equation doesn't balance: left side ≠ right side.",
                "algebra", "arithmetic",
            )

        var = sorted(free, key=lambda s: s.name)[0]
        step_sols = solve(Eq(s_lhs, s_rhs), var)

        # ── compare with problem's solution set ──────────────────────────
        parsed_prob = _parse_eq(problem_text)
        if parsed_prob:
            p_lhs, p_rhs = parsed_prob
            if p_rhs is None:
                p_rhs = __import__("sympy").S.Zero
            prob_free = (p_lhs - p_rhs).free_symbols
            if prob_free:
                prob_var = sorted(prob_free, key=lambda s: s.name)[0]
                prob_sols = solve(Eq(p_lhs, p_rhs), prob_var)
            else:
                prob_sols = []

            s_set = {str(s) for s in step_sols}
            p_set = {str(s) for s in prob_sols}

            if not p_set and not s_set:
                return None   # can't determine — pass to Claude

            if s_set == p_set:
                return CheckResult("correct", 0.95, None, "algebra")

            if s_set and p_set and s_set.isdisjoint(p_set):
                return CheckResult(
                    "wrong", 0.92,
                    f"Got {var} = {', '.join(sorted(s_set))} but the correct answer is "
                    f"{var} = {', '.join(sorted(p_set))}.",
                    "algebra", "algebra",
                )

            if p_set and not s_set:
                return CheckResult(
                    "wrong", 0.85,
                    f"This step has no solution, but the problem does.",
                    "algebra", "algebra",
                )

        # ── step is parseable but no problem to compare against ─────────
        return CheckResult("needs_review", 0.60, None, "algebra")

    except Exception as exc:
        logger.debug("SymPy check failed: %s", exc)
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Claude fallback verifier
# ─────────────────────────────────────────────────────────────────────────────
_CLAUDE_PROMPT = """\
You are a strict but encouraging tutor grading a student's handwritten step.

PROBLEM : {problem}
STUDENT : {step}
SUBJECT : {subject}

Decide if the step is correct, wrong, or needs human review.
Reply with EXACTLY this JSON (no other text):
{{"verdict":"correct"|"wrong"|"needs_review","confidence":0.0-1.0,"hint":"one short sentence or null","error_type":"arithmetic"|"sign"|"algebra"|"conceptual"|"procedural"|null}}

Rules
- "correct"       → step is valid; hint must be null
- "wrong"         → clear error; give a specific, encouraging hint
- "needs_review"  → ambiguous, incomplete, or you're not confident
- error_type only when verdict is "wrong", otherwise null
"""


def _claude_check(problem_text: str, step_text: str, subject: str) -> CheckResult:
    from app.config import settings

    if not settings.anthropic_api_key:
        return CheckResult(
            "needs_review", 0.50,
            "AI check unavailable — add ANTHROPIC_API_KEY to backend/.env",
            subject,
        )

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        msg = client.messages.create(
            model="claude-3-5-haiku-20241022",
            max_tokens=200,
            messages=[{
                "role": "user",
                "content": _CLAUDE_PROMPT.format(
                    problem=problem_text, step=step_text, subject=subject
                ),
            }],
        )
        raw = msg.content[0].text.strip()
        data = json.loads(raw)
        return CheckResult(
            verdict=data.get("verdict", "needs_review"),
            confidence=float(data.get("confidence", 0.5)),
            hint=data.get("hint") or None,
            subject=subject,
            error_type=data.get("error_type") or None,
        )
    except json.JSONDecodeError:
        logger.warning("Claude returned non-JSON response")
        return CheckResult("needs_review", 0.40, None, subject)
    except Exception:
        logger.exception("Claude verification failed")
        return CheckResult("needs_review", 0.40, None, subject)


# ─────────────────────────────────────────────────────────────────────────────
# Public entry point
# ─────────────────────────────────────────────────────────────────────────────
def check_step(problem_statement: str, recognized_text: str) -> CheckResult:
    """
    Main verification function called by the practice router.

    Pipeline
    ────────
    1. Classify subject from combined text
    2. Try SymPy (algebra/calculus) — instant, no API
    3. Fall back to Claude for everything else (or if SymPy can't parse)
    """
    subject = classify_subject(recognized_text + " " + problem_statement)

    if subject in ("algebra", "calculus"):
        result = _sympy_check(problem_statement, recognized_text)
        if result is not None:
            logger.info("SymPy verdict=%s conf=%.2f", result.verdict, result.confidence)
            return result

    result = _claude_check(problem_statement, recognized_text, subject)
    logger.info("Claude verdict=%s conf=%.2f", result.verdict, result.confidence)
    return result
