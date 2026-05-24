from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from app.db import get_db
from app import models, schemas

router = APIRouter()


# ── Notebooks ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[schemas.NotebookResponse])
def list_notebooks(db: Session = Depends(get_db)):
    notebooks = db.query(models.Notebook).order_by(models.Notebook.updated_at.desc()).all()
    result = []
    for nb in notebooks:
        page_count = db.query(models.Page).filter(models.Page.notebook_id == nb.id).count()
        r = schemas.NotebookResponse(
            id=nb.id, name=nb.name, cover_color=nb.cover_color,
            created_at=nb.created_at, updated_at=nb.updated_at, page_count=page_count
        )
        result.append(r)
    return result


@router.post("/", response_model=schemas.NotebookResponse)
def create_notebook(data: schemas.NotebookCreate, db: Session = Depends(get_db)):
    nb = models.Notebook(name=data.name, cover_color=data.cover_color)
    db.add(nb)
    db.flush()
    # create first page automatically
    page = models.Page(notebook_id=nb.id, page_number=1)
    db.add(page)
    db.commit()
    db.refresh(nb)
    return schemas.NotebookResponse(
        id=nb.id, name=nb.name, cover_color=nb.cover_color,
        created_at=nb.created_at, updated_at=nb.updated_at, page_count=1
    )


@router.get("/{notebook_id}", response_model=schemas.NotebookResponse)
def get_notebook(notebook_id: int, db: Session = Depends(get_db)):
    nb = db.query(models.Notebook).filter(models.Notebook.id == notebook_id).first()
    if not nb:
        raise HTTPException(status_code=404, detail="Notebook not found")
    page_count = db.query(models.Page).filter(models.Page.notebook_id == notebook_id).count()
    return schemas.NotebookResponse(
        id=nb.id, name=nb.name, cover_color=nb.cover_color,
        created_at=nb.created_at, updated_at=nb.updated_at, page_count=page_count
    )


@router.patch("/{notebook_id}", response_model=schemas.NotebookResponse)
def update_notebook(notebook_id: int, data: schemas.NotebookUpdate, db: Session = Depends(get_db)):
    nb = db.query(models.Notebook).filter(models.Notebook.id == notebook_id).first()
    if not nb:
        raise HTTPException(status_code=404, detail="Notebook not found")
    if data.name is not None:
        nb.name = data.name
    if data.cover_color is not None:
        nb.cover_color = data.cover_color
    nb.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(nb)
    page_count = db.query(models.Page).filter(models.Page.notebook_id == notebook_id).count()
    return schemas.NotebookResponse(
        id=nb.id, name=nb.name, cover_color=nb.cover_color,
        created_at=nb.created_at, updated_at=nb.updated_at, page_count=page_count
    )


@router.delete("/{notebook_id}")
def delete_notebook(notebook_id: int, db: Session = Depends(get_db)):
    nb = db.query(models.Notebook).filter(models.Notebook.id == notebook_id).first()
    if not nb:
        raise HTTPException(status_code=404, detail="Notebook not found")
    db.delete(nb)
    db.commit()
    return {"deleted": True}


# ── Pages ──────────────────────────────────────────────────────────────────────

@router.get("/{notebook_id}/pages", response_model=List[schemas.PageResponse])
def list_pages(notebook_id: int, db: Session = Depends(get_db)):
    return (
        db.query(models.Page)
        .filter(models.Page.notebook_id == notebook_id)
        .order_by(models.Page.page_number)
        .all()
    )


@router.get("/{notebook_id}/pages/{page_number}", response_model=schemas.PageResponse)
def get_page(notebook_id: int, page_number: int, db: Session = Depends(get_db)):
    page = (
        db.query(models.Page)
        .filter(models.Page.notebook_id == notebook_id, models.Page.page_number == page_number)
        .first()
    )
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


@router.put("/{notebook_id}/pages/{page_number}", response_model=schemas.PageResponse)
def save_page(notebook_id: int, page_number: int, data: schemas.PageSave, db: Session = Depends(get_db)):
    page = (
        db.query(models.Page)
        .filter(models.Page.notebook_id == notebook_id, models.Page.page_number == page_number)
        .first()
    )
    if not page:
        page = models.Page(notebook_id=notebook_id, page_number=page_number)
        db.add(page)
    page.canvas_json = data.canvas_json
    page.thumbnail_data = data.thumbnail_data
    page.updated_at = datetime.utcnow()

    nb = db.query(models.Notebook).filter(models.Notebook.id == notebook_id).first()
    if nb:
        nb.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(page)
    return page


@router.post("/{notebook_id}/pages", response_model=schemas.PageResponse)
def add_page(notebook_id: int, db: Session = Depends(get_db)):
    last = (
        db.query(models.Page)
        .filter(models.Page.notebook_id == notebook_id)
        .order_by(models.Page.page_number.desc())
        .first()
    )
    next_num = (last.page_number + 1) if last else 1
    page = models.Page(notebook_id=notebook_id, page_number=next_num)
    db.add(page)
    db.commit()
    db.refresh(page)
    return page


@router.delete("/{notebook_id}/pages/{page_number}")
def delete_page(notebook_id: int, page_number: int, db: Session = Depends(get_db)):
    page_count = db.query(models.Page).filter(models.Page.notebook_id == notebook_id).count()
    if page_count <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the only page")
    page = (
        db.query(models.Page)
        .filter(models.Page.notebook_id == notebook_id, models.Page.page_number == page_number)
        .first()
    )
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    db.delete(page)
    db.commit()
    return {"deleted": True}
