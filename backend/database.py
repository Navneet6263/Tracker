from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from dotenv import load_dotenv
import os

load_dotenv()

db_url = os.getenv("DATABASE_URL", "sqlite:///./tracker.db")
args = {"check_same_thread": False} if db_url.startswith("sqlite") else {}

engine = create_engine(db_url, pool_pre_ping=True, connect_args=args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
