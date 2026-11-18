"""Vercel Serverless Function entrypoint for Engine 2 FastAPI application."""
import sys
from pathlib import Path

# Add project root directory to sys.path for seamless imports
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.api import app
