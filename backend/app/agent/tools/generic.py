"""
Generic Query Tool
A flexible tool that can query any table in the database.
Replaces multiple hardcoded tools with a single adaptable one.
"""
from langchain_core.tools import tool
from typing import List, Optional, Dict, Any
from .base import get_admin_client
from ..schema_loader import load_database_schema


def format_results(data: List[Dict], table: str) -> str:
    """
    Formats query results as human-readable text.
    Automatically adapts to any table structure.
    """
    if not data:
        return f"No se encontraron resultados en la tabla '{table}'."
    
    count = len(data)
    lines = [f"📊 **{count} resultado(s) de '{table}':**\n"]
    
    for i, row in enumerate(data[:15], 1):  # Limit to 15 rows
        # Find the best field to use as title
        title_fields = ['nombre', 'titulo', 'name', 'title', 'full_name', 'email']
        title = None
        for tf in title_fields:
            if tf in row and row[tf]:
                title = row[tf]
                break
        
        if not title:
            title = f"Registro {i}"
        
        # Get type/category if available
        type_fields = ['tipo', 'type', 'estado', 'status', 'categoria']
        type_val = None
        for tf in type_fields:
            if tf in row and row[tf]:
                type_val = row[tf]
                break
        
        if type_val:
            lines.append(f"{i}. **{title}** ({type_val})")
        else:
            lines.append(f"{i}. **{title}**")
        
        # Add description if available
        if 'descripcion' in row and row['descripcion']:
            desc = row['descripcion'][:60] + "..." if len(row.get('descripcion', '')) > 60 else row['descripcion']
            lines.append(f"   _{desc}_")
    
    if count > 15:
        lines.append(f"\n_... y {count - 15} más_")
    
    return "\n".join(lines)


@tool
def query_data(table: str, filter_field: str = "", filter_value: str = "") -> str:
    """
    Consulta datos de cualquier tabla.
    
    Args:
        table: Nombre de la tabla (misiones, objetos_exploracion)
        filter_field: Campo para filtrar (opcional, ej: "estado", "tipo")
        filter_value: Valor del filtro (opcional, ej: "activa", "tech")
    
    Ejemplos:
        query_data("misiones") - Lista todas las misiones
        query_data("misiones", "estado", "activa") - Misiones activas
        query_data("objetos_exploracion", "tipo", "tech") - Objetos de tipo tech
    """
    schema = load_database_schema()
    if table not in schema:
        available = ", ".join(schema.keys())
        return f"Tabla '{table}' no existe. Disponibles: {available}"
    
    client = get_admin_client()
    
    try:
        query = client.table(table).select("*")
        
        if filter_field and filter_value:
            query = query.ilike(filter_field, f"%{filter_value}%")
        
        # Order by created_at if exists
        if 'created_at' in schema[table].get('columns', []):
            query = query.order('created_at', desc=True)
        
        result = query.limit(10).execute()
        return format_results(result.data, table)
        
    except Exception as e:
        return f"Error: {str(e)}"


@tool
def get_mission_info(mission_name: str) -> str:
    """
    Obtiene información detallada de una misión por su nombre.
    Si no encuentra coincidencia exacta, sugiere misiones similares.
    
    Args:
        mission_name: Nombre o parte del nombre de la misión
    """
    client = get_admin_client()
    print(f"[DEBUG] get_mission_info called with: {mission_name}")
    try:
        # Try to find matching missions
        result = client.table("misiones").select("*").ilike("titulo", f"%{mission_name}%").execute()
        print(f"[DEBUG] Found {len(result.data) if result.data else 0} mission(s)")
        
        if not result.data:
            # No matches - list all available missions
            all_missions = client.table("misiones").select("titulo").limit(10).execute()
            if all_missions.data:
                names = [m['titulo'] for m in all_missions.data if m.get('titulo')]
                return f"No encontré '{mission_name}'. Misiones disponibles:\n" + "\n".join(f"• {n}" for n in names)
            return f"No encontré '{mission_name}' y no hay misiones registradas."
        
        if len(result.data) > 1:
            # Multiple matches - ask user to choose
            names = [m['titulo'] for m in result.data]
            return f"Encontré {len(result.data)} misiones similares. ¿Cuál necesitas?\n" + "\n".join(f"• {n}" for n in names)
        
        # Single match - return full details
        m = result.data[0]
        titulo = m.get('titulo') or 'Sin título'
        zona = m.get('zona_geografica') or 'No especificada'
        estado = m.get('estado') or 'Desconocido'
        inicio = m.get('inicio_at', '')[:10] if m.get('inicio_at') else 'No registrado'
        fin = m.get('fin_at', '')[:10] if m.get('fin_at') else 'En curso'
        codigo = m.get('codigo') or 'Sin código'
        descripcion = m.get('descripcion') or 'Sin descripción'
        
        # Get object count
        obj_count = 0
        try:
            obj_res = client.table("objetos_exploracion").select("id", count="exact").eq("mission_id", m['id']).execute()
            obj_count = obj_res.count if hasattr(obj_res, 'count') else len(obj_res.data)
        except:
            pass
        
        # Get creator name
        creador = "Usuario desconocido"
        if m.get('user_id'):
            try:
                profile = client.table("profiles").select("full_name, email").eq("id", m['user_id']).limit(1).execute()
                if profile.data:
                    creador = profile.data[0].get('full_name') or profile.data[0].get('email') or 'Usuario'
            except:
                pass
        
        return f"""🚀 **Misión: {titulo}**

📝 **Descripción:** {descripcion}
👤 **Creador:** {creador}
📍 **Zona:** {zona}
📊 **Estado:** {estado.capitalize()}
📅 **Inicio:** {inicio}
📅 **Fin:** {fin}
🔢 **Código:** {codigo}
📦 **Objetos registrados:** {obj_count}

[ACTION:show_objects:{titulo}] [ACTION:change_status:{titulo}]"""
        
    except Exception as e:
        return f"Error buscando misión: {str(e)}"


