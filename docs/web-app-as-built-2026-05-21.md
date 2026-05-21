---
title: Skyward Platform App — As-Built Description
date: 2026-05-21
branch: feat/execution-surface
status: preview-deployed
---

# Skyward Platform App — As-Built

This document maps every page in the platform app to the source-of-truth documentation it implements, what data it reads, and what's editable. Two columns to scan:
- **Implements**: the SOP / spec / industry doc the page enacts.
- **Data + edits**: where reads come from and what users can write back.

## Architecture (one paragraph)

The platform is a Next.js 16 app deployed on Vercel with a Supabase Postgres backend, plus Python serverless functions for BigQuery and xlsx-export workloads. Two data stores by design (per `README.md` two-store rule): Adam's `skyward-seo-pipeline` writes raw pipeline output to BigQuery `Meta.*` and `SEOPipeline*` datasets; this app consumes that read-only via `lib/wqa.ts` → `api/wqa/pages.py`, and owns Supabase `seo-platform-dev` for everything not in BQ Meta (client/property metadata, brand DNA, page audit overrides, execution state, check state). The app never writes BQ. All app edits land in Supabase and overlay on top of BQ reads.

Reference docs governing this architecture:
- `README.md` — two-store architecture, env vars, repo layout
- `PROJECT_STATE.md` — current state of the prototype
- `web/AGENTS.md` — Next.js 16 cache-components conventions
- `db/supabase/migrations/*` — schema migrations
- `docs/superpowers/specs/2026-05-20-platform-execution-surface-design.md` — the spec for the execution surface added this session
- `docs/superpowers/plans/2026-05-20-platform-execution-surface.md` — the implementation plan

---

## Top-level routes

| Route | Purpose | Status | Pre-existing or this session |
|---|---|---|---|
| `/` | Welcome shell | Live | Pre-existing |
| `/auth` | Sign-in with APP_WRITE_TOKEN cookie | Live | Pre-existing |
| `/clients` | Client list with property roll-up | Live | Pre-existing |
| `/clients/[id]` | One client + its properties | Live | Pre-existing |
| `/activity` | Recent activity feed (Brand DNA edits, WQA decisions) | Live | Pre-existing |
| `/signals` | Cross-property signal triage (snoozed signals workflow) | Live | Pre-existing |
| `/properties/[slug]` | Property overview shell with pipeline strip + tab nav | Live | Pre-existing |
| `/properties/[slug]/brand-dna` | Brand DNA editor (5 sections + 8 subnav pages) | Live | Pre-existing |
| `/properties/[slug]/projects` | Project list scoped to a property | Live | Pre-existing |
| `/properties/[slug]/project-brain` | Project Brain notes / knowledge log | Live | Pre-existing |
| `/properties/[slug]/keywords` | Keyword surface placeholder | Pre-existing | Pre-existing |
| `/properties/[slug]/data-access` | Data source connection status | Live | Pre-existing |
| `/properties/[slug]/pages` | **Phase 1 WQA + Phase 2 Technical Audit unified execution surface** | Live | **This session** |

---

## /properties/[slug]/pages — the execution surface

Single route, two top-level view modes. Sub-tabs within each. Universal URL drawer overlay opens from any row.

**Implements:**
- WQA SOP v5: `~/agency/operations/process-library/1. seo-pipeline/sop/phase-1-wqa/website-quality-audit-sop-v5.md`
- WQA workflow diagram: `~/agency/operations/process-library/1. seo-pipeline/sop/phase-1-wqa/wqa-agentic-workflow-diagram.md`
- WQA v4 check definitions (T1-T20, C1-C20, S1-S12): `sop/phase-1-wqa/website-quality-audit-sop-v4.md` §7.1, §7.2, §7.3
- Phase 2 Technical SEO Workbook SOP: `sop/phase-1b-technical-audit/technical-seo-workbook-sop.md`
- Industry: Transport (schema targets, evidence cluster): `sop/industry/transport-requirements.md`
- Skill: `phase-1-wqa` (workflow + DoD)
- Skill: `phase-2-technical` (workflow + DoD)
- Pipeline structure v2: `~/agency/operations/process-library/1. seo-pipeline/pipeline-structure-v2.md`

