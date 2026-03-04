from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["chat"])


@router.post("/chat")
async def chat():
    raise HTTPException(status_code=501, detail="Not implemented - Phase 3")
