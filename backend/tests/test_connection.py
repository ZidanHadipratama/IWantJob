"""Tests for GET /test-connection endpoint."""
from unittest.mock import MagicMock, patch

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app


BASE_HEADERS = {
    "X-Supabase-Url": "https://example.supabase.co",
    "X-Supabase-Key": "anon-key-123",
    "X-User-Id": "550e8400-e29b-41d4-a716-446655440000",
}


@pytest.mark.asyncio
async def test_test_connection_without_supabase_headers_returns_400():
    """Missing Supabase headers must produce a 400 response."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/test-connection")
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_test_connection_with_valid_headers_returns_connected_true():
    """Valid headers and a working Supabase instance → connected: true."""
    mock_client = MagicMock()
    # Simulate successful lightweight query
    mock_client.table.return_value.select.return_value.limit.return_value.execute.return_value.data = [
        {"id": "user-1"}
    ]

    transport = ASGITransport(app=app)
    with patch("app.dependencies.create_client", return_value=mock_client):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/test-connection", headers=BASE_HEADERS)

    assert response.status_code == 200
    body = response.json()
    assert body["connected"] is True
    assert "message" in body


@pytest.mark.asyncio
async def test_test_connection_with_invalid_credentials_returns_connected_false():
    """An exception during the DB query → connected: false (not a 500)."""
    mock_client = MagicMock()
    mock_client.table.return_value.select.return_value.limit.return_value.execute.side_effect = Exception(
        "Invalid API key"
    )

    transport = ASGITransport(app=app)
    with patch("app.dependencies.create_client", return_value=mock_client):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/test-connection", headers=BASE_HEADERS)

    assert response.status_code == 200
    body = response.json()
    assert body["connected"] is False
    assert "Invalid API key" in body["message"]
