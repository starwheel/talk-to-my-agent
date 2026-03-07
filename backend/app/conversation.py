"""In-memory conversation state manager.

For production, replace with Redis or a database.
"""

from collections import defaultdict
from typing import Dict, List

from .models import ConversationMessage

_conversations: Dict[str, List[ConversationMessage]] = defaultdict(list)


def get_history(user_id: str, max_turns: int = 20) -> List[ConversationMessage]:
    return _conversations[user_id][-max_turns:]


def add_message(user_id: str, role: str, text: str) -> None:
    _conversations[user_id].append(ConversationMessage(role=role, text=text))


def clear_history(user_id: str) -> None:
    _conversations[user_id].clear()
