import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app


@pytest.mark.asyncio
async def test_cors_allows_chrome_extension_origin():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.options(
            "/health",
            headers={
                "Origin": "chrome-extension://abc123def",
                "Access-Control-Request-Method": "GET",
            },
        )
    assert "access-control-allow-origin" in response.headers
