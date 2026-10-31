# Cortex AI Agent - Sistema KEPLER

## 🧠 ¿Qué es Cortex?

**Cortex** es la Inteligencia Artificial auxiliar y narrativa del ecosistema de exploración KEPLER. Está diseñada para actuar como el "copiloto" analítico del explorador, brindando contexto narrativo, reportes, sugerencias tácticas y análisis en tiempo real basados en los datos recopilados durante las misiones.

A nivel técnico, Cortex está impulsado principalmente por **Mistral 7B** (vía `Ollama` / `langchain_ollama`), lo que le permite generar respuestas rápidas, coherentes y con un tono de ciencia ficción/explorador profesional que enriquece la inmersión del usuario.

---

## 🚀 Capacidades y Alcances Actuales

Cortex actualmente tiene visión sobre el estado completo del explorador. Sus capacidades integradas incluyen:

1. **Reportes de Novedades (Daily Briefs):**
   - **Clima y Estado Físico:** Cortex analiza la resistencia actual del explorador, el desgaste de su equipamiento (calzado) y las condiciones climáticas de su ubicación.
   - **Análisis de Hallazgos:** Lee la base de datos de los objetos descubiertos recientemente, extrayendo nombres, descripciones y rarezas para documentarlos en el reporte.
   - **Sugerencias de Exploración:** Basado en el desgaste, el clima y los puntos de interés de alto riesgo cercanos, Cortex recomienda si es un buen día para salir a terreno nuevo, o si es mejor descansar y categorizar los hallazgos en la base de datos.
   - **Endpoint:** `GET /api/ai/report`

2. **Generación de Tips Contextuales (Frontend):**
   - El dashboard genera de forma local tips de supervivencia y exploración imitando la voz de Cortex, reaccionando a variables locales (como si los zapatos tienen más de 50% de desgaste o la resistencia está baja).

3. **Inferencia Visual (Clasificación de Objetos):**
   - Mediante un modelo secundario de visión (como Moondream o el módulo de Inferencia integrado), el sistema asiste nombrando y clasificando biológicamente o geológicamente los hallazgos escaneados por la cámara del explorador.

4. **Identificación y Descripción de Zonas:**
   - Cortex recibe coordenadas GPS de misiones nuevas, hace geocodificación inversa y utiliza Mistral para generar descripciones narrativas inmersivas (clima, flora, terreno) del área que el explorador está pisando.

---

## 🛠️ ¿Cómo integrar a Cortex en nuevos módulos?

Cortex está diseñado para ser modular. Para añadir una nueva funcionalidad analizada por Cortex en cualquier parte del sistema KEPLER:

### 1. Backend (Python/FastAPI)
Para crear un nuevo reporte o análisis de Cortex en el backend, debes usar `ChatOllama` de Langchain:

```python
from langchain_ollama import ChatOllama

# 1. Instanciar el modelo con temperatura baja para respuestas lógicas y concisas
cortex_llm = ChatOllama(model="mistral:7b", temperature=0.3)

# 2. Recolectar datos del contexto (Supabase, variables de estado, etc.)
contexto = "..." 

# 3. Diseñar el Prompt de Cortex
prompt = f"""
Actúa como 'Cortex', la Inteligencia Artificial auxiliar del ecosistema KEPLER.
Genera un análisis táctico sobre lo siguiente:
{contexto}
Mantén un tono profesional, científico y directo.
"""

# 4. Invocar el modelo
response = cortex_llm.invoke(prompt)
resultado = response.content
```

### 2. Frontend (React/Vanilla JS)
Para mostrar un mensaje de Cortex en la interfaz, sigue el patrón de diseño estético del dashboard:

1. **Usa Markdown:** Cortex genera respuestas estructuradas en Markdown. Usa la librería `marked.js` (`window.marked.parse(reporte)`) para renderizar subtítulos, listas y negritas.
2. **Caché de Respuesta:** Mistral toma entre 5 a 15 segundos en generar una respuesta completa. **Siempre** guarda la respuesta de Cortex en `sessionStorage` para evitar regenerarla en cada click, a menos que el contexto cambie (por ejemplo, iniciar una nueva misión).
3. **Indicadores de Carga:** Siempre muestra el "Spinner" o estado de *Cortex procesando datos* mientras esperas el `fetch()`.

```javascript
// Ejemplo del Loader Oficial de Cortex
<div style="text-align:center; padding: 40px 20px;">
    <div style="margin:0 auto 15px auto; width:30px; height:30px; border:3px solid rgba(63,168,255,0.2); border-top-color:#3FA8FF; border-radius:50%; animation:spin 1s linear infinite;"></div>
    <p style="color:#3FA8FF; font-weight:600; font-size:1.1rem; margin-bottom:5px;">Cortex procesando datos...</p>
</div>
```

---

## 🔮 Futuras Expansiones a considerar

¿Qué más podría hacer Cortex si lo integramos más profundamente?

- **Alertas Predictivas:** Cortex podría enviar notificaciones push o websockets si el clima en las coordenadas del jugador cambia abruptamente a lluvia fuerte.
- **Diario de a Bordo (Lore Auto-generado):** Sintetizar todas las misiones de la semana en una sola página de "Bitácora del Explorador", dándole al usuario un diario narrativo de sus aventuras reales.
- **Matchmaking / Multiplayer Asíncrono:** Si Juan y María exploraron la misma "Zona", Cortex podría notificar a Juan: *"El explorador Maria reportó un objeto Raro a 500m de tu posición hace 2 días."*
- **Gamificación Dinámica:** Cortex podría sugerir "Misiones Secundarias" inventadas en el momento (ej. "La humedad está al 80%, busca especímenes de hongos en este parque").
