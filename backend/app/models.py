from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db import Base


class Problem(Base):
    __tablename__ = "problems"

    id = Column(Integer, primary_key=True, index=True)
    subject = Column(String, nullable=False, index=True)
    statement = Column(Text, nullable=False)
    canonical_steps_json = Column(Text, nullable=True)
    difficulty = Column(String, default="medium")

    sessions = relationship("PracticeSession", back_populates="problem")
    mistakes = relationship("Mistake", back_populates="problem")


class PracticeSession(Base):
    __tablename__ = "practice_sessions"

    id = Column(Integer, primary_key=True, index=True)
    problem_id = Column(Integer, ForeignKey("problems.id"), nullable=False)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    problem = relationship("Problem", back_populates="sessions")
    step_records = relationship("StepRecord", back_populates="session", cascade="all, delete-orphan")
    mistakes = relationship("Mistake", back_populates="session")


class Mistake(Base):
    __tablename__ = "mistakes"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("practice_sessions.id"), nullable=True)
    problem_id = Column(Integer, ForeignKey("problems.id"), nullable=True)
    strokes_json = Column(Text, nullable=True)
    recognized_text = Column(Text, nullable=False)
    subject = Column(String, nullable=False, index=True)
    error_type = Column(String, nullable=True, index=True)
    misconception = Column(Text, nullable=True)   # hint shown to student
    correct_answer = Column(Text, nullable=True)  # the right answer
    notebook_id = Column(Integer, nullable=True)  # where the mistake was made
    page_number = Column(Integer, nullable=True)
    embedding_json = Column(Text, nullable=True)
    confidence = Column(Float, nullable=True)
    resolved = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    session = relationship("PracticeSession", back_populates="mistakes")
    problem = relationship("Problem", back_populates="mistakes")
    step_records = relationship("StepRecord", back_populates="mistake")


class Notebook(Base):
    __tablename__ = "notebooks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, default="Untitled Notebook")
    cover_color = Column(String, default="#6c63ff")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

    pages = relationship("Page", back_populates="notebook", cascade="all, delete-orphan",
                         order_by="Page.page_number")


class Page(Base):
    __tablename__ = "pages"

    id = Column(Integer, primary_key=True, index=True)
    notebook_id = Column(Integer, ForeignKey("notebooks.id"), nullable=False)
    page_number = Column(Integer, nullable=False, default=1)
    canvas_json = Column(Text, nullable=True)
    thumbnail_data = Column(Text, nullable=True)  # base64 PNG
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

    notebook = relationship("Notebook", back_populates="pages")


class StepRecord(Base):
    __tablename__ = "step_records"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("practice_sessions.id"), nullable=False)
    mistake_id = Column(Integer, ForeignKey("mistakes.id"), nullable=True)
    step_index = Column(Integer, nullable=False)
    recognized_text = Column(Text, nullable=False)
    subject = Column(String, nullable=True)
    verdict = Column(String, nullable=False)  # correct | wrong | needs_review
    confidence = Column(Float, nullable=True)
    hint = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("PracticeSession", back_populates="step_records")
    mistake = relationship("Mistake", back_populates="step_records")