**Data + edits:**
- Reads: BQ `wqa_output` (44 cols/URL — signals from GA4, GSC, Ahrefs, DataForSEO, Screaming Frog) via `lib/wqa.ts` → `api/wqa/pages.py`
- Reads: Supabase `wqa_decision` (per-URL action override), `page_execution` (per-URL workflow state), `page_check_state` (per-URL × check workflow state)
- Writes: `wqa_decision`, `page_execution`, `page_check_state` (RLS-gated, history-mirrored via Postgres triggers)
- Export: `/api/wqa/export?slug=X&phase=1` → 12-tab WQA xlsx; `phase=2` → ~14-tab Technical SEO Audit xlsx; both byte-identical to `delivery/tna/build_phase1_wqa.py` / `build_phase2_technical.py` output

### Triage mode (default)

Mirrors the 12 tabs of the WQA workbook per SOP v5 §7.1.

| UI sub-tab | URL param | SOP source | Workbook tab |
|---|---|---|---|
| Overview | `?view=overview` (default) | SOP v5 §7.1 (combined view) | Action Plan + Funnel Summary + Service Summary + Implementation Checklist (workbook tabs 2 + 4 + 5 + 10) |
| All URLs | `?view=triage` | SOP v5 §5 URL Triage | URL Triage (tab 3) — every URL with action, logic, signal columns |
| Optimize | `?action=optimize` | SOP v5 §5.1 Optimize action | URL Optimization (tab 11) — priority-tier sorted |
| Redirect | `?action=redirect` | SOP v5 §5.1 + §5.2 step 4 + §7.1 tab 6 | Redirect Map (tab 6) — grouped by redirect type; editable Destination URL |
| Restore | `?action=restore` | SOP v5 §5.1 Restore action + §7.1 tab 12 | Restore URLs (tab 12) — editable Target H1, Target Title, Target Meta |
| Remove | `?action=remove` | SOP v5 §5.1 Remove action + §7.1 tab 9 | Removal List (tab 9) — editable Recommended Action |
| Consolidate | `?action=consolidate` | SOP v5 §5.1 Consolidate + §7.1 tab 7 | Canonicalization Map (tab 7) — editable Canonical Keeper |
| Evaluate | `?action=evaluate` | SOP v5 §5.1 Evaluate action | URL Triage filtered (review bucket for Checkpoint 1) |
| Investigate | `?action=investigate` | SOP v5 §5.1 Investigate | URL Triage filtered (data-conflict bucket) |
| Canonical Audit | `?action=canonical-audit` | SOP v5 §7.1 tab 8 | Canonical Audit (tab 8) — every Optimize URL with current vs correct canonical |
| Action Legend | `?action=action-legend` | SOP v5 §5.1 | Action Legend (tab 1) — static reference for 10 action types |

**Editable execution state per URL** (writes to `page_execution`):
- Status: To Do / In Progress / Blocked / Done
- Owner (free text — Skyward / Client Dev / Content / specific name)
- Due Date
- Notes
- Target URL (Redirect destination, Canonicalization keeper)
- Target H1, Target Title, Target Meta (Restore content spec — drawer or inline in Restore tab)
- Recommended Action override (Remove tab — encoded in notes for v1)

### Technical Audit mode (`?mode=audit`)

Mirrors the Phase 2 Technical SEO Audit workbook per the Phase 2 SOP. Scope auto-filters to Optimize + Restore URLs (per SOP v4 §7 "Stay URLs only").

| UI sub-tab | URL param | SOP source | Workbook tab |
|---|---|---|---|
| Issue Summary (Overview) | `?mode=audit&view=overview` (default) | Phase 2 SOP §1 Section 1 | Issue Summary (navy tab) — every check with status, severity, URLs affected, action, KW dependency |
| Audit Checklist | `?mode=audit&view=checklist` | Phase 2 SOP §1 Section 1 | Audit Checklist (navy tab) — 44+ checks grouped into TECHNICAL / CONTENT / SITEWIDE |
| Check Detail | `?mode=audit&view=checklist&check=T6` | Per-issue tabs (Phase 2 SOP §1 Section 1) | Per-issue tabs (green / yellow / orange by KW dependency) — affected URLs with editable per-check status |
| URL Priority | `?mode=audit&view=url-priority` | Phase 2 SOP §1 Section 2 | URL Priority (blue tab) — combined view, every URL with consolidated actions across all failing checks |
| Architecture | `?mode=audit&view=architecture` | Phase 2 SOP §1 Section 2 | Website Architecture (blue tab) — depth, orphan, sitemap, action items per URL |
| Schema | `?mode=audit&view=schema` | Phase 2 SOP §1 Section 2 + transport-requirements.md "Schema Targets per Page Type" | Schema Optimization (blue tab) — required schema per category; current schema audit Blocked pending SF |
| Page Speed | `?mode=audit&view=pagespeed` | Phase 2 SOP §1 Section 2 (S5) | Page Speed (blue tab) — Blocked badge; requires SF PageSpeed report |
| Broken Links | `?mode=audit&view=broken` | Phase 2 SOP §1 Section 2 | Broken List (blue tab) — Blocked badge; requires SF inlinks + 4xx report |

