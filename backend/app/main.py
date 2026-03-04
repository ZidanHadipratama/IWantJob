from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import resume, form, jobs, chat

app = FastAPI(title="IWantJob API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_origin_regex=r"^chrome-extension://.*$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(resume.router)
app.include_router(form.router)
app.include_router(jobs.router)
app.include_router(chat.router)


@app.get("/health", response_model=dict)
async def health_check():
    return {"status": "ok", "service": "iwantjob-backend"}
