import json
import logging
import time

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.routers import resume, form, jobs, connection

LOG_FILE = "iwantjob.log"
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_FILE, mode="a", encoding="utf-8"),
    ],
)
logger = logging.getLogger("iwantjob")

# Full AI logs — file only, no terminal
_full_ai_logger = logging.getLogger("iwantjob.ai.full")
_full_ai_logger.propagate = False  # don't send to terminal
_full_ai_logger.addHandler(logging.FileHandler(LOG_FILE, mode="a", encoding="utf-8"))

app = FastAPI(title="IWantJob API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_origin_regex=r"^(chrome-extension://.*|http://localhost:\d+)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log incoming requests and outgoing responses for debugging."""
    if request.method == "OPTIONS":
        return await call_next(request)

    # Log request
    ai_provider = request.headers.get("x-ai-provider", "-")
    ai_model = request.headers.get("x-ai-model", "-")
    has_ai_key = "yes" if request.headers.get("x-ai-key") else "no"
    has_sb_url = "yes" if request.headers.get("x-supabase-url") else "no"
    has_sb_key = "yes" if request.headers.get("x-supabase-key") else "no"
    user_id = request.headers.get("x-user-id", "-")

    logger.info(
        ">>> %s %s | user=%s | ai=%s/%s key=%s | supabase url=%s key=%s",
        request.method, request.url.path,
        user_id, ai_provider, ai_model, has_ai_key,
        has_sb_url, has_sb_key,
    )

    start = time.time()
    response: Response = await call_next(request)
    elapsed = time.time() - start

    logger.info(
        "<<< %s %s | %d | %.1fs",
        request.method, request.url.path,
        response.status_code, elapsed,
    )
    return response


app.include_router(resume.router)
app.include_router(form.router)
app.include_router(jobs.router)
app.include_router(connection.router)


@app.get("/health", response_model=dict)
async def health_check():
    return {"status": "ok", "service": "iwantjob-backend"}
