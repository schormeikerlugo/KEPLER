"""
Intent Detector - Uses LLM to classify user intent and extract entities.
Supports natural language understanding with context awareness.
"""

import json
import re
from typing import Optional, Dict, Any, Tuple
from dataclasses import dataclass
from enum import Enum


class Intent(Enum):
    """Possible user intents."""
    # Read intents
    GET_MISSION_INFO = "get_mission_info"
    GET_MISSION_OBJECTS = "get_mission_objects"
    GET_OBJECT_IMAGE = "get_object_image"
    GET_OBJECT_DETAILS = "get_object_details"
    LIST_MISSIONS = "list_missions"
    
    # Mutation intents
    UPDATE_OBJECT = "update_object"
    DELETE_OBJECT = "delete_object"
    CREATE_OBJECT = "create_object"
    UPDATE_MISSION = "update_mission"
    CONFIRM_DELETE = "confirm_delete"
    
    # Comparison intent
    COMPARE_ITEMS = "compare_items"
    
    # Other
    GENERAL_CHAT = "general_chat"


@dataclass
class DetectedIntent:
    """Result of intent detection."""
    intent: Intent
    entities: Dict[str, Any]
    use_context: bool = False
    confidence: float = 1.0


def detect_intent_with_llm(
    message: str,
    context_summary: str,
    llm
) -> DetectedIntent:
    """
    Use LLM to detect intent and extract entities from user message.
    
    Args:
        message: User's message
        context_summary: Summary of current context (mission, objects, etc.)
        llm: LangChain LLM instance
    
    Returns:
        DetectedIntent with classified intent and extracted entities
    """
    prompt = f"""Eres un clasificador de intenciones. Analiza el mensaje y responde SOLO con JSON válido.

CONTEXTO ACTUAL: {context_summary}

MENSAJE DEL USUARIO: "{message}"

INTENCIONES POSIBLES:
- get_mission_info: Pide detalles de una misión específica.
- get_mission_objects: Pide ver los objetos de una misión.
- get_object_image: Pide ver la imagen de un objeto.
- get_object_details: Pide información de un objeto.
- list_missions: Pide explícitamente listar misiones o preguntar "qué misiones hay".
- general_chat: Saludo, ayuda, planificación, recomendaciones, preguntas abiertas, "ayúdame con X".

RESPONDE SOLO CON ESTE JSON (sin explicaciones):
{{"intent": "nombre_intent", "mission_name": "nombre o null", "object_name": "nombre o null", "use_context": true/false}}

IMPORTANTE:
- Si pide "ayuda", "planificar", "recomendaciones", o "consejos", ES general_chat.
- SOLO usa list_missions si el usuario pregunta explícitamente "qué misiones hay" o "lista mis misiones".
- Si dice "esta misión", "esa", "la misma", pon use_context: true."""

    try:
        response = llm.invoke(prompt)
        content = response.content.strip()
        
        # Try to extract JSON from response
        json_match = re.search(r'\{[^{}]+\}', content)
        if json_match:
            data = json.loads(json_match.group())
            
            intent_str = data.get("intent", "general_chat")
            try:
                intent = Intent(intent_str)
            except ValueError:
                intent = Intent.GENERAL_CHAT
            
            return DetectedIntent(
                intent=intent,
                entities={
                    "mission_name": data.get("mission_name"),
                    "object_name": data.get("object_name")
                },
                use_context=data.get("use_context", False)
            )
    except Exception as e:
        print(f"[IntentDetector] LLM error: {e}")
    
    # Fallback to rule-based detection
    return detect_intent_rules(message)


