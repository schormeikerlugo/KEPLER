"""
Taxonomía API - Endpoints para gestión de categorías, subcategorías y etiquetas
Mars-Sight AR
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from supabase import create_client
import os

router = APIRouter()

# ============================================
# Helpers
# ============================================

def get_supabase():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    return create_client(url, key) if url and key else None

# ============================================
# Models
# ============================================

class CategoriaCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    color: Optional[str] = "#3498db"
    icono: Optional[str] = "folder"

class CategoriaUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    color: Optional[str] = None
    icono: Optional[str] = None

class SubcategoriaCreate(BaseModel):
    categoria_id: str
    nombre: str
    descripcion: Optional[str] = None

class EtiquetaCreate(BaseModel):
    nombre: str
    color: Optional[str] = "#2ecc71"

class AsignarTaxonomia(BaseModel):
    categoria_id: Optional[str] = None
    subcategoria_id: Optional[str] = None
    etiqueta_ids: Optional[List[str]] = None

# ============================================
# Categorías
# ============================================

@router.get("/categorias")
async def list_categorias():
    """Listar todas las categorías con conteo de objetos"""
    try:
        supabase = get_supabase()
        if not supabase:
            return []
        
        res = supabase.table("categorias").select("*").order("orden").execute()
        return res.data if res.data else []
    except Exception as e:
        print(f"Error listing categorias: {e}")
        return []

@router.get("/categorias/{categoria_id}")
async def get_categoria(categoria_id: str):
    """Obtener una categoría con sus subcategorías"""
    try:
        supabase = get_supabase()
        if not supabase:
            raise HTTPException(status_code=500, detail="DB Error")
        
        # Get categoria
        cat = supabase.table("categorias").select("*").eq("id", categoria_id).single().execute()
        
        # Get subcategorias
        subcats = supabase.table("subcategorias").select("*").eq("categoria_id", categoria_id).execute()
        
        return {
            **cat.data,
            "subcategorias": subcats.data if subcats.data else []
        }
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/categorias")
async def create_categoria(data: CategoriaCreate):
    """Crear nueva categoría"""
    try:
        supabase = get_supabase()
        if not supabase:
            return {"success": False, "error": "DB Error"}
        
        res = supabase.table("categorias").insert({
            "nombre": data.nombre,
            "descripcion": data.descripcion,
            "color": data.color,
            "icono": data.icono
        }).execute()
        
        if res.data:
            return {"success": True, "data": res.data[0]}
        return {"success": False, "error": "Insert failed"}
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.put("/categorias/{categoria_id}")
async def update_categoria(categoria_id: str, data: CategoriaUpdate):
    """Actualizar categoría"""
    try:
        supabase = get_supabase()
        if not supabase:
            return {"success": False, "error": "DB Error"}
        
        update_data = {k: v for k, v in data.dict().items() if v is not None}
        
        res = supabase.table("categorias").update(update_data).eq("id", categoria_id).execute()
        
        if res.data:
            return {"success": True, "data": res.data[0]}
        return {"success": False, "error": "Update failed"}
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.delete("/categorias/{categoria_id}")
async def delete_categoria(categoria_id: str):
    """Eliminar categoría (cascade elimina subcategorías)"""
    try:
        supabase = get_supabase()
        if not supabase:
            return {"success": False, "error": "DB Error"}
        
        supabase.table("categorias").delete().eq("id", categoria_id).execute()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}

# ============================================
# Subcategorías
# ============================================

@router.get("/subcategorias/{categoria_id}")
async def list_subcategorias(categoria_id: str):
    """Listar subcategorías de una categoría"""
    try:
        supabase = get_supabase()
        if not supabase:
            return []
        
        res = supabase.table("subcategorias").select("*").eq("categoria_id", categoria_id).order("nombre").execute()
        return res.data if res.data else []
    except Exception as e:
        print(f"Error listing subcategorias: {e}")
        return []

@router.post("/subcategorias")
async def create_subcategoria(data: SubcategoriaCreate):
    """Crear nueva subcategoría"""
    try:
        supabase = get_supabase()
        if not supabase:
            return {"success": False, "error": "DB Error"}
        
        res = supabase.table("subcategorias").insert({
            "categoria_id": data.categoria_id,
            "nombre": data.nombre,
            "descripcion": data.descripcion
        }).execute()
        
        if res.data:
            return {"success": True, "data": res.data[0]}
        return {"success": False, "error": "Insert failed"}
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.delete("/subcategorias/{subcategoria_id}")
async def delete_subcategoria(subcategoria_id: str):
    """Eliminar subcategoría"""
    try:
        supabase = get_supabase()
        if not supabase:
            return {"success": False, "error": "DB Error"}
        
        supabase.table("subcategorias").delete().eq("id", subcategoria_id).execute()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}

# ============================================
# Etiquetas
# ============================================

@router.get("/etiquetas")
async def list_etiquetas():
    """Listar todas las etiquetas ordenadas por uso"""
    try:
        supabase = get_supabase()
        if not supabase:
            return []
        
        res = supabase.table("etiquetas").select("*").order("uso_count", desc=True).execute()
        return res.data if res.data else []
    except Exception as e:
        print(f"Error listing etiquetas: {e}")
        return []

@router.post("/etiquetas")
async def create_etiqueta(data: EtiquetaCreate):
    """Crear nueva etiqueta"""
    try:
        supabase = get_supabase()
        if not supabase:
            return {"success": False, "error": "DB Error"}
        
        res = supabase.table("etiquetas").insert({
            "nombre": data.nombre,
            "color": data.color
        }).execute()
        
        if res.data:
            return {"success": True, "data": res.data[0]}
        return {"success": False, "error": "Insert failed"}
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.delete("/etiquetas/{etiqueta_id}")
async def delete_etiqueta(etiqueta_id: str):
    """Eliminar etiqueta"""
    try:
        supabase = get_supabase()
        if not supabase:
            return {"success": False, "error": "DB Error"}
        
        supabase.table("etiquetas").delete().eq("id", etiqueta_id).execute()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}

# ============================================
# Asignación de Taxonomía a Objetos
# ============================================

@router.post("/objetos/{objeto_id}/asignar")
async def asignar_taxonomia(objeto_id: str, data: AsignarTaxonomia):
    """Asignar categoría, subcategoría y etiquetas a un objeto"""
    try:
        supabase = get_supabase()
        if not supabase:
            return {"success": False, "error": "DB Error"}
        
        # Update categoria and subcategoria
        update_data = {}
        if data.categoria_id:
            update_data["categoria_id"] = data.categoria_id
        if data.subcategoria_id:
            update_data["subcategoria_id"] = data.subcategoria_id
        
        if update_data:
            supabase.table("objetos_exploracion").update(update_data).eq("id", objeto_id).execute()
        
        # Handle etiquetas (many-to-many)
        if data.etiqueta_ids is not None:
            # Remove existing
            supabase.table("objeto_etiquetas").delete().eq("objeto_id", objeto_id).execute()
            
            # Add new
            for etiqueta_id in data.etiqueta_ids:
                supabase.table("objeto_etiquetas").insert({
                    "objeto_id": objeto_id,
                    "etiqueta_id": etiqueta_id
                }).execute()
                
                # Increment usage count
                supabase.rpc("increment_etiqueta_uso", {"tag_id": etiqueta_id}).execute()
        
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.get("/objetos/{objeto_id}/taxonomia")
async def get_objeto_taxonomia(objeto_id: str):
    """Obtener taxonomía de un objeto"""
    try:
        supabase = get_supabase()
        if not supabase:
            return {}
        
        # Get object with categoria and subcategoria
        obj = supabase.table("objetos_exploracion").select(
            "categoria_id, subcategoria_id"
        ).eq("id", objeto_id).single().execute()
        
        # Get etiquetas
        tags = supabase.table("objeto_etiquetas").select(
            "etiqueta_id, etiquetas(id, nombre, color)"
        ).eq("objeto_id", objeto_id).execute()
        
        return {
            "categoria_id": obj.data.get("categoria_id") if obj.data else None,
            "subcategoria_id": obj.data.get("subcategoria_id") if obj.data else None,
            "etiquetas": [t.get("etiquetas") for t in tags.data] if tags.data else []
        }
    except Exception as e:
        print(f"Error getting taxonomia: {e}")
        return {}
