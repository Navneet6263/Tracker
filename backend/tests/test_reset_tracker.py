from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from database import Base
from models.models import Employee, SystemEvent
from reset_tracker import (
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    reset_tracker_database,
)
from services.auth import hash_password, verify_password


def test_reset_tracker_database_clears_data_and_seeds_admin(tmp_path):
    test_engine = create_engine(
        f"sqlite:///{(tmp_path / 'TrackerDB.db').as_posix()}",
        connect_args={"check_same_thread": False},
    )
    test_session = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=test_engine)

    with test_session.begin() as db:
        employee = Employee(
            name="Old Employee",
            email="old@example.com",
            hashed_password=hash_password("OldPassword!123"),
            role="employee",
            is_active=True,
        )
        db.add(employee)
        db.flush()
        db.add(
            SystemEvent(
                employee_id=employee.id,
                event_type="login",
                payload=None,
                occurred_at=employee.created_at,
            )
        )

    deleted_rows, admin_id = reset_tracker_database(test_session, test_engine)

    assert deleted_rows["employees"] == 1
    assert deleted_rows["system_events"] == 1
    assert admin_id == 1

    with test_session() as db:
        employees = db.scalars(select(Employee)).all()
        events = db.scalars(select(SystemEvent)).all()

    assert events == []
    assert len(employees) == 1
    assert employees[0].email == ADMIN_EMAIL
    assert employees[0].role == "admin"
    assert employees[0].is_active is True
    assert verify_password(ADMIN_PASSWORD, employees[0].hashed_password)


def test_reset_refuses_any_database_other_than_trackerdb(tmp_path):
    other_engine = create_engine(
        f"sqlite:///{(tmp_path / 'OtherDatabase.db').as_posix()}",
        connect_args={"check_same_thread": False},
    )
    other_session = sessionmaker(bind=other_engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=other_engine)
    with other_session.begin() as db:
        db.add(
            Employee(
                name="Must Stay",
                email="keep@example.com",
                hashed_password=hash_password("OldPassword!123"),
                role="employee",
                is_active=True,
            )
        )

    try:
        reset_tracker_database(other_session, other_engine)
    except RuntimeError as exc:
        assert "Nothing was changed" in str(exc)
    else:
        raise AssertionError("Reset should refuse a non-TrackerDB database")

    with other_session() as db:
        employee = db.scalar(select(Employee))
    assert employee.email == "keep@example.com"
