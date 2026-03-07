"""Akool API proxy — keeps credentials server-side.

Supports two auth strategies:
- Token-based: AKOOL_API_TOKEN with auto-detection (apikey / bearer)
- Legacy: client_id + client_secret → fetched bearer token
"""

import logging
from typing import Any, Dict, List, Optional

import httpx
from fastapi import HTTPException

from .config import settings

logger = logging.getLogger("avatar-backend.akool")

_token_cache: Dict[str, str] = {}


# ------------------------------------------------------------------
# Auth helpers
# ------------------------------------------------------------------

async def _get_legacy_token() -> str:
    """Get or refresh Akool API token via client_id/secret."""
    if "token" in _token_cache:
        return _token_cache["token"]

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.akool_api_host}/api/open/v3/getToken",
            json={
                "clientId": settings.akool_client_id,
                "clientSecret": settings.akool_client_secret,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        _token_cache["token"] = data["token"]
        return data["token"]


def _build_auth_headers(auth_method: str) -> Dict[str, str]:
    token = settings.akool_api_token
    if auth_method == "apikey":
        return {"x-api-key": token}
    if auth_method == "bearer":
        return {"Authorization": f"Bearer {token}"}
    raise ValueError(f"Unsupported auth method: {auth_method}")


def _auth_methods() -> List[str]:
    """Return list of auth methods to try."""
    m = settings.akool_auth_method.strip().lower()
    if m == "auto":
        return ["apikey", "bearer"]
    return [m]


# ------------------------------------------------------------------
# Core API caller (robust, with auth fallback)
# ------------------------------------------------------------------

async def call_akool(
    endpoint: str,
    payload: Optional[Dict[str, Any]] = None,
    method: str = "POST",
) -> Dict[str, Any]:
    """Call an Akool API endpoint with automatic auth handling.

    If AKOOL_API_TOKEN is set, uses token-based auth with auto-fallback.
    Otherwise falls back to legacy client_id/secret auth.
    """
    host = settings.akool_api_host.rstrip("/")

    # Legacy auth path
    if not settings.akool_api_token and settings.akool_client_id:
        token = await _get_legacy_token()
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=30.0) as client:
            if method == "GET":
                resp = await client.get(f"{host}{endpoint}", headers=headers)
            else:
                resp = await client.post(f"{host}{endpoint}", headers=headers, json=payload or {})
            resp.raise_for_status()
            return resp.json()

    # Token-based auth with auto-fallback
    auth_list = _auth_methods()
    last_response: Optional[httpx.Response] = None

    async with httpx.AsyncClient(timeout=30.0) as client:
        for auth_method in auth_list:
            headers = {**_build_auth_headers(auth_method), "Content-Type": "application/json"}

            if method == "GET":
                response = await client.get(f"{host}{endpoint}", headers=headers)
            else:
                response = await client.post(f"{host}{endpoint}", headers=headers, json=payload or {})

            last_response = response

            logger.info(
                "AKOOL request completed",
                extra={"endpoint": endpoint, "status_code": response.status_code, "auth_method": auth_method},
            )

            try:
                data = response.json()
            except ValueError:
                logger.exception("AKOOL returned invalid JSON")
                raise HTTPException(status_code=502, detail="Invalid JSON returned by AKOOL")

            if data.get("code") == 1000:
                if "data" not in data:
                    logger.error("AKOOL response missing data field", extra={"response": data})
                    raise HTTPException(status_code=502, detail="AKOOL response is missing data")
                return data["data"]

            # Auth rejection — try next method
            invalid_auth = data.get("code") == 1101 or data.get("msg") == "invalid authorization"
            if invalid_auth and auth_method != auth_list[-1]:
                logger.warning("AKOOL auth rejected, trying next method", extra={"auth_method": auth_method})
                continue

            if response.status_code >= 400:
                logger.error("AKOOL upstream HTTP error", extra={"status_code": response.status_code, "response": data})
                raise HTTPException(
                    status_code=502,
                    detail={"source": "akool", "status_code": response.status_code, "response": data},
                )

            logger.error("AKOOL application error", extra={"response": data})
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


# ------------------------------------------------------------------
# High-level service functions
# ------------------------------------------------------------------

async def create_session(
    avatar_id: str,
    voice_id: Optional[str] = None,
    language: str = "en",
    duration_minutes: int = 10,
    mode_type: int = 2,
    knowledge_id: Optional[str] = None,
    background_url: Optional[str] = None,
    voice_url: Optional[str] = None,
    voice_params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Create an avatar streaming session via Akool API.

    Returns the session data including Agora credentials.
    """
    payload: Dict[str, Any] = {
        "avatar_id": avatar_id,
        "duration": duration_minutes * 60,
        "language": language,
        "mode_type": mode_type,
        "stream_type": "agora",
        "voice_params": voice_params or {},
    }

    if voice_id:
        payload["voice_id"] = voice_id
    if knowledge_id:
        payload["knowledge_id"] = knowledge_id
    if background_url:
        payload["background_url"] = background_url
    if voice_url:
        payload["voice_url"] = voice_url

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


async def close_session(session_id: str) -> Dict[str, Any]:
    """Close an avatar streaming session."""
    return await call_akool(
        "/api/open/v4/liveAvatar/session/close",
        {"id": session_id},
    )


async def list_avatars() -> Dict[str, Any]:
    """Fetch available avatars."""
    return await call_akool("/api/open/v4/liveAvatar/avatar/list", method="GET")


async def list_voices() -> Dict[str, Any]:
    """Fetch available voices."""
    return await call_akool("/api/open/v4/liveAvatar/voice/list", method="GET")
