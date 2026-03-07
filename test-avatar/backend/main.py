import os
import logging
from typing import Any, Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("test_avatar_backend")

AKOOL_API_HOST = os.getenv("AKOOL_API_HOST", "https://openapi.akool.com").rstrip("/")
AKOOL_API_TOKEN = os.getenv("AKOOL_API_TOKEN", "")
AKOOL_AUTH_METHOD = os.getenv("AKOOL_AUTH_METHOD", "auto").strip().lower()
DEFAULT_AVATAR_ID = os.getenv("AKOOL_AVATAR_ID", "")
DEFAULT_VOICE_ID = os.getenv("AKOOL_VOICE_ID", "")
DEFAULT_LANGUAGE = os.getenv("AKOOL_LANGUAGE", "en")
DEFAULT_SESSION_DURATION_MINUTES = int(os.getenv("AKOOL_SESSION_DURATION_MINUTES", "10"))


class SessionCreateRequest(BaseModel):
    avatar_id: str = Field(default=DEFAULT_AVATAR_ID)
    voice_id: Optional[str] = Field(default=DEFAULT_VOICE_ID or None)
    language: str = Field(default=DEFAULT_LANGUAGE)
    duration_minutes: int = Field(default=DEFAULT_SESSION_DURATION_MINUTES, ge=1, le=120)
    knowledge_id: Optional[str] = None
    mode_type: int = Field(default=2)
    background_url: Optional[str] = None
    voice_url: Optional[str] = None
    voice_params: dict[str, Any] = Field(default_factory=dict)


class SessionCloseRequest(BaseModel):
    session_id: str


app = FastAPI(title="Test Avatar Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_akool_token() -> None:
    if not AKOOL_API_TOKEN:
        raise HTTPException(status_code=500, detail="AKOOL_API_TOKEN is not configured")


def build_auth_headers(auth_method: str) -> dict[str, str]:
    if auth_method == "apikey":
        return {"x-api-key": AKOOL_API_TOKEN}
    if auth_method == "bearer":
        return {"Authorization": f"Bearer {AKOOL_API_TOKEN}"}
    raise ValueError(f"Unsupported auth method: {auth_method}")


async def call_akool(endpoint: str, payload: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    require_akool_token()

    auth_methods = ["apikey", "bearer"] if AKOOL_AUTH_METHOD == "auto" else [AKOOL_AUTH_METHOD]
    last_response: httpx.Response | None = None

    async with httpx.AsyncClient(timeout=30.0) as client:
        for auth_method in auth_methods:
            response = await client.post(
                f"{AKOOL_API_HOST}{endpoint}",
                headers={
                    **build_auth_headers(auth_method),
                    "Content-Type": "application/json",
                },
                json=payload or {},
            )
            last_response = response

            logger.info(
                "AKOOL request completed",
                extra={"endpoint": endpoint, "status_code": response.status_code, "auth_method": auth_method},
            )

            try:
                data = response.json()
            except ValueError as exc:
                logger.exception("AKOOL returned invalid JSON", extra={"endpoint": endpoint, "body": response.text[:500]})
                raise HTTPException(status_code=502, detail="Invalid JSON returned by AKOOL") from exc

            if data.get("code") == 1000:
                if "data" not in data:
                    logger.error("AKOOL response missing data", extra={"endpoint": endpoint, "response": data})
                    raise HTTPException(status_code=502, detail="AKOOL response is missing data")
                return data["data"]

            invalid_auth = data.get("code") == 1101 or data.get("msg") == "invalid authorization"
            if invalid_auth and auth_method != auth_methods[-1]:
                logger.warning("AKOOL auth method rejected, trying next method", extra={"endpoint": endpoint, "auth_method": auth_method})
                continue

            if response.status_code >= 400:
                logger.error(
                    "AKOOL upstream HTTP error",
                    extra={"endpoint": endpoint, "status_code": response.status_code, "response": data},
                )
                raise HTTPException(
                    status_code=502,
                    detail={
                        "source": "akool",
                        "status_code": response.status_code,
                        "response": data,
                    },
                )

            logger.error("AKOOL application error", extra={"endpoint": endpoint, "response": data})
            raise HTTPException(
                status_code=502,
                detail={
                    "source": "akool",
                    "status_code": response.status_code,
                    "code": data.get("code"),
                    "msg": data.get("msg") or "AKOOL request failed",
                    "response": data,
                },
            )

    raise HTTPException(
        status_code=502,
        detail={
            "source": "akool",
            "status_code": last_response.status_code if last_response else 502,
            "msg": "AKOOL request failed",
        },
    )


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/session")
async def create_session(request: SessionCreateRequest) -> dict[str, Any]:
    if not request.avatar_id:
        raise HTTPException(status_code=400, detail="avatar_id is required")

    payload = {
        "avatar_id": request.avatar_id,
        "duration": request.duration_minutes * 60,
        "language": request.language,
        "mode_type": request.mode_type,
        "stream_type": "agora",
        "voice_params": request.voice_params or {},
    }

    if request.voice_id:
        payload["voice_id"] = request.voice_id
    if request.knowledge_id:
        payload["knowledge_id"] = request.knowledge_id
    if request.background_url:
        payload["background_url"] = request.background_url
    if request.voice_url:
        payload["voice_url"] = request.voice_url

    session = await call_akool("/api/open/v4/liveAvatar/session/create", payload)
    credentials = session.get("credentials", {})

    return {
        "session_id": session.get("_id"),
        "raw_session": session,
        "agora": {
            "appId": credentials.get("agora_app_id"),
            "channel": credentials.get("agora_channel"),
            "token": credentials.get("agora_token"),
            "uid": credentials.get("agora_uid"),
        },
    }


@app.post("/api/session/close")
async def close_session(request: SessionCloseRequest) -> dict[str, str]:
    await call_akool("/api/open/v4/liveAvatar/session/close", {"id": request.session_id})
    return {"status": "closed"}
