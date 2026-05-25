from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def _run_migrations():
    """Add new columns to existing tables without dropping data (SQLite-safe)."""
    with engine.connect() as conn:
        existing = {
            row[1]
            for row in conn.execute(text("PRAGMA table_info(mistakes)"))
        }
        new_cols = {
            "correct_answer": "TEXT",
            "notebook_id": "INTEGER",
            "page_number": "INTEGER",
        }
        for col, dtype in new_cols.items():
            if col not in existing:
                conn.execute(text(f"ALTER TABLE mistakes ADD COLUMN {col} {dtype}"))
        conn.commit()


def init_db():
    from app import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _run_migrations()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
