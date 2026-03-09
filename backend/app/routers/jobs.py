"""Job endpoints: POST /log-job, GET /jobs, GET /job/:id, DELETE /job/:id."""
import re
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.dependencies import get_supabase_client, get_user_id
from app.models.schemas import (
    ExtractJobInfoRequest,
    ExtractJobInfoResponse,
    JobListItem,
    JobResponse,
    LogJobRequest,
    LogJobResponse,
)
from app.services.db_service import DBService
from app.services.job_info_extractor import extract_job_info

router = APIRouter(tags=["jobs"])

_HTML_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(text: Optional[str]) -> Optional[str]:
    """Remove HTML tags from a string. Returns None if input is None."""
    if text is None:
        return None
    return _HTML_TAG_RE.sub("", text)


def _sanitize_log_job_payload(body: LogJobRequest) -> dict:
    """Return sanitized fields for create/update without clobbering omitted update fields."""
    sanitized_jd = _strip_html(body.job_description)

    job_type = body.job_type
    employment_type = body.employment_type
    location = _strip_html(body.location)
    salary_range = _strip_html(body.salary_range)

    if sanitized_jd and not all([job_type, employment_type, location, salary_range]):
        extracted = extract_job_info(sanitized_jd)
        if not job_type:
            job_type = extracted.get("job_type")
        if not employment_type:
            employment_type = extracted.get("employment_type")
        if not location:
            location = extracted.get("location")
        if not salary_range:
            salary_range = extracted.get("salary_range")

    sanitized = {
        "company": _strip_html(body.company),
        "title": _strip_html(body.title),
        "url": body.url,
        "job_description": sanitized_jd,
        "status": body.status,
        "job_type": job_type,
        "employment_type": employment_type,
        "location": location,
        "salary_range": salary_range,
        "notes": _strip_html(body.notes),
    }

    if body.job_id is None:
        return sanitized

    update_fields = {"company": sanitized["company"], "title": sanitized["title"]}
    for field in (
        "url",
        "job_description",
        "status",
        "job_type",
        "employment_type",
        "location",
        "salary_range",
        "notes",
    ):
        if field in body.model_fields_set:
            update_fields[field] = sanitized[field]
    return update_fields


@router.post("/extract-job-info", response_model=ExtractJobInfoResponse)
async def extract_job_info_endpoint(body: ExtractJobInfoRequest):
    """Extract job metadata from JD text using regex/heuristics.

    This endpoint is non-authenticated and does not touch the database.
    """
    sanitized_jd = _strip_html(body.job_description)
    if not sanitized_jd:
        return ExtractJobInfoResponse()

    result = extract_job_info(sanitized_jd)

    return ExtractJobInfoResponse(
        job_type=result.get("job_type"),
        employment_type=result.get("employment_type"),
        location=result.get("location"),
        salary_range=result.get("salary_range"),
    )


@router.post("/log-job", status_code=201)
async def log_job(
    body: LogJobRequest,
    client: Client = Depends(get_supabase_client),
    user_id: str = Depends(get_user_id),
):
    """Create a new job entry or update an existing one.

    - If body.job_id is provided: update the existing job (returns 200).
    - If body.job_id is absent: create a new job (returns 201).
    Input text fields are sanitized to strip any HTML tags.
    """
    db = DBService(client, user_id)

    sanitized = _sanitize_log_job_payload(body)

    if body.job_id is not None:
        # Update path — returns 200 (override the 201 default via Response)
        try:
            row = db.update_job(str(body.job_id), sanitized)
        except Exception as exc:
            raise HTTPException(status_code=404, detail="Job not found or not owned by user") from exc
        if not row:
            raise HTTPException(status_code=404, detail="Job not found or not owned by user")
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=200, content=LogJobResponse(**row).model_dump(mode="json"))

    # Create path
    row = db.create_job(sanitized)
    return LogJobResponse(**row)


@router.get("/jobs", response_model=list[JobListItem])
async def list_jobs(
    client: Client = Depends(get_supabase_client),
    user_id: str = Depends(get_user_id),
):
    """Return all jobs for the current user, ordered by created_at desc."""
    db = DBService(client, user_id)
    rows = db.get_jobs_for_user()
    return [JobListItem(**row) for row in rows]


@router.get("/job/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: UUID,
    client: Client = Depends(get_supabase_client),
    user_id: str = Depends(get_user_id),
):
    """Return the full job record including Q&A pairs, resumes, and chat messages.

    Returns 404 if the job does not exist or belongs to a different user.
    """
    db = DBService(client, user_id)

    job = db.get_job(str(job_id))
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    qa_pairs = db.get_qa_pairs_for_job(str(job_id))
    resumes = db.get_resumes_for_job(str(job_id))
    chat_messages = db.get_chat_messages_for_job(str(job_id))

    return JobResponse(
        **job,
        qa_pairs=qa_pairs or [],
        resumes=resumes or [],
        chat_messages=chat_messages or [],
    )


@router.delete("/job/{job_id}", status_code=204)
async def delete_job(
    job_id: UUID,
    client: Client = Depends(get_supabase_client),
    user_id: str = Depends(get_user_id),
):
    """Delete a job and all associated data (Q&A pairs cascade)."""
    db = DBService(client, user_id)
    deleted = db.delete_job(str(job_id))
    if not deleted:
        raise HTTPException(status_code=404, detail="Job not found")
