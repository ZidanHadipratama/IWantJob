"""Integration tests for key backend endpoints."""
import json
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.models.schemas import FillFormRequest, LogJobRequest, SaveApplicationDraftRequest, SaveQARequest
from app.routers.connection import test_ai as run_test_ai
from app.routers.form import fill_form, save_qa
from app.routers.jobs import get_job, log_job
from app.routers.resume import save_application_draft


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
    "job_type": "remote",
    "employment_type": "full-time",
    "location": "New York, NY",
    "salary_range": None,
    "structured_job_description": {
        "must_have_skills": ["python"],
        "preferred_skills": ["aws"],
        "responsibilities": ["Build APIs"],
        "domain_keywords": ["ai"],
        "seniority": "senior",
        "work_mode": "remote",
        "employment_type": "full-time",
    },
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
    db.save_tailored_resume.return_value = {
        "id": "resume-1",
        "job_id": JOB_ID,
        "resume_text": "{\"contact\": {\"name\": \"Alice\"}, \"sections\": []}",
        "is_base": False,
    }
    return db


@pytest.mark.asyncio
async def test_test_ai_returns_connected_true_for_ok_probe():
    mock_ai = MagicMock()
    mock_ai.completion = AsyncMock(return_value="OK")

    with patch("app.routers.connection.AIService", return_value=mock_ai):
        response = await run_test_ai(
            ai_config=MagicMock(provider="openai", api_key="sk-test", model="gpt-4o-mini")
        )

    assert response.connected is True
    assert "responded correctly" in response.message


@pytest.mark.asyncio
async def test_test_ai_returns_connected_false_for_bad_probe():
    mock_ai = MagicMock()
    mock_ai.completion = AsyncMock(return_value="hello")

    with patch("app.routers.connection.AIService", return_value=mock_ai):
        response = await run_test_ai(
            ai_config=MagicMock(provider="openai", api_key="sk-test", model="gpt-4o-mini")
        )

    assert response.connected is False
    assert "Unexpected AI response" in response.message


# ── Test 1: POST /log-job creates job with 201 ─────────────────────────────


@pytest.mark.asyncio
async def test_log_job_creates_job_returns_201():
    mock_db = make_mock_db()
    with patch("app.routers.jobs.DBService", return_value=mock_db):
        response = await log_job(
            body=LogJobRequest(company="Acme Corp", title="Engineer"),
            client=MagicMock(),
            user_id=USER_ID,
        )

    body = response.model_dump(mode="json")
    assert body["company"] == "Acme Corp"
    assert body["title"] == "Engineer"
    assert "id" in body
    assert "created_at" in body
    mock_db.create_job.assert_called_once()


# ── Test 2: POST /log-job with job_id updates existing job ─────────────────


@pytest.mark.asyncio
async def test_log_job_with_job_id_updates_existing():
    mock_db = make_mock_db()
    with patch("app.routers.jobs.DBService", return_value=mock_db):
        response = await log_job(
            body=LogJobRequest(job_id=UUID(JOB_ID), company="Acme Corp", title="Senior Engineer"),
            client=MagicMock(),
            user_id=USER_ID,
        )

    assert response.status_code == 200
    mock_db.update_job.assert_called_once()
    mock_db.create_job.assert_not_called()
    call_args = mock_db.update_job.call_args[0][1]
    assert "notes" not in call_args
    assert "job_description" not in call_args


# ── Test 2b: POST /log-job with notes strips HTML and persists notes ──────


@pytest.mark.asyncio
async def test_log_job_update_sanitizes_notes():
    mock_db = make_mock_db()
    mock_db.update_job.return_value = {**MOCK_JOB, "notes": "Important note"}
    with patch("app.routers.jobs.DBService", return_value=mock_db):
        response = await log_job(
            body=LogJobRequest(
                job_id=UUID(JOB_ID),
                company="Acme Corp",
                title="Engineer",
                notes="<b>Important</b> note",
            ),
            client=MagicMock(),
            user_id=USER_ID,
        )

    assert response.status_code == 200
    call_args = mock_db.update_job.call_args[0][1]
    assert call_args["notes"] == "Important note"
    assert json.loads(response.body)["notes"] == "Important note"


