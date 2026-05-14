---
title: Merge plan — skyward-platform (admin) into skyward-platform-app (SEO app)
date: 2026-05-14
participants: Paul, Claude (Opus 4.7)
context: 2026-05-13 Internal call with Adam (https://fathom.video/share/1Wxg6tL7v2nwXVYgKJ3rmn5z_zvqb8ne)
companion_notes:
  - session-notes/2026-05-13-content-editor-tna-backfill-and-db-plan.md
related_repos:
  - https://github.com/skyward-org-platform/skyward-common (v1.4.1)
  - https://github.com/skyward-org-platform/skyward-platform (admin portal)
  - https://github.com/skyward-org-platform/skyward-platform-app (this repo)
---

# Merge plan: admin portal → SEO platform app

## Decision (from 2026-05-13 call)

Adam and Paul agreed to **merge Adam's standalone admin portal (`skyward-platform`) into this SEO platform app**. The admin's metadata (clients, owned domains, competitor domains, datasets, projects) gets brought into our Supabase. Adam continues building the analytical modules (WQA, keyword gap, keyword aggregate, clustering) and will hook them into the merged app once we tell him where each module's outputs should land.

Quote (Adam): *"I think we should merge them. I think I should move everything from the metadata into the Skyward or the SEO platform project."*

## Three-side fact base

### Side A — `skyward-platform` admin portal (Adam's current tool)

| Layer | Stack |
|---|---|
| Backend | FastAPI + uvicorn, reads/writes via `skyward-common` |
| Frontend | Next.js 16, React 19, Tailwind, shadcn (dark theme), TanStack Query |
| Data | BigQuery `Meta.*` tables (clients, domains, client_domains, projects, project_domains, client_datasets, dataset_catalog) |
| Dev | `uv run python dev.py` (FastAPI :8000 + Next :3000) |

Three dashboards:
- `/clients` (list + `/clients/[id]` detail with 5 collapsible sections: Client Details, Client Domains, Competitor Domains, Datasets, Projects)
- `/domains` (cross-client list, expand row for owner)
- `/projects` (cross-client list, expand row for linked domains)

### Side B — `skyward-platform-app` SEO platform (Paul's current app, this repo)

| Layer | Stack |
|---|---|
| Backend | None — Next.js Server Components/Actions hit Supabase directly |
| Frontend | Next.js 16, React 19, Tailwind, shadcn (default light theme) |
| Data | Supabase Postgres (`seo-platform-dev` project) — `client`, `team_member`, `property`, `page`, `brand_dna_section`, `brand_dna_section_history`, `project_brain_entry` |
| Auth | Supabase auth + RLS (team_member gate) |

Routes today: `/` (welcome), `/properties/[slug]` (Brand DNA), `/properties/[slug]/pages` (Pages Triage). Sidebar groups properties under their client.

### Side C — `skyward-common` shared package (v1.4.1)

- `MetaClient` / `DataHub` — Python CRUD over the BQ `Meta.*` tables
- `DataForSEOClient` — multi-endpoint SEO API with BQ write-through
- `BigQueryClient` — wrapper + upload logging
- `LLM` — 5-provider abstraction + cost tracking + stateful sessions
- `skyward meta` CLI for clients/domains/projects
- Currently pinned at **v1.4.0** in `~/agency/pyproject.toml` — needs bump to v1.4.1

Adam's whole pipeline (`skyward-seo-pipeline` + admin) uses `MetaClient.list_clients()` / `get_client_domains()` etc. against BQ Meta. **Anything that breaks BQ Meta's surface breaks Adam's pipeline.**

## Data model diff (revised after 2026-05-14 direction)

Per the "no duplication" rule, **anything that exists in BQ Meta today stays only in BQ Meta.** We do not create Supabase mirrors for clients/domains/competitors/projects/datasets. We continue building in Supabase only for entities Adam's pipeline doesn't already own.

| Admin (BQ Meta via skyward-common) | Platform-app (Supabase) | Action **NOW** |
|---|---|---|
| `clients` (id, client_name, abbreviation, is_active, notes) | `client` (id uuid, slug, name, legal_name, primary_contact, status, clickup_space_id) | **Keep both as-is.** Currently disconnected. Eventually one source of truth via Adam's migration. |
| `domains` (master domain list) | (none) | **No new table.** Domains live in BQ Meta. |
| `client_domains` (owned, with priority/notes) | `property` (one row per owned domain, with rich state) | **Keep `property` as-is.** Don't mirror BQ's owned-domain rows here. |
| (competitors via `client_domains.is_competitor`) | (none) | **No competitor UI in our app yet.** Competitors live in BQ Meta + Adam's admin portal. |
| `client_datasets` + `dataset_catalog` | (none) | **Stay in BQ Meta.** |
| `projects` (id, client_id, project_type, project_name, status) + `project_domains` | (none) | **No new project table in Supabase.** Project tracking stays in BQ Meta + Adam's admin. |
| `team_member` | — | Platform-only. No change. |
| `brand_dna_section` (property-scoped) | — | **Keep building.** Brand DNA isn't in BQ Meta — it's our half of the split. |
| `page`, `brand_dna_section_history`, `project_brain_entry` | — | **Keep building.** Same. |
| (future) keywords, clusters, signals, briefs, playbook runs | — | **Build in Supabase.** These aren't in BQ Meta. The May-8 schema spec for these still stands. |

## Hierarchy decision (RESOLVED — no restructure needed)

Adam's instinct on the call was to convert TNA's properties (buscharter, tnabushire, minibushire) into clients themselves. **The schema already handles this correctly** — TNA is the client, those three are properties under it. The seed script (`scripts/seed_clients_properties.py`) is already set up this way and is live in production.

What's true:
- A **client** is a contractual entity (one SOW signer).
- A **property** is a domain under that client with its own Brand DNA, pages, and pipeline phase.
- One client can have many properties (TNA → 3 properties; KSSD → 2 properties; most other clients → 1 property).

What needs to be added:
- **Optional client-level Brand DNA** for multi-property clients. TNA brand vs. BusCharter brand. Pattern: `brand_dna_section` can also key on `client_id` (currently only `property_id`). Properties optionally inherit (`brand_voice_inheritance` column already exists with values `'parent'|'override'|'none'`).
- **Competitor domains at client level** (not property level) — competitors are typically a client-wide concept.

## UI delta — what to build in platform-app (revised)

Per the "no duplication" rule, **don't port the admin portal's competitor/projects/datasets UIs** — those entities live in BQ Meta and Adam's admin portal stays the surface for them until migration. For us, the UI work is about extending what's already Supabase-native: client + property + brand DNA + pages, plus new keyword tables.

| New page/component | Status | Notes |
|---|---|---|
| `/clients` (list page) | **YES — build** | Server Components over Supabase `client` table. Counts of properties per client. No competitor/project/dataset counts (those live in BQ). |
| `/clients/[slug]` (detail page) | **YES — build** | Sections: Client Details (editable: name, legal_name, primary_contact, status, slug), Properties list. **No** competitor/project/dataset sections yet — defer until BQ Meta migrates. |
| `/clients/new` | **YES — build** | Server Action create. |
| Competitor domains section | **DEFER** | Lives in BQ Meta + Adam's admin portal until migration. |
| `/projects` (cross-client) | **DEFER** | Same reason. |
| Auto-create project on property insert | **DEFER** | Same reason. |
| Keywords tab on property | **YES — build (empty for now)** | `/properties/[slug]/keywords` placeholder route. Backing tables (`keyword`, `cluster`, `signal`) built later per May-8 spec. |
| Sidebar update | **YES — update** | Add `/clients` link. Keep current property listing under each client. |
| Brand DNA at client level (parent inheritance) | **DEFER** | Schema already supports `brand_voice_inheritance='parent'` on property. Add when first multi-property client (TNA or KSSD) needs it. |

## Sync direction — DECIDED (2026-05-14)

**Direction (per Paul):** Path 3 is the long-term target. For now, the interim rule is:

> Leave BQ Meta + skyward-common **as-is**. It's the backend for production systems currently in use (Adam's pipeline: WQA, KGA, keyword aggregate, clustering). The platform-app **consumes** skyward-common's functionality but does **not** modify it. The platform-app continues building in Supabase only. **No linking or duplication of data between Supabase and BQ right now.** Once the platform-app is in a more concrete place, Adam migrates Meta out of BQ into Supabase and updates skyward-common accordingly.

