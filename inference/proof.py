"""Infer proof assets (case studies, stats, testimonials, certifications) from crawled pages."""
from __future__ import annotations

from typing import Sequence

from pydantic import BaseModel, Field

from inference.client import infer


class ProofAsset(BaseModel):
    title: str
    asset_type: str = Field(description="One of: case_study, stat, testimonial, certification, award, press")
    detail: str
    source_url: str | None = None


class Proof(BaseModel):
    case_studies: list[ProofAsset]
    stats: list[ProofAsset]
    testimonials: list[ProofAsset]
    certifications: list[ProofAsset]
    awards: list[ProofAsset]
    press: list[ProofAsset]


SYSTEM = """You extract proof points from a brand's website.
Surface concrete case studies, headline stats, testimonial fragments, certifications, awards, and press mentions.
Each asset must be verifiable from the content provided. Skip vague claims."""


def infer_proof(pages: Sequence[dict]) -> Proof:
    page_excerpts = "\n\n".join(
        f"## {p['url']}\n# {p.get('title', '')}\n{p.get('content_text', '')[:1500]}"
        for p in pages[:10]
    )
    user = f"Extract proof assets from these pages.\n\n{page_excerpts}"
    return infer(system=SYSTEM, user=user, response_model=Proof)
