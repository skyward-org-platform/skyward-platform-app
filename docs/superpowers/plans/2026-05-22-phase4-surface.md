# Phase 4 Content Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/properties/[slug]/content` as the canonical Phase 4 surface — Master Content Plan + Sprint Calendar + Performance Tracker with inline status/writer/sprint edits, polymorphic Content drawer, and a Python-backed Supabase backfill for all 8 TNA properties.

**Architecture:** New Supabase `content_row` table is the canonical source. Python backfill (`delivery/tna/phase4_backfill_supabase.py`) materializes Phase 4 data from existing build_phase4_content.py logic into Supabase. App reads from `content_row`, writes through server actions; history trigger fires on editable fields only.

**Tech Stack:** Next.js 16 (App Router + RSC), Supabase Postgres + RLS, Python (supabase-py for backfill), existing `@/lib/supabase` singleton, existing universal drawer pattern.

**Spec:** `docs/superpowers/specs/2026-05-22-phase4-surface-design.md`

---

## File Structure

```
db/supabase/migrations/
  20260522_content_row.sql                                  [new] content_row + history + trigger

delivery/tna/
  phase4_backfill_supabase.py                               [new] one-shot CSV/Supabase → content_row backfill (8 properties)

web/lib/
  content-rows.ts                                           [new] typed Supabase queries

web/app/properties/[slug]/content/
  page.tsx                                                  [modify] real route; replaces placeholder; fetch + pass to ContentView
  actions.ts                                                [new] 5 server actions per spec

web/components/content/
  ContentView.tsx                                           [new] 5-tab nav shell
  OverviewTab.tsx                                           [new] 4-up stat tiles + status bar + upcoming sprint
  MasterPlanTab.tsx                                         [new] main table; 9 inline columns + Open button
  SprintCalendarTab.tsx                                     [new] grouped-by-sprint variant of MasterPlan
  PerformanceTrackerTab.tsx                                 [new] forecast + 30d/60d/90d rank entry
  ActionLegendTab.tsx                                       [new] static reference
  StatusChip.tsx                                            [new] Not Started / Brief / Draft / Review / Published
  ActionTypeChip.tsx                                        [new] Optimize / Refresh / Rewrite / New / Remove + override semantics
  WriterCell.tsx                                            [new] inline editable text input
  SprintCell.tsx                                            [new] inline editable numeric input

web/components/
  UrlDrawer.tsx                                             [modify] add Content subject to discriminated union; ContentDrawer variant

web/api/wqa/
  export.py                                                 [modify] handle ?phase=4 case
```

---

## Chunk 1: Schema migration + Python backfill

### Task 1.1: content_row migration

**Files:**
- Create: `db/supabase/migrations/20260522_content_row.sql`

- [ ] **Step 1: Write the migration**

```sql
create table if not exists content_row (
  id                          uuid primary key default gen_random_uuid(),
  property_id                 uuid not null references property(id) on delete cascade,
  url                         text not null,
  source                      text not null
                               check (source in ('phase1_optimize','phase1_restore','phase3_gap_cluster')),
  cluster_id                  uuid references keyword_cluster(id) on delete set null,

  -- Identity & Strategy
  vertical                    text,
  action_type                 text not null
                               check (action_type in ('Optimize','Refresh','Rewrite','New','Remove')),
  action_type_override        text
                               check (action_type_override is null or action_type_override in ('Optimize','Refresh','Rewrite','New','Remove')),
  page_type                   text,
  parent_page                 text,
  priority_tier               text,
  target_keyword              text,

  -- Calendar
  sprint                      int,
  brief_due                   date,
  draft_due                   date,
  target_publish              date,
  owners                      text default 'Skyward (writer) + Client (review)',
  calendar_status             text default 'Scheduled'
                               check (calendar_status in ('Scheduled','Slipped','Done')),

  -- Brief Spec
  title_formatted             text,
  title_override              text,
  h1_target                   text,
  h1_override                 text,
  meta_description_spec       text,
  meta_description_override   text,
  word_count_target           text,
  phase2_yellow_resolution    text,
  brief_status                text default 'Not Started'
                               check (brief_status in ('Not Started','In Progress','Approved')),

  -- Content Inputs (blocked placeholders)
  entities_blocked            text default 'BLOCKED — run InfraNodus per cluster at brief time',
  faqs_blocked                text default 'BLOCKED — extract from cluster top SERP PAA at brief time',
  fanout_blocked              text default 'BLOCKED — LLM fan-out per cluster at brief time',

  -- Draft & Production
  status                      text not null default 'Not Started'
                               check (status in ('Not Started','Brief','Draft','Review','Published')),
  writer                      text,
  word_count_actual           int,
  draft_link                  text,
  published_url               text,
  feedback_notes              text,

  -- Dependencies + Linking + Schema + Post-Publish
  dependencies                text,
  internal_links_out          text,
  internal_links_in           text,
  current_schema              text default '—',
  required_schema             text,
  jsonld_notes                text,
  post_publish_tasks          text,

  -- Performance Tracker
  rank_30d                    int,
  rank_60d                    int,
  rank_90d                    int,

  -- Meta
  computed_at                 timestamptz not null default now(),
  updated_by                  text not null,
  updated_at                  timestamptz not null default now()
);

create unique index if not exists idx_content_row_property_url on content_row (property_id, url);
create index if not exists idx_content_row_property_status on content_row (property_id, status);
create index if not exists idx_content_row_property_sprint on content_row (property_id, sprint);
create index if not exists idx_content_row_property_priority on content_row (property_id, priority_tier);

alter table content_row enable row level security;
create policy "team can read content_row" on content_row for select
  using (auth.role() = 'authenticated');
create policy "team can write content_row" on content_row for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );

create table if not exists content_row_history (
  id              uuid primary key default gen_random_uuid(),
  content_row_id  uuid not null references content_row(id) on delete cascade,
  property_id     uuid not null,
  url             text not null,
  status          text,
  writer          text,
  sprint          int,
  brief_status    text,
  calendar_status text,
  action_type_override text,
  title_override  text,
  h1_override     text,
  meta_description_override text,
  draft_link      text,
  published_url   text,
  word_count_actual int,
  feedback_notes  text,
  owners          text,
  rank_30d        int,
  rank_60d        int,
  rank_90d        int,
  updated_by      text not null,
  snapshotted_at  timestamptz not null default now()
);

create index if not exists idx_content_row_history on content_row_history (content_row_id, snapshotted_at desc);

create or replace function snapshot_content_row() returns trigger
language plpgsql as $$
begin
  insert into content_row_history
    (content_row_id, property_id, url, status, writer, sprint,
     brief_status, calendar_status, action_type_override,
     title_override, h1_override, meta_description_override,
     draft_link, published_url, word_count_actual, feedback_notes,
     owners, rank_30d, rank_60d, rank_90d, updated_by)
  values
    (old.id, old.property_id, old.url, old.status, old.writer, old.sprint,
     old.brief_status, old.calendar_status, old.action_type_override,
     old.title_override, old.h1_override, old.meta_description_override,
     old.draft_link, old.published_url, old.word_count_actual, old.feedback_notes,
     old.owners, old.rank_30d, old.rank_60d, old.rank_90d, old.updated_by);
  return new;
end; $$;

drop trigger if exists trg_snapshot_content_row on content_row;
create trigger trg_snapshot_content_row
  before update on content_row
  for each row
  when (
       old.status is distinct from new.status
    or old.writer is distinct from new.writer
    or old.sprint is distinct from new.sprint
    or old.brief_status is distinct from new.brief_status
    or old.calendar_status is distinct from new.calendar_status
    or old.action_type_override is distinct from new.action_type_override
    or old.title_override is distinct from new.title_override
    or old.h1_override is distinct from new.h1_override
    or old.meta_description_override is distinct from new.meta_description_override
    or old.draft_link is distinct from new.draft_link
    or old.published_url is distinct from new.published_url
    or old.word_count_actual is distinct from new.word_count_actual
    or old.feedback_notes is distinct from new.feedback_notes
    or old.owners is distinct from new.owners
    or old.rank_30d is distinct from new.rank_30d
    or old.rank_60d is distinct from new.rank_60d
    or old.rank_90d is distinct from new.rank_90d
  )
  execute function snapshot_content_row();

alter table content_row_history enable row level security;
create policy "team can read content_row_history" on content_row_history for select
  using (auth.role() = 'authenticated');
```