**Editable per-check state** (writes to `page_check_state`):
- Status: To Do / In Progress / Blocked / Done
- Notes
- Owner
- `fix_applied_at` (auto-stamped when status flips to Done)

### Universal URL drawer

Opens from any URL row in any tab (Triage or Audit). Single component (`components/UrlDrawer.tsx`). Sections:

| Section | Implements | Content | Editable? |
|---|---|---|---|
| Signals | SOP v5 §2.3 (44-col aggregate) | GA4 sessions / conversions / revenue, GSC impressions / CTR, Ahrefs refs / backlinks, DFS best-keyword + rank + SV, SF word-count / inlinks / depth / status / indexability | Read-only |
| Phase 1 | SOP v5 §5.1 | Effective action chip; data sources line | (chip override in row, drawer is display-only) |
| Phase 2 Checks | Phase 2 SOP + WQA v4 §7 | List of failing checks for this URL, computed via `lib/wqa-checks.ts` (TS port of `delivery/tna/build_phase2_technical.py` predicates) | Per-check status select |
| Execution | This session's spec § "Edit boundaries" | Status, Owner, Due, Target URL, Notes | All editable |
| Restore Spec | SOP v5 §7.1 tab 12 (Restore URLs columns) | Target H1, Title, Meta — shown only when action = Restore | All editable |
| History | (placeholder) | "Coming soon" — history triggers do capture writes; reader pending | Read-only |
| Footer | This session's spec | "Open full page" (deferred), "View in Phase 2" link | — |

### Phase 2 check definitions (lib/wqa-checks.ts)

TypeScript port of the predicates from `delivery/tna/build_phase2_technical.py` t_check / c_check functions. Source-of-truth for the rules is WQA SOP v4 §7.1–§7.3:

**T-checks (T1-T20)** — Technical:
- T1-T3, T8, T10, T13, T16-T18, T20: BLOCKED in v1 (require SF structured-data / GSC URL Inspection / SF inlinks-to-broken-set reports)
- T4 Orphan with value, T5 Under-linked, T6 Buried (depth ≥ 4), T7 Over-linked underperformer, T9 Noindex on valuable, T11 Canonical mismatch, T12 Not in sitemap, T14 JS rendering, T19 IndexNow: ACTIVE — run on every drawer open

**C-checks (C1-C20)** — Content:
- C19 AI content (Ahrefs signal), C20 SERP title mismatch (GSC API): BLOCKED in v1
- C1-C18: ACTIVE

**S-checks (S1-S12)** — Sitewide:
- Surfaced as Manual / Blocked in the Audit Checklist tab (port from Python builder pending)

KW Dependency tag per SOP §1 Section 1.2 — every check carries Fix Now / Fix Now, Revisit / Phase 3 Dependent. Surfaced in the drawer and the URL Priority tab.

---

## Export endpoints

**`GET /api/wqa/export?slug={slug}&phase=1`**

- Implements: WQA SOP v5 §7.1 (12-tab workbook structure)
- Source: live state from BQ wqa_output + Supabase overlays
- Output: `{slug}-Website-Quality-Audit-{YYYY-MM-DD}.xlsx`, byte-identical to `delivery/tna/build_phase1_wqa.py` output
- Tabs: Action Legend, Action Plan, URL Triage, Funnel Summary, Service Summary, Redirect Map, Canonicalization Map, Canonical Audit, Removal List, Implementation Checklist, URL Optimization, Restore URLs

**`GET /api/wqa/export?slug={slug}&phase=2`**

