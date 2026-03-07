"""Database layer — stores conversation transcripts in Supabase/Postgres."""

import logging
from typing import Any, Dict, List, Optional

import asyncpg

from .config import settings

logger = logging.getLogger("avatar-backend.db")

_pool: Optional[asyncpg.Pool] = None


async def init_db() -> None:
    """Initialize connection pool and create tables if needed."""
    global _pool
    if not settings.db_url or not settings.db_user:
        logger.warning("DB_URL/DB_USER not set — transcript storage disabled")
        return

    try:
        _pool = await asyncpg.create_pool(
            host=settings.db_url,
            port=settings.db_port,
            user=settings.db_user,
            password=settings.db_password,
            database=settings.db_name,
            min_size=1,
            max_size=10,
            timeout=10,
            ssl="require",
        )

        async with _pool.acquire() as conn:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS transcripts (
                    id SERIAL PRIMARY KEY,
                    session_id TEXT,
                    user_id TEXT DEFAULT 'default',
                    messages JSONB NOT NULL DEFAULT '[]',
                    summary TEXT,
                    duration_seconds INTEGER,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
            """)
        logger.info("Database initialized, transcripts table ready")
    except Exception as e:
        logger.error(f"Database connection failed (continuing without DB): {e}")
        _pool = None


async def close_db() -> None:
    """Close connection pool."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


async def save_transcript(
    session_id: str,
    messages: List[Dict[str, Any]],
    summary: str,
    user_id: str = "default",
    duration_seconds: Optional[int] = None,
) -> int:
    """Save a conversation transcript and return the record ID."""
    if not _pool:
        logger.warning("Database not initialized — skipping transcript save")
        return -1

    import json
    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO transcripts (session_id, user_id, messages, summary, duration_seconds)
            VALUES ($1, $2, $3::jsonb, $4, $5)
            RETURNING id
            """,
            session_id,
            user_id,
            json.dumps(messages),
            summary,
            duration_seconds,
        )
        logger.info(f"Transcript saved: id={row['id']}, session={session_id}")
        return row["id"]


async def get_transcripts(limit: int = 20) -> List[Dict[str, Any]]:
    """Fetch recent transcripts."""
    if not _pool:
        return []

    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM transcripts ORDER BY created_at DESC LIMIT $1",
            limit,
        )
        return [dict(r) for r in rows]