@tool
def get_mission_objects(mission_name: str) -> str:
    """
    Lista los objetos registrados en una misión específica.
    Usa esto cuando el usuario pida ver los objetos de una misión.
    
    Args:
        mission_name: Nombre de la misión
    """
    client = get_admin_client()
    print(f"[DEBUG] get_mission_objects called with: {mission_name}")
    try:
        # Find the mission
        mission_res = client.table("misiones").select("id, titulo").ilike("titulo", f"%{mission_name}%").limit(1).execute()
        
        if not mission_res.data:
            return f"No encontré una misión llamada '{mission_name}'."
        
        mission = mission_res.data[0]
        mission_id = mission['id']
        mission_title = mission['titulo']
        
        # Get objects for this mission
        obj_res = client.table("objetos_exploracion").select("nombre, tipo, descripcion, created_at").eq("mission_id", mission_id).execute()
        
        if not obj_res.data:
            return f"## Sin objetos registrados\n\nLa misión **{mission_title}** aún no tiene objetos explorados. Puedes agregar objetos desde la interfaz de misiones."
        
        count = len(obj_res.data)
        lines = [
            f"## Objetos de la Misión {mission_title}",
            f"*Se encontraron {count} objeto{'s' if count != 1 else ''} registrado{'s' if count != 1 else ''} en esta misión.*\n",
            "---",
            ""
        ]
        
        for i, obj in enumerate(obj_res.data, 1):
            nombre = obj.get('nombre') or 'Sin nombre'
            tipo = obj.get('tipo') or 'Sin tipo'
            desc = obj.get('descripcion') or 'Sin descripción'
            if len(desc) > 250:
                desc = desc[:250] + "..."
            
            lines.append(f"### {i}. {nombre}")
            lines.append(f"**Tipo:** {tipo}")
            lines.append(f"{desc}")
        
        # Add action buttons
        lines.append(f"\n[ACTION:show_image:{obj_res.data[0].get('nombre', '')}] [ACTION:export_csv:{mission_title}]")
        
        return "\n".join(lines)
        
    except Exception as e:
        return f"Error: {str(e)}"


@tool
def get_object_descriptions(object_names: str) -> str:
    """
    Gets detailed descriptions for specific objects by their names.
    Use when user asks for descriptions of specific objects.
    
    Args:
        object_names: Comma-separated list of object names to look up
    
    Returns:
        Formatted list with each object's full description.
    """
    client = get_admin_client()
    names = [n.strip() for n in object_names.split(",")]
    
    lines = [f"📋 **Descripciones de {len(names)} objeto(s):**\n"]
    
    for name in names[:10]:  # Limit to 10
        try:
            result = client.table("objetos_exploracion").select(
                "nombre, tipo, descripcion, created_at"
            ).ilike("nombre", f"%{name}%").limit(1).execute()
            
            if result.data:
                obj = result.data[0]
                lines.append(f"**{obj.get('nombre', name)}** ({obj.get('tipo', '?')})")
                desc = obj.get('descripcion') or 'Sin descripción disponible'
                lines.append(f"   {desc}\n")
            else:
                lines.append(f"**{name}**: No encontrado\n")
        except:
            lines.append(f"**{name}**: Error al buscar\n")
    
    return "\n".join(lines)
