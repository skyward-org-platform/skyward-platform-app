"""Infer brand terms (always-use, never-use, variants) from crawled pages."""
from __future__ import annotations

from typing import Sequence

from pydantic import BaseModel, Field

from inference.client import infer


class BrandTermVariant(BaseModel):
    """Canonical form with acceptable variants."""

    canonical: str = Field(description="The preferred spelling or phrasing")
    acceptable: list[str] = Field(
        description="Alternative spellings or phrasings that map to the canonical form"
    )


class BrandTerms(BaseModel):
    """Brand terminology profile."""

    always_use: list[str] = Field(
        description="3-8 phrases or terms the brand consistently uses across pages"
    )
    never_use: list[str] = Field(
        description="0-5 phrases the brand avoids (competitor framing, sloppy language, off-brand tone)"
    )
    variants: list[BrandTermVariant] = Field(
        description="Canonical-form mappings for terms with multiple spellings or phrasings"
    )


SYSTEM = """You extract a brand's terminology from its website content.
Read the pages provided and identify:
- always_use: Phrases that recur across multiple pages and define the brand voice (e.g., "architectural photography" for a photographer).
- never_use: Framings that contradict the brand voice or sound competitor-style (avoid these in future content).
- variants: Canonical forms for terms appearing in multiple spellings or variations (e.g., "website" vs. "web site").

Be specific and evidence-based. Ground each term in actual phrases from the content."""


def infer_brand_terms(pages: Sequence[dict]) -> BrandTerms:
    """Infer brand terminology from a sample of pages.

    Args:
        pages: list of dicts with url, title, h1, content_text. Use 5-10 pages for best signal.

    Returns:
        BrandTerms instance with always_use, never_use, and variants lists.
    """
    page_excerpts = "\n\n".join(
        f"## {p['url']}\n# {p.get('title', '')}\n## {p.get('h1', '')}\n{p.get('content_text', '')[:1500]}"
        for p in pages[:10]
    )
    user = f"Extract brand terminology from these pages.\n\n{page_excerpts}"
    return infer(system=SYSTEM, user=user, response_model=BrandTerms)
