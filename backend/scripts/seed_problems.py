"""
Run from the backend/ directory:
    python -m scripts.seed_problems
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.db import SessionLocal, init_db
from app.models import Problem

PROBLEMS = [
    # ── Algebra (10) ──────────────────────────────────────────────────────────
    {
        "subject": "math_algebra",
        "difficulty": "easy",
        "statement": "Solve for x: 2x + 3 = 11",
    },
    {
        "subject": "math_algebra",
        "difficulty": "medium",
        "statement": "Solve for x: x² - 5x + 6 = 0",
    },
    {
        "subject": "math_algebra",
        "difficulty": "medium",
        "statement": "Factor completely: x² - 4",
    },
    {
        "subject": "math_algebra",
        "difficulty": "easy",
        "statement": "Solve for x: 3(x - 2) = 2(x + 1)",
    },
    {
        "subject": "math_algebra",
        "difficulty": "medium",
        "statement": "Solve for x: x/2 + x/3 = 5",
    },
    {
        "subject": "math_algebra",
        "difficulty": "easy",
        "statement": "Expand and simplify: (x + 3)²",
    },
    {
        "subject": "math_algebra",
        "difficulty": "medium",
        "statement": "Solve for x: |2x - 4| = 6",
    },
    {
        "subject": "math_algebra",
        "difficulty": "medium",
        "statement": "Solve the system: x + y = 7 and x - y = 3",
    },
    {
        "subject": "math_algebra",
        "difficulty": "hard",
        "statement": "Simplify: (2x)³ / (4x²)",
    },
    {
        "subject": "math_algebra",
        "difficulty": "hard",
        "statement": "Solve for x: log₂(x) + log₂(x - 2) = 3",
    },
    # ── Calculus / Derivatives (10) ───────────────────────────────────────────
    {
        "subject": "math_calculus",
        "difficulty": "easy",
        "statement": "Find the derivative: f(x) = x³",
    },
    {
        "subject": "math_calculus",
        "difficulty": "easy",
        "statement": "Find the derivative: f(x) = sin(x)",
    },
    {
        "subject": "math_calculus",
        "difficulty": "easy",
        "statement": "Find the derivative: f(x) = eˣ",
    },
    {
        "subject": "math_calculus",
        "difficulty": "easy",
        "statement": "Find the derivative: f(x) = ln(x)",
    },
    {
        "subject": "math_calculus",
        "difficulty": "medium",
        "statement": "Find the derivative using the product rule: f(x) = x² · sin(x)",
    },
    {
        "subject": "math_calculus",
        "difficulty": "medium",
        "statement": "Find the derivative using the chain rule: f(x) = sin(x²)",
    },
    {
        "subject": "math_calculus",
        "difficulty": "medium",
        "statement": "Find the derivative using the quotient rule: f(x) = (x² + 1) / (x - 1)",
    },
    {
        "subject": "math_calculus",
        "difficulty": "medium",
        "statement": "Find the derivative: f(x) = e^(3x)",
    },
    {
        "subject": "math_calculus",
        "difficulty": "medium",
        "statement": "Find the derivative: f(x) = cos(3x + 1)",
    },
    {
        "subject": "math_calculus",
        "difficulty": "hard",
        "statement": "Find and classify the critical points of f(x) = x³ - 3x",
    },
    # ── Chemistry equations (5) ───────────────────────────────────────────────
    {
        "subject": "chem_equation",
        "difficulty": "easy",
        "statement": "Balance the equation: H₂ + O₂ → H₂O",
    },
    {
        "subject": "chem_equation",
        "difficulty": "medium",
        "statement": "Balance the equation: Fe + O₂ → Fe₂O₃",
    },
    {
        "subject": "chem_equation",
        "difficulty": "easy",
        "statement": "Balance the equation: NaOH + HCl → NaCl + H₂O",
    },
    {
        "subject": "chem_equation",
        "difficulty": "hard",
        "statement": "Balance the combustion reaction: C₃H₈ + O₂ → CO₂ + H₂O",
    },
    {
        "subject": "chem_equation",
        "difficulty": "medium",
        "statement": "Balance the Haber process: N₂ + H₂ → NH₃",
    },
    # ── Concept questions — bio / physics / other (5) ─────────────────────────
    {
        "subject": "physics",
        "difficulty": "easy",
        "statement": "State Newton's second law of motion and write its formula.",
    },
    {
        "subject": "physics",
        "difficulty": "medium",
        "statement": "A ball is thrown horizontally at 10 m/s from a height of 20 m. How long before it hits the ground? (g = 10 m/s²)",
    },
    {
        "subject": "physics",
        "difficulty": "easy",
        "statement": "State the law of conservation of energy and give one example.",
    },
    {
        "subject": "bio",
        "difficulty": "medium",
        "statement": "Describe the four phases of mitosis in order and what happens in each.",
    },
    {
        "subject": "bio",
        "difficulty": "medium",
        "statement": "Explain the semi-conservative model of DNA replication.",
    },
]


def seed():
    init_db()
    db = SessionLocal()
    try:
        existing = db.query(Problem).count()
        if existing > 0:
            print(f"Already have {existing} problems — skipping seed.")
            return
        for p in PROBLEMS:
            db.add(Problem(**p))
        db.commit()
        print(f"Seeded {len(PROBLEMS)} problems.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