def detect_intent_rules(message: str) -> DetectedIntent:
    """
    Fallback rule-based intent detection.
    Used when LLM fails or for quick classification.
    """
    msg = message.lower()
    
    # Patterns for each intent
    patterns = {
        # Read patterns
        Intent.GET_MISSION_INFO: [
            r'detalles?\s+(?:de\s+)?(?:la\s+)?misi[oó]n',
            r'info(?:rmaci[oó]n)?\s+(?:de\s+)?(?:la\s+)?misi[oó]n',
            r'cu[aá]l\s+es\s+la\s+misi[oó]n',
            r'estado\s+(?:de\s+)?(?:la\s+)?misi[oó]n',
        ],
        Intent.GET_MISSION_OBJECTS: [
            r'objetos?\s+(?:de\s+)?(?:esta|esa|la)?\s*misi[oó]n',
            r'qu[eé]\s+objetos',
            r'muestra(?:me)?\s+(?:los\s+)?objetos',
            r'listar?\s+objetos',
            r'ver\s+(?:los\s+)?objetos',
        ],
        Intent.GET_OBJECT_IMAGE: [
            r'imagen\s+(?:de|del)',
            r'foto\s+(?:de|del)',
            r'mu[eé]stra(?:me)?\s+(?:la\s+)?imagen',
            r'ver\s+(?:la\s+)?imagen',
            r'c[oó]mo\s+se\s+ve',
            r'mu[eé]sta(?:me)?\s+esa\s+imagen',
            r',\s*mu[eé]sta(?:me)?\s+(?:esa\s+)?imagen',
            r'esa\s+imagen',
            r'quiero\s+ver\s+(?:la\s+)?imagen',
        ],
        Intent.COMPARE_ITEMS: [
            r'compara(?:r)?\s+',
            r'comparaci[oó]n\s+(?:entre|de)',
            r'diferencias?\s+entre',
            r'qu[eé]\s+diferencia',
            r'cu[aá]l\s+es\s+mejor',
            r'versus',
            r'comparativa',
        ],
        Intent.LIST_MISSIONS: [
            r'cu[aá]ntas?\s+misiones',
            r'lista(?:r)?\s+(?:las\s+)?misiones',
            r'qu[eé]\s+misiones\s+(?:hay|tengo)',
            r'mis\s+misiones',
        ],
        
        # Mutation patterns
        Intent.UPDATE_OBJECT: [
            r'cambia(?:r)?\s+(?:el\s+)?(?:tipo|nombre|descripcion)',
            r'actualiza(?:r)?\s+(?:el\s+)?objeto',
            r'modifica(?:r)?\s+(?:el\s+)?objeto',
            r'edita(?:r)?\s+(?:el\s+)?objeto',
            r'(?:el\s+)?tipo\s+(?:de\s+)?\w+\s+(?:a|por)',
        ],
        Intent.DELETE_OBJECT: [
            r'elimina(?:r)?\s+(?:el\s+)?objeto',
            r'borra(?:r)?\s+(?:el\s+)?objeto',
            r'quita(?:r)?\s+(?:el\s+)?objeto',
            r'remueve\s+(?:el\s+)?objeto',
        ],
        Intent.CREATE_OBJECT: [
            r'crea(?:r)?\s+(?:un\s+)?(?:nuevo\s+)?objeto',
            r'agrega(?:r)?\s+(?:un\s+)?objeto',
            r'a[ñn]ade\s+(?:un\s+)?objeto',
            r'nuevo\s+objeto',
        ],
        Intent.UPDATE_MISSION: [
            r'(?:marca|cambia|pon)\s+(?:la\s+)?misi[oó]n\s+(?:como\s+)?(?:completada|activa|pausada)',
            r'(?:finaliza|completa)\s+(?:la\s+)?misi[oó]n',
            r'cambia(?:r)?\s+(?:el\s+)?estado\s+(?:de\s+)?(?:la\s+)?misi[oó]n',
            r'actualiza(?:r)?\s+(?:la\s+)?misi[oó]n',
        ],
        Intent.CONFIRM_DELETE: [
            r's[ií],?\s+elimina',
            r'confirmo?\s+(?:la\s+)?eliminaci[oó]n',
            r'dale,?\s+elimina',
            r's[ií],?\s+borra',
        ],
    }
    
    for intent, intent_patterns in patterns.items():
        for pattern in intent_patterns:
            if re.search(pattern, msg):
                # Extract entities
                entities = extract_entities(msg)
                use_context = any(kw in msg for kw in ['esta', 'esa', 'la misma', 'esa mision', 'esta mision'])
                
                return DetectedIntent(
                    intent=intent,
                    entities=entities,
                    use_context=use_context
                )
    
    return DetectedIntent(
        intent=Intent.GENERAL_CHAT,
        entities={},
        use_context=False
    )


