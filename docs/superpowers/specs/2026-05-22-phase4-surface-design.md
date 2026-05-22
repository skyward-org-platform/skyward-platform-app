---
title: Phase 4 Content Surface — design spec
status: approved
version: v0.1 | 2026-05-22
audience: skyward-platform-app contributors
---

# Phase 4 Surface — /properties/[slug]/content

Materialize the Phase 4 Master Content Plan as a web surface in the Skyward platform. Replaces a stale xlsx-only workflow with the same execution-surface pattern as `/pages` and `/keywords`: editable execution state per content row, polymorphic universal drawer, history triggers, xlsx export.

## Goals

- Surface every Phase 4 content opportunity (Phase 1 Optimize + Restore URLs + Phase 3 gap clusters) as a `content_row` in Supabase.
- 5-tab flat IA: Overview · Master Plan · Sprint Calendar · Performance Tracker · Action Legend.
- Editable execution state: status, writer, sprint, draft link, published URL, overrides on auto-derived fields, feedback notes, rank entries.
- Universal drawer extends to handle Content subject (4th polymorphic variant after URL / Keyword / Cluster).
- Re-cluster-style "Recompute Content Plan" action that refreshes auto-derived columns while preserving manual overrides.
- xlsx export endpoint reuses the existing `/api/wqa/export` pattern at `?phase=4`.

## Non-goals (this spec)

- "Generate Brief" button live integration with the `/content-brief` skill (LLM tool + brief storage table). Tier 2.
- GSC integration for auto 30d/60d/90d rank fill — manual entry in v1.
- ClickUp push of production tasks — manual for v1.
- Content Roadmap Deck HTML output — separate deliverable, not a UI surface.
- Phase 5 (Authority Building) integration — published URLs become Phase 5 link-building targets via a downstream query; nothing to build here.
- InfraNodus / fan-out / FAQ extraction (Phase 3 Content Enrichment) — explicitly blocked placeholders in the Content Inputs column group. Backfilled per brief at `/content-brief` time.

## Architecture

**Read path:**
- New Supabase table `content_row` is the canonical source for every column on the Master Content Plan.
- One row per content opportunity per property. Identified by `(property_id, url)`.
- Foreign key to `keyword_cluster.id` (nullable) for the row's primary cluster.
- Phase 1 triage CSVs + Phase 3 `keyword_cluster` / `page_cluster_assignment` remain the upstream sources. The UI never re-derives Phase 4 columns from raw upstream; it reads from `content_row`.

**Write path:**
- 5 server actions in `web/app/properties/[slug]/content/actions.ts`:
  - `setRowStatus(slug, id, status)`
  - `setRowWriter(slug, id, writer)`
  - `setRowSprint(slug, id, sprint)`
  - `setRowField(slug, id, field, value)` — covers 14 drawer-editable fields (incl. rank entries)
  - `exportContentXlsx(slug)` — wraps the existing `/api/wqa/export?phase=4` Python endpoint
- `runRecomputeContentPlan(slug)` is **stubbed in v1** — see Phasing → "Note on runRecomputeContentPlan" below.
- All gated by existing `requireWriteToken` (fail-open on preview).
- `BEFORE UPDATE` history trigger on `content_row` fires only when editable fields change (status, writer, sprint, the 10 drawer fields). Auto-rederivation by the pipeline doesn't trigger history.

**Compute boundary:**
- `runRecomputeContentPlan` re-runs `delivery/tna/phase4_backfill_supabase.py`. Pipeline:
  1. Reads current Phase 1 triage CSV + Phase 3 Supabase data for the property.
  2. Recomputes auto-derived columns (action_type, title_formatted, h1_target, meta_description_spec, schema, internal linking, calendar dates, etc.).
  3. **Override-preservation**: any row with non-null `*_override` columns keeps those overrides. Any row with non-default values in editable fields (status, writer, draft_link, etc.) keeps them.
  4. Upserts by `(property_id, url)`.
- Re-running is idempotent. Manual edits survive across recomputes.

**Property scope:**
- v1 backfills all 8 TNA properties at once (same as Phase 3 fan-out — data already exists as xlsx).
- Schema is property-scoped from day one. Fans out to future clients without migration.

## UI structure

Single route: `/properties/[slug]/content`. New top-level tab in the property nav.

**5 tabs**, flat row, URL param `?view=`:

