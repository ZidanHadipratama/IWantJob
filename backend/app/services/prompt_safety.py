import json
import re
from typing import Optional

from app.models.schemas import ResumeContact, ResumeJSON, UserProfile

_EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
_PHONE_RE = re.compile(r"(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)")
_ADDRESS_KEYWORDS_RE = re.compile(
    r"\b(street|st\.|road|rd\.|avenue|ave\.|boulevard|blvd\.|lane|ln\.|suite|apt|apartment|floor|unit)\b",
    re.IGNORECASE,
)

_NAME_FIELD_RE = re.compile(r"\b(full name|first name|last name|name)\b", re.IGNORECASE)
_EMAIL_FIELD_RE = re.compile(r"\bemail\b", re.IGNORECASE)
_PHONE_FIELD_RE = re.compile(r"\b(phone|mobile|telephone|whatsapp)\b", re.IGNORECASE)
_ADDRESS_FIELD_RE = re.compile(r"\b(address|city|country of residence|country|location)\b", re.IGNORECASE)
_LINKEDIN_FIELD_RE = re.compile(r"\blinkedin\b", re.IGNORECASE)
_GITHUB_FIELD_RE = re.compile(r"\bgithub\b", re.IGNORECASE)
_WEBSITE_FIELD_RE = re.compile(r"\b(portfolio|website|personal site|site)\b", re.IGNORECASE)


def redact_free_text(text: str) -> str:
    redacted = _EMAIL_RE.sub("[redacted email]", text)
    redacted = _PHONE_RE.sub("[redacted phone]", redacted)
    return redacted


def _coarsen_location(location: Optional[str]) -> Optional[str]:
    if not location:
        return None
    cleaned = location.strip()
    if not cleaned:
        return None
    if _ADDRESS_KEYWORDS_RE.search(cleaned):
        return None
    parts = [part.strip() for part in cleaned.split(",") if part.strip()]
    if len(parts) >= 2:
        return ", ".join(parts[-2:])
    return cleaned


def resume_json_to_prompt_text(rj: ResumeJSON) -> str:
    lines: list[str] = []
    contact_context: list[str] = []
    safe_location = _coarsen_location(rj.contact.location)
    if safe_location:
        contact_context.append(f"Region: {safe_location}")
    if rj.contact.work_authorization:
        contact_context.append(f"Work Authorization: {rj.contact.work_authorization}")
    if contact_context:
        lines.extend(contact_context)
        lines.append("")

    if rj.summary:
        lines.append("SUMMARY")
        lines.append(redact_free_text(rj.summary))
        lines.append("")

    if rj.skills:
        lines.append("SKILLS")
        for cat, vals in [
            ("Languages", rj.skills.languages),
            ("Frameworks", rj.skills.frameworks),
            ("Tools", rj.skills.tools),
            ("Other", rj.skills.other),
        ]:
            if vals:
                lines.append(f"  {cat}: {', '.join(vals)}")
        lines.append("")

    for section in rj.sections:
        lines.append(section.title.upper())
        for entry in section.entries:
            if entry.heading:
                parts = [redact_free_text(entry.heading)]
                if entry.location:
                    coarse_location = _coarsen_location(entry.location)
                    if coarse_location:
                        parts.append(coarse_location)
                lines.append(" | ".join(parts))
            if entry.subheading:
                parts = [redact_free_text(entry.subheading)]
                if entry.dates:
                    parts.append(entry.dates)
                lines.append("  " + " | ".join(parts))
            elif entry.dates:
                lines.append(f"  {entry.dates}")
            for bullet in entry.bullets:
                lines.append(f"  - {redact_free_text(bullet)}")
            lines.append("")

    return "\n".join(lines).strip()


def build_sanitized_profile(user_profile: Optional[UserProfile], resume_json: Optional[ResumeJSON]) -> str:
    profile_parts: list[str] = []
    if user_profile:
        if user_profile.work_authorization:
            profile_parts.append(f"Work Authorization: {user_profile.work_authorization}")
        if user_profile.linkedin_url:
            profile_parts.append(f"LinkedIn: {user_profile.linkedin_url}")
        if user_profile.github_url:
            profile_parts.append(f"GitHub: {user_profile.github_url}")
    elif resume_json and resume_json.contact:
        contact = resume_json.contact
        safe_location = _coarsen_location(contact.location)
        if safe_location:
            profile_parts.append(f"Region: {safe_location}")
        if contact.work_authorization:
            profile_parts.append(f"Work Authorization: {contact.work_authorization}")
        if contact.linkedin:
            profile_parts.append(f"LinkedIn: {contact.linkedin}")
        if contact.github:
            profile_parts.append(f"GitHub: {contact.github}")
        if contact.website:
            profile_parts.append(f"Website: {contact.website}")
    return "\n".join(profile_parts) if profile_parts else "Not provided"


def maybe_parse_resume_json(raw: Optional[str]) -> Optional[ResumeJSON]:
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    try:
        return ResumeJSON.model_validate(parsed)
    except Exception:
        return None


def build_direct_form_answers(
    form_fields: list[dict],
    resume_json: Optional[ResumeJSON],
    user_profile: Optional[UserProfile],
) -> tuple[list[dict], list[dict]]:
    contact: Optional[ResumeContact] = resume_json.contact if resume_json else None
    direct_answers: list[dict] = []
    remaining_fields: list[dict] = []

    for field in form_fields:
        label = str(field.get("label") or "")
        name = str(field.get("name") or "")
        field_id = str(field.get("field_id") or "")
        haystack = " ".join([label, name, field_id]).strip().lower()

        answer: Optional[str] = None
        if _EMAIL_FIELD_RE.search(haystack):
            answer = user_profile.email if user_profile else contact.email if contact else None
        elif _PHONE_FIELD_RE.search(haystack):
            answer = contact.phone if contact else None
        elif _NAME_FIELD_RE.search(haystack):
            if "first" in haystack:
                full_name = user_profile.name if user_profile else contact.name if contact else None
                answer = full_name.split()[0] if full_name else None
            elif "last" in haystack:
                full_name = user_profile.name if user_profile else contact.name if contact else None
                answer = full_name.split()[-1] if full_name and len(full_name.split()) > 1 else None
            else:
                answer = user_profile.name if user_profile else contact.name if contact else None
        elif _LINKEDIN_FIELD_RE.search(haystack):
            answer = user_profile.linkedin_url if user_profile else contact.linkedin if contact else None
        elif _GITHUB_FIELD_RE.search(haystack):
            answer = user_profile.github_url if user_profile else contact.github if contact else None
        elif _WEBSITE_FIELD_RE.search(haystack):
            answer = contact.website if contact else None
        elif _ADDRESS_FIELD_RE.search(haystack):
            answer = _coarsen_location(contact.location if contact else None)

        if answer:
            direct_answers.append(
                {
                    "field_id": field.get("field_id", ""),
                    "label": field.get("label", ""),
                    "answer": answer,
                    "field_type": field.get("type", field.get("field_type", "text")),
                }
            )
        else:
            remaining_fields.append(field)

    return direct_answers, remaining_fields
