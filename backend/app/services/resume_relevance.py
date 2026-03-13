import re
from typing import Optional

from app.models.schemas import ResumeJSON, StructuredJobDescription

_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9.+/#-]*")
_STOPWORDS = {
    "and",
    "the",
    "with",
    "for",
    "that",
    "this",
    "from",
    "into",
    "your",
    "will",
    "have",
    "has",
    "you",
    "are",
    "our",
    "their",
    "about",
    "using",
    "used",
    "build",
    "role",
}


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _truncate(text: str, limit: int = 160) -> str:
    cleaned = _normalize(text)
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 3].rstrip() + "..."


def _tokens(text: str) -> set[str]:
    return {
        token
        for token in _TOKEN_RE.findall(text.lower())
        if len(token) > 2 and token not in _STOPWORDS
    }


def _skill_inventory(resume_json: ResumeJSON) -> set[str]:
    skills = resume_json.skills
    if not skills:
        return set()

    values: set[str] = set()
    for bucket in (skills.languages, skills.frameworks, skills.tools, skills.other):
        for value in bucket or []:
            values.add(_normalize(value).lower())
    return values


def _resume_evidence_items(resume_json: ResumeJSON) -> list[dict]:
    items: list[dict] = []

    if resume_json.summary:
        items.append(
            {
                "label": "Summary",
                "text": resume_json.summary,
            }
        )

    for section in resume_json.sections:
        for entry in section.entries:
            parts = [entry.heading or "", entry.subheading or "", " ".join(entry.bullets or [])]
            combined = _normalize(" ".join(part for part in parts if part))
            if not combined:
                continue
            label_parts = [section.title]
            if entry.heading:
                label_parts.append(entry.heading)
            if entry.subheading:
                label_parts.append(entry.subheading)
            items.append(
                {
                    "label": " | ".join(part for part in label_parts if part),
                    "text": combined,
                }
            )
    return items


def _resume_entry_items(resume_json: ResumeJSON) -> list[dict]:
    items: list[dict] = []
    for section in resume_json.sections:
        section_title = _normalize(section.title)
        lower_section = section_title.lower()
        if "project" in lower_section:
            section_kind = "project"
        elif "leadership" in lower_section or "organization" in lower_section:
            section_kind = "leadership"
        elif "experience" in lower_section:
            section_kind = "experience"
        else:
            section_kind = "other"

        for entry in section.entries:
            parts = [entry.heading or "", entry.subheading or "", " ".join(entry.bullets or [])]
            combined = _normalize(" ".join(part for part in parts if part))
            if not combined:
                continue
            items.append(
                {
                    "section_title": section_title,
                    "section_kind": section_kind,
                    "heading": _normalize(entry.heading or ""),
                    "subheading": _normalize(entry.subheading or ""),
                    "text": combined,
                }
            )
    return items


def _score_signal_against_text(signal_text: str, signal_terms: set[str], text: str) -> int:
    lowered = text.lower()
    score = 0
    normalized_signal = _normalize(signal_text).lower()
    if normalized_signal and normalized_signal in lowered:
        score += 6
    overlap = signal_terms & _tokens(text)
    score += len(overlap) * 2
    return score


def _score_signal_against_skills(signal_text: str, signal_terms: set[str], skills: set[str]) -> int:
    normalized_signal = _normalize(signal_text).lower()
    if normalized_signal in skills:
        return 8
    return sum(1 for skill in skills if skill in signal_terms or any(term in skill for term in signal_terms))


def _match_signal(
    signal_kind: str,
    signal_text: str,
    skills: set[str],
    evidence_items: list[dict],
) -> tuple[int, list[str]]:
    signal_terms = _tokens(signal_text)
    if not signal_terms:
        return 0, []

    matches: list[tuple[int, str]] = []
    skill_score = _score_signal_against_skills(signal_text, signal_terms, skills)
    if skill_score > 0:
        matches.append((skill_score, f"Skills: {_normalize(signal_text)}"))

    for item in evidence_items:
        score = _score_signal_against_text(signal_text, signal_terms, item["text"])
        if score <= 0:
            continue
        matches.append((score, f"{item['label']}: {_truncate(item['text'])}"))

    if not matches:
        return 0, []

    matches.sort(key=lambda match: match[0], reverse=True)
    top_matches: list[str] = []
    seen: set[str] = set()
    for _, description in matches:
        if description in seen:
            continue
        seen.add(description)
        top_matches.append(description)
        if len(top_matches) == 2:
            break
    return matches[0][0], top_matches


