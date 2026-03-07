from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# --- Conversation ---

class ConversationMessage(BaseModel):
    role: str = Field(..., description="'user' or 'assistant'")
    text: str


class ConversationRequest(BaseModel):
    user_id: str = "default"
    transcript: str
    history: List[ConversationMessage] = []


class ConversationResponse(BaseModel):
    response_text: str
    turn_id: str


# --- Akool session proxy ---

class SessionCreateRequest(BaseModel):
    avatar_id: str = ""
    voice_id: Optional[str] = None
    language: str = "en"
    duration_minutes: int = Field(default=10, ge=1, le=120)
    knowledge_id: Optional[str] = None
    mode_type: int = Field(default=2)
    background_url: Optional[str] = None
    voice_url: Optional[str] = None
    voice_params: Dict[str, Any] = Field(default_factory=dict)


class SessionCloseRequest(BaseModel):
    session_id: str


# --- WebSocket events (frontend <-> backend) ---

class WSEvent(BaseModel):
    type: str  # "transcript", "reply", "status", "error", "interrupt"
    data: Dict = {}
