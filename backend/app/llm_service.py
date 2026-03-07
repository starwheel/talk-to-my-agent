"""LLM service — calls Gemini via Vertex AI (API key auth)."""

import json
from typing import Dict, List

import httpx

from .config import settings
from .models import ConversationMessage

GEMINI_API_BASE = "https://aiplatform.googleapis.com/v1/publishers/google/models"


async def get_reply(
    transcript: str,
    history: List[ConversationMessage],
    system_prompt: str = "You are a helpful video-call assistant. Keep replies concise and conversational (1-3 sentences).",
) -> str:
    """Call Gemini streamGenerateContent and return the full assembled reply."""

    # Build contents array
    contents: List[Dict] = []

    for msg in history:
        role = "user" if msg.role == "user" else "model"
        contents.append({"role": role, "parts": [{"text": msg.text}]})

    contents.append({"role": "user", "parts": [{"text": transcript}]})

    url = (
        f"{GEMINI_API_BASE}/{settings.gemini_model}:streamGenerateContent"
        f"?key={settings.gemini_api_key}"
    )

    payload = {
        "contents": contents,
        "systemInstruction": {
            "parts": [{"text": system_prompt}]
        },
        "generationConfig": {
            "maxOutputTokens": 256,
            "temperature": 0.7,
        },
    }

    # streamGenerateContent returns newline-delimited JSON chunks
    full_text = ""
    async with httpx.AsyncClient() as client:
        async with client.stream(
            "POST",
            url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30.0,
        ) as resp:
            resp.raise_for_status()
            buffer = ""
            async for chunk in resp.aiter_text():
                buffer += chunk
                # Parse JSON array chunks from the stream
                # Gemini streams a JSON array: [{...}, {...}, ...]
                # We accumulate and parse at the end

    # The full response is a JSON array of candidate objects
    data = json.loads(buffer)

    if isinstance(data, list):
        for item in data:
            candidates = item.get("candidates", [])
            for candidate in candidates:
                parts = candidate.get("content", {}).get("parts", [])
                for part in parts:
                    full_text += part.get("text", "")
    elif isinstance(data, dict):
        candidates = data.get("candidates", [])
        for candidate in candidates:
            parts = candidate.get("content", {}).get("parts", [])
            for part in parts:
                full_text += part.get("text", "")

    if not full_text:
        raise ValueError("No text in Gemini response")

    return full_text.strip()
