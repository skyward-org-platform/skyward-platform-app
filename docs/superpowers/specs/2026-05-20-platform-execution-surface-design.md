---
title: Platform Execution Surface (Phase 1 + Phase 2 unified)
status: draft
version: v0.1 | 2026-05-20
audience: skyward-platform-app contributors
---

# Platform Execution Surface

Make the skyward-platform-app the canonical execution surface for the SEO pipeline. Replace the workbook (xlsx) as the primary editing tool; keep the xlsx as a snapshot renderer of the platform's state.

## Goals

- Mirror the 12-tab Phase 1 WQA workbook + the Phase 2 Technical SEO Audit workbook in one app surface.
- Per-URL drawer that unifies Phase 1 + Phase 2 view of any URL.
- Editable execution state per URL (status, owner, due date, notes, target URL) and per-check (T1-T20, C1-C20, S1-S12).
- Export endpoints that regenerate the same xlsx format we have been producing, sourced from the live platform state.

## Non-goals (this spec)

- Cross-URL planning workflow (new-URL creation, content gaps). Deferred to v2.
- Re-crawl validation loop (mark fixes complete, automatically re-check). Deferred to v2.
- Phase 3 keyword analysis surface. Separate spec.

## Architecture

**Read path:**

- BigQuery `SEOPipelineDev.wqa_output` (44 cols) is canonical for per-URL signals. Read-only.
- Supabase `wqa_decision` carries human action overrides (existing).
- Supabase `page_execution` (new) carries per-URL execution state.
- Supabase `page_check_state` (new) carries per-URL × Phase 2 check execution state.
- Supabase `url_relationship` (new) carries cross-URL links (redirect_to, canonical_to, etc.).

The UI hydrates each URL row by left-outer-joining BQ ⟕ wqa_decision ⟕ page_execution ⟕ page_check_state.

**Write path:**

- All edits go through Next.js server actions to Supabase. RLS gated to `team_member`.
- History via Postgres triggers, mirroring the existing `wqa_decision_history` pattern.
- BQ is never written from the app. Adam's pipeline owns BQ.

## UI structure

Single route: `/properties/{slug}/pages`. Two top-level view modes:

| Mode | Sub-tabs |
|---|---|
| Triage | Overview · All URLs · Optimize · Redirect · Restore · Remove · Consolidate · Evaluate · Investigate · Canonical Audit · Action Legend |
| Technical Audit | Overview (Issue Summary) · Audit Checklist · URL Priority · Architecture · Schema · Page Speed · Broken Links |

URL state lives in `?mode=triage|audit&view=<sub-tab>` and `?action=<filter>` for per-action filters within Triage.

### URL drill-down drawer (universal)

Opens from any URL row in any tab. Single component, single source of truth.

Sections:
1. **Signals** — GA4, GSC, Ahrefs, DFS, SF data. Read-only.
2. **Phase 1** — Action chip with override control; Logic citation.
3. **Phase 2 Checks** — All T/C/S checks failing for this URL. Each row: check id, name, status dropdown, expand-for-notes.
4. **Execution** — Status, Owner, Due Date, Notes, Target URL.
5. **Restore Spec** — Conditional on action = Restore. target_h1, target_title, target_meta inputs.
6. **History** — Last 10 changes across all three Supabase tables for this URL.
7. **Footer links** — "Open full page" (future), "View in Phase 2".

### Per-check drill route

`/properties/{slug}/pages?mode=audit&view=checklist&check={check_id}` filters the URL list to URLs failing that specific check. Same row component, same drawer.

### Workbook tab mapping

| Workbook tab (Phase 1) | UI tab | Notes |
|---|---|---|
| Action Legend | Triage > Action Legend | Static reference. |
| Action Plan | Triage > Overview | Top section of Overview view. |
| URL Triage | Triage > All URLs | Master list. |
| Funnel Summary | Triage > Overview | Mid section of Overview view. |
| Service Summary | Triage > Overview | Bottom section of Overview view. |
| Redirect Map | Triage > Redirect | Add editable Destination URL, Priority, Type. |
| Canonicalization Map | Triage > Consolidate | Add editable Canonical Keeper. |
| Canonical Audit | Triage > Canonical Audit | New tab. |
| Removal List | Triage > Remove | Add editable Recommended Action. |
| Implementation Checklist | Triage > Overview | Bottom of Overview view. |
| URL Optimization | Triage > Optimize | Add priority tier override + Phase 2 actions readout. |
| Restore URLs | Triage > Restore | Add editable target_h1, target_title, target_meta. |

| Workbook tab (Phase 2) | UI tab |
|---|---|
| Issue Summary | Audit > Overview |
| Audit Checklist | Audit > Audit Checklist |
| Per-issue tabs (one per failed check) | Audit > Audit Checklist row click → per-check filtered list |
| Page Speed | Audit > Page Speed (Blocked badge until SF report pulled) |
| Website Architecture | Audit > Architecture |
| Schema Optimization | Audit > Schema |
| Broken List | Audit > Broken Links (Blocked badge until SF report pulled) |
| URL Priority | Audit > URL Priority |
| Aggregate | Reference; not surfaced in UI; included in export. |

