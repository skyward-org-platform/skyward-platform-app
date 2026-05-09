"""Tests for brand terms inference module."""
from __future__ import annotations

from inference.brand_terms import infer_brand_terms


def test_brand_terms_returns_lists(sample_pages):
    """Verify BrandTerms has required list fields with correct structure."""
    result = infer_brand_terms(pages=sample_pages)
    assert len(result.always_use) >= 1
    assert all(isinstance(t, str) for t in result.always_use)
    assert isinstance(result.never_use, list)
    assert isinstance(result.variants, list)


def test_brand_terms_reflects_actual_phrases(sample_pages):
    """Verify inferred terms reflect actual brand terminology from phil-lasry content."""
    result = infer_brand_terms(pages=sample_pages)
    
    # Combine all inferred terms: always_use phrases + variants
    all_terms = " ".join(result.always_use).lower()
    all_terms += " ".join(v.canonical for v in result.variants).lower()
    
    # phil-lasry pages center on photography, architecture, commercial, design
    # Check that at least some core terms from the brand appear
    assert any(
        term in all_terms
        for term in [
            "photography",
            "architect",
            "commercial",
            "design",
        ]
    )
