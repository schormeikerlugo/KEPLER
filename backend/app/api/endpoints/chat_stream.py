"""
Chat Streaming Endpoint
Server-Sent Events (SSE) for real-time AI response streaming
"""
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, AsyncGenerator
import json
import asyncio
import os
from supabase import create_client
from app.api.deps import get_current_user, security
from fastapi.security import HTTPAuthorizationCredentials

router = APIRouter()

def get_supabase():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
    return create_client(url, key) if url and key else None

class StreamChatRequest(BaseModel):
    message: str
    context: str = ""
    chat_id: Optional[str] = None
    history: Optional[list] = None  # In-session history from frontend


async def save_chat_to_db(
    user_id: str,
    chat_id: Optional[str],
    messages: list,
    token_credentials: str
) -> str:
    """
    Save or update chat history in database.
    Returns the chat_id (new or existing).
    """
    try:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
        if not url or not key:
            return chat_id or ""
        
        supabase = create_client(url, key)
        
        if chat_id:
            # Update existing chat
            supabase.table("chat_logs").update({
                "messages": messages,
                "updated_at": "now()"
            }).eq("id", chat_id).execute()
            return chat_id
        else:
            # Generate Smart Title for new chat
            import ollama
            import asyncio
            
            first_msg = messages[0]['content'] if messages else "Nueva conversación"
            title = first_msg[:30] + "..."
            
            try:
                title_prompt = f"""Genera un título muy corto EN ESPAÑOL (máximo 4 palabras) para esta conversación que empieza con: '{first_msg}'.

IMPORTANTE: Empieza el título con un emoji relevante según el tema:
- 🔬 Análisis/Ciencia
- 🗺️ Mapas/Ubicación
- 🚀 Misiones/Exploración
- 💎 Minerales/Recursos
- 📊 Datos/Estadísticas
- ❓ Preguntas generales
- 🛠️ Configuración/Técnico

Responde SOLO con el emoji + título en español, sin comillas."""
                # Use standard model if specific one fails or just use mistral which is likely loaded
                response = await asyncio.to_thread(
                    ollama.chat, 
                    model='mistral:7b',  # Using mistral to match stream chat model and avoid loading delays
                    messages=[{'role': 'user', 'content': title_prompt}]
                )
                title = response['message']['content'].strip().strip('"').strip("'")
            except Exception as e:
                print(f"[Chat] Title generation failed: {e}")
                pass

            # Create new chat
            result = supabase.table("chat_logs").insert({
                "user_id": user_id,
                "title": title,
                "messages": messages
            }).execute()
            if result.data:
                return result.data[0].get("id", "")
            return ""
    except Exception as e:
        print(f"[Chat] Error saving to DB: {e}")
        return chat_id or ""

