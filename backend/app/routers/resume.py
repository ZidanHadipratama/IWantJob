"""Resume endpoints: upload PDF, save text, and Phase 3 stubs."""
import os
import re
import tempfile

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from marker.converters.pdf import PdfConverter
from marker.models import create_model_dict
from pydantic import BaseModel
from supabase import Client

from app.dependencies import get_supabase_client, get_user_id
from app.services.db_service import DBService

router = APIRouter(tags=["resume"])

_HTML_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(text: str) -> str:
    return _HTML_TAG_RE.sub("", text)


class SaveResumeTextRequest(BaseModel):
    resume_text: str


@router.post("/tailor-resume")
async def tailor_resume():
    raise HTTPException(status_code=501, detail="Not implemented - Phase 3")


@router.post("/generate-pdf")
async def generate_pdf():
    raise HTTPException(status_code=501, detail="Not implemented - Phase 3")


@router.post("/upload-resume")
async def upload_resume(
    file: UploadFile,
    client: Client = Depends(get_supabase_client),
    user_id: str = Depends(get_user_id),
):
    """Accept a PDF file, extract its text via marker-pdf, and save as base resume.

    Returns the extracted text and a success message.
    Raises 400 for non-PDF files or unreadable PDFs.
    Supports image-based and scanned PDFs via marker-pdf OCR.
    """
    # Validate content type
    content_type = file.content_type or ""
    if "pdf" not in content_type.lower():
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are accepted. Please upload a .pdf file.",
        )

    # Read file bytes
    file_bytes = await file.read()

    # Extract text via marker-pdf (supports image-based and scanned PDFs)
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
        converter = PdfConverter(artifact_dict=create_model_dict())
        rendered = converter(tmp_path)
        extracted_text = rendered.markdown.strip()
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="Could not extract text from PDF. The file may be corrupt or unreadable.",
        ) from exc
    finally:
        if 'tmp_path' in locals():
            os.unlink(tmp_path)

    if not extracted_text:
        raise HTTPException(
            status_code=400,
            detail="Could not extract text from PDF. The file may be image-only or empty.",
        )

    # Sanitize extracted text
    extracted_text = _strip_html(extracted_text)

    db = DBService(client, user_id)
    db.save_base_resume(extracted_text)
    db.upsert_user({"base_resume_text": extracted_text})

    return {
        "resume_text": extracted_text,
        "message": "Resume uploaded and parsed successfully",
    }


@router.post("/save-resume-text")
async def save_resume_text(
    body: SaveResumeTextRequest,
    client: Client = Depends(get_supabase_client),
    user_id: str = Depends(get_user_id),
):
    """Accept plain resume text and save as base resume.

    Returns the saved text and a success message.
    Raises 400 if text is empty or whitespace-only.
    """
    text = body.resume_text.strip()
    if not text:
        raise HTTPException(
            status_code=400,
            detail="resume_text cannot be empty",
        )

    text = _strip_html(text)

    db = DBService(client, user_id)
    db.save_base_resume(text)
    db.upsert_user({"base_resume_text": text})

    return {
        "resume_text": text,
        "message": "Resume saved successfully",
    }
