"""Sync SEOPipelineDev.wqa_output rows into Supabase `page` table.

Reads the latest wqa_output rows for a (project_id, domain) and upserts into
Supabase, keyed on (property_id, url). Preserves existing audit_action values
when the row already exists; new rows get audit_action='undecided'.

Usage:
    python -m scripts.sync_wqa_output_to_pages <property_slug> <project_id>
    python -m scripts.sync_wqa_output_to_pages busbank 9

The Supabase `page` audit_action enum allows: optimize, restore, redirect,
consolidate, remove, keep, no_action, undecided.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from google.cloud import bigquery
from supabase import create_client

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


WQA_TABLE = "data-hub-468216.SEOPipelineDev.wqa_output"


def _bq() -> bigquery.Client:
    return bigquery.Client(project="data-hub-468216")


def _supabase():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def fetch_latest_wqa_rows(project_id: int) -> list[dict]:
    """Pull the latest version's wqa_output rows for a project."""
    bq = _bq()
    sql = f"""
    WITH latest AS (
      SELECT MAX(version) AS v FROM `{WQA_TABLE}` WHERE project_id = @pid
    )
    SELECT
      url,
      page_path,
      type AS page_type,
      current_title AS title,
      h1,
      meta_description,
      word_count,
      status_code,
      canonical_link_element AS canonical_url,
      indexability,
      indexability_status,
      sessions,
      conversions,
      total_revenue,
      inlinks,
      outlinks,
      page_depth,
      best_tv_keyword,
      best_tv_kw_sv,
      best_tv_kw_rank
    FROM `{WQA_TABLE}`, latest
    WHERE project_id = @pid
      AND version = latest.v
      AND url IS NOT NULL
      AND url LIKE 'http%'
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("pid", "INT64", project_id)]
    )
    rows = [dict(r) for r in bq.query(sql, job_config=job_config).result()]
    return rows


def run(property_slug: str, project_id: int) -> None:
    db = _supabase()
    prop_resp = db.table("property").select("id").eq("slug", property_slug).single().execute()
    if not prop_resp.data:
        print(f"error: no property with slug={property_slug!r}", file=sys.stderr)
        sys.exit(2)
    property_id = prop_resp.data["id"]

    print(f"→ pulling wqa_output rows for project_id={project_id}")
    wqa_rows = fetch_latest_wqa_rows(project_id)
    print(f"→ {len(wqa_rows)} rows from wqa_output")

    # Pull existing pages for this property so we can preserve audit_action.
    existing_resp = db.table("page").select("url, audit_action").eq("property_id", property_id).execute()
    # Supabase JS client paginates at 1000 by default; use a manual loop.
    existing: dict[str, str] = {}
    page_size = 1000
    offset = 0
    while True:
        resp = (
            db.table("page")
            .select("url, audit_action")
            .eq("property_id", property_id)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        chunk = resp.data or []
        for r in chunk:
            existing[r["url"]] = r["audit_action"]
        if len(chunk) < page_size:
            break
        offset += page_size
    print(f"→ {len(existing)} existing pages in supabase (audit_action preserved on update)")

    upserts: list[dict] = []
    for r in wqa_rows:
        url = r["url"]
        record = {
            "property_id": property_id,
            "url": url,
            "page_type": r.get("page_type"),
            "title": r.get("title"),
            "h1": r.get("h1"),
            "meta_description": r.get("meta_description"),
            "word_count": int(r["word_count"]) if r.get("word_count") is not None else None,
            "status_code": int(r["status_code"]) if r.get("status_code") is not None else None,
            "canonical_url": r.get("canonical_url"),
        }
        # Preserve audit_action when row exists; default to undecided for new URLs.
        record["audit_action"] = existing.get(url, "undecided")
        upserts.append(record)

    batch = 100
    written = 0
    for i in range(0, len(upserts), batch):
        chunk = upserts[i : i + batch]
        db.table("page").upsert(chunk, on_conflict="property_id,url").execute()
        written += len(chunk)
        print(f"  upserted {written}/{len(upserts)}")

    # Summary
    new_count = sum(1 for r in upserts if r["url"] not in existing)
    updated_count = len(upserts) - new_count
    print(f"→ done. new={new_count}  updated={updated_count}  total in supabase now>={len(existing | {r['url']: '' for r in upserts})}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("property_slug")
    ap.add_argument("project_id", type=int)
    args = ap.parse_args()
    run(args.property_slug, args.project_id)


if __name__ == "__main__":
    main()
