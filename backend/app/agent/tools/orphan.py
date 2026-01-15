"""
Orphan management tools
Tools for handling objects without assigned users
"""
from langchain_core.tools import tool
from .base import get_admin_client


@tool
def get_orphan_count() -> int:
    """
    Counts how many orphaned objects (without user_id) exist in the database.
    Use for "How many orphaned objects are there?" or "Are there any unclaimed objects?".
    """
    client = get_admin_client()
    try:
        response = client.table("objetos_exploracion").select("*", count="exact", head=True).is_("user_id", "null").execute()
        return response.count
    except Exception as e:
        return -1


@tool
def adopt_orphans(user_id: str) -> str:
    """
    Adopts all orphaned objects (where user_id is NULL) and assigns them to the current user.
    Use for "Adopt orphaned objects", "Claim unclaimed data", or "Assign my ID to objects without owner".
    """
    client = get_admin_client()
    try:
        # 1. Count orphans
        count_res = client.table("objetos_exploracion").select("*", count="exact", head=True).is_("user_id", "null").execute()
        count = count_res.count
        
        if count == 0:
            return "No orphaned objects found to adopt. All objects already have owners."
            
        # 2. Update them
        res = client.table("objetos_exploracion").update({"user_id": user_id}).is_("user_id", "null").execute()
        
        adopted = len(res.data) if res.data else count
        return f"Successfully adopted {adopted} orphaned object(s). They are now yours!"
    except Exception as e:
        return f"Error adopting orphans: {str(e)}"