async def stream_response(
    user_id: str,
    message: str,
    chat_history: list,
    token_credentials: str,
    chat_id: Optional[str] = None
) -> AsyncGenerator[str, None]:
    """
    Async generator that yields SSE events.
    Event types:
    - status: Thinking indicator updates
    - token: Individual text tokens
    - complete: Final message with chat_id
    - error: Error messages
    """
    import ollama
    from langchain_core.messages import HumanMessage, AIMessage
    # Send initial status
    yield f"data: {json.dumps({'type': 'status', 'message': 'Procesando tu mensaje...'})}\n\n"
    await asyncio.sleep(0.1)
    
    try:
        # Import modular components
        from app.agent.session_context import get_session
        from app.agent.intent_detector import (
            detect_intent_with_llm, detect_intent_rules, 
            resolve_entities_with_context, Intent
        )
        from app.agent.tool_executor import execute_tool
        from langchain_ollama import ChatOllama
        
        llm = ChatOllama(model="mistral:7b", temperature=0)
        
        # Get or create session context for this user
        context = get_session(user_id)
        
        yield f"data: {json.dumps({'type': 'status', 'message': 'Analizando mensaje...'})}\n\n"
        await asyncio.sleep(0.1)
        
        # Step 1: Detect intent (try rules first for speed)
        detected = detect_intent_rules(message)
        
        print(f"[DEBUG] Rules detected: {detected.intent}, entities: {detected.entities}, use_context: {detected.use_context}")
        
        # Only call LLM if rules couldn't determine intent at all
        # Skip LLM for clear intents even if use_context is true
        if detected.intent == Intent.GENERAL_CHAT:
            try:
                detected = await asyncio.to_thread(
                    detect_intent_with_llm,
                    message,
                    context.to_summary(),
                    llm
                )
                print(f"[DEBUG] LLM detected: {detected.intent}")
            except Exception as e:
                print(f"[DEBUG] LLM failed: {e}")
                pass  # Keep rule-based result
        
        # Step 2: Resolve entities using context
        detected = resolve_entities_with_context(detected, context)
        
        yield f"data: {json.dumps({'type': 'status', 'message': 'Consultando datos...'})}\n\n"
        
        # Step 3: Execute tool based on intent
        if detected.intent != Intent.GENERAL_CHAT:
            tool_result, success = await asyncio.to_thread(execute_tool, detected, context)
            if tool_result:
                output = tool_result
            else:
                # Tool returned nothing, use LLM
                response = await asyncio.to_thread(
                    llm.invoke,
                    f"Eres KEPLER, asistente de exploración. Responde en español. Usa tablas markdown cuando compares elementos: {message}"
                )
                output = response.content
        else:
            # General chat - use LLM directly
            yield f"data: {json.dumps({'type': 'status', 'message': 'Generando respuesta...'})}\n\n"
            response = await asyncio.to_thread(
                llm.invoke,
                f"Eres KEPLER, un asistente amigable de exploración. Responde en español de forma breve y natural. Si el usuario pide comparar elementos, usa tablas markdown: {message}"
            )
            output = response.content
        
        # Post-process images - convert [KEPLER_IMAGE:id] to actual images
        from app.agent.core import post_process_images
        output = await asyncio.to_thread(post_process_images, output)
        
        # Stream the response token by token
        yield f"data: {json.dumps({'type': 'status', 'message': 'Generando respuesta...'})}\n\n"
        await asyncio.sleep(0.1)
        
        # Simulate streaming by chunking the response
        words = output.split(' ')
        buffer = ""
        for i, word in enumerate(words):
            buffer += word + " "
            # Send every few words for smoother effect
            if i % 3 == 0 or i == len(words) - 1:
                yield f"data: {json.dumps({'type': 'token', 'content': buffer})}\n\n"
                buffer = ""
                await asyncio.sleep(0.05)  # Small delay for visual effect
        
        # Save conversation to database
        updated_history = chat_history + [
            {"role": "user", "content": message},
            {"role": "assistant", "content": output}
        ]
        new_chat_id = await save_chat_to_db(user_id, chat_id, updated_history, token_credentials)
        
        # Send completion event with chat_id for frontend persistence
        yield f"data: {json.dumps({'type': 'complete', 'message': output, 'chat_id': new_chat_id})}\n\n"
        
    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"


@router.post("/stream")
async def chat_stream(
    req: StreamChatRequest,
    user = Depends(get_current_user),
    token: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Stream chat response via Server-Sent Events.
    """
    supabase = get_supabase()
    
    # Prefer in-session history from frontend, fallback to DB
    history_messages = []
    
    if req.history:
        # Use session history from frontend (maintains context during streaming)
        history_messages = req.history
    elif req.chat_id and supabase:
        # Fallback to DB if no session history
        try:
            supabase.postgrest.auth(token.credentials)
            res = supabase.from_("chat_logs").select("*").eq("id", req.chat_id).single().execute()
            if res.data:
                history_messages = res.data.get('messages', [])
        except:
            pass
    
    return StreamingResponse(
        stream_response(user.id, req.message, history_messages, token.credentials, req.chat_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
