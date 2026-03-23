"""Form endpoints: POST /fill-form (AI-powered), POST /save-qa."""
import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.dependencies import AIConfig, get_ai_config, get_supabase_client, get_user_id
from app.models.schemas import FillFormRequest, FillFormResponse, SaveQARequest
from app.services.ai_service import AIService
from app.services.db_service import DBService
from app.services.prompt_safety import (
    build_direct_form_answers,
    build_sanitized_profile,
    maybe_parse_resume_json,
    redact_free_text,
    resume_json_to_prompt_text,
)
from app.services.structured_jd import build_structured_job_description

router = APIRouter(tags=["form"])

_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


def _load_prompt(name: str) -> str:
    return (_PROMPTS_DIR / name).read_text()


def _format_structured_jd_summary(structured_jd) -> str:
    return "\n".join(
        [
            f"- Role focus: {structured_jd.role_focus or 'Not identified'}",
            f"- Must-have skills: {', '.join(structured_jd.must_have_skills) if structured_jd.must_have_skills else 'None'}",
            f"- Preferred skills: {', '.join(structured_jd.preferred_skills) if structured_jd.preferred_skills else 'None'}",
            f"- Responsibilities: {'; '.join(structured_jd.responsibilities) if structured_jd.responsibilities else 'None'}",
            f"- Domain keywords: {', '.join(structured_jd.domain_keywords) if structured_jd.domain_keywords else 'None'}",
            f"- Seniority: {structured_jd.seniority or 'Not identified'}",
            f"- Work mode: {structured_jd.work_mode or 'Not identified'}",
            f"- Employment type: {structured_jd.employment_type or 'Not identified'}",
        ]
    )


def _format_prior_answers(prior_answers) -> str:
    usable = [
        answer
        for answer in prior_answers
        if getattr(answer, "question", "").strip() and getattr(answer, "answer", "").strip()
    ]
    if not usable:
        return "None"

    return "\n".join(
        f"- {redact_free_text(answer.question)} -> {redact_free_text(answer.answer)}"
        for answer in usable[:24]
    )


@router.post("/fill-form")
async def fill_form(
    body: FillFormRequest,
    ai_config: AIConfig = Depends(get_ai_config),
    client: Client = Depends(get_supabase_client),
    user_id: str = Depends(get_user_id),
):
    """Generate form answers using AI, then auto-save Q&A pairs to DB."""
    # Resolve resume text
    source_resume_json = body.resume_json
    resume_text = body.resume_text or ""
    if source_resume_json:
        resume_text = resume_json_to_prompt_text(source_resume_json)
    if not resume_text:
        db = DBService(client, user_id)
        user = db.get_user()
        if user and user.get("base_resume_text"):
            source_resume_json = maybe_parse_resume_json(user["base_resume_text"])
            resume_text = (
                resume_json_to_prompt_text(source_resume_json)
                if source_resume_json
                else redact_free_text(user["base_resume_text"])
            )
    if not resume_text:
        raise HTTPException(status_code=400, detail="No resume provided or found in DB")

    profile_str = build_sanitized_profile(body.user_profile, source_resume_json)
    direct_answers, ai_fields = build_direct_form_answers(
        body.form_fields,
        source_resume_json,
        body.user_profile,
    )
    structured_jd = body.structured_job_description
    if not structured_jd and body.job_description:
        structured_jd = await build_structured_job_description(body.job_description, use_ai_normalization=False)

    if ai_fields:
        prompt_template = _load_prompt("fill_form.txt")
        prompt = (
            prompt_template
            .replace("{resume}", resume_text)
            .replace("{user_profile}", profile_str)
            .replace("{persona_text}", body.persona_text or "Not provided")
            .replace("{job_description}", redact_free_text(body.job_description) if body.job_description else "Not provided")
            .replace("{structured_job_summary}", _format_structured_jd_summary(structured_jd) if structured_jd else "Not provided")
            .replace("{prior_answers}", _format_prior_answers(body.prior_answers))
            .replace("{form_fields}", json.dumps(ai_fields, indent=2))
        )

        ai = AIService(ai_config)
        try:
            ai_answers = await ai.json_completion(
                system_prompt="You are a job application form assistant. Return ONLY valid JSON.",
                user_message=prompt,
            )
        except (json.JSONDecodeError, Exception) as exc:
            raise HTTPException(
                status_code=502, detail=f"AI call failed or returned invalid JSON: {exc}"
            ) from exc

        if not isinstance(ai_answers, list):
            raise HTTPException(status_code=502, detail="AI did not return a JSON array")
    else:
        ai_answers = []

    answers = direct_answers + ai_answers

    # Auto-save Q&A pairs to DB
    db = DBService(client, user_id)
    job_id = body.job_id
    qa_saved = False

    if job_id:
        qa_pairs = [
            {
                "field_id": a.get("field_id", ""),
                "question": a.get("label", ""),
                "answer": a.get("answer", ""),
                "field_type": a.get("field_type", "text"),
            }
            for a in answers
            if a.get("field_id")
        ]
        if qa_pairs:
            try:
                db.upsert_qa_pairs(str(job_id), qa_pairs)
                qa_saved = True
            except Exception:
                pass  # Non-critical; answers are still returned

    return FillFormResponse(
        answers=answers,
        job_id=job_id,
        qa_saved=qa_saved,
    )


@router.post("/save-qa")
async def save_qa(
    body: SaveQARequest,
    client: Client = Depends(get_supabase_client),
    user_id: str = Depends(get_user_id),
):
    """Upsert Q&A pairs for a job by (job_id, field_id) unique key."""
    if not body.qa_pairs:
        raise HTTPException(status_code=400, detail="qa_pairs list cannot be empty")

    db = DBService(client, user_id)
    pairs_data = [pair.model_dump() for pair in body.qa_pairs]
    result = db.upsert_qa_pairs(str(body.job_id), pairs_data)
    return {"saved": len(result), "qa_pairs": result}
