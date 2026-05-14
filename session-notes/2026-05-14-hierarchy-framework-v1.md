---
title: Hierarchy framework v1 — client → property → project
date: 2026-05-14
status: schema applied; UI + seed work in progress
supersedes_section_of: session-notes/2026-05-14-admin-merge-plan.md
---

# Hierarchy framework v1

## Conceptual model

```
client            commercial entity (SOW signer)
 ├── property     operational unit — brand + website + state
 │    ├── pages, brand_dna_sections, etc.
 │    └── (optional) parent_property — inheritance link
 │
 ├── project      playbook execution — channel-scoped work
 │    ├── type   seo | paid_search | paid_social
 │    └── property_ids[] — usually one, sometimes many
 │
 ├── sow          commercial wrapper (lives in Scope Builder)
 │    └── covers 1+ projects across 1+ properties
 │
 └── related_clients[]  — affinity, NOT parent-child
                          (franchisor↔franchisee, holding↔sub, etc.)
```

## What each thing is, one line

- **Client** — the legal entity that signs SOWs. `Tacoma Legacy Partners, LLC` is a client.
- **Property** — brand + website + pipeline state. `kitchenguard.com/provo` is a property.
- **Project** — a playbook running in a specific channel, attached to one or more properties. `SEO on phil-lasry` is a project.
- **SOW** — a contract that funds projects. Lives in Scope Builder; surfaced read-only here later.
- **Related clients** — affinity expressed as a soft list, not a hierarchy.

## Project types (v1)

| Type | Includes | Doesn't include |
|---|---|---|
| `seo` | Technical, keyword research, content production, authority building, internal linking, local SEO. All 7 pipeline phases (P0-P6). | Anything paid. |
| `paid_search` | Google Ads, Bing Ads, search-engine paid placements. | Organic. |
| `paid_social` | Meta, LinkedIn, TikTok paid advertising. | Organic social. |

**Not built yet:** `local_seo` as a separate type — folded into `seo` until a pure-local engagement appears. Then we add it.

**Future types** (parking lot): `email`, `web_dev`, `consulting`, etc. Add when first engagement appears.

## Schema changes — APPLIED 2026-05-14

### `property` table — additions

Applied via migration `20260514110000_property_hierarchy.sql`.

| Field | Type | Purpose |
|---|---|---|
| `url_prefix` | text, nullable | Subpath when two properties share a domain. `null` = root. Example: KG Corporate `(kitchenguard.com, null)` vs. KS Provo `(kitchenguard.com, /provo)`. |
| `parent_property_id` | uuid, nullable FK to `property(id)` ON DELETE SET NULL | Brand DNA inheritance target. May cross clients via affinity. |
| `status` | enum extended with `inactive` | "We monitor it but no active work." Distinct from `paused` (active work halted) and `offboarded` (relationship ended). |

Added unique constraint `(primary_domain, url_prefix) NULLS NOT DISTINCT` so two root properties on the same domain collide. `slug` remains globally unique for routing.

All existing 9 property rows have `url_prefix=NULL` and `parent_property_id=NULL`. No data migration was performed — the new fields are nullable and don't break existing queries.

### `client` table — additions

Applied via migration `20260514110100_client_related.sql`.

| Field | Type | Purpose |
|---|---|---|
| `related_clients` | uuid[], default `'{}'`, GIN index | Affinity list. No FK constraint inside the array (avoids cycle/cascade pain). UI surfaces it as "related clients" on the detail page. |

All existing 9 client rows have `related_clients='{}'`. New rows default to empty array.

Per the 2026-05-14 no-duplication rule, we did NOT add fields that already exist in BQ Meta `clients` (abbreviation, notes, etc.) — those stay sourced from BQ Meta read-only.

### Tables we don't build yet

- **`project`** — BQ Meta already has it. Surface BQ Meta projects via skyward-common (already wired). When BQ Meta migrates to Supabase, `project` comes over and gets a `property_id` FK added at that point.
- **`scope` / `sow`** — Stays in Scope Builder. Future: read-only sync into this app.
- **`project_property_map`** — Not needed if we match BQ Meta projects to properties by *domain* lookup (Approach A from the merge plan). Avoid the bridge table.

## UI pattern — property page with adaptive tabs

Single property page. Brand DNA always present (shared infrastructure). Channel tabs render based on active project types.

```
/properties/[slug]

Header:  <property.name> · <primary_domain><url_prefix> · <status> · phase P<n>

Tabs (always):
  Brand DNA                          — voice, audience, competitors, etc.
  Projects                           — active projects on this property
  Locations                          — only if property has child properties
                                       (multi-location franchise corporate site)

Tabs that light up by project type:
  Pages           if has seo project
  Keywords        if has seo project
  Campaigns       if has paid_search OR paid_social project
  Landing pages   if has paid_search OR paid_social project
  Ad library      if has paid_search OR paid_social project

Tabs are filters over property-scoped data, not project-scoped.
Project context is shown inline where it matters (e.g. "Pages last
triaged 2026-04-27 as part of SEO Pipeline P1").
```

When zero projects of relevant type are active, those tabs disappear. The property still has Brand DNA and Projects.

## Five-scenario reality check

How each scenario maps under this framework. The schema supports all five; the data layer reflects only what's currently engaged. **KG Corporate (Scenario 3) and KS Provo (Scenario 5) are NOT yet seeded** — we'll add them when engagements warrant.

