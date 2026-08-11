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
    db_encrypt = os.getenv("DB_ENCRYPT", "true").lower() in {"1", "true", "yes"}
    trust_server_cert = os.getenv("DB_TRUST_SERVER_CERT", "false").lower() in {"1", "true", "yes"}
    
    if db_user and db_pass and db_server:
        safe_user = urllib.parse.quote_plus(db_user)
        safe_pass = urllib.parse.quote_plus(db_pass)
        # ODBC Driver 17 requires comma syntax for direct TCP port connection (server,port)
        encrypt_value = "yes" if db_encrypt else "no"
        trust_value = "yes" if trust_server_cert else "no"
        db_url = (
            f"mssql+pyodbc://{safe_user}:{safe_pass}@{db_server},{db_port}/{db_name}"
            f"?driver=ODBC+Driver+17+for+SQL+Server&Encrypt={encrypt_value}"
            f"&TrustServerCertificate={trust_value}&timeout=30"
        )
    else:
        if os.getenv("ENVIRONMENT", "development").lower() == "production":
            raise RuntimeError("Production database configuration is missing")
        db_url = "sqlite:///./tracker.db"

args = {"check_same_thread": False} if db_url.startswith("sqlite") else {}
engine = create_engine(
    db_url,
    pool_pre_ping=True,
    pool_recycle=1800,
    connect_args=args,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
