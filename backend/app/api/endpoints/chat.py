from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import ollama
import traceback
import os
from supabase import create_client, Client
from app.api.deps import get_current_user, security
from fastapi.security import HTTPAuthorizationCredentials

router = APIRouter()

# --- SUPABASE INIT ---
def get_supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
    if not url or not key:
        # print("Warning: Supabase credentials missing (URL or KEY).") # Non-blocking for Chat logic
        return None
    return create_client(url, key)

# --- OLLAMA INIT ---
# Set OLLAMA_HOST environment variable if not already set, for ollama client to pick up
# Prefer OLLAMA_URL to match .env, fallback to OLLAMA_HOST, then default
OLLAMA_API_URL = os.getenv("OLLAMA_URL") or os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434")
os.environ["OLLAMA_HOST"] = OLLAMA_API_URL
print(f"DEBUG: Using OLLAMA_HOST='{OLLAMA_API_URL}'")

# --- MODELS ---
class ChatRequest(BaseModel):
    message: str
    context: str = "" 
    chat_id: Optional[str] = None # If provided, continues conversation

class ChatResponse(BaseModel):
    response: str
    chat_id: str

# --- ENDPOINTS ---

@router.get("/history")
async def get_chat_history(
    user=Depends(get_current_user),
    token: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Get list of past conversations for the user.
    """
    supabase = get_supabase()
    if not supabase: 
        return []
    supabase.postgrest.auth(token.credentials)
    
    try:
        # Fetch id, title, created_at, text preview
        res = supabase.from_("chat_logs")\
            .select("id, title, created_at, messages")\
            .eq("user_id", user.id)\
            .order("updated_at", desc=True)\
            .execute()
        
        # Summarize for list view
        history = []
        for item in res.data:
            preview = ""
            if item.get('messages') and len(item['messages']) > 0:
                preview = item['messages'][-1].get('content', '')[:50] + "..."
            
            history.append({
                "id": item['id'],
                "title": item['title'],
                "date": item['created_at'],
                "preview": preview
            })
            
        return history
    except Exception as e:
        print(f"History Error: {e}")
        return []

@router.get("/history/{chat_id}")
async def get_chat_details(
    chat_id: str, 
    user=Depends(get_current_user),
    token: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Load specific conversation.
    """
    supabase = get_supabase()
    if not supabase: return None
    supabase.postgrest.auth(token.credentials)

    try:
        res = supabase.from_("chat_logs")\
            .select("*")\
            .eq("id", chat_id)\
            .eq("user_id", user.id)\
            .single()\
            .execute()
        return res.data
    except Exception as e:
        print(f"Load Chat Error: {e}")
        raise HTTPException(status_code=404, detail="Chat not found")

@router.delete("/history/{chat_id}")
async def delete_chat(
    chat_id: str, 
    user=Depends(get_current_user),
    token: HTTPAuthorizationCredentials = Depends(security)
):
    supabase = get_supabase()
    if not supabase: return {"status": "error"}
    supabase.postgrest.auth(token.credentials)

    try:
        supabase.from_("chat_logs").delete().eq("id", chat_id).eq("user_id", user.id).execute()
        return {"status": "deleted"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

class UpdateChatTitleRequest(BaseModel):
    title: str

@router.patch("/history/{chat_id}")
async def update_chat_title(
    chat_id: str, 
    req: UpdateChatTitleRequest, 
    user=Depends(get_current_user),
    token: HTTPAuthorizationCredentials = Depends(security)
):
    supabase = get_supabase()
    if not supabase: return {"status": "error"}
    supabase.postgrest.auth(token.credentials)

    try:
        supabase.from_("chat_logs").update({"title": req.title}).eq("id", chat_id).eq("user_id", user.id).execute()
        return {"status": "updated", "title": req.title}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.post("/")
async def chat_with_llama(
    req: ChatRequest, 
    user=Depends(get_current_user), 
    token: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Chat with Llama 3 + Persistence.
    """
    if not req.message:
        raise HTTPException(status_code=400, detail="Message is required")

    supabase = get_supabase()
    # Authenticate the client with the user's token so RLS policies work!
    if supabase:
        supabase.postgrest.auth(token.credentials)
    
    # 1. Load History Context if chat_id exists
    history_messages = []
    current_chat_data = None
    
    if req.chat_id and supabase:
        try:
            res = supabase.from_("chat_logs").select("*").eq("id", req.chat_id).single().execute()
            if res.data:
                current_chat_data = res.data
                # Convert DB JSON to Ollama format
                raw_msgs = current_chat_data.get('messages', [])
                for m in raw_msgs:
                    history_messages.append({'role': m['role'], 'content': m['content']})
        except:
            pass # Chat might not exist yet or error, treat as new

    # 2. Prepare Prompt
    system_prompt = (
        "Eres 'Llama 3.8', una IA avanzada integrada en el traje espacial 'KEPLER'. "
        "Tu misión es asistir al explorador con información científica, técnica y de supervivencia. "
        "Respuestas concisas, útiles y en español. "
        "Si te preguntan por datos del traje, inventa valores realistas dentro de parámetros seguros."
    )
    
    messages = [{'role': 'system', 'content': system_prompt}]
    
    # Add history (limit last 10 messages for context window efficiency)
    messages.extend(history_messages[-10:])
    
    # Add current context if any
    if req.context:
        messages.append({'role': 'system', 'content': f"Contexto actual del sistema: {req.context}"})
        
    try:
        # 3. Inference via LangChain Agent
        from app.agent.core import run_agent
        from langchain_core.messages import HumanMessage, AIMessage

        # Convert simple history to LangChain objects
        lc_history = []
        for msg in history_messages:
            if msg['role'] == 'user':
                lc_history.append(HumanMessage(content=msg['content']))
            elif msg['role'] == 'assistant':
                lc_history.append(AIMessage(content=msg['content']))

        ai_text = await run_agent(user.id, req.message, lc_history)
        
        # 4. Save to DB (Background-like)
        if supabase and user:
            new_msgs = [
                {'role': 'user', 'content': req.message},
                {'role': 'assistant', 'content': ai_text}
            ]
            
            if current_chat_data:
                # Update existing
                updated_msgs = current_chat_data.get('messages', []) + new_msgs
                update_data = {
                    "messages": updated_msgs,
                    "updated_at": "now()"
                }
                # Maybe update title if it's "New Conversation" and we have content now?
                if current_chat_data.get('title') == 'New Conversation':
                     update_data['title'] = req.message[:30] + "..."

                supabase.from_("chat_logs").update(update_data).eq("id", req.chat_id).execute()
                chat_id = req.chat_id
                
            else:
                # Create New
                # Create New Smart Title with Llama 3
                title_prompt = f"Genera un título muy corto (máximo 4 palabras) para esta conversación que empieza con: '{req.message}'. Solo el título, sin comillas ni prefijos."
                try:
                    title_resp = ollama.chat(model='llama3:8b-instruct-q6_K', messages=[{'role': 'user', 'content': title_prompt}])
                    title = title_resp['message']['content'].strip().strip('"')
                except:
                    title = req.message[:30] + "..."

                res = supabase.from_("chat_logs").insert({
                    "user_id": user.id,
                    "title": title,
                    "messages": new_msgs
                }).execute()
                
                if res.data:
                    chat_id = res.data[0]['id']
                else:
                    chat_id = "temp" # Should not happen

        else:
             chat_id = "local-only"

        return {"response": ai_text, "chat_id": chat_id}
        
    except Exception as e:
        with open("backend_error.log", "a") as f:
            f.write(f"Chat Error: {str(e)}\n{traceback.format_exc()}\n")
        print(f"Ollama Chat Error: {e}")
        return {
            "response": "Error de conexión con el módulo Llama 3.",
            "chat_id": req.chat_id
        }
