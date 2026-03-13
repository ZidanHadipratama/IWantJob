"""Integration tests for resume parse/save endpoints."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.models.schemas import ParseResumeRequest
from app.routers.resume import parse_resume, save_resume_text


BASE_HEADERS = {
    "X-Supabase-Url": "https://example.supabase.co",
    "X-Supabase-Key": "anon-key-123",
    "X-User-Id": "550e8400-e29b-41d4-a716-446655440000",
    "X-AI-Provider": "openai",
    "X-AI-Key": "sk-test",
    "X-AI-Model": "gpt-4o-mini",
}

SAMPLE_RESUME_TEXT = "John Doe\nSoftware Engineer\nExperience: 5 years Python"
SAMPLE_RESUME_JSON = {
    "contact": {
        "name": "John Doe",
        "email": "john@example.com",
    },
    "summary": "Software engineer with backend experience.",
    "sections": [],
}


def make_mock_db():
    db = MagicMock()
    db.save_base_resume.return_value = {
        "id": "dddddddd-dddd-dddd-dddd-dddddddddddd",
        "user_id": "550e8400-e29b-41d4-a716-446655440000",
        "resume_text": SAMPLE_RESUME_TEXT,
        "is_base": True,
        "job_id": None,
        "created_at": "2026-01-01T00:00:00Z",
    }
    db.upsert_user.return_value = {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "base_resume_text": SAMPLE_RESUME_TEXT,
    }
    return db

@pytest.mark.asyncio
async def test_parse_resume_returns_structured_json_and_saves():
    mock_db = make_mock_db()
    mock_ai = MagicMock()
    mock_ai.json_completion = AsyncMock(return_value=SAMPLE_RESUME_JSON)

    with patch("app.routers.resume.DBService", return_value=mock_db), patch(
        "app.routers.resume.AIService", return_value=mock_ai
    ):
        response = await parse_resume(
            body=ParseResumeRequest(resume_text=SAMPLE_RESUME_TEXT),
            ai_config=MagicMock(provider="openai", model="gpt-4o-mini"),
            client=MagicMock(),
            user_id="550e8400-e29b-41d4-a716-446655440000",
    )

    body = response
    assert body["resume_json"]["contact"]["name"] == "John Doe"
    assert body["resume_json"]["contact"]["email"] == "john@example.com"
    assert body["resume_json"]["summary"] == SAMPLE_RESUME_JSON["summary"]
    assert body["resume_json"]["sections"] == []
    assert "message" in body
    mock_ai.json_completion.assert_awaited_once()
    mock_db.upsert_user.assert_called_once()


@pytest.mark.asyncio
async def test_parse_resume_empty_returns_400():
    with pytest.raises(HTTPException) as exc_info:
        await parse_resume(
            body=ParseResumeRequest(resume_text="   "),
            ai_config=MagicMock(provider="openai", model="gpt-4o-mini"),
            client=MagicMock(),
            user_id="550e8400-e29b-41d4-a716-446655440000",
        )

    assert exc_info.value.status_code == 400
    assert "empty" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_parse_resume_invalid_ai_payload_returns_422():
    mock_db = make_mock_db()
    mock_ai = MagicMock()
    mock_ai.json_completion = AsyncMock(return_value={"contact": "invalid", "sections": []})

    with patch("app.routers.resume.DBService", return_value=mock_db), patch(
        "app.routers.resume.AIService", return_value=mock_ai
    ):
        with pytest.raises(HTTPException) as exc_info:
            await parse_resume(
                body=ParseResumeRequest(resume_text=SAMPLE_RESUME_TEXT),
                ai_config=MagicMock(provider="openai", model="gpt-4o-mini"),
                client=MagicMock(),
                user_id="550e8400-e29b-41d4-a716-446655440000",
            )

    assert exc_info.value.status_code == 422
    assert "invalid resume json" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_save_resume_text_saves_plain_text():
    mock_db = make_mock_db()
    with patch("app.routers.resume.DBService", return_value=mock_db):
        body = await save_resume_text(
            body=MagicMock(resume_text=SAMPLE_RESUME_TEXT),
            client=MagicMock(),
            user_id="550e8400-e29b-41d4-a716-446655440000",
        )

    assert body["resume_text"] == SAMPLE_RESUME_TEXT
    assert "message" in body
    mock_db.save_base_resume.assert_called_once_with(SAMPLE_RESUME_TEXT)
    mock_db.upsert_user.assert_called_once()


@pytest.mark.asyncio
async def test_save_resume_text_empty_returns_400():
    with pytest.raises(HTTPException) as exc_info:
        await save_resume_text(
            body=MagicMock(resume_text="   "),
            client=MagicMock(),
            user_id="550e8400-e29b-41d4-a716-446655440000",
        )

    assert exc_info.value.status_code == 400
    assert "empty" in exc_info.value.detail.lower()
