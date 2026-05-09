"""Tests for future audience inference module."""
from __future__ import annotations

from inference.future_audience import infer_future_audience


def test_future_audience_has_horizon_and_shift(sample_pages):
    """Verify FutureAudience has horizon_months and shift fields with correct constraints."""
    result = infer_future_audience(pages=sample_pages)
    assert result.horizon_months >= 6
    assert result.horizon_months <= 36
    assert len(result.shift) > 10  # not empty
    assert len(result.why) > 10


def test_future_audience_reflects_brand_positioning(sample_pages):
    """Verify the inferred shift makes sense for phil-lasry's trajectory."""
    result = infer_future_audience(pages=sample_pages)

    # Shift should mention buyer types or positioning, not be generic
    shift_lower = result.shift.lower()
    assert any(
        word in shift_lower
        for word in [
            "buyer",
            "client",
            "market",
            "segment",
            "high-value",
            "premium",
            "ultra",
            "luxury",
            "brand",
            "development",
            "real estate",
        ]
    )

    # Rationale should explain the shift direction
    why_lower = result.why.lower()
    assert len(why_lower) > 20
