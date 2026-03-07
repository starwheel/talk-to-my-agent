"""In-memory conversation state manager.

For production, replace with Redis or a database.
"""

from collections import defaultdict
from typing import Dict, List, Optional

from .models import ConversationMessage

_conversations: Dict[str, List[ConversationMessage]] = defaultdict(list)
_contexts: Dict[str, str] = {}


def get_history(user_id: str, max_turns: int = 20) -> List[ConversationMessage]:
    return _conversations[user_id][-max_turns:]


def add_message(user_id: str, role: str, text: str) -> None:
    _conversations[user_id].append(ConversationMessage(role=role, text=text))


def set_context(user_id: str, context: str) -> None:
    _contexts[user_id] = context


def get_context(user_id: str) -> Optional[str]:
    return _contexts.get(user_id)


def clear_history(user_id: str) -> None:
    _conversations[user_id].clear()
    _contexts.pop(user_id, None)
