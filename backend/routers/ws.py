from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict
import json

router = APIRouter(tags=["ws"])
connections: Dict[int, WebSocket] = {}

@router.websocket("/ws/{employee_id}")
async def ws_endpoint(websocket: WebSocket, employee_id: int):
    await websocket.accept()
    connections[employee_id] = websocket
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(json.dumps({"ack": True}))
    except WebSocketDisconnect:
        connections.pop(employee_id, None)

async def broadcast_to_admins(message: dict):
    dead = []
    for eid, ws in connections.items():
        try:
            await ws.send_text(json.dumps(message))
        except Exception:
            dead.append(eid)
    for eid in dead:
        connections.pop(eid, None)
