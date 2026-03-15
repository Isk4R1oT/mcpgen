from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.agents.chat_agent import create_chat_agent, build_chat_prompt
from backend.agents.models import ChatSuggestion
from backend.api.specs import get_job
from backend.config import Settings

router = APIRouter(prefix="/jobs", tags=["chat"])

# In-memory chat history (per job)
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

    # Get or create chat history
    if job_id not in _chat_histories:
        _chat_histories[job_id] = []
    history = _chat_histories[job_id]

    # Build prompt with context
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

    # Save to history
    history.append({"role": "user", "content": payload.message})
    history.append({"role": "assistant", "content": suggestion.message})

    return {
        "message": suggestion.message,
        "config_updates": suggestion.config_updates,
        "endpoint_suggestions": suggestion.endpoint_suggestions,
    }


@router.get("/{job_id}/chat/history")
async def chat_history(job_id: str) -> list[dict]:
    """Get chat history for a job."""
    get_job(job_id)  # Validate job exists
    return _chat_histories.get(job_id, [])