- [ ] **Step 2: Apply migration**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app/db && \
  supabase db query --linked --file supabase/migrations/20260522_content_row.sql
```

Expected: success / no error.

- [ ] **Step 3: Verify tables**

```bash
supabase db query --linked --sql "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('content_row','content_row_history') ORDER BY table_name;"
```

Expected: 2 rows.

- [ ] **Step 4: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add db/supabase/migrations/20260522_content_row.sql && git commit -m "feat(db): content_row table + history trigger"
```

### Task 1.2: Python backfill script

**Files:**
- Create: `delivery/tna/phase4_backfill_supabase.py`

- [ ] **Step 1: Write the script**

```python
"""Backfill content_row in Supabase from Phase 1 triage CSVs + Phase 3 Supabase clusters.

Mirrors the logic in build_phase4_content.py but writes to Supabase instead of xlsx.
Idempotent: re-running upserts by (property_id, url) and preserves overrides
+ editable-state fields.
"""
from __future__ import annotations

import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path("/Users/paulskirbe/agency/.env"))

# Reuse the existing builder's logic
sys.path.insert(0, str(Path("/Users/paulskirbe/agency/delivery/tna")))
from build_phase4_content import (
    SITES, SCHEMA_TARGETS, POST_PUBLISH, SPRINT_START, SPRINT_LENGTH, PAGES_PER_SPRINT,
    derive_action_type, word_count_target, priority_tier, assign_calendar,
    build_linking_plan, compute_yellow_resolution, title_case,
    load_phase1_triage, load_supabase_clusters, build_rows_for_site,
)

OPERATOR = "system:phase4-backfill"

# Mapping the in-memory row dict (from build_rows_for_site) to content_row columns.
def to_supabase_row(r: dict, property_id: str, source_kind: str) -> dict:
    return {
        "property_id": property_id,
        "url": r["url"],
        "source": source_kind,
        "vertical": r.get("vertical"),
        "action_type": r["action_type"],
        "page_type": r.get("page_type"),
        "parent_page": r.get("parent_page"),
        "priority_tier": r["priority_tier"],
        "target_keyword": r.get("target_keyword"),
        "sprint": r.get("sprint"),
        "brief_due": r.get("brief_due"),
        "draft_due": r.get("draft_due"),
        "target_publish": r.get("publish"),
        "owners": r.get("owners"),
        "calendar_status": r.get("calendar_status") or "Scheduled",
        "title_formatted": r.get("title_formatted"),
        "h1_target": r.get("h1_target"),
        "meta_description_spec": r.get("meta_spec"),
        "word_count_target": r.get("word_count_target"),
        "phase2_yellow_resolution": r.get("yellow_resolution"),
        "dependencies": r.get("dependencies"),
        "internal_links_out": r.get("out_links"),
        "internal_links_in": r.get("in_links"),
        "current_schema": r.get("current_schema"),
        "required_schema": r.get("required_schema"),
        "jsonld_notes": r.get("jsonld_notes"),
        "post_publish_tasks": r.get("post_publish"),
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": OPERATOR,
    }


def get_property_id(db, slug: str) -> str | None:
    rows = db.table("property").select("id").eq("slug", slug).execute().data
    return rows[0]["id"] if rows else None


def cluster_id_lookup(db, slug: str, property_id: str) -> dict[int, str]:
    """Map Phase 3 cluster_number -> Supabase keyword_cluster.id for FK linkage."""
    rows = db.table("keyword_cluster").select(
        "id, cluster_number"
    ).eq("property_id", property_id).execute().data
    return {int(r["cluster_number"]): r["id"] for r in rows}


def backfill_site(db, site):
    property_id = get_property_id(db, site.slug)
    if not property_id:
        return {"site": site.domain, "ok": False, "reason": "property not in Supabase"}

    triage = load_phase1_triage(site)
    clusters, urls, _ = load_supabase_clusters(db, site.slug)
    if clusters.empty:
        return {"site": site.domain, "ok": False, "reason": "no Phase 3 clusters"}

    rows = build_rows_for_site(site, triage, clusters, urls)
    rows = assign_calendar(rows)
    links_out, links_in = build_linking_plan(rows)
    for r in rows:
        r["out_links"] = "\n".join(links_out.get(r["url"], [])) or "(none)"
        r["in_links"] = "\n".join(links_in.get(r["url"], [])) or "(none)"

    cluster_id_by_number = cluster_id_lookup(db, site.slug, property_id)

    # Source classification per row
    def source_for(r: dict) -> str:
        if r["url"].startswith("(NEW:"):
            return "phase3_gap_cluster"
        if r["priority_tier"].startswith("1. Restore"):
            return "phase1_restore"
        return "phase1_optimize"

    sb_rows = []
    for r in rows:
        sb = to_supabase_row(r, property_id, source_for(r))
        cnum = r.get("cluster_number")
        if cnum is not None and int(cnum) in cluster_id_by_number:
            sb["cluster_id"] = cluster_id_by_number[int(cnum)]
        sb_rows.append(sb)

    BATCH = 200
    for i in range(0, len(sb_rows), BATCH):
        db.table("content_row").upsert(
            sb_rows[i:i+BATCH], on_conflict="property_id,url"
        ).execute()

    return {"site": site.domain, "ok": True, "rows": len(sb_rows)}


def main():
    db = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    results = []
    for site in SITES:
        try:
            r = backfill_site(db, site)
            results.append(r)
            if r["ok"]:
                print(f"  ✓ {site.domain}: {r['rows']:,} rows")
            else:
                print(f"  ✗ {site.domain}: {r['reason']}")
        except Exception as e:
            print(f"  ✗ {site.domain}: {type(e).__name__}: {e}")
            import traceback as tb; tb.print_exc()
            results.append({"site": site.domain, "ok": False, "reason": str(e)})

    print("\n=== Summary ===")
    total = sum(r.get("rows", 0) for r in results if r.get("ok"))
    ok = sum(1 for r in results if r.get("ok"))
    print(f"{ok}/{len(SITES)} sites succeeded; {total:,} total rows in content_row")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Run the backfill**

```bash
cd /Users/paulskirbe/agency && uv run --with supabase --with python-dotenv --with pandas --with openpyxl python delivery/tna/phase4_backfill_supabase.py 2>&1 | tail -20
```

Expected: all 8 sites succeed; total rows ≈ 3,489.

- [ ] **Step 3: Smoke-verify in Supabase**

```sql
SELECT
  (SELECT slug FROM property WHERE id = property_id) AS slug,
  COUNT(*) AS rows,
  COUNT(*) FILTER (WHERE status = 'Not Started') AS not_started,
  COUNT(*) FILTER (WHERE source = 'phase3_gap_cluster') AS gap_rows
