import json
import re
from pathlib import Path
from typing import Optional

from app.models.schemas import StructuredJobDescription
from app.services.ai_service import AIService
from app.services.job_info_extractor import extract_job_info

_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"

_MUST_HEADERS = (
    "requirements",
    "minimum qualifications",
    "basic qualifications",
    "must have",
    "what you bring",
    "you have",
    "qualifications",
)
_PREFERRED_HEADERS = (
    "preferred qualifications",
    "nice to have",
    "bonus points",
    "preferred",
    "ideal candidate",
)
_RESPONSIBILITY_HEADERS = (
    "responsibilities",
    "what you'll do",
    "what you will do",
    "your role",
    "role",
    "day to day",
)
_SENIORITY_PATTERNS = {
    "intern": r"\bintern(ship)?\b",
    "junior": r"\bjunior\b|\bentry[-\s]?level\b",
    "mid-level": r"\bmid[-\s]?level\b|\bintermediate\b",
    "senior": r"\bsenior\b|\bsr\.\b",
    "staff": r"\bstaff\b",
    "lead": r"\blead\b|\bprincipal\b",
    "manager": r"\bmanager\b|\bhead of\b",
}
_DOMAIN_TERMS = (
    "python",
    "typescript",
    "javascript",
    "react",
    "next.js",
    "node.js",
    "fastapi",
    "django",
    "aws",
    "lambda",
    "docker",
    "kubernetes",
    "postgresql",
    "mysql",
    "mongodb",
    "redis",
    "graphql",
    "rest",
    "langchain",
    "rag",
    "llm",
    "ai",
    "ml",
    "data pipelines",
    "microservices",
    "terraform",
)

_ROLE_FOCUS_HINTS = (
    ("agentic", "AI engineer focused on agentic AI pipelines, workflow automation, and contextual intelligence"),
    ("rag", "AI engineer focused on RAG systems, contextual intelligence, and workflow automation"),
    ("llm", "AI engineer focused on LLM-powered systems, prompt engineering, and workflow automation"),
    ("langchain", "AI engineer focused on LangChain-based LLM systems, orchestration, and contextual AI workflows"),
    ("next.js", "Full-stack engineer focused on modern web application development and product delivery"),
    ("react", "Frontend-leaning full-stack engineer focused on product-facing web application development"),
    ("fastapi", "Backend/full-stack engineer focused on API systems, product workflows, and scalable application delivery"),
)


def _load_prompt(name: str) -> str:
    return (_PROMPTS_DIR / name).read_text()


def _normalize_line(line: str) -> str:
    line = re.sub(r"\s+", " ", line).strip(" \t\r\n-•*:")
    return line


def _dedupe_keep_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        cleaned = _normalize_line(value)
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(cleaned)
    return result


def _append_bullet(target: list[str], line: str) -> None:
    cleaned = _normalize_line(line)
    if cleaned:
        target.append(cleaned)


def extract_structured_jd_heuristics(text: str) -> StructuredJobDescription:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    current_section: Optional[str] = None
    must: list[str] = []
    preferred: list[str] = []
    responsibilities: list[str] = []

    for raw_line in lines:
        line = _normalize_line(raw_line)
        lower = line.lower()
        if lower in _MUST_HEADERS:
            current_section = "must"
            continue
        if lower in _PREFERRED_HEADERS:
            current_section = "preferred"
            continue
        if lower in _RESPONSIBILITY_HEADERS:
            current_section = "responsibilities"
            continue

        is_bullet = raw_line.lstrip().startswith(("-", "•", "*")) or lower.startswith("you will ")
        if current_section == "must" and (is_bullet or len(line) < 180):
            _append_bullet(must, line)
            continue
        if current_section == "preferred" and (is_bullet or len(line) < 180):
            _append_bullet(preferred, line)
            continue
        if current_section == "responsibilities" and (is_bullet or len(line) < 220):
            _append_bullet(responsibilities, line)
            continue

    info = extract_job_info(text)
    text_lower = text.lower()
    seniority = None
    for label, pattern in _SENIORITY_PATTERNS.items():
        if re.search(pattern, text_lower):
            seniority = label
            break

    domain_keywords = [
        term
        for term in _DOMAIN_TERMS
        if re.search(rf"\b{re.escape(term)}\b", text_lower)
    ]

    combined_skill_lines = " ".join(must + preferred)
    discovered_skills = [
        term
        for term in _DOMAIN_TERMS
        if re.search(rf"\b{re.escape(term)}\b", combined_skill_lines.lower())
    ]

    role_focus = None
    for term, description in _ROLE_FOCUS_HINTS:
        if re.search(rf"\b{re.escape(term)}\b", text_lower):
            role_focus = description
            break

    return StructuredJobDescription(
        role_focus=role_focus,
        must_have_skills=_dedupe_keep_order(discovered_skills[:12] + must[:8]),
        preferred_skills=_dedupe_keep_order(preferred[:8]),
        responsibilities=_dedupe_keep_order(responsibilities[:8]),
        domain_keywords=_dedupe_keep_order(domain_keywords[:12]),
        seniority=seniority,
        work_mode=info.get("job_type"),
        employment_type=info.get("employment_type"),
    )


async def normalize_structured_jd_with_ai(
    text: str,
    heuristic: StructuredJobDescription,
    ai: AIService,
) -> StructuredJobDescription:
    prompt = _load_prompt("structured_job_description.txt").replace(
        "{job_description}",
        text,
    ).replace(
        "{heuristic_summary}",
        json.dumps(heuristic.model_dump(), indent=2),
    )
    result = await ai.json_completion(
        system_prompt="You normalize job descriptions into structured JSON. Return ONLY valid JSON.",
        user_message=prompt,
    )
    normalized = StructuredJobDescription.model_validate(result)
    return StructuredJobDescription(
        role_focus=normalized.role_focus or heuristic.role_focus,
        must_have_skills=_dedupe_keep_order(normalized.must_have_skills or heuristic.must_have_skills),
        preferred_skills=_dedupe_keep_order(normalized.preferred_skills or heuristic.preferred_skills),
        responsibilities=_dedupe_keep_order(normalized.responsibilities or heuristic.responsibilities),
        domain_keywords=_dedupe_keep_order(normalized.domain_keywords or heuristic.domain_keywords),
        seniority=normalized.seniority or heuristic.seniority,
        work_mode=normalized.work_mode or heuristic.work_mode,
        employment_type=normalized.employment_type or heuristic.employment_type,
    )


async def build_structured_job_description(
    text: str,
    ai: Optional[AIService] = None,
    use_ai_normalization: bool = False,
) -> StructuredJobDescription:
    heuristic = extract_structured_jd_heuristics(text)
    if not use_ai_normalization or ai is None:
        return heuristic
    try:
        return await normalize_structured_jd_with_ai(text, heuristic, ai)
    except Exception:
        return heuristic
