"""Resume endpoints: parse text to JSON, save, tailor, and generate PDF."""
import json
import logging
import re
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, ValidationError
from supabase import Client

from app.dependencies import AIConfig, get_ai_config, get_supabase_client, get_user_id
from app.models.schemas import (
    JobInfo,
    LogJobRequest,
    LogJobResponse,
    ParseResumeRequest,
    ResumeJSON,
    SaveApplicationDraftRequest,
    SaveApplicationDraftResponse,
    StructuredJobDescription,
    TailorResumeRequest,
    TailorResumeResponse,
)
from app.services.ai_service import AIService
from app.services.db_service import DBService
from app.services.job_info_extractor import extract_job_info
from app.services.prompt_trace import (
    build_prompt_trace_summary,
    build_resume_trace_summary,
    new_trace_id,
    write_prompt_trace,
)
from app.services.prompt_safety import maybe_parse_resume_json, redact_free_text, resume_json_to_prompt_text
from app.services.resume_relevance import (
    build_ranked_entry_ordering_brief,
    build_ranked_resume_alignment_brief,
)
from app.services.structured_jd import (
    extract_structured_jd_heuristics,
    normalize_structured_jd_with_ai,
)

router = APIRouter(tags=["resume"])

_HTML_TAG_RE = re.compile(r"<[^>]+>")
_WORK_LOCATION_RE = re.compile(
    r"\b(remote|hybrid|onsite|on-site|worldwide|global|anywhere|emea|apac|latam|timezone|time zone)\b",
    re.IGNORECASE,
)
_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


def _strip_html(text: Optional[str]) -> Optional[str]:
    if text is None:
        return None
    return _HTML_TAG_RE.sub("", text)


def _load_prompt(name: str) -> str:
    return (_PROMPTS_DIR / name).read_text()


def _safe_prompt_value(text: Optional[str], fallback: str = "Not provided") -> str:
    cleaned = _strip_html(text)
    return cleaned if cleaned else fallback


def _format_structured_jd_summary(structured_jd: StructuredJobDescription) -> str:
    lines = [
        f"- Role focus: {structured_jd.role_focus or 'Not identified'}",
        f"- Must-have skills: {', '.join(structured_jd.must_have_skills) if structured_jd.must_have_skills else 'None'}",
        f"- Preferred skills: {', '.join(structured_jd.preferred_skills) if structured_jd.preferred_skills else 'None'}",
        f"- Responsibilities: {'; '.join(structured_jd.responsibilities) if structured_jd.responsibilities else 'None'}",
        f"- Domain keywords: {', '.join(structured_jd.domain_keywords) if structured_jd.domain_keywords else 'None'}",
        f"- Seniority: {structured_jd.seniority or 'Not identified'}",
        f"- Work mode: {structured_jd.work_mode or 'Not identified'}",
        f"- Employment type: {structured_jd.employment_type or 'Not identified'}",
    ]
    return "\n".join(lines)


def _format_prompt(
    body: TailorResumeRequest,
    resume_text: str,
    structured_jd: StructuredJobDescription,
    ranked_overlap_brief: str,
    ranked_entry_ordering_brief: str,
) -> str:
    prompt_template = _load_prompt("tailor_resume.txt")
    metadata_lines = "\n".join(f"- {line}" for line in body.metadata_lines if line.strip()) or "- None"
    replacements = {
        "{job_description}": redact_free_text(body.job_description),
        "{resume}": resume_text,
        "{job_url}": _safe_prompt_value(body.url),
        "{page_title}": _safe_prompt_value(body.page_title),
        "{detected_company}": _safe_prompt_value(body.company),
        "{detected_title}": _safe_prompt_value(body.title),
        "{page_excerpt}": _safe_prompt_value(body.page_excerpt),
        "{metadata_lines}": metadata_lines,
        "{structured_job_summary}": _format_structured_jd_summary(structured_jd),
        "{ranked_overlap_brief}": ranked_overlap_brief,
        "{ranked_entry_ordering_brief}": ranked_entry_ordering_brief,
    }

    prompt = prompt_template
    for placeholder, value in replacements.items():
        prompt = prompt.replace(placeholder, value)
    return prompt


def _clean_company_location(text: Optional[str]) -> Optional[str]:
    cleaned = _strip_html(text)
    if not cleaned:
        return None
    if _WORK_LOCATION_RE.search(cleaned):
        return None
    return cleaned


