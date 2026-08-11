from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv
from sqlalchemy import text
from database import engine, Base
from models import models  # Import models before create_all
from routers import activity, auth, events, analytics, ws

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

app.include_router(auth.router)
app.include_router(activity.router)
app.include_router(events.router)
app.include_router(analytics.router)
app.include_router(ws.router)

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/health/ready")
def readiness():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"status": "ready", "database": "ok"}
