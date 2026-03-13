"""LiteLLM wrapper for all AI calls."""
import json
import logging

import litellm

from app.dependencies import AIConfig

logger = logging.getLogger(__name__)

# Map our provider names to LiteLLM model prefixes
_PROVIDER_PREFIX = {
    "openai": "",           # LiteLLM uses OpenAI as default
    "anthropic": "anthropic/",
    "google": "gemini/",
    "deepseek": "deepseek/",
    "ollama": "ollama/",
}

# Providers that need a custom api_base
_PROVIDER_API_BASE = {
    "deepseek": "https://api.deepseek.com",
}


class AIService:
    """Wraps LiteLLM for completion calls using per-request AI config."""

    def __init__(self, config: AIConfig) -> None:
        self.config = config
        prefix = _PROVIDER_PREFIX.get(config.provider, "")
        self.model_string = f"{prefix}{config.model}"
        self.api_base = _PROVIDER_API_BASE.get(config.provider)

    async def completion(self, system_prompt: str, user_message: str) -> str:
        """Run a chat completion and return the assistant's text response."""
        logger.info(
            "AI completion request | model=%s provider=%s api_base=%s prompt_chars=%s message_chars=%s",
            self.model_string,
            self.config.provider,
            self.api_base or "default",
            len(system_prompt),
            len(user_message),
        )
        kwargs = {
            "model": self.model_string,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            "api_key": self.config.api_key if self.config.api_key else None,
            "timeout": 300,
        }
        if self.api_base:
            kwargs["api_base"] = self.api_base
        response = await litellm.acompletion(**kwargs)
        result = response.choices[0].message.content
        logger.info(
            "AI completion response | model=%s usage=%s response_chars=%s",
            response.model,
            getattr(response, 'usage', '-'),
            len(result) if isinstance(result, str) else 0,
        )
        return result

    async def json_completion(self, system_prompt: str, user_message: str) -> dict | list:
        """Run a chat completion expecting a JSON response. Parses and returns the result."""
        logger.info(
            "AI json request | model=%s provider=%s api_base=%s prompt_chars=%s message_chars=%s",
            self.model_string,
            self.config.provider,
            self.api_base or "default",
            len(system_prompt),
            len(user_message),
        )
        kwargs = {
            "model": self.model_string,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            "api_key": self.config.api_key if self.config.api_key else None,
            "timeout": 600,
        }
        if self.api_base:
            kwargs["api_base"] = self.api_base
        response = await litellm.acompletion(**kwargs)
        raw = response.choices[0].message.content
        logger.info(
            "AI json response | model=%s usage=%s response_chars=%s",
            response.model,
            getattr(response, 'usage', '-'),
            len(raw) if isinstance(raw, str) else 0,
        )
        text = raw.strip()
        # Strip markdown fences if present
        if text.startswith("```"):
            lines = text.split("\n")
            lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            text = "\n".join(lines)
        return json.loads(text)
