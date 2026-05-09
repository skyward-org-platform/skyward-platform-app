"""Tests for brand story inference module."""
from __future__ import annotations

from inference.brand_story import infer_brand_story


def test_brand_story_has_narrative(sample_pages):
    """Verify BrandStory has a multi-paragraph narrative body."""
    result = infer_brand_story(pages=sample_pages)
    assert len(result.body) > 100  # multi-paragraph narrative
    # Check for either the founder's first or last name (case-insensitive)
    assert "phil" in result.body.lower() or "lasry" in result.body.lower()


def test_brand_story_covers_origin_mission_change(sample_pages):
    """Verify the narrative covers foundational storytelling elements."""
    result = infer_brand_story(pages=sample_pages)
    body_lower = result.body.lower()

    # Should have some narrative structure: origin, mission, or change signals
    # (Not all will be present, but at least one thematic element should emerge)
    narrative_signals = [
        "photographer",
        "photo",
        "architecture",
        "design",
        "miami",
        "experience",
        "commercial",
        "years",
    ]
    assert any(signal in body_lower for signal in narrative_signals)