| Tab | URL param | Default? |
|---|---|---|
| Overview | `overview` | ✓ |
| Master Plan | `plan` | |
| Sprint Calendar | `calendar` | |
| Performance Tracker | `tracker` | |
| Action Legend | `legend` | |

### Overview tab

4-up stat tile row:
- Total Rows
- This Sprint (current sprint count)
- In Production (status ∈ Brief / Draft / Review)
- Published (status = Published)

Status distribution mini-bar (proportional).

Upcoming sprint mini-table: top 5 rows by sprint asc, columns URL · Action · Cluster · Writer.

### Master Plan tab

Default table. 9 columns inline; rest in drawer.

| Column | Editable inline? | Type |
|---|---|---|
| URL | — | text + row-click handler |
| Sprint | ✓ | numeric input (small) |
| Action Type | ✓ | chip with override semantics |
| Priority Tier | — | pill (with dot) |
| Primary Cluster | — | clickable text → cluster drawer |
| Target Keyword | — | text |
| Status | ✓ | action chip (5 states) |
| Writer | ✓ | text input |
| Open | — | button → content drawer |

Top-of-table chip strip: filter by status, action type, source (Phase 1 Optimize / Phase 1 Restore / Phase 3 Gap Cluster). URL-persisted via `?status=` `?action=` `?source=`.

Per-column filter row under headers (text · numeric ≥≤= · select).

### Sprint Calendar tab

Rows grouped by sprint. Sprint headers show brief due / publish target dates + row count. Each row is the same row component used in Master Plan — same inline edits work.

### Performance Tracker tab

One row per `content_row` with a non-null `target_keyword`. Columns:

| Column | Source | Editable? |
|---|---|---|
| URL | content_row | — |
| Target Keyword | content_row | — |
| Cluster SV | content_row (joined at backfill) | — |
| Action Type | content_row | — |
| 6mo Target Rank | auto-derived: 8 (Optimize/Refresh) / 12 (Rewrite/New) | — |
| 6mo Est Clicks | computed | — |
| 12mo Target Rank | auto-derived: 4 / 6 | — |
| 12mo Est Clicks | computed | — |
| 30d Rank | manual entry (Tier 2: GSC) | ✓ |
| 60d Rank | manual entry | ✓ |
| 90d Rank | manual entry | ✓ |
| Refresh Flag? | auto-derived from `90d_rank < 0.7 * 6mo_target` | — |

### Action Legend tab

Static reference. 4 sections: Action Types · Status meanings · Priority Tiers · Page Types.

### Universal drawer extension — Content subject

`DrawerSubject` discriminated union extended:

```typescript
type DrawerSubject =
  | { kind: 'url'; ... }
  | { kind: 'keyword'; ... }
  | { kind: 'cluster'; ... }
  | { kind: 'content'; row: ContentRow; cluster: ClusterRow | null };
```

Drawer renders 10 sections for Content subject (top to bottom):

1. **Header** — URL · Action Type chip · Status chip · Sprint badge
2. **Identity** — Vertical, Page Type, Parent Page, Priority Tier, Target Keyword (read-only; cluster link)
3. **Calendar** — Sprint (editable), dates (read-only), Owners (editable), Calendar Status (editable)
4. **Brief Spec** — Title formatted + override, H1 + override, Meta Description + override, Word Count Target, Phase 2 Yellow Resolution, Brief Status
5. **Content Inputs** — 3 blocked placeholders + disabled "Generate Brief" button stub (Tier 2)
6. **Draft & Production** — Writer, Word Count Actual, Draft Status, Draft Link, Published URL, Feedback Notes (all editable)
7. **Dependencies + Linking** — Dependencies, Internal Links Out, Internal Links In (read-only)
8. **Schema** — Current Schema, Required Schema, JSON-LD Notes (read-only)
9. **Post-Publish Tasks** — read-only template
10. **History** — recent edits from `content_row_history`

## Data model

One new table + history mirror. RLS mirrors existing `wqa_decision` pattern (read = authenticated; write = authenticated + active team_member).

### `content_row`

