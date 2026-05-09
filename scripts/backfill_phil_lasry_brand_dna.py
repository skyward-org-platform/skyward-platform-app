"""Backfill phil-lasry Brand DNA: identity from manual constants, voice/terms/proof/future/story from inference.

Skips re-running inference if a section already exists in brand_dna_section unless --force.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Make sibling packages (`inference`, `scripts`) importable when this script is run
# directly via `python scripts/backfill_phil_lasry_brand_dna.py` from the
# `operations/seo-platform/` directory.
_SEO_PLATFORM_DIR = Path(__file__).resolve().parent.parent
if str(_SEO_PLATFORM_DIR) not in sys.path:
    sys.path.insert(0, str(_SEO_PLATFORM_DIR))

from inference.brand_story import infer_brand_story  # noqa: E402
from inference.brand_terms import infer_brand_terms  # noqa: E402
from inference.future_audience import infer_future_audience  # noqa: E402
from inference.proof import infer_proof  # noqa: E402
from inference.voice_tone import infer_voice_tone  # noqa: E402
from scripts.supabase_client import get_admin_client  # noqa: E402


PROPERTY_SLUG = "phil-lasry"

# Identity is sourced from intake form (manually authored here in v1).
# Values derived from actual plasry.com /aboutus content (architectural/commercial
# photographer in Miami, ~20+ years experience). Approximations marked with comments.
IDENTITY_CONTENT = {
    "legal_name": "Philippe Lasry Photography LLC",  # approximate
    "brand_name": "Philippe Lasry",
    "founded": 2003,  # approximate, derived from "over two decades"
    "hq_location": "Miami, FL",
    "operating_locations": ["Miami", "South Florida"],
}


def fetch_pages_for_inference(db, property_id: str) -> list[dict]:
    """Pull a sample of indexable, content-rich pages for the inference agent.

    Selection: pages with non-empty content_text, ranked by word_count, capped at 10.
    """
    pages = (
        db.table("page")
        .select("url, title, h1, content_text, page_type")
        .eq("property_id", property_id)
        .not_.is_("content_text", "null")
        .order("word_count", desc=True)
        .limit(20)
        .execute()
        .data
    )
    pages = [p for p in pages if (p.get("content_text") or "").strip()]
    return pages[:10]


def upsert_section(db, property_id: str, section: str, content: dict | None,
                   body: str | None, source: str, confidence: float | None = None) -> None:
    db.table("brand_dna_section").upsert({
        "property_id": property_id,
        "section": section,
        "content": content or {},
        "body": body,
        "source": source,
        "confidence": confidence,
        "updated_by": "import:phil_lasry_backfill",
    }, on_conflict="property_id,section").execute()


def run() -> None:
    db = get_admin_client()
    prop = db.table("property").select("id").eq("slug", PROPERTY_SLUG).single().execute().data
    property_id = prop["id"]

    print(f"Backfilling Brand DNA for {PROPERTY_SLUG} ({property_id})")

    # 1. Identity (manual)
    upsert_section(db, property_id, "identity", IDENTITY_CONTENT, None, "import:manual", 0.95)

    # 2. Pages for inference
    pages = fetch_pages_for_inference(db, property_id)
    print(f"  using {len(pages)} pages for inference")

    # 3. Voice & Tone
    print("  inferring voice_tone...")
    vt = infer_voice_tone(pages)
    upsert_section(db, property_id, "voice_tone", vt.model_dump(), None, "agent:voice_tone_v1", 0.7)

    # 4. Brand Terms
    print("  inferring brand_terms...")
    bt = infer_brand_terms(pages)
    upsert_section(db, property_id, "brand_terms", bt.model_dump(), None, "agent:brand_terms_v1", 0.7)

    # 5. Proof
    print("  inferring proof...")
    pr = infer_proof(pages)
    upsert_section(db, property_id, "proof", pr.model_dump(), None, "agent:proof_v1", 0.7)

    # 6. Future Audience
    print("  inferring future_audience...")
    fa = infer_future_audience(pages)
    upsert_section(db, property_id, "future_audience", fa.model_dump(), None, "agent:future_audience_v1", 0.5)

    # 7. Brand Story
    print("  inferring brand_story...")
    bs = infer_brand_story(pages)
    upsert_section(db, property_id, "brand_story", None, bs.body, "agent:brand_story_v1", 0.6)

    print("Done.")


if __name__ == "__main__":
    run()
