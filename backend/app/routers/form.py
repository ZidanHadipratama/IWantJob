from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["form"])


@router.post("/fill-form")
async def fill_form():
    raise HTTPException(status_code=501, detail="Not implemented - Phase 3")


@router.post("/save-qa")
async def save_qa():
    raise HTTPException(status_code=501, detail="Not implemented - Phase 3")
