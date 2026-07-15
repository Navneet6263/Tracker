from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv
from database import engine, Base
from models import models  # Import models before create_all
from routers import auth, screenshots, events, analytics, ws

load_dotenv()
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Employee Tracker API", version="1.0.0")

_frontend_url = os.getenv("FRONTEND_URL", "")
_allowed_origins = [
    "http://localhost:8080",   # New dashboard (Vite/TanStack)
    "http://localhost:3000",   # Old dashboard fallback
    "http://localhost:5173",   # Vite default
]
if _frontend_url:
    _allowed_origins.append(_frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.staticfiles import StaticFiles
import os

app.include_router(auth.router)
app.include_router(screenshots.router)
app.include_router(events.router)
app.include_router(analytics.router)
app.include_router(ws.router)

os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

@app.get("/health")
def health():
    return {"status": "ok"}
