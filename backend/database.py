import urllib.parse
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from dotenv import load_dotenv
import os

load_dotenv()

db_url = os.getenv("DATABASE_URL")
if not db_url:
    db_server = os.getenv("DB_SERVER", os.getenv("DB_HOST", "135.181.164.197"))
    db_user = os.getenv("DB_USER", "")
    db_pass = os.getenv("DB_PASSWORD", "")
    db_name = os.getenv("DB_NAME", "TrackerDB")
    db_port = os.getenv("DB_PORT", "1433")
    
    if db_user and db_pass and db_server:
        safe_user = urllib.parse.quote_plus(db_user)
        safe_pass = urllib.parse.quote_plus(db_pass)
        # ODBC Driver 17 requires comma syntax for direct TCP port connection (server,port)
        db_url = f"mssql+pyodbc://{safe_user}:{safe_pass}@{db_server},{db_port}/{db_name}?driver=ODBC+Driver+17+for+SQL+Server&Encrypt=no&TrustServerCertificate=yes&timeout=30"
    else:
        db_url = "sqlite:///./tracker.db"

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
