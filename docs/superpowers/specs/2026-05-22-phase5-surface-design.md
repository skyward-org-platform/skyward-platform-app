---
title: Phase 5 Authority Surface — design spec
status: approved
version: v0.1 | 2026-05-22
audience: skyward-platform-app contributors
---

# Phase 5 Surface — /properties/[slug]/authority

Monitoring + alerts dashboard for the link-building campaign. Surfaces DR / ref domain / backlink / traffic trends, flags spam waves and negative SEO, classifies referring domains as Quality / Spam / Disavow / Pending, exports a disavow.txt blob.

## Goals

- Make the Phase 5 audit ongoing instead of one-shot.
- On-demand refresh via a Python endpoint calling DataForSEO Backlinks API. **First-class pipeline-trigger infrastructure** that unblocks Phase 3 `runRecluster` and Phase 4 `runRecomputeContentPlan`.
- Computed alerts at read time (spam wave, DR drop, stale disavow, new quality acquisitions).
- User classification of referring domains, with history.
- One-way disavow.txt export from Supabase state.
- Preserve markdown audit docs as browsable history.

## Non-goals (this spec)

- Cron-based daily/weekly automatic refresh — on-demand only.
- Manual entry of acquired links before DFS detection — rare enough to skip; DFS will pick them up.
- Round-trip disavow.txt upload + diff — one-way export only.
- Anchor text drift tracking — Tier 2.
- Competitor comparison view — single-property only for v1.
- Phase 3 / Phase 4 recompute button wiring — this spec unblocks the pattern; wiring is followup.
- ClickUp push of disavow / outreach tasks — manual for v1.

## Architecture

**Read path:**
- 4 Supabase tables: `site_snapshot`, `referring_domain`, `disavow_entry`, `audit_doc`.
- UI reads from these tables; no live DataForSEO / Ahrefs calls on page load.

**Refresh path:**
- "Refresh data" button on Overview → `runAuthorityRefresh` server action → calls new Vercel Python endpoint `web/api/authority/refresh.py`.
- The Python endpoint calls DataForSEO Backlinks API:
  - `backlinks_summary` (gets DR / ref domain count / live backlinks)
  - `backlinks_referring_domains` (latest ref domains, last 1000 by first_seen desc)
- Writes a new `site_snapshot` row + upserts `referring_domain` rows (preserving user `quality` / `notes` on existing rows; the `last_refreshed_at` timestamp updates without firing the history trigger).
- Cost per refresh: ~$0.20-0.50 in DFS units depending on backlink profile size.
- `runAuthorityRefresh` is **the first proper pipeline-trigger endpoint in the platform**. Same pattern can wire Phase 3 `runRecluster` and Phase 4 `runRecomputeContentPlan` in followups.

**Compute boundary:**
- Alerts computed server-side at page-load. No `alert` table.
- Alert rules:
  - **Spam wave**: ≥10 new `referring_domain` rows with `detected_spam=true` in last 14 days.
  - **DR drop**: most-recent `site_snapshot.domain_rating` < 90% of average over previous 90 days.
  - **Stale disavow**: any `referring_domain.quality='Disavow'` rows exist where the corresponding `disavow_entry.status='Pending'` AND `added_at < now() - 14 days`. Or: the most recent `disavow_entry.status='In File'` row's `updated_at < now() - 60 days`.
  - **New quality acquisitions**: ≥3 `referring_domain` rows with `quality='Quality'` AND `first_seen > now() - 30 days`.

**Data source:**
- DataForSEO Backlinks API for live data (we have credentials in `.env`; no AHREFS_API_KEY).
- Manual Ahrefs MCP audits remain captured as markdown documents (rendered in the Audits tab from `audit_doc.markdown` if inlined, or linked to `audit_doc.filepath`).

**Property scope:**
- v1 backfills all 8 TNA properties via `delivery/tna/phase5_backfill_supabase.py` (one refresh per site).
- Schema property-scoped from day one.

## UI structure

Single route: `/properties/[slug]/authority`. New top-level tab in the property nav.

**3 tabs**, flat row, URL param `?view=`:

| Tab | URL param | Default? |
|---|---|---|
| Overview | `overview` | ✓ |
| Referring Domains | `refdomains` | |
| Audits | `audits` | |

### Overview tab

Top of page: a **"Refresh data" button** + last-refresh timestamp (from latest `site_snapshot.snapshotted_at`).

4-up stat tile row from latest `site_snapshot`:
- Domain Rating + delta vs baseline (oldest snapshot newer than 30 days ago, or oldest snapshot overall)
- Referring Domains + delta
- Organic Traffic + % delta
- Organic Value (USD/mo)

Delta arrows: green ▲ up, red ▼ down. tabular-nums.

