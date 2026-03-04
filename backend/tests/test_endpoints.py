"""Integration tests for POST /log-job, GET /job/:id, and POST /save-qa endpoints."""
from unittest.mock import MagicMock, patch
from uuid import UUID

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app


BASE_HEADERS = {
    "X-Supabase-Url": "https://example.supabase.co",
    "X-Supabase-Key": "anon-key-123",
    "X-User-Id": "550e8400-e29b-41d4-a716-446655440000",
}

JOB_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
USER_ID = "550e8400-e29b-41d4-a716-446655440000"

MOCK_JOB = {
    "id": JOB_ID,
    "user_id": USER_ID,
    "company": "Acme Corp",
    "title": "Engineer",
    "url": None,
    "job_description": None,
    "status": "saved",
    "applied_at": None,
    "notes": None,
    "created_at": "2026-01-01T00:00:00Z",
}


def make_mock_db():
    """Return a MagicMock that behaves like DBService."""
    db = MagicMock()
    db.create_job.return_value = MOCK_JOB
    db.update_job.return_value = MOCK_JOB
    db.get_job.return_value = MOCK_JOB
    db.get_qa_pairs_for_job.return_value = []
    db.get_resumes_for_job.return_value = []
    db.get_chat_messages_for_job.return_value = []
    db.upsert_qa_pairs.return_value = [
        {
            "id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            "job_id": JOB_ID,
            "field_id": "f1",
            "question": "What is your name?",
            "answer": "Alice",
            "field_type": "text",
            "edited_by_user": False,
        }
    ]
    return db


# ── Test 1: POST /log-job creates job with 201 ─────────────────────────────


@pytest.mark.asyncio
async def test_log_job_creates_job_returns_201():
    mock_db = make_mock_db()
    transport = ASGITransport(app=app)
    with patch("app.routers.jobs.DBService", return_value=mock_db), patch(
        "app.dependencies.create_client", return_value=MagicMock()
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/log-job",
                json={"company": "Acme Corp", "title": "Engineer"},
                headers=BASE_HEADERS,
            )

    assert response.status_code == 201
    body = response.json()
    assert body["company"] == "Acme Corp"
    assert body["title"] == "Engineer"
    assert "id" in body
    assert "created_at" in body
    mock_db.create_job.assert_called_once()


# ── Test 2: POST /log-job with job_id updates existing job ─────────────────


@pytest.mark.asyncio
async def test_log_job_with_job_id_updates_existing():
    mock_db = make_mock_db()
    transport = ASGITransport(app=app)
    with patch("app.routers.jobs.DBService", return_value=mock_db), patch(
        "app.dependencies.create_client", return_value=MagicMock()
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/log-job",
                json={"job_id": JOB_ID, "company": "Acme Corp", "title": "Senior Engineer"},
                headers=BASE_HEADERS,
            )

    assert response.status_code == 200
    mock_db.update_job.assert_called_once()
    mock_db.create_job.assert_not_called()


# ── Test 3: POST /log-job with missing company returns 422 ─────────────────


@pytest.mark.asyncio
async def test_log_job_missing_company_returns_422():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/log-job",
            json={"title": "Engineer"},
            headers=BASE_HEADERS,
        )

    assert response.status_code == 422


# ── Test 4: GET /job/{valid_id} returns full JobResponse ───────────────────


@pytest.mark.asyncio
async def test_get_job_returns_full_job_response():
    mock_db = make_mock_db()
    transport = ASGITransport(app=app)
    with patch("app.routers.jobs.DBService", return_value=mock_db), patch(
        "app.dependencies.create_client", return_value=MagicMock()
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(f"/job/{JOB_ID}", headers=BASE_HEADERS)

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == JOB_ID
    assert body["company"] == "Acme Corp"
    assert "qa_pairs" in body
    assert "resumes" in body
    assert "chat_messages" in body
    assert isinstance(body["qa_pairs"], list)


# ── Test 5: GET /job/{nonexistent_id} returns 404 ──────────────────────────


@pytest.mark.asyncio
async def test_get_job_not_found_returns_404():
    mock_db = make_mock_db()
    mock_db.get_job.return_value = None
    transport = ASGITransport(app=app)
    with patch("app.routers.jobs.DBService", return_value=mock_db), patch(
        "app.dependencies.create_client", return_value=MagicMock()
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                f"/job/cccccccc-cccc-cccc-cccc-cccccccccccc", headers=BASE_HEADERS
            )

    assert response.status_code == 404


# ── Test 6: POST /save-qa upserts Q&A pairs ────────────────────────────────


@pytest.mark.asyncio
async def test_save_qa_upserts_and_returns_saved_pairs():
    mock_db = make_mock_db()
    transport = ASGITransport(app=app)
    with patch("app.routers.form.DBService", return_value=mock_db), patch(
        "app.dependencies.create_client", return_value=MagicMock()
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/save-qa",
                json={
                    "job_id": JOB_ID,
                    "qa_pairs": [
                        {
                            "field_id": "f1",
                            "question": "What is your name?",
                            "answer": "Alice",
                        }
                    ],
                },
                headers=BASE_HEADERS,
            )

    assert response.status_code == 200
    body = response.json()
    assert body["saved"] == 1
    assert "qa_pairs" in body
    mock_db.upsert_qa_pairs.assert_called_once()


# ── Test 7: POST /save-qa with empty qa_pairs returns 400 ──────────────────


@pytest.mark.asyncio
async def test_save_qa_empty_pairs_returns_400():
    mock_db = make_mock_db()
    transport = ASGITransport(app=app)
    with patch("app.routers.form.DBService", return_value=mock_db), patch(
        "app.dependencies.create_client", return_value=MagicMock()
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/save-qa",
                json={"job_id": JOB_ID, "qa_pairs": []},
                headers=BASE_HEADERS,
            )

    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()


# ── Test 8: POST /save-qa with missing job_id returns 422 ──────────────────


@pytest.mark.asyncio
async def test_save_qa_missing_job_id_returns_422():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/save-qa",
            json={"qa_pairs": [{"field_id": "f1", "question": "q", "answer": "a"}]},
            headers=BASE_HEADERS,
        )

    assert response.status_code == 422


# ── Test 9: HTML in company/title fields is stripped ───────────────────────


@pytest.mark.asyncio
async def test_log_job_strips_html_from_text_fields():
    mock_db = make_mock_db()
    # Return a job with stripped company name
    mock_db.create_job.return_value = {**MOCK_JOB, "company": "Evil Corp"}
    transport = ASGITransport(app=app)
    with patch("app.routers.jobs.DBService", return_value=mock_db), patch(
        "app.dependencies.create_client", return_value=MagicMock()
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/log-job",
                json={
                    "company": "<script>alert('xss')</script>Evil Corp",
                    "title": "<b>Engineer</b>",
                },
                headers=BASE_HEADERS,
            )

    assert response.status_code == 201
    # Verify create_job was called with stripped text (no HTML tags)
    call_args = mock_db.create_job.call_args[0][0]
    assert "<script>" not in call_args["company"]
    assert "<b>" not in call_args["title"]