| Scenario | Client | Property | Project | Seeded? |
|---|---|---|---|---|
| 1. Phil Lasry | Phil Lasry | `(plasry.com, null)` | seo | ✓ yes |
| 2. Dental Shop | Dental Shop | `(thedentalshop.com, null)` active. `.us` parked — track in `additional_domains[]` for now, promote to a separate `status='inactive'` property only if we start monitoring it. | paid_search (if Meta) + seo (if engaged) | ✓ partial — `.com` only, no `.us` yet |
| 3. KG Corporate | Kitchen Guard | `(kitchenguard.com, null)` | seo | ✗ no — prospect, not seeded |
| 4. TNA | TNA | 6 properties, all distinct domains, each `url_prefix=null` | 6 × seo, one per property | ✓ partial — 3 of 6 seeded (buscharter, tnabushire, minibushire) |
| 5. KS Provo | name: `Kitchen Services of Provo` / legal_name: `Tacoma Legacy Partners, LLC` | `(kitchenguard.com, /provo)` | paid_search | ✗ no — prospect; current seed has Tacoma Legacy with placeholder property at `kitchenservicesofprovo.com` (which doesn't actually exist). Will rewrite when engagement materializes. |

## What this changes about already-built code

- **Sidebar Properties grouping by client** — still works. Use `client.name` for parent grouping; `property.name` for leaf. No change.
- **Property detail page** — gain `url_prefix` rendering in header. Gain adaptive tabs based on `project.type`. Currently shows Brand DNA + Pages — those become two of the eventual ~5-7 tabs.
- **`/clients/[id]` detail page** — already lists BQ Meta projects. Stays. Will eventually show `related_clients[]` section.
- **Competitor domains** — currently shown on `/clients/[id]` (read from BQ Meta). Move to property's Brand DNA section in UI. Source stays BQ Meta until that migration.

## Build status

### Done
1. ✅ **Schema additions to `property`** — `url_prefix`, `parent_property_id`, `status += inactive`, unique `(primary_domain, url_prefix)`. Applied as `20260514110000_property_hierarchy.sql`.
2. ✅ **Schema addition to `client`** — `related_clients uuid[]`. Applied as `20260514110100_client_related.sql`.

### Deferred until engagement warrants
- **Seed pre-population for prospects.** KG Corporate, KS Provo, dental-shop `.us`, additional TNA properties — all stay un-seeded until there's a real reason to put them in. The framework supports them; the database doesn't need to until then.

### Pending UI work
4. **Property detail page** — header renders `primary_domain + url_prefix`. Add Projects tab (calls `/api/properties/<slug>/projects` which matches BQ Meta projects to property by domain).
5. **Brand DNA inheritance UI** — if `brand_voice_inheritance='parent'`, show inherited sections grayed with parent values; allow override per section.
6. **Adaptive tabs** — driven by active project types fetched from BQ Meta.
7. **Related clients section** — on `/clients/[id]`, surface `related_clients[]` with links.
8. **Locations tab** — for properties that have child properties (multi-location franchise corporate site), show a hierarchical list.

Items 4 and 6 unlock the most visible value (property page shows BQ Meta projects + adapts UI by project type). Item 5 only matters once at least one property has `brand_voice_inheritance='parent'` set. Items 7-8 only matter once `related_clients[]` or child properties exist in the data.

## Resolutions (formerly open questions)

1. ✅ **`kitchenservicesofprovo.com` doesn't exist.** Current seed value is a placeholder. The real KS Provo property (when seeded) will be `(kitchenguard.com, /provo)`.

2. ✅ **Child-property model** for franchise microsites. Each franchise = separate property row, sharing `kitchenguard.com` with a distinct `url_prefix`. Brand DNA inherits from corporate property via `parent_property_id`. Lets a franchisee "graduate" to an independent client cleanly without restructuring data.

3. ✅ **No SOW↔property tracking in this app for now.** SOWs stay in Scope Builder. The "funded by SOW X" relationship is just a label on the projects when surfaced here later.

4. ✅ **Competitors move to property/Brand DNA view.** Source stays BQ Meta during this phase (so every property under one client sees the same competitor list — that's a limitation of the BQ data shape today, not a bug). Migration to property-scoped storage waits for BQ Meta → Supabase consolidation.

## What's explicitly NOT in scope yet

- Building a `project` table in Supabase. Use BQ Meta until Adam migrates it.
- A SOW view inside this app. Stays in Scope Builder.
- A paid-search campaign management interface (the parking-lot idea). Future.
- Pre-seeding any prospect data (KG Corporate, KS Provo, etc.). Wait for real engagements.

## Notes for future migration

When Adam migrates BQ Meta to Supabase, several things tighten up cleanly:

- `client.abbreviation`, `client.notes` come over from BQ — add them to Supabase `client` then. We won't have duplicated them in the meantime.
- BQ Meta `projects` becomes a Supabase `project` table; add `property_id` FK at that point.
- BQ Meta `client_domains.is_competitor=true` becomes a property-scoped Brand DNA `competitors` field, with per-property competitor lists possible.
- Datasets catalog (BQ `client_datasets`, `dataset_catalog`) becomes a Supabase view if useful, or stays in BQ.

## Next step

Schema is in place. Branch `feat/p1-clients-via-bq` has uncommitted migration files + this spec. Commit + push, then pick which pending UI item to tackle first.