def _normalize_entry_key(value: Optional[str]) -> str:
    if not value:
        return ""
    cleaned = re.sub(r"\s+", " ", value).strip().lower()
    return re.sub(r"[^a-z0-9]+", "", cleaned)


def _restore_entry_urls(
    tailored_resume: ResumeJSON,
    source_resume: Optional[ResumeJSON],
) -> ResumeJSON:
    if not source_resume:
        return tailored_resume

    source_url_map: dict[tuple[str, str], str] = {}
    fallback_url_map: dict[str, str] = {}
    for section in source_resume.sections:
        section_key = _normalize_entry_key(section.title)
        for entry in section.entries:
            entry_key = _normalize_entry_key(entry.heading)
            if not entry_key or not entry.url:
                continue
            source_url_map[(section_key, entry_key)] = entry.url
            fallback_url_map.setdefault(entry_key, entry.url)

    if not source_url_map and not fallback_url_map:
        return tailored_resume

    updated_sections = []
    for section in tailored_resume.sections:
        section_key = _normalize_entry_key(section.title)
        updated_entries = []
        for entry in section.entries:
            if entry.url:
                updated_entries.append(entry)
                continue
            entry_key = _normalize_entry_key(entry.heading)
            restored_url = source_url_map.get((section_key, entry_key)) or fallback_url_map.get(entry_key)
            if restored_url:
                updated_entries.append(entry.model_copy(update={"url": restored_url}))
            else:
                updated_entries.append(entry)
        updated_sections.append(section.model_copy(update={"entries": updated_entries}))

    return tailored_resume.model_copy(update={"sections": updated_sections})


def _resume_json_to_text(rj: ResumeJSON) -> str:
    """Backward-compatible export for non-prompt call sites."""
    return resume_json_to_prompt_text(rj)


def _resolve_job_info(body: TailorResumeRequest, ai_result: dict) -> JobInfo:
    """Merge AI job info with request fallbacks and heuristic extraction."""
    raw_job_info = ai_result.get("job_info") or {}
    if not isinstance(raw_job_info, dict):
        raw_job_info = {}

    ai_job_info = JobInfo.model_validate(raw_job_info)
    heuristic_info = extract_job_info(body.job_description)

    return JobInfo(
        company=_strip_html(ai_job_info.company or body.company),
        title=_strip_html(ai_job_info.title or body.title),
        job_type=ai_job_info.job_type or heuristic_info.get("job_type"),
        employment_type=ai_job_info.employment_type or heuristic_info.get("employment_type"),
        location=_clean_company_location(ai_job_info.location) or heuristic_info.get("location"),
        salary_range=_strip_html(ai_job_info.salary_range) or heuristic_info.get("salary_range"),
    )


def _persist_tailored_job(
    db: DBService,
    user_id: str,
    body: TailorResumeRequest,
    tailored_resume: ResumeJSON,
    job_info: JobInfo,
    structured_jd: StructuredJobDescription,
) -> Optional[str]:
    """Create or update the job row, then save the tailored resume against it."""
    job_payload = {
        "company": job_info.company or "Unknown Company",
        "title": job_info.title or "Unknown Position",
        "url": body.url,
        "job_description": _strip_html(body.job_description),
        "status": "saved",
        "job_type": job_info.job_type,
        "employment_type": job_info.employment_type,
        "location": job_info.location,
        "salary_range": job_info.salary_range,
        "structured_job_description": structured_jd.model_dump(),
    }

    if body.job_id:
        row = db.update_job(str(body.job_id), job_payload)
        job_id = str(body.job_id)
    elif body.persist_job:
        row = db.create_job(job_payload)
        job_id = str(row["id"])
    else:
        return str(body.job_id) if body.job_id else None

    try:
        db.save_tailored_resume(job_id, tailored_resume.model_dump_json())
    except Exception:
        pass  # Non-critical; tailored data is still returned

    return job_id


class SaveResumeTextRequest(BaseModel):
    resume_text: str


