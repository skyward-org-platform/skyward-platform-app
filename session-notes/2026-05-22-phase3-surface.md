---
title: Phase 3 Keyword Surface shipped to preview — /properties/[slug]/keywords
date: 2026-05-22
status: preview-deployed; not merged to main; user sitting with the preview before deciding next moves
branch: feat/phase3-surface
preview_url: https://skyward-platform-b1y31idg1-skywards-projects-60431a3a.vercel.app/properties/buscharter/keywords
---

# Phase 3 Surface shipped to preview

## What landed

`/properties/[slug]/keywords` now has a real workspace replacing the prior placeholder. Phase 3 keyword universe + SERP-overlap clusters + URL map + per-cluster agent chat, with editable execution state per keyword + per cluster + per URL→cluster mapping. 31 commits on `feat/phase3-surface`.

## Architecture decisions made this session

1. **Two-mode switcher (Discovery / Optimization)** — mirrors the /pages pattern. URL state via `?mode=discovery|optimization&view=<sub-tab>`.
2. **Polymorphic universal drawer** — extended `UrlDrawer.tsx` to accept a discriminated union `subject: {kind: 'url'|'keyword'|'cluster', ...}`. Backward-compatible: existing PagesView + WqaTabs + AuditModeShell callers updated to pass the new prop shape.
3. **SERP-overlap clustering at threshold = 4** — re-ran `cluster_buscharter.py` (threshold bumped from 3 to 4). Produces 646 clusters (up from 498 at threshold=3). Mega-cluster shrunk from 1,195 keywords to 583 keywords. Top cluster by SV is "murrays" at 329,840 SV.
4. **Override-preservation on re-clustering** — `keyword_cluster_member.assignment` and `page_cluster_assignment.assignment` carry an `algorithm | manual` flag. Re-clustering pipeline reads manual rows up-front, re-applies after algorithm runs, so user curation survives.
5. **Agent chat per cluster, Anthropic-based** — mirrors the BrandDnaAssistantDrawer pattern. Subagent deviated from the spec's "Calls OpenAI" text to use Anthropic (claude-sonnet-4-6) for consistency with the existing BrandDnaAssistant runner. Acceptable; swap is one file if we want OpenAI later.
6. **Blocking chat (not streaming)** — spec permitted matching BrandDnaAssistant which is blocking. "Thinking…" indicator during round-trip.
7. **Auto-execute tools (no proposal-card approval)** — `mark_keyword_excluded` mutates immediately. Different from BrandDnaAssistant's proposal-card pattern. Reconsider if mutations feel uncomfortable in use.
8. **`search_serp` is a stub** — returns "not cached in v1" instead of querying BQ. Wiring would require a new `/api/serp` bridge endpoint. Deferred.

## Files changed (high-level)

```
db/supabase/migrations/
  20260522_keyword.sql                                 [new] keyword + history + trigger
                                                            (idempotent vs existing legacy keyword
                                                             table from 20260520_keyword.sql —
                                                             ALTER ADD COLUMN IF NOT EXISTS)
  20260522_keyword_cluster.sql                         [new] keyword_cluster + history + trigger
  20260522_keyword_cluster_member.sql                  [new] keyword_cluster_member
  20260522_page_cluster_assignment.sql                 [new] page_cluster_assignment + history + trigger
  20260522_cluster_chat.sql                            [new] cluster_chat_thread + cluster_chat_message

web/lib/
  keywords.ts                                          [new] typed Supabase queries
  clusters.ts                                          [new] typed queries
  cluster-chat.ts                                      [new] thread + message helpers

web/app/properties/[slug]/keywords/
  page.tsx                                             [modified] real route (was placeholder)
  actions.ts                                           [new] all 8 server actions per spec

web/inference/cluster-chat/
  runner.ts                                            [new] Anthropic runner + 4 tools

web/components/keywords/
  KeywordsView.tsx                                     [new] mode switcher shell
  KeywordsModeShell.tsx                                [new] sub-tab nav per mode
  KeywordStatusChip.tsx                                [new] Retained/Excluded/Candidate
  ClusterPriorityPill.tsx                              [new] High/Watch/Low/Unset
  ClusterPageActionChip.tsx                            [new] Build New/Optimize/Remove/Skip
  ClusterPicker.tsx                                    [new] combobox for URL override
  ClusterChatPanel.tsx                                 [new] agent chat UI
  discovery/UniverseTab.tsx                            [new]
  discovery/SourcesTab.tsx                             [new]
  discovery/ClusterMapTab.tsx                          [new]
  discovery/ActionLegendTab.tsx                        [new]
  optimization/UrlMapTab.tsx                           [new]
  optimization/OpportunitiesTab.tsx                    [new]
  optimization/ForecastingTab.tsx                      [new] placeholder (BQ-dependent)
  optimization/CompetitiveGapTab.tsx                   [new] placeholder
  optimization/CoverageTab.tsx                         [new] placeholder

web/components/
  UrlDrawer.tsx                                        [modified] polymorphic — URL/Keyword/Cluster
  PagesView.tsx, wqa/WqaTabs.tsx, audit/AuditModeShell.tsx  [modified] update <UrlDrawer> call sites

Agency repo (separate):
  delivery/tna/cluster_buscharter.py                   [modified] OVERLAP_THRESHOLD = 4 + members CSV emit
  delivery/tna/phase3_backfill_supabase.py             [new] one-shot CSV → Supabase backfill
```

