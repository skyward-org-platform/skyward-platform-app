---
title: P2 Pages Action Semantics Overhaul — shipped to production
date: 2026-05-25
status: live in production; foundational for P1/P3/P4/P5/P6 sub-projects
branch: feat/p2-action-semantics (merged to main via PR #6)
merge_commit: 4624901
prod_url: https://skyward-seo-platform.vercel.app/properties/buscharter/pages
---

# P2 Action Semantics Overhaul — shipped

## Headline

The Pages surface's 10-value flavored action enum is replaced by a clean 7-action noun-decision model + separate status workflow + 16 closed-set logic codes + override-preservation. Foundational sub-project: P1 (bulk edit + audit log), P3 (column ergonomics), P4 (Funnel IA), P5 (Redirect tab depth), P6 (Action Plan consolidation) all build on this.

PR #6 merged. Production deploy. 12 commits across 6 chunks on `feat/p2-action-semantics` + 1 stopgap fix commit on main (cache.ts symbols).

## Strategic context (earlier in the session, before P2 execution)

Today's session opened with substantial Pages surface feedback (~35 items in the dump). The dump was decomposed into 8 sub-projects:

| Theme | Sub-projects |
|---|---|
| **Pages overhaul** | P1 (editable + audit log + bulk edit) · P2 (action semantics) · P3 (columns + ergonomics) · P4 (Funnel-vs-tabs IA) · P5 (Redirect tab) · P6 (Action Plan + Implementation consolidation) |
| **Navigation** | N1 (Dashboard cards link nowhere) · N2 (Clients CRUD) |
| **Infrastructure** | I1 (drift detection) · I2 (per-URL time series) · I3 (ClickUp integration) · I4 (Cloudflare / MCP redirect execution) |
| **Quick fixes** | B1 (Open full page 404 · history reader stub · URL truncation in drawer) |

Recommended sequencing: B1 → P2 → P1 → P3 → P4 → P5 → P6 → N1+N2 → I1 → I2 → I3 → I4. P2 done. P1 + P3 are next natural follow-ups.

## Other significant work this session (before P2 implementation)

**Skills surface UI/UX mockup added to v2-ui-mockup.html** (Screens 17 + 18):
- Screen 17 — org-level Skills library: 16 skills across 5 domains (SEO Pipeline / SEO Ad-hoc / Sales / Reporting / Ops), card grid with filter chips + search + recent runs strip, preview modal in canonical Letaido shape
- Screen 18 — per-property Skills tab: same library scoped + Currently Relevant section that infers next-step skills based on pipeline state (Monthly Report due, Authority refresh, etc.) + Launch sheet with auto-bound context

Not implemented — mockup only. Intentional pause: skills surface concept locked, build deferred until other planning lands.

**Letaido / Agent A exploration**:
- Reviewed Ahrefs's Letaido / Agent A product (multi-tenant SaaS for agentic SEO work)
- Honest assessment: their 1,474-connector marketplace + Whiteboard no-code platform + Apps marketplace is 6-12 months of product engineering away. Don't replicate; the agency-OS architecture is different.
- Concept Paul articulated and we validated: org → workspace per client → universal skills library → unified data warehouse → apps as surfaces. Mental model is right.

**4-app inventory + consolidation strategy (Path A)**:

| App | Stack | Database | Status |
|---|---|---|---|
| skyward-platform (legacy) | FastAPI + Next.js | BigQuery only (Meta tables) | In use; Adam's territory |
| skyward-platform-app | Next.js 16 | Supabase `ceyovawndjleprzjsjsr` | Production |
| scope-builder | Next.js 16 | Supabase `qramhamwfnwzskctxpfu` (dev) / `pkvvbixkeeawhsdfbzrs` (prod) | Production at scope.goskyward.io |
| expense-tracker (Skyward Finance) | Next.js + SQLite | Local SQLite | In use; 21 tables (clients/team_members/services/contracts/crm_deals/etc.) |

Three apps with overlapping client + deal models. Recommended Path A: one Supabase project with multiple schemas (`public.*` core + `sales.*` from scope-builder + `finance.*` from expense-tracker migrated off SQLite). NOT EXECUTED — strategic conversation only.

**Adam's territory boundaries clarified**:
- `skyward-common` v1.4.1 Python package (BigQuery + DataForSEO + LLM + Slack + utils) — sacred, not touched
- `skyward-platform` (FastAPI admin) — sacred
- BigQuery `Meta.*` tables — sacred
- Skyward-owned: `build_phase1_wqa.py` and friends in `~/agency/delivery/` (Paul wrote these this session originally)

## P2 design + implementation

**Spec**: `docs/superpowers/specs/2026-05-25-action-semantics-design.md` (b54c925)

**Plan**: `docs/superpowers/plans/2026-05-25-action-semantics.md` (e254c5c)

### Architectural decisions locked in brainstorm

1. **Action = noun-decision** (not verb-state). 7 actions: Optimize / Restore / Redirect / Consolidate / Remove / Keep / Investigate. Each describes WHAT WE DECIDED about the URL, not the current work need.
2. **Status = separate universal 4-state**: Open / In Progress / Done / Drifted. Same enum for every action. Drifted is auto-only (drift detection sets it; manual transitions blocked).
3. **No exclusion bucket** — every URL gets triaged. System URLs (fragments / params / utility) become Keep + `logic_code='system_url'`. Coverage is complete; logic_code distinguishes why.
4. **Action collapsing**: Investigate / Evaluate / Review → single Investigate (logic code is the secondary axis). Non-primary variants moved from Redirect to Consolidate. Old "Leave as 404" / "Non-addressable" / "Non-indexable" → Keep.
5. **Logic = code + notes**: closed-set `logic_code` (16 codes, pipeline-assigned) + free-text `logic_notes` (operator-editable).
6. **Override-preservation**: pipeline writes `action` + `logic_code` + `target_url`; operator writes `action_override` (via wqa_decision row deletion → falls back to pipeline) + `target_url` + `logic_notes` + `status`. History trigger fires only on operator fields.

### Execution — 6 chunks via subagent-driven development

| Chunk | Output | Commits |
|---|---|---:|
| **1** | Migration `20260525_wqa_decision_v2.sql` (action constraint to 7, status/logic_notes/drift columns, history trigger extended). Lib types: `Action7`, `WqaStatus`, `LogicCode` + label maps + color tokens. | 2 (0af5617, e16ecf8) |
| **2** | 8 server actions (`setAction`, `setStatus`, `clearDrift`, `setLogicNotes`, `setTargetUrl`, `verifyTargetUrl`, `clearActionOverride`, `clearTargetUrlOverride`) + back-compat shims. `/api/verify-url` route handler (HEAD-follows-redirects up to 10 hops). | 2 (b5b517c, 2043bc1) |
| **3** | `WqaActionChip` v2 (7-value dropdown + override indicator). New `WqaStatusChip`. New `WqaLogicCell`. Filter chip strip (Action / Status / Logic / Override) with URL persistence. `HumanReviewTabs` consolidated as single Investigate with logic_code secondary axis. Back-compat shims deleted. `LEGACY_TO_ACTION7` table relocated to `wqa-decisions.ts` as `toAction7()` helper. | 5 (5fdb44c, 868325e, 98a6ac6, a45435f, ce59bbd) |
| **4** | UrlDrawer: Triage logic section (logic_code + override-of indicator + editable notes), Target URL section (editor + Verify button, only for Redirect + Consolidate), drift banner (rose, when status=Drifted, with Acknowledge button). Shared `VerifyButton` component used by drawer + Redirect tab + Consolidate tab inline. | 2 (e341932, 4f1a1ff) |
| **5** | `delivery/tna/build_phase1_wqa.py` emits Action7 + logic_code natively. `build_phase4_content.py priority_tier()` patched for back-compat. Re-ran for 8 TNA sites. | 1 (387fe94 in agency repo) |
| **6** | PR #6 + merge to main via `--admin` + production deploy via `vercel --prod`. Stopgap cache.ts fix landed directly on main (`276442a`). | 1 merge + 1 stopgap |

### Per-site Action7 distribution (after Chunk 5 re-emission)

| Site | Total | Opt | Res | Red | Con | Rem | Kep | Inv | Logic codes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| buscharter | 1,701 | 348 | 3 | 615 | 13 | 468 | 172 | 82 | 14 |
| bushire.com.au | 645 | 151 | 0 | 102 | 7 | 159 | 161 | 65 | 11 |
| bushireconz | 873 | 215 | 0 | 20 | 393 | 137 | 45 | 63 | 10 |
| minibushire.co.nz | 579 | 111 | 0 | 11 | 64 | 225 | 122 | 46 | 11 |
| minibushire.com.au | 199 | 28 | 0 | 13 | 16 | 88 | 23 | 31 | 11 |
| partybusguru | 187 | 75 | 0 | 33 | 6 | 36 | 14 | 23 | 10 |
| tnabushire | 695 | 73 | 0 | 11 | 0 | 580 | 25 | 6 | 11 |
| transportnetworkaustralia | 41 | 0 | 0 | 0 | 0 | 41 | 0 | 0 | 1 |

`transportnetworkaustralia` is the only outlier — 41 rows all Remove, consistent with the GA4-only data state (no Phase 1 content to optimize).

## Concerns flagged + carried into next session

1. **Stopgap cache.ts fix on main** — Chunk 1's `wqa-decisions.ts` references `CACHE_TAGS.wqaDecisions` + `TTL.data` symbols that don't exist on main (they live in Paul's parallel unstaged cache refactor in the working tree). The Chunk 6 subagent shipped a surgical fix (`276442a`) to ADD those symbols without removing existing ones. **Paul's in-progress local cache.ts refactor will conflict with this when he resumes; needs reconciliation.**

2. **Logic column shows '—' until Adam's BQ pipeline refresh** — agency-repo `build_phase1_wqa.py` is a downstream post-processor (xlsx + CSV outputs). BQ `wqa_output` is written by `skyward.seo_pipeline.modules.website_quality_audit.run.run_wqa` (Adam's package). Until that emits Action7 + logic_code, the Logic column populates empty in the UI. The UI is ready and waiting. **Coordination point with Adam.**

3. **Vercel SSO preview self-call risk on Verify endpoint** — `verifyTargetUrl` server action does a server-to-server fetch to `apiBase()/api/verify-url`. On Vercel preview deployments with SSO Protection enabled, the self-call could 401. Same risk pattern as existing `apiBase()` usage; flagged for completeness.

4. **`scripts/backfill_pages.py` ACTION_VERBS map** missing `investigate` — legacy `page.audit_action` column (no longer canonical; wqa_decision is) doesn't include the value. Not blocking; if someone wants legacy page.audit_action to surface Investigate too, one-line constraint update needed.

5. **`build_phase1_decks.py`** still uses old action names (`startswith("Review")`, `startswith("Evaluate")`, `startswith("No Action")`). Decks built before today's commit unaffected. Re-running the deck builder will produce empty slots for those buckets. Followup: remap deck builder counts to Action7.

6. **`HumanReviewTabs.tsx` filename retained** for path stability even though it now exports a single InvestigateTab. Future rename + import cleanup is a polish item.

7. **`?action=` URL param overloaded** — WqaTabs uses it for sub-tab selection AND the new filter chip strip uses it for Action7 multi-select. Don't conflict in practice but worth a namespace cleanup eventually (e.g. `?fa=Optimize`).

## State of the platform at end of session

| Surface | Route | Status |
|---|---|---|
| Property Overview | `/properties/[slug]` | ✓ |
| Brand DNA | `/properties/[slug]/brand-dna` | ✓ |
| **Pages (Phase 1 + 2)** | `/properties/[slug]/pages` | **✓ NOW WITH 7-ACTION SEMANTICS** |
| Keywords (Phase 3) | `/properties/[slug]/keywords` | ✓ |
| Content (Phase 4) | `/properties/[slug]/content` | ✓ |
| Authority (Phase 5) | `/properties/[slug]/authority` | ✓ |
| Reports (Phase 6) | `/properties/[slug]/reports` | not built (Phase 6 baseline doc only) |
| Skills | `/skills` + `/properties/[slug]/skills` | mockup only (Screens 17, 18 in v2-ui-mockup.html) |

## Followups consolidated (now 17 items)

| # | Item | Source |
|---|---|---|
| 1 | Intent counter chips on /keywords All Keywords (intent column backfill) | Earlier session |
| 2 | Phase 6 baselines for other 7 TNA properties | Earlier session |
| 3 | `runRecluster` + `runRecomputeContentPlan` server actions (use Phase 5 pipeline-trigger pattern) | Earlier session |
| 4 | Buscharter disavow file update (SEOExpress wave) + initial quality classification pass | Earlier session |
| 5 | DR-label polish in `DrTrendChart.tsx` | Earlier session |
| 6 | Phase 3 chat tools auto-execute without proposal-card approval | Earlier session |
| 7 | UrlMapTab row click → URL drawer | Earlier session |
| 8 | Pre-existing `unstable_cache` refactor in working tree (now partially landed via stopgap) | Earlier session + P2 Chunk 6 |
| 9 | First Monthly Report (June 2026 covering May 2026) | Earlier session |
| 10 | First QBR (July 2026 covering Q2) | Earlier session |
| 11 | Skills surface implementation (mockup ready) | Today |
| 12 | Adam's BQ pipeline Action7 + logic_code refresh (unblocks Logic column population) | P2 Chunk 6 |
| 13 | cache.ts reconciliation (stopgap added; Paul's WIP needs merge) | P2 Chunk 6 |
| 14 | `scripts/backfill_pages.py` ACTION_VERBS for `investigate` | P2 Chunk 5 |
| 15 | `build_phase1_decks.py` Action7 rename | P2 Chunk 5 |
| 16 | `HumanReviewTabs.tsx` filename → `InvestigateTab.tsx` | P2 Chunk 3 |
| 17 | `?action=` URL param namespace cleanup | P2 Chunk 3 |

**Next natural Pages sub-projects** (per the decomposition at session start):
- P1: editable action column + audit log + bulk edit (the audit log reader uses the history trigger P2 already extended)
- P3: column visibility + per-column sort + filter + external-link icon + URL truncation fix
- B1: drawer "Open full page" 404 fix + history reader implementation + URL truncation

## References

- P2 spec: `docs/superpowers/specs/2026-05-25-action-semantics-design.md`
- P2 plan: `docs/superpowers/plans/2026-05-25-action-semantics.md`
- Phase 5 pipeline-trigger pattern (referenced in plan): `docs/superpowers/specs/2026-05-22-phase5-surface-design.md`
- v2 design system: `handoff/design/v2-design-system.md` + `v2-tokens.css`
- v2 mockup (with Screens 17 + 18 added today): `handoff/design/v2-ui-mockup.html`
- Prior session notes: `2026-05-21-execution-surface-shipped.md` · `2026-05-22-phase3-surface.md` · `2026-05-23-phases-4-5-6.md`
