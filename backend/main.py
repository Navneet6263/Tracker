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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
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