```
id                          uuid PK default gen_random_uuid()
property_id                 uuid not null references property(id) on delete cascade
url                         text not null
source                      text not null
                             check (source in ('phase1_optimize','phase1_restore','phase3_gap_cluster'))
cluster_id                  uuid references keyword_cluster(id) on delete set null

-- Identity & Strategy (auto-derived; not editable inline)
vertical                    text
action_type                 text not null
                             check (action_type in ('Optimize','Refresh','Rewrite','New','Remove'))
action_type_override        text
                             check (action_type_override is null or action_type_override in ('Optimize','Refresh','Rewrite','New','Remove'))
page_type                   text
parent_page                 text
priority_tier               text
target_keyword              text

-- Calendar (auto-sequenced; sprint editable)
sprint                      int
brief_due                   date
draft_due                   date
target_publish              date
owners                      text default 'Skyward (writer) + Client (review)'
calendar_status             text default 'Scheduled'
                             check (calendar_status in ('Scheduled','Slipped','Done'))

-- Brief Spec (auto-derived; drawer-editable overrides)
title_formatted             text
title_override              text
h1_target                   text
h1_override                 text
meta_description_spec       text
meta_description_override   text
word_count_target           text
phase2_yellow_resolution    text
brief_status                text default 'Not Started'
                             check (brief_status in ('Not Started','In Progress','Approved'))

-- Content Inputs (blocked placeholders for v1)
entities_blocked            text default 'BLOCKED — run InfraNodus per cluster at brief time'
faqs_blocked                text default 'BLOCKED — extract from cluster top SERP PAA at brief time'
fanout_blocked              text default 'BLOCKED — LLM fan-out per cluster at brief time'

-- Draft & Production (all editable)
status                      text not null default 'Not Started'
                             check (status in ('Not Started','Brief','Draft','Review','Published'))
writer                      text
word_count_actual           int
draft_link                  text
published_url               text
feedback_notes              text

-- Dependencies + Linking + Schema + Post-Publish (auto-derived)
dependencies                text
internal_links_out          text
internal_links_in           text
current_schema              text default '—'
required_schema             text
jsonld_notes                text
post_publish_tasks          text

-- Performance Tracker fields (manual entry for v1)
rank_30d                    int
rank_60d                    int
rank_90d                    int

-- Meta
computed_at                 timestamptz not null default now()
updated_by                  text not null
updated_at                  timestamptz not null default now()
```

**Indexes:**
- Unique `(property_id, url)` — upsert key for the pipeline
- `(property_id, status)` — fast pipeline-stage filtering
- `(property_id, sprint)` — Sprint Calendar tab
- `(property_id, priority_tier)` — prioritized views

**History trigger** fires `BEFORE UPDATE` when any of these change:
`status`, `writer`, `sprint`, `brief_status`, `calendar_status`, `action_type_override`, `title_override`, `h1_override`, `meta_description_override`, `draft_link`, `published_url`, `word_count_actual`, `feedback_notes`, `owners`, `rank_30d`, `rank_60d`, `rank_90d`.

Re-runs of the auto-derivation pipeline update `computed_at`, `updated_at`, and any auto-derived field changes but do NOT trigger history (these are mechanical refreshes, not user decisions).

### `content_row_history`

Mirrors `content_row`'s editable fields only:

```
id              uuid PK
content_row_id  uuid not null references content_row(id) on delete cascade
property_id     uuid not null
url             text not null
status          text
writer          text
sprint          int
brief_status    text
calendar_status text
action_type_override text
title_override  text
h1_override     text
meta_description_override text
draft_link      text
published_url   text
word_count_actual int
feedback_notes  text
owners          text
rank_30d        int
rank_60d        int
rank_90d        int
updated_by      text not null
snapshotted_at  timestamptz not null default now()
```

## Editable surface map