def build_ranked_resume_alignment_brief(
    structured_jd: StructuredJobDescription,
    resume_json: Optional[ResumeJSON],
    fallback_resume_text: Optional[str] = None,
) -> str:
    if not resume_json and not fallback_resume_text:
        return "No ranked overlap available."

    skills = _skill_inventory(resume_json) if resume_json else set()
    evidence_items = _resume_evidence_items(resume_json) if resume_json else []
    if fallback_resume_text:
        evidence_items.append({"label": "Resume evidence", "text": fallback_resume_text})

    signals: list[tuple[int, str, str]] = []
    for skill in structured_jd.must_have_skills:
        signals.append((400, "Must-have skill", skill))
    for responsibility in structured_jd.responsibilities:
        signals.append((300, "Responsibility", responsibility))
    for keyword in structured_jd.domain_keywords:
        signals.append((200, "Domain keyword", keyword))
    for preferred in structured_jd.preferred_skills:
        signals.append((100, "Preferred skill", preferred))

    ranked_lines: list[str] = []
    ranked_matches: list[tuple[int, int, str, str, list[str]]] = []
    seen_signals: set[tuple[str, str]] = set()

    if structured_jd.role_focus:
        focus_terms = _tokens(structured_jd.role_focus)
        focus_matches: list[str] = []
        if focus_terms:
            for item in evidence_items:
                score = _score_signal_against_text(structured_jd.role_focus, focus_terms, item["text"])
                if score <= 0:
                    continue
                focus_matches.append(f"{item['label']}: {_truncate(item['text'])}")
                if len(focus_matches) == 2:
                    break
        ranked_lines.append(f"Role focus: {_normalize(structured_jd.role_focus)}")
        if focus_matches:
            for match in focus_matches:
                ranked_lines.append(f"  - Support: {match}")

    for base_priority, signal_kind, signal_text in signals:
        signal_key = (signal_kind, _normalize(signal_text).lower())
        if not signal_text or signal_key in seen_signals:
            continue
        seen_signals.add(signal_key)
        support_score, matches = _match_signal(signal_kind, signal_text, skills, evidence_items)
        if support_score <= 0:
            continue
        ranked_matches.append((base_priority, support_score, signal_kind, signal_text, matches))

    ranked_matches.sort(key=lambda item: (item[0], item[1]), reverse=True)

    for index, (_, _, signal_kind, signal_text, matches) in enumerate(ranked_matches[:6], start=1):
        ranked_lines.append(f"{index}. {signal_kind}: {_normalize(signal_text)}")
        for match in matches:
            ranked_lines.append(f"   - Support: {match}")

    if not ranked_lines:
        return "No strong ranked overlap was identified from the current resume evidence."

    return "\n".join(ranked_lines)


def _signal_specs(structured_jd: StructuredJobDescription) -> list[tuple[int, str, str]]:
    specs: list[tuple[int, str, str]] = []
    if structured_jd.role_focus:
        specs.append((500, "Role focus", structured_jd.role_focus))
    for skill in structured_jd.must_have_skills:
        specs.append((400, "Must-have skill", skill))
    for responsibility in structured_jd.responsibilities:
        specs.append((320, "Responsibility", responsibility))
    for keyword in structured_jd.domain_keywords:
        specs.append((220, "Domain keyword", keyword))
    for preferred in structured_jd.preferred_skills:
        specs.append((120, "Preferred skill", preferred))
    return specs


