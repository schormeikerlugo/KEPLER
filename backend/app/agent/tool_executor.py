"""
Tool Executor - Executes tools based on detected intent.
Maps intents to tool functions and handles execution.
"""

import re
from typing import Optional, Tuple
from .intent_detector import Intent, DetectedIntent
from .session_context import SessionContext


def execute_tool(
    detected: DetectedIntent,
    context: SessionContext
) -> Tuple[Optional[str], bool]:
    """
    Execute the appropriate tool based on detected intent.
    
    Args:
        detected: DetectedIntent with intent and entities
        context: SessionContext for updating after execution
    
    Returns:
        Tuple of (result_string, success_bool)
    """
    intent = detected.intent
    entities = detected.entities
    
    try:
        # Read operations
        if intent == Intent.GET_MISSION_INFO:
            return _execute_mission_info(entities, context)
        
        elif intent == Intent.GET_MISSION_OBJECTS:
            return _execute_mission_objects(entities, context)
        
        elif intent == Intent.GET_OBJECT_IMAGE:
            return _execute_object_image(entities, context)
        
        elif intent == Intent.GET_OBJECT_DETAILS:
            return _execute_object_details(entities, context)
        
        elif intent == Intent.LIST_MISSIONS:
            return _execute_list_missions(context)
        
        # Mutation operations
        elif intent == Intent.UPDATE_OBJECT:
            return _execute_update_object(entities, context)
        
        elif intent == Intent.DELETE_OBJECT:
            return _execute_delete_object(entities, context)
        
        elif intent == Intent.CREATE_OBJECT:
            return _execute_create_object(entities, context)
        
        elif intent == Intent.UPDATE_MISSION:
            return _execute_update_mission(entities, context)
        
        elif intent == Intent.CONFIRM_DELETE:
            return _execute_confirm_delete(entities, context)
        
        elif intent == Intent.COMPARE_ITEMS:
            return _execute_compare_items(entities, context)
        
        else:
            # GENERAL_CHAT - no tool needed
            return None, False
            
    except Exception as e:
        return f"Error ejecutando herramienta: {str(e)}", False


# =============================================================================
# READ OPERATIONS
# =============================================================================

def _execute_mission_info(entities: dict, context: SessionContext) -> Tuple[str, bool]:
    """Get mission information."""
    from .tools.generic import get_mission_info
    
    mission_name = entities.get("mission_name") or context.current_mission
    if not mission_name:
        return "¿De qué misión quieres los detalles? Dime el nombre.", False
    
    result = get_mission_info.invoke(mission_name)
    
    context.update_mission(mission_name)
    context.last_intent = "get_mission_info"
    
    return result, True


def _execute_mission_objects(entities: dict, context: SessionContext) -> Tuple[str, bool]:
    """Get objects from a mission."""
    from .tools.generic import get_mission_objects
    
    mission_name = entities.get("mission_name") or context.current_mission
    if not mission_name:
        return "¿De qué misión quieres ver los objetos? Dime el nombre.", False
    
    result = get_mission_objects.invoke(mission_name)
    
    context.update_mission(mission_name)
    context.last_intent = "get_mission_objects"
    
    object_names = re.findall(r'\*\*([^*]+)\*\*', result)
    if object_names:
        context.update_objects(object_names)
    
    return result, True


def _execute_object_image(entities: dict, context: SessionContext) -> Tuple[str, bool]:
    """Get image of an object."""
    from .tools.image import search_object_with_image
    
    object_name = entities.get("object_name")
    if not object_name:
        if context.current_objects:
            return f"¿Cuál imagen quieres ver? Objetos disponibles: {', '.join(context.current_objects[:5])}", False
        return "¿De qué objeto quieres ver la imagen?", False
    
    result = search_object_with_image.invoke(object_name)
    
    context.add_object(object_name)
    context.last_intent = "get_object_image"
    
    return result, True