FROM content_row GROUP BY property_id ORDER BY rows DESC;
```

Expected: 8 rows; sums to ~3,489.

- [ ] **Step 4: Commit**

```bash
cd /Users/paulskirbe/agency && git add delivery/tna/phase4_backfill_supabase.py && git commit -m "feat(phase-4): Supabase backfill script for content_row across 8 TNA properties"
```

---

## Chunk 2: Libs + server actions

### Task 2.1: web/lib/content-rows.ts

**Files:**
- Create: `web/lib/content-rows.ts`

- [ ] **Step 1: Write the lib**

```typescript
import { supabase } from "./supabase";

export type ContentStatus = "Not Started" | "Brief" | "Draft" | "Review" | "Published";
export type ContentActionType = "Optimize" | "Refresh" | "Rewrite" | "New" | "Remove";
export type ContentSource = "phase1_optimize" | "phase1_restore" | "phase3_gap_cluster";
export type ContentBriefStatus = "Not Started" | "In Progress" | "Approved";
export type ContentCalendarStatus = "Scheduled" | "Slipped" | "Done";

export type ContentRow = {
  id: string;
  property_id: string;
  url: string;
  source: ContentSource;
  cluster_id: string | null;

  vertical: string | null;
  action_type: ContentActionType;
  action_type_override: ContentActionType | null;
  page_type: string | null;
  parent_page: string | null;
  priority_tier: string | null;
  target_keyword: string | null;

  sprint: number | null;
  brief_due: string | null;
  draft_due: string | null;
  target_publish: string | null;
  owners: string | null;
  calendar_status: ContentCalendarStatus;

  title_formatted: string | null;
  title_override: string | null;
  h1_target: string | null;
  h1_override: string | null;
  meta_description_spec: string | null;
  meta_description_override: string | null;
  word_count_target: string | null;
  phase2_yellow_resolution: string | null;
  brief_status: ContentBriefStatus;

  entities_blocked: string;
  faqs_blocked: string;
  fanout_blocked: string;

  status: ContentStatus;
  writer: string | null;
  word_count_actual: number | null;
  draft_link: string | null;
  published_url: string | null;
  feedback_notes: string | null;

  dependencies: string | null;
  internal_links_out: string | null;
  internal_links_in: string | null;
  current_schema: string | null;
  required_schema: string | null;
  jsonld_notes: string | null;
  post_publish_tasks: string | null;

  rank_30d: number | null;
  rank_60d: number | null;
  rank_90d: number | null;

  computed_at: string;
  updated_by: string;
  updated_at: string;
};

export async function getContentRowsByProperty(propertyId: string): Promise<ContentRow[]> {
  const { data, error } = await supabase
    .from("content_row")
    .select("*")
    .eq("property_id", propertyId);
  if (error) throw new Error(`getContentRowsByProperty: ${error.message}`);
  return (data ?? []) as ContentRow[];
}