## Supabase state (buscharter only)

| Table | Rows |
|---|---|
| `keyword` | 9,003 |
| `keyword_cluster` | 646 |
| `keyword_cluster_member` | 2,514 |
| `page_cluster_assignment` | 115 |
| `cluster_chat_thread` | 0 (lazy-created on first message) |
| `cluster_chat_message` | 0 |

Other 7 TNA properties have no Phase 3 data yet. KGA fan-out is a queued option.

## Comparison vs reference auto-SEO app (screenshots received this session)

User shared 4 screenshots of a reference Keyword Universe surface. Compared honestly: their UI is more polished for the keyword workflow specifically. Gaps surfaced:

- **Flat tab structure** vs our 2-mode switcher. Theirs has 8 tabs in one row (Overview / Clusters / All Keywords / Mapping / Search / Global / Sources / Review Queue).
- **Pipeline progress strip** — 4 cards showing REVIEW / SERP / ENRICH / CLUSTER % + last-run timestamps. We have none of this.
- **Manual pipeline triggers** — "Run Review / Run Enrichment / Run Clustering / Run Full Pipeline" buttons. Our re-cluster is CLI-only.
- **Counter strip on keywords** — intent distribution counts + SERP coverage. We don't surface these.
- **Per-column filter inputs** — every column has a filter. We have top-level chips only.
- **Color-coded relevance score** — green/red gradient. We show numeric only.
- **Inline cluster column** — name in row, not just in drawer.
- **Branded keyword concept** — first-class flag + filter.
- **SERP freshness tracking** — per-keyword last-checked date.
- **Review Queue** — dedicated workflow surface for items needing human input.

Things we have that they don't:
- **Polymorphic drawer** (URL / Keyword / Cluster in one component)
- **Agent chat per cluster**
- **Cluster page-action workflow** (Build New / Optimize / Remove / Skip)
- **Cluster name override**
- **History audit via Postgres triggers**

Tier 1 redesign (not implemented this session, queued for next):
1. Flatten tabs to single row
2. Pipeline progress strip
3. "Run pipeline" buttons
4. Overview stat tile row
5. Counter strip on All Keywords
6. Color-coded relevance score
7. Inline cluster column
8. Per-column filter inputs

User said sit with the current preview first; redesign is a follow-up session.

## Concerns flagged by subagents (carry forward)

1. **Branch state mishap mid-Chunk 5** — Chunk 5 subagent's first commit landed on `fix/wqa-pages-domain-match` (different branch) before they noticed and re-landed on `feat/phase3-surface` via reset+checkout. No data lost. Working-tree state on the other branch may still have stale changes — worth verifying with `git status` before the next session starts.
2. **Unrelated working-tree changes** — `web/lib/cache.ts`, `web/lib/brand-dna-data.ts`, multiple `actions.ts` files, etc. are modified but uncommitted. Look like an in-progress `unstable_cache` refactor that predates this session. Build passes with them in place. Decide whether to commit separately, stash, or let the original author finish.
3. **`ANTHROPIC_API_KEY` not in `web/.env.local`** — chat works on Vercel (prod env has it) but errors locally on `npm run dev`. Add it for local dev or test via preview deploy.
4. **`UrlMapTab` row click doesn't open URL drawer** — the keywords page doesn't load the WqaRow + Phase 2 plumbing needed for the existing URL drawer. URL is rendered as a plain anchor instead. To enable full URL drawer from keywords surface: load `wqa_output` + execution + check_states in `keywords/page.tsx` (same as `pages/page.tsx` already does).
5. **Tools auto-execute without approval** — `mark_keyword_excluded` mutates immediately when the model calls it. Brand DNA uses proposal cards (user approves). Worth a design pass after using it.
6. **CSVs gitignored in agency repo** — `delivery/tna/buscharter/phase-3-keywords/buscharter-*-2026-05-21.csv` are on disk but excluded by the agency `.gitignore` rule for CSVs. If a fresh checkout is needed, re-run `cluster_buscharter.py` to regenerate.
7. **Re-cluster CLI-only** — `runRecluster` server action specified in the design wasn't built. To re-run clustering today, manually run `uv run python delivery/tna/cluster_buscharter.py` from the agency repo, then `uv run python delivery/tna/phase3_backfill_supabase.py` to push to Supabase.

## Production state

- Production at https://skyward-seo-platform.vercel.app — **unchanged this session**. Still serves the previous build (with /pages execution surface only; no /keywords). `feat/phase3-surface` is on a preview deploy only.
- Preview deploy: https://skyward-platform-b1y31idg1-skywards-projects-60431a3a.vercel.app
- PR not yet opened. User decision pending: sit with preview, then either merge to main or iterate the surface (Tier 1 redesign).

## Links

- Spec: `docs/superpowers/specs/2026-05-22-phase3-surface-design.md`
- Plan: `docs/superpowers/plans/2026-05-22-phase3-surface.md`
- Reference auto-SEO transcript: `handoff/reference/auto-seo-overview-transcript.md`
- Pipeline structure: `~/agency/operations/process-library/1. seo-pipeline/pipeline-structure-v2.md`
