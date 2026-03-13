import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4


ROOT = Path(__file__).resolve().parents[2]
TRACE_DIR = ROOT / "logs"
TRACE_FILE = TRACE_DIR / "prompt-trace.jsonl"


def new_trace_id() -> str:
    return str(uuid4())


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _json_safe(inner) for key, inner in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(inner) for inner in value]
    if hasattr(value, "model_dump"):
        return _json_safe(value.model_dump())
    if isinstance(value, Path):
        return str(value)
    return value


def _truncate_text(text: Optional[str], limit: int = 1500) -> Optional[str]:
    if text is None:
        return None
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def write_prompt_trace(
    trace_id: str,
    stage: str,
    payload: dict[str, Any],
) -> None:
    TRACE_DIR.mkdir(parents=True, exist_ok=True)
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "trace_id": trace_id,
        "stage": stage,
        "payload": _json_safe(payload),
    }
    with TRACE_FILE.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=True) + "\n")


def build_resume_trace_summary(resume_text: str) -> dict[str, Any]:
    lines = [line.strip() for line in resume_text.splitlines() if line.strip()]
    return {
        "line_count": len(lines),
        "preview": _truncate_text(resume_text),
    }


def build_prompt_trace_summary(prompt: str) -> dict[str, Any]:
    sections = []
    for marker in (
        "Detected Page Context:",
        "Structured Job Summary:",
        "Ranked JD-to-Resume Overlap Brief:",
        "Ranked Project and Experience Ordering Brief:",
        "Job Description:",
        "Candidate Resume:",
    ):
        if marker in prompt:
            sections.append(marker.rstrip(":"))
    return {
        "sections": sections,
        "preview": _truncate_text(prompt),
    }