**Alerts row** (up to 4 cards):
- Spam wave (rose) — "N new spam refdomains in last 14 days"
- Stale disavow (amber) — "Disavow file last updated N days ago"
- DR drop (amber) — "DR dropped from X → Y in last 7 days"
- New quality acquisitions (emerald) — "N new high-quality acquisitions in last 30 days"

Alerts not rendered when their condition isn't met. No persistent acknowledge state in v1 (client-side dismiss only; refreshes on reload).

**Recent acquisitions mini-table** — top 5 `referring_domain` rows where `quality='Quality'` ORDER BY `first_seen DESC`. Columns: domain, DR, traffic_domain, first_seen.

**DR trend mini-chart** — SVG line of `domain_rating` over last 90 days from `site_snapshot`. No charting library; ~50 lines of SVG.

### Referring Domains tab

Counter strip at top, click-to-filter (URL-persisted via `?quality=`):

```
[All N]  [Pending N]  [Quality N]  [Spam N]  [Disavow N]
```

Per-column filter row under headers: domain (substring), DR (numeric ≥/≤), traffic_domain (≥), first_seen (date range), quality (select).

Table columns (8 inline + Open):

| Column | Editable inline? | Type |
|---|---|---|
| Domain | — | mono text |
| DR | — | tabular-nums |
| Traffic (domain) | — | tabular-nums |
| First Seen | — | relative date |
| Dofollow Links | — | tabular-nums |
| Detected Spam | — | small rose flag if true |
| Quality | ✓ | action chip (Quality / Spam / Pending / Disavow) |
| Notes (preview) | — | drawer-editable; first 60 chars |
| Open | — | button → drawer |

Pagination 100/page.

Click row → RefDomain drawer.

### Audits tab

List of `audit_doc` rows ordered by `generated_at DESC`. Each renders as a card:
- Title
- Generated date + generated_by
- "Open markdown" button — opens modal rendering `markdown` field if present; else opens `filepath` link
- "Copy link" button — copies the agency-repo relative path

No editing in v1. Future Tier 2: in-app audit composer.

### Universal drawer — RefDomain subject

`DrawerSubject` discriminated union extended:

```typescript
type DrawerSubject =
  | { kind: 'url'; ... }
  | { kind: 'keyword'; ... }
  | { kind: 'cluster'; ... }
  | { kind: 'content'; ... }
  | { kind: 'refdomain'; row: ReferringDomainRow; disavow: DisavowEntryRow | null };
```

RefDomain drawer sections (top to bottom):

1. **Header** — domain (mono) + quality chip + external-link icon
2. **Metrics** — DR, traffic_domain, dofollow_links, links_to_target, first_seen, last_seen, detected_spam flag
3. **Editors** — quality select, notes textarea
4. **Disavow** — if quality=Disavow, show `disavow_entry` status (Pending / In File / Confirmed) + reason input + edit. Else "Mark for disavow" button creates a `disavow_entry`.
5. **History** — recent quality + notes edits from `referring_domain_history`

## Data model

Four new Supabase tables + two history mirrors. RLS mirrors existing `wqa_decision` pattern (read = authenticated; write = authenticated + active team_member).

### `site_snapshot` (append-only)

```
id                    uuid primary key default gen_random_uuid()
property_id           uuid not null references property(id) on delete cascade
snapshotted_at        timestamptz not null default now()
domain_rating         numeric
ahrefs_rank           bigint  -- legacy column name, holds whatever rank field the source provides
live_backlinks        int
live_refdomains       int
organic_keywords      int
organic_keywords_top3 int
organic_traffic       int
organic_value_cents   int
source                text not null default 'dataforseo'
                       check (source in ('dataforseo','ahrefs','manual'))
fetched_by            text not null
```

Indexes: `(property_id, snapshotted_at DESC)`.

Append-only; no history mirror.

### `referring_domain`

```
id                    uuid primary key default gen_random_uuid()
property_id           uuid not null references property(id) on delete cascade
domain                text not null
first_seen            timestamptz
last_seen             timestamptz
domain_rating         numeric
traffic_domain        int
dofollow_links        int default 0
links_to_target       int default 1
detected_spam         boolean default false
quality               text default 'Pending'
                       check (quality in ('Quality','Spam','Pending','Disavow'))
notes                 text
last_refreshed_at     timestamptz
updated_by            text not null
updated_at            timestamptz not null default now()
```

Indexes: `UNIQUE (property_id, domain)`, `(property_id, quality)`, `(property_id, first_seen DESC)`.

History mirror `referring_domain_history` (mirrors columns). Trigger fires `BEFORE UPDATE` when `quality` or `notes` changes (user edits). NOT when pipeline updates `last_refreshed_at` / `dofollow_links` / `traffic_domain` / etc.

### `disavow_entry`

