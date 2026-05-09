"""Infer the voice & tone Brand DNA section from crawled pages."""
from __future__ import annotations

from typing import Sequence

from pydantic import BaseModel, Field

from inference.client import infer


class VoiceTone(BaseModel):
    """Voice and tone profile for a brand."""

    reading_level: str = Field(
        description="One of: middle-school, high-school, college, professional"
    )
    tone_descriptors: list[str] = Field(
        description="3-5 single-word adjectives describing the brand voice (e.g. authoritative, warm, direct)"
    )
    dos: list[str] = Field(description="3-5 short do-this style guidelines")
    donts: list[str] = Field(description="3-5 short avoid-this style guidelines")
    example_good_sentence: str = Field(description="One sentence in the voice")
    example_bad_sentence: str = Field(description="One sentence that violates the voice")


SYSTEM = """You are a brand strategist analyzing a website to extract its voice & tone.
Read the pages provided and return a structured voice profile. Be specific and actionable.
Avoid generic descriptors like 'professional' alone — pair them with concrete cues from the content.
Focus on what makes the brand distinct, not generic attributes."""


def infer_voice_tone(pages: Sequence[dict]) -> VoiceTone:
    """Infer voice & tone from a sample of pages.

    Args:
        pages: list of dicts with url, title, h1, content_text. Use 5-10 pages for best signal.

    Returns:
        VoiceTone instance with reading_level, tone_descriptors, dos, donts, and example sentences.
    """
    page_excerpts = "\n\n".join(
        f"## {p['url']}\n# {p.get('title', '')}\n## {p.get('h1', '')}\n{p.get('content_text', '')[:1500]}"
        for p in pages[:10]
    )
    user = (
        "Analyze the following pages and produce the voice & tone profile.\n\n"
        f"{page_excerpts}"
    )
    return infer(system=SYSTEM, user=user, response_model=VoiceTone)