def _execute_object_details(entities: dict, context: SessionContext) -> Tuple[str, bool]:
    """Get detailed information about an object."""
    from .tools.generic import get_object_descriptions
    
    object_name = entities.get("object_name")
    if not object_name:
        return "¿De qué objeto quieres más detalles?", False
    
    result = get_object_descriptions.invoke(object_name)
    
    context.add_object(object_name)
    context.last_intent = "get_object_details"
    
    return result, True


def _execute_list_missions(context: SessionContext) -> Tuple[str, bool]:
    """List available missions."""
    from .tools.generic import query_data
    
    result = query_data.invoke({"table": "misiones", "filter_field": "", "filter_value": ""})
    
    context.last_intent = "list_missions"
    
    return result, True


# =============================================================================
# MUTATION OPERATIONS
# =============================================================================

def _execute_update_object(entities: dict, context: SessionContext) -> Tuple[str, bool]:
    """Update an object field."""
    from .tools.mutations import update_object
    
    object_name = entities.get("object_name") or (context.current_objects[0] if context.current_objects else None)
    field = entities.get("field")
    new_value = entities.get("new_value")
    
    if not object_name:
        return "¿Qué objeto quieres actualizar?", False
    if not field or not new_value:
        return f"¿Qué campo de **{object_name}** quieres cambiar y a qué valor?", False
    
    result = update_object.invoke({"object_name": object_name, "field": field, "new_value": new_value})
    
    context.last_intent = "update_object"
    
    return result, True


def _execute_delete_object(entities: dict, context: SessionContext) -> Tuple[str, bool]:
    """Delete an object (with confirmation)."""
    from .tools.mutations import delete_object
    
    object_name = entities.get("object_name")
    if not object_name:
        return "¿Qué objeto quieres eliminar?", False
    
    # Store pending deletion in context
    context.pending_delete = object_name
    
    result = delete_object.invoke({"object_name": object_name, "confirm": False})
    
    context.last_intent = "delete_object"
    
    return result, True


def _execute_confirm_delete(entities: dict, context: SessionContext) -> Tuple[str, bool]:
    """Confirm a pending deletion."""
    from .tools.mutations import delete_object
    
    object_name = getattr(context, 'pending_delete', None)
    if not object_name:
        return "No hay eliminación pendiente.", False
    
    result = delete_object.invoke({"object_name": object_name, "confirm": True})
    
    context.pending_delete = None
    context.last_intent = "confirm_delete"
    
    return result, True


def _execute_create_object(entities: dict, context: SessionContext) -> Tuple[str, bool]:
    """Create a new object."""
    from .tools.mutations import create_object
    
    name = entities.get("object_name")
    obj_type = entities.get("object_type", "general")
    mission_name = entities.get("mission_name") or context.current_mission
    description = entities.get("description", "")
    
    if not name:
        return "¿Cómo se llama el nuevo objeto?", False
    if not mission_name:
        return f"¿En qué misión quieres crear el objeto **{name}**?", False
    
    result = create_object.invoke({
        "name": name, 
        "object_type": obj_type, 
        "mission_name": mission_name,
        "description": description
    })
    
    context.add_object(name)
    context.last_intent = "create_object"
    
    return result, True


def _execute_update_mission(entities: dict, context: SessionContext) -> Tuple[str, bool]:
    """Update mission status or fields."""
    from .tools.mutations import update_mission_status
    
    mission_name = entities.get("mission_name") or context.current_mission
    new_status = entities.get("new_status", entities.get("new_value"))
    
    if not mission_name:
        return "¿Qué misión quieres actualizar?", False
    if not new_status:
        return f"¿A qué estado quieres cambiar la misión **{mission_name}**? (activa, completada, pausada)", False
    
    result = update_mission_status.invoke({"mission_name": mission_name, "new_status": new_status})
    
    context.last_intent = "update_mission"
    
    return result, True


# =============================================================================
# COMPARISON OPERATIONS
# =============================================================================

