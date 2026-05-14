---
title: Skyward Platform App
status: prototype
version: v0.1 | 2026-05-14
---

# Skyward Platform App

In-house web app for the Skyward SEO pipeline. Property-scoped UI for Brand DNA, Pages Triage, audit decisions, and (soon) keywords. Backed by Supabase Postgres + pgvector.

Production: https://skyward-seo-platform.vercel.app

## Two-store architecture (interim rule, 2026-05-14)

There are two data stores that this app participates in. They are deliberately disconnected during the prototype phase.

| Store | Owned by | Holds | Accessed via |
|---|---|---|---|
| BigQuery `Meta.*` | Adam (production for `skyward-seo-pipeline`) | clients, domains, competitors, projects, datasets, dataset catalog, all DataForSEO / GSC / crawl data | `skyward-common` Python package (`MetaClient`, `DataHub`, `DataForSEOClient`) and Adam's admin portal (`skyward-platform` repo) |
| Supabase `seo-platform-dev` | This app | `client` (minimal routing key), `property`, `page`, `brand_dna_section`, `brand_dna_section_history`, `project_brain_entry`, future: `keyword`, `cluster`, `signal` | `@supabase/supabase-js` from Next.js; `scripts/supabase_client.py` from Python |

**Rule (until Adam migrates BQ Meta → Supabase):**
- This app **consumes** `skyward-common` read-only. No PRs to `skyward-common` from this work.
- This app **builds in Supabase only** for entities `skyward-common` doesn't already own (Brand DNA, pages, project brain, keywords, etc.).
- **No linking or duplication** of data between Supabase and BQ. No cross-store joins, no FDW, no Cloud Run sync, no `bq_*_id` columns.
- Adam triggers the unification later by migrating Meta out of BQ into Supabase + updating `skyward-common`.

Related: `session-notes/2026-05-14-admin-merge-plan.md`.

## Repository layout

```
db/supabase/migrations/     Supabase schema migrations (applied via `supabase db push`)
inference/                  OpenAI inference modules for Brand DNA generation
scripts/                    Python utilities (backfill, seed, export, BQ pull)
specs/                      Design docs (P0 data foundation plan, Brand DNA spec)
research/                   Notes + prototypes + external-training comparisons
handoff/                    Materials for Adam walkthroughs
session-notes/              Dated session logs
tests/                      Pytest smoke tests
web/                        Next.js 16 frontend (React 19, Tailwind, shadcn, Supabase)
```

## Web app routes (current)

- `/` — welcome
- `/properties/[slug]` — Brand DNA editor (5 sections, click-to-edit)
- `/properties/[slug]/pages` — Pages Triage (inline audit_action editing)

## Quick start

```bash
# Python (scripts, inference, tests) — uses the agency uv environment
cd ~/agency && uv sync                         # pulls skyward-common v1.4.1

# Web app
cd ~/skyward-platform-app/web
npm install && npm run dev                     # http://localhost:3000
```

The repo's `.env` is symlinked to `~/agency/.env` (single source of truth for credentials).

## Environment

| Variable | Used by |
|---|---|
| `SUPABASE_URL` | scripts, tests, web app |
| `SUPABASE_SERVICE_ROLE_KEY` | scripts, tests (admin client, bypasses RLS) |
| `SUPABASE_ANON_KEY` | web app (RLS-gated) |
| `OPENAI_API_KEY` | inference modules (Brand DNA) |
| `GCP_DATAHUB_PROJECT_ID` | Python scripts that read BQ (`pull_plasry_content_from_bq.py`, etc.) |

Web app env vars are also set in Vercel for the production deploy.

## Supabase migrations

```bash
cd db
supabase db push                  # applies any new migrations under supabase/migrations/
supabase migration list           # see local vs remote state
```

Migration files are timestamp-prefixed: `YYYYMMDDHHMMSS_name.sql`.

## Deploy

Pushing to `main` triggers a production deploy on Vercel. Per-branch pushes get preview URLs. The Vercel project is linked to `skyward-org-platform/skyward-platform-app`.

The Hobby plan's "git author check" requires commits to be authored by `data@goskyward.io / Paul Skirbe` — global git config handles this.

## Used with

- [`skyward-common`](https://github.com/skyward-org-platform/skyward-common) — shared Python package (v1.4.1). Read-only dependency.
- [`skyward-platform`](https://github.com/skyward-org-platform/skyward-platform) — Adam's admin portal over BQ Meta. Stays live during this phase.
- `agency` (private) — workspace for delivery, growth, operations, strategy docs, and SOPs. This repo was extracted from `agency/operations/seo-platform/` on 2026-05-13.
