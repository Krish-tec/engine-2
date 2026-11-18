"""Vercel Serverless Function entrypoint for Engine 2 FastAPI application."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.api import app

# Vercel needs the handler at module level
handler = app