@pytest.mark.asyncio
async def test_log_job_update_accepts_employment_type():
    mock_db = make_mock_db()
    mock_db.update_job.return_value = {**MOCK_JOB, "employment_type": "contract"}
    with patch("app.routers.jobs.DBService", return_value=mock_db):
        response = await log_job(
            body=LogJobRequest(
                job_id=UUID(JOB_ID),
                company="Acme Corp",
                title="Engineer",
                employment_type="contract",
            ),
            client=MagicMock(),
            user_id=USER_ID,
        )

    assert response.status_code == 200
    call_args = mock_db.update_job.call_args[0][1]
    assert call_args["employment_type"] == "contract"
    assert json.loads(response.body)["employment_type"] == "contract"


# ── Test 3: POST /log-job with missing company returns 422 ─────────────────


def test_log_job_request_requires_company():
    with pytest.raises(ValidationError):
        LogJobRequest.model_validate({"title": "Engineer"})


# ── Test 4: GET /job/{valid_id} returns full JobResponse ───────────────────


@pytest.mark.asyncio
async def test_get_job_returns_full_job_response():
    mock_db = make_mock_db()
    with patch("app.routers.jobs.DBService", return_value=mock_db):
        response = await get_job(
            job_id=UUID(JOB_ID),
            client=MagicMock(),
            user_id=USER_ID,
        )

    body = response.model_dump(mode="json")
    assert body["id"] == JOB_ID
    assert body["company"] == "Acme Corp"
    assert "qa_pairs" in body
    assert "resumes" in body
    assert "chat_messages" in body
    assert isinstance(body["qa_pairs"], list)
    assert body["structured_job_description"]["domain_keywords"] == ["ai"]


# ── Test 5: GET /job/{nonexistent_id} returns 404 ──────────────────────────


@pytest.mark.asyncio
async def test_get_job_not_found_returns_404():
    mock_db = make_mock_db()
    mock_db.get_job.return_value = None
    with patch("app.routers.jobs.DBService", return_value=mock_db):
        with pytest.raises(HTTPException) as exc_info:
            await get_job(
                job_id=UUID("cccccccc-cccc-cccc-cccc-cccccccccccc"),
                client=MagicMock(),
                user_id=USER_ID,
            )

    assert exc_info.value.status_code == 404


# ── Test 6: POST /save-qa upserts Q&A pairs ────────────────────────────────


@pytest.mark.asyncio
async def test_save_qa_upserts_and_returns_saved_pairs():
    mock_db = make_mock_db()
    with patch("app.routers.form.DBService", return_value=mock_db):
        body = await save_qa(
            body=SaveQARequest(
                job_id=UUID(JOB_ID),
                qa_pairs=[
                    {
                        "field_id": "f1",
                        "question": "What is your name?",
                        "answer": "Alice",
                    }
                ],
            ),
            client=MagicMock(),
            user_id=USER_ID,
        )

    assert body["saved"] == 1
    assert "qa_pairs" in body
    mock_db.upsert_qa_pairs.assert_called_once()


