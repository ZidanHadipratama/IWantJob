"""Integration tests for POST /tailor-resume metadata + persistence behavior."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


BASE_HEADERS = {
    "X-Supabase-Url": "https://example.supabase.co",
    "X-Supabase-Key": "anon-key-123",
    "X-User-Id": "550e8400-e29b-41d4-a716-446655440000",
    "X-AI-Provider": "deepseek",
    "X-AI-Model": "deepseek-chat",
    "X-AI-Key": "test-key",
}

SAMPLE_RESUME_JSON = {
    "contact": {
        "name": "Jane Doe",
        "email": "jane@example.com",
    },
    "sections": [],
}

AI_RESULT = {
    "job_info": {
        "company": "Reflow",
        "title": "AI Developer",
        "job_type": "remote",
        "employment_type": "full-time",
        "location": "San Francisco, CA",
        "salary_range": "$80K - $160K",
    },
    "tailored_resume": SAMPLE_RESUME_JSON,
    "match_score": 88,
}


@pytest.mark.asyncio
async def test_tailor_resume_returns_job_info_and_persists_job():
    mock_ai = MagicMock()
    mock_ai.json_completion = AsyncMock(return_value=AI_RESULT)

    mock_db = MagicMock()
    mock_db.create_job.return_value = {"id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}
    mock_db.save_tailored_resume.return_value = {"id": "resume-1"}

    transport = ASGITransport(app=app)
    with patch("app.routers.resume.AIService", return_value=mock_ai), patch(
        "app.routers.resume.DBService", return_value=mock_db
    ), patch("app.dependencies.create_client", return_value=MagicMock()):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/tailor-resume",
                json={
                    "job_description": "Remote AI Developer role at Reflow. Salary $80K - $160K.",
                    "resume_json": SAMPLE_RESUME_JSON,
                    "company": "Fallback Co",
                    "title": "Fallback Title",
                    "url": "https://example.com/job",
                    "page_title": "AI Engineer - Reflow",
                    "page_excerpt": "Remote AI role building workflow intelligence.",
                    "metadata_lines": [
                        "Location: Remote - Anywhere In The World",
                        "Employment Type: Full time",
                    ],
                    "persist_job": True,
                },
                headers=BASE_HEADERS,
            )

    assert response.status_code == 200
    body = response.json()
    assert body["job_info"]["company"] == "Reflow"
    assert body["job_info"]["title"] == "AI Developer"
    assert body["job_info"]["job_type"] == "remote"
    assert body["job_info"]["employment_type"] == "full-time"
    assert body["match_score"] == 88
    assert body["job_id"] == "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

    mock_db.create_job.assert_called_once()
    mock_db.save_tailored_resume.assert_called_once()
    create_payload = mock_db.create_job.call_args[0][0]
    assert create_payload["company"] == "Reflow"
    assert create_payload["title"] == "AI Developer"
    assert create_payload["job_type"] == "remote"
    assert create_payload["employment_type"] == "full-time"
    assert create_payload["url"] == "https://example.com/job"
    prompt_call = mock_ai.json_completion.await_args.kwargs["user_message"]
    assert "Page title: AI Engineer - Reflow" in prompt_call
    assert "Detected company: Fallback Co" in prompt_call
    assert "Detected job title: Fallback Title" in prompt_call
    assert "Location: Remote - Anywhere In The World" in prompt_call
