"""Seed `client` and `property` from a hardcoded mapping of delivery folders.

Idempotent: uses upsert on `slug`. Safe to re-run.
"""
from __future__ import annotations

from scripts.supabase_client import get_admin_client


CLIENTS = [
    {"slug": "phil-lasry", "name": "Phil Lasry", "legal_name": "Phil Lasry LLC"},
    {"slug": "tna", "name": "TNA", "legal_name": "TNA Pty Ltd"},
    {"slug": "kitchen-services-of-san-diego", "name": "Kitchen Services of San Diego",
     "legal_name": "Kitchen Services of San Diego, Inc"},
    {"slug": "tacoma-legacy-partners", "name": "Tacoma Legacy Partners", "legal_name": "Tacoma Legacy Partners, LLC"},
    {"slug": "becker-family-flooring", "name": "Becker Family Flooring", "legal_name": "Becker Family Flooring, Inc"},
    {"slug": "busbank", "name": "BusBank", "legal_name": "GCS Holdings"},
    {"slug": "gcs", "name": "Global Charter Services", "legal_name": "GCS Holdings"},
    {"slug": "shs", "name": "SHS Home Warranty", "legal_name": "SHS Home Services"},
    {"slug": "manhattan-eye", "name": "Manhattan Eye", "legal_name": "Manhattan Eye PLLC"},
    {"slug": "dental-shop", "name": "Dental Shop", "legal_name": "Dental Shop"},
]

PROPERTIES = [
    {"client_slug": "phil-lasry", "slug": "phil-lasry", "name": "Phil Lasry",
     "primary_domain": "plasry.com"},
    {"client_slug": "tna", "slug": "tnabushire", "name": "TNA Bus Hire",
     "primary_domain": "tnabushire.com.au"},
    {"client_slug": "tna", "slug": "buscharter", "name": "BusCharter",
     "primary_domain": "buscharter.com.au"},
    {"client_slug": "tna", "slug": "minibushire", "name": "Mini Bus Hire AU",
     "primary_domain": "minibushire.com.au"},
    {"client_slug": "kitchen-services-of-san-diego", "slug": "kssd-sd", "name": "Kitchen Services SD",
     "primary_domain": "kitchenservicesofsandiego.com"},
    {"client_slug": "kitchen-services-of-san-diego", "slug": "kssd-dfw", "name": "Kitchen Services DFW",
     "primary_domain": "kitchenservicesofdfw.com"},
    {"client_slug": "tacoma-legacy-partners", "slug": "kg-provo", "name": "Kitchen Services Provo",
     "primary_domain": "kitchenservicesofprovo.com"},
    {"client_slug": "becker-family-flooring", "slug": "fci-westchester", "name": "FCI Southern Westchester",
     "primary_domain": "floorcoveringsinternational.com"},
    {"client_slug": "gcs", "slug": "busbank", "name": "BusBank", "primary_domain": "busbank.com"},
    {"client_slug": "gcs", "slug": "corporateshuttle", "name": "Corporate Shuttle", "primary_domain": "corporateshuttle.com"},
    {"client_slug": "gcs", "slug": "buster", "name": "Buster", "primary_domain": "buster.com"},
]


def run() -> None:
    db = get_admin_client()

    for c in CLIENTS:
        db.table("client").upsert(c, on_conflict="slug").execute()

    slug_to_id = {row["slug"]: row["id"] for row in db.table("client").select("id, slug").execute().data}

    for p in PROPERTIES:
        client_id = slug_to_id[p["client_slug"]]
        row = {k: v for k, v in p.items() if k != "client_slug"}
        row["client_id"] = client_id
        db.table("property").upsert(row, on_conflict="slug").execute()

    print(f"Seeded {len(CLIENTS)} clients and {len(PROPERTIES)} properties.")


if __name__ == "__main__":
    run()