Concrete implications for now:
- Skyward-common is a **read-only dependency** for our Python scripts (Phase E, when we wire it in). No PRs to skyward-common from this work.
- Competitor domains, datasets, projects, master domain catalog: **stay in BQ Meta only.** Don't build duplicate Supabase tables for these yet.
- Client + property + brand DNA + page + brain + (future) signal + keyword: **Supabase only.** That's our half of the split.
- No cross-store FDW, no Cloud Run sync job, no `bq_client_id` join columns. The two stores are deliberately disconnected during this phase.
- When Adam migrates Meta to Supabase later, the join becomes trivial (everything in one Postgres).

**Path 1, 2, original Path 3 from the earlier draft of this doc — all deferred.** They're the right shape, but the migration happens on Adam's timeline, not ours.

## Skyward Common usage in platform-app

Common is Python. Our web app is TS/Next.js. So Common gets used by:
1. **Python scripts in `scripts/`** — backfill scripts, sync jobs, embedding pipelines. These should `from skyward.config import load_config` etc. Today they don't; they load `.env` from `~/agency/.env`. Refactor.
2. **Cloud Run jobs** (future) — sync, batch inference. Same imports.
3. **Adam's modules** — already use it.

The Next.js code does **not** import skyward-common. It talks to Supabase directly via `@supabase/supabase-js`. The Common surface (e.g. competitor domain CRUD) becomes equivalent Supabase queries in Server Components/Actions.

