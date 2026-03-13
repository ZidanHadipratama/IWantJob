"""Integration tests for POST /tailor-resume metadata + persistence behavior."""
from copy import deepcopy
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.schemas import TailorResumeRequest
from app.routers.resume import tailor_resume


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
    "summary": "AI engineer with Python, LLM, RAG, and workflow automation experience.",
    "sections": [
        {
            "title": "Projects",
            "entries": [
                {
                    "heading": "Catty - RAG Chatbot System",
                    "subheading": "RAG and LangChain project",
                    "url": "https://github.com/example/catty",
                    "bullets": [
                        "Built a RAG system with LangChain, vector databases, and contextual retrieval for AI workflows."
                    ],
                },
                {
                    "heading": "Generic Dashboard",
                    "subheading": "Broad full-stack product work",
                    "url": "https://github.com/example/dashboard",
                    "bullets": [
                        "Built a full-stack dashboard using React and Node.js."
                    ],
                },
            ],
        },
        {
            "title": "Work Experience",
            "entries": [
                {
                    "heading": "AI Startup",
                    "subheading": "AI Product Lead",
                    "bullets": [
                        "Led AI product development and workflow automation strategy using Python and LLM systems."
                    ],
                },
                {
                    "heading": "IT Support Company",
                    "subheading": "IT Support",
                    "bullets": [
                        "Managed broad infrastructure and end-user support tasks."
                    ],
                },
            ],
        },
    ],
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
    "tailored_resume": {
        **deepcopy(SAMPLE_RESUME_JSON),
        "sections": [
            {
                **deepcopy(section),
                "entries": [{k: v for k, v in entry.items() if k != "url"} for entry in section["entries"]],
            }
            for section in deepcopy(SAMPLE_RESUME_JSON["sections"])
        ],
    },
    "match_score": 88,
}

STRUCTURED_JD_RESULT = {
    "role_focus": "AI engineer focused on agentic AI pipelines, RAG systems, and workflow automation",
    "must_have_skills": ["python", "llm", "rag"],
    "preferred_skills": ["aws"],
    "responsibilities": ["Build agentic AI workflows"],
    "domain_keywords": ["ai", "automation", "langchain"],
    "seniority": "senior",
    "work_mode": "remote",
    "employment_type": "full-time",
}


@pytest.mark.asyncio
async def test_tailor_resume_returns_job_info_and_persists_job():
    mock_ai = MagicMock()
    mock_ai.json_completion = AsyncMock(side_effect=[STRUCTURED_JD_RESULT, AI_RESULT])

    mock_db = MagicMock()
    mock_db.create_job.return_value = {"id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}
    mock_db.save_tailored_resume.return_value = {"id": "resume-1"}

    with patch("app.routers.resume.AIService", return_value=mock_ai), patch(
        "app.routers.resume.DBService", return_value=mock_db
    ):
        response = await tailor_resume(
            body=TailorResumeRequest(
                job_description="Remote AI Developer role at Reflow. Salary $80K - $160K.",
                resume_json=SAMPLE_RESUME_JSON,
                company="Fallback Co",
                title="Fallback Title",
                url="https://example.com/job",
                page_title="AI Engineer - Reflow",
                page_excerpt="Remote AI role building workflow intelligence.",
                metadata_lines=[
                    "Location: Remote - Anywhere In The World",
                    "Employment Type: Full time",
                ],
                persist_job=True,
            ),
            ai_config=MagicMock(provider="deepseek", api_key="test-key", model="deepseek-chat"),
            client=MagicMock(),
            user_id="550e8400-e29b-41d4-a716-446655440000",
        )

    body = response.model_dump(mode="json")
    assert body["job_info"]["company"] == "Reflow"
    assert body["job_info"]["title"] == "AI Developer"
    assert body["job_info"]["job_type"] == "remote"
    assert body["job_info"]["employment_type"] == "full-time"
    assert body["structured_job_description"]["must_have_skills"] == ["python", "llm", "rag"]
    assert body["structured_job_description"]["role_focus"] == "AI engineer focused on agentic AI pipelines, RAG systems, and workflow automation"
    assert body["match_score"] == 88
    assert body["job_id"] == "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    assert body["tailored_resume_json"]["contact"]["email"] == "jane@example.com"
    assert body["tailored_resume_json"]["sections"][0]["entries"][0]["url"] == "https://github.com/example/catty"
    assert body["tailored_resume_json"]["sections"][0]["entries"][1]["url"] == "https://github.com/example/dashboard"

    mock_db.create_job.assert_called_once()
    mock_db.save_tailored_resume.assert_called_once()
    create_payload = mock_db.create_job.call_args[0][0]
    assert create_payload["company"] == "Reflow"
    assert create_payload["title"] == "AI Developer"
    assert create_payload["job_type"] == "remote"
    assert create_payload["employment_type"] == "full-time"
    assert create_payload["url"] == "https://example.com/job"
    prompt_call = mock_ai.json_completion.await_args_list[1].kwargs["user_message"]
    assert "Page title: AI Engineer - Reflow" in prompt_call
    assert "Detected company: Fallback Co" in prompt_call
    assert "Detected job title: Fallback Title" in prompt_call
    assert "Location: Remote - Anywhere In The World" in prompt_call
    assert "Structured Job Summary:" in prompt_call
    assert "Role focus:" in prompt_call
    assert "Ranked JD-to-Resume Overlap Brief:" in prompt_call
    assert "Ranked Project and Experience Ordering Brief:" in prompt_call
    assert "Recommended project order (highest relevance first):" in prompt_call
    assert "Recommended work experience order (highest relevance first):" in prompt_call
    assert "Catty - RAG Chatbot System" in prompt_call
    assert "When the Structured Job Summary identifies a clear role focus" in prompt_call
    assert "Reorder projects and experience entries by JD relevance" in prompt_call
    assert "Treat the Ranked Project and Experience Ordering Brief as the default ordering plan" in prompt_call
    assert "Prefer directly relevant work experience before leadership or organizational items" in prompt_call
    assert "Must-have skill:" in prompt_call
    assert "Evidence hierarchy:" in prompt_call
    assert "Structured Job Summary as the primary targeting brief" in prompt_call
    assert "Strongly align the summary and selected evidence with the highest-priority JD signals" in prompt_call
    assert "Prefer the most relevant supported evidence over broader but weaker experience" in prompt_call
    assert "jane@example.com" not in prompt_call
