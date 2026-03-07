"""FastAPI backend for video-call avatar workflow.

Responsibilities:
- Proxy Akool session APIs (credentials stay server-side)
- Orchestrate conversation: receive transcript -> call LLM -> return reply
- WebSocket for real-time turn events between frontend and backend
"""

import uuid
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .models import (
    ConversationRequest,
    ConversationResponse,
    SessionCreateRequest,
    SessionCloseRequest,
    WSEvent,
)
from . import akool_service, llm_service, conversation

logger = logging.getLogger("avatar-backend")
logging.basicConfig(level=logging.INFO)


# --- Connected WebSocket clients ---
from typing import Dict
_ws_clients: Dict[str, WebSocket] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Avatar backend starting...")
    yield
    logger.info("Avatar backend shutting down.")


app = FastAPI(
    title="Avatar Video Call Backend",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# REST endpoints
# ============================================================


@app.get("/health")
async def health():
    return {"status": "ok"}


# --- Akool session proxy ---


@app.post("/api/session")
async def create_session(req: SessionCreateRequest):
    """Create avatar streaming session (credentials stay server-side).

    Returns session_id + Agora credentials for the frontend to join.
    """
    # Use defaults from settings if not provided
    avatar_id = req.avatar_id or settings.akool_avatar_id
    if not avatar_id:
        raise HTTPException(status_code=400, detail="avatar_id is required")

    voice_id = req.voice_id or settings.akool_voice_id or None
    language = req.language or settings.akool_language
    duration = req.duration_minutes or settings.akool_session_duration_minutes

    try:
        result = await akool_service.create_session(
            avatar_id=avatar_id,
            voice_id=voice_id,
            language=language,
            duration_minutes=duration,
            mode_type=req.mode_type,
            knowledge_id=req.knowledge_id,
            background_url=req.background_url,
            voice_url=req.voice_url,
            voice_params=req.voice_params,
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Session create failed: {e}")
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/session/close")
async def close_session(req: SessionCloseRequest):
    """Close avatar streaming session."""
    try:
        await akool_service.close_session(req.session_id)
        return {"status": "closed"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Session close failed: {e}")
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/avatars")
async def list_avatars():
    """List available avatars."""
    try:
        return await akool_service.list_avatars()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/voices")
async def list_voices():
    """List available voices."""
    try:
        return await akool_service.list_voices()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# --- Conversation ---


@app.post("/api/conversation/reply", response_model=ConversationResponse)
async def conversation_reply(req: ConversationRequest):
    """Receive user transcript, call LLM, return response text.

    Frontend then passes response_text to sendMessage() for avatar speech.
    """
    turn_id = uuid.uuid4().hex[:8]

    # Use provided history or fall back to server-side memory
    history = req.history if req.history else conversation.get_history(req.user_id)

    try:
        response_text = await llm_service.get_reply(
            transcript=req.transcript,
            history=history,
        )
    except Exception as e:
        logger.error(f"LLM call failed: {e}")
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")

    # Persist to server-side memory
    conversation.add_message(req.user_id, "user", req.transcript)
    conversation.add_message(req.user_id, "assistant", response_text)

    return ConversationResponse(response_text=response_text, turn_id=turn_id)


@app.delete("/api/conversation/{user_id}")
async def clear_conversation(user_id: str):
    """Clear conversation history for a user."""
    conversation.clear_history(user_id)
    return {"status": "cleared"}


# ============================================================
# WebSocket — real-time turn events
# ============================================================


@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    """WebSocket for real-time turn management.

    Frontend sends:
      {"type": "transcript", "data": {"text": "user speech"}}
      {"type": "interrupt", "data": {}}

    Backend sends:
      {"type": "status",  "data": {"state": "thinking"}}
      {"type": "reply",   "data": {"text": "...", "turn_id": "..."}}
      {"type": "status",  "data": {"state": "speaking"}}
      {"type": "error",   "data": {"message": "..."}}
    """
    await websocket.accept()
    _ws_clients[user_id] = websocket
    logger.info(f"WS connected: {user_id}")

    try:
        while True:
            raw = await websocket.receive_json()
            event = WSEvent(**raw)

            if event.type == "transcript":
                text = event.data.get("text", "")
                if not text:
                    continue

                # Notify: thinking
                await websocket.send_json(
                    {"type": "status", "data": {"state": "thinking"}}
                )

                # Get LLM reply
                history = conversation.get_history(user_id)
                try:
                    response_text = await llm_service.get_reply(
                        transcript=text, history=history
                    )
                except Exception as e:
                    await websocket.send_json(
                        {"type": "error", "data": {"message": str(e)}}
                    )
                    continue

                conversation.add_message(user_id, "user", text)
                conversation.add_message(user_id, "assistant", response_text)

                turn_id = uuid.uuid4().hex[:8]

                # Send reply — frontend will call sendMessage(responseText)
                await websocket.send_json(
                    {
                        "type": "reply",
                        "data": {"text": response_text, "turn_id": turn_id},
                    }
                )

                # Notify: speaking (frontend triggers avatar after receiving reply)
                await websocket.send_json(
                    {"type": "status", "data": {"state": "speaking"}}
                )

            elif event.type == "interrupt":
                logger.info(f"Interrupt from {user_id}")
                # Frontend handles stopping avatar speech
                await websocket.send_json(
                    {"type": "status", "data": {"state": "listening"}}
                )

    except WebSocketDisconnect:
        logger.info(f"WS disconnected: {user_id}")
    finally:
        _ws_clients.pop(user_id, None)
