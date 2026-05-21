---
title: Execution surface shipped — /properties/[slug]/pages mirrors WQA + Phase 2 workbooks
date: 2026-05-21
status: merged to main, production-deployed
branch: feat/execution-surface (merged via PR #1)
prod_url: https://skyward-seo-platform.vercel.app
---

# Execution surface shipped

## What landed

Single new route `/properties/[slug]/pages` becomes the canonical execution surface for the SEO pipeline. Mirrors the 12-tab WQA workbook (Phase 1) and the ~14-tab Technical SEO Audit workbook (Phase 2) in one app surface, scoped per property. Universal URL drawer overlay. xlsx export endpoints reproduce the standalone CLI builder output byte-for-byte from live state.

## Architecture decisions made this session

1. **Two view modes under one route, not two routes.** Phase 1 (Triage) and Phase 2 (Technical Audit) live under `/properties/[slug]/pages` with `?mode=triage|audit`. Phase 2 auto-scopes to Optimize+Restore URLs only (per WQA SOP v4 §7 "Stay URLs"). Original design proposed a separate `/audit/phase-2` route; revised after Paul's note that the audit IS just the optimize/restore subset viewed through a different lens.
2. **Universal URL drawer.** Single `<UrlDrawer>` component opens from any URL row in any tab. Shows Signals (BQ wqa_output read-only) + Phase 1 action + failing Phase 2 checks + Execution state + conditional Restore Spec + History placeholder.
3. **Two-table data model for editable state** — `page_execution` (per-URL workflow: status/owner/due/notes/target URL/restore spec) and `page_check_state` (per-URL × check workflow). History mirrors + Postgres triggers, same pattern as existing `wqa_decision_history`.
4. **Synthetic-URL convention** for Action Plan / Implementation Checklist row state — `synthetic://action-plan/{n}` and `synthetic://implementation-checklist/{n}` as keys in `page_execution`. Pre-filtered out of per-URL views.
5. **Notes-prefix encoding** for the Remove tab's "Recommended Action" override — `[recommended_action] <value>\n<rest>`. Fragile; flagged for follow-up.
6. **Python builder ports** — `web/api/wqa/_phase1_builder.py` (~1156 LoC) and `web/api/wqa/_phase2_builder.py` (~916 LoC) forked from `~/agency/delivery/tna/build_phase1_wqa.py` / `build_phase2_technical.py`. Drift risk acknowledged; consolidation deferred.

## Files changed (40 in the merge diff)

```
db/supabase/migrations/
  20260520_page_execution.sql       (new — page_execution + history mirror + trigger)
  20260520_page_check_state.sql     (new)
  20260520_url_relationship.sql     (new — table only, no UI surface)

web/lib/
  page-execution.ts                 (new — typed queries)
  page-check-state.ts               (new)
  wqa-checks.ts                     (new — TS port of T/C predicates, ~505 LoC)
  supabase.ts                       (modified — lazy singleton via Proxy)
  api-base.ts                       (modified — preview→VERCEL_URL, prod→canonical alias)
  auth.ts                           (modified — requireWriteToken fail-open when env unset)

web/app/properties/[slug]/pages/
  page.tsx                          (modified — fetch executions + check_states)
  wqa-actions.ts                    (modified — new server actions: setExecutionStatus/Field, setCheckStatus/Notes/Owner)

web/components/
  UrlDrawer.tsx                     (new — universal drawer)
  PagesView.tsx                     (modified — TRIAGE/AUDIT mode switcher + Export button)
  wqa/WqaTabs.tsx                   (modified — drawer wiring + execByUrl/checkStatesByUrl threading)
  wqa/OverviewTab.tsx               (modified — Action Plan + Funnel + Service + Implementation Checklist sections)
  wqa/CanonicalAuditTab.tsx         (new)
  wqa/ActionLegendTab.tsx           (new)
  wqa/ConsolidateTab.tsx            (new — Canonicalization Map; editable Canonical Keeper)
  wqa/RedirectTab.tsx               (modified — editable Destination URL column)
  wqa/RestoreTab.tsx                (modified — editable Target H1/Title/Meta columns)
  wqa/RemoveTab.tsx                 (modified — editable Recommended Action selector)
  wqa/{OptimizeTab,HumanReviewTabs}.tsx,WqaDataView.tsx,helpers.tsx,types.ts
                                    (modified — onOpenDrawer prop + row click handlers)
  audit/AuditModeShell.tsx          (new — Phase 2 sub-tab nav + scope filter)
  audit/AuditOverviewTab.tsx        (new — Issue Summary)
  audit/AuditChecklistTab.tsx       (new — 44 checks grouped T/C/S)
  audit/AuditCheckDetailView.tsx    (new — per-check filtered URL list)
  audit/AuditUrlPriorityTab.tsx     (new)
  audit/AuditArchitectureTab.tsx    (new)
  audit/AuditSchemaTab.tsx          (new — transport schema targets)
  audit/AuditPageSpeedTab.tsx       (new — Blocked badge)
  audit/AuditBrokenTab.tsx          (new — Blocked badge)

web/api/wqa/
  export.py                         (new — handles ?phase=1|2)
  _phase1_builder.py                (new — port of build_phase1_wqa.py)
  _phase2_builder.py                (new — port of build_phase2_technical.py)

docs/
  superpowers/specs/2026-05-20-platform-execution-surface-design.md   (design spec)
  superpowers/plans/2026-05-20-platform-execution-surface.md          (implementation plan)
  web-app-as-built-2026-05-21.md                                      (as-built reference)

web/requirements.txt                (modified — added openpyxl, pandas)
```

## Process notes (for future sessions)

1. **Subagent-driven dev worked well.** 5 implementer subagents (one per chunk) each ran 30-90 min. Each was given the full task text + codebase patterns to follow (existing wqa-actions.ts, BrandDnaAssistantDrawer.tsx, etc.). Final code reviewer caught the Consolidate-tab missing-switch bug.
2. **Pre-existing untracked work in `web/` was a hidden landmine.** When I created the feature branch, the previously-untracked `web/` subdirectory restructure traveled with the branch but never got committed. This bit us when git-triggered Vercel builds tried to build from origin/main + branch and couldn't find imports. The team's deploys go via `vercel --prod` from local file state, which works around this, but it means git-triggered CI is unreliable. Fix later: commit the restructure (or align the GitHub source-of-truth with what Vercel builds from).
3. **Vercel Hobby plan caps deployments at 12 functions.** Hit it on first push; consolidated /api/wqa/export and /api/audit/phase-2/export into a single endpoint with `?phase=1|2`. Pro plan removed the cap; user upgraded mid-session.
4. **Multiple env-var gotchas surfaced**:
   - `GCP_SERVICE_ACCOUNT_JSON` for Preview was 5 days stale (prod had been rotated). Fixed by editing the prod entry to apply to Preview too.
   - `APP_WRITE_TOKEN` not set in Preview → server actions failed-closed. Fixed by making `requireWriteToken` fail-open when env unset (matches proxy middleware).
   - `apiBase()` was preferring `VERCEL_PROJECT_PRODUCTION_URL` for previews → preview render fetched the prod API → 401 across env boundary. Fixed to use `VERCEL_URL` for preview/dev VERCEL_ENV.
   - `lib/supabase.ts` was creating the client at module top-level → "supabaseKey is required" race in some server-render contexts. Fixed with lazy Proxy singleton.
5. **Deployment Protection** (Vercel SSO) was blocking server-to-server fetches even when same-origin. Toggled off for previews (user). Should re-enable + use `VERCEL_AUTOMATION_BYPASS_SECRET` long-term.

## Followups (from final code review APPROVE_WITH_FOLLOWUPS)

| # | Item | Severity |
|---|---|---|
| 1 | Python WQA builders duplicated in `web/api/` and `~/agency/delivery/tna/` — extract to shared package | Medium (drift risk) |
| 2 | Audit-mode Status writes `page_execution` instead of `page_check_state` (semantic conflation) | Medium |
| 3 | Drawer "Open full page" link 404s (dedicated route deferred) | Low |
| 4 | History reader placeholder — schema + triggers in place, UI query pending | Low |
| 5 | `vercel.json` `maxDuration: 30` may be tight for large-property xlsx export | Low |
| 6 | Notes-prefix encoding for Remove "Recommended Action" override is fragile | Low |
| 7 | Commit the previously-untracked `web/` subdirectory restructure to git so git-triggered builds work | Low (workaround exists) |
| 8 | Re-enable Vercel Deployment Protection with `VERCEL_AUTOMATION_BYPASS_SECRET` for server-side fetches | Low |

## Production state

- Production deploy: `skyward-platform-6tzeueai3` → aliased to https://skyward-seo-platform.vercel.app
- Vercel plan: Pro (upgraded this session)
- Deployment Protection: disabled for previews; enabled for production via APP_WRITE_TOKEN cookie
- All 3 new Supabase tables live in `seo-platform-dev` project
- 8 TNA properties have data loaded (`buscharter`, `tnabushire`, `bushire-au`, `bushire-nz`, `minibushire`, `minibushire-nz`, `partybusguru`, `transportnetworkaustralia`)

## Links

- Merge commit: `b214f0d`
- PR: https://github.com/skyward-org-platform/skyward-platform-app/pull/1
- As-built doc: `docs/web-app-as-built-2026-05-21.md`
- Spec: `docs/superpowers/specs/2026-05-20-platform-execution-surface-design.md`
- Plan: `docs/superpowers/plans/2026-05-20-platform-execution-surface.md`
