"""Vercel entry: the FastAPI backend served under /api on the same site as the app."""
import sys
from pathlib import Path

from fastapi import FastAPI

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.main import app as backend  # noqa: E402

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/api", backend)
