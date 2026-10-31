"""Judgment layer.

Runs with NO API key: every judgment is rule-based and deterministic. If ANTHROPIC_API_KEY is
present, the same calls can be upgraded to Claude structured outputs, but nothing depends on it.
"""
from __future__ import annotations

import json
from typing import TypeVar

from pydantic import BaseModel

from app.config import settings

T = TypeVar("T", bound=BaseModel)


class LLM:
    def __init__(self) -> None:
        self.client = None
        if settings.anthropic_api_key:
            try:
                import anthropic
                self.client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
            except Exception:
                self.client = None

    @property
    def available(self) -> bool:
        return self.client is not None

    async def parse(self, system: str, user: str, schema: type[T], *, effort: str = "low",
                    max_tokens: int = 4000) -> T | None:
        """Structured output via Claude. Returns None when no key is configured or on any error,
        so callers always fall back to their rule-based path."""
        if not self.client:
            return None
        try:
            resp = await self.client.beta.messages.create(
                model=settings.model, max_tokens=max_tokens, system=system,
                betas=["server-side-fallback-2026-07-01"], fallbacks="default",
                messages=[{"role": "user", "content": user}],
                output_config={"effort": effort,
                               "format": {"type": "json_schema", "schema": schema.model_json_schema()}},
            )
            if resp.stop_reason == "refusal":
                return None
            text = next(b.text for b in resp.content if b.type == "text")
            return schema.model_validate(json.loads(text))
        except Exception:
            return None


llm = LLM()
