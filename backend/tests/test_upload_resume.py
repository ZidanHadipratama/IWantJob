"""Integration tests for POST /upload-resume and POST /save-resume-text endpoints."""
import io
from unittest.mock import MagicMock, patch

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app


BASE_HEADERS = {
    "X-Supabase-Url": "https://example.supabase.co",
    "X-Supabase-Key": "anon-key-123",
    "X-User-Id": "550e8400-e29b-41d4-a716-446655440000",
}

SAMPLE_RESUME_TEXT = "John Doe\nSoftware Engineer\nExperience: 5 years Python"


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


def make_mock_converter(text: str = SAMPLE_RESUME_TEXT):
    """Return a mock PdfConverter that returns rendered markdown."""
    mock_rendered = MagicMock()
    mock_rendered.markdown = text
    mock_converter = MagicMock(return_value=mock_rendered)
    return mock_converter


# ── Test 1: PDF upload happy path ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_upload_resume_pdf_extracts_text_and_saves():
    mock_db = make_mock_db()
    mock_rendered = MagicMock()
    mock_rendered.markdown = SAMPLE_RESUME_TEXT
    mock_converter_instance = MagicMock(return_value=mock_rendered)
    mock_converter_class = MagicMock(return_value=mock_converter_instance)

    transport = ASGITransport(app=app)
    with patch("app.routers.resume.DBService", return_value=mock_db), \
         patch("app.dependencies.create_client", return_value=MagicMock()), \
         patch("app.routers.resume.PdfConverter", mock_converter_class), \
         patch("app.routers.resume.create_model_dict", return_value={}):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/upload-resume",
                files={"file": ("resume.pdf", io.BytesIO(b"%PDF-1.4 fake content"), "application/pdf")},
                headers=BASE_HEADERS,
            )

    assert response.status_code == 200
    body = response.json()
    assert "resume_text" in body
    assert body["resume_text"] == SAMPLE_RESUME_TEXT
    assert "message" in body
    mock_db.save_base_resume.assert_called_once()
    mock_db.upsert_user.assert_called_once()


# ── Test 2: Non-PDF file returns 400 ───────────────────────────────────────


@pytest.mark.asyncio
async def test_upload_resume_non_pdf_returns_400():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/upload-resume",
            files={"file": ("resume.docx", io.BytesIO(b"fake word content"), "application/msword")},
            headers=BASE_HEADERS,
        )

    assert response.status_code == 400
    assert "pdf" in response.json()["detail"].lower()


# ── Test 3: Corrupt/unreadable PDF returns 400 ─────────────────────────────


@pytest.mark.asyncio
async def test_upload_resume_corrupt_pdf_returns_400():
    mock_db = make_mock_db()
    mock_converter_instance = MagicMock(side_effect=Exception("PDF parse error"))
    mock_converter_class = MagicMock(return_value=mock_converter_instance)

    transport = ASGITransport(app=app)
    with patch("app.routers.resume.DBService", return_value=mock_db), \
         patch("app.dependencies.create_client", return_value=MagicMock()), \
         patch("app.routers.resume.PdfConverter", mock_converter_class), \
         patch("app.routers.resume.create_model_dict", return_value={}):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/upload-resume",
                files={"file": ("resume.pdf", io.BytesIO(b"not a real pdf"), "application/pdf")},
                headers=BASE_HEADERS,
            )

    assert response.status_code == 400
    detail = response.json()["detail"].lower()
    assert "extract" in detail or "parse" in detail or "pdf" in detail


# ── Test 4: POST /save-resume-text saves plain text ────────────────────────


@pytest.mark.asyncio
async def test_save_resume_text_saves_plain_text():
    mock_db = make_mock_db()
    transport = ASGITransport(app=app)
    with patch("app.routers.resume.DBService", return_value=mock_db), patch(
        "app.dependencies.create_client", return_value=MagicMock()
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/save-resume-text",
                json={"resume_text": SAMPLE_RESUME_TEXT},
                headers=BASE_HEADERS,
            )

    assert response.status_code == 200
    body = response.json()
    assert body["resume_text"] == SAMPLE_RESUME_TEXT
    assert "message" in body
    mock_db.save_base_resume.assert_called_once_with(SAMPLE_RESUME_TEXT)
    mock_db.upsert_user.assert_called_once()


# ── Test 5: POST /save-resume-text with empty text returns 400 ─────────────


@pytest.mark.asyncio
async def test_save_resume_text_empty_returns_400():
    mock_db = make_mock_db()
    transport = ASGITransport(app=app)
    with patch("app.routers.resume.DBService", return_value=mock_db), patch(
        "app.dependencies.create_client", return_value=MagicMock()
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/save-resume-text",
                json={"resume_text": "   "},
                headers=BASE_HEADERS,
            )

    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()