@router.post("/parse-resume")
async def parse_resume(
    body: ParseResumeRequest,
    ai_config: AIConfig = Depends(get_ai_config),
    client: Client = Depends(get_supabase_client),
    user_id: str = Depends(get_user_id),
):
    """Convert plain resume text into structured ResumeJSON using AI."""
    logger.info("parse-resume called, provider=%s model=%s", ai_config.provider, ai_config.model)
    text = body.resume_text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="resume_text cannot be empty")

    text = _strip_html(text)

    ai = AIService(ai_config)
    prompt_template = _load_prompt("parse_resume.txt")
    prompt = prompt_template.replace("{resume_text}", text)

    try:
        parsed = await ai.json_completion(
            system_prompt="You are a resume parser. Return ONLY valid JSON.",
            user_message=prompt,
        )
        resume_json = ResumeJSON.model_validate(parsed)
    except (json.JSONDecodeError, ValidationError) as exc:
        logger.error("AI returned invalid resume JSON: %s", exc)
        raise HTTPException(
            status_code=422,
            detail=f"AI returned invalid resume JSON: {exc}",
        ) from exc
    except Exception as exc:
        logger.error("AI call failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail=f"AI call failed: {exc}",
        ) from exc

    # Save to users table (non-critical — return parsed JSON even if save fails)
    db_saved = False
    resume_text_json = resume_json.model_dump_json()
    try:
        db = DBService(client, user_id)
        db.upsert_user({"base_resume_text": resume_text_json})
        db_saved = True
    except Exception as exc:
        logger.warning("DB save failed (resume still parsed): %s", exc)

    msg = "Resume parsed and saved" if db_saved else "Resume parsed (DB save failed — check your Supabase key)"
    return {"resume_json": resume_json.model_dump(), "message": msg}


