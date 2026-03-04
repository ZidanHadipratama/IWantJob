from uuid import UUID
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator


class UserProfile(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str
    email: str
    work_authorization: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if "@" not in v:
            raise ValueError("Invalid email address")
        return v.lower()


class FillFormRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    form_fields: list[dict]
    resume_text: str
    user_profile: UserProfile
    job_id: Optional[UUID] = None
    job_description: Optional[str] = None


class FillFormResponse(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    answers: list[dict]
    job_id: UUID


class TailorResumeRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    job_description: str
    resume_text: str
    user_profile: UserProfile


class TailorResumeResponse(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    tailored_resume_text: str
    match_score: float
    job_id: UUID


class LogJobRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    company: str
    title: str
    url: Optional[str] = None
    job_description: Optional[str] = None
    status: str = "saved"


class ChatRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    message: str
    job_id: UUID


class ChatResponse(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    reply: str
    job_id: UUID


class HealthResponse(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    status: str
    service: str
