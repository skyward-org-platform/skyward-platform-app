"""Generate the brand story narrative section from crawled pages."""
from __future__ import annotations

from typing import Sequence

from pydantic import BaseModel, Field

from inference.client import infer


class BrandStory(BaseModel):
    """Brand narrative covering origin, mission, and market evolution."""

    body: str = Field(description="2-4 paragraphs covering origin, mission, and what changed in the market")


SYSTEM = """You are a brand strategist writing a brand story from a website's content.
Write 2-4 paragraphs covering: who founded it / when, what problem they saw, what they do, what's changed in the market that makes this work necessary.
Keep it grounded in what the pages actually say. If something isn't on the site, don't invent it."""


def infer_brand_story(pages: Sequence[dict]) -> BrandStory:
    """Generate brand story narrative from a sample of pages.

    Args:
        pages: list of dicts with url, title, h1, content_text. Use 5-10 pages for best signal.

    Returns:
        BrandStory instance with a multi-paragraph narrative body.
    """
    page_excerpts = "\n\n".join(
        f"## {p['url']}\n# {p.get('title', '')}\n{p.get('content_text', '')[:1800]}"
        for p in pages[:10]
    )
    user = f"Write the brand story for this website.\n\n{page_excerpts}"
    return infer(system=SYSTEM, user=user, response_model=BrandStory)
