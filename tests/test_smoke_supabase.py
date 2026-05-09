"""Smoke tests that the Supabase project is reachable and extensions are enabled."""
import os
import pytest
from dotenv import load_dotenv
from supabase import create_client

load_dotenv("/Users/paulskirbe/agency/.env")


@pytest.fixture
def admin_client():
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def test_pgvector_enabled(admin_client):
    """pgvector extension must be available for page.embedding."""
    rpc = admin_client.rpc("pg_ext_check", {"ext_name": "vector"}).execute()
    assert rpc.data is True


def test_uuid_ossp_enabled(admin_client):
    rpc = admin_client.rpc("pg_ext_check", {"ext_name": "uuid-ossp"}).execute()
    assert rpc.data is True


def test_client_table_exists(admin_client):
    """client table is the contractual entity; verify reachable."""
    res = admin_client.table("client").select("id").limit(1).execute()
    assert isinstance(res.data, list)


def test_team_member_table_exists(admin_client):
    res = admin_client.table("team_member").select("user_id").limit(1).execute()
    assert isinstance(res.data, list)


def test_property_table_exists(admin_client):
    res = admin_client.table("property").select("id").limit(1).execute()
    assert isinstance(res.data, list)


def test_page_table_exists(admin_client):
    res = admin_client.table("page").select("id").limit(1).execute()
    assert isinstance(res.data, list)


def test_page_embedding_column_is_vector(admin_client):
    """Verify the embedding column has vector type via pg_typeof_column helper RPC."""
    res = admin_client.rpc(
        "pg_typeof_column",
        {"table_name_in": "page", "column_name_in": "embedding"},
    ).execute()
    assert "vector" in (res.data or "").lower()


def test_brand_dna_section_table_exists(admin_client):
    res = admin_client.table("brand_dna_section").select("id").limit(1).execute()
    assert res.data == []


def test_project_brain_entry_table_exists(admin_client):
    res = admin_client.table("project_brain_entry").select("id").limit(1).execute()
    assert res.data == []


def test_phil_lasry_content_backfilled(admin_client):
    """After the BQ content pull, phil-lasry has content + embeddings."""
    prop = admin_client.table("property").select("id").eq("slug", "phil-lasry").single().execute().data
    with_content = (
        admin_client.table("page")
        .select("id", count="exact")
        .eq("property_id", prop["id"])
        .not_.is_("content_text", "null")
        .execute()
    )
    with_embedding = (
        admin_client.table("page")
        .select("id", count="exact")
        .eq("property_id", prop["id"])
        .not_.is_("embedding", "null")
        .execute()
    )
    assert with_content.count >= 5, f"only {with_content.count} pages have content"
    assert with_embedding.count >= 5, f"only {with_embedding.count} pages have embeddings"


def test_phil_lasry_pages_present(admin_client):
    """After backfill, phil-lasry has pages with audit_action set.

    plasry.com is a small photographer site — 42 URLs in the 2026-04-14 workbook.
    Threshold is 30 to allow for re-runs against subsets while confirming real data loaded.
    """
    prop = admin_client.table("property").select("id").eq("slug", "phil-lasry").single().execute().data
    pages = (
        admin_client.table("page")
        .select("audit_action")
        .eq("property_id", prop["id"])
        .execute()
        .data
    )
    assert len(pages) >= 30
    decided = [p for p in pages if p["audit_action"] not in (None, "undecided")]
    assert len(decided) > 0


def test_phil_lasry_brand_dna_complete(admin_client):
    prop = admin_client.table("property").select("id").eq("slug", "phil-lasry").single().execute().data
    sections = (
        admin_client.table("brand_dna_section")
        .select("section")
        .eq("property_id", prop["id"])
        .execute()
        .data
    )
    section_names = {s["section"] for s in sections}
    required = {"identity", "voice_tone", "brand_terms", "proof", "future_audience", "brand_story"}
    assert required.issubset(section_names), f"Missing: {required - section_names}"
