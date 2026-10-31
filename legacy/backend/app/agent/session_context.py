"""
Session Context Manager - Tracks conversation context for natural language understanding.
Stores current mission, objects, and last intent between messages.
"""

from dataclasses import dataclass, field
from typing import Optional, List, Dict


@dataclass
class SessionContext:
    """Holds the current conversation context."""
    current_mission: Optional[str] = None
    current_mission_id: Optional[str] = None
    current_objects: List[str] = field(default_factory=list)
    last_intent: Optional[str] = None
    pending_delete: Optional[str] = None  # Object waiting for delete confirmation
    
    def update_mission(self, mission_name: str, mission_id: str = None):
        """Update the current mission context."""
        self.current_mission = mission_name
        self.current_mission_id = mission_id
    
    def update_objects(self, objects: List[str]):
        """Update the list of recently mentioned objects."""
        self.current_objects = objects[:10]  # Keep last 10
    
    def add_object(self, object_name: str):
        """Add a single object to context."""
        if object_name not in self.current_objects:
            self.current_objects.insert(0, object_name)
            self.current_objects = self.current_objects[:10]
    
    def clear(self):
        """Clear all context."""
        self.current_mission = None
        self.current_mission_id = None
        self.current_objects = []
        self.last_intent = None
    
    def to_summary(self) -> str:
        """Return a human-readable summary for the LLM."""
        parts = []
        if self.current_mission:
            parts.append(f"Misión actual: {self.current_mission}")
        if self.current_objects:
            parts.append(f"Objetos recientes: {', '.join(self.current_objects[:5])}")
        return " | ".join(parts) if parts else "Sin contexto previo"


# Global session contexts (keyed by user_id)
_sessions: Dict[str, SessionContext] = {}


def get_session(user_id: str) -> SessionContext:
    """Get or create a session context for a user."""
    if user_id not in _sessions:
        _sessions[user_id] = SessionContext()
    return _sessions[user_id]


def clear_session(user_id: str):
    """Clear a user's session context."""
    if user_id in _sessions:
        _sessions[user_id].clear()
