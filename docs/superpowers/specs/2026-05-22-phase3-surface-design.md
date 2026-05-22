---
title: Phase 3 Keyword Analysis Surface — design spec
status: approved
version: v0.1 | 2026-05-22
audience: skyward-platform-app contributors
---

# Phase 3 Surface — /properties/[slug]/keywords

Make the existing placeholder route the canonical surface for Phase 3 keyword analysis: keyword universe curation, SERP-overlap clusters, URL-to-cluster mapping, opportunities, forecasting, competitive gap. Editable per auto-SEO parity (keyword status, cluster priority, page action, manual URL reassignment, in-cluster agent chat).

## Goals

- Surface every Phase 3 output (Cluster Map, Keyword Universe, URL Map, Opportunities, Forecasting, Competitive Gap, Coverage) in one route, mode-switched.
- Editable execution state per keyword + per cluster + per URL→cluster mapping.
- Per-cluster AI agent chat with keyword-research tools.
- Universal drawer extends to handle URL / Keyword / Cluster subjects (polymorphic).
- Cross-link bidirectionally with `/pages` execution surface.

## Non-goals (this spec)

- Fanning out KGA to the other 7 TNA properties (separate run, no UI changes)
- xlsx export endpoint (deferred to v1.5; workbook already produced locally by `delivery/tna/build_phase3_keywords.py`)
- Entity Gaps + Content Enrichment workbook tabs (need InfraNodus + fan-out pipelines, separate spec)
- Multi-thread chat per cluster (one thread per cluster is enough for v1)
- Automatic re-cluster scheduling (manual button only)
- Phase 4 content pipeline integration (the page_action field captures intent; downstream consumer is separate)

## Architecture

**Read path:**
- BQ `SEOPipelineDev.kga_output` (11,146 rows, project_id=14, job_id=6259976d) — canonical keyword × domain × rank data. Read-only.
- BQ `DataForSEO.serp-google-organic` — top-10 SERP per keyword (cached for 2,514 keywords in scope). Read-only.
- Supabase tables (new — see Data Model): `keyword`, `keyword_cluster`, `keyword_cluster_member`, `page_cluster_assignment`, `cluster_chat_thread`, `cluster_chat_message`.

**Write path:**
- Server actions in `web/app/properties/[slug]/keywords/actions.ts` (new).
- Auth gate via existing `requireWriteToken` (fail-open on preview).
- History via Postgres BEFORE UPDATE triggers — mirrors `wqa_decision_history` / `page_execution_history` patterns.

**Compute boundary:**
- Re-clustering = one-off Python pipeline (`delivery/tna/cluster_buscharter.py`, threshold=4) writing to Supabase. UI never recomputes clusters.
- 5-factor URL-to-cluster scoring runs at re-cluster time only, persists in `page_cluster_assignment`.
- "Recompute clusters" admin action re-runs the pipeline. **Override preservation**: before running, the pipeline reads all `keyword_cluster_member` rows with `assignment='manual'` and all `page_cluster_assignment` rows with `assignment='manual'`. After the algorithm runs, those manual rows are re-applied, overriding what the algorithm would have assigned. Result: idempotent + user-curated overrides survive.
- Supabase REST doesn't expose multi-table transactions, so the pipeline performs upserts in dependency order. Re-running on partial failure is safe (same inputs → same outputs).

**Property scope:**
- v1 ships for buscharter only (project_id=14 / property_id from Supabase).
- Schema is property-scoped from day one; fans out without migration when KGA runs for other properties.

## UI structure

Single route: `/properties/[slug]/keywords`. Replaces existing placeholder.

Two top-level modes (pill toggle component, same as `/pages` TRIAGE/AUDIT switcher):

| Mode | Default sub-tab | All sub-tabs (URL `?view=`) |
|---|---|---|
| **Discovery** | `universe` | universe · sources · clusters · legend |
| **Optimization** | `url-map` | url-map · opportunities · forecasting · gap · coverage |

Mode persists in `?mode=discovery\|optimization`. Sub-tab persists in `?view=`. Default mode = `discovery`.

### Discovery sub-tabs