## Phased execution order (revised)

### Phase A — Light schema additions only
1. Migration: add `abbreviation` + `notes` to `client` (these are Supabase-native enhancements; not duplicating BQ Meta — Adam keeps his own client table, we keep ours, no sync yet).
2. *(deferred)* `domain`, `client_competitor`, `project` tables — these duplicate BQ Meta. Build later, after Adam's migration.

### Phase B — UI: client surface (our half of the split)
3. Build `/clients` list page (Server Components over Supabase).
4. Build `/clients/[slug]` detail with Details (editable) + Properties (table). **No** competitor/project/dataset sections.
5. Build `/clients/new` create form.
6. Wire sidebar: add "Clients" nav.
7. Add Client Details editor (reuse Brand DNA body/content editor patterns).

### Phase C — Pre-wire for Adam's modules
8. Build `/properties/[slug]/keywords` placeholder route + empty state.
9. *(deferred)* Backing keyword/cluster/signal tables — build when Adam's keyword aggregate is closer to landing.

### Phase D — Adam handoff (once Phase B ships and our UI is stable)
10. Share this doc with Adam.
11. Adam decides timing of BQ Meta → Supabase migration based on platform-app stability.
12. Once migration happens, we add competitor / project / domain UI as ports of his admin portal.
13. Adam wires WQA / KGA / keyword aggregate to write into Supabase tables we'll define together.

### Phase E — Cleanup (in parallel with B/C)
14. Bump `~/agency/pyproject.toml` pin: skyward-common v1.4.0 → v1.4.1 (consumer-only; no skyward-common code changes).
15. Refactor Python scripts in `~/skyward-platform-app/scripts/` to load `.env` from the new repo root.
16. Update README to reflect standalone layout + describe the BQ/Supabase split + "no duplication" rule.

## Open Paul-side questions (not Adam-coordination)

1. **`abbreviation` on Supabase `client`** — same convention as BQ Meta's `abbreviation` (e.g. "TNA", "KSSD"), or different? Probably same so future migration is a simple field copy.
2. **Sidebar grouping** — "Clients" nav item replaces sidebar's flat Properties tree, or sits alongside it? Probably alongside: the tree stays for quick property navigation; Clients page is for editing.
3. **Multi-property Brand DNA** — wait for first concrete need (TNA brand-vs-buscharter-brand), or pre-build? Probably wait.

## Today's session-end state (carry-forward)

| | |
|---|---|
| Local clones | `~/skyward-common` (v1.4.1), `~/skyward-platform` (admin), `~/skyward-platform-app` (this repo) |
| skyward-common pin | Still v1.4.0 in `~/agency/pyproject.toml` — bump pending |
| Platform-app current routes | `/`, `/properties/[slug]`, `/properties/[slug]/pages` |
| Properties in DB | 1,944 pages across phil-lasry, buscharter, tnabushire, minibushire |
| Brand DNA sections | 6 (phil-lasry only) |
| Plan status | Drafted (this doc). Not yet shared with Adam. |
