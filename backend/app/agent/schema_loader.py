"""
Schema Loader
Dynamically discovers and caches database schema from Supabase.
Enables the AI to understand any table without hardcoded tools.
"""
import os
from typing import Dict, List, Any
from functools import lru_cache
from supabase import create_client

# Known tables to introspect (add new tables here as they're created)
KNOWN_TABLES = [
    "misiones",
    "objetos_exploracion",
    "profiles",
    "chat_logs",
]

# Human-readable descriptions for each table
TABLE_DESCRIPTIONS = {
    "misiones": "Misiones de exploración (viajes). Campos clave: titulo, zona_geografica, estado, user_id",
    "objetos_exploracion": "Objetos detectados/registrados. Campos clave: nombre, tipo, descripcion, mission_id, user_id",
    "profiles": "Perfiles de usuarios. Campos clave: full_name, email",
    "chat_logs": "Historial de conversaciones. Campos clave: messages, user_id",
}


def get_admin_client():
    """Get Supabase admin client."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    if not url or not key:
        raise RuntimeError("Missing SUPABASE_URL or key")
    return create_client(url, key)


@lru_cache(maxsize=1)
def load_database_schema() -> Dict[str, Dict[str, Any]]:
    """
    Loads database schema by introspecting known tables.
    Results are cached for performance.
    
    Returns:
        Dict with table names as keys and column info as values.
    """
    schema = {}
    client = get_admin_client()
    
    for table in KNOWN_TABLES:
        try:
            # Get sample row to infer column names
            result = client.table(table).select("*").limit(1).execute()
            
            if result.data:
                columns = list(result.data[0].keys())
            else:
                # No data, try to get columns another way
                columns = ["id", "created_at"]  # Fallback
            
            schema[table] = {
                "columns": columns,
                "description": TABLE_DESCRIPTIONS.get(table, f"Tabla {table}")
            }
        except Exception as e:
            print(f"[Schema] Error loading {table}: {e}")
            schema[table] = {
                "columns": [],
                "description": f"Error loading {table}"
            }
    
    return schema


def get_schema_summary() -> str:
    """
    Generates a human-readable schema summary for the AI prompt.
    
    Returns:
        String with table descriptions and key columns.
    """
    schema = load_database_schema()
    
    lines = ["TABLAS DISPONIBLES:"]
    for table, info in schema.items():
        cols = ", ".join(info["columns"][:8])  # Limit to 8 columns for brevity
        if len(info["columns"]) > 8:
            cols += ", ..."
        lines.append(f"  • {table}: {info['description']}")
        lines.append(f"    Columnas: [{cols}]")
    
    return "\n".join(lines)


def clear_schema_cache():
    """Force reload of schema on next access."""
    load_database_schema.cache_clear()


def add_table(table_name: str, description: str = None):
    """
    Register a new table for schema discovery.
    Call this when adding new modules/tables.
    """
    if table_name not in KNOWN_TABLES:
        KNOWN_TABLES.append(table_name)
        if description:
            TABLE_DESCRIPTIONS[table_name] = description
        clear_schema_cache()
