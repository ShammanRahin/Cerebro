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
# SymPy calculus verifier  (definite integrals)
# ─────────────────────────────────────────────────────────────────────────────

# Matches both correct ∫ and the common OCR misread Σ/S with limits
_INTEGRAL_PATTERNS = [
    # ∫_a^b expr [dx] = result
    re.compile(
        r'[∫∫]\s*[_]?\s*([^\^]+?)\s*\^?\s*([^\s]+)\s+(.+?)\s*(?:d[a-z])?\s*=\s*(.+)$'
    ),
    # Σ/S from a to b [of] expr [dx] = result  (OCR misread of ∫)
    re.compile(
        r'[ΣS∑]\s*from\s+(\S+)\s+to\s+(\S+)\s+(?:of\s+)?(.+?)\s*(?:d[a-z])?\s*=\s*(.+)$',
        re.I,
    ),
    # integral from a to b [of] expr [dx] = result
    re.compile(
        r'integral\s+from\s+(\S+)\s+to\s+(\S+)\s+(?:of\s+)?(.+?)\s*(?:d[a-z])?\s*=\s*(.+)$',
        re.I,
    ),
]


def _sympy_integral_check(step_text: str) -> Optional[CheckResult]:
    """
    Verify a definite-integral step symbolically.
    Handles OCR misreads of ∫ as Σ/S.
    Returns None if the text doesn't look like a definite integral statement.
    """
    try:
        from sympy import integrate, Symbol, simplify
        from sympy.parsing.sympy_parser import (
            parse_expr, standard_transformations,
            implicit_multiplication_application,
        )
        T = standard_transformations + (implicit_multiplication_application,)

        text = step_text.strip()

        for pat in _INTEGRAL_PATTERNS:
            m = pat.search(text)
            if not m:
                continue

            lower_s, upper_s, integrand_s, claimed_s = m.groups()

            # Clean each part
            def p(s):
                return parse_expr(_normalise(s.strip()), transformations=T)

            x        = Symbol('x')
            lower    = p(lower_s)
            upper    = p(upper_s)
            integrand = p(integrand_s)
            claimed  = p(claimed_s)

            actual = integrate(integrand, (x, lower, upper))
            diff   = simplify(actual - claimed)

            if diff == 0:
                return CheckResult("correct", 0.97, None, "calculus")

            return CheckResult(
                "wrong", 0.94,
                f"∫{lower}^{upper} {integrand} dx = {actual}, not {claimed}.",
                "calculus", "arithmetic",
            )

        return None   # pattern not matched — pass to Groq

    except Exception as exc:
        logger.debug("SymPy integral check failed: %s", exc)
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Groq / Llama fallback verifier
# ─────────────────────────────────────────────────────────────────────────────

# Used when we have a matching problem context
_GROQ_PROMPT_WITH_CONTEXT = """\
You are a strict but encouraging tutor grading a student's handwritten step.

PROBLEM : {problem}
STUDENT : {step}
SUBJECT : {subject}

Decide if the step is correct, wrong, or needs human review.
Reply with EXACTLY this JSON (no other text, no markdown fences):
{{"verdict":"correct"|"wrong"|"needs_review","confidence":0.0-1.0,"hint":"one short sentence or null","error_type":"arithmetic"|"sign"|"algebra"|"conceptual"|"procedural"|null}}

Rules
- "correct"      → step is mathematically/scientifically valid for this problem; hint must be null
- "wrong"        → clear error relevant to the problem; give a specific, encouraging hint
- "needs_review" → ambiguous, incomplete, or you are not confident
- error_type only when verdict is "wrong", otherwise null
"""

# Used when the step subject doesn't match the assigned problem (e.g. user
# writes calculus in a notebook but the session has a physics problem)
_GROQ_PROMPT_STANDALONE = """\
You are checking whether a student's handwritten mathematical or scientific step is correct on its own.
There is no specific problem to compare against — just verify the step itself.

STUDENT WROTE : {step}
SUBJECT       : {subject}

Is this step mathematically/scientifically valid?
Reply with EXACTLY this JSON (no other text, no markdown fences):
{{"verdict":"correct"|"wrong"|"needs_review","confidence":0.0-1.0,"hint":"one short sentence or null","error_type":"arithmetic"|"sign"|"algebra"|"conceptual"|"procedural"|null}}

Rules
- "correct"      → the expression / equation is valid; hint must be null
- "wrong"        → there is a clear error; give a brief specific hint
- "needs_review" → expression is incomplete, ambiguous, or you are not sure
- error_type only when verdict is "wrong", otherwise null
"""

_GROQ_MODEL = "llama-3.3-70b-versatile"


def _groq_check(problem_text: str, step_text: str, subject: str) -> CheckResult:
    from app.config import settings

    if not settings.groq_api_key:
        return CheckResult(
            "needs_review", 0.50,
            "AI check unavailable — add GROQ_API_KEY to backend/.env",
            subject,
        )

    try:
        from groq import Groq

        # Use context-aware prompt only when the problem is relevant to the
        # subject being written — avoids comparing calculus against a physics
        # problem just because the session was bootstrapped randomly.
        problem_subject = classify_subject(problem_text) if problem_text.strip() else ""
        subjects_match  = problem_subject == subject

        if problem_text.strip() and subjects_match:
            prompt = _GROQ_PROMPT_WITH_CONTEXT.format(
                problem=problem_text, step=step_text, subject=subject,
            )
        else:
            prompt = _GROQ_PROMPT_STANDALONE.format(
                step=step_text, subject=subject,
            )

        client = Groq(api_key=settings.groq_api_key)
        resp = client.chat.completions.create(
            model=_GROQ_MODEL,
            max_tokens=200,
            temperature=0.1,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = resp.choices[0].message.content.strip()
        # Strip accidental markdown fences if the model wraps it
        raw = raw.strip("` \n")
        if raw.startswith("json"):
            raw = raw[4:].strip()
        data = json.loads(raw)
        return CheckResult(
            verdict=data.get("verdict", "needs_review"),
            confidence=float(data.get("confidence", 0.5)),
            hint=data.get("hint") or None,
            subject=subject,
            error_type=data.get("error_type") or None,
        )
    except json.JSONDecodeError:
        logger.warning("Groq returned non-JSON: %s", raw)
        return CheckResult("needs_review", 0.40, None, subject)
    except Exception:
        logger.exception("Groq verification failed")
        return CheckResult("needs_review", 0.40, None, subject)


# ─────────────────────────────────────────────────────────────────────────────
# Public entry point
# ─────────────────────────────────────────────────────────────────────────────
def check_step(problem_statement: str, recognized_text: str) -> CheckResult:
    """
    Verification pipeline:
      1. Classify subject
      2a. Calculus → try SymPy definite-integral check first (exact, no API)
      2b. Algebra  → try SymPy equation check
      3. Fall back to Groq/Llama for everything else
    """
    subject = classify_subject(recognized_text + " " + problem_statement)

    if subject == "calculus":
        result = _sympy_integral_check(recognized_text)
        if result is not None:
            logger.info("SymPy integral verdict=%s conf=%.2f", result.verdict, result.confidence)
            return result

    if subject in ("algebra", "calculus"):
        result = _sympy_check(problem_statement, recognized_text)
        if result is not None:
            logger.info("SymPy algebra verdict=%s conf=%.2f", result.verdict, result.confidence)
            return result

    result = _groq_check(problem_statement, recognized_text, subject)
    logger.info("Groq verdict=%s conf=%.2f", result.verdict, result.confidence)
    return result
