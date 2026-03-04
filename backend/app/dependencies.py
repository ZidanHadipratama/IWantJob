"""FastAPI dependencies for Supabase header extraction and client creation."""
from fastapi import HTTPException
from starlette.requests import Request
from supabase import create_client, Client


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

    return create_client(url, key)


def get_user_id(request: Request) -> str:
    """Extract X-User-Id header value.

    Raises HTTPException(400) if the header is missing.
    """
    user_id = request.headers.get("x-user-id")
    if not user_id:
        raise HTTPException(status_code=400, detail="Missing X-User-Id header")
    return user_id
