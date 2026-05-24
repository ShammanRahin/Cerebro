from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import structlog

from app.db import init_db
from app.routers import mistakes, practice, notes, notebooks, ocr

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("cerebro_api_started")
    yield


app = FastAPI(title="Cerebro API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(mistakes.router, prefix="/api/mistakes", tags=["mistakes"])
app.include_router(practice.router, prefix="/api/practice", tags=["practice"])
app.include_router(notes.router, prefix="/api/notes", tags=["notes"])
app.include_router(notebooks.router, prefix="/api/notebooks", tags=["notebooks"])
app.include_router(ocr.router, prefix="/api/ocr", tags=["ocr"])


@app.get("/health")
def health():
    return {"status": "ok", "service": "cerebro"}
