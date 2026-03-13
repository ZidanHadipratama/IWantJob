from uuid import UUID
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


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


# ── Resume JSON Schema ────────────────────────────────────────────────────


class ResumeContact(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    website: Optional[str] = None
    work_authorization: Optional[str] = None


class ResumeSectionEntry(BaseModel):
    heading: str = ""
    subheading: Optional[str] = None
    dates: Optional[str] = None
    location: Optional[str] = None
    url: Optional[str] = None
    bullets: list[str] = []


class ResumeSection(BaseModel):
    title: str
    entries: list[ResumeSectionEntry] = []


class ResumeSkills(BaseModel):
    languages: Optional[list[str]] = None
    frameworks: Optional[list[str]] = None
    tools: Optional[list[str]] = None
    other: Optional[list[str]] = None


class ResumeJSON(BaseModel):
    contact: ResumeContact
    summary: Optional[str] = None
    skills: Optional[ResumeSkills] = None
    sections: list[ResumeSection] = []


# ── Request / Response Models ─────────────────────────────────────────────


class ParseResumeRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    resume_text: str


class ExtractJobInfoRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    job_description: str


class ExtractJobInfoResponse(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    job_type: Optional[str] = None
    employment_type: Optional[str] = None
    location: Optional[str] = None
    salary_range: Optional[str] = None


class JobInfo(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    company: Optional[str] = None
    title: Optional[str] = None
    job_type: Optional[str] = None
    employment_type: Optional[str] = None
    location: Optional[str] = None
    salary_range: Optional[str] = None


class StructuredJobDescription(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    role_focus: Optional[str] = None
    must_have_skills: list[str] = Field(default_factory=list)
    preferred_skills: list[str] = Field(default_factory=list)
    responsibilities: list[str] = Field(default_factory=list)
    domain_keywords: list[str] = Field(default_factory=list)
    seniority: Optional[str] = None
    work_mode: Optional[str] = None
    employment_type: Optional[str] = None


class FillFormRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    form_fields: list[dict]
    resume_text: Optional[str] = None
    resume_json: Optional[ResumeJSON] = None
    persona_text: Optional[str] = None
    user_profile: Optional[UserProfile] = None
    job_id: Optional[UUID] = None
    job_description: Optional[str] = None
    structured_job_description: Optional[StructuredJobDescription] = None


class FillFormResponse(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    answers: list[dict]
    job_id: Optional[UUID] = None
    qa_saved: bool = False


class TailorResumeRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    job_description: str
    resume_text: Optional[str] = None
    resume_json: Optional[ResumeJSON] = None
    company: Optional[str] = None
    title: Optional[str] = None
    url: Optional[str] = None
    page_title: Optional[str] = None
    page_excerpt: Optional[str] = None
    metadata_lines: list[str] = Field(default_factory=list)
    persist_job: bool = False
    job_id: Optional[UUID] = None


class TailorResumeResponse(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    tailored_resume_json: ResumeJSON
    job_info: JobInfo
    structured_job_description: StructuredJobDescription
    match_score: float
    job_id: Optional[UUID] = None


class LogJobRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    job_id: Optional[UUID] = None
    company: str
    title: str
    url: Optional[str] = None
    job_description: Optional[str] = None
    status: str = "saved"
    job_type: Optional[str] = None
    employment_type: Optional[str] = None
    location: Optional[str] = None
    salary_range: Optional[str] = None
    structured_job_description: Optional[StructuredJobDescription] = None
    notes: Optional[str] = None


class HealthResponse(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    status: str
    service: str


class QAPair(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    field_id: str
    question: str
    answer: str
    field_type: str = "text"
    edited_by_user: bool = False


class SaveQARequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    job_id: UUID
    qa_pairs: list[QAPair]


class LogJobResponse(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    id: UUID
    company: str
    title: str
    status: str
    job_type: Optional[str] = "unknown"
    employment_type: Optional[str] = None
    location: Optional[str] = None
    salary_range: Optional[str] = None
    structured_job_description: Optional[StructuredJobDescription] = None
    notes: Optional[str] = None
    created_at: str


class SaveApplicationDraftRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    job_id: Optional[UUID] = None
    company: str
    title: str
    url: Optional[str] = None
    job_description: Optional[str] = None
    status: str = "saved"
    job_type: Optional[str] = None
    employment_type: Optional[str] = None
    location: Optional[str] = None
    salary_range: Optional[str] = None
    structured_job_description: Optional[StructuredJobDescription] = None
    notes: Optional[str] = None
    tailored_resume_json: ResumeJSON
    qa_pairs: list[QAPair] = Field(default_factory=list)


class SaveApplicationDraftResponse(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    job: LogJobResponse
    qa_pairs: list[dict] = Field(default_factory=list)
    resume_saved: bool = True


class JobListItem(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    id: UUID
    company: str
    title: str
    url: Optional[str] = None
    status: str
    job_type: Optional[str] = "unknown"
    employment_type: Optional[str] = None
    location: Optional[str] = None
    salary_range: Optional[str] = None
    structured_job_description: Optional[StructuredJobDescription] = None
    applied_at: Optional[str] = None
    created_at: str


class JobResponse(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    id: UUID
    company: str
    title: str
    url: Optional[str] = None
    job_description: Optional[str] = None
    status: str
    job_type: Optional[str] = "unknown"
    employment_type: Optional[str] = None
    location: Optional[str] = None
    salary_range: Optional[str] = None
    structured_job_description: Optional[StructuredJobDescription] = None
    applied_at: Optional[str] = None
    notes: Optional[str] = None
    created_at: str
    qa_pairs: list[dict] = Field(default_factory=list)
    resumes: list[dict] = Field(default_factory=list)
    chat_messages: list[dict] = Field(default_factory=list)


class TestConnectionResponse(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    connected: bool
    message: str
