"""Export a property's Brand DNA from Supabase to delivery/{slug}/00-brand-dna.md.

Output format matches brand-dna-brain-spec-v1.md: YAML frontmatter for structured fields,
markdown body for prose sections (brand_story, positioning, voice_tone narrative, etc).
"""
from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

# Make sibling packages importable when run directly.
_SEO_PLATFORM_DIR = Path(__file__).resolve().parent.parent
if str(_SEO_PLATFORM_DIR) not in sys.path:
    sys.path.insert(0, str(_SEO_PLATFORM_DIR))

import yaml  # noqa: E402

from scripts.supabase_client import get_admin_client  # noqa: E402


DELIVERY_ROOT = Path("/Users/paulskirbe/agency/delivery")


def load_sections(db, property_slug: str) -> tuple[dict, dict]:
    """Returns (property_row, sections_by_name)."""
    prop = db.table("property").select("*").eq("slug", property_slug).single().execute().data
    rows = (
        db.table("brand_dna_section")
        .select("*")
        .eq("property_id", prop["id"])
        .execute()
        .data
    )
    return prop, {r["section"]: r for r in rows}


def build_frontmatter(prop: dict, sections: dict) -> dict:
    fm = {
        "client": prop["slug"],
        "domain": prop["primary_domain"],
        "version": "v1",
        "last_updated": date.today().isoformat(),
        "phase_0_status": "complete" if "identity" in sections else "in_progress",
    }
    if "identity" in sections:
        fm.update(sections["identity"]["content"])
    for key in ("offerings", "personas", "future_audience", "brand_terms",
                "proof", "competitors", "site_structure", "goals"):
        if key in sections and sections[key].get("content"):
            fm[key] = sections[key]["content"]
    return fm


def build_body(sections: dict) -> str:
    """Build the prose sections per spec."""
    parts: list[str] = []
    section_order = [
        ("brand_story", "1. Brand story"),
        ("positioning", "2. Positioning"),
        ("voice_tone", "3. Voice & tone"),
        ("audience_deep_dive", "4. Audience deep-dive"),
        ("offering_deep_dive", "5. Offering deep-dive"),
        ("trust_proof_themes", "6. Trust & proof themes"),
        ("competitive_read", "7. Competitive read"),
        ("skyward_strategy_notes", "8. Skyward strategy notes"),
    ]
    for key, heading in section_order:
        parts.append(f"## {heading}")
        if key in sections and (sections[key].get("body") or sections[key].get("content")):
            row = sections[key]
            if row.get("body"):
                parts.append(row["body"])
            elif row.get("content"):
                parts.append("```yaml\n" + yaml.dump(row["content"], sort_keys=False) + "```")
        else:
            parts.append("TBD")
        parts.append("")
    return "\n".join(parts)


def export(property_slug: str) -> Path:
    db = get_admin_client()
    prop, sections = load_sections(db, property_slug)

    frontmatter = build_frontmatter(prop, sections)
    body = build_body(sections)

    fm_yaml = yaml.dump(frontmatter, sort_keys=False, allow_unicode=True)
    doc = f"---\n{fm_yaml}---\n\n{body}\n"

    out_path = DELIVERY_ROOT / property_slug / "00-brand-dna.md"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(doc)
    print(f"Wrote {out_path}")
    return out_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("property_slug")
    args = parser.parse_args()
    export(args.property_slug)
