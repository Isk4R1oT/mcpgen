from fastapi import APIRouter
from pydantic import BaseModel

from backend.agents.chat_agent import create_chat_agent, build_chat_prompt
from backend.agents.models import ChatSuggestion
from backend.config import Settings
from backend.db.store import get_job, save_chat_message, get_chat_history

router = APIRouter(prefix="/jobs", tags=["chat"])

# In-memory chat history (for pipeline context, persisted to Supabase)
_chat_histories: dict[str, list[dict]] = {}


class ChatInput(BaseModel):
    message: str


@router.post("/{job_id}/chat")
async def chat_message(job_id: str, payload: ChatInput) -> dict:
    """Send a message to the AI assistant for configuration help."""
    job = get_job(job_id)

    settings = Settings()
    agent = create_chat_agent(
        api_key=settings.openrouter_api_key,
        model_name=settings.openrouter_model,
    )

    if job_id not in _chat_histories:
        _chat_histories[job_id] = []
    history = _chat_histories[job_id]

    endpoints = job.get("endpoints", [])
    config = job.get("config", {})

    prompt = build_chat_prompt(
        user_message=payload.message,
        endpoints=endpoints,
        current_config=config,
        chat_history=history,
    )

    result = await agent.run(prompt)
    suggestion: ChatSuggestion = result.output

    # Save to in-memory history
    history.append({"role": "user", "content": payload.message})
    history.append({"role": "assistant", "content": suggestion.message})

    # Persist to Supabase
    save_chat_message(job_id, "user", payload.message)
    save_chat_message(job_id, "assistant", suggestion.message)

    return {
        "message": suggestion.message,
        "config_updates": suggestion.config_updates,
        "endpoint_suggestions": suggestion.endpoint_suggestions,
    }


@router.get("/{job_id}/chat/history")
async def chat_history_endpoint(job_id: str) -> list[dict]:
    """Get chat history for a job."""
    get_job(job_id)

    # Try in-memory first, then Supabase
    if job_id in _chat_histories:
        return _chat_histories[job_id]

    return get_chat_history(job_id)
