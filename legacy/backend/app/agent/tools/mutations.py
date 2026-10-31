"""
Mutation Tools - CRUD operations for objects and missions.
Handles create, update, delete operations through natural language.
"""

from langchain.tools import tool
from .base import get_admin_client


# =============================================================================
# OBJECT MUTATIONS
# =============================================================================

@tool
def update_object(object_name: str, field: str, new_value: str) -> str:
    """
    Actualiza un campo de un objeto existente.
    
    Args:
        object_name: Nombre del objeto a actualizar
        field: Campo a modificar (tipo, descripcion, nombre)
        new_value: Nuevo valor para el campo
    """
    client = get_admin_client()
    
    # Validate field
    allowed_fields = ["tipo", "descripcion", "nombre"]
    if field.lower() not in allowed_fields:
        return f"❌ Campo '{field}' no válido. Campos permitidos: {', '.join(allowed_fields)}"
    
    try:
        # Find the object
        result = client.table("objetos_exploracion").select("id, nombre, tipo").ilike("nombre", f"%{object_name}%").limit(1).execute()
        
        if not result.data:
            return f"❌ No encontré un objeto llamado '{object_name}'."
        
        obj = result.data[0]
        obj_id = obj["id"]
        old_value = obj.get(field.lower(), "N/A")
        
        # Update
        client.table("objetos_exploracion").update({field.lower(): new_value}).eq("id", obj_id).execute()
        
        return f"""✅ **Objeto actualizado:**
- **{obj['nombre']}**
- Campo: `{field}`
- Antes: {old_value}
- Ahora: {new_value}"""
        
    except Exception as e:
        return f"❌ Error al actualizar: {str(e)}"


@tool
def delete_object(object_name: str, confirm: bool = False) -> str:
    """
    Elimina un objeto de la base de datos.
    
    Args:
        object_name: Nombre del objeto a eliminar
        confirm: Si es True, elimina sin preguntar
    """
    client = get_admin_client()
    
    try:
        # Find the object
        result = client.table("objetos_exploracion").select("id, nombre, tipo, mission_id").ilike("nombre", f"%{object_name}%").limit(1).execute()
        
        if not result.data:
            return f"❌ No encontré un objeto llamado '{object_name}'."
        
        obj = result.data[0]
        
        if not confirm:
            return f"""⚠️ **¿Eliminar este objeto?**

- **Nombre:** {obj['nombre']}
- **Tipo:** {obj.get('tipo', 'N/A')}

Esta acción no se puede deshacer.

[ACTION:confirm_delete:{obj['nombre']}] [ACTION:cancel_delete:{obj['nombre']}]"""
        
        # Delete
        client.table("objetos_exploracion").delete().eq("id", obj["id"]).execute()
        
        return f"✅ Objeto **{obj['nombre']}** eliminado correctamente."
        
    except Exception as e:
        return f"❌ Error al eliminar: {str(e)}"


@tool
def create_object(name: str, object_type: str, mission_name: str, description: str = "") -> str:
    """
    Crea un nuevo objeto en una misión.
    
    Args:
        name: Nombre del nuevo objeto
        object_type: Tipo/categoría del objeto
        mission_name: Nombre de la misión donde agregarlo
        description: Descripción opcional del objeto
    """
    client = get_admin_client()
    
    try:
        # Find the mission
        mission_res = client.table("misiones").select("id, titulo").ilike("titulo", f"%{mission_name}%").limit(1).execute()
        
        if not mission_res.data:
            return f"❌ No encontré una misión llamada '{mission_name}'."
        
        mission = mission_res.data[0]
        
        # Create object
        new_obj = {
            "nombre": name,
            "tipo": object_type,
            "descripcion": description or f"Objeto creado por IA",
            "mission_id": mission["id"]
        }
        
        result = client.table("objetos_exploracion").insert(new_obj).execute()
        
        if result.data:
            return f"""✅ **Objeto creado:**
- **Nombre:** {name}
- **Tipo:** {object_type}
- **Misión:** {mission['titulo']}
- **Descripción:** {description or 'Sin descripción'}"""
        else:
            return "❌ Error al crear el objeto."
        
    except Exception as e:
        return f"❌ Error al crear: {str(e)}"


# =============================================================================
# MISSION MUTATIONS
# =============================================================================

@tool
def update_mission_status(mission_name: str, new_status: str) -> str:
    """
    Cambia el estado de una misión.
    
    Args:
        mission_name: Nombre de la misión
        new_status: Nuevo estado (activa, completada, pausada, cancelada)
    """
    client = get_admin_client()
    
    # Validate status
    allowed_statuses = ["activa", "completada", "pausada", "cancelada", "en_curso"]
    status_normalized = new_status.lower().replace(" ", "_")
    
    if status_normalized not in allowed_statuses:
        return f"❌ Estado '{new_status}' no válido. Estados permitidos: {', '.join(allowed_statuses)}"
    
    try:
        # Find mission
        result = client.table("misiones").select("id, titulo, estado").ilike("titulo", f"%{mission_name}%").limit(1).execute()
        
        if not result.data:
            return f"❌ No encontré una misión llamada '{mission_name}'."
        
        mission = result.data[0]
        old_status = mission.get("estado", "N/A")
        
        # Update
        client.table("misiones").update({"estado": status_normalized}).eq("id", mission["id"]).execute()
        
        return f"""✅ **Misión actualizada:**
- **{mission['titulo']}**
- Estado anterior: {old_status}
- Estado nuevo: {status_normalized}"""
        
    except Exception as e:
        return f"❌ Error al actualizar: {str(e)}"


@tool 
def update_mission(mission_name: str, field: str, new_value: str) -> str:
    """
    Actualiza un campo de una misión.
    
    Args:
        mission_name: Nombre de la misión
        field: Campo a modificar (titulo, descripcion, zona_geografica, estado)
        new_value: Nuevo valor
    """
    client = get_admin_client()
    
    allowed_fields = ["titulo", "descripcion", "zona_geografica", "estado"]
    if field.lower() not in allowed_fields:
        return f"❌ Campo '{field}' no válido. Campos permitidos: {', '.join(allowed_fields)}"
    
    try:
        result = client.table("misiones").select("id, titulo").ilike("titulo", f"%{mission_name}%").limit(1).execute()
        
        if not result.data:
            return f"❌ No encontré una misión llamada '{mission_name}'."
        
        mission = result.data[0]
        
        client.table("misiones").update({field.lower(): new_value}).eq("id", mission["id"]).execute()
        
        return f"""✅ **Misión actualizada:**
- **{mission['titulo']}**
- Campo: `{field}`
- Nuevo valor: {new_value}"""
        
    except Exception as e:
        return f"❌ Error: {str(e)}"
