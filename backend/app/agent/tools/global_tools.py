"""
Global read tools
Tools for reading data from all users and global statistics
"""
from langchain_core.tools import tool
from typing import List, Dict, Any
from .base import get_admin_client


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


@tool
def read_all_scans(limit: int = 20) -> List[Dict[str, Any]]:
    """
    Retrieves the most recent scans/objects from ALL users in the community.
    Use for "What has everyone found?", "Show recent community discoveries", 
    or "What objects exist in the database?".
    READ-ONLY: Does not modify any data.
    """
    client = get_admin_client()
    try:
        response = client.table("objetos_exploracion").select(
            "id, nombre, tipo, descripcion, user_id, created_at, metadata"
        ).order("created_at", desc=True).limit(limit).execute()
        return response.data
    except Exception as e:
        return [f"Error reading DB: {str(e)}"]


@tool
def search_all_scans(label: str) -> List[Dict[str, Any]]:
    """
    Search for scans/objects matching a label from ALL users.
    Use for "Are there any refrigerators?", "Has anyone found a TV?",
    or "What [type] objects exist in the system?".
    READ-ONLY: Does not modify any data.
    """
    client = get_admin_client()
    try:
        response = client.table("objetos_exploracion").select(
            "id, nombre, tipo, descripcion, user_id, created_at"
        ).ilike("nombre", f"%{label}%").execute()
        
        # Also search by tipo if no results
        if not response.data:
            response = client.table("objetos_exploracion").select(
                "id, nombre, tipo, descripcion, user_id, created_at"
            ).ilike("tipo", f"%{label}%").execute()
        
        return response.data
    except Exception as e:
        return [f"Error searching DB: {str(e)}"]


@tool
def get_object_details(object_id: str) -> Dict[str, Any]:
    """
    Gets full details of a specific object by ID, regardless of owner.
    Use for "Tell me about object X", "Show details of [ID]",
    or when you need complete information about a specific discovery.
    READ-ONLY: Does not modify any data.
    """
    client = get_admin_client()
    try:
        response = client.table("objetos_exploracion").select("*").eq("id", object_id).single().execute()
        if response.data:
            return response.data
        return {"error": "Object not found"}
    except Exception as e:
        return {"error": str(e)}


@tool
def get_user_stats(target_user_id: str) -> Dict[str, Any]:
    """
    Gets statistics for a specific user (objects count, types breakdown).
    Use for "How many objects does user X have?", "What has [user] found?",
    or comparing users' contributions.
    READ-ONLY: Does not modify any data.
    """
    client = get_admin_client()
    try:
        # Count objects
        response = client.table("objetos_exploracion").select(
            "tipo"
        ).eq("user_id", target_user_id).execute()
        
        if not response.data:
            return {"user_id": target_user_id, "total_objects": 0, "types": {}}
        
        # Count by type
        type_counts = {}
        for obj in response.data:
            tipo = obj.get("tipo") or "Unknown"
            type_counts[tipo] = type_counts.get(tipo, 0) + 1
        
        # Get profile info
        profile = client.table("profiles").select(
            "username, display_name"
        ).eq("id", target_user_id).single().execute()
        
        username = profile.data.get("display_name") or profile.data.get("username") if profile.data else "Unknown"
        
        return {
            "user_id": target_user_id,
            "username": username,
            "total_objects": len(response.data),
            "types": type_counts
        }
    except Exception as e:
        return {"error": str(e)}
