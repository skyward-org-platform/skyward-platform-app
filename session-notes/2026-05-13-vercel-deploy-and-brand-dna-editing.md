---
title: Vercel deploy + Brand DNA inline editing
date: 2026-05-13
participants: Paul, Claude (Opus 4.7)
related_branches:
  - feat/p1-minimal-ui
related_memory:
  - reference_seo-platform-vercel.md
---

# Session: Vercel deploy + Brand DNA inline editing

## What we set out to do

Pick the next move on the SEO Platform web app after the May 8 prototype. Two
threads:

1. Get the prototype off `localhost:3001` so the team can poke at it.
2. Extend the inline-editing pattern (already proven for `audit_action` chips)
   to Brand DNA bodies, since write-back is the core moat for the platform.

## What got shipped

### 1. Vercel deploy of `feat/p1-minimal-ui`

- New Vercel project `skyward-seo-platform` (project ID `prj_eFUNPn2kNAddgfLPCZKa0Nmmm6GM`,
  team ID `team_tRJkYQFydTCQBNlXQWF1XABS`).
- Root Directory set to `operations/seo-platform/web` so the monorepo path
  doesn't trip GitHub-triggered builds.
- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set across all three
  Vercel environments (Production / Preview / Development).
- Deployment Protection turned off so URLs are publicly accessible without a
  Vercel login.
- GitHub repo connected (`data-skyward/agency`). Every push to any branch now
  auto-builds a preview URL; pushes to `main` would build production.
- Reference doc in memory: `reference_seo-platform-vercel.md`.

### 2. Brand DNA inline editing for `body` text fields

**Database:**
- New table `brand_dna_section_history` (append-only). Columns mirror
  `brand_dna_section` plus a `snapshotted_at` timestamp.
- `BEFORE UPDATE` trigger `trg_snapshot_brand_dna_section` snapshots the OLD
  row into history whenever `body` or `content` changes. Trigger condition is
  `is distinct from`, so no-op updates don't pollute the log.
- Migration file at `db/supabase/migrations/20260513_brand_dna_section_history.sql`
  (first file in that directory — the May 8 P0 migrations live only in
  Supabase, not in git).
- Smoke-tested against `phil-lasry` brand_story section. History captured both
  the insert-marker and the cleanup-marker correctly.

**App side:**
- New Server Action `updateBrandDnaBody` at `app/properties/[slug]/actions.ts`.
  Sets `body`, `updated_by='ui:prototype'`, `updated_at=now()`. Trigger handles
  history automatically.
- New client component `components/BrandDnaBodyEditor.tsx` — click body text
  to switch to a textarea, save on blur, optimistic update + revert on error,
  Esc to cancel, auto-sizes height to content.
- `app/properties/[slug]/page.tsx` wired to use the editor for any section
  with a `body` (or no `content` data). Sections with only structured `content`
  JSON stay read-only — we agreed they need a different editor.

**Provenance approach (decided this session):** write-through history table
is simple enough that Adam can refactor it later (drop and replace with a
JSONB diff column, a custom audit schema, whatever) without app-level fallout.
No revert UI yet — the data is there at the SQL layer.

## Key decisions made during execution

- **Replit vs Claude Code for app dev:** keep the Next.js app in the agency
  repo, use Vercel preview URLs for the "share with team" benefit. Reserve
  Replit for tools where the in-browser agent loop is the actual win
  (partner-meeting app, sales tracker). Splitting the SEO platform across
  repos would fragment the backend/frontend contract.
- **Editable fields scope:** just `body` text. Structured `content` JSON edits
  would need per-key fields (cleaner UX, but more code per section schema) —
  not in P1 scope.
- **Save trigger:** click-to-edit + save on blur, matching the chip pattern.
  Esc cancels. No explicit Save button.
- **History semantics:** snapshot the OLD row on update. Append-only. No
  app-level revert UI yet. Simple now, easy to evolve later.

## What we learned (gotchas worth carrying forward)

These are documented in `reference_seo-platform-vercel.md`:

1. **Supabase joins break Next.js prod build.** Typegen treats one-to-one
   joins as arrays. Direct cast `prop.client as { name: string }` is rejected
   by strict TS. Route through `unknown` to satisfy the compiler.
   Local `next dev` (Turbopack) is lenient and won't catch this.
2. **CLI `vercel env add NAME preview --yes` won't honor "all preview
   branches".** Returns `git_branch_required` even when git is connected.
   Workaround: REST API call to `POST /v10/projects/$ID/env` with
   `target: ["preview"]`.
3. **GitHub connection has two prerequisites.** (a) Vercel account
   login-connection to GitHub at `vercel.com/account/login-connections`,
   and (b) Vercel GitHub App installed on the org at
   `github.com/apps/vercel/installations/new`. Both required; the CLI error
   message is different for each.
4. **Hobby-plan Vercel teams enforce git author verification at the team
   level.** Even with `gitForkProtection=false`, the team-level check still
   blocks deploys where the HEAD commit's git author email is not on the
   team. On Hobby, the team can only have one member, so this is effectively
   "deploys must come from the team owner's git email." For Skyward that is
   `data@goskyward.io`. Worked around by setting global git config to
   `data@goskyward.io` (kept the `Paul Skirbe` display name).

## State at session end

| | |
|---|---|
| Branch | `feat/p1-minimal-ui` |
| Vercel project | `skyward-seo-platform`, root `operations/seo-platform/web` |
| Production URL | https://skyward-seo-platform-qyek3ciia-skywards-projects-60431a3a.vercel.app (older code — pre-Brand-DNA-editor) |
| Pending | New push from `data@goskyward.io` author to trigger auto-deploy with Brand DNA editor live |
| Git config | local + global both `data@goskyward.io / Paul Skirbe` |
| Vercel protection | `gitForkProtection=false`, `ssoProtection=null` |
| Migrations | First local migration committed: `db/supabase/migrations/20260513_brand_dna_section_history.sql`. Earlier P0 migrations still only in Supabase. |

## Next session candidates

From the May 8 kickoff doc, narrowed by what we ruled out this session:

- ~~Inline editing for Brand DNA bodies~~ — done
- **Backfill TNA / KSSD / BusBank into Supabase** — pure data work, makes the
  deployed URL useful for the team (multiple comparison points).
- **Structured `content` editing** — per-key fields for sections with JSON
  content instead of body. Bigger UX lift; needs a per-section schema.
- **Brand DNA "Research & Fill" button** — agentic loop. Touches Adam's lane
  (OpenAI inference + write-back), so should wait for Adam alignment on
  embedding pipeline reconciliation.
- **Grok research on @ecomtryggvi** — research, not a shipped feature. Pre-set
  in the May 9 RESUME-NEXT-SESSION doc but skipped this session.
- **Auth + full sidebar polish + remaining JTBD tabs** — productionization,
  bigger slice. Probably its own session once team-internal access is needed.

## Adam follow-ups (unchanged from May 8)

Still pending input on:
1. BQ ops dataset placement.
2. ETL ownership (his package vs separate Cloud Run vs FDW).
3. Embedding pipeline reconciliation (his Gemini vs our OpenAI).
4. Backfill plan for other clients.

The Brand DNA history table introduced this session is local to the platform
prototype and doesn't depend on Adam — no new coordination required for that
specifically.
