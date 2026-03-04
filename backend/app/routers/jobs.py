from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["jobs"])


@router.get("/job/{job_id}")
async def get_job(job_id: str):
    raise HTTPException(status_code=501, detail="Not implemented - Phase 3")


@router.post("/log-job")
async def log_job():
    raise HTTPException(status_code=501, detail="Not implemented - Phase 3")
