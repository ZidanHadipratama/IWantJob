"""Form endpoints: POST /fill-form (AI-powered), POST /save-qa."""
import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.dependencies import AIConfig, get_ai_config, get_supabase_client, get_user_id
from app.models.schemas import FillFormRequest, FillFormResponse, SaveQARequest
from app.services.ai_service import AIService
from app.services.db_service import DBService

router = APIRouter(tags=["form"])

_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


def _load_prompt(name: str) -> str:
    return (_PROMPTS_DIR / name).read_text()


@router.post("/fill-form")
async def fill_form(
    body: FillFormRequest,
    ai_config: AIConfig = Depends(get_ai_config),
    client: Client = Depends(get_supabase_client),
    user_id: str = Depends(get_user_id),
):
    """Generate form answers using AI, then auto-save Q&A pairs to DB."""
    # Resolve resume text
    resume_text = body.resume_text or ""
    if body.resume_json:
        # Import here to avoid circular import
        from app.routers.resume import _resume_json_to_text
        resume_text = _resume_json_to_text(body.resume_json)
    if not resume_text:
        db = DBService(client, user_id)
        user = db.get_user()
        if user and user.get("base_resume_text"):
            resume_text = user["base_resume_text"]
    if not resume_text:
        raise HTTPException(status_code=400, detail="No resume provided or found in DB")

    # Build profile string from user_profile or resume contact
    profile_parts = []
    if body.user_profile:
        p = body.user_profile
        profile_parts.append(f"Name: {p.name}")
        profile_parts.append(f"Email: {p.email}")
        if p.work_authorization:
            profile_parts.append(f"Work Authorization: {p.work_authorization}")
        if p.linkedin_url:
            profile_parts.append(f"LinkedIn: {p.linkedin_url}")
        if p.github_url:
            profile_parts.append(f"GitHub: {p.github_url}")
    elif body.resume_json and body.resume_json.contact:
        c = body.resume_json.contact
        if c.name:
            profile_parts.append(f"Name: {c.name}")
        if c.email:
            profile_parts.append(f"Email: {c.email}")
        if c.phone:
            profile_parts.append(f"Phone: {c.phone}")
        if c.location:
            profile_parts.append(f"Location: {c.location}")
        if c.work_authorization:
            profile_parts.append(f"Work Authorization: {c.work_authorization}")
        if c.linkedin:
            profile_parts.append(f"LinkedIn: {c.linkedin}")
        if c.github:
            profile_parts.append(f"GitHub: {c.github}")
        if c.website:
            profile_parts.append(f"Website: {c.website}")
    profile_str = "\n".join(profile_parts) if profile_parts else "Not provided"

    # Build prompt
    prompt_template = _load_prompt("fill_form.txt")
    prompt = (
        prompt_template
        .replace("{resume}", resume_text)
        .replace("{user_profile}", profile_str)
        .replace("{job_description}", body.job_description or "Not provided")
        .replace("{form_fields}", json.dumps(body.form_fields, indent=2))
    )

    ai = AIService(ai_config)
    try:
        answers = await ai.json_completion(
            system_prompt="You are a job application form assistant. Return ONLY valid JSON.",
            user_message=prompt,
        )
    except (json.JSONDecodeError, Exception) as exc:
        raise HTTPException(
            status_code=502, detail=f"AI call failed or returned invalid JSON: {exc}"
        ) from exc

    if not isinstance(answers, list):
        raise HTTPException(status_code=502, detail="AI did not return a JSON array")

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
