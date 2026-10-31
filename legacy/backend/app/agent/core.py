from langchain_ollama import ChatOllama
from langchain_core.prompts import PromptTemplate
try:
    from langchain.agents import AgentExecutor, create_react_agent
except ImportError:
    from langchain_classic.agents import AgentExecutor, create_react_agent

# Import tools
from app.agent.tools import (
    delete_scan, count_scans,
    get_object_image, search_object_with_image,
    query_data, get_mission_info, get_mission_objects, get_object_descriptions
)
from app.agent.tools.spatial import calculate_distance

# Import dynamic schema
from app.agent.schema_loader import get_schema_summary

# Initialize Mistral 7B model
llm = ChatOllama(model="mistral:7b", temperature=0)

# Define tools
tools = [
    get_mission_info,
    get_mission_objects,
    query_data,
    get_object_descriptions,
    calculate_distance,
    search_object_with_image,
    delete_scan,
    count_scans,
]


def build_react_prompt() -> str:
    """Build ReAct prompt for local models."""
    schema_info = get_schema_summary()
    
    return f"""Eres KEPLER, asistente de exploración. Responde en español.

{schema_info}

Tienes acceso a estas herramientas:
{{tools}}

Nombres de herramientas: {{tool_names}}

IMPORTANTE: 
- Para "detalles de misión X", USA: get_mission_info con el nombre de la misión
- Para "objetos de misión X", USA: get_mission_objects con el nombre de la misión
- Muestra TODO lo que devuelva la herramienta, sin resumir
- Para saludos simples, responde directamente con Final Answer

FORMATO DE RESPUESTA:
- Usa encabezados markdown (## Título) para organizar
- Cuando compares 2+ elementos (misiones, objetos, rutas, distancias), USA TABLAS MARKDOWN:
  | Elemento | Propiedad 1 | Propiedad 2 |
  |----------|-------------|-------------|
  | Item A   | Valor       | Valor       |
  | Item B   | Valor       | Valor       |
- Las tablas hacen la información más clara y profesional

Usa este formato EXACTO:

Question: la pregunta del usuario
Thought: pienso qué hacer
Action: nombre_de_herramienta
Action Input: parámetros
Observation: resultado de la herramienta
... (repite si necesitas más herramientas)
Thought: tengo la respuesta final
Final Answer: respuesta completa al usuario

Question: {{input}}
Thought:{{agent_scratchpad}}"""


# Create ReAct prompt
react_prompt = PromptTemplate.from_template(build_react_prompt())

# Create ReAct agent (works better with local models)
agent = create_react_agent(llm, tools, react_prompt)

# Create Executor
agent_executor = AgentExecutor(
    agent=agent, 
    tools=tools, 
    verbose=True,
    handle_parsing_errors=True,
    max_iterations=5
)


def post_process_images(response: str) -> str:
    """
    Post-process agent response to replace [KEPLER_IMAGE:object_id] placeholders
    with actual base64 image data in markdown format.
    """
    import re
    import os
    from supabase import create_client
    
    # Find all placeholders
    pattern = r'\[KEPLER_IMAGE:([a-f0-9-]+)\]'
    matches = re.findall(pattern, response)
    
    if not matches:
        return response
    
    try:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
        client = create_client(url, key)
        
        for object_id in matches:
            # Fetch image from database
            res = client.table("objetos_exploracion").select(
                "nombre, metadata"
            ).eq("id", object_id).single().execute()
            
            if res.data:
                nombre = res.data.get("nombre", "Objeto")
                metadata = res.data.get("metadata") or {}
                image_data = metadata.get("image_base64")
                
                if image_data:
                    # Replace placeholder with markdown image
                    placeholder = f"[KEPLER_IMAGE:{object_id}]"
                    replacement = f"![{nombre}]({image_data})"
                    response = response.replace(placeholder, replacement)
                else:
                    response = response.replace(f"[KEPLER_IMAGE:{object_id}]", "(imagen no disponible)")
            else:
                response = response.replace(f"[KEPLER_IMAGE:{object_id}]", "(objeto no encontrado)")
    except Exception as e:
        print(f"Image post-process error: {e}")
    
    return response


async def run_agent(user_id: str, user_input: str, chat_history: list = []):
    """
    Runs the agent with the given user context.
    """
    try:
        result = await agent_executor.ainvoke({
            "input": user_input,
            "user_id": user_id,
            "chat_history": chat_history
        })
        
        # Post-process to inject images
        output = result["output"]
        output = post_process_images(output)
        
        return output
    except Exception as e:
        import traceback
        with open("backend_error.log", "a") as f:
            f.write(f"Agent Runtime Error: {str(e)}\n{traceback.format_exc()}\n")
        print(f"Agent Error: {e}")
        return "I encountered an error processing your request."