```
id              uuid primary key default gen_random_uuid()
property_id     uuid not null references property(id) on delete cascade
domain          text not null
reason          text
status          text not null default 'Pending'
                 check (status in ('Pending','In File','Confirmed by GSC'))
added_at        timestamptz not null default now()
added_by        text not null
notes           text
updated_at      timestamptz not null default now()
```

Indexes: `UNIQUE (property_id, domain)`, `(property_id, status)`.

History mirror `disavow_entry_history`. Trigger on `status` change.

### `audit_doc`

```
id              uuid primary key default gen_random_uuid()
property_id     uuid not null references property(id) on delete cascade
title           text not null
filepath        text          -- relative to agency repo
markdown        text          -- optional inlined content
generated_at    timestamptz not null
generated_by    text
notes           text
```

Indexes: `(property_id, generated_at DESC)`.

Append-only by convention; no trigger.

## Editable surface map

| Surface | Edit | Writes | Pattern |
|---|---|---|---|
| RefDomains row | Quality (Quality / Spam / Pending / Disavow) | `referring_domain.quality` | Action chip |
| RefDomain drawer | Notes | `referring_domain.notes` | Textarea |
| RefDomain drawer | Mark for disavow | inserts `disavow_entry` + sets `quality='Disavow'` | Button |
| RefDomain drawer | Disavow status | `disavow_entry.status` | Select (Pending / In File / Confirmed by GSC) |
| RefDomain drawer | Disavow reason | `disavow_entry.reason` | Text input |
| Overview tab | Refresh data | triggers `runAuthorityRefresh` | Button |
| Audits tab | (no edits in v1) | — | — |

## Server actions

File: `web/app/properties/[slug]/authority/actions.ts`

```typescript
setDomainQuality(slug, domain, quality)
setDomainNotes(slug, domain, notes)
addToDisavow(slug, domain, reason)
setDisavowStatus(slug, domain, status)
setDisavowReason(slug, domain, reason)
runAuthorityRefresh(slug)        // calls /api/authority/refresh
exportDisavowTxt(slug)            // returns text/plain disavow file
```

7 server actions. All gated by `requireWriteToken`.

## Vercel Python endpoint

`web/api/authority/refresh.py`. Accepts `{slug}`. Calls DataForSEO Backlinks API:

- `backlinks_summary` for the property — DR, total ref domains, total backlinks, organic metrics
- `backlinks_referring_domains` (limit 1000, ordered by first_seen DESC) — populates `referring_domain` upserts
- Optional second call to `backlinks_referring_domains` with `first_seen >= last_refreshed_at` filter to detect new domains since last refresh (Tier 2 optimization; v1 does a full refresh each time)

Writes:
- One new `site_snapshot` row with all metrics
- Upserts to `referring_domain` by `(property_id, domain)`. **Preserves user-edited `quality` and `notes`**. Updates `last_seen`, `last_refreshed_at`, `dofollow_links`, `traffic_domain`, `detected_spam`.

Returns the new snapshot for client-side hydration.

Cost: ~$0.20-0.50 per refresh per site (DFS Backlinks pricing).

## Phasing

5 chunks. Subagent-driven dev pattern.

| # | Chunk | Time | Output |
|---|---|---|---|
| 1 | Schema migrations + lib | ~half day | 4 tables + 2 history mirrors + 2 triggers + RLS. `web/lib/authority.ts`. |
| 2 | DFS API endpoint + refresh action + backfill | ~half day | `web/api/authority/refresh.py` + `runAuthorityRefresh` action + `delivery/tna/phase5_backfill_supabase.py` populating all 8 TNA properties (~$2-4 DFS). |
| 3 | Read-only /authority surface | ~half day | Route + 3-tab nav + Overview (stat tiles + alerts + recent acquisitions + DR trend SVG) + RefDomains read-only table + Audits list. 2 existing audit docs inlined. |
| 4 | Inline edits + drawer | ~half day | Quality chip inline + RefDomain drawer (5th polymorphic variant) + addToDisavow + setDomainNotes wired. |
| 5 | Disavow export + production merge | ~half day | `exportDisavowTxt` action + PR + merge + `vercel --prod`. |

**Total: ~2.5 days focused work.**

## References

- Phase 5 SOP skill: `~/.claude/skills/phase-5-authority/SKILL.md`
- Link Building Playbook: `~/agency/operations/process-library/3. outreach-pipeline/link-building/playbook/`
- Phase 5 audit (buscharter, fresh): `~/agency/delivery/tna/buscharter/link-building/link-build-strategy/buscharter-link-audit-2026-05-22.md`
- Phase 5 portfolio audit: `~/agency/delivery/tna/seo/link-building-campaign/tna-portfolio-link-audit-2026-05-22.md`
- Phase 4 surface design (precedent): `docs/superpowers/specs/2026-05-22-phase4-surface-design.md`
- DataForSEO Backlinks API: https://docs.dataforseo.com/v3/backlinks/
