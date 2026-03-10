"""Routers for lightweight runtime connection checks."""
from fastapi import APIRouter, Depends

from app.dependencies import AIConfig, get_ai_config, get_supabase_client, get_user_id
from app.models.schemas import TestConnectionResponse
from app.services.ai_service import AIService

router = APIRouter()


@router.get("/test-connection", response_model=TestConnectionResponse)
def test_connection(
    client=Depends(get_supabase_client),
    user_id: str = Depends(get_user_id),
) -> TestConnectionResponse:
    """Validate Supabase credentials by performing a lightweight query.

    Returns connected=True on success; connected=False with an error message
    if the query fails. Never returns 500 — errors are informational.
    """
    try:
        client.table("users").select("id").limit(1).execute()
        return TestConnectionResponse(
            connected=True,
            message="Connected to Supabase successfully",
        )
    except Exception as exc:
        return TestConnectionResponse(
            connected=False,
            message=str(exc),
        )


@router.get("/test-ai", response_model=TestConnectionResponse)
async def test_ai(
    ai_config: AIConfig = Depends(get_ai_config),
) -> TestConnectionResponse:
    """Run a tiny AI probe to validate the configured provider/model/key."""
    ai = AIService(ai_config)

    try:
        result = await ai.completion(
            system_prompt="Reply with exactly OK.",
            user_message="OK?",
        )
        normalized = result.strip()
        if normalized == "OK":
            return TestConnectionResponse(
                connected=True,
                message=f"AI responded correctly using {ai_config.provider}/{ai_config.model}",
            )
        return TestConnectionResponse(
            connected=False,
            message=f"Unexpected AI response: {normalized[:80] or 'empty response'}",
        )
    except Exception as exc:
        return TestConnectionResponse(
            connected=False,
            message=str(exc),
        )
