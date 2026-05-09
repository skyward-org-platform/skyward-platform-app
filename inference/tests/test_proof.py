from inference.proof import infer_proof


def test_proof_returns_structured_assets(sample_pages):
    result = infer_proof(pages=sample_pages)
    assert isinstance(result.case_studies, list)
    assert isinstance(result.stats, list)
    assert isinstance(result.certifications, list)
