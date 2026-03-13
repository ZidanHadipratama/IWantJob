import logging
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.datastructures import Headers
from starlette.types import ASGIApp, Message, Receive, Scope, Send

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

app = FastAPI(title="IWantJob API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_origin_regex=r"^(chrome-extension://.*|http://localhost:\d+)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RequestLoggingMiddleware:
    """ASGI middleware that logs request and response metadata without using call_next."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "GET")
        path = scope.get("path", "")
        if method == "OPTIONS":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        ai_provider = headers.get("x-ai-provider", "-")
        ai_model = headers.get("x-ai-model", "-")
        has_ai_key = "yes" if headers.get("x-ai-key") else "no"
        has_sb_url = "yes" if headers.get("x-supabase-url") else "no"
        has_sb_key = "yes" if headers.get("x-supabase-key") else "no"
        user_id = headers.get("x-user-id", "-")

        logger.info(
            ">>> %s %s | user=%s | ai=%s/%s key=%s | supabase url=%s key=%s",
            method,
            path,
            user_id,
            ai_provider,
            ai_model,
            has_ai_key,
            has_sb_url,
            has_sb_key,
        )

        start = time.time()
        status_code: int | None = None

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = int(message["status"])
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            elapsed = time.time() - start
            logger.info(
                "<<< %s %s | %s | %.1fs",
                method,
                path,
                status_code if status_code is not None else "-",
                elapsed,
            )


app.add_middleware(RequestLoggingMiddleware)


app.include_router(resume.router)
app.include_router(form.router)
app.include_router(jobs.router)
app.include_router(connection.router)


@app.get("/health", response_model=dict)
async def health_check():
    return {"status": "ok", "service": "iwantjob-backend"}
