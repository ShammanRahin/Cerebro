"""
Cerebro Mistake Graph — MCP server.

Exposes the student's mistake graph (the same SQLite DB the web app uses) as
Model Context Protocol tools, so any MCP client (Claude Desktop, Cursor, etc.)
can query the learning data in plain English, e.g.:

  "What's my most common calculus mistake?"
  "Have I made this mistake before:  the nucleus is the powerhouse of the cell ?"
  "Summarise my weak areas and what I should review."

Run (stdio transport):
    cd backend
    python -m mcp_servers.mistake_graph_mcp

Register with Claude Desktop — add to claude_desktop_config.json:
    {
      "mcpServers": {
        "cerebro": {
          "command": "python",
          "args": ["-m", "mcp_servers.mistake_graph_mcp"],
          "cwd": "<absolute path to>/cerebro/backend"
        }
      }
    }
"""
import os
import sys

# Make the backend's `app` package importable when launched as a module/script
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import func
from mcp.server.fastmcp import FastMCP

from app.db import SessionLocal
from app import models
from app.services.mistake_graph import find_similar

mcp = FastMCP("cerebro-mistake-graph")


@mcp.tool()
def mistake_overview() -> dict:
    """High-level summary of the student's mistake graph: totals, resolved vs
    unresolved, and the single weakest area (most-repeated unresolved error)."""
    db = SessionLocal()
    try:
        total = db.query(func.count(models.Mistake.id)).scalar() or 0
        unresolved = (
            db.query(func.count(models.Mistake.id))
            .filter(models.Mistake.resolved == False)  # noqa: E712
            .scalar() or 0
        )
        top = (
            db.query(models.Mistake.subject, models.Mistake.error_type,
                     func.count().label("count"))
            .filter(models.Mistake.resolved == False)  # noqa: E712
            .group_by(models.Mistake.subject, models.Mistake.error_type)
            .order_by(func.count().desc())
            .first()
        )
        return {
            "total_mistakes": total,
            "resolved": total - unresolved,
            "unresolved": unresolved,
            "weakest_area": (
                {"subject": top.subject, "error_type": top.error_type, "count": top.count}
                if top else None
            ),
        }
    finally:
        db.close()


@mcp.tool()
def list_mistakes(subject: str = "", error_type: str = "",
                  resolved: str = "", limit: int = 20) -> list[dict]:
    """List the student's recorded mistakes, most recent first.

    Args:
        subject: filter by subject (algebra, calculus, chemistry, biology, physics). Empty = all.
        error_type: filter by type (arithmetic, sign, algebra, conceptual, procedural). Empty = all.
        resolved: "true" or "false" to filter by status. Empty = all.
        limit: maximum rows to return (default 20).
    """
    db = SessionLocal()
    try:
        q = db.query(models.Mistake)
        if subject:
            q = q.filter(models.Mistake.subject == subject)
        if error_type:
            q = q.filter(models.Mistake.error_type == error_type)
        if resolved.lower() in ("true", "false"):
            q = q.filter(models.Mistake.resolved == (resolved.lower() == "true"))
        rows = q.order_by(models.Mistake.created_at.desc()).limit(limit).all()
        return [{
            "id": m.id,
            "text": m.recognized_text,
            "subject": m.subject,
            "error_type": m.error_type,
            "hint": m.misconception,
            "correct_answer": m.correct_answer,
            "resolved": m.resolved,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        } for m in rows]
    finally:
        db.close()


@mcp.tool()
def weak_concepts() -> list[dict]:
    """The student's top recurring weak areas: unresolved mistakes grouped by
    subject + error type, most frequent first."""
    db = SessionLocal()
    try:
        rows = (
            db.query(models.Mistake.subject, models.Mistake.error_type,
                     func.count().label("count"))
            .filter(models.Mistake.resolved == False)  # noqa: E712
            .group_by(models.Mistake.subject, models.Mistake.error_type)
            .order_by(func.count().desc())
            .limit(10)
            .all()
        )
        return [{"subject": r.subject, "error_type": r.error_type, "count": r.count} for r in rows]
    finally:
        db.close()


@mcp.tool()
def subject_stats() -> list[dict]:
    """Per-subject totals and how many remain unresolved."""
    db = SessionLocal()
    try:
        total = (
            db.query(models.Mistake.subject, func.count().label("total"))
            .group_by(models.Mistake.subject).all()
        )
        unresolved = (
            db.query(models.Mistake.subject, func.count().label("u"))
            .filter(models.Mistake.resolved == False)  # noqa: E712
            .group_by(models.Mistake.subject).all()
        )
        umap = {r.subject: r.u for r in unresolved}
        return [
            {"subject": r.subject, "total": r.total, "unresolved": umap.get(r.subject, 0)}
            for r in total
        ]
    finally:
        db.close()


@mcp.tool()
def find_similar_mistakes(text: str, k: int = 5) -> list[dict]:
    """Semantic search over the mistake-graph embeddings — find past mistakes
    similar in meaning to `text`. Answers "have I made this mistake before?".

    Args:
        text: the statement/step to compare against past mistakes.
        k: how many similar mistakes to return (default 5).
    """
    db = SessionLocal()
    try:
        similar = find_similar(db, text, k=k, min_similarity=0.3)
        return [{
            "id": m.id,
            "text": m.recognized_text,
            "subject": m.subject,
            "error_type": m.error_type,
            "hint": m.misconception,
            "correct_answer": m.correct_answer,
        } for m in similar]
    finally:
        db.close()


if __name__ == "__main__":
    mcp.run()
