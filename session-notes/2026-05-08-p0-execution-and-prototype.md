---
title: P0 Data Foundation Execution + Minimal UI Prototype
date_range: 2026-05-06 → 2026-05-08
participants: Paul, Adam (async via Slack handoff), Claude (Opus 4.7)
related_specs:
  - operations/seo-platform/specs/supabase-schema-spec-v1.md
  - operations/seo-platform/specs/brand-dna-brain-spec-v1.md
  - operations/seo-platform/specs/ui-organization-spec-v1.md
  - operations/seo-platform/specs/p0-data-foundation-plan-v1.md
  - operations/seo-platform/specs/p0-completion-summary.md
related_prs:
  - github.com/data-skyward/agency/pull/1 (P0 Data Foundation)
related_branches:
  - feat/p0-data-foundation (PR #1)
  - feat/p1-minimal-ui (prototype)
---

# Session: P0 Execution + UI Prototype

## What we set out to do

Continue the Tryggvi-inspired SEO Platform thread from prior sessions. Move from specs to working software. Ship the data foundation, then make it real with a Next.js prototype.

## What got shipped

### Specs written (then committed)
- **Schema spec v1** — 10-entity model (`client`, `property`, `brand_dna_section`, `project_brain_entry`, `page`, `keyword`, `cluster`, `signal`, `playbook_run`, `brief`). Property-scoped (multi-domain native: TNA, KSSD encoded correctly).
- **UI organization spec v1** — persistent sidebar shell, JTBD per-property page (Overview/Strategy/Discovery/Execution/Performance), hybrid skill firing model, 8-phase build order. Detailed mockups for the Phase 0 + Phase 1 surfaces (Brand DNA editor + Pages Triage).
- **P0 data foundation plan v1** — 18 bite-sized tasks (later 19 with Task 10.5 added mid-execution). TDD discipline. Bash + SQL + Python + commit at every step.
- **Adam handoff zip** — `seo-platform-handoff-2026-05-06.zip` packaged with overview + all specs.

### Code shipped (P0, branch `feat/p0-data-foundation`, PR #1)
- 5 Supabase migrations (`db/supabase/migrations/`) creating client / team_member / property / page (with pgvector + HNSW) / brand_dna_section / project_brain_entry / brand_dna_current view; RLS policies on every mutable table.
- Seeded 9 clients + 9 properties (multi-property: TNA × 3, Kitchen Services SD × 2).
- Backfilled 42 phil-lasry pages from existing WQA workbook (audit_action distribution: redirect 20 / optimize 12 / no_action 5 / restore 3 / undecided 2).
- **Task 10.5 (added mid-execution):** pulled 25 plasry pages with `content_text` + OpenAI `text-embedding-3-small` (1536 dims) from Adam's existing `data-hub-468216.ScreamingFrog.custom_javascript_page_content` table. Read-only on BQ, never wrote.
- 5 inference modules with TDD coverage: `voice_tone`, `brand_terms`, `proof`, `future_audience`, `brand_story` (all Pydantic + OpenAI structured outputs against `gpt-4o-2024-08-06`).
- Backfilled 6 `brand_dna_section` rows for phil-lasry (1 manual identity + 5 inferred).
- Markdown export at `delivery/phil-lasry/00-brand-dna.md` (canonical = Supabase, this is the git snapshot).
- 14+ smoke tests passing.
- Total OpenAI cost: ~$0.40.

### Prototype shipped (branch `feat/p1-minimal-ui`)
- Minimal Next.js 16 app at `operations/seo-platform/web/` — TypeScript, Tailwind, shadcn/ui, App Router, server components, no auth.
- Persistent sidebar with client-grouped property list + phase badges.
- Property page with two tabs: Brand DNA (6 cards rendering live JSONB content) + Pages (42 rows, color-coded audit_action chips).
- Reads live from Supabase via service role.
- Running on `http://localhost:3001`.

## Key decisions made during execution

1. **`uuid_generate_v4()` lives in the `extensions` schema in Supabase Postgres**, not `public`. All migrations qualify it as `extensions.uuid_generate_v4()`. Caught after Migration 2; plan corrected globally for remaining migrations.

2. **Supabase CLI 2.x default layout** puts config + migrations under `db/supabase/`, not `db/` directly. Pre-created `db/migrations/` was migrated to `db/supabase/migrations/` so `supabase db push` finds the SQL.

3. **phil-lasry is a Miami-based architectural & commercial photographer**, not a New York personal-injury law firm or NYC editorial photographer. SAMPLE_PAGES fixtures + IDENTITY_CONTENT corrected. Worth flagging: until you actually look at a client's website content, never assume what their brand is.

4. **Read-only on Adam's BigQuery** (`data-hub-468216`). Never wrote to his project. Discovered Adam's Screaming Frog crawl already had plasry content; built Task 10.5 to pull from there instead of a fresh crawler. Models the long-term BQ → Supabase sync pattern.

5. **OpenAI `text-embedding-3-small`** locked as the embedding model (1536 dims). Adam's existing pipeline has Gemini embeddings for some clients but NOT plasry; we re-embedded with OpenAI for consistency.

6. **`property.bq_dataset` / `ahrefs_project_id` / `gsc_property` columns deferred** in Migration 3 until cross-system structure is settled with Adam. Adam's convention is `project_id` strings (e.g., `plasry.com_001`) in shared core BQ tables, not per-property datasets.

7. **BQ ops dataset** (`data-hub-468216.seo_platform_ops`) was proposed and tabled. Putting an operational mirror inside Adam's GCP project violates the "don't write to his BQ" guardrail. Whatever long-term structure we land on goes in a separate GCP project or via a different sync mechanism.

8. **Hybrid skill-firing model locked.** Quick, signal-driven, targeted skills (info-gain brief, single-keyword scoring, Brand DNA Research & Fill agent) fire from app buttons. Long phase runs (Phase 1-6) stay in Claude Code. Both write to `playbook_runs` for unified timeline.

9. **Internal-only v1, no client login.** Schema supports v2 client logins via the `client_id` foreign key chain; RLS policy templates are ready to be tightened when needed.

## Notable quotes from inferred output (proof-of-life on inference quality)

Brand story for phil-lasry, generated by `infer_brand_story` from real /aboutus content:

> "Philippe Lasry, a self-taught photographer based in Miami, founded his commercial photography studio over two decades ago. His journey into photography began as a personal obsession with light and composition, which he honed through curiosity and practice rather than formal education..."

Voice & tone good-example sentence pulled directly from /aboutus by `infer_voice_tone`:

> "I don't document spaces. I make the case for them."

Future audience shift inferred at 24-month horizon:

> "From architects and developers to luxury lifestyle brands and high-end real estate marketers."

Inference produced on-brand, defensible output for a client whose website we'd never visited before. Validated that the OpenAI structured-output pattern works against real plasry content.

## Open items for next session

- Merge PR #1 (P0 data foundation). Then merge or keep `feat/p1-minimal-ui` as a working prototype branch.
- **Adam walkthrough still pending.** Handoff zip sent; he replied via Slack/Fathom but no formal sync yet. Items to settle:
  - BQ ops dataset placement (separate GCP project? in his existing `SEOPipelineProd`? skip entirely?)
  - ETL ownership for BQ → Supabase sync (his package vs separate Cloud Run vs Foreign Data Wrapper)
  - Embedding generation in his pipeline (Gemini for other clients vs OpenAI for ours — reconcile)
  - Backfill plan for other clients
- **Backfill more clients.** Same phil-lasry pattern for TNA properties (3), KSSD (2), BusBank, etc. Each ~10-20 min via subagent.
- **Project Brain population.** Table exists, empty. Start writing real entries as work happens.
- **Inline editing in Pages Triage.** Smallest interactive feature with high signal — proves the read-write loop.
- **Full P1 plan.** Auth, all 5 JTBD tabs, Research & Fill button, Brand DNA Assistant chat, sidebar polish (active state, ⌘K, search, pinning), Home page, cross-property views.
- **Vercel deployment.** Get the prototype live so the team can poke at it.

## Tooling added during this session

- **Grok MCP server** (`@missionsquad/mcp-grok`) registered in Claude Code config. Exposes `search_posts`, `search_threads`, `search_users`, `get_trends`, `health_check`. Authenticated via `XAI_API_KEY` in `.env`. Tools become available after restarting Claude Code (next session). Intent: pull insights from @ecomtryggvi's X content to inform Brand DNA / Mission Control / Command Center design before P1 expands.
- **Python deps** added via `uv add`: supabase, openai, openpyxl, python-dotenv, pyyaml, pytest, google-cloud-bigquery.

## Architecture state at end of session

```
agency/
├── delivery/phil-lasry/00-brand-dna.md     ← generated markdown, committed
├── operations/seo-platform/
│   ├── README.md
│   ├── specs/                               ← 4 specs + plan + completion summary
│   ├── research/                            ← Tryggvi stack notes
│   ├── handoff/                             ← Adam zip
│   ├── session-notes/                       ← THIS DIRECTORY (new)
│   ├── db/supabase/                         ← Supabase CLI config + 5 migrations
│   ├── inference/                           ← 5 OpenAI inference modules + tests
│   ├── scripts/                             ← seed, backfill, export, BQ pull
│   ├── tests/                               ← smoke + idempotency tests
│   └── web/                                 ← Next.js prototype (feat/p1-minimal-ui)
└── ...

Supabase (seo-platform-dev):
- 6 tables, RLS policies, 1 view
- 9 clients, 9 properties
- 42 phil-lasry pages (25 with content + embeddings)
- 6 brand_dna_section rows for phil-lasry

BigQuery (data-hub-468216):
- Untouched. Read once from ScreamingFrog.custom_javascript_page_content.

Vercel:
- No deployment yet (prototype is local-only).

GitHub:
- PR #1 open: github.com/data-skyward/agency/pull/1
- feat/p0-data-foundation pushed (19+ commits)
- feat/p1-minimal-ui pushed (1 commit)
```

## What worked well in this execution

- **Subagent-driven development with bite-sized TDD tasks.** Each implementer subagent could complete a task in 30-90 seconds. Fresh context per task prevented drift. Sequential dispatch kept commits clean.
- **Read-only BQ pattern.** Adam's existing data became an asset, not a blocker. The `pull_plasry_content_from_bq.py` script is reusable for any client whose Screaming Frog data is already in the warehouse.
- **Inference quality from real content.** Using actual /aboutus content (vs. fabricated SAMPLE_PAGES) made the Brand DNA output defensible.
- **Plan corrections during execution.** Treating the plan as a living document (qualifying `uuid_generate_v4`, fixing migration paths, correcting fixtures) kept the work moving without going back to re-plan.

## What to be careful about next time

- **Don't fabricate brand-specific content in plans.** SAMPLE_PAGES were initially personal-injury-law content for a photographer client. Always pull real content (or no content) when writing fixtures.
- **Verify Supabase CLI quirks early.** The `db/supabase/` subdirectory layout cost us a small commit fix. A 2-minute `supabase init` test in P0's scoping would have caught it.
- **Active-tab UX in server-component layouts.** The prototype's tabs don't underline the active one because it'd require a `usePathname` client component. Not blocking, but on the polish list.
