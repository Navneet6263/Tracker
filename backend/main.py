from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv
from sqlalchemy import text
from database import engine, Base
from models import models  # Import models before create_all
from routers import activity, auth, events, analytics, ws, work

load_dotenv()

def ensure_default_admin():
    from database import SessionLocal
    from models.models import Employee
    from services.auth import hash_password
    from sqlalchemy import func
    db = SessionLocal()
    try:
        admin_email = "admin@greencall.com"
        admin = db.query(Employee).filter(func.lower(Employee.email) == admin_email).first()
        if not admin:
            admin = Employee(
                name="Administrator",
                email=admin_email,
                hashed_password=hash_password("admin123"),
                role="admin",
                is_active=True,
            )
            db.add(admin)
            db.commit()
            print(f"[Admin] Default admin created: {admin_email}")
        else:
            admin.hashed_password = hash_password("admin123")
            admin.role = "admin"
            admin.is_active = True
            db.commit()
            print(f"[Admin] Default admin password reset to admin123 for {admin_email}")
    except Exception as e:
        db.rollback()
        print(f"[Admin Warning] Could not seed admin: {e}")
    finally:
        db.close()

def ensure_indexes():
    """Create indexes for high-performance employee searches and analytics (supports SQLite and SQL Server)."""
    dialect = engine.dialect.name
    index_defs = [
        ("idx_employees_name", "employees", "(name)"),
        ("idx_employees_role_active", "employees", "(role, is_active)"),
        ("idx_activity_emp_start", "activity_intervals", "(employee_id, started_at)"),
        ("idx_activity_started_at", "activity_intervals", "(started_at)"),
        ("idx_events_emp_time", "system_events", "(employee_id, occurred_at)"),
        ("idx_presence_state", "employee_presences", "(state)"),
    ]
    with engine.connect() as conn:
        for idx_name, table, cols in index_defs:
            try:
                if dialect == "sqlite":
                    conn.execute(text(f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table}{cols}"))
                else:
                    check_sql = text(f"SELECT 1 FROM sys.indexes WHERE name = '{idx_name}'")
                    res = conn.execute(check_sql).fetchone()
                    if not res:
                        conn.execute(text(f"CREATE NONCLUSTERED INDEX {idx_name} ON {table}{cols}"))
                conn.commit()
            except Exception:
                pass

try:
    Base.metadata.create_all(bind=engine)
except Exception as exc:
    print(f"[DB Warning] create_all: {exc}")

try:
    ensure_indexes()
except Exception as exc:
    print(f"[DB Warning] ensure_indexes: {exc}")

try:
    ensure_default_admin()
except Exception as exc:
    print(f"[Admin Warning] ensure_default_admin: {exc}")

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
app.include_router(work.router)

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/health/ready")
def readiness():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"status": "ready", "database": "ok"}
