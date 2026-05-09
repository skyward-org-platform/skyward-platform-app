"""Infer the 'future audience' Brand DNA section: who the brand wants its audience to be in 18 months.

Tryggvi pattern: shifts in target buyer become directional inputs to keyword + content strategy.
"""
from __future__ import annotations

from typing import Sequence

from pydantic import BaseModel, Field

from inference.client import infer


class FutureAudience(BaseModel):
    """Future audience positioning: who the brand will serve in 12-24 months."""

    horizon_months: int = Field(description="6-36 months", ge=6, le=36)
    shift: str = Field(description="One sentence: 'From X buyer to Y buyer'")
    why: str = Field(description="One sentence rationale")


SYSTEM = """You are a brand strategist looking for directional shifts in a brand's audience.
Read the pages and propose how the audience could evolve over 12-24 months.
Lean toward higher-value buyer segments where the content already shows aspirational positioning.
If the pages give no clear signal, default to 'shift toward higher-value buyers in same segment'."""


def infer_future_audience(pages: Sequence[dict]) -> FutureAudience:
    """Infer future-audience shift from a sample of pages.

    Args:
        pages: list of dicts with url, title, h1, content_text. Use 5-10 pages for best signal.

    Returns:
        FutureAudience instance with horizon_months, shift, and why.
    """
    page_excerpts = "\n\n".join(
        f"## {p['url']}\n{p.get('content_text', '')[:1500]}"
        for p in pages[:8]
    )
    user = f"Propose a future-audience shift for this brand.\n\n{page_excerpts}"
    return infer(system=SYSTEM, user=user, response_model=FutureAudience)
