"""FastAPI dependencies for Supabase header extraction and client creation."""
import base64
from dataclasses import dataclass
import json

from fastapi import HTTPException
from starlette.requests import Request
from supabase import create_client, Client


def _decode_supabase_role(key: str) -> str | None:
    """Decode the Supabase JWT role claim without verifying the signature."""
    try:
        parts = key.split(".")
        if len(parts) != 3:
            return None
        payload = parts[1]
        padding = "=" * (-len(payload) % 4)
        decoded = base64.urlsafe_b64decode(payload + padding)
        data = json.loads(decoded.decode("utf-8"))
        role = data.get("role")
        return role if isinstance(role, str) else None
    except Exception:
        return None


def get_supabase_client(request: Request) -> Client:
    """Extract Supabase URL and key from request headers and create a sync client.

    Raises HTTPException(400) if either header is missing.
    """
    url = request.headers.get("x-supabase-url")
    if not url:
        raise HTTPException(status_code=400, detail="Missing X-Supabase-Url header")

    key = request.headers.get("x-supabase-key")
    if not key:
        raise HTTPException(status_code=400, detail="Missing X-Supabase-Key header")

    role = _decode_supabase_role(key)
    if role != "service_role":
        raise HTTPException(
            status_code=400,
            detail=(
                "Current pre-auth mode requires a Supabase service role key "
                "so the backend can enforce user scoping with X-User-Id"
            ),
        )

    return create_client(url, key)


def get_user_id(request: Request) -> str:
    """Extract X-User-Id header value.

    Raises HTTPException(400) if the header is missing.
    """
    user_id = request.headers.get("x-user-id")
    if not user_id:
        raise HTTPException(status_code=400, detail="Missing X-User-Id header")
    return user_id


@dataclass
class AIConfig:
    provider: str
    api_key: str
    model: str


def get_ai_config(request: Request) -> AIConfig:
    """Extract AI configuration from X-AI-Provider, X-AI-Key, X-AI-Model headers.

    Raises HTTPException(400) if provider or model is missing.
    API key is optional for ollama.
    """
    provider = request.headers.get("x-ai-provider")
    if not provider:
        raise HTTPException(status_code=400, detail="Missing X-AI-Provider header")

    model = request.headers.get("x-ai-model")
    if not model:
        raise HTTPException(status_code=400, detail="Missing X-AI-Model header")

    api_key = request.headers.get("x-ai-key", "")
    if not api_key and provider != "ollama":
        raise HTTPException(
            status_code=400,
            detail="Missing X-AI-Key header (required for non-Ollama providers)",
        )

    return AIConfig(provider=provider, api_key=api_key, model=model)
