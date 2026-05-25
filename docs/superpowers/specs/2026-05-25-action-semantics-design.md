---
title: Pages — Action Semantics Overhaul (P2)
status: approved
version: v0.1 | 2026-05-25
audience: skyward-platform-app contributors
parent: Pages-surface overhaul (P1-P6)
---

# Action Semantics Overhaul

Replace the current Pages action set + lifecycle with a cleaner noun-decision model + separate status workflow. Foundational sub-project; downstream sub-projects (P1 inline edit + audit log, P3 columns + ergonomics, P5 redirect tab, P6 action plan consolidation) all depend on this landing first.

## Goals

- Every URL has exactly one action (a strategic decision) and one status (a work state). They evolve independently.
- All URLs get triaged — no exclusion bucket. System URLs get an explicit Keep + logic_code.
- Operator can override the pipeline's auto-derived action + target URL without losing the pipeline's recommendation.
- Re-running the Phase 1 WQA skill is safe — it refreshes derived fields, preserves all operator decisions + work state.
- History trigger captures every operator-driven change; pipeline-derived changes don't pollute history.
- Drift detection (deferred to I1) has the schema it needs from day one.

## Non-goals (this spec)

- Bulk-edit + multi-row select (P1)
- Column visibility toggle / per-column sort + filter / external-link icon / URL truncation fix (P3)
- "WQA Triage Funnel" vs top-tabs IA reshuffle (P4)
- Drift detection cron implementation (I1)
- Per-URL time-series sessions / backlinks / rank (I2)
- ClickUp task push (I3)
- Cloudflare / MCP execution of redirects (I4)
- Drawer "Open full page" 404 fix + history reader stub (B1)
- Refresh-button-on-drawer signals re-check (I1-adjacent)

## Architecture

**Read path:**
- App reads from Supabase `wqa_decision` table (existing) extended with new columns (see Data Model).
- Displayed action = `COALESCE(action_override, action)`. Displayed target = `COALESCE(target_url_override, target_url)`.

**Write path:**
- Pipeline writes (`build_phase1_wqa.py` and sibling client builders): `action`, `logic_code`, `target_url`, `last_refreshed_at`.
- Operator writes (UI server actions): `action_override`, `status`, `logic_notes`, `target_url_override`.
- Pipeline never touches operator columns. Operator can clear an override (reverts to pipeline value).

**Skill responsibility:**
- The Phase 1 WQA skill (`build_phase1_wqa.py` in `~/agency/delivery/tna/`, plus any sibling per-client builders) is the sole writer of pipeline-derived columns. Other skills (`/seo-audit`, `/competitor-analysis`) don't write `wqa_decision` rows.

**Adam's territory unchanged:**
- BigQuery `Meta.*` tables + the upstream `aggregate_export.xlsx` (SF / GA4 / GSC / Ahrefs / DFS data per URL) remain untouched.
- `skyward-common` Python package unchanged.
- The action + logic mapping happens entirely in Skyward-owned scripts (`build_phase1_wqa.py`).

## Action set

7 actions, fixed enum:

| Action | Color (v2 design system) | Meaning |
|---|---|---|
| Optimize | sky | Keep this page + actively improve it |
| Restore | emerald | Broken or 4xx; bring back the page |
| Redirect | amber | 301 to a target URL |
| Consolidate | violet | Canonical-map to a primary URL |
| Remove | rose | Delete or noindex |
| Keep | slate | Stay; no work needed (covers strategic Keep AND system URLs) |
| Investigate | neutral | Needs human judgment; logic_code explains why |

**Removed from current set:**
- `Evaluate` → folded into `Investigate` (logic_code captures why)
- `Review` → folded into `Investigate`
- `Undecided` → folded into `Investigate` with `logic_code='human_judgment'`
- `No action` → folded into `Keep` with `logic_code='system_url'`
- `Optimize (revenue-critical)` etc. flavors → single `Optimize` with `logic_code` capturing flavor

## Status workflow

Universal 4-state, same for every action:

| Status | Color | Manually settable | Semantics |
|---|---|---|---|
| Open | slate (with-dot pill) | ✓ | Decided but no work yet |
| In Progress | indigo | ✓ | Actively being worked |
| Done | emerald | ✓ (or auto when verify passes) | Work shipped + monitored |
| Drifted | rose | **AUTO ONLY** | Was Done, drift detection caught a regression |

**Valid transitions:**
- Open → In Progress (operator starts work)
- In Progress → Open (operator pauses)
- In Progress → Done (operator marks complete, or auto-mark when "Verify" button passes for Redirect / Consolidate)
- Done → Open (operator decides to re-do)
- Done → Drifted (auto only — drift detection cron when it lands; no manual transition)
- Drifted → Open (operator acknowledges + decides to re-implement)
- Drifted → Done (operator re-implemented + re-verified)