**Universe** (`?view=universe`, default)
One row per keyword in property scope. Columns: keyword · source · relevance score · status (Retained/Excluded/Candidate chip, editable) · SV · KD · intent · cluster · client rank · best competitor rank. Filter chips: source, status, cluster, has-rank.

**Sources** (`?view=sources`)
Breakdown by ingestion source (ahrefs / gsc / dfs / scraped / seed / manual). Per source: count · retained % · top 5 by SV. Sets up future ingestion buttons (v2).

**Cluster Map** (`?view=clusters`)
One row per cluster after re-clustering at threshold=4. Columns: priority pill (editable) · cluster name (overridable) · head term · member count · total SV · max SV · avg KD · primary URL · page action (Build/Optimize/Remove/Skip, editable). Click row → Cluster drawer.

**Action Legend** (`?view=legend`)
Static reference: status meanings, priority meanings, page action meanings. Mirrors /pages Action Legend.

### Optimization sub-tabs

**URL Map** (`?view=url-map`, default)
Property's URLs with assigned primary cluster. Columns: URL · cluster (overridable picker) · score · keywords in cluster · best rank · sessions · primary keyword. Click → URL drawer with new Phase 3 section.

**Opportunities** (`?view=opportunities`)
Greenfield keywords (client doesn't rank, competitors do, SV ≥ 100). Columns: keyword · SV · KD · intent · # competitors ranking · cluster · suggested page (Build / Optimize). Per-row "Mark for build" action sets `keyword_cluster.page_action = 'build_new'`.

**Forecasting** (`?view=forecasting`)
CTR-curve projections per client URL. Default projection: striking distance (11-20) → rank 5; top 10 → top 3. Δ clicks column sortable.

**Competitive Gap** (`?view=gap`)
Per-keyword rank matrix: client column highlighted, one column per competitor. Greenfield rows tinted.

**Coverage** (`?view=coverage`)
Per-domain stats: keywords / top 10 / striking / greenfield / total SV / avg KD. Same content as the workbook's Coverage Summary tab.

### Universal drawer (polymorphic)

One drawer component handles three subject types. Existing `<UrlDrawer>` in `web/components/UrlDrawer.tsx` is refactored to `<EntityDrawer>` with a `subject` discriminated union: `{kind: 'url', ...} | {kind: 'keyword', ...} | {kind: 'cluster', ...}`.

**URL subject** — existing drawer sections (Signals / Phase 1 / Phase 2 Checks / Execution / Restore Spec / History) + new **Phase 3** section: primary cluster, member keywords this URL ranks for, opportunity score, "View cluster" link that switches drawer subject to that cluster.

**Cluster subject** — new variant:
- Header: cluster name (with override input), head term, member count, total SV
- Metrics: max SV / avg KD / # member URLs / priority pill
- **Editors**: priority (High/Watch/Low/Unset), state (open/closed singleton), page action (Build/Optimize/Remove/Skip), notes
- **Members** section: list of keywords; each row has a "Move…" cluster picker (writes to `keyword_cluster_member.cluster_id` with `assignment='manual'`)
- **URLs** section: client URLs assigned to this cluster (via `page_cluster_assignment.primary_cluster_id`)
- **Agent** section: chat thread with the cluster as context. Tools available: `find_more_keywords`, `expand_cluster`, `search_serp`, `mark_keyword_excluded`. Mirrors `BrandDnaAssistantDrawer` pattern.

**Keyword subject** — light variant: SV/KD/intent/source/relevance score/current rank · which cluster (link → switch drawer subject) · status toggle (Retained/Excluded/Candidate) · notes.

Same drawer component for all three. Subject is detected on open; the drawer renders the right section set.

## Data model

Five new Supabase tables + history mirrors on the four with editable state. RLS policies mirror existing `wqa_decision` pattern (read = authenticated; write = authenticated + team_member exists+active).

### `keyword`

```
id              uuid PK default gen_random_uuid()
property_id     uuid not null references property(id) on delete cascade
keyword         text not null
status          text not null default 'Candidate'
                check status in ('Candidate','Retained','Excluded')
relevance_score int nullable check between 0 and 100
source          text nullable
                check source in ('ahrefs','gsc','dfs','scraped','seed','manual',null)
notes           text nullable
updated_by      text not null
updated_at      timestamptz not null default now()

unique index (property_id, keyword)
index (property_id, status)
```

History mirror: `keyword_history`. Trigger fires on status/notes change.

### `keyword_cluster`

```
id              uuid PK
property_id     uuid not null references property(id) on delete cascade
cluster_number  int not null
head_term       text not null
name_override   text nullable
priority        text not null default 'Unset'
                check priority in ('High','Watch','Low','Unset')
state           text not null default 'open'
                check state in ('open','closed')
page_action     text nullable
                check page_action in ('build_new','optimize_existing','remove','skip', null)
member_count    int not null default 0
total_sv        bigint not null default 0
max_sv          bigint not null default 0
avg_kd          numeric nullable
notes           text nullable
computed_at     timestamptz not null
updated_by      text not null
updated_at      timestamptz not null default now()

unique index (property_id, cluster_number)
index (property_id, priority)
index (property_id, page_action)
```

History mirror: `keyword_cluster_history`. Trigger fires on priority/name_override/state/page_action/notes change.

**Chat thread association**: no FK column on `keyword_cluster`. The `cluster_chat_thread.cluster_id` unique index makes thread lookup O(1) from cluster, and a column on `keyword_cluster` would create a circular FK that complicates migrations. Lookup: `select * from cluster_chat_thread where cluster_id = $1`.

### `keyword_cluster_member`

```
cluster_id      uuid not null references keyword_cluster(id) on delete cascade
keyword         text not null
assignment      text not null default 'algorithm'
                check assignment in ('algorithm','manual')
moved_by        text nullable
moved_at        timestamptz nullable

primary key (cluster_id, keyword)
index (keyword)
```

No history mirror (membership is the cluster's primary attribute; rebuilt on every recluster). Manual rows preserved across reclusters by the pipeline (it joins on `assignment='manual'` and respects those memberships).

### `page_cluster_assignment`

```
id                  uuid PK
property_id         uuid not null references property(id) on delete cascade
url                 text not null
primary_cluster_id  uuid not null references keyword_cluster(id) on delete cascade
score               numeric not null
assignment          text not null default 'algorithm'
                    check assignment in ('algorithm','manual')
computed_at         timestamptz not null
updated_by          text not null
updated_at          timestamptz not null default now()

unique index (property_id, url)
index (property_id, primary_cluster_id)
```

History mirror: `page_cluster_assignment_history`. Trigger fires on primary_cluster_id change.

### `cluster_chat_thread`

```
id              uuid PK
property_id     uuid not null references property(id) on delete cascade
cluster_id      uuid not null references keyword_cluster(id) on delete cascade
created_by      text not null
created_at      timestamptz not null default now()

unique index (cluster_id)  -- one thread per cluster, lifetime
```

### `cluster_chat_message`

```
id              uuid PK
thread_id       uuid not null references cluster_chat_thread(id) on delete cascade
role            text not null check role in ('user','assistant','tool')
content         text not null
tool_calls      jsonb nullable
tool_results    jsonb nullable
created_at      timestamptz not null default now()

index (thread_id, created_at)
```

Mirrors the existing `brand_dna_chat_message` schema from `db/supabase/migrations/20260519_brand_dna_chat.sql`.

## Editable surface map

| Surface | Edit | Writes | Pattern |
|---|---|---|---|
| Universe row + Keyword drawer | Status (Retained/Excluded/Candidate) | `keyword.status` | Action chip (no dot), same component as `WqaActionChip` |
| Keyword drawer | Notes | `keyword.notes` | Drawer textarea |
| Cluster Map row + Cluster drawer | Priority (High/Watch/Low/Unset) | `keyword_cluster.priority` | Status pill (with dot), inline + drawer |
| Cluster drawer | Cluster name override | `keyword_cluster.name_override` | Drawer text input |
| Cluster drawer | State (open/closed) | `keyword_cluster.state` | Drawer toggle |
| Cluster Map row + Cluster drawer | Page action (Build/Optimize/Remove/Skip) | `keyword_cluster.page_action` | Action chip |
| Cluster drawer | Notes | `keyword_cluster.notes` | Drawer textarea |
| Cluster drawer | Agent chat | `cluster_chat_message` | Drawer Agent section; tools: `find_more_keywords`, `expand_cluster`, `search_serp`, `mark_keyword_excluded` |
| Cluster drawer Members | Manual move keyword in/out | `keyword_cluster_member.cluster_id` + `assignment='manual'` | Cluster picker per member row |
| URL Map row + URL drawer Phase 3 section | Override primary cluster | `page_cluster_assignment.primary_cluster_id` + `assignment='manual'` | Inline cluster picker |
| Opportunities row | "Mark for build" | `keyword_cluster.page_action='build_new'` | Single per-row action button |

**Server actions** (file: `web/app/properties/[slug]/keywords/actions.ts`):

- `setKeywordStatus(slug, keyword, status)`
- `setKeywordNotes(slug, keyword, notes)`
- `setClusterPriority(slug, cluster_id, priority)`
- `setClusterField(slug, cluster_id, field, value)` — covers name_override / state / page_action / notes
- `moveKeywordToCluster(slug, keyword, target_cluster_id)`
- `setUrlClusterAssignment(slug, url, cluster_id)`
- `postClusterChatMessage(slug, cluster_id, content)` — streaming via existing chat infra
- `runRecluster(slug, threshold=4)` — admin-only; reruns the Python pipeline + revalidates

## Phasing

Five chunks, each independently shippable. Subagent-driven dev pattern (same as /pages execution surface).

| # | Chunk | Time | Output |
|---|---|---|---|
| 1 | Recluster at threshold=4 + Supabase backfill | ~1 hour | Run `cluster_buscharter.py` (threshold=4); one-shot Python script writes `keyword` + `keyword_cluster` + `keyword_cluster_member` + `page_cluster_assignment` rows to Supabase. Row-count verification. |
| 2 | DB migrations + server actions + libs | ~half day | All 5 tables + history mirrors + triggers. Server actions per Section 4. Lib helpers `web/lib/keywords.ts`, `web/lib/clusters.ts`. |
| 3 | Read-only /keywords surface | ~half day | Mode switcher + 9 sub-tabs rendering data only. No edit affordances yet. Hydrates from BQ + Supabase. Validates the IA. |
| 4 | Editing surface + polymorphic drawer | ~half day | Inline status/priority/page-action chips. URL→cluster override. Drawer subject polymorphism (URL/Keyword/Cluster). All wired through server actions. |
| 5 | Agent chat per cluster | ~half day | Lazy chat thread; `BrandDnaAssistantDrawer` pattern adapted. Four tools. Streaming responses persist to `cluster_chat_message`. |

After chunk 3, surface is usable as a viewer. Chunks 4–5 add edit + agent layers.

## Out of scope

Deferred to follow-up specs:

- xlsx export endpoint (`/api/wqa/export?phase=3`) — extend the existing endpoint pattern
- KGA fan-out to the other 7 TNA properties (Python work, no UI change)
- Entity Gaps + Content Enrichment workbook tabs (need InfraNodus + fan-out pipelines)
- Multi-thread chat per cluster
- Re-cluster scheduling automation
- Phase 4 content pipeline consumer (page_action signal)

## References

- Phase 3 KGA SOP v1.1: `~/agency/operations/process-library/1. seo-pipeline/sop/phase-3-clustering/keyword-analysis-workbook-sop.md`
- Auto-SEO transcript: `handoff/reference/auto-seo-overview-transcript.md`
- v2 design system: `handoff/design/v2-design-system.md`
- v2 screens (Screen #8 — Keywords): `handoff/design/v2-screens.md` lines 155-167
- Existing /pages execution surface design: `docs/superpowers/specs/2026-05-20-platform-execution-surface-design.md`
- Phase 3 pilot data: `data-hub-468216.SEOPipelineDev.kga_output` job_id `6259976d-c4d0-4bb6-8269-5574303a58b6`
- Local cluster outputs: `delivery/tna/buscharter/phase-3-keywords/buscharter-clusters-2026-05-21.csv`, `buscharter-url-map-2026-05-21.csv`
- Clustering pipeline: `delivery/tna/cluster_buscharter.py`
- Workbook builder: `delivery/tna/build_phase3_keywords.py`
