"""
Image display tools
Tools for displaying object images in the chat
"""
from langchain_core.tools import tool
from .base import get_admin_client


@tool
def get_object_image(object_id: str) -> str:
    """
    Gets the image of a specific object for display in the chat.
    Use when user asks to "show me the image", "let me see it", "display the picture".
    Returns a reference that will display the image in the chat.
    """
    client = get_admin_client()
    try:
        response = client.table("objetos_exploracion").select(
            "id, nombre, tipo, metadata"
        ).eq("id", object_id).single().execute()
        
        if not response.data:
            return "Error: Object not found"
        
        obj = response.data
        metadata = obj.get("metadata") or {}
        has_image = bool(metadata.get("image_base64"))
        nombre = obj.get("nombre", "Objeto")
        tipo = obj.get("tipo", "Unknown")
        
        if not has_image:
            return f"No image available for '{nombre}' (Type: {tipo})"
        
        # Return placeholder - will be replaced with actual image by post-processor
        return f"Here is **{nombre}** (Type: {tipo}):\n\n[KEPLER_IMAGE:{object_id}]"
    except Exception as e:
        return f"Error: {str(e)}"


@tool
def search_object_with_image(label: str) -> str:
    """
    Searches for an object by name/type and returns it WITH its image.
    Use for "Show me a picture of [object]", "What does [object] look like?".
    Returns a reference that will display the image in the chat.
    """
    client = get_admin_client()
    try:
        # Search by nombre first
        response = client.table("objetos_exploracion").select(
            "id, nombre, tipo, descripcion, metadata"
        ).ilike("nombre", f"%{label}%").limit(1).execute()
        
        # If not found, try tipo
        if not response.data:
            response = client.table("objetos_exploracion").select(
                "id, nombre, tipo, descripcion, metadata"
            ).ilike("tipo", f"%{label}%").limit(1).execute()
        
        if not response.data:
            return f"No object found matching '{label}'"
        
        obj = response.data[0]
        object_id = obj.get("id")
        metadata = obj.get("metadata") or {}
        has_image = bool(metadata.get("image_base64"))
        nombre = obj.get("nombre", "Objeto")
        tipo = obj.get("tipo", "Unknown")
        desc = obj.get("descripcion", "")
        
        result = f"Found **{nombre}** (Type: {tipo})"
        if desc:
            result += f"\n{desc}"
        
        if has_image:
            result += f"\n\n[KEPLER_IMAGE:{object_id}]"
        else:
            result += "\n(No image available)"
        
        return result
    except Exception as e:
        return f"Error: {str(e)}"
