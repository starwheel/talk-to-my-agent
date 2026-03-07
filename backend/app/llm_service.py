"""LLM service — calls Gemini via Vertex AI (API key auth)."""

import base64
import json
from typing import Dict, List, Optional

import httpx

from .config import settings
from .models import ConversationMessage

GEMINI_API_BASE = "https://aiplatform.googleapis.com/v1/publishers/google/models"


async def get_reply(
    transcript: str,
    history: List[ConversationMessage],
    context: Optional[str] = None,
    system_prompt: str = "You are a helpful video-call assistant. Keep replies concise and conversational (1-3 sentences).",
) -> str:
    """Call Gemini streamGenerateContent and return the full assembled reply."""

    # Build contents array
    contents: List[Dict] = []

    for msg in history:
        role = "user" if msg.role == "user" else "model"
        contents.append({"role": role, "parts": [{"text": msg.text}]})

    user_parts: List[Dict[str, str]] = []
    if context:
        user_parts.append({"text": f"Deck context:\n{context}"})
    user_parts.append({"text": transcript})

    contents.append({"role": "user", "parts": user_parts})

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


async def analyze_deck(
    file_name: str,
    mime_type: str,
    file_bytes: bytes,
) -> str:
    """Analyze an uploaded deck and return an investor-style reply."""
    url = (
        f"{GEMINI_API_BASE}/{settings.gemini_model}:generateContent"
        f"?key={settings.gemini_api_key}"
    )

    system_prompt = (
        "You are a skeptical but constructive venture investor reviewing a startup pitch deck. "
        "The first sentence of your response must be exactly 'Let me check your deck.' "
        "Then give a brief investor-style readout in 2 short paragraphs and finish with 3 sharp questions "
        "you would ask the founder next. If the deck is weak or incomplete, say so directly."
    )

    prompt = (
        f"Review the uploaded pitch deck file named '{file_name}'. "
        "Summarize what the company appears to do, the strongest signal, the biggest concern, "
        "and ask follow-up questions like an investor in a live pitch meeting."
    )

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": base64.b64encode(file_bytes).decode("utf-8"),
                        }
                    },
                ],
            }
        ],
        "systemInstruction": {
            "parts": [{"text": system_prompt}]
        },
        "generationConfig": {
            "maxOutputTokens": 512,
            "temperature": 0.5,
        },
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=60.0,
        )
        resp.raise_for_status()
        data = resp.json()

    full_text = ""
    candidates = data.get("candidates", [])
    for candidate in candidates:
        parts = candidate.get("content", {}).get("parts", [])
        for part in parts:
            full_text += part.get("text", "")

    if not full_text:
        raise ValueError("No text in Gemini response")

    return full_text.strip()
