# Local SEO Module: Design

**Date:** 2026-06-02
**Status:** Approved for first slice (Foundation + Phase 1)
**Author:** Skyward (with Paul)

## Goal

Add a Local SEO module to the platform app, surfacing the local SEO work the team already does (GBP optimization, reviews, citations, rank tracking) per property and per Google Business Profile location. The module makes the Jepto GMB data in BigQuery visible in-app and gives the team a place to run audits and track execution.

This is a multi-property-aware, multi-location feature. The first wired client is Kitchen Guard (locations: Fairfield & Westchester (connected to Jepto), San Diego, Dallas-Fort Worth (not yet connected)).

## Decomposition (full module)

The full module is too large for one spec. It decomposes into a foundation plus three phases, built in order because each builds on the prior:

- **Foundation:** property to locations model (multiple GBP locations under one property).
- **Phase 1:** GMB Dashboard (read Jepto BigQuery): profile, performance, reviews, Q&A, posts.
- **Phase 2:** Audit + recommendations (Jepto-first, DataForSEO fallback) per location.
- **Phase 3:** Execution tracker/workflow (Supabase-backed Starter + Recurring SKU gates) + attached strategy/GBP content.

**This spec covers the first slice: Foundation + Phase 1.** Phases 2 and 3 get their own specs.

## Revision 2026-06-02 (per-property model)

Discovered during execution: the app models KG franchise locations as separate per-location properties (`kssd-sd` = Kitchen Services SD, `kssd-dfw` = Kitchen Services DFW, `kg-provo`), each with its own domain, not one multi-location "Kitchen Guard" property. The Jepto-connected location (Kitchen Guard of Fairfield & Westchester) has no matching property in the app. Decision: build a **per-property single-GBP** surface instead of a multi-location foundation. Each property links to one GBP via a `local_seo_profile` row (CID + search coords + optional Jepto linkage). Connected properties read Jepto BQ; the rest (all kitchen properties today) use the DataForSEO fallback. GBP mapping: SD CID 12150829757867491455 -> kssd-sd, DFW CID 13074547460630799462 -> kssd-dfw. The sections below describe the original multi-location design; the per-property plan in `docs/superpowers/plans/2026-06-02-local-seo-foundation-phase1.md` is the source of truth for what gets built.

## Architecture

Follows existing per-property surface patterns (`tracking`, `data-access`):
- Next.js async server components under `app/properties/[slug]/local-seo/`.
- Supabase for app-owned state (the location registry) via `lib/local-seo.ts`, mirroring `lib/tracking.ts` (graceful empty states, return `[]` when no rows).
- A Python Vercel function `api/properties/[slug]/gmb.py` for BigQuery reads, reusing the client-to-dataset resolution already in `api/data-access/sources.py` (Meta.domains -> client_id -> Meta.client_datasets -> the `gmb` dataset).
- A "Local SEO" tab registered in `app/properties/[slug]/layout.tsx`.

