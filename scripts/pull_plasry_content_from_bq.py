"""Pull plasry page content from Adam's Screaming Frog BQ table into Supabase.

Read-only on BigQuery. Reads `data-hub-468216.ScreamingFrog.custom_javascript_page_content`
filtered to domain='plasry.com', and for each row with non-null Page_Content_1:

  1. Compute content_hash (md5) and word_count.
  2. Generate OpenAI text-embedding-3-small embedding from the content.
  3. Update the matching page row in Supabase (matched by exact URL).

Idempotent: re-running updates the same rows. Skips embedding generation when
content_hash matches what's already stored (avoids re-embedding unchanged content).
"""
from __future__ import annotations

import hashlib
import os
from typing import Iterable

from dotenv import load_dotenv
from google.cloud import bigquery
from openai import OpenAI

from scripts.supabase_client import get_admin_client

load_dotenv("/Users/paulskirbe/agency/.env")

PROPERTY_SLUG = "phil-lasry"
BQ_PROJECT = "data-hub-468216"
BQ_QUERY = """
SELECT Address, Page_Content_1
FROM `data-hub-468216.ScreamingFrog.custom_javascript_page_content`
WHERE domain = 'plasry.com'
  AND Page_Content_1 IS NOT NULL
  AND LENGTH(Page_Content_1) >= 100
"""
EMBEDDING_MODEL = "text-embedding-3-small"


def _hash(text: str) -> str:
    return hashlib.md5(text.encode("utf-8")).hexdigest()


def _word_count(text: str) -> int:
    return len(text.split())


def _embed(client: OpenAI, text: str) -> list[float]:
    """text-embedding-3-small: 1536 dims, supports up to 8192 tokens."""
    res = client.embeddings.create(model=EMBEDDING_MODEL, input=text[:24000])  # ~6K tokens cap
    return res.data[0].embedding


def fetch_bq_content() -> Iterable[dict]:
    bq = bigquery.Client(project=BQ_PROJECT)
    for row in bq.query(BQ_QUERY).result():
        content = row["Page_Content_1"]
        if not content or not content.strip():
            continue
        yield {"url": row["Address"], "content": content.strip()}


def get_existing_pages(db, property_id: str) -> dict[str, dict]:
    """Map url -> {id, content_hash} for current rows."""
    rows = (
        db.table("page")
        .select("id, url, content_hash")
        .eq("property_id", property_id)
        .execute()
        .data
    )
    return {r["url"]: r for r in rows}


def run() -> None:
    db = get_admin_client()
    openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    prop = db.table("property").select("id").eq("slug", PROPERTY_SLUG).single().execute().data
    property_id = prop["id"]
    existing = get_existing_pages(db, property_id)

    fetched = list(fetch_bq_content())
    print(f"Fetched {len(fetched)} content rows from BQ for plasry")

    matched = 0
    skipped_unchanged = 0
    embedded = 0
    no_match = 0

    for row in fetched:
        url, content = row["url"], row["content"]
        if url not in existing:
            no_match += 1
            continue
        existing_hash = existing[url].get("content_hash")
        new_hash = _hash(content)

        update: dict = {
            "content_text": content,
            "content_hash": new_hash,
            "word_count": _word_count(content),
            "last_crawled_at": "2026-04-14T00:00:00Z",  # approx Adam crawl time
        }

        if existing_hash != new_hash:
            embedding = _embed(openai_client, content)
            update["embedding"] = embedding
            embedded += 1
        else:
            skipped_unchanged += 1

        db.table("page").update(update).eq("id", existing[url]["id"]).execute()
        matched += 1

    print(f"Matched + updated: {matched}")
    print(f"Embeddings generated: {embedded}")
    print(f"Skipped (unchanged content): {skipped_unchanged}")
    print(f"No matching page row in Supabase: {no_match}")


if __name__ == "__main__":
    run()