| Surface | Edit | Writes | Pattern |
|---|---|---|---|
| Master Plan + Sprint Calendar row | Status (Not Started / Brief / Draft / Review / Published) | `content_row.status` | Action chip (no dot), slate/indigo/sky/amber/emerald |
| Master Plan + Sprint Calendar row | Writer | `content_row.writer` | Text input (debounced) |
| Master Plan + Sprint Calendar row | Sprint | `content_row.sprint` | Numeric input (small) |
| Master Plan + Sprint Calendar row | Action Type override | `content_row.action_type_override` | Action chip with "override" affordance; row falls back to auto-derived `action_type` when override is null |
| Content drawer | Action Type override | `content_row.action_type_override` | Same chip + clear button |
| Content drawer | Title override | `content_row.title_override` | Text input |
| Content drawer | H1 override | `content_row.h1_override` | Text input |
| Content drawer | Meta Description override | `content_row.meta_description_override` | Textarea |
| Content drawer | Brief Status | `content_row.brief_status` | Select (Not Started / In Progress / Approved) |
| Content drawer | Calendar Status | `content_row.calendar_status` | Select (Scheduled / Slipped / Done) |
| Content drawer | Owners | `content_row.owners` | Text input |
| Content drawer | Word Count Actual | `content_row.word_count_actual` | Numeric input |
| Content drawer | Draft Link | `content_row.draft_link` | URL input (validates basic URL format) |
| Content drawer | Published URL | `content_row.published_url` | URL input |
| Content drawer | Feedback Notes | `content_row.feedback_notes` | Textarea |
| Performance Tracker row | 30d / 60d / 90d Rank | `content_row.rank_30d/60d/90d` | Numeric input |

## Server actions

File: `web/app/properties/[slug]/content/actions.ts`

```typescript
setRowStatus(slug, contentRowId, status)
setRowWriter(slug, contentRowId, writer)
setRowSprint(slug, contentRowId, sprint)
setRowField(slug, contentRowId, field, value)
  // field ∈ action_type_override | title_override | h1_override |
  //         meta_description_override | brief_status | calendar_status |
  //         owners | word_count_actual | draft_link | published_url |
  //         feedback_notes | rank_30d | rank_60d | rank_90d
exportContentXlsx(slug)        // wraps /api/wqa/export?phase=4

// Stubbed in v1 (see Phasing note):
// runRecomputeContentPlan(slug) — opens help panel with CLI command instead
```

## Phasing

5 chunks, each independently shippable. Subagent-driven dev pattern (mirror /keywords).

| # | Chunk | Time | Output |
|---|---|---|---|
| 1 | Schema migration + Python backfill | ~1.5 hours | `db/supabase/migrations/20260522_content_row.sql` + `delivery/tna/phase4_backfill_supabase.py`. Backfill all 8 properties (3,489 rows). |
| 2 | Libs + server actions | ~half day | `web/lib/content-rows.ts` typed queries. `actions.ts` with 5 server actions (status / writer / sprint / field / xlsx export). `runRecomputeContentPlan` is **stubbed** in v1 — see note below. |
| 3 | Read-only /content surface | ~half day | Route + 5-tab nav + all 5 tab components rendering data only. Filter chips + per-column filters. |
| 4 | Inline edits + Content drawer | ~half day | Inline Status/Writer/Sprint on Master Plan + Sprint Calendar. Universal drawer extended with Content subject (10 sections + history reader). |
| 5 | xlsx export + production merge | ~half day | `/api/wqa/export?phase=4` adds Phase 4 to the export endpoint. PR + merge + `vercel --prod`. |

**Total: ~2 days focused work.**

## Note on `runRecomputeContentPlan`

The same UI-triggered-Python-pipeline pattern was specced for Phase 3's `runRecluster` and explicitly **not built** (followup #2 in `session-notes/2026-05-22-phase3-surface.md`). Until that infrastructure exists, both recompute actions stay CLI-only: re-running the Python script locally + the script writes directly to Supabase.

For v1 of Phase 4, `runRecomputeContentPlan` is **stubbed as a button that opens a help panel** with the exact CLI command (`uv run python delivery/tna/phase4_backfill_supabase.py`). When the broader pipeline-trigger infrastructure lands (e.g. Vercel Queues + a long-running Python worker), both Phase 3 and Phase 4 buttons get wired in one pass.

This is honest about the gap, doesn't block the rest of v1, and gives the user a clear path to re-run.

## References

- Phase 4 SOP v2.0: `~/agency/operations/process-library/1. seo-pipeline/sop/phase-4-content/content-workbook-sop.md`
- Phase 4 fan-out builder: `~/agency/delivery/tna/build_phase4_content.py` (just produced 8 workbooks)
- Phase 3 surface design (pattern): `docs/superpowers/specs/2026-05-22-phase3-surface-design.md`
- /pages execution surface design (precedent): `docs/superpowers/specs/2026-05-20-platform-execution-surface-design.md`
- Existing Phase 4 workbooks: `~/agency/delivery/tna/{site}/phase-4-content/*.xlsx`