- Implements: Phase 2 Technical SEO Workbook SOP
- Source: same Phase 1 dataframe pipeline + Supabase `page_check_state` overlay + sitewide HTTP probes (optional via `PHASE2_SKIP_SITEWIDE_HTTP=1` env)
- Output: `{slug}-Technical-SEO-Audit-{YYYY-MM-DD}.xlsx`, byte-identical to `delivery/tna/build_phase2_technical.py` output
- Tabs: Issue Summary, Audit Checklist, per-failing-check tabs (variable count), Page Speed (Blocked), Architecture, Schema, Broken List (Blocked), URL Priority, Aggregate
- Both endpoints reuse the `_phase1_builder.py` / `_phase2_builder.py` modules — forks of the standalone scripts in `~/agency/delivery/tna/`

---

## What's deferred (not in v1, per spec §"Out of scope")

These are documented in the spec as explicit non-goals. They're not bugs, they're scoping decisions:

| Deferred | What it would do | Why deferred |
|---|---|---|
| URL detail page (`/properties/[slug]/pages/[urlhash]`) | Dedicated route per URL; sharable link; more screen real estate than drawer | Drawer covers the immediate use case |
| History reader | Drawer "last 10 changes" actually populated from `*_history` tables | Schema + triggers are in place; UI query is the missing piece |
| Cross-URL relationships UI | Visual map of redirect_to / canonical_to / consolidate_into edges | `url_relationship` table exists; surface deferred to v2 |
| New URL planning workflow | Add URLs that don't exist yet (e.g., Restore candidates, content gaps) | Not covered in WQA SOP — would be a content-pipeline feature |
| Re-crawl validation loop | Mark fix done → automatically re-check after next SF crawl | Out of scope; manual today |
| Phase 3 keyword analysis UI | Mirror the Phase 3 Keyword Analysis Workbook surface | Separate spec; `lib/wqa-checks.ts` is the boundary — Fix Now, Revisit + Phase 3 Dependent items go there next |
| S-check live runner | Real-time robots.txt / sitemap / HTTPS / hreflang checks | Python builder does this on export; UI surface pending |
| Page Speed live data | Per-URL CWV from SF PageSpeed integration | Requires pulled SF reports |
| Broken-list live data | Per-URL inlinks → 4xx mapping | Requires pulled SF reports |
| Schema audit | Per-URL current schema validation | Requires SF structured-data report |

## Per-page reference (full alphabetical)

For each route, what it shows and what it implements.

### `/auth`
Sign-in form. Cookie `skw_write` set on successful POST of `APP_WRITE_TOKEN`. Used by `lib/auth.ts` `requireWriteToken` to gate write actions. Preview environments fail-open (env var unset → writes allowed; RLS is the real backstop).

### `/clients`
List of all clients. Reads `client` + roll-ups from `property`. Search + filter UI.

### `/clients/[id]`
One client + its properties with status, pipeline phase, last activity. Reads `client` + `property` + `team_member`.

### `/activity`
Recent activity feed across the app — Brand DNA edits, WQA decisions, property changes. Reads `brand_dna_section_history`, `wqa_decision_history`, `page_execution_history` (new — pending UI query).

### `/signals`
Cross-property signal queue with snoozed-signal workflow. Reads `snoozed_signal` table. Pre-existing.

### `/properties/[slug]`
Property overview. Renders the property header (name, primary_domain, status, pipeline phase strip — Onboard / WQA / Tech SEO / Keywords / Content / Authority / Tracking) + tab nav (Overview / Brand DNA / Pages / Keywords / Projects / Data Access / Project Brain). Pre-existing.

### `/properties/[slug]/brand-dna`
Brand DNA editor with 5 SOP sections (Identity, Voice & Tone, Audiences, Offerings, Proof) plus the 8 subnav pages added in P0 framework. Implements the Brand DNA spec. Pre-existing.

### `/properties/[slug]/projects`
Project list scoped to a property. Pre-existing.

### `/properties/[slug]/project-brain`
Knowledge log + LLM-context-fillable section editor. Pre-existing.

### `/properties/[slug]/keywords`
Keyword surface placeholder (the Phase 3 surface). Pre-existing scaffolding.

### `/properties/[slug]/data-access`
Status of data source connections (GA4, GSC, Ahrefs, DataForSEO, SF, BQ Meta tables). Read from `property_data_access` and BQ Meta. Pre-existing.

### `/properties/[slug]/pages`
**The Phase 1 + Phase 2 execution surface added this session.** See dedicated section above.

---

## Database tables added this session

