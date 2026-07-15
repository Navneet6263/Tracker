from fastapi import APIRouter, Depends, UploadFile, File, Form
from sqlalchemy.orm import Session
from datetime import datetime
from database import get_db
from models.models import Screenshot, ActivityLog, Employee
from services.auth import get_current_user
from services.storage import upload_to_s3, get_presigned_url
from services.productivity import classify
from routers.ws import broadcast_to_admins

router = APIRouter(prefix="/screenshots", tags=["screenshots"])

@router.post("/upload")
async def upload(
    file: UploadFile = File(...),
    timestamp: str = Form(...),
    window_title: str = Form(""),
    keyboard_active: str = Form("false"),
    mouse_active: str = Form("false"),
    win_r_count: int = Form(0),
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    data = await file.read()
    url = upload_to_s3(data, user.id)
    shot = Screenshot(
        employee_id=user.id,
        s3_url=url,
        window_title=window_title,
        captured_at=datetime.fromisoformat(timestamp),
    )
    db.add(shot)

    category = classify(window_title)
    
    kb_active = keyboard_active.lower() == "true"
    ms_active = mouse_active.lower() == "true"
    
    log = ActivityLog(
        employee_id=user.id,
        window_title=window_title,
        category=category,
        duration_secs=300,
        keyboard_active=kb_active,
        mouse_active=ms_active,
        win_r_count=win_r_count,
        logged_at=datetime.fromisoformat(timestamp),
    )
    db.add(log)
    db.commit()

    await broadcast_to_admins({
        "type": "screenshot",
        "employee_id": user.id,
        "window_title": window_title,
        "category": category,
        "inputs": {
            "keyboard": kb_active,
            "mouse": ms_active,
            "win_r_count": win_r_count
        }
    })

    return {"status": "ok", "url": url}

@router.get("/{employee_id}")
def list_screenshots(
    employee_id: int,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    if user.role != "admin" and user.id != employee_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Forbidden")
    shots = db.query(Screenshot).filter(Screenshot.employee_id == employee_id).order_by(Screenshot.captured_at.desc()).limit(50).all()
    return [
        {
            "id": s.id,
            "url": get_presigned_url(s.s3_url),
            "window_title": s.window_title,
            "captured_at": s.captured_at,
        }
        for s in shots
    ]
