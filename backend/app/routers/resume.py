from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["resume"])


@router.post("/tailor-resume")
async def tailor_resume():
    raise HTTPException(status_code=501, detail="Not implemented - Phase 3")


@router.post("/generate-pdf")
async def generate_pdf():
    raise HTTPException(status_code=501, detail="Not implemented - Phase 3")