| Table | Purpose | Migration |
|---|---|---|
| `page_execution` | Per-URL workflow state (status, owner, due, notes, target URL, restore spec) | `20260520_page_execution.sql` |
| `page_execution_history` | Snapshots of OLD rows on UPDATE | same migration |
| `page_check_state` | Per-URL × check workflow state | `20260520_page_check_state.sql` |
| `page_check_state_history` | History mirror | same migration |
| `url_relationship` | Cross-URL edges (redirect_to / canonical_to / consolidate_into / mentioned_in) — table exists, no UI surface | `20260520_url_relationship.sql` |

RLS policies mirror the existing `wqa_decision` pattern: read = authenticated; write = authenticated AND team_member exists+active. Service-role-key writes via server actions bypass RLS but go through `requireWriteToken` instead.

## Known follow-ups (from final code review)

From `docs/superpowers/specs/2026-05-20-platform-execution-surface-design.md` and the final reviewer's APPROVE_WITH_FOLLOWUPS recommendation:

1. **Python builders duplicated** — `web/api/wqa/_phase1_builder.py` and `_phase2_builder.py` are forks of the standalone scripts in `~/agency/delivery/tna/`. Drift risk. Future: extract to a shared package.
2. **Audit-mode Status semantic conflation** — URL Priority / Architecture / Schema Status selects write `page_execution.status` (per-URL workflow) rather than `page_check_state.status` (per-check audit). Spec called for per-check writes in these tabs.
3. **"Open full page" link** in drawer 404s. Either implement the dedicated route or remove the link.
4. **History reader** placeholder in drawer.
5. **`vercel.json` maxDuration: 30s** — large-property xlsx export may time out.
6. **Notes-prefix encoding** for Remove "Recommended Action" override is fragile; a dedicated column would be cleaner.

---

## Documentation index (what governs each surface)

Quick reference of every doc cited above:

| Doc | Path | Governs |
|---|---|---|
| WQA SOP v5 | `~/agency/operations/process-library/1. seo-pipeline/sop/phase-1-wqa/website-quality-audit-sop-v5.md` | Triage actions, workbook 12-tab structure, decision tree |
| WQA SOP v4 (check definitions) | `~/agency/operations/process-library/1. seo-pipeline/sop/phase-1-wqa/website-quality-audit-sop-v4.md` | T1-T20, C1-C20, S1-S12 check definitions and pass/fail criteria |
| WQA Workflow Diagram | `~/agency/operations/process-library/1. seo-pipeline/sop/phase-1-wqa/wqa-agentic-workflow-diagram.md` | 5-step + 2-checkpoint workflow |
| WQA Presentation Deck SOP | `~/agency/operations/process-library/1. seo-pipeline/sop/phase-1-wqa/wqa-presentation-deck-sop.md` | Deck structure (not yet surfaced in app) |
| Phase 2 Technical SEO Workbook SOP | `~/agency/operations/process-library/1. seo-pipeline/sop/phase-1b-technical-audit/technical-seo-workbook-sop.md` | Phase 2 workbook tab structure, tab colors, KW-dependency classification |
| Phase 2 Technical SEO Deck SOP | `~/agency/operations/process-library/1. seo-pipeline/sop/phase-1b-technical-audit/technical-seo-deck-sop.md` | Phase 2 deck (not yet surfaced) |
| Industry Requirements: Transport | `~/agency/operations/process-library/1. seo-pipeline/sop/industry/transport-requirements.md` | Schema targets per page category, evidence cluster, internal linking |
| Pipeline structure v2 | `~/agency/operations/process-library/1. seo-pipeline/pipeline-structure-v2.md` | Phase definitions, DoD per phase, handoff contracts |
| Adam's Getting Started Guide | `~/agency/operations/process-library/Adam Files/Paul's Getting Started Guide.md` | `skyward-seo-pipeline` package setup, BQ env config |
| Platform App README | `web/README.md` (and root `README.md`) | Two-store architecture, env vars, repo layout |
| Platform App AGENTS.md | `web/AGENTS.md` | Next.js 16 conventions |
| Platform Design Spec (this session) | `docs/superpowers/specs/2026-05-20-platform-execution-surface-design.md` | The architecture you approved for /pages |
| Platform Implementation Plan (this session) | `docs/superpowers/plans/2026-05-20-platform-execution-surface.md` | 25+ task plan executed by subagents |

---

## Live URLs (preview)

Current preview deployment with the execution surface live:

🔗 **https://skyward-platform-n6jinacp2-skywards-projects-60431a3a.vercel.app**

Production stays untouched at `https://skyward-seo-platform.vercel.app` until you merge / promote `feat/execution-surface`.
