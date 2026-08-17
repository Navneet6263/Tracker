"""Delete all Tracker data and seed the handover administrator.

This is intentionally a manual, destructive operation. Run it from the backend
directory only when the configured database is the database you want to reset.
"""

import argparse
from pathlib import Path
import sys


# Local development/test dependencies may be installed into .test_deps instead
# of the global Python environment. Make the standalone reset command work with
# that existing installation while still preferring a normal virtualenv install.
LOCAL_DEPS = Path(__file__).resolve().parent / ".test_deps"
if LOCAL_DEPS.is_dir():
    sys.path.append(str(LOCAL_DEPS))

from sqlalchemy import inspect, text

from database import Base, SessionLocal, engine
from models import models  # noqa: F401 - registers every model with Base.metadata
from models.models import Employee
from services.auth import hash_password


ADMIN_EMAIL = "testing@greencall.com"
ADMIN_PASSWORD = "admin123"
ADMIN_NAME = "Testing Admin"
CONFIRMATION_TEXT = "RESET TRACKER"
ALLOWED_DATABASE_NAME = "TrackerDB"


def _configured_database_name(db_engine) -> str:
    database = db_engine.url.database or ""
    if db_engine.dialect.name == "sqlite":
        return Path(database).stem
    return database


def _assert_tracker_database(db_engine) -> str:
    """Refuse to touch any database except the explicitly allowed TrackerDB."""

    database_name = _configured_database_name(db_engine)
    if database_name.casefold() != ALLOWED_DATABASE_NAME.casefold():
        shown_name = database_name or "<missing>"
        raise RuntimeError(
            f"Safety lock: configured database is '{shown_name}', not "
            f"'{ALLOWED_DATABASE_NAME}'. Nothing was changed."
        )
    return database_name


def _reset_identity_counters(db, db_engine) -> None:
    """Make new integer IDs start from 1 on supported databases."""

    dialect = db_engine.dialect.name
    if dialect == "sqlite":
        sequence_exists = db.execute(
            text(
                "SELECT 1 FROM sqlite_master "
                "WHERE type = 'table' AND name = 'sqlite_sequence'"
            )
        ).scalar()
        if sequence_exists:
            for table in Base.metadata.sorted_tables:
                db.execute(
                    text("DELETE FROM sqlite_sequence WHERE name = :table_name"),
                    {"table_name": table.name},
                )
        return

    if dialect == "mssql":
        db_inspector = inspect(db_engine)
        for table in Base.metadata.sorted_tables:
            columns = db_inspector.get_columns(table.name, schema=table.schema)
            has_identity = any(
                column.get("identity") is not None or column.get("autoincrement") is True
                for column in columns
            )
            if not has_identity:
                continue

            full_name = f"{table.schema}.{table.name}" if table.schema else table.name
            safe_name = full_name.replace("'", "''")
            db.execute(text(f"DBCC CHECKIDENT (N'{safe_name}', RESEED, 0)"))


def reset_tracker_database(session_factory=SessionLocal, db_engine=engine):
    """Atomically clear every mapped table and create the handover admin."""

    _assert_tracker_database(db_engine)
    Base.metadata.create_all(bind=db_engine)
    deleted_rows = {}

    with session_factory() as db:
        with db.begin():
            # SQLAlchemy sorts parent tables first; reversing that order removes
            # dependent rows before employees and satisfies all foreign keys.
            for table in reversed(Base.metadata.sorted_tables):
                result = db.execute(table.delete())
                deleted_rows[table.name] = max(result.rowcount or 0, 0)

            _reset_identity_counters(db, db_engine)

            admin = Employee(
                name=ADMIN_NAME,
                email=ADMIN_EMAIL,
                hashed_password=hash_password(ADMIN_PASSWORD),
                role="admin",
                is_active=True,
            )
            db.add(admin)
            db.flush()
            admin_id = admin.id

    return deleted_rows, admin_id


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Delete all Tracker data and create the handover admin."
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="skip the interactive confirmation (use carefully)",
    )
    args = parser.parse_args()

    database_name = _assert_tracker_database(engine)
    print(f"Target database: {database_name} ({engine.dialect.name})")
    print("WARNING: This permanently deletes every employee and all Tracker activity data.")
    if not args.yes:
        confirmation = input(f'Type "{CONFIRMATION_TEXT}" to continue: ').strip()
        if confirmation != CONFIRMATION_TEXT:
            print("Reset cancelled. No data was changed.")
            return

    deleted_rows, admin_id = reset_tracker_database()
    total_deleted = sum(deleted_rows.values())
    print(f"Reset complete. Deleted {total_deleted} rows across Tracker tables.")
    print(f"Admin created: #{admin_id} {ADMIN_EMAIL}")
    print(f"Temporary password: {ADMIN_PASSWORD}")
    print("Ask the recipient to change this password after the first login.")


if __name__ == "__main__":
    main()
