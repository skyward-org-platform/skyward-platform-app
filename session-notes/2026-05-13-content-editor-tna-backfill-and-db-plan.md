---
title: Structured content editor + TNA backfill + DB architecture
date: 2026-05-13
participants: Paul, Claude (Opus 4.7)
companion_notes:
  - session-notes/2026-05-13-vercel-deploy-and-brand-dna-editing.md
  - session-notes/2026-05-13-repo-migration.md
---

# Session: Content editor + TNA backfill + DB architecture

Companion to two other notes from the same day. This one captures the
substantive feature + data work between the initial deploy and the repo
migration.

## What got shipped

### 1. Structured content editor for Brand DNA (commit `31d50cd`)

Sections without a `body` (`identity`, `voice_tone`, `future_audience`,
`proof`, `brand_terms`) previously rendered the raw JSON `content` blob.
Now they render through `BrandDnaContentEditor` — a per-key field editor
that picks the input type by inspecting the value:

- short strings (≤80 chars, no newlines) → `<input>`
- long strings → autosizing `<textarea>`
- numbers → `<input type="number">`
- arrays of strings → chip list with click-to-edit, X-to-remove, +add input
- arrays of objects / nested → JSON textarea with parse validation

Per-field click-to-edit + save on blur. Each save is one RMW on
`brand_dna_section.content` (read row, patch key, write back); the
existing `BEFORE UPDATE` trigger snapshots OLD into
`brand_dna_section_history`.

Coverage: 4 of 5 phil-lasry sections fully editable through typed UIs.
`brand_terms.variants` (array of nested objects with `canonical` +
`acceptable[]`) renders via the JSON fallback — fine for now; a deeper
recursive editor would be 2-3x the code.

### 2. TNA portfolio backfilled (commit `e5b6870`)

New `scripts/backfill_pages.py` — generic page backfill that resolves
column positions by HEADER NAME (not fixed index) and normalizes v2
parenthetical Action values ("Optimize (revenue-critical)") by stripping
the reason. Handles both the 41-col WQA layout (phil-lasry, buscharter,
tnabushire) and the 30-col layout (minibushire).

```
$ python scripts/backfill_pages.py <slug> <workbook_path>
```

Run today against:
| property | rows | optimize | redirect | remove | undecided |
|---|---|---|---|---|---|
| buscharter | 1,095 | 334 | 410 | 22 | 179 (= Review) |
| tnabushire | 608 | 71 | 4 | 1 | 19 |
| minibushire | 199 | 21 | 19 | 31 | 2 |

Distributions match the memory entries for each property's Phase 1 v2 audit
(within 1 row on buscharter, which is a header-row diff).

Each property's Pages Triage tab is now viewable on the live app:
- https://skyward-seo-platform.vercel.app/properties/buscharter/pages
- https://skyward-seo-platform.vercel.app/properties/tnabushire/pages
- https://skyward-seo-platform.vercel.app/properties/minibushire/pages

### 3. Database architecture clarified (discussion, no code)

Surfaced the explicit two-store split and recommended path forward:

- **BigQuery** (`data-hub-468216`, Adam-owned) = source of truth for raw +
  aggregated facts: crawls, GSC/GA, DataForSEO, ScreamingFrog.
- **Supabase Postgres** (`seo-platform-dev`, Paul/web-app-owned) =
  operational store: identity, Skyward outputs (Brand DNA, Project Brain),
  decisions (audit_action), history, workflow (eventually playbook_run,
  signal).

**Recommendation:** Supabase is the operational mirror. BQ stays the
warehouse. Sync goes one-way BQ → Supabase via Adam's package on cron.
Reasons:
1. UI is on Vercel → Supabase. FDW round-trips would slow page renders.
2. Adam's package already aggregates in BQ. Materializing aggregates into
   Supabase columns is one Cloud Run job per aggregate.
3. pgvector in Supabase is proven (Task 10.5 worked); Gemini embeddings
   can write to the same column as OpenAI ones.

**Built today (in Supabase): 6 tables + 1 view + 1 trigger.**
- `client`, `team_member`, `property`, `page` (with pgvector HNSW),
  `brand_dna_section`, `project_brain_entry`
- `brand_dna_current` view
- `brand_dna_section_history` table + `BEFORE UPDATE` trigger

**Still designed but unbuilt (4 tables, per May 8 schema spec):**
`keyword`, `cluster`, `signal`, `playbook_run`, `brief`.

**Open decisions blocking the next phase (Adam-coordination):**
1. Sync vs federation (cron-write to Supabase vs FDW reads BQ live)
2. Embedding pipeline (Gemini vs OpenAI; written where)
3. Aggregate tables location (BQ vs materialized in Supabase)
4. Granularity of sync (per-page row mirror vs per-property summary)

## Today's overall ship list (across all three notes)

| Shipped | Commit | Note |
|---|---|---|
| Vercel project + first deploy | (initial CLI deploys) | vercel-deploy-and-brand-dna-editing |
| Brand DNA body inline editing + history trigger | `ecfd12e` + history migration | vercel-deploy-and-brand-dna-editing |
| Brand DNA structured content editing (5 type editors) | `31d50cd` | this note |
| Generic page backfill script | `e5b6870` | this note |
| TNA portfolio backfilled (3 properties, 1,902 pages) | data only | this note |
| PR #1 merged to agency main | `22d796e` | repo-migration |
| feat/p1-minimal-ui merged to agency main | `fde6a2d` | repo-migration |
| Repo extracted to `skyward-org-platform/skyward-platform-app` | — | repo-migration |
| Vercel reconnected to new repo | — | repo-migration |

## State at session end

| | |
|---|---|
| Repo | `skyward-org-platform/skyward-platform-app` (public) |
| Local clone | `~/skyward-platform-app` (this is where work happens now) |
| Production app | https://skyward-seo-platform.vercel.app |
| Auto-deploy | push to `main` → production. Per-branch pushes → preview. |
| Vercel git author check | satisfied by global git config `data@goskyward.io / Paul Skirbe` (Hobby plan constraint) |
| Properties in Supabase | 4 with pages (phil-lasry 42 / buscharter 1,095 / tnabushire 608 / minibushire 199 = 1,944 total) |
| Brand DNA sections | 6 (phil-lasry only); other properties: 0 |
| Embeddings | only on the 25 phil-lasry pages from May 8's BQ pull |

## Next-session candidates

Roughly in increasing order of leverage / Adam-coordination:

1. **Refactor Python scripts** to load `.env` from new repo root (small chore).
2. **Update new repo's README** to reflect standalone layout.
3. **Delete `operations/seo-platform/`** from agency `main` once confident
   nothing else references it.
4. **History viewer + revert UI** in the web app (uses
   `brand_dna_section_history` data; pure frontend, no Adam coordination).
5. **Backfill KSSD / BusBank pages** using the generic script (same pattern
   as TNA).
6. **Run Brand DNA inference** for TNA properties (~$0.50 OpenAI per
   property). Generates 5 sections per property.
7. **Build keyword / cluster / signal / playbook_run / brief tables**
   (schema spec exists from May 8). Requires Adam-coordination on what BQ
   feeds them.
8. **First Adam sync** on the 4 open DB-architecture decisions before any
   work that touches the BQ↔Supabase bridge.
