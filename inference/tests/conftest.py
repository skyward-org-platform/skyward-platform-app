"""Shared fixtures for Brand DNA inference tests.

The `sample_pages` fixture pulls real phil-lasry pages with non-trivial content
from Supabase. This means the inference modules are tested against the actual
brand content (architectural/commercial photography in Miami) rather than
fabricated stand-ins. If Supabase is unreachable or has no content, the fixture
falls back to a hardcoded snippet from the /aboutus page.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Make sibling packages importable when pytest runs from operations/seo-platform/
_SEO_PLATFORM_DIR = Path(__file__).resolve().parents[2]
if str(_SEO_PLATFORM_DIR) not in sys.path:
    sys.path.insert(0, str(_SEO_PLATFORM_DIR))

from scripts.supabase_client import get_admin_client  # noqa: E402


HARDCODED_FALLBACK = [
    {
        "url": "https://www.plasry.com/aboutus",
        "title": "About — Philippe Lasry",
        "h1": "Photography that tells your story",
        "content_text": (
            "Philippe Lasry is an architectural and commercial photographer based in Miami, "
            "working with architects, developers, and hospitality brands. Self-taught with over "
            "two decades of experience at the intersection of architecture, design, and commercial "
            "photography. Every shoot starts with location scouting and pre-shoot planning, "
            "scheduled around natural light. Studio operates at the level clients expect: "
            "precise, reliable, uncompromising on quality."
        ),
    },
]


def _fetch_real_pages(limit: int = 8) -> list[dict]:
    db = get_admin_client()
    prop = db.table("property").select("id").eq("slug", "phil-lasry").single().execute().data
    rows = (
        db.table("page")
        .select("url, title, h1, content_text")
        .eq("property_id", prop["id"])
        .not_.is_("content_text", "null")
        .order("word_count", desc=True)
        .limit(limit)
        .execute()
        .data
    )
    return [r for r in rows if (r.get("content_text") or "").strip()]


@pytest.fixture(scope="session")
def sample_pages():
    """8 highest-content phil-lasry pages from Supabase, or hardcoded fallback."""
    try:
        pages = _fetch_real_pages(8)
        if pages:
            return pages
    except Exception:
        pass
    return HARDCODED_FALLBACK


@pytest.fixture(scope="session")
def empty_intake():
    """Many clients don't have a formal intake form filled. Inference must work on pages alone."""
    return {}