def extract_entities(message: str) -> Dict[str, Optional[str]]:
    """Extract mission, object names, and mutation parameters from message."""
    msg = message.lower()
    original = message  # Keep original for case-sensitive extraction
    
    entities = {
        "mission_name": None, 
        "object_name": None,
        "field": None,
        "new_value": None,
        "object_type": None,
        "new_status": None,
    }
    
    # Extract mission name - be careful with UPDATE_MISSION patterns
    # Exclude status words and command words
    excluded_words = ['de', 'la', 'esta', 'esa', 'como', 'completada', 'activa', 
                      'pausada', 'cancelada', 'finalizada', 'terminada', 'el', 'los']
    
    mission_patterns = [
        # Comparison patterns - capture everything between keywords
        r'compara(?:r)?\s+(?:las?\s+)?(?:misiones?\s+)?([\w\s]+?)\s+(?:y|con|vs)\s+([\w\s]+?)(?:\s*\?|$)',
        r'misi[oó]n\s+["\']?([a-záéíóú0-9\s]+?)["\']?(?:\s+como|\s*\?|$)',
        r'(?:objetos\s+de\s+(?:la\s+)?)?misi[oó]n\s+([a-záéíóú0-9\s]+?)(?:\s*\?|$|,)',
    ]
    for pattern in mission_patterns:
        match = re.search(pattern, msg)
        if match:
            # Check if it's a comparison pattern (has 2 groups)
            if match.lastindex and match.lastindex >= 2:
                # Combine both items for comparison
                name = f"{match.group(1).strip()} y {match.group(2).strip()}"
                entities["mission_name"] = name
                break
            else:
                name = match.group(1).strip()
                # Check if it's not an excluded word
                if name and name.lower() not in excluded_words and len(name) > 2:
                    entities["mission_name"] = name
                    break
    
    # Extract object name
    object_patterns = [
        # "casa de mis padres, muestame" - name before comma
        r'^([a-záéíóúA-Z0-9\s]+?),\s*mu[eé]sta',
        r'(?:objeto|item)\s+([a-záéíóúA-Z0-9\s]+?)(?:\s*\?|$|,|\s+a\s+)',
        r'imagen\s+de(?:l)?:?\s*([a-záéíóúA-Z0-9\s]+?)(?:\s*\?|$)',
        r'elimina(?:r)?\s+(?:el\s+)?(?:objeto\s+)?([A-Z][a-záéíóú0-9]+)',
        r'tipo\s+de\s+([A-Z][a-záéíóú0-9]+)',
        r'de\s+([A-Z][a-záéíóú]+)',  # Capitalized names
    ]
    for pattern in object_patterns:
        match = re.search(pattern, original if '[A-Z]' in pattern or pattern.startswith('^') else msg)
        if match:
            name = match.group(1).strip()
            # Exclude common words
            if name and len(name) > 1 and name.lower() not in ['el', 'la', 'un', 'una', 'esa', 'ese']:
                entities["object_name"] = name
                break
    
    # Extract field to update (tipo, nombre, descripcion)
    field_patterns = [
        (r'(?:el\s+)?tipo\s+', 'tipo'),
        (r'(?:el\s+)?nombre\s+', 'nombre'),
        (r'(?:la\s+)?descripci[oó]n\s+', 'descripcion'),
    ]
    for pattern, field_name in field_patterns:
        if re.search(pattern, msg):
            entities["field"] = field_name
            break
    
    # Extract new_value (after "a" or "por")
    value_patterns = [
        r'(?:tipo|nombre|descripcion)\s+(?:de\s+\w+\s+)?(?:a|por)\s+["\']?([a-záéíóúA-Z0-9\s]+)["\']?',
        r'\s+a\s+["\']?([a-zA-Z0-9]+)["\']?(?:\s*\?|$)',
    ]
    for pattern in value_patterns:
        match = re.search(pattern, msg)
        if match:
            entities["new_value"] = match.group(1).strip()
            break
    
    # Extract object type for creation
    type_patterns = [
        r'(?:de\s+)?tipo\s+["\']?([a-záéíóúA-Z0-9]+)["\']?',
        r'(?:tipo|categoría)\s*[=:]\s*["\']?([a-záéíóúA-Z0-9]+)["\']?',
    ]
    for pattern in type_patterns:
        match = re.search(pattern, msg)
        if match:
            val = match.group(1).strip()
            if val.lower() != 'de':
                entities["object_type"] = val
                break
    
    # Extract new status for missions
    status_keywords = {
        'completada': 'completada',
        'activa': 'activa',
        'pausada': 'pausada',
        'cancelada': 'cancelada',
        'finalizada': 'completada',
        'terminada': 'completada',
    }
    for keyword, status in status_keywords.items():
        if keyword in msg:
            entities["new_status"] = status
            break
    
    return entities


def resolve_entities_with_context(
    detected: DetectedIntent,
    context
) -> DetectedIntent:
    """
    Resolve entities using session context when user says "esta misión", etc.
    
    Args:
        detected: The detected intent with possibly null entities
        context: SessionContext with current mission/objects
    
    Returns:
        DetectedIntent with resolved entities
    """
    if detected.use_context or not detected.entities.get("mission_name"):
        if context.current_mission:
            detected.entities["mission_name"] = context.current_mission
    
    if not detected.entities.get("object_name"):
        if context.current_objects and detected.intent == Intent.GET_OBJECT_IMAGE:
            # Could suggest or use first object, but we'll leave it null
            pass
    
    return detected
