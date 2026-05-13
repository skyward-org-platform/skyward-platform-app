---
title: Repo migration — data-skyward/agency → skyward-org-platform/skyward-platform-app
date: 2026-05-13
participants: Paul, Claude (Opus 4.7)
supersedes:
  - data-skyward/agency PR #1 (merged + extracted)
---

# Session: Platform repo migration

## What we set out to do

Move the SEO platform out of the agency monorepo into its own GitHub repo
under the `skyward-org-platform` org, sitting alongside `skyward-seo-pipeline`
(Adam's package) and `skyward-common`. The agency monorepo was a fine
incubator but the platform now warrants its own repo with its own deploy and
its own collaborators.

## What got shipped

1. **PR #1 merged** to `data-skyward/agency` `main`. Captured the P0 data
   foundation (schema migrations, inference modules, specs, phil-lasry
   backfill) in agency history before extraction.
2. **`feat/p1-minimal-ui` merged** to `data-skyward/agency` `main`.
   Captured the Next.js prototype, Brand DNA editing (body + structured
   content), Vercel deploy work, and TNA backfill (1902 pages across
   buscharter / tnabushire / minibushire).
3. **New repo created:** `skyward-org-platform/skyward-platform-app`
   (public). Sits next to `skyward-seo-pipeline` in the same org.
4. **Subdirectory extracted with full history** via `git filter-repo
   --subdirectory-filter operations/seo-platform/`. All 43 commits preserved
   with original messages and Co-Authored-By tags. Root layout flattened:
   `operations/seo-platform/web/` → `web/`, etc.
5. **Vercel reconnected.** Disconnected from `data-skyward/agency`,
   connected to `skyward-org-platform/skyward-platform-app`. Root Directory
   changed from `operations/seo-platform/web` to `web`.
6. **First deploy from new repo verified.** Empty trigger commit
   (`159cada`) auto-built, promoted to production. Stable production URL
   `https://skyward-seo-platform.vercel.app` unchanged — same alias, new
   source.
7. **Local clone established** at `~/skyward-platform-app`. Web app's
   `.env.local` copied over.

## Key decisions

- **Whole `operations/seo-platform/` directory moved**, not just `web/`.
  The Python inference modules, SQL migrations, backfill scripts, and
  session notes are tightly coupled to the web app via Supabase, so
  splitting them would force cross-repo coordination for every schema
  change.
- **Repo made public.** Vercel's Hobby plan refuses to connect to private
  org-owned repos. Options were: pay for Pro ($20/mo), disable
  auto-deploy, or make public. Public won — the repo has no secrets
  (everything in `.env`, gitignored) and we're not protecting proprietary
  IP yet. Revisit if/when we add proprietary algorithms or paid clients
  start depending on internal endpoints.
- **Full git history preserved** via `git filter-repo`. ~10 minutes of
  setup gave us authentic commit log instead of a "imported from agency"
  empty initial commit.

## Loose ends

1. **Old `operations/seo-platform/` directory still in
   `data-skyward/agency` `main`.** Now stale. Will leave for one cycle in
   case something is referenced from it, then delete with a `chore:`
   commit pointing at the new repo location.
2. **Python script hardcoded paths.** `scripts/supabase_client.py` and
   `scripts/backfill_pages.py` both reference `/Users/paulskirbe/agency/.env`.
   Still works because the agency clone exists locally, but should be
   refactored to load from a `.env` at the new repo root.
3. **README + handoff docs** in the new repo still describe the old layout
   (`operations/seo-platform/`). Need a pass.
4. **Memory updates.** `reference_seo-platform-vercel.md` and the May 13
   Vercel deploy session note both point at the old repo. Updating in this
   pass.

## State at session end

| | |
|---|---|
| New repo | https://github.com/skyward-org-platform/skyward-platform-app (public) |
| Stable production URL | https://skyward-seo-platform.vercel.app (unchanged) |
| Local working dir | `~/skyward-platform-app` (new) and `~/agency/` (legacy, still has the dir on `main`) |
| Vercel project | Same — `skyward-seo-platform` under `team_tRJkYQFydTCQBNlXQWF1XABS`, just connected to the new repo. Root Directory now `web`. |
| GitHub Apps | Vercel installed on both `data-skyward` and `skyward-org-platform`. |
| Visibility | New repo is **public**; agency is private. |

## What to do next session

- Refactor Python scripts to load `.env` from the new repo's root instead
  of the hardcoded agency path.
- Update the new repo's README to reflect the standalone layout.
- Delete `operations/seo-platform/` from agency `main` once we're confident
  no other agency-resident code references it.
- The substantive platform-work backlog (KSSD/BusBank backfill, Brand DNA
  inference for TNA, the keyword/cluster/signal/playbook tables) is
  unchanged by this move and lives in the new repo's
  `specs/p0-completion-summary.md` and Adam-coordination notes.