**Status for Keep + Investigate:**
- Keep is always Open (no work to do; the decision IS the action). Status field hidden in UI for Keep rows.
- Investigate is always Open (the action means "decision pending"). Status field hidden in UI for Investigate rows.

## Logic codes

Closed enum, ~16 codes. Pipeline-assigned. Operator can't change `logic_code` directly (they can override the action via `action_override` if they disagree).

| Code | Typical action | When pipeline assigns |
|---|---|---|
| `revenue_critical` | Optimize | High traffic + high conversion value (GA4 + GSC signals) |
| `page_1_protect` | Optimize | Currently ranking position 1-10 in primary country |
| `striking_distance` | Optimize | Currently ranking position 11-20 |
| `has_visibility` | Optimize | Some impressions / clicks but neither top 20 nor revenue |
| `utility_light_touch` | Optimize | Low-priority page, kept in the working set |
| `404_with_inbound_traffic` | Restore | SF returned 4xx + GA4/GSC shows historical traffic |
| `404_no_value` | Remove | SF returned 4xx + no historical signal |
| `5xx_server_error` | Restore | SF returned 5xx (server-side problem, not content) |
| `redirect_to_relevant` | Redirect | SF found 3xx with relevant destination |
| `non_primary_variant` | Consolidate | Canonical tag points elsewhere; this is a variant |
| `duplicate_content` | Consolidate | Near-duplicate detected via content similarity |
| `internal_links_no_external_signals` | Investigate | Linked internally but no GA4/GSC/Ahrefs signal |
| `data_conflict` | Investigate | Sources disagree (GA4 vs GSC vs Ahrefs) |
| `human_judgment` | Investigate | Pipeline flagged for explicit operator review |
| `system_url` | Keep | Fragment / param / utility URL; leave as is |
| `legitimate_keep` | Keep | Strategic decision to leave alone |

**logic_notes** — free-text, operator-editable, drawer-only. Used to add context, explain overrides, record client conversations, etc.

## Data model

Modifies the existing `wqa_decision` table (or whichever Supabase table is the per-URL source of truth today). Single migration: `db/supabase/migrations/20260525_action_semantics.sql`.

### New columns

```sql
-- Pipeline-derived (auto-assigned by build_phase1_wqa.py)
action                  text NOT NULL
                         check (action in (
                           'Optimize','Restore','Redirect','Consolidate',
                           'Remove','Keep','Investigate'
                         ))
logic_code              text NOT NULL
                         check (logic_code in (
                           'revenue_critical','page_1_protect','striking_distance',
                           'has_visibility','utility_light_touch',
                           '404_with_inbound_traffic','404_no_value','5xx_server_error',
                           'redirect_to_relevant',
                           'non_primary_variant','duplicate_content',
                           'internal_links_no_external_signals','data_conflict','human_judgment',
                           'system_url','legitimate_keep'
                         ))
target_url              text  -- only set for Redirect + Consolidate
last_refreshed_at       timestamptz NOT NULL default now()

-- Operator overrides (UI-written, never touched by pipeline)
action_override         text
                         check (action_override is null or action_override in (
                           'Optimize','Restore','Redirect','Consolidate',
                           'Remove','Keep','Investigate'
                         ))
target_url_override     text

-- Status workflow (operator-driven except Drifted)
status                  text NOT NULL default 'Open'
                         check (status in ('Open','In Progress','Done','Drifted'))

-- Free-text operator context
logic_notes             text

-- Drift detection support (cron lands in I1; schema ready now)
last_implementation_check_at  timestamptz
drift_reason            text  -- only set when status='Drifted'

-- Audit
updated_by              text NOT NULL
updated_at              timestamptz NOT NULL default now()
```

### Indexes

```sql
create index if not exists idx_wqa_decision_property_action
  on wqa_decision (property_id, COALESCE(action_override, action));
create index if not exists idx_wqa_decision_property_status
  on wqa_decision (property_id, status);
create index if not exists idx_wqa_decision_property_logic
  on wqa_decision (property_id, logic_code);
create index if not exists idx_wqa_decision_drifted
  on wqa_decision (property_id) where status = 'Drifted';
```

### History trigger

Fires `BEFORE UPDATE` on these operator-editable fields only:
- `action_override`
- `status`
- `logic_notes`
- `target_url_override`
- `drift_reason`

Does NOT fire on `action`, `logic_code`, `target_url`, `last_refreshed_at`, `last_implementation_check_at` — these are pipeline / drift-check writes, audited via the eventual `skill_invocation` table (not in this spec) instead of history rows.

