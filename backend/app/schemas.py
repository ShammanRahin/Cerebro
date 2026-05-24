from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class ProblemResponse(BaseModel):
    id: int
    subject: str
    statement: str
    difficulty: str

    model_config = {"from_attributes": True}


class SessionCreate(BaseModel):
    problem_id: int


class SessionResponse(BaseModel):
    id: int
    problem_id: int
    started_at: datetime
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class StepSubmit(BaseModel):
    session_id: int
    step_index: int
    recognized_text: str
    strokes_json: Optional[str] = None


class StepResponse(BaseModel):
    id: int
    session_id: int
    step_index: int
    recognized_text: str
    subject: Optional[str] = None
    verdict: str
    confidence: Optional[float] = None
    hint: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class MistakeCreate(BaseModel):
    session_id: Optional[int] = None
    problem_id: Optional[int] = None
    recognized_text: str
    subject: str
    error_type: Optional[str] = None
    misconception: Optional[str] = None
    confidence: Optional[float] = None
    strokes_json: Optional[str] = None
    embedding: Optional[List[float]] = None


class MistakeResponse(BaseModel):
    id: int
    session_id: Optional[int] = None
    problem_id: Optional[int] = None
    recognized_text: str
    subject: str
    error_type: Optional[str] = None
    misconception: Optional[str] = None
    confidence: Optional[float] = None
    resolved: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class NotebookCreate(BaseModel):
    name: str = "Untitled Notebook"
    cover_color: str = "#6c63ff"


class NotebookUpdate(BaseModel):
    name: Optional[str] = None
    cover_color: Optional[str] = None


class NotebookResponse(BaseModel):
    id: int
    name: str
    cover_color: str
    created_at: datetime
    updated_at: datetime
    page_count: int = 0

    model_config = {"from_attributes": True}


class PageSave(BaseModel):
    canvas_json: str
    thumbnail_data: Optional[str] = None


class PageResponse(BaseModel):
    id: int
    notebook_id: int
    page_number: int
    canvas_json: Optional[str] = None
    thumbnail_data: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WeakConcept(BaseModel):
    subject: str
    error_type: Optional[str]
    count: int