def _score_entry(
    entry: dict,
    structured_jd: StructuredJobDescription,
    skills: set[str],
) -> tuple[int, list[str]]:
    text = entry["text"]
    entry_tokens = _tokens(text)
    heading_tokens = _tokens(" ".join(part for part in [entry["heading"], entry["subheading"]] if part))
    score = 0
    reasons: list[str] = []

    if entry["section_kind"] == "project":
        score += 18
    elif entry["section_kind"] == "experience":
        score += 14
    elif entry["section_kind"] == "leadership":
        score += 4

    text_lower = text.lower()
    for base_weight, signal_kind, signal_text in _signal_specs(structured_jd):
        normalized_signal = _normalize(signal_text).lower()
        signal_terms = _tokens(signal_text)
        if not signal_terms:
            continue

        overlap = signal_terms & entry_tokens
        signal_score = 0
        if normalized_signal and normalized_signal in text_lower:
            signal_score += base_weight
        signal_score += len(overlap) * max(6, base_weight // 40)
        signal_score += len(signal_terms & heading_tokens) * max(10, base_weight // 30)

        if signal_kind.endswith("skill"):
            if normalized_signal in skills:
                signal_score += 10

        if signal_score > 0:
            score += signal_score
            reasons.append(f"{signal_kind}: {_normalize(signal_text)}")

    unique_reasons: list[str] = []
    seen: set[str] = set()
    for reason in reasons:
        if reason in seen:
            continue
        seen.add(reason)
        unique_reasons.append(reason)
        if len(unique_reasons) == 3:
            break

    return score, unique_reasons


def build_ranked_entry_ordering_brief(
    structured_jd: StructuredJobDescription,
    resume_json: Optional[ResumeJSON],
) -> str:
    if not resume_json:
        return "No project or experience ordering hints available."

    entry_items = _resume_entry_items(resume_json)
    if not entry_items:
        return "No project or experience ordering hints available."

    skills = _skill_inventory(resume_json)
    ranked_projects: list[tuple[int, dict, list[str]]] = []
    ranked_experience: list[tuple[int, dict, list[str]]] = []
    ranked_leadership: list[tuple[int, dict, list[str]]] = []

    for entry in entry_items:
        score, reasons = _score_entry(entry, structured_jd, skills)
        if score <= 0:
            continue
        if entry["section_kind"] == "project":
            ranked_projects.append((score, entry, reasons))
        elif entry["section_kind"] == "experience":
            ranked_experience.append((score, entry, reasons))
        elif entry["section_kind"] == "leadership":
            ranked_leadership.append((score, entry, reasons))

    ranked_projects.sort(key=lambda item: item[0], reverse=True)
    ranked_experience.sort(key=lambda item: item[0], reverse=True)
    ranked_leadership.sort(key=lambda item: item[0], reverse=True)

    lines: list[str] = []
    if ranked_projects:
        lines.append("Recommended project order (highest relevance first):")
        for index, (_, entry, reasons) in enumerate(ranked_projects[:3], start=1):
            label = entry["heading"] or entry["subheading"] or entry["section_title"]
            lines.append(f"{index}. {label}")
            if reasons:
                lines.append(f"   - Why: {', '.join(reasons)}")

    if ranked_experience:
        if lines:
            lines.append("")
        lines.append("Recommended work experience order (highest relevance first):")
        for index, (_, entry, reasons) in enumerate(ranked_experience[:3], start=1):
            label = entry["heading"] or entry["subheading"] or entry["section_title"]
            lines.append(f"{index}. {label}")
            if reasons:
                lines.append(f"   - Why: {', '.join(reasons)}")

    if ranked_leadership:
        if lines:
            lines.append("")
        lines.append("Optional supporting leadership evidence (use only when it strengthens relevance):")
        for index, (_, entry, reasons) in enumerate(ranked_leadership[:2], start=1):
            label = entry["heading"] or entry["subheading"] or entry["section_title"]
            lines.append(f"{index}. {label}")
            if reasons:
                lines.append(f"   - Why: {', '.join(reasons)}")

    return "\n".join(lines) if lines else "No project or experience ordering hints available."
