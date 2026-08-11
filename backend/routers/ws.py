import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from database import SessionLocal
from services.auth import get_user_from_token


router = APIRouter(tags=["ws"])
connections: list[WebSocket] = []


@router.websocket("/ws/admin")
async def ws_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        auth_message = await asyncio.wait_for(websocket.receive_text(), timeout=5)
        token = json.loads(auth_message).get("token", "")
        db = SessionLocal()
        try:
            user = get_user_from_token(token, db)
            if user.role != "admin":
                await websocket.close(code=1008, reason="Admin only")
                return
        finally:
            db.close()
    except Exception:
        await websocket.close(code=1008, reason="Invalid authentication")
        return

    connections.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in connections:
            connections.remove(websocket)


async def broadcast_to_admins(message: dict):
    dead: list[WebSocket] = []
    for websocket in list(connections):
        try:
            await websocket.send_text(json.dumps(message))
        except Exception:
            dead.append(websocket)
    for websocket in dead:
        if websocket in connections:
            connections.remove(websocket)