Decision record: location registry lives in Supabase (synced from Jepto + manual adds), not derived live from BQ, because unconnected locations (SD, DFW) are absent from BQ and Phases 2/3 need a persistent location entity to attach audits and trackers to. GMB data is read live from BQ (not ETL'd) because the Jepto dataset is already daily.

## Foundation: property to locations

### Supabase table `local_seo_location`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| property_id | uuid fk -> property.id | |
| name | text | e.g. "Kitchen Guard of San Diego" |
| store_code | text null | Jepto storeCode when known (e.g. KG-FLD) |
| jepto_location_id | text null | Jepto `locationId`; set when connected |
| connected | boolean default false | true once linked to a Jepto location |
| primary_geo | text null | metro/service area label |
| status | text default 'active' | active / archived |
| created_at, updated_at | timestamptz | |

RLS consistent with existing app tables. Empty by default.

### Sync + manual add
- A sync reads distinct locations (`locationId`, `locationName`, `storeCode`) from the client's `jepto_gmb_<client>.jepto_gmb_data` (date-filtered) and upserts connected rows keyed on `jepto_location_id`.
- Unconnected locations (SD, DFW) are added manually (simple form or seed for v1) with `connected=false`.
- For the first slice the sync can run via the `api/properties/[slug]/gmb.py` function (an action) or a one-off seed; a scheduled sync is not required for v1.

### `lib/local-seo.ts`
- `getLocations(propertyId)` -> registry rows.
- `getLocation(propertyId, locationId)`.
- Types for location + GMB payloads. All getters degrade gracefully to empty.

## Phase 1: GMB Dashboard

### `api/properties/[slug]/gmb.py`
Input: slug (resolves to property -> client_id). Resolves the client's `gmb` BigQuery dataset via Meta (reuse `data-access/sources.py` logic). For each connected location, queries `jepto_gmb_data` (always date-partition-filtered) and returns:
- **Profile** (latest `location` row): primaryCategory + service types, additionalCategories, regularHours, attributes, profile description, serviceArea, primaryPhone, websiteUrl, latlng, totalReviewCount, locationAverageRating.
- **Performance** (`metric_performance`, last 90 days): searchImpressions, mapsImpressions, callClicks, webClicks, directionRequests, bookings, plus a simple trend.
- **Reviews** (`review`): rating, count, recent items (rating, text, reply, date).
- **Q&A** (`question`/`answer`): recent pairs.
- **Posts** (`localPost`): recent posts.
Returns `{ ok, locations: [...] }`, empty when the client has no gmb dataset. Never errors the page on missing data.

### Routes + components
- `app/properties/[slug]/local-seo/page.tsx`: overview. One card per registry location: name, connected badge, rating + review count, headline performance (impressions, calls, clicks, directions). Unconnected locations show registered NAP + a "Not connected to Jepto" state with a connect prompt.
- `app/properties/[slug]/local-seo/[locationId]/page.tsx`: per-location detail with sections Profile, Performance, Reviews, Q&A, Posts. Tabs/sections styled to match existing surfaces (reuse `components/` primitives and the tracking tabs pattern).
- Components under `components/local-seo/` (LocationCard, ProfilePanel, PerformancePanel, ReviewsPanel, QnAPanel, PostsPanel).

### Unconnected-location fallback (DataForSEO)
Pulled into this slice so SD and DFW show real data, not just a "not connected" state. For registry locations with `connected=false`, `api/properties/[slug]/gmb.py` (or a sibling `gmb_fallback.py`) fetches the public profile via DataForSEO `business_data_business_listings_search` (by name + metro coordinate, the method validated in the Kitchen Guard work): primaryCategory, NAP/phone, hours, attributes, photo count, rating + review count. This maps into the same per-location payload shape as the Jepto path, so the UI renders connected and fallback locations through identical panels. Performance/Q&A/posts are Jepto-only and simply render empty for fallback locations. Each fallback location is badged "via DataForSEO (public)" to distinguish it from Jepto-connected data. Credentials from existing env (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD).

### Navigation
Add a "Local SEO" tab in `app/properties/[slug]/layout.tsx`. Gating: visible for properties with at least one `local_seo_location` row (or always-on with an empty state). No pipeline-phase gate for v1.

## Data flow

property (Supabase, by slug) -> client_id -> Meta resolution (BQ) -> `jepto_gmb_<client>` dataset -> per-location latest profile + 90d performance + reviews/Q&A/posts -> overview cards + detail panels. Location registry (Supabase) drives which locations are shown and carries unconnected ones.

## Error handling + empty states
- No gmb dataset for the client: overview shows all registry locations as unconnected; no error.
- Location in registry but no BQ rows: unconnected state.
- BQ query failure: surface a non-blocking "GMB data unavailable" panel, render registry data and the rest of the page.
- Partitioned-table safety: every BQ query filters `date` (a missing filter errors in BigQuery).

## Testing
- `lib/local-seo.ts` getters return `[]` / null safely with no rows (unit).
- `gmb.py`: dataset-resolution + query shaping covered; mock BQ response shapes for profile/performance/reviews. Verify date filter present.
- Manual: Kitchen Guard property renders Fairfield (connected, full data) and SD/DFW (unconnected state). Verify the new tab appears and overview -> detail navigation works.

## Out of scope (this slice)
Audit logic + recommendations (the diagnostic verdicts), the execution tracker, GBP editing/write-back, scheduled Jepto sync. Deferred to Phases 2/3 or later. Note: the DataForSEO public-profile pull is IN scope for this slice (as the unconnected-location fallback above), but the audit/scoring layer on top of it is not.
