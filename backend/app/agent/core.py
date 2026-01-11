from langchain_ollama import ChatOllama
try:
    from langchain.agents import AgentExecutor, create_tool_calling_agent
except ImportError:
    # Support for environments where components are in langchain_classic
    from langchain_classic.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate
from app.agent.tools import (
    read_scans, search_scans_by_label, delete_scan, count_scans,
    adopt_orphans, get_orphan_count, count_global_objects, get_objects_summary
)

# Initialize Llama 3 model
# Ensure 'ollama serve' is running and 'llama3.1' is pulled.
llm = ChatOllama(model="llama3.1", temperature=0)

# Define tools - User tools + Orphan Management + Global Stats
tools = [
    read_scans, search_scans_by_label, delete_scan, count_scans,
    adopt_orphans, get_orphan_count, count_global_objects, get_objects_summary
]

# Define Prompt
prompt = ChatPromptTemplate.from_messages([
    ("system", "You are KEPLER, an advanced AI Assistant for planetary exploration. "
               "You help users analyze their exploration data. "
               "CAPABILITIES: "
               "1. Query the user's OWN objects (read_scans, count_scans, search_scans_by_label). "
               "2. Adopt orphaned objects without owner (adopt_orphans, get_orphan_count). "
               "3. Global statistics (count_global_objects, get_objects_summary). "
               "4. Delete objects with confirmation (delete_scan). "
               "ALWAYS ask for confirmation before destructive actions. "
               "Current User ID: {user_id}"),
    ("placeholder", "{chat_history}"),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

# Construct Agent
agent = create_tool_calling_agent(llm, tools, prompt)

# Create Executor
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

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
        return result["output"]
    except Exception as e:
        import traceback
        with open("backend_error.log", "a") as f:
            f.write(f"Agent Runtime Error: {str(e)}\n{traceback.format_exc()}\n")
        print(f"Agent Error: {e}")
        return "I encountered an error processing your request."