History mirror table `wqa_decision_history` (or extends existing one if present) gets:
```
wqa_decision_id   uuid not null
property_id       uuid not null
url               text not null
action_override   text
status            text
logic_notes       text
target_url_override text
drift_reason      text
updated_by        text not null
snapshotted_at    timestamptz not null default now()
```

## Migration

Single migration applies the schema + backfills existing rows.

**Action remapping** (from old to new value sets):

| Old action value | New `action` | New `logic_code` |
|---|---|---|
| Optimize (revenue-critical) | Optimize | revenue_critical |
| Optimize (page 1 - protect/improve) | Optimize | page_1_protect |
| Optimize (striking distance) | Optimize | striking_distance |
| Optimize (has visibility) | Optimize | has_visibility |
| Optimize (utility - light touch) | Optimize | utility_light_touch |
| Restore (200) | Restore | 404_with_inbound_traffic |
| Restore (fix server error) | Restore | 5xx_server_error |
| Redirect | Redirect | redirect_to_relevant |
| Consolidate | Consolidate | non_primary_variant |
| Remove | Remove | 404_no_value |
| Keep | Keep | legitimate_keep |
| Investigate | Investigate | human_judgment |
| Evaluate | Investigate | internal_links_no_external_signals |
| Review | Investigate | data_conflict |
| Undecided | Investigate | human_judgment |
| No action | Keep | system_url |
| Non-addressable | Keep | system_url |

**Status seeding:**
- All migrated rows start with `status = 'Open'`.
- EXCEPT: for Redirect rows where a live HTTP check confirms the 3xx is in place + the destination returns 200 → seed `status = 'Done'` + `last_implementation_check_at = now()`.
- EXCEPT: for Consolidate rows where the canonical tag is already in place → seed `status = 'Done'`. (Check at migration time.)

**logic_notes:** preserved if any existing free-text "notes" field is present on the source row; otherwise null.

**Backward compatibility:**
- Migration runs in a single transaction.
- App code deployed atomically (no half-state where the old enum is invalid).
- `build_phase1_wqa.py` updated in lockstep — emits new values starting the same day the migration lands.
- Old action values in any external read-only source (BQ Meta, exported CSVs) untouched; mapping happens at read time when the pipeline ingests.

## UI changes (Pages surface — scope limited to this sub-project)

### Action chip — inline editable

Replaces the current Action chip in the Pages table.
- Dropdown with 7 options.
- Color tokens per the table above.
- Click → opens dropdown without firing the row's click handler (stopPropagation).
- Selecting a different value writes `action_override` (or clears it if returning to the pipeline value).
- If `action_override IS NOT NULL` and differs from `action`: chip shows a small "override" indicator (1px ring or muted dot) so the operator sees their override is active.

### Status chip — inline editable

New column between Action and Logic.
- 4-state dropdown: Open / In Progress / Done.
- `Drifted` value present in the dropdown but disabled (only auto-settable).
- Hidden for Keep + Investigate rows (no status semantics for those actions).

### Logic code — inline visible + filter

New column between Status and the URL detail.
- Read-only on the row (monospace pill: `revenue_critical`, `data_conflict`, etc.).
- Hover tooltip explains the code.
- Filter chip strip at top of the table gets a "Logic" multi-select chip group. URL-persisted via `?logic=code1,code2`.

### Drawer additions

In the row drawer (existing `UrlDrawer` polymorphism, URL subject):

**Triage logic section** (new):
- Logic code (read-only) with tooltip
- Logic notes (editable textarea)
- "Pipeline said" indicator if `action_override IS NOT NULL`: shows the pipeline's `action` value muted next to the override

**Target URL section** (new — only for Redirect + Consolidate):
- Target URL input (editable, writes to `target_url_override`)
- Pipeline-suggested target (read-only line beneath, if differs)
- "Verify" button: live HTTP check. Returns:
  - `200 OK → final URL` (success; offers to flip status → Done)
  - `3xx chain (N hops) → final URL` (warning; chain detected)
  - `4xx / 5xx` (failure; status stays Open or In Progress)

**Drift indicator** (new — only when `status='Drifted'`):
- Rose banner at top of drawer showing `drift_reason`
- "Acknowledge" button → resets status to Open + clears drift_reason

### Filter chip strip

```
Action:  [ Optimize ] [ Restore ] [ Redirect ] [ Consolidate ] [ Remove ] [ Keep ] [ Investigate ]
Status:  [ Open ] [ In Progress ] [ Done ] [ Drifted ]
Logic:   [ Show codes ▾ ]   (multi-select dropdown)
Override: [ All ] [ Pipeline-only ] [ Operator overrode ]
```

