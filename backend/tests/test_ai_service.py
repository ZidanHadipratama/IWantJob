import logging
import os
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.dependencies import AIConfig
from app.services.ai_service import AIService


def _mock_completion_response(content: str):
    return SimpleNamespace(
        model="deepseek-chat",
        usage={"total_tokens": 42},
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))],
    )


@pytest.mark.asyncio
async def test_json_completion_uses_request_scoped_api_key_without_env_mutation(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    service = AIService(AIConfig(provider="deepseek", api_key="secret-key", model="deepseek-chat"))

    mock_completion = AsyncMock(return_value=_mock_completion_response('{"ok": true}'))

    with patch("app.services.ai_service.litellm.acompletion", mock_completion):
        result = await service.json_completion("system prompt", "user message")

    assert result == {"ok": True}
    kwargs = mock_completion.await_args.kwargs
    assert kwargs["api_key"] == "secret-key"
    assert kwargs["model"] == "deepseek/deepseek-chat"
    assert os.environ.get("DEEPSEEK_API_KEY") is None


@pytest.mark.asyncio
async def test_json_completion_does_not_log_raw_prompt_or_response(caplog):
    service = AIService(AIConfig(provider="deepseek", api_key="secret-key", model="deepseek-chat"))
    mock_completion = AsyncMock(return_value=_mock_completion_response('{"answer": "safe"}'))

    with patch("app.services.ai_service.litellm.acompletion", mock_completion), caplog.at_level(
        logging.INFO, logger="app.services.ai_service"
    ):
        await service.json_completion("SECRET_SYSTEM_PROMPT", "SECRET_USER_MESSAGE")

    log_text = "\n".join(record.getMessage() for record in caplog.records)
    assert "SECRET_SYSTEM_PROMPT" not in log_text
    assert "SECRET_USER_MESSAGE" not in log_text
    assert '{"answer": "safe"}' not in log_text
    assert "prompt_chars=" in log_text
    assert "response_chars=" in log_text
