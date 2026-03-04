"""Router for GET /test-connection — validates Supabase credentials."""
from fastapi import APIRouter, Depends, Request
from supabase import create_client

from app.dependencies import get_supabase_client, get_user_id
from app.models.schemas import TestConnectionResponse

router = APIRouter()


@router.get("/test-connection", response_model=TestConnectionResponse)
def test_connection(
    request: Request,
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