@pytest.mark.asyncio
async def test_save_application_draft_persists_job_resume_and_qa():
    mock_db = make_mock_db()
    with patch("app.routers.resume.DBService", return_value=mock_db):
        response = await save_application_draft(
            body=SaveApplicationDraftRequest(
                company="Acme Corp",
                title="Engineer",
                url="https://example.com/job",
                job_description="Remote role in New York",
                structured_job_description={
                    "must_have_skills": ["python"],
                    "preferred_skills": ["aws"],
                    "responsibilities": ["Build APIs"],
                    "domain_keywords": ["ai"],
                    "seniority": "senior",
                    "work_mode": "remote",
                    "employment_type": "full-time",
                },
                tailored_resume_json={
                    "contact": {"name": "Alice"},
                    "sections": [],
                },
                qa_pairs=[
                    {
                        "field_id": "f1",
                        "question": "Why are you interested?",
                        "answer": "Because the role fits my background.",
                        "field_type": "textarea",
                        "edited_by_user": True,
                    }
                ],
            ),
            client=MagicMock(),
            user_id=USER_ID,
        )

    body = response.model_dump(mode="json")
    assert body["job"]["id"] == JOB_ID
    assert body["resume_saved"] is True
    assert len(body["qa_pairs"]) == 1
    assert body["job"]["structured_job_description"]["work_mode"] == "remote"
    mock_db.create_job.assert_called_once()
    mock_db.save_tailored_resume.assert_called_once()
    mock_db.upsert_qa_pairs.assert_called_once()
    created_job_payload = mock_db.create_job.call_args[0][0]
    assert created_job_payload["structured_job_description"]["work_mode"] == "remote"


@pytest.mark.asyncio
async def test_fill_form_prompt_includes_persona_text_when_present():
    mock_ai = MagicMock()
    mock_ai.json_completion = AsyncMock(return_value=[
        {
            "field_id": "why",
            "label": "Why do you want this role?",
            "answer": "Because it aligns with my principles.",
            "field_type": "textarea",
        }
    ])
    mock_db = MagicMock()

    with patch("app.routers.form.AIService", return_value=mock_ai), patch(
        "app.routers.form.DBService", return_value=mock_db
    ):
        response = await fill_form(
            body=FillFormRequest(
                form_fields=[
                    {
                        "field_id": "email",
                        "label": "Email",
                        "type": "text",
                    },
                    {
                        "field_id": "why",
                        "label": "Why do you want this role?",
                        "type": "textarea",
                    },
                ],
                resume_json={
                    "contact": {
                        "name": "Jane Doe",
                        "email": "jane@example.com",
                        "phone": "+1 555 0100",
                        "linkedin": "https://linkedin.com/in/jane",
                    },
                    "summary": "Python engineer with production backend experience.",
                    "sections": [],
                },
                persona_text="I care about calm execution, ownership, and clear communication.",
                job_description="Remote AI product role",
            ),
            ai_config=MagicMock(provider="openai", api_key="sk-test", model="gpt-4o-mini"),
            client=MagicMock(),
            user_id=USER_ID,
        )

    answers = response.model_dump()["answers"]
    assert any(answer["field_id"] == "email" and answer["answer"] == "jane@example.com" for answer in answers)
    prompt_call = mock_ai.json_completion.await_args.kwargs["user_message"]
    assert "Persona Context:" in prompt_call
    assert "I care about calm execution, ownership, and clear communication." in prompt_call
    assert "Do not turn persona context into unsupported factual claims" in prompt_call
    assert "Structured Job Summary:" in prompt_call
    assert "Evidence hierarchy:" in prompt_call
    assert "If the evidence is weak, answer conservatively" in prompt_call
    assert "Write like a strong candidate answering directly" in prompt_call
    assert "Avoid generic enthusiasm, canned motivational filler" in prompt_call
    assert "Use natural sentence variation" in prompt_call
    assert "Remove obvious buzzwords or generic closing lines" in prompt_call
    assert "jane@example.com" not in prompt_call
    assert "+1 555 0100" not in prompt_call
    assert '"field_id": "email"' not in prompt_call


@pytest.mark.asyncio
async def test_fill_form_prompt_uses_not_provided_when_persona_missing():
    mock_ai = MagicMock()
    mock_ai.json_completion = AsyncMock(return_value=[])
    mock_db = MagicMock()

    with patch("app.routers.form.AIService", return_value=mock_ai), patch(
        "app.routers.form.DBService", return_value=mock_db
    ):
        response = await fill_form(
            body=FillFormRequest(
                form_fields=[
                    {
                        "field_id": "why",
                        "label": "Why do you want this role?",
                        "type": "textarea",
                    }
                ],
                resume_text="Python engineer with production backend experience.",
            ),
            ai_config=MagicMock(provider="openai", api_key="sk-test", model="gpt-4o-mini"),
            client=MagicMock(),
            user_id=USER_ID,
        )

    assert response.qa_saved is False
    prompt_call = mock_ai.json_completion.await_args.kwargs["user_message"]
    assert "Persona Context:" in prompt_call
    assert "Not provided" in prompt_call
    assert "If a shorter, plainer answer is stronger, prefer that over a longer polished one." in prompt_call


