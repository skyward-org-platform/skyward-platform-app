"""Seed script must be idempotent: running twice produces the same row count."""
import importlib

from scripts.supabase_client import get_admin_client


def test_seed_is_idempotent():
    seed_module = importlib.import_module("scripts.seed_clients_properties")

    seed_module.run()
    after_first = _count_rows()

    seed_module.run()
    after_second = _count_rows()

    assert after_first == after_second
    assert after_first["client"] >= 4   # at least phil-lasry, tna, kssd, busbank
    assert after_first["property"] >= 6  # phil-lasry + 3 TNA + busbank + at least 1 KSSD


def _count_rows() -> dict[str, int]:
    client = get_admin_client()
    return {
        "client": len(client.table("client").select("id").execute().data),
        "property": len(client.table("property").select("id").execute().data),
    }