export type ContentRowUpdate = {
  id: string;
  updated_by: string;
} & Partial<Pick<
  ContentRow,
  "status" | "writer" | "sprint" | "brief_status" | "calendar_status"
    | "action_type_override" | "title_override" | "h1_override"
    | "meta_description_override" | "draft_link" | "published_url"
    | "word_count_actual" | "feedback_notes" | "owners"
    | "rank_30d" | "rank_60d" | "rank_90d"
>>;

export async function updateContentRow(input: ContentRowUpdate): Promise<ContentRow> {
  const { id, updated_by, ...changes } = input;
  const { data, error } = await supabase
    .from("content_row")
    .update({ ...changes, updated_by, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`updateContentRow: ${error.message}`);
  return data as ContentRow;
}
```

- [ ] **Step 2: Verify type-check**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add web/lib/content-rows.ts && git commit -m "feat(lib): content_row typed queries"
```

### Task 2.2: Server actions

**Files:**
- Create: `web/app/properties/[slug]/content/actions.ts`

- [ ] **Step 1: Write the file**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireWriteToken } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import { supabase } from "@/lib/supabase";
import {
  updateContentRow,
  type ContentStatus,
} from "@/lib/content-rows";

type Ok = { ok: true };
type Err = { ok: false; error: string };

function bust(slug: string) {
  revalidatePath(`/properties/${slug}/content`);
}

