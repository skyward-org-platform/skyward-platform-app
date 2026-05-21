"""Generic Brand DNA backfill: identity from optional JSON file, 5 inferred sections from inference modules.

Reads page content already populated in Supabase (via pull_content_from_bq.py),
selects the 10 most content-rich indexable pages, runs each inference module
(voice_tone, brand_terms, proof, future_audience, brand_story), and upserts the
result into brand_dna_section keyed on (property_id, section).

Usage:
    python scripts/backfill_brand_dna.py <property_slug> [--identity-file PATH] [--force] [--skip-identity] [--sections SECTION ...]

Examples:
    # Use scripts/identity/<slug>.json automatically if present
    python scripts/backfill_brand_dna.py phil-lasry

    # Explicit identity file
    python scripts/backfill_brand_dna.py busbank --identity-file scripts/identity/busbank.json

    # Skip identity, only run inference sections
    python scripts/backfill_brand_dna.py minibushire --skip-identity

    # Force-rerun even if section already exists
    python scripts/backfill_brand_dna.py phil-lasry --force

    # Run only one section
    python scripts/backfill_brand_dna.py phil-lasry --sections voice_tone --force

Idempotent: existing sections are skipped unless --force.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_REPO_DIR = Path(__file__).resolve().parent.parent
if str(_REPO_DIR) not in sys.path:
    sys.path.insert(0, str(_REPO_DIR))

from inference.brand_story import infer_brand_story  # noqa: E402
from inference.brand_terms import infer_brand_terms  # noqa: E402
from inference.future_audience import infer_future_audience  # noqa: E402
from inference.proof import infer_proof  # noqa: E402
from inference.voice_tone import infer_voice_tone  # noqa: E402
from scripts.supabase_client import get_admin_client  # noqa: E402


INFERENCE_SECTIONS = ["voice_tone", "brand_terms", "proof", "future_audience", "brand_story"]
ALL_SECTIONS = ["identity"] + INFERENCE_SECTIONS


def load_identity(slug: str, explicit_path: Path | None) -> dict | None:
    """Resolve identity content from --identity-file or scripts/identity/<slug>.json.

    Returns None if no identity file is found; caller can choose to skip.
    """
    if explicit_path is not None:
        if not explicit_path.is_file():
            raise SystemExit(f"Identity file not found: {explicit_path}")
        return _load_identity_json(explicit_path)
    default_path = _REPO_DIR / "scripts" / "identity" / f"{slug}.json"
    if default_path.is_file():
        return _load_identity_json(default_path)
    return None


def _load_identity_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    # Drop conventionally-prefixed metadata fields starting with "_"
    return {k: v for k, v in data.items() if not k.startswith("_")}


def fetch_pages_for_inference(db, property_id: str, limit: int = 10) -> list[dict]:
    """Top-N indexable, content-rich pages ranked by word_count."""
    pages = (
        db.table("page")
        .select("url, title, h1, content_text, page_type")
        .eq("property_id", property_id)
        .not_.is_("content_text", "null")
        .order("word_count", desc=True)
        .limit(limit * 2)
        .execute()
        .data
    )
    pages = [p for p in pages if (p.get("content_text") or "").strip()]
    return pages[:limit]


def existing_sections(db, property_id: str) -> set[str]:
    rows = (
        db.table("brand_dna_section")
        .select("section")
        .eq("property_id", property_id)
        .execute()
        .data
    )
    return {r["section"] for r in rows}


def upsert_section(db, property_id: str, section: str, content: dict | None,
                   body: str | None, source: str, slug: str,
                   confidence: float | None = None) -> None:
    db.table("brand_dna_section").upsert({
        "property_id": property_id,
        "section": section,
        "content": content or {},
        "body": body,
        "source": source,
        "confidence": confidence,
        "updated_by": f"import:backfill_brand_dna({slug})",
    }, on_conflict="property_id,section").execute()


def run(slug: str, identity_file: Path | None, sections: list[str] | None,
        skip_identity: bool, force: bool) -> None:
    db = get_admin_client()
    prop = db.table("property").select("id, name").eq("slug", slug).single().execute().data
    if not prop:
        raise SystemExit(f"No property found with slug={slug!r}")
    property_id = prop["id"]
    print(f"Backfilling Brand DNA for {prop['name']} ({slug}, {property_id})")

    target_sections = sections or ALL_SECTIONS
    already = existing_sections(db, property_id)
    if not force:
        skipping = [s for s in target_sections if s in already]
        if skipping:
            print(f"  skipping existing sections (use --force to overwrite): {skipping}")
            target_sections = [s for s in target_sections if s not in already]

    # 1. Identity
    if "identity" in target_sections and not skip_identity:
        identity = load_identity(slug, identity_file)
        if identity is not None:
            upsert_section(db, property_id, "identity", identity, None, "import:manual", slug, 0.95)
            print(f"  upserted identity from {'--identity-file' if identity_file else 'scripts/identity/' + slug + '.json'}")
        else:
            print(f"  no identity file (looked for scripts/identity/{slug}.json) — skipping identity")
    elif "identity" in target_sections and skip_identity:
        print("  skipping identity (--skip-identity)")

    # 2-6. Inference sections
    inference_targets = [s for s in target_sections if s in INFERENCE_SECTIONS]
    if not inference_targets:
        print("  no inference sections to run")
        print("Done.")
        return

    pages = fetch_pages_for_inference(db, property_id)
    if not pages:
        raise SystemExit(
            f"No content-rich pages for {slug}. Run pull_content_from_bq.py first."
        )
    print(f"  using {len(pages)} pages for inference")

    if "voice_tone" in inference_targets:
        print("  inferring voice_tone...")
        result = infer_voice_tone(pages)
        upsert_section(db, property_id, "voice_tone", result.model_dump(), None,
                       "agent:voice_tone_v1", slug, 0.7)
    if "brand_terms" in inference_targets:
        print("  inferring brand_terms...")
        result = infer_brand_terms(pages)
        upsert_section(db, property_id, "brand_terms", result.model_dump(), None,
                       "agent:brand_terms_v1", slug, 0.7)
    if "proof" in inference_targets:
        print("  inferring proof...")
        result = infer_proof(pages)
        upsert_section(db, property_id, "proof", result.model_dump(), None,
                       "agent:proof_v1", slug, 0.7)
    if "future_audience" in inference_targets:
        print("  inferring future_audience...")
        result = infer_future_audience(pages)
        upsert_section(db, property_id, "future_audience", result.model_dump(), None,
                       "agent:future_audience_v1", slug, 0.5)
    if "brand_story" in inference_targets:
        print("  inferring brand_story...")
        result = infer_brand_story(pages)
        upsert_section(db, property_id, "brand_story", None, result.body,
                       "agent:brand_story_v1", slug, 0.6)

    print("Done.")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("property_slug")
    ap.add_argument(
        "--identity-file", type=Path, default=None,
        help="Path to a JSON file with identity constants. Defaults to scripts/identity/<slug>.json if present.",
    )
    ap.add_argument(
        "--sections", nargs="+", choices=ALL_SECTIONS, default=None,
        help=f"Run only these sections. Default: all of {ALL_SECTIONS}",
    )
    ap.add_argument(
        "--skip-identity", action="store_true",
        help="Don't write the identity section even if an identity file is present.",
    )
    ap.add_argument(
        "--force", action="store_true",
        help="Overwrite sections that already exist in brand_dna_section.",
    )
    args = ap.parse_args()
    run(args.property_slug, args.identity_file, args.sections, args.skip_identity, args.force)


if __name__ == "__main__":
    main()
