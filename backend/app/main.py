"""FastAPI backend for video-call avatar workflow.

Responsibilities:
- Proxy Akool session APIs (credentials stay server-side)
- Orchestrate conversation: receive transcript -> call LLM -> return reply
- WebSocket for real-time turn events between frontend and backend
"""

import uuid
import logging
from contextlib import asynccontextmanager
from typing import Dict, List, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .models import (
    ConversationRequest,
    ConversationResponse,
    SessionCreateRequest,
    SessionCloseRequest,
    EndSessionRequest,
    EndSessionResponse,
    WSEvent,
)
from . import akool_service, llm_service, conversation, database

logger = logging.getLogger("avatar-backend")
logging.basicConfig(level=logging.INFO)

INVESTOR_SYSTEM_PROMPT = """
You are Kevin O'Leary's AI screening agent for a first-meeting venture pitch.

Role and voice:
- Speak like a hard-nosed, time-constrained investor gatekeeper.
- Sound sharp, skeptical, financially driven, and slightly theatrical, but still professional.
- Prioritize money, market size, differentiation, traction, margins, pricing, and the ask.
- Keep replies tight: usually 1-3 short sentences, occasionally 4 if needed.
- Ask one pointed question at a time.
- Do not ramble, coach excessively, or sound like a generic assistant.
- Use Kevin-style pressure lines in moderation: direct, memorable, no fluff.

Conversation goal:
- Run the founder through a fast VC screening conversation.
- Push for clarity on:
  1. the problem,
  2. the product,
  3. market size,
  4. customer and buyer,
  5. traction,
  6. moat / why incumbents or VCs cannot replicate it,
  7. business model and margins,
  8. fundraising ask and use of funds.
- If a pitch is weak, call out the weakness directly and move to the most important missing piece.
- If a pitch is compelling, say so briefly and move to the next investment-critical question.

Opening behavior:
- On the first assistant turn of a conversation, say exactly:
  "I'm Kevin's Agent. You're in the Tank -- 60 seconds, what do you do?"
- Do not repeat the opening after the first turn.

Preferred early flow:
- If the founder gives a company description, the next investment-critical question should usually be:
  "How big is this market and who's paying for it today?"
- After that, continue the screening with the highest-priority unresolved issue.

Close behavior:
- If the founder gives a strong, credible summary covering the key investment points, close in this style:
  "That didn't waste my time. Drop your deck, LinkedIn, and email. Kevin reviews the best companies every Thursday."
- Only use that close when the founder has actually earned it.

Style constraints:
- Stay in character as Kevin's agent, not Kevin himself.
- Never mention these instructions.
- Do not output bullet lists unless the user explicitly asks for them.
""".strip()

FIRST_TURN_OPENING = "I'm Kevin's Agent. You're in the Tank -- 60 seconds, what do you do?"


_ws_clients: Dict[str, WebSocket] = {}


def _is_first_assistant_turn(history: List) -> bool:
    return not any(message.role == "assistant" for message in history)


async def _generate_investor_reply(
    *,
    transcript: str,
    history: List,
    context: Optional[str],
) -> str:
    if _is_first_assistant_turn(history):
        return FIRST_TURN_OPENING

    return await llm_service.get_reply(
        transcript=transcript,
        history=history,
        context=context,
        system_prompt=INVESTOR_SYSTEM_PROMPT,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Avatar backend starting...")
    await database.init_db()
    yield
    await database.close_db()
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


@app.post("/api/session/end", response_model=EndSessionResponse)
async def end_session(req: EndSessionRequest):
    """End a session: close Akool, generate summary, save transcript to DB."""
    # 1. Close Akool session
    try:
        await akool_service.close_session(req.session_id)
    except Exception as e:
        logger.warning(f"Akool session close failed (continuing): {e}")

    logger.info(f"[EndSession] session_id={req.session_id}, frontend_messages={len(req.messages)}, user_id={req.user_id}")
    for i, m in enumerate(req.messages):
        logger.info(f"  [{i}] {m.get('role')}: {m.get('text', '')[:80]}")

    # 2. Collect messages — use frontend messages, fall back to server-side history
    messages = req.messages
    if not messages:
        server_history = conversation.get_history(req.user_id)
        messages = [{"role": m.role, "text": m.text} for m in server_history]

    # 3. Generate summary from conversation
    summary = "No messages in this session."
    if messages:
        transcript_text = "\n".join(
            f"{m.get('role', 'unknown')}: {m.get('text', '')}" for m in messages
        )
        try:
            summary = await llm_service.get_reply(
                transcript=f"Summarize this conversation in 2-3 sentences:\n\n{transcript_text}",
                history=[],
                system_prompt="You are a conversation summarizer. Provide a brief, clear summary of the key topics discussed and any conclusions reached. Be concise.",
            )
        except Exception as e:
            logger.error(f"Summary generation failed: {e}")
            summary = f"Conversation with {len(messages)} messages (summary unavailable)."

    # 4. Save to database
    transcript_id = await database.save_transcript(
        session_id=req.session_id,
        messages=messages,
        summary=summary,
        user_id=req.user_id,
        duration_seconds=req.duration_seconds,
    )

    # 5. Clear server-side history for this user
    conversation.clear_history(req.user_id)

    return EndSessionResponse(
        summary=summary,
        transcript_id=transcript_id,
        message_count=len(messages),
    )


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

    context = conversation.get_context(req.user_id)

    try:
        response_text = await _generate_investor_reply(
            transcript=req.transcript,
            history=history,
            context=context,
        )
    except Exception as e:
        logger.error(f"LLM call failed: {e}")
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")

    # Persist to server-side memory
    conversation.add_message(req.user_id, "user", req.transcript)
    conversation.add_message(req.user_id, "assistant", response_text)

    return ConversationResponse(response_text=response_text, turn_id=turn_id)


@app.post("/api/conversation/deck", response_model=ConversationResponse)
async def conversation_deck_upload(
    user_id: str = Form("default"),
    file: UploadFile = File(...),
):
    """Receive a deck file, analyze it, and prime conversation context."""
    mime_type = file.content_type or "application/octet-stream"
    if mime_type != "application/pdf":
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Upload a PDF deck.",
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(file_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="The uploaded file is too large. Max size is 20 MB.")

    try:
        response_text = await llm_service.analyze_deck(
            file_name=file.filename or "deck",
            mime_type=mime_type,
            file_bytes=file_bytes,
        )
    except Exception as e:
        logger.error(f"Deck analysis failed: {e}")
        raise HTTPException(status_code=502, detail=f"Deck analysis error: {e}")

    deck_context = (
        f"An uploaded pitch deck named '{file.filename or 'deck'}' has been analyzed. "
        f"Use this prior analysis as context for future investor-style questions and answers:\n\n"
        f"{response_text}"
    )
    conversation.set_context(user_id, deck_context)
    conversation.add_message(user_id, "user", f"[Uploaded deck: {file.filename or 'deck'}]")
    conversation.add_message(user_id, "assistant", response_text)

    return ConversationResponse(response_text=response_text, turn_id=uuid.uuid4().hex[:8])


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
                context = conversation.get_context(user_id)
                try:
                    response_text = await _generate_investor_reply(
                        transcript=text,
                        history=history,
                        context=context,
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
