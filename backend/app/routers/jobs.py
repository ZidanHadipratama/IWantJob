"""Job endpoints: POST /log-job (create/update), GET /job/:id (full detail)."""
import re
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.dependencies import get_supabase_client, get_user_id
from app.models.schemas import JobResponse, LogJobRequest, LogJobResponse
from app.services.db_service import DBService

router = APIRouter(tags=["jobs"])

_HTML_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(text: Optional[str]) -> Optional[str]:
    """Remove HTML tags from a string. Returns None if input is None."""
    if text is None:
        return None
    return _HTML_TAG_RE.sub("", text)


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

    # Sanitize text fields
    sanitized = {
        "company": _strip_html(body.company),
        "title": _strip_html(body.title),
        "url": body.url,
        "job_description": _strip_html(body.job_description),
        "status": body.status,
    }

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
        qa_pairs=qa_pairs,
        resumes=resumes,
        chat_messages=chat_messages,
    )
