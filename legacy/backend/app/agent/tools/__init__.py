"""
KEPLER AI Agent Tools
Modular structure for better maintainability

Modules:
- user: User-specific tools (read, search, delete own objects)
- orphan: Orphan management (adopt unclaimed objects)
- global_tools: Global statistics and read-all access
- image: Image display tools
- generic: Scalable generic tools (query_data)
"""

# User tools
from .user import (
    read_scans,
    count_scans,
    search_scans_by_label,
    delete_scan,
    get_last_mission_objects,
    get_mission_details
)

# Orphan tools
from .orphan import (
    get_orphan_count,
    adopt_orphans
)

# Global tools
from .global_tools import (
    count_global_objects,
    get_objects_summary,
    read_all_scans,
    search_all_scans,
    get_object_details,
    get_user_stats
)

# Image tools
from .image import (
    get_object_image,
    search_object_with_image
)

# Generic/Scalable tools
from .generic import (
    query_data,
    get_mission_info,
    get_mission_objects,
    get_object_descriptions
)

# Mutation tools (CRUD operations)
from .mutations import (
    update_object,
    delete_object,
    create_object,
    update_mission_status,
    update_mission
)

# Export all tools
__all__ = [
    # User
    "read_scans",
    "count_scans",
    "search_scans_by_label",
    "delete_scan",
    "get_last_mission_objects",
    "get_mission_details",
    # Orphan
    "get_orphan_count",
    "adopt_orphans",
    # Global
    "count_global_objects",
    "get_objects_summary",
    "read_all_scans",
    "search_all_scans",
    "get_object_details",
    "get_user_stats",
    # Image
    "get_object_image",
    "search_object_with_image",
    # Generic
    "query_data",
    "get_mission_info",
    "get_mission_objects",
    "get_object_descriptions",
    # Mutations
    "update_object",
    "delete_object",
    "create_object",
    "update_mission_status",
    "update_mission",
]

