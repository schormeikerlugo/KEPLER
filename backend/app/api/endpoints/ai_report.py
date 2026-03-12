from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Dict, Any, Optional
from app.api.deps import get_current_user, get_supabase_client
from app.api.endpoints.explorer_stats import get_explorer_stats
from langchain_ollama import ChatOllama
import json

router = APIRouter()
llm = ChatOllama(model="mistral:7b", temperature=0.3)

@router.get("/report")
async def generate_ai_report(
    lat: Optional[float] = Query(None, description="Explorer latitude"),
    lng: Optional[float] = Query(None, description="Explorer longitude"),
    user=Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Generates a personalized AI report (weather, recent findings, exploration suggestions)
    using Mistral 7B, based on the user's recent data from Supabase.
    """
    supabase = get_supabase_client()
    user_id = user.id

    try:
        # 1. Get Explorer Stats (includes weather and location)
        stats = await get_explorer_stats(lat, lng, user)
        weather = stats.get("weather") or {}
        location_name = weather.get("location_name", "Zona Desconocida")
        clima_str = f"{weather.get('temperatura_c', 'N/A')}°C, {weather.get('categoria', stats.get('clima_actual'))}"

        # 2. Get recent objects
        objects_res = supabase.table("objetos_exploracion") \
            .select("nombre, tipo, descripcion") \
            .eq("user_id", user_id) \
            .order("created_at", desc=True) \
            .limit(5) \
            .execute()
        objects = objects_res.data or []
        
        objects_str = "No hay hallazgos recientes."
        if objects:
            objects_str = "\n".join([f"- {o.get('tipo', 'Objeto')}: {o.get('nombre', 'Sin nombre')} ({o.get('descripcion', 'Sin clasificar')})" for o in objects])

        # 3. Get recent missions
        missions_res = supabase.table("misiones") \
            .select("zona_geografica, estado") \
            .eq("user_id", user_id) \
            .order("inicio_at", desc=True) \
            .limit(3) \
            .execute()
        missions = [m.get("zona_geografica") for m in (missions_res.data or []) if m.get("zona_geografica")]
        missions_str = ", ".join(missions) if missions else "Ninguna registrada recientemente."

        # 4. Get dangerous POIs
        pois_res = supabase.table("puntos_interes") \
            .select("nombre, zona, nivel_riesgo") \
            .eq("user_id", user_id) \
            .in_("nivel_riesgo", ["alto", "critico"]) \
            .limit(3) \
            .execute()
        pois = pois_res.data or []
        pois_str = "\n".join([f"- {p['nombre']} en {p.get('zona', 'zona desconocida')} (Riesgo: {p['nivel_riesgo']})" for p in pois])
        if not pois_str: pois_str = "No se detectan zonas de alto riesgo cercanas."

        # 5. Build prompt for Mistral
        prompt = f"""
Actúa como 'Cortex', la Inteligencia Artificial auxiliar del ecosistema de exploración KEPLER.
Genera un 'Reporte de Novedades' conciso, estructurado e inmersivo (tono táctico/científico) para el explorador.

DATOS DEL EXPLORADOR:
- Ubicación explorada: {location_name}
- Clima actual en su zona: {clima_str}
- Resistencia física: {stats.get('resistencia')}%
- Estado del equipo/calzado: {100 - stats.get('desgaste_calzado', 0)}%

HALLAZGOS RECIENTES:
{objects_str}

ZONAS DE RIESGO CERCANAS:
{pois_str}

ZONAS EXPLORADAS RECIENTEMENTE:
{missions_str}

TAREA:
Genera un reporte corto organizado EXACTAMENTE en estas 3 secciones con formato Markdown (usar viñetas cortas):

### 🌤️ Lecturas del Tiempo y Estado
(Analiza brevemente el clima y cómo la resistencia/equipo del explorador se adapta a ello).

### 🔍 Noticias sobre Hallazgos
(Resume los descubrimientos recientes y su rareza. Si no hay, motiva a buscar).

### 🗺️ Sugerencia de Exploración
(Recomienda qué hacer hoy considerando el equipo, el clima y las zonas de riesgo. Sugiere explorar una zona nueva si las recientes ya fueron cubiertas, o priorizar documentar si el equipo está desgastado).

IMPORTANTE: Sé directo, profesional, inmersivo (estilo explorador/sci-fi) y no inventes datos fuera del contexto dado. Mantén cada sección en 2-3 líneas máximo.
"""
        # Call Mistral via langchain_ollama
        response = llm.invoke(prompt)
        
        return {
            "status": "success",
            "report": response.content if hasattr(response, 'content') else str(response)
        }

    except Exception as e:
        print(f"[AI Report] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