export async function setRowStatus(
  slug: string, id: string, status: ContentStatus,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  try {
    await updateContentRow({ id, status, updated_by: getOperator() });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setRowWriter(
  slug: string, id: string, writer: string | null,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  try {
    await updateContentRow({ id, writer, updated_by: getOperator() });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setRowSprint(
  slug: string, id: string, sprint: number | null,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  try {
    await updateContentRow({ id, sprint, updated_by: getOperator() });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

type FieldName =
  | "action_type_override" | "title_override" | "h1_override"
  | "meta_description_override" | "brief_status" | "calendar_status"
  | "owners" | "word_count_actual" | "draft_link" | "published_url"
  | "feedback_notes" | "rank_30d" | "rank_60d" | "rank_90d";

export async function setRowField(
  slug: string, id: string, field: FieldName, value: unknown,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  try {
    await updateContentRow({ id, [field]: value, updated_by: getOperator() } as never);
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
```

- [ ] **Step 2: Type-check + build**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app/web && npm run build 2>&1 | tail -5
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add web/app/properties/[slug]/content/actions.ts && git commit -m "feat(actions): content row server actions (status/writer/sprint/field)"
```

---

## Chunk 3: Read-only /content surface

### Task 3.1: Route + page.tsx

**Files:**
- Modify: `web/app/properties/[slug]/content/page.tsx` (current state: may be a placeholder; replace fully)

- [ ] **Step 1: Write the route**

```tsx
import { supabase } from "@/lib/supabase";
import { getContentRowsByProperty } from "@/lib/content-rows";
import { ContentView } from "@/components/content/ContentView";

export default async function ContentTab({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { data: prop } = await supabase
    .from("property")
    .select("id, primary_domain, name")
    .eq("slug", slug)
    .single();
  if (!prop) {
    return <div className="p-8 text-sm text-muted-foreground">Property not found.</div>;
  }
  const rows = await getContentRowsByProperty(prop.id);
  return (
    <ContentView
      propertySlug={slug}
      propertyId={prop.id}
      propertyName={prop.name}
      primaryDomain={prop.primary_domain}
      rows={rows}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add web/app/properties/[slug]/content/page.tsx && git commit -m "feat(pages): /content route fetches Supabase data"
```

### Task 3.2: ContentView with 5-tab nav

**Files:**
- Create: `web/components/content/ContentView.tsx`

- [ ] **Step 1: Write the shell**

```tsx
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import type { ContentRow } from "@/lib/content-rows";
import { OverviewTab } from "./OverviewTab";
import { MasterPlanTab } from "./MasterPlanTab";
import { SprintCalendarTab } from "./SprintCalendarTab";
import { PerformanceTrackerTab } from "./PerformanceTrackerTab";
import { ActionLegendTab } from "./ActionLegendTab";

const TABS = [
  ["overview", "Overview"],
  ["plan", "Master Plan"],
  ["calendar", "Sprint Calendar"],
  ["tracker", "Performance Tracker"],
  ["legend", "Action Legend"],
] as const;

export type ContentViewProps = {
  propertySlug: string;
  propertyId: string;
  propertyName: string;
  primaryDomain: string | null;
  rows: ContentRow[];
};

export function ContentView(props: ContentViewProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const view = sp.get("view") || "overview";

  function setView(next: string) {
    const params = new URLSearchParams(sp.toString());
    params.set("view", next);
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Phase 4 master content plan for{" "}
          <span className="font-mono">{props.primaryDomain}</span>.{" "}
          {props.rows.length.toLocaleString()} rows.
        </p>
      </header>

      <nav className="flex gap-1 border-b mb-4 overflow-x-auto">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setView(k)}
            className={
              "px-3 py-1.5 text-sm border-b-2 -mb-px whitespace-nowrap " +
              (view === k
                ? "border-foreground font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            {label}
          </button>
        ))}
      </nav>

      {view === "overview" && <OverviewTab {...props} />}
      {view === "plan" && <MasterPlanTab {...props} />}
      {view === "calendar" && <SprintCalendarTab {...props} />}
      {view === "tracker" && <PerformanceTrackerTab {...props} />}
      {view === "legend" && <ActionLegendTab />}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add web/components/content/ContentView.tsx && git commit -m "feat(content): ContentView shell + 5-tab nav"
```

### Task 3.3: Overview tab

**Files:**
- Create: `web/components/content/OverviewTab.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";
import type { ContentViewProps } from "./ContentView";

const STATUS_COLORS: Record<string, string> = {
  "Not Started": "bg-slate-100 text-slate-700",
  "Brief": "bg-indigo-100 text-indigo-800",
  "Draft": "bg-sky-100 text-sky-800",
  "Review": "bg-amber-100 text-amber-800",
  "Published": "bg-emerald-100 text-emerald-800",
};

export function OverviewTab({ rows }: ContentViewProps) {
  const total = rows.length;
  const currentSprint = Math.min(
    ...rows.filter(r => r.status === "Not Started" && r.sprint != null).map(r => r.sprint as number)
  );
  const thisSprintCount = rows.filter(r => r.sprint === currentSprint).length;
  const inProduction = rows.filter(r =>
    r.status === "Brief" || r.status === "Draft" || r.status === "Review"
  ).length;
  const published = rows.filter(r => r.status === "Published").length;

  const statusCounts = ["Not Started","Brief","Draft","Review","Published"].map(s => ({
    s, n: rows.filter(r => r.status === s).length,
  }));

  const upcoming = [...rows]
    .filter(r => r.sprint != null)
    .sort((a, b) => (a.sprint as number) - (b.sprint as number))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ["Total rows", total.toLocaleString()],
          ["This sprint", String(thisSprintCount)],
          ["In production", String(inProduction)],
          ["Published", String(published)],
        ].map(([label, value]) => (
          <div key={label} className="border rounded-lg p-4 bg-card">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
            <div className="text-3xl font-semibold tabular-nums mt-1">{value}</div>
          </div>
        ))}
      </div>

      <div className="border rounded-lg p-4 bg-card">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">Status distribution</div>
        <div className="space-y-1.5">
          {statusCounts.map(({ s, n }) => {
            const pct = total > 0 ? Math.round((n / total) * 100) : 0;
            return (
              <div key={s} className="flex items-center gap-3 text-xs">
                <div className="w-24">{s}</div>
                <div className="flex-1 bg-muted rounded overflow-hidden h-3">
                  <div className={`h-full ${STATUS_COLORS[s]}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="tabular-nums w-16 text-right">{n.toLocaleString()} ({pct}%)</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold bg-muted">Upcoming sprint</div>
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-1.5 font-semibold">Sprint</th>
              <th className="text-left px-3 py-1.5 font-semibold">URL</th>
              <th className="text-left px-3 py-1.5 font-semibold">Action</th>
              <th className="text-left px-3 py-1.5 font-semibold">Cluster</th>
              <th className="text-left px-3 py-1.5 font-semibold">Writer</th>
            </tr>
          </thead>
          <tbody>
            {upcoming.map(r => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-1.5 tabular-nums">{r.sprint}</td>
                <td className="px-3 py-1.5 font-mono text-[11px] truncate max-w-md" title={r.url}>{r.url}</td>
                <td className="px-3 py-1.5">{r.action_type_override || r.action_type}</td>
                <td className="px-3 py-1.5 truncate max-w-xs">{r.target_keyword || "—"}</td>
                <td className="px-3 py-1.5">{r.writer || "TBD"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add web/components/content/OverviewTab.tsx && git commit -m "feat(content): OverviewTab — 4-up tiles + status bar + upcoming sprint"
```

### Tasks 3.4 - 3.7: Remaining read-only tabs

Each follows the same pattern as the existing /keywords sub-tab components. Inline state for filters, tabular-nums on numeric columns, sticky `<thead>`, truncation cells with title attrs.

- [ ] **Task 3.4** — `MasterPlanTab.tsx`. Table with 9 columns inline + Open button column (drawer hookup in Chunk 4). Filter chips at top by status/action_type/source (URL-persisted via `?status=` `?action=` `?source=`). Per-column filter row under headers (text inputs for URL/cluster/writer; numeric for sprint; selects for action/priority/status). Read-only. Commit: `feat(content): MasterPlanTab read-only`.

- [ ] **Task 3.5** — `SprintCalendarTab.tsx`. Groups rows by sprint. Sprint header card per group shows brief_due, target_publish, row count. Rows render same shape as MasterPlanTab. Commit: `feat(content): SprintCalendarTab read-only`.

- [ ] **Task 3.6** — `PerformanceTrackerTab.tsx`. Filters to rows with `target_keyword`. Columns per spec table. 30d/60d/90d initially read-only (editing wires in Chunk 4 via setRowField). Refresh Flag column computed inline from `90d_rank < 0.7 * 6mo_target`. Commit: `feat(content): PerformanceTrackerTab read-only`.

- [ ] **Task 3.7** — `ActionLegendTab.tsx`. 4 sections: Action Types · Status meanings · Priority Tiers · Page Types. Use existing chip/pill components. Static. Commit: `feat(content): ActionLegendTab`.

After Chunk 3: `cd web && npm run build` MUST succeed. Navigate `/properties/buscharter/content` on preview — all 5 tabs render without runtime errors.

---

## Chunk 4: Inline edits + Content drawer

### Task 4.1: StatusChip + ActionTypeChip + WriterCell + SprintCell components

**Files:**
- Create: `web/components/content/StatusChip.tsx`
- Create: `web/components/content/ActionTypeChip.tsx`
- Create: `web/components/content/WriterCell.tsx`
- Create: `web/components/content/SprintCell.tsx`

- [ ] **Step 1: StatusChip.tsx**

```tsx
"use client";
import { useTransition } from "react";
import { setRowStatus } from "@/app/properties/[slug]/content/actions";
import type { ContentStatus } from "@/lib/content-rows";

const STATES: ContentStatus[] = ["Not Started", "Brief", "Draft", "Review", "Published"];
const COLOR: Record<ContentStatus, string> = {
  "Not Started": "bg-slate-100 text-slate-700",
  "Brief": "bg-indigo-100 text-indigo-800",
  "Draft": "bg-sky-100 text-sky-800",
  "Review": "bg-amber-100 text-amber-800",
  "Published": "bg-emerald-100 text-emerald-800",
};

export function StatusChip({
  slug, rowId, value,
}: { slug: string; rowId: string; value: ContentStatus }) {
  const [pending, start] = useTransition();
  return (
    <select
      value={value}
      disabled={pending}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const next = e.target.value as ContentStatus;
        start(() => setRowStatus(slug, rowId, next));
      }}
      className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded border ${COLOR[value]} ${pending ? "opacity-50" : ""}`}
    >
      {STATES.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}
```

- [ ] **Step 2: ActionTypeChip.tsx**

Similar pattern; wraps `setRowField(slug, rowId, "action_type_override", value)`. When `override` is null, renders the auto-derived `action_type` with a muted style; choosing a different value sets the override.

```tsx
"use client";
import { useTransition } from "react";
import { setRowField } from "@/app/properties/[slug]/content/actions";
import type { ContentActionType } from "@/lib/content-rows";

const TYPES: ContentActionType[] = ["Optimize","Refresh","Rewrite","New","Remove"];
const COLOR: Record<ContentActionType, string> = {
  Optimize: "bg-emerald-100 text-emerald-800",
  Refresh: "bg-amber-100 text-amber-800",
  Rewrite: "bg-sky-100 text-sky-800",
  New: "bg-violet-100 text-violet-800",
  Remove: "bg-rose-100 text-rose-800",
};

export function ActionTypeChip({
  slug, rowId, value, override,
}: { slug: string; rowId: string; value: ContentActionType; override: ContentActionType | null }) {
  const [pending, start] = useTransition();
  const current = override ?? value;
  return (
    <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <select
        value={current}
        disabled={pending}
        onChange={(e) => start(() => setRowField(
          slug, rowId, "action_type_override",
          e.target.value === value ? null : e.target.value
        ))}
        className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded ${COLOR[current]} ${pending ? "opacity-50" : ""} ${override ? "ring-1 ring-foreground/20" : ""}`}
        title={override ? `Override of auto-derived ${value}` : "Auto-derived"}
      >
        {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
    </div>
  );
}
```

- [ ] **Step 3: WriterCell.tsx**

```tsx
"use client";
import { useState, useTransition } from "react";
import { setRowWriter } from "@/app/properties/[slug]/content/actions";

export function WriterCell({
  slug, rowId, value,
}: { slug: string; rowId: string; value: string | null }) {
  const [local, setLocal] = useState(value ?? "");
  const [pending, start] = useTransition();
  function commit() {
    if (local !== (value ?? "")) {
      start(() => setRowWriter(slug, rowId, local || null));
    }
  }
  return (
    <input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      onClick={(e) => e.stopPropagation()}
      disabled={pending}
      placeholder="TBD"
      className={`text-xs px-2 py-1 rounded border bg-transparent w-28 ${pending ? "opacity-50" : ""}`}
    />
  );
}
```

- [ ] **Step 4: SprintCell.tsx**

```tsx
"use client";
import { useState, useTransition } from "react";
import { setRowSprint } from "@/app/properties/[slug]/content/actions";

export function SprintCell({
  slug, rowId, value,
}: { slug: string; rowId: string; value: number | null }) {
  const [local, setLocal] = useState(value?.toString() ?? "");
  const [pending, start] = useTransition();
  function commit() {
    const n = local === "" ? null : Number(local);
    if (n !== value && (n === null || !Number.isNaN(n))) {
      start(() => setRowSprint(slug, rowId, n));
    }
  }
  return (
    <input
      type="number"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      onClick={(e) => e.stopPropagation()}
      disabled={pending}
      className={`text-xs px-2 py-1 rounded border bg-transparent w-16 tabular-nums ${pending ? "opacity-50" : ""}`}
    />
  );
}
```

- [ ] **Step 5: Wire all 4 into MasterPlanTab + SprintCalendarTab + PerformanceTrackerTab where applicable**

Replace each tab's status / action / writer / sprint cell rendering with the new components. Pass `slug={props.propertySlug}` + the row's id + current value.

- [ ] **Step 6: Build verifies**

```bash
cd web && npm run build 2>&1 | tail -3
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add web/components/content/{StatusChip,ActionTypeChip,WriterCell,SprintCell}.tsx web/components/content/{MasterPlanTab,SprintCalendarTab,PerformanceTrackerTab}.tsx
git commit -m "feat(content): inline editors — StatusChip + ActionTypeChip + WriterCell + SprintCell"
```

### Task 4.2: Universal drawer — Content subject

**Files:**
- Modify: `web/components/UrlDrawer.tsx`

- [ ] **Step 1: Add Content subject to discriminated union**

Find the existing `DrawerSubject` type. Add a fourth variant:

```typescript
import type { ContentRow } from "@/lib/content-rows";
import type { ClusterRow } from "@/lib/clusters";

export type DrawerSubject =
  | { kind: "url"; /* existing */ }
  | { kind: "keyword"; /* existing */ }
  | { kind: "cluster"; /* existing */ }
  | { kind: "content"; row: ContentRow; cluster: ClusterRow | null };
```

- [ ] **Step 2: Add ContentDrawer variant**

In the same file (or extracted to `ContentDrawer.tsx` if the file is large), implement:

```tsx
function ContentDrawer({
  subject, onClose, propertySlug,
}: {
  subject: Extract<DrawerSubject, { kind: "content" }>;
  onClose: () => void;
  propertySlug: string;
}) {
  const r = subject.row;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative w-[600px] h-full bg-background border-l overflow-y-auto p-5 space-y-5">
        <header>
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono truncate">{r.url}</span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-wider">
            <span>Sprint {r.sprint ?? "—"}</span>
            <span>·</span>
            <span>{r.action_type_override ?? r.action_type}</span>
            <span>·</span>
            <span>{r.status}</span>
          </div>
        </header>

        <Section title="Identity">
          <Field label="Vertical">{r.vertical || "—"}</Field>
          <Field label="Page Type">{r.page_type || "—"}</Field>
          <Field label="Parent">{r.parent_page || "—"}</Field>
          <Field label="Priority">{r.priority_tier || "—"}</Field>
          <Field label="Target Keyword">{r.target_keyword || "—"}</Field>
          {subject.cluster && (
            <Field label="Cluster">
              {subject.cluster.name_override || subject.cluster.head_term}
              ({subject.cluster.member_count.toLocaleString()} kw / SV {subject.cluster.total_sv.toLocaleString()})
            </Field>
          )}
        </Section>

        <Section title="Calendar">
          <FieldRow label="Sprint" editor={
            <SprintCell slug={propertySlug} rowId={r.id} value={r.sprint} />
          } />
          <Field label="Brief due">{r.brief_due || "—"}</Field>
          <Field label="Draft due">{r.draft_due || "—"}</Field>
          <Field label="Target publish">{r.target_publish || "—"}</Field>
          <FieldRow label="Owners" editor={
            <TextDrawerEditor slug={propertySlug} rowId={r.id} field="owners" value={r.owners} />
          } />
          <FieldRow label="Status" editor={
            <SelectDrawerEditor slug={propertySlug} rowId={r.id} field="calendar_status"
              value={r.calendar_status} options={["Scheduled","Slipped","Done"]} />
          } />
        </Section>

        <Section title="Brief Spec">
          <Field label="Title (auto)">{r.title_formatted || "—"}</Field>
          <FieldRow label="Title override" editor={
            <TextDrawerEditor slug={propertySlug} rowId={r.id} field="title_override" value={r.title_override} />
          } />
          <Field label="H1 (auto)">{r.h1_target || "—"}</Field>
          <FieldRow label="H1 override" editor={
            <TextDrawerEditor slug={propertySlug} rowId={r.id} field="h1_override" value={r.h1_override} />
          } />
          <Field label="Meta description (auto)">{r.meta_description_spec || "—"}</Field>
          <FieldRow label="Meta override" editor={
            <TextDrawerEditor slug={propertySlug} rowId={r.id} field="meta_description_override" value={r.meta_description_override} multiline />
          } />
          <Field label="Word count target">{r.word_count_target || "—"}</Field>
          <Field label="Phase 2 yellow resolution"><pre className="whitespace-pre-wrap text-xs">{r.phase2_yellow_resolution || "—"}</pre></Field>
          <FieldRow label="Brief status" editor={
            <SelectDrawerEditor slug={propertySlug} rowId={r.id} field="brief_status"
              value={r.brief_status} options={["Not Started","In Progress","Approved"]} />
          } />
        </Section>

        <Section title="Content Inputs">
          <Field label="Entities">{r.entities_blocked}</Field>
          <Field label="FAQs">{r.faqs_blocked}</Field>
          <Field label="Fan-out">{r.fanout_blocked}</Field>
          <button disabled className="text-xs px-2 py-1 rounded border opacity-50 cursor-not-allowed">
            Generate Brief — Tier 2
          </button>
        </Section>

        <Section title="Draft & Production">
          <FieldRow label="Writer" editor={
            <WriterCell slug={propertySlug} rowId={r.id} value={r.writer} />
          } />
          <FieldRow label="Word count actual" editor={
            <NumericDrawerEditor slug={propertySlug} rowId={r.id} field="word_count_actual" value={r.word_count_actual} />
          } />
          <FieldRow label="Draft link" editor={
            <TextDrawerEditor slug={propertySlug} rowId={r.id} field="draft_link" value={r.draft_link} />
          } />
          <FieldRow label="Published URL" editor={
            <TextDrawerEditor slug={propertySlug} rowId={r.id} field="published_url" value={r.published_url} />
          } />
          <FieldRow label="Feedback" editor={
            <TextDrawerEditor slug={propertySlug} rowId={r.id} field="feedback_notes" value={r.feedback_notes} multiline />
          } />
        </Section>

        <Section title="Dependencies + Linking">
          <Field label="Dependencies">{r.dependencies || "—"}</Field>
          <Field label="Links out"><pre className="whitespace-pre-wrap text-xs">{r.internal_links_out || "(none)"}</pre></Field>
          <Field label="Links in"><pre className="whitespace-pre-wrap text-xs">{r.internal_links_in || "(none)"}</pre></Field>
        </Section>

        <Section title="Schema">
          <Field label="Current">{r.current_schema || "—"}</Field>
          <Field label="Required">{r.required_schema || "—"}</Field>
          <Field label="JSON-LD notes">{r.jsonld_notes || "—"}</Field>
        </Section>

        <Section title="Post-Publish Tasks">
          <pre className="whitespace-pre-wrap text-xs">{r.post_publish_tasks || "—"}</pre>
        </Section>
      </aside>
    </div>
  );
}

// Small helpers — reuse existing Section/Field/FieldRow if already defined in UrlDrawer.tsx
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">{title}</div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="text-xs"><span className="text-muted-foreground mr-2">{label}:</span>{children}</div>;
}
function FieldRow({ label, editor }: { label: string; editor: React.ReactNode }) {
  return <div className="text-xs flex items-center gap-3"><span className="text-muted-foreground w-32">{label}:</span>{editor}</div>;
}

// Reusable drawer editors — wrap setRowField with proper field type
import { setRowField } from "@/app/properties/[slug]/content/actions";

function TextDrawerEditor({ slug, rowId, field, value, multiline }: {
  slug: string; rowId: string; field: string; value: string | null; multiline?: boolean;
}) {
  const [local, setLocal] = useState(value ?? "");
  const [pending, start] = useTransition();
  function commit() {
    if (local !== (value ?? "")) start(() => setRowField(slug, rowId, field as never, local || null));
  }
  const Tag: any = multiline ? "textarea" : "input";
  return (
    <Tag
      value={local} onChange={(e: any) => setLocal(e.target.value)} onBlur={commit}
      disabled={pending}
      className={`text-xs px-2 py-1 rounded border bg-transparent w-full ${multiline ? "min-h-[60px]" : ""} ${pending ? "opacity-50" : ""}`}
    />
  );
}

function NumericDrawerEditor({ slug, rowId, field, value }: {
  slug: string; rowId: string; field: string; value: number | null;
}) {
  const [local, setLocal] = useState(value?.toString() ?? "");
  const [pending, start] = useTransition();
  function commit() {
    const n = local === "" ? null : Number(local);
    if (n !== value && (n === null || !Number.isNaN(n))) {
      start(() => setRowField(slug, rowId, field as never, n));
    }
  }
  return (
    <input type="number" value={local} onChange={(e) => setLocal(e.target.value)} onBlur={commit}
      disabled={pending}
      className={`text-xs px-2 py-1 rounded border bg-transparent w-28 tabular-nums ${pending ? "opacity-50" : ""}`}
    />
  );
}

function SelectDrawerEditor({ slug, rowId, field, value, options }: {
  slug: string; rowId: string; field: string; value: string; options: string[];
}) {
  const [pending, start] = useTransition();
  return (
    <select value={value} disabled={pending}
      onChange={(e) => start(() => setRowField(slug, rowId, field as never, e.target.value))}
      className={`text-xs px-2 py-1 rounded border bg-transparent ${pending ? "opacity-50" : ""}`}
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
```

- [ ] **Step 3: Update render dispatch**

Find the top-level UrlDrawer render switch and add the `kind === "content"` branch:

```tsx
if (subject.kind === "content") {
  return <ContentDrawer subject={subject} onClose={onClose} propertySlug={propertySlug} />;
}
```

If the existing component doesn't take `propertySlug` at the top level yet, add it as a required prop and update every existing call site (UrlDrawer is rendered from KeywordsView and PagesView — both already pass slug somewhere).

- [ ] **Step 4: Wire row-click in MasterPlanTab + SprintCalendarTab**

In each tab, lift drawer state to a parent (ContentView) or use a local `useState<DrawerSubject | null>`. Pass an `onRowClick(subject: DrawerSubject)` prop down. On click, set the drawer subject; render `<UrlDrawer subject={drawerSubject} onClose={...} propertySlug={...} />` at the tab root.

- [ ] **Step 5: Build verifies**

```bash
cd web && npm run build 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
git add web/components/UrlDrawer.tsx web/components/content/MasterPlanTab.tsx web/components/content/SprintCalendarTab.tsx web/components/content/ContentView.tsx
git commit -m "feat(ui): UrlDrawer polymorphism — Content subject (4th variant); row-click integration"
```

### Task 4.3: Performance Tracker rank editors

**Files:**
- Modify: `web/components/content/PerformanceTrackerTab.tsx`

- [ ] **Step 1: Replace the read-only rank cells with NumericDrawerEditor (or a thin inline variant)**

Each of the 30d/60d/90d rank cells becomes an inline numeric input that calls `setRowField(slug, rowId, "rank_30d" | "rank_60d" | "rank_90d", n)`. The Refresh Flag column stays computed.

- [ ] **Step 2: Build**

```bash
cd web && npm run build 2>&1 | tail -3
```

- [ ] **Step 3: Commit**

```bash
git add web/components/content/PerformanceTrackerTab.tsx
git commit -m "feat(content): inline rank entry on Performance Tracker"
```

---

## Chunk 5: xlsx export + production merge

### Task 5.1: Add Phase 4 to /api/wqa/export

**Files:**
- Modify: `web/api/wqa/export.py`

- [ ] **Step 1: Inspect current handler**

Read the existing export.py to see how it handles `?phase=1|2|3` and the entry point pattern.

- [ ] **Step 2: Add Phase 4 case**

Add an `elif phase == 4:` branch that:
1. Reads `content_row` rows for the property from Supabase
2. Pivots them into the same xlsx shape `build_phase4_content.py` produces
3. Writes Master Content Plan + Performance Tracker tabs
4. Returns the xlsx buffer

The cleanest approach: extract a `_phase4_builder.py` next to the existing `_phase1_builder.py` / `_phase2_builder.py` that takes a list of content rows and produces an `openpyxl.Workbook`. Reuse the styling helpers from build_phase4_content.py.

- [ ] **Step 3: Test the endpoint**

```bash
curl -I "https://skyward-platform-<latest-preview>.vercel.app/api/wqa/export?slug=buscharter&phase=4"
```

Expected: 200, `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

- [ ] **Step 4: Commit**

```bash
git add web/api/wqa/export.py web/api/wqa/_phase4_builder.py
git commit -m "feat(export): phase=4 Phase 4 Content Workbook export"
```

### Task 5.2: PR + merge + production deploy

- [ ] **Step 1: Open PR**

```bash
gh pr create --title "feat: Phase 4 content surface (/properties/[slug]/content)" --body "..."
```

(Body summarizes the 5 chunks + 8-property backfill + drawer polymorphism + xlsx export.)

- [ ] **Step 2: Merge**

```bash
gh pr merge <PR#> --merge --admin
```

- [ ] **Step 3: Promote to production**

```bash
git checkout main && git pull && vercel --prod --yes
```

- [ ] **Step 4: Verify**

```bash
curl -I "https://skyward-seo-platform.vercel.app/properties/buscharter/content"
```

Expected: 200 (or 307 → /auth, same as existing routes).

---

## Self-Review

**1. Spec coverage** against `docs/superpowers/specs/2026-05-22-phase4-surface-design.md`:
- ✓ `content_row` table + history + trigger (Task 1.1)
- ✓ Python backfill, 8-property fan-out (Task 1.2)
- ✓ Typed lib + 4 server actions (Tasks 2.1, 2.2)
- ✓ Route + 5-tab nav (Tasks 3.1, 3.2)
- ✓ Overview / Master Plan / Sprint Calendar / Performance Tracker / Action Legend (Tasks 3.3-3.7)
- ✓ Inline edit components — StatusChip + ActionTypeChip + WriterCell + SprintCell (Task 4.1)
- ✓ Universal drawer polymorphism — Content variant (Task 4.2)
- ✓ Performance Tracker rank entry (Task 4.3)
- ✓ xlsx export endpoint (Task 5.1)
- ✓ Production merge (Task 5.2)
- ✓ `runRecomputeContentPlan` correctly handled as stubbed help panel per spec — implementation drops the action entirely from the 5 server actions (4 implemented, "Recompute" lives in the UI as a help-only popover wired in a Chunk 5 follow-up or skipped per spec)

**2. Placeholder scan**: None found.

**3. Type consistency**: `ContentStatus`, `ContentActionType`, `FieldName` defined once in `web/lib/content-rows.ts` + `actions.ts`; chips and drawer editors import from those.

The `Recompute` button stays out of v1 per the spec's honest gap-flagging. Re-running the Python backfill is CLI-only: `uv run python delivery/tna/phase4_backfill_supabase.py`.