URL-persisted: `?action=`, `?status=`, `?logic=`, `?override=`. Multi-select per group. Default state: all chips selected (no filter applied).

### Investigate tab

Currently shows 3 sub-buckets (Investigate / Evaluate / Review) — merges into one Investigate tab. Inside Investigate, logic_code becomes the secondary axis (count breakdown by code: "data_conflict 12 · human_judgment 8 · no_external_signals 4").

### Consolidate tab

Already exists as `ConsolidateTab.tsx` (built earlier this session). After migration, gets significantly more rows (non-primary variants previously bucketed as Redirect move here). Same column shape as Redirect tab: source URL + target URL + Verify button.

## Server actions

File: `web/app/properties/[slug]/pages/wqa-actions.ts` (extends existing).

```typescript
setAction(slug, urlOrId, action)               // writes action_override
setStatus(slug, urlOrId, status)               // Open / In Progress / Done only
clearDrift(slug, urlOrId)                      // status='Drifted' → 'Open', drift_reason=null
setLogicNotes(slug, urlOrId, notes)
setTargetUrl(slug, urlOrId, target)            // writes target_url_override
verifyTargetUrl(slug, urlOrId)                 // live HTTP check; if success, optionally flip status
clearActionOverride(slug, urlOrId)             // returns to pipeline's action
clearTargetUrlOverride(slug, urlOrId)
```

All gated by `requireWriteToken`. History trigger fires automatically on the relevant columns.

`verifyTargetUrl` is a Vercel route (Node, not Python) — does a HEAD request to the source URL, follows redirects, returns final status + chain length.

## Skill responsibility

**The Phase 1 WQA skill** (`build_phase1_wqa.py` + per-client siblings) is updated to:

1. Emit new action enum (7 values) instead of the old flavored set.
2. Emit `logic_code` per row per the closed enum.
3. Emit `target_url` for Redirect + Consolidate rows.
4. Stamp `last_refreshed_at = now()`.
5. Override-preserve on re-run: if a row has `action_override` set, the pipeline writes the new `action` value but leaves the override alone. Operator sees the divergence in the drawer.

**Other skills don't touch wqa_decision** — they read it (Phase 3 reads URLs by action; Phase 4 reads Optimize + Restore; Phase 5 reads URLs by status for monitoring).

**Skill invocation logging** — when the Phase 1 WQA skill runs against a property, it logs a row to the future `skill_invocation` table (out of scope here; lands with Skills surface).

## Telemetry that becomes valuable once this lands

(Not built in this sub-project; schema supports it from day one.)

- Count of rows where `action_override IS NOT NULL` per property → pipeline-vs-operator disagreement rate. High → SOP rule needs tuning.
- Time from Open → Done per action type per property → execution velocity.
- Drift rate (Done → Drifted per month) → implementation hygiene per property.
- Distribution of logic_codes per property → triage shape.

## Out of scope (deferred to other P-sub-projects)

| Item | Sub-project |
|---|---|
| Bulk-edit + multi-row select | P1 |
| Audit log reader in drawer (uses the history trigger this spec adds) | P1 |
| Column visibility toggle | P3 |
| Per-column sort + filter inputs | P3 |
| External-link icon on URLs | P3 |
| Full-URL handling in drawer (no truncation) | P3 |
| "WQA Triage Funnel" vs top-tabs IA fix | P4 |
| Implementation status detail UI on Redirect tab (% implemented summary) | P5 |
| Action Plan + Implementation Checklist consolidation | P6 |
| Drift detection cron implementation | I1 |
| Per-URL time series (sessions, backlinks, rank over time) | I2 |
| ClickUp task push | I3 |
| Cloudflare / MCP redirect execution | I4 |
| Drawer "Open full page" 404 fix | B1 |
| Drawer history reader stub | B1 |

## References

- Pages-surface feedback decomposition: `session-notes/2026-05-25-pages-feedback-decomposition.md` (to be written when the plan lands)
- Phase 1 WQA skill: `~/.claude/skills/phase-1-wqa/SKILL.md`
- Phase 1 WQA pipeline: `~/agency/delivery/tna/build_phase1_wqa.py`
- Existing decision table + history pattern: `db/supabase/migrations/20260520_wqa_decision.sql`
- Phase 3 override-preservation precedent: `docs/superpowers/specs/2026-05-22-phase3-surface-design.md` § "Override preservation"
- Phase 5 override-preservation precedent: `docs/superpowers/specs/2026-05-22-phase5-surface-design.md` § "Refresh path"