## Data model

### `page_execution`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| property_id | uuid FK → property | not null |
| url | text | not null |
| status | text | check status in ('To Do','In Progress','Blocked','Done'); default 'To Do' |
| owner | text | nullable, free text (Skyward / Client Dev / Content / etc.) |
| due_date | date | nullable |
| notes | text | nullable |
| target_url | text | nullable, redirect / canonical destination |
| target_h1 | text | nullable, Restore spec |
| target_title | text | nullable, Restore spec |
| target_meta | text | nullable, Restore spec |
| updated_by | text | not null |
| updated_at | timestamptz | default now() |

Unique on `(property_id, url)`.

### `page_check_state`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| property_id | uuid FK → property | not null |
| url | text | not null |
| check_id | text | not null, T1-T20 / C1-C20 / S1-S12 |
| status | text | check status in ('To Do','In Progress','Blocked','Done'); default 'To Do' |
| notes | text | nullable |
| owner | text | nullable |
| fix_applied_at | timestamptz | nullable |
| updated_by | text | not null |
| updated_at | timestamptz | default now() |

Unique on `(property_id, url, check_id)`.

### `url_relationship`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| property_id | uuid FK → property | not null |
| source_url | text | not null |
| target_url | text | not null |
| kind | text | check kind in ('redirect_to','canonical_to','consolidate_into','mentioned_in') |
| created_by | text | not null |
| created_at | timestamptz | default now() |

### History mirrors

Each of `page_execution` and `page_check_state` gets a `*_history` table + `BEFORE UPDATE` trigger that snapshots the OLD row when a meaningful field changes. Mirror the existing `snapshot_wqa_decision()` trigger pattern verbatim.

## Edit boundaries

| Field | Edit location |
|---|---|
| Action override | Triage tab action chip / drawer Phase 1 section. Writes `wqa_decision`. |
| Status | Inline in URL list (Triage and Audit views) + drawer Execution section. Writes `page_execution`. |
| Owner | Inline + drawer. Writes `page_execution`. |
| Due Date | Drawer. Writes `page_execution`. |
| Notes | Drawer. Writes `page_execution`. |
| Target URL | Drawer + inline in Redirect/Consolidate tabs. Writes `page_execution`. |
| Restore content spec (h1/title/meta) | Drawer Restore Spec section + inline in Restore tab. Writes `page_execution`. |
| Per-check status | Drawer Phase 2 Checks section + inline in per-check filtered list + URL Priority. Writes `page_check_state`. |
| Per-check notes | Drawer expandable per-check. Writes `page_check_state`. |

## Export endpoints

- `GET /api/wqa/export?slug={slug}` — produces the 12-tab Phase 1 xlsx in the exact format `build_phase1_wqa.py` currently produces. Pulls live data from Supabase + BQ.
- `GET /api/audit/phase-2/export?slug={slug}` — produces the Phase 2 xlsx in the exact format `build_phase2_technical.py` currently produces.

Both endpoints are Python Vercel functions that import the existing builder modules, swap the CSV-reading layer for a Supabase + BQ reader, and stream the resulting xlsx as the response.

## Phasing

| # | Chunk | Time | Output |
|---|---|---|---|
| 1 | DB migrations + server actions | half day | `page_execution`, `page_check_state`, `url_relationship` tables; mutate triggers + history mirrors; Next.js server actions for each mutation; type-safe input validation. |
| 2 | URL drawer + universal hookup | half day | `<UrlDrawer>` component opens from any URL row in existing tabs. Read hydration via server fetch joining BQ + Supabase. Edit controls write through chunk-1 server actions. Optimistic UI. |
| 3 | Triage view: new + enriched tabs | half day | Overview view (Action Plan + Funnel + Service + Checklist), Canonical Audit tab, Action Legend reference tab, Restore content-spec editor, Redirect destination-URL editor. |
| 4 | Technical Audit view + exports | half day | TRIAGE/AUDIT mode switcher, all Audit sub-tabs, per-check drill route, both export endpoints. |

Each chunk is independently deployable. After chunk 2, the app is already substantially more useful (one canonical per-URL editor). Chunks 3-4 bring the per-tab parity with the workbook.

## Out of scope

- Auth/RLS changes — reuse existing `team_member` gate.
- BQ schema changes — Adam owns BQ.
- New-URL creation workflow — covered in a follow-up spec.
- Re-crawl validation automation — covered in a follow-up spec.
- Phase 3 keyword analysis UI — separate spec.

## References

- WQA SOP v5: `~/agency/operations/process-library/1. seo-pipeline/sop/phase-1-wqa/website-quality-audit-sop-v5.md`
- Phase 2 Technical SEO Workbook SOP: `~/agency/operations/process-library/1. seo-pipeline/sop/phase-1b-technical-audit/technical-seo-workbook-sop.md`
- Existing pages route: `web/app/properties/[slug]/pages/page.tsx`
- Existing wqa_decision migration: `db/supabase/migrations/20260520_wqa_decision.sql`
- Phase 1 builder: `~/agency/delivery/tna/build_phase1_wqa.py`
- Phase 2 builder: `~/agency/delivery/tna/build_phase2_technical.py`