@router.post("/save-resume-json")
async def save_resume_json(
    body: ResumeJSON,
    client: Client = Depends(get_supabase_client),
    user_id: str = Depends(get_user_id),
):
    """Accept a ResumeJSON body directly and save it."""
    resume_text_json = body.model_dump_json()
    try:
        db = DBService(client, user_id)
        db.upsert_user({"base_resume_text": resume_text_json})
    except Exception as exc:
        logger.warning("DB save failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"DB save failed: {exc}") from exc

    return {"resume_json": body.model_dump(), "message": "Resume JSON saved"}


@router.post("/tailor-resume")
async def tailor_resume(
    body: TailorResumeRequest,
    ai_config: AIConfig = Depends(get_ai_config),
    client: Client = Depends(get_supabase_client),
    user_id: str = Depends(get_user_id),
):
    """Generate a tailored resume from a job description + base resume."""
    trace_id = new_trace_id()
    source_resume_json = body.resume_json
    resume_text = body.resume_text
    if source_resume_json:
        resume_text = resume_json_to_prompt_text(source_resume_json)
    if not resume_text:
        # Try loading from users table
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

    ai = AIService(ai_config)
    write_prompt_trace(
        trace_id,
        "incoming_context",
        {
            "job_url": body.url,
            "page_title": body.page_title,
            "detected_company": body.company,
            "detected_title": body.title,
            "page_excerpt": _safe_prompt_value(body.page_excerpt),
            "metadata_lines": body.metadata_lines,
            "job_description_preview": redact_free_text(body.job_description),
        },
    )

    heuristic_jd = extract_structured_jd_heuristics(body.job_description)
    write_prompt_trace(trace_id, "structured_jd_heuristic", heuristic_jd.model_dump())

    try:
        structured_jd = await normalize_structured_jd_with_ai(body.job_description, heuristic_jd, ai)
    except Exception:
        structured_jd = heuristic_jd
    write_prompt_trace(trace_id, "structured_jd_final", structured_jd.model_dump())

    write_prompt_trace(trace_id, "sanitized_resume_fact_pack", build_resume_trace_summary(resume_text))
    ranked_overlap_brief = build_ranked_resume_alignment_brief(
        structured_jd,
        source_resume_json,
        fallback_resume_text=resume_text,
    )
    ranked_entry_ordering_brief = build_ranked_entry_ordering_brief(
        structured_jd,
        source_resume_json,
    )
    write_prompt_trace(
        trace_id,
        "ranked_overlap_brief",
        {
            "preview": ranked_overlap_brief,
        },
    )
    write_prompt_trace(
        trace_id,
        "ranked_entry_ordering_brief",
        {
            "preview": ranked_entry_ordering_brief,
        },
    )
    prompt = _format_prompt(
        body,
        resume_text,
        structured_jd,
        ranked_overlap_brief,
        ranked_entry_ordering_brief,
    )
    write_prompt_trace(trace_id, "final_prompt_summary", build_prompt_trace_summary(prompt))

    try:
        result = await ai.json_completion(
            system_prompt="You are an expert resume writer. Return ONLY valid JSON.",
            user_message=prompt,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI call failed: {exc}") from exc

    # Parse the structured response
    try:
        tailored_data = result.get("tailored_resume", result)
        tailored_resume = ResumeJSON.model_validate(tailored_data)
        job_info = _resolve_job_info(body, result if isinstance(result, dict) else {})
        match_score = float(result.get("match_score", 0))
    except (ValidationError, KeyError, TypeError) as exc:
        logger.error("AI returned invalid tailored resume JSON: %s", exc)
        raise HTTPException(
            status_code=422,
            detail=f"AI returned invalid resume JSON: {exc}",
        ) from exc

    output_sections = [section.title for section in tailored_resume.sections[:6]]
    output_projects: list[str] = []
    for section in tailored_resume.sections:
        if section.title.lower() == "projects":
            output_projects = [entry.heading for entry in section.entries[:5] if entry.heading]
            break
    write_prompt_trace(
        trace_id,
        "ai_output_summary",
        {
            "job_info": job_info.model_dump(),
            "match_score": match_score,
            "summary": tailored_resume.summary,
            "section_titles": output_sections,
            "project_headings": output_projects,
        },
    )

    if source_resume_json:
        tailored_resume = tailored_resume.model_copy(update={"contact": source_resume_json.contact})
        tailored_resume = _restore_entry_urls(tailored_resume, source_resume_json)

    # Persist job + tailored resume when requested
    job_id = None
    db = DBService(client, user_id)
    if body.job_id or body.persist_job:
        try:
            job_id = _persist_tailored_job(db, user_id, body, tailored_resume, job_info, structured_jd)
        except Exception as exc:
            logger.warning("Job persistence failed after tailoring: %s", exc)

    return TailorResumeResponse(
        tailored_resume_json=tailored_resume,
        job_info=job_info,
        structured_job_description=structured_jd,
        match_score=match_score,
        job_id=job_id,
    )


@router.post("/save-application-draft", response_model=SaveApplicationDraftResponse)
async def save_application_draft(
    body: SaveApplicationDraftRequest,
    client: Client = Depends(get_supabase_client),
    user_id: str = Depends(get_user_id),
):
    """Persist a reviewed sidepanel draft as a saved job, tailored resume, and optional Q&A."""
    from app.routers.jobs import _sanitize_log_job_payload

    db = DBService(client, user_id)
    job_request = LogJobRequest(
        job_id=body.job_id,
        company=body.company,
        title=body.title,
        url=body.url,
        job_description=body.job_description,
        status=body.status,
        job_type=body.job_type,
        employment_type=body.employment_type,
        location=body.location,
        salary_range=body.salary_range,
        structured_job_description=body.structured_job_description,
        notes=body.notes,
    )
    sanitized = _sanitize_log_job_payload(job_request)

    try:
        if body.job_id:
            row = db.update_job(str(body.job_id), sanitized)
            if not row:
                raise HTTPException(status_code=404, detail="Job not found or not owned by user")
            job_id = str(body.job_id)
        else:
            row = db.create_job(sanitized)
            job_id = str(row["id"])

        db.save_tailored_resume(job_id, body.tailored_resume_json.model_dump_json())

        qa_pairs = [
            pair.model_dump()
            for pair in body.qa_pairs
            if pair.field_id and pair.answer.strip()
        ]
        saved_pairs = db.upsert_qa_pairs(job_id, qa_pairs) if qa_pairs else []
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("save-application-draft failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Failed to save draft application: {exc}") from exc

    return SaveApplicationDraftResponse(
        job=LogJobResponse(**row),
        qa_pairs=saved_pairs,
        resume_saved=True,
    )


@router.post("/generate-pdf")
async def generate_pdf(body: ResumeJSON):
    """Generate an ATS-safe PDF from ResumeJSON."""
    from app.services.pdf_service import generate_resume_pdf

    try:
        pdf_bytes, page_count = generate_resume_pdf(body)
    except Exception as exc:
        logger.error("PDF generation failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {exc}") from exc

    filename = f"{body.contact.name or 'resume'}_resume.pdf".replace(" ", "_")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Page-Count": str(page_count),
        },
    )


@router.post("/save-resume-text")
async def save_resume_text(
    body: SaveResumeTextRequest,
    client: Client = Depends(get_supabase_client),
    user_id: str = Depends(get_user_id),
):
    """Accept plain resume text and save as base resume."""
    text = body.resume_text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="resume_text cannot be empty")

    text = _strip_html(text)

    db = DBService(client, user_id)
    db.save_base_resume(text)
    db.upsert_user({"base_resume_text": text})

    return {"resume_text": text, "message": "Resume saved successfully"}
