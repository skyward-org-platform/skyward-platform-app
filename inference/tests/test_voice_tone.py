"""Tests for voice & tone Brand DNA inference module."""
from __future__ import annotations

from inference.voice_tone import infer_voice_tone


def test_voice_tone_inference_returns_required_fields(sample_pages):
    """Verify all required VoiceTone fields are present and non-empty."""
    result = infer_voice_tone(pages=sample_pages)
    assert isinstance(result.reading_level, str) and result.reading_level
    assert isinstance(result.tone_descriptors, list) and len(result.tone_descriptors) >= 2
    assert isinstance(result.dos, list) and len(result.dos) >= 2
    assert isinstance(result.donts, list) and len(result.donts) >= 1
    assert isinstance(result.example_good_sentence, str) and result.example_good_sentence
    assert isinstance(result.example_bad_sentence, str) and result.example_bad_sentence


def test_voice_tone_reflects_page_content(sample_pages):
    """Verify tone descriptors match the brand content (architectural photography, not off-brand)."""
    result = infer_voice_tone(pages=sample_pages)
    descriptors = " ".join(result.tone_descriptors).lower()
    # Editorial photography content should NOT come back as blatantly off-brand.
    # Be lenient — inference varies, but these are clear red flags.
    assert all(bad not in descriptors for bad in ["aggressive", "salesy", "over-the-top"])
