"""LiteLLM wrapper for all AI calls."""
import json
import logging
import os

import litellm

from app.dependencies import AIConfig

logger = logging.getLogger(__name__)

# Separate logger for full untruncated output to file only
file_logger = logging.getLogger("iwantjob.ai.full")

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

    def _set_api_key(self) -> None:
        """Temporarily set the API key in environment for LiteLLM."""
        if self.config.provider == "openai":
            os.environ["OPENAI_API_KEY"] = self.config.api_key
        elif self.config.provider == "anthropic":
            os.environ["ANTHROPIC_API_KEY"] = self.config.api_key
        elif self.config.provider == "google":
            os.environ["GEMINI_API_KEY"] = self.config.api_key
        elif self.config.provider == "deepseek":
            os.environ["DEEPSEEK_API_KEY"] = self.config.api_key

    async def completion(self, system_prompt: str, user_message: str) -> str:
        """Run a chat completion and return the assistant's text response."""
        self._set_api_key()
        # Terminal: truncated
        logger.info(
            "--- AI REQUEST (completion) ---\n  model: %s\n  provider: %s\n  api_base: %s\n  system_prompt: %s...\n  user_message: %s...",
            self.model_string, self.config.provider, self.api_base or "default",
            system_prompt[:100], user_message[:200],
        )
        # File: full
        file_logger.info(
            "--- AI REQUEST (completion) FULL ---\n  model: %s\n  provider: %s\n  api_base: %s\n  system_prompt:\n%s\n  user_message:\n%s",
            self.model_string, self.config.provider, self.api_base or "default",
            system_prompt, user_message,
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
        # Terminal: truncated
        logger.info(
            "--- AI RESPONSE (completion) ---\n  model: %s\n  usage: %s\n  response: %s...",
            response.model, getattr(response, 'usage', '-'), result[:500],
        )
        # File: full
        file_logger.info(
            "--- AI RESPONSE (completion) FULL ---\n  model: %s\n  usage: %s\n  response:\n%s",
            response.model, getattr(response, 'usage', '-'), result,
        )
        return result

    async def json_completion(self, system_prompt: str, user_message: str) -> dict | list:
        """Run a chat completion expecting a JSON response. Parses and returns the result."""
        self._set_api_key()
        # Terminal: truncated
        logger.info(
            "--- AI REQUEST (json_completion) ---\n  model: %s\n  provider: %s\n  api_base: %s\n  system_prompt: %s...\n  user_message: %s...",
            self.model_string, self.config.provider, self.api_base or "default",
            system_prompt[:100], user_message[:200],
        )
        # File: full
        file_logger.info(
            "--- AI REQUEST (json_completion) FULL ---\n  model: %s\n  provider: %s\n  api_base: %s\n  system_prompt:\n%s\n  user_message:\n%s",
            self.model_string, self.config.provider, self.api_base or "default",
            system_prompt, user_message,
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
        # Terminal: truncated
        logger.info(
            "--- AI RESPONSE (json_completion) ---\n  model: %s\n  usage: %s\n  raw: %s...",
            response.model, getattr(response, 'usage', '-'), raw[:500],
        )
        # File: full
        file_logger.info(
            "--- AI RESPONSE (json_completion) FULL ---\n  model: %s\n  usage: %s\n  raw:\n%s",
            response.model, getattr(response, 'usage', '-'), raw,
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
