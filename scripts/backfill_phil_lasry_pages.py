"""DEPRECATED 2026-05-17 — superseded by scripts/backfill_pages.py.

backfill_pages.py reads workbook columns by header name (not position), so it
handles plasry's 41-col layout and other layouts equally. Run:

    python scripts/backfill_pages.py phil-lasry delivery/phil-lasry/phase-1-wqa/plasry-Website-Quality-Audit-2026-04-14.xlsx

instead. This file is retained for the historical column-position notes below.

---

Backfill phil-lasry pages from the existing WQA workbook into Supabase.

Reads the URL Triage tab, normalizes audit_action labels, upserts page rows.

Workbook column mapping (0-indexed, from 2026-04-14 workbook inspection):
  [0]  URL
  [1]  Action          -> audit_action
  [2]  Logic           -> audit_notes
  [3]  Status Code     -> status_code
  [4]  Category        -> page_type
  [33] Title           -> title
  [34] H1              -> h1
  [40] Redirect Final URL -> audit_target_url (populated for redirects)
"""
from __future__ import annotations

from pathlib import Path
from typing import Iterator

import openpyxl

from scripts.supabase_client import get_admin_client


WORKBOOK = Path("/Users/paulskirbe/agency/delivery/phil-lasry/phase-1-wqa/plasry-Website-Quality-Audit-2026-04-14.xlsx")
TRIAGE_SHEET_NAME = "URL Triage"
PROPERTY_SLUG = "phil-lasry"

# Column indices from triage tab (0-indexed).
COL_URL = 0
COL_AUDIT_ACTION = 1
COL_AUDIT_NOTES = 2
COL_STATUS_CODE = 3
COL_PAGE_TYPE = 4
COL_TITLE = 33
COL_H1 = 34
COL_AUDIT_TARGET = 40  # "Redirect Final URL" — populated for redirect rows

# Map workbook Action values to schema check-constraint values.
# "Review" (2 rows in plasry workbook) -> "undecided" (no constraint value for review).
ACTION_NORMALIZE: dict[str | None, str] = {
    "optimize": "optimize",
    "Optimize": "optimize",
    "restore": "restore",
    "Restore": "restore",
    "redirect": "redirect",
    "Redirect": "redirect",
    "consolidate": "consolidate",
    "Consolidate": "consolidate",
    "remove": "remove",
    "Remove": "remove",
    "Delete": "remove",
    "keep": "keep",
    "Keep": "keep",
    "no action": "no_action",
    "No Action": "no_action",
    "no_action": "no_action",
    "review": "undecided",
    "Review": "undecided",
    "": "undecided",
    None: "undecided",
}


def _clean(val: object) -> str | None:
    """Return stripped string or None for empty/None values."""
    if val is None:
        return None
    s = str(val).strip()
    return s if s and s.lower() not in ("none found", "none") else None


def iter_triage_rows() -> Iterator[dict]:
    wb = openpyxl.load_workbook(WORKBOOK, read_only=True, data_only=True)
    ws = wb[TRIAGE_SHEET_NAME]
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or not row[COL_URL]:
            continue
        url = str(row[COL_URL]).strip()
        if not url.startswith("http"):
            continue

        raw_action = row[COL_AUDIT_ACTION]
        audit_action = ACTION_NORMALIZE.get(raw_action, "undecided")

        # audit_target_url: use Redirect Final URL col only when non-empty
        audit_target = _clean(row[COL_AUDIT_TARGET]) if len(row) > COL_AUDIT_TARGET else None

        yield {
            "url": url,
            "page_type": _clean(row[COL_PAGE_TYPE]),
            "status_code": int(row[COL_STATUS_CODE]) if row[COL_STATUS_CODE] else None,
            "audit_action": audit_action,
            "audit_target_url": audit_target,
            "audit_notes": _clean(row[COL_AUDIT_NOTES]),
            "title": _clean(row[COL_TITLE]),
            "h1": _clean(row[COL_H1]),
        }


def run() -> None:
    db = get_admin_client()
    prop = db.table("property").select("id").eq("slug", PROPERTY_SLUG).single().execute().data
    property_id = prop["id"]

    rows = list(iter_triage_rows())
    print(f"Read {len(rows)} pages from {WORKBOOK.name}")

    batch_size = 100
    inserted = 0
    for i in range(0, len(rows), batch_size):
        batch = [
            {
                **r,
                "property_id": property_id,
                "audit_decided_by": "import:wqa_workbook",
                "audit_decided_at": "2026-04-14T00:00:00Z",
            }
            for r in rows[i : i + batch_size]
        ]
        db.table("page").upsert(batch, on_conflict="property_id,url").execute()
        inserted += len(batch)
        print(f"  upserted {inserted}/{len(rows)}")

    print(f"Done. {inserted} page rows in Supabase for {PROPERTY_SLUG}.")


if __name__ == "__main__":
    run()
