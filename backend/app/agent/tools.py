from langchain_core.tools import tool
from app.api.deps import get_supabase_client
from typing import List, Dict, Any, Optional

import os
from supabase import create_client, Client

def get_admin_client():
    """
    Returns a Supabase client with Service Role (Admin) privileges to bypass RLS.
    """
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
    
    if not url or not key:
        return get_supabase_client()
        
    return create_client(url, key)


# ============ USER-SPECIFIC TOOLS (Strict Filtering) ============

@tool
def read_scans(user_id: str, limit: int = 10) -> List[Dict[str, Any]]:
    """
    Retrieves the most recent scans (objects) belonging to the current user.
    Use for "What did I scan recently?" or "List my objects".
    Returns ONLY the user's own objects.
    """
    client = get_admin_client()
    try:
        # Strict filter: Only this user's objects
        response = client.table("objetos_exploracion").select("*").eq("user_id", user_id).order("created_at", desc=True).limit(limit).execute()
        return response.data
    except Exception as e:
        return [f"Error reading DB: {str(e)}"]

@tool
def count_scans(user_id: str) -> int:
    """
    Counts the number of scans/objects belonging to the current user.
    Use for "How many objects do I have?".
    """
    client = get_admin_client()
    try:
        response = client.table("objetos_exploracion").select("*", count="exact", head=True).eq("user_id", user_id).execute()
        return response.count
    except Exception as e:
        return -1

@tool
def search_scans_by_label(user_id: str, label: str) -> List[Dict[str, Any]]:
    """
    Search for user's scans matching a specific label (class) like 'crater', 'rock', etc.
    Use for "Show me all my craters" or "How many rocks did I find?".
    """
    client = get_admin_client()
    try:
        response = client.table("objetos_exploracion").select("*").eq("user_id", user_id).ilike("tipo", f"%{label}%").execute()
        return response.data
    except Exception as e:
        return [f"Error searching DB: {str(e)}"]

@tool
def delete_scan(user_id: str, scan_id: str) -> str:
    """
    Deletes a specific scan object by its ID. 
    WARNING: This is a destructive action. Ask for confirmation before calling.
    Only deletes objects belonging to the user.
    """
    client = get_admin_client()
    try:
        check = client.table("objetos_exploracion").select("id").eq("id", scan_id).eq("user_id", user_id).execute()
        if not check.data:
            return "Error: Object not found or you do not have permission to delete it."
            
        client.table("objetos_exploracion").delete().eq("id", scan_id).execute()
        return f"Successfully deleted object {scan_id}."
    except Exception as e:
        return f"Error deleting object: {str(e)}"


# ============ ORPHAN MANAGEMENT TOOLS ============

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


# ============ GLOBAL/LOCATION TOOLS ============

@tool
def count_global_objects() -> int:
    """
    Counts ALL objects in the database (from all users).
    Use for global statistics like "How many total objects are in the system?" or "How many discoveries have been made overall?".
    """
    client = get_admin_client()
    try:
        response = client.table("objetos_exploracion").select("*", count="exact", head=True).execute()
        return response.count
    except Exception as e:
        return -1

@tool
def get_objects_summary() -> Dict[str, Any]:
    """
    Gets a summary of all objects in the database, grouped by type.
    Use for "What types of objects have been found?" or "Give me an overview of discoveries".
    """
    client = get_admin_client()
    try:
        response = client.table("objetos_exploracion").select("tipo").execute()
        if not response.data:
            return {"total": 0, "types": {}}
        
        # Count by type
        type_counts = {}
        for obj in response.data:
            tipo = obj.get("tipo") or "Unknown"
            type_counts[tipo] = type_counts.get(tipo, 0) + 1
        
        return {"total": len(response.data), "types": type_counts}
    except Exception as e:
        return {"error": str(e)}