@pytest.mark.asyncio
async def test_fill_form_returns_direct_identifier_answers_without_ai_call():
    mock_ai = MagicMock()
    mock_ai.json_completion = AsyncMock(return_value=[])
    mock_db = MagicMock()
    mock_db.get_user.return_value = None

    with patch("app.routers.form.AIService", return_value=mock_ai), patch(
        "app.routers.form.DBService", return_value=mock_db
    ):
        response = await fill_form(
            body=FillFormRequest(
                form_fields=[
                    {"field_id": "firstname", "label": "First name", "type": "text"},
                    {"field_id": "email", "label": "Email", "type": "text"},
                    {"field_id": "phone", "label": "Phone", "type": "text"},
                ],
                resume_json={
                    "contact": {
                        "name": "Jane Doe",
                        "email": "jane@example.com",
                        "phone": "+1 555 0100",
                    },
                    "summary": "Python engineer with production backend experience.",
                    "sections": [],
                },
                resume_text="Jane Doe\njane@example.com\n+1 555 0100",
            ),
            ai_config=MagicMock(provider="openai", api_key="sk-test", model="gpt-4o-mini"),
            client=MagicMock(),
            user_id=USER_ID,
        )

    answers = response.model_dump()["answers"]
    assert answers == [
        {"field_id": "firstname", "label": "First name", "answer": "Jane", "field_type": "text"},
        {"field_id": "email", "label": "Email", "answer": "jane@example.com", "field_type": "text"},
        {"field_id": "phone", "label": "Phone", "answer": "+1 555 0100", "field_type": "text"},
    ]
    mock_ai.json_completion.assert_not_awaited()


# ── Test 7: POST /save-qa with empty qa_pairs returns 400 ──────────────────


@pytest.mark.asyncio
async def test_save_qa_empty_pairs_returns_400():
    with pytest.raises(HTTPException) as exc_info:
        await save_qa(
            body=SaveQARequest(job_id=UUID(JOB_ID), qa_pairs=[]),
            client=MagicMock(),
            user_id=USER_ID,
        )

    assert exc_info.value.status_code == 400
    assert "empty" in exc_info.value.detail.lower()


# ── Test 8: POST /save-qa with missing job_id returns 422 ──────────────────


def test_save_qa_request_requires_job_id():
    with pytest.raises(ValidationError):
        SaveQARequest.model_validate(
            {"qa_pairs": [{"field_id": "f1", "question": "q", "answer": "a"}]}
        )


# ── Test 9: HTML in company/title fields is stripped ───────────────────────


@pytest.mark.asyncio
async def test_log_job_strips_html_from_text_fields():
    mock_db = make_mock_db()
    # Return a job with stripped company name
    mock_db.create_job.return_value = {**MOCK_JOB, "company": "Evil Corp", "notes": "safe"}
    with patch("app.routers.jobs.DBService", return_value=mock_db):
        response = await log_job(
            body=LogJobRequest(
                company="<script>alert('xss')</script>Evil Corp",
                title="<b>Engineer</b>",
                notes="<i>safe</i>",
            ),
            client=MagicMock(),
            user_id=USER_ID,
        )

    assert response.company == "Evil Corp"
    # Verify create_job was called with stripped text (no HTML tags)
    call_args = mock_db.create_job.call_args[0][0]
    assert "<script>" not in call_args["company"]
    assert "<b>" not in call_args["title"]
    assert call_args["notes"] == "safe"
