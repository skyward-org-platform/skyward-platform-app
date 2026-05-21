"""Generic page content pull: ScreamingFrog BQ -> Supabase page rows.

Reads `data-hub-468216.ScreamingFrog.custom_javascript_page_content` filtered to
a single domain, computes content_hash + word_count, generates an OpenAI
embedding (text-embedding-3-small, 1536 dims), and updates the matching page
row in Supabase (matched by exact URL).

Idempotent: pages whose content_hash matches what's already stored skip the
embedding API call (the only expensive part).

Usage:
    python scripts/pull_content_from_bq.py <property_slug> [--domain DOMAIN] [--crawled-at ISO8601] [--bq-project PROJECT]

Examples:
    # Default: domain is read from Supabase property.primary_domain
    python scripts/pull_content_from_bq.py phil-lasry

    # Explicit BQ domain (when slug != domain or property.primary_domain differs from BQ's normalization)
    python scripts/pull_content_from_bq.py phil-lasry --domain plasry.com

    # Manual crawl timestamp (default: now)
    python scripts/pull_content_from_bq.py buscharter --crawled-at 2026-04-27T00:00:00Z

Prerequisites:
    - Property must exist in Supabase (run seed_clients_properties.py first).
    - Pages must exist for the property (run backfill_pages.py first).
    - GCP ADC or GCP_DATAHUB_CREDENTIALS configured (BQ read access).
    - OPENAI_API_KEY set.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

_REPO_DIR = Path(__file__).resolve().parent.parent
if str(_REPO_DIR) not in sys.path:
    sys.path.insert(0, str(_REPO_DIR))

from dotenv import load_dotenv  # noqa: E402
from google.cloud import bigquery  # noqa: E402
from openai import OpenAI  # noqa: E402

from scripts.supabase_client import get_admin_client  # noqa: E402

load_dotenv(_REPO_DIR / ".env")

DEFAULT_BQ_PROJECT = "data-hub-468216"
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_CHAR_CAP = 24000  # ~6K tokens, well under the 8192 limit


def _hash(text: str) -> str:
    return hashlib.md5(text.encode("utf-8")).hexdigest()


def _word_count(text: str) -> int:
    return len(text.split())


def _embed(client: OpenAI, text: str) -> list[float]:
    res = client.embeddings.create(model=EMBEDDING_MODEL, input=text[:EMBEDDING_CHAR_CAP])
    return res.data[0].embedding


def fetch_bq_content(bq_project: str, domain: str) -> Iterable[dict]:
    bq = bigquery.Client(project=bq_project)
    query = f"""
        SELECT Address, Page_Content_1
        FROM `{bq_project}.ScreamingFrog.custom_javascript_page_content`
        WHERE domain = @domain
          AND Page_Content_1 IS NOT NULL
          AND LENGTH(Page_Content_1) >= 100
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("domain", "STRING", domain)],
    )
    for row in bq.query(query, job_config=job_config).result():
        content = row["Page_Content_1"]
        if not content or not content.strip():
            continue
        yield {"url": row["Address"], "content": content.strip()}


def get_existing_pages(db, property_id: str) -> dict[str, dict]:
    rows = (
        db.table("page")
        .select("id, url, content_hash")
        .eq("property_id", property_id)
        .execute()
        .data
    )
    return {r["url"]: r for r in rows}


def resolve_property(db, slug: str) -> dict:
    prop = (
        db.table("property")
        .select("id, name, primary_domain")
        .eq("slug", slug)
        .single()
        .execute()
        .data
    )
    if not prop:
        raise SystemExit(f"No property found with slug={slug!r}")
    return prop


def run(slug: str, domain_override: str | None, crawled_at: str, bq_project: str) -> None:
    db = get_admin_client()
    openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    prop = resolve_property(db, slug)
    domain = domain_override or prop["primary_domain"]
    print(f"[{slug}] domain={domain} bq_project={bq_project} crawled_at={crawled_at}")

    existing = get_existing_pages(db, prop["id"])

    fetched = list(fetch_bq_content(bq_project, domain))
    print(f"[{slug}] BQ returned {len(fetched)} pages with content for {domain}")

    matched = 0
    skipped_unchanged = 0
    embedded = 0
    no_match = 0

    for row in fetched:
        url, content = row["url"], row["content"]
        if url not in existing:
            no_match += 1
            continue
        new_hash = _hash(content)
        existing_hash = existing[url].get("content_hash")

        update: dict = {
            "content_text": content,
            "content_hash": new_hash,
            "word_count": _word_count(content),
            "last_crawled_at": crawled_at,
        }

        if existing_hash != new_hash:
            update["embedding"] = _embed(openai_client, content)
            embedded += 1
        else:
            skipped_unchanged += 1

        db.table("page").update(update).eq("id", existing[url]["id"]).execute()
        matched += 1

    print(f"[{slug}] matched + updated: {matched}")
    print(f"[{slug}] embeddings generated: {embedded}")
    print(f"[{slug}] skipped (unchanged content): {skipped_unchanged}")
    print(f"[{slug}] no matching page row in Supabase: {no_match}")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("property_slug")
    ap.add_argument(
        "--domain", default=None,
        help="BQ domain filter. Defaults to Supabase property.primary_domain.",
    )
    ap.add_argument(
        "--crawled-at", default=None,
        help="ISO 8601 timestamp to write to page.last_crawled_at. Defaults to now (UTC).",
    )
    ap.add_argument(
        "--bq-project", default=DEFAULT_BQ_PROJECT,
        help=f"BigQuery project ID (default: {DEFAULT_BQ_PROJECT})",
    )
    args = ap.parse_args()
    crawled_at = args.crawled_at or datetime.now(timezone.utc).isoformat()
    run(args.property_slug, args.domain, crawled_at, args.bq_project)


if __name__ == "__main__":
    main()
