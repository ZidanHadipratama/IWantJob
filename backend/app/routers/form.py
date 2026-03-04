"""Form endpoints: POST /fill-form (Phase 3 stub), POST /save-qa (implemented)."""
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.dependencies import get_supabase_client, get_user_id
from app.models.schemas import SaveQARequest
from app.services.db_service import DBService

router = APIRouter(tags=["form"])


@router.post("/fill-form")
async def fill_form():
    raise HTTPException(status_code=501, detail="Not implemented - Phase 3")


@router.post("/save-qa")
async def save_qa(
    body: SaveQARequest,
    client: Client = Depends(get_supabase_client),
    user_id: str = Depends(get_user_id),
):
    """Upsert Q&A pairs for a job by (job_id, field_id) unique key.

    Returns the saved pairs and a count of records upserted.
    Raises 400 if qa_pairs list is empty.
    """
    if not body.qa_pairs:
        raise HTTPException(status_code=400, detail="qa_pairs list cannot be empty")

    db = DBService(client, user_id)
    pairs_data = [pair.model_dump() for pair in body.qa_pairs]
    result = db.upsert_qa_pairs(str(body.job_id), pairs_data)
    return {"saved": len(result), "qa_pairs": result}
