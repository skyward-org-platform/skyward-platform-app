"""Thin wrapper around OpenAI client for inference modules.

Uses the Structured Outputs feature so each section returns parsed JSON matching
its Pydantic schema. Centralizes model + temperature + retries.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Type, TypeVar

from dotenv import load_dotenv
from openai import OpenAI
from pydantic import BaseModel

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

MODEL = "gpt-4o-2024-08-06"  # supports structured outputs
TEMPERATURE = 0.2

T = TypeVar("T", bound=BaseModel)


@lru_cache(maxsize=1)
def _client() -> OpenAI:
    return OpenAI(api_key=os.environ["OPENAI_API_KEY"])


def infer(system: str, user: str, response_model: Type[T]) -> T:
    """Run a structured-output call. Returns a parsed instance of response_model."""
    completion = _client().beta.chat.completions.parse(
        model=MODEL,
        temperature=TEMPERATURE,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        response_format=response_model,
    )
    return completion.choices[0].message.parsed
