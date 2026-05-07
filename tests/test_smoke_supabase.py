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