def _execute_compare_items(entities: dict, context: SessionContext) -> Tuple[str, bool]:
    """
    Compare items using LLM to generate a markdown table.
    Works for both database items and general knowledge comparisons.
    """
    from langchain_ollama import ChatOllama
    from app.api.deps import get_supabase_client
    
    supabase = get_supabase_client()
    
    # Get mission names from context or entities
    mission_names = []
    if entities.get("mission_name"):
        # Try to extract multiple names (e.g., "Prueba 10 y Prueba 5")
        names_str = entities["mission_name"]
        # Split by common conjunctions
        for sep in [' y ', ' vs ', ' versus ', ' con ']:
            if sep in names_str.lower():
                parts = re.split(sep, names_str, flags=re.IGNORECASE)
                mission_names = [p.strip() for p in parts if p.strip()]
                break
        if not mission_names:
            mission_names = [names_str]
    
    # Try to fetch data from database if we have mission names
    db_data = []
    if mission_names:
        for name in mission_names[:5]:  # Limit to 5
            try:
                result = supabase.from_("misiones").select("*").ilike("titulo", f"%{name}%").limit(1).execute()
                if result.data:
                    db_data.append(result.data[0])
            except:
                pass
    
    # Use LLM to generate comparison
    llm = ChatOllama(model="mistral:7b", temperature=0.3)
    
    if db_data and len(db_data) >= 2:
        # We have DB data - format it into a comparison table
        items_info = "\n".join([
            f"- {m.get('titulo', 'Sin nombre')}: Estado={m.get('estado', 'N/A')}, " +
            f"Descripción={m.get('descripcion', 'N/A') or 'Sin descripción'}, " +
            f"Zona={m.get('zona_objetivo', 'N/A') or 'No especificada'}, " +
            f"Creado={str(m.get('created_at', 'N/A'))[:10]}"
            for m in db_data
        ])
        
        titles = [m.get('titulo', f'Misión {i+1}') for i, m in enumerate(db_data)]
        
        prompt = f"""Eres KEPLER, asistente de exploración. Genera una comparativa clara y útil.

DATOS DE LAS MISIONES:
{items_info}

RESPONDE CON ESTE FORMATO:

## 📊 Comparativa de Misiones

(1 línea de introducción mencionando las misiones que se comparan)

| Propiedad | {' | '.join(titles)} |
|-----------|{'|'.join(['---' for _ in titles])}|
| Estado | (valores reales) |
| Zona/Objetivo | (valores reales) |
| Fecha de Inicio | (valores reales) |
| Descripción | (resumen breve) |

### Conclusión
(2-3 líneas analizando las diferencias principales y cuál podría ser mejor para ciertos objetivos)

Usa los datos proporcionados. En español."""

    else:
        # No DB data - general comparison request
        topic = entities.get('mission_name', 'comparación general')
        
        prompt = f"""Eres KEPLER, un asistente experto en exploración espacial y ciencia planetaria.

El usuario pregunta: "{topic}"

Genera una respuesta informativa con este formato:

## 📊 Comparativa: [Tema]

(1-2 líneas introduciendo el tema de comparación)

| Característica | Elemento 1 | Elemento 2 |
|----------------|------------|------------|
| (propiedad relevante) | (valor) | (valor) |
| (propiedad relevante) | (valor) | (valor) |
| (propiedad relevante) | (valor) | (valor) |
| (propiedad relevante) | (valor) | (valor) |

### Análisis
(2-3 líneas con conclusiones útiles sobre la comparación)

Usa información real y precisa. Responde en español."""

    try:
        response = llm.invoke(prompt)
        output = response.content
        
        # Ensure we have a proper table format
        if '|' not in output:
            output = "No pude generar una tabla comparativa. Por favor especifica qué elementos quieres comparar (ej: 'Compara la misión Prueba 1 con Prueba 5')."
        
        context.last_intent = "compare_items"
        return output, True
        
    except Exception as e:
        return f"Error al generar comparación: {str(e)}", False
