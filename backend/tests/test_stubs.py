"""Verify that Phase 3 endpoints still return 501 (not yet implemented)."""
import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app

# Only endpoints still stubbed for Phase 3
STUB_ENDPOINTS = [
    ("POST", "/tailor-resume"),
    ("POST", "/generate-pdf"),
    ("POST", "/fill-form"),
    ("POST", "/chat"),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path", STUB_ENDPOINTS)
async def test_stub_returns_501(method: str, path: str):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        if method == "GET":
            response = await client.get(path)
        else:
            response = await client.post(path)
    assert response.status_code == 501, f"{method} {path} returned {response.status_code}, expected 501"
