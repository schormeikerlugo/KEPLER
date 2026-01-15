"""
User-specific tools
Tools for reading, searching, and deleting user's own objects
"""
from langchain_core.tools import tool
from typing import List, Dict, Any
from .base import get_admin_client


@tool
def read_scans(user_id: str, limit: int = 10) -> str:
    """
    Retrieves the most recent scans (objects) belonging to the current user.
    Use for "What did I scan recently?" or "List my objects".
    Returns ONLY the user's own objects as a formatted list.
    """
    client = get_admin_client()
    try:
        response = client.table("objetos_exploracion").select("nombre, tipo, descripcion, created_at").eq("user_id", user_id).order("created_at", desc=True).limit(limit).execute()
        
        if not response.data:
            return "No tienes objetos registrados todavía."
        
        # Format as readable list
        lines = [f"📋 **Tus últimos {len(response.data)} objetos:**\n"]
        for i, obj in enumerate(response.data, 1):
            name = obj.get('nombre') or 'Sin nombre'
            tipo = obj.get('tipo') or 'Desconocido'
            desc = obj.get('descripcion') or 'Sin descripción'
            # Truncate description if too long
            if len(desc) > 60:
                desc = desc[:60] + "..."
            lines.append(f"{i}. **{name}** ({tipo})")
            lines.append(f"   _{desc}_\n")
        
        return "\n".join(lines)
    except Exception as e:
        return f"Error al leer la base de datos: {str(e)}"


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
def search_scans_by_label(user_id: str, label: str) -> str:
    """
    Search for user's scans matching a specific label (class) like 'crater', 'rock', etc.
    Use for "Show me all my craters" or "How many rocks did I find?".
    """
    client = get_admin_client()
    try:
        response = client.table("objetos_exploracion").select("nombre, tipo, descripcion").eq("user_id", user_id).ilike("tipo", f"%{label}%").execute()
        
        if not response.data:
            return f"No encontré objetos de tipo '{label}' en tu colección."
        
        lines = [f"🔍 **Encontré {len(response.data)} objetos de tipo '{label}':**\n"]
        for i, obj in enumerate(response.data, 1):
            name = obj.get('nombre') or 'Sin nombre'
            desc = obj.get('descripcion') or 'Sin descripción'
            if len(desc) > 50:
                desc = desc[:50] + "..."
            lines.append(f"{i}. **{name}** - _{desc}_")
        
        return "\n".join(lines)
    except Exception as e:
        return f"Error buscando en DB: {str(e)}"


@tool
def get_last_mission_objects(user_id: str) -> str:
    """
    Gets all objects registered during the user's most recent mission (last trip).
    Use for "What did I find in my last trip?" or "Objects from my last mission".
    """
    client = get_admin_client()
    try:
        # Table is 'misiones', field is 'titulo', ordered by 'inicio_at'
        mission_res = client.table("misiones").select("id, titulo, zona_geografica").eq("user_id", user_id).order("inicio_at", desc=True).limit(1).execute()
        
        if not mission_res.data:
            return "No tienes misiones registradas aún."
        
        mission = mission_res.data[0]
        mission_id = mission.get('id')
        mission_name = mission.get('titulo') or 'Sin título'
        mission_zone = mission.get('zona_geografica') or 'Zona desconocida'
        
        # Get objects from that mission
        objects_res = client.table("objetos_exploracion").select("nombre, tipo, descripcion").eq("mission_id", mission_id).execute()
        
        if not objects_res.data:
            return f"Tu última misión '{mission_name}' en {mission_zone} no tiene objetos registrados."
        
        lines = [f"🚀 **Última misión: '{mission_name}'** (Zona: {mission_zone})\n"]
        lines.append(f"📦 **{len(objects_res.data)} objetos encontrados:**\n")
        
        for i, obj in enumerate(objects_res.data, 1):
            name = obj.get('nombre') or 'Sin nombre'
            tipo = obj.get('tipo') or 'Desconocido'
            desc = obj.get('descripcion') or 'Sin descripción'
            if len(desc) > 50:
                desc = desc[:50] + "..."
            lines.append(f"{i}. **{name}** ({tipo})")
            lines.append(f"   _{desc}_\n")
        
        return "\n".join(lines)
    except Exception as e:
        return f"Error al consultar la base de datos: {str(e)}"


@tool
def get_mission_details(mission_name: str) -> str:
    """
    Gets comprehensive details about any mission by its name or title.
    Use for "Tell me about mission X" or "Mission details for X".
    Returns: creator, objects count, zone, status, dates, and object list.
    """
    print(f"[DEBUG] get_mission_details called with: {mission_name}")
    client = get_admin_client()
    try:
        # Search for mission by title (partial match)
        mission_res = client.table("misiones").select("*").ilike("titulo", f"%{mission_name}%").limit(1).execute()
        print(f"[DEBUG] Query result: {mission_res.data}")
        
        if not mission_res.data:
            return f"No encontré una misión con el nombre '{mission_name}'."
        
        mission = mission_res.data[0]
        mission_id = mission.get('id')
        titulo = mission.get('titulo') or 'Sin título'
        zona = mission.get('zona_geografica') or 'Desconocida'
        estado = mission.get('estado') or 'Desconocido'
        inicio = mission.get('inicio_at', '')[:10] if mission.get('inicio_at') else 'N/A'
        fin = mission.get('fin_at', '')[:10] if mission.get('fin_at') else 'En curso'
        user_id = mission.get('user_id')
        
        # Get creator info from profiles table
        creator_name = "Usuario desconocido"
        if user_id:
            try:
                profile_res = client.table("profiles").select("full_name, email").eq("id", user_id).limit(1).execute()
                if profile_res.data:
                    creator_name = profile_res.data[0].get('full_name') or profile_res.data[0].get('email') or 'Usuario'
            except:
                pass
        
        # Get objects from this mission
        objects_res = client.table("objetos_exploracion").select("nombre, tipo, descripcion").eq("mission_id", mission_id).execute()
        objects_count = len(objects_res.data) if objects_res.data else 0
        
        # Build response
        lines = [
            f"🚀 **Misión: {titulo}**\n",
            f"👤 **Creador:** {creator_name}",
            f"📍 **Zona:** {zona}",
            f"📊 **Estado:** {estado.capitalize()}",
            f"📅 **Inicio:** {inicio} | **Fin:** {fin}",
            f"📦 **Objetos registrados:** {objects_count}\n"
        ]
        
        if objects_res.data and objects_count > 0:
            lines.append("**Lista de objetos:**")
            for i, obj in enumerate(objects_res.data[:10], 1):  # Limit to 10
                name = obj.get('nombre') or 'Sin nombre'
                tipo = obj.get('tipo') or '?'
                lines.append(f"  {i}. {name} ({tipo})")
            
            if objects_count > 10:
                lines.append(f"  _... y {objects_count - 10} más_")
        
        lines.append("\n💡 **Sugerencias:** Puedes preguntarme por la distancia entre objetos o ver imágenes específicas.")
        
        result = "\n".join(lines)
        print(f"[DEBUG] Final result length: {len(result)}")
        print(f"[DEBUG] Final result preview: {result[:200]}...")
        return result
    except Exception as e:
        print(f"[DEBUG] Exception occurred: {e}")
        return f"Error: {str(e)}"


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
            return "Error: Objeto no encontrado o no tienes permiso para eliminarlo."
            
        client.table("objetos_exploracion").delete().eq("id", scan_id).execute()
        return f"✅ Objeto {scan_id} eliminado correctamente."
    except Exception as e:
        return f"Error eliminando objeto: {str(e)}"
