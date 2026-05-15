---
date: 2026-05-15
audience: Paul
purpose: Field-level comparison of Phase 0 onboarding artifacts vs. v2 UI Client + Brand DNA
source:
  - /Users/paulskirbe/agency/operations/process-library/1. seo-pipeline/sop/phase-0-setup/sop_phase_0_client_onboarding.md
  - /Users/paulskirbe/agency/operations/process-library/1. seo-pipeline/sop/phase-0-setup/sop_client_intake_form_creation.md
  - /Users/paulskirbe/agency/operations/process-library/1. seo-pipeline/sop/phase-0-setup/sop_skyward_scoring_rubric_v1.md
  - /Users/paulskirbe/agency/operations/process-library/1. seo-pipeline/templates/client-manifest-template.md
  - /Users/paulskirbe/agency/operations/process-library/1. seo-pipeline/templates/operations_manual_addition_questionnaire.md
---

# Phase 0 ↔ v2 UI (Client + Brand DNA) — field-level comparison

Goal: pinpoint exactly what Phase 0 captures vs. what our Client section + Brand DNA surfaces today. Surface every concrete gap, including ones where the schema exists in P0 but we have a placeholder.

## P0 — what's collected

Phase 0 produces 6 BigQuery tables from a 7-tab Excel intake form, plus a companion Google Sheet (locations), a 26-factor Skyward Scoring Rubric, and a per-client Manifest.

### Tab 1: Instructions
Reference only. No data.

### Tab 2: Project Setup — 15 fields, 1 row per project

| Field | Notes |
|---|---|
| project_id | unique, lowercase, `clientname_###` |
| client_name | official company name |
| domain | no https://, no www. |
| location_code | DataForSEO geo (2840 = US, 2826 = UK, 2124 = CA, 2036 = AU) |
| language_code | en / es / fr |
| project_type | `new_site` / `optimization` / `expansion` / `competitive` |
| project_owner | Skyward person |
| client_contact | email |
| kickoff_date | YYYY-MM-DD |
| target_completion | YYYY-MM-DD |
| business_model | `marketplace` / `service` / `ecommerce` / `leadgen` / `saas` |
| geographic_focus | `national` / `regional` / `multi_location` / `local` |
| location_count | integer |
| service_areas | free text |
| seasonality_notes | free text |

### Tab 3: Data Access — 5 sources × 4 fields

Pre-filled rows for: **Google Search Console (Jepto)** · **Google Ads** · **Google Analytics** · **Screaming Frog Crawl** · **Client Keyword Data**.

| Field | Notes |
|---|---|
| data_source | preset |
| access_status | `granted` / `pending` / `not_available` / `not_started` / `completed` |
| property_id | account/property ID per source (e.g. `jepto_gsc_busbank`, GA4 property ID, Google Ads customer ID) |
| notes | freeform |

### Tab 4: Competitors — 3-10 rows × 3 fields

| Field | Notes |
|---|---|
| domain | competitor URL |
| priority | `high` / `medium` / `low` |
| notes | freeform |

### Tab 5: Services — 3+ rows × 3 fields

| Field | Notes |
|---|---|
| service_name | client's terminology |
| priority | `high` / `medium` / `low` |
| category | grouping (charter / school / corporate / events / etc.) |

### Tab 6: Seed Keywords — 20-100+ rows × 3 fields

| Field | Notes |
|---|---|
| keyword | one per row |
| category | matches services or logical grouping |
| source | `persona` / `client` / `competitor` / `research` |

### Tab 7: Personas — 3-6 rows × **31 fields** per persona

Grouped into 8 sections:

- **Basic (6)**: persona_name · bio · role_title · industry · company_type · company_size
- **ICP scoring (4)**: icp_fit · revenue_potential · ease_of_acquisition · strategic_importance
- **JTBD (5)**: jtbd · need_states_functional · need_states_emotional · need_states_social · pain_points
- **Journey keywords (3)** ⭐: awareness_kw · consideration_kw · decision_kw  (feed Phase 3 keyword expansion)
- **Product/service fit (3)**: product_service_of_interest · most_valued_features · least_valued_features
- **Conversion psychology (3)**: conversion_triggers · objections_barriers · alternative_solutions
- **Content preferences (2)**: content_preferences_formats · content_preferences_topics_of_interest
- **Unit economics (5)**: average_transaction_value · ltv · cac · ltv:cac · repeat_purchase_rate

### Companion sheet (00b) — adds **locations** tab

Beyond the 6 intake tables, 00b imports a Google Sheet that extends with:

| Tab | Fields |
|---|---|
| keywords | keyword · priority · category · notes |
| services | service_name · service_type · target_keywords · notes |
| competitors | domain · competitor_type · differentiator · notes |
| personas | persona_name · description · pain_points · triggers · channels |
| **locations** | location · country · priority · notes |

The **locations** concept doesn't exist in the 7-tab intake — it's introduced in the companion sheet only.

### Skyward Scoring Rubric — 26 factors, composite 0-100

Three pillars, equal-weighted:

**Pillar 1 — Website SEO (9 factors):** organic KW count · organic traffic · domain authority · page-level backlinks · schema completeness · internal links from parent · local content depth · (and 2 more)

**Pillar 2 — Local SEO (10 factors):** TBD per the rubric — citation count, NAP consistency, GBP completeness, review velocity, etc.

**Pillar 3 — Paid Search (7 factors):** TBD per the rubric — paid search activity, conversion tracking, etc.

Composite = (Website + Local + Paid) / 3, banded:
- 0-25 Critical · 26-50 Below baseline · 51-75 Healthy · 76-100 Strong

Used as P0 baseline and P6 re-measurement.

### Client Manifest — per-property registry

Lives at `delivery/{client}/MANIFEST.md`. Tracks:

- **Client info**: Client · Domain · Industry · Platform · DR · ClickUp Folder · Industry Requirements ptr
- **Phase Status** (P0–P6): status + date for each
- **Per-phase deliverables**: file name · location · tabs/slides · date (Phase 1 WQA, Phase 2 Technical, etc.)
- **BigQuery data**: table · dataset · rows · content · phase
- **Screaming Frog crawls**: crawl · job_id · date · URLs · notes
- **Open items**: item · phase · status · depends on

---

## v2 UI — what we surface today

### Client section (`/clients/[id]`)

Sourced from BQ Meta (Adam's catalog) via the Python function:
- `client_name`, `abbreviation`, `is_active`, `notes`, `created_at`
- **Owned domains** (table): domain · name · priority · status
- **Projects** (table): id · type · name · status · created
- (Competitor domains *moved* to property/Brand DNA — was here, now gone)

### Brand DNA subnav (per property)

| Tab | Fields/content today | Active in mockup? |
|---|---|---|
| Overview | Assistant (Claude chat) · Research & Fill (sweep pipeline) · Completeness (gauge + chip checklist) | ✅ |
| Identity | Company Name · Motto/Tagline · Brand Personality · Brand Story · Target Audience · Positioning · What we sell · Trust signals · Proof themes · Founded · Location | ✅ (Screen 11) |
| Voice & Tone | Voice in 1 sentence · traits chips · avoid chips · Writing Style · Voice Do's · Voice Don'ts | ✅ (Screen 12) |
| Offerings | Name · Type · Brand Relation · Status · URL | ✅ (Screen 13) |
| Proof | Title · Type · Active | ✅ (Screen 15) |
| Brand Terms | Pattern · Match · Brand Type + Exceptions (Pattern · Match · Reason) | ✅ (Screen 14) |
| Site Structure | (placeholder, no fields) | ⚠️ placeholder only |
| Commercial Policy | (placeholder, no fields) | ⚠️ placeholder only |
| Audiences | (count 4, no schema) | ⚠️ placeholder only |
| Personas | (count 5, no schema) | ⚠️ placeholder only |
| Seed Keywords | (count 47, no schema) | ⚠️ placeholder only |

---

## Field-level comparison

### A. Project Setup (P0 Tab 2) → v2 UI

| P0 field | Maps to | Status |
|---|---|---|
| project_id | Project entity (BQ Meta) — auto-create on property insert (not yet wired) | ⚠️ Concept exists; UI doesn't surface |
| client_name | Client (BQ Meta) | ✅ Covered |
| domain | property.primary_domain | ✅ Covered |
| location_code | (none) | ❌ **Gap** — no DataForSEO geo on property |
| language_code | (none) | ❌ **Gap** |
| project_type | BQ Meta project.project_type | ✅ Surfaces on Projects tab |
| project_owner | (none — implicit Paul) | ❌ **Gap** — no team member assignment |
| client_contact | Client.primary_contact | ✅ Covered |
| kickoff_date | (none) | ❌ **Gap** |
| target_completion | (none) | ❌ **Gap** |
| business_model | (none — could live in Identity but isn't currently a field) | ❌ **Gap** |
| geographic_focus | (none — close to Identity > Location but not enumerated) | ❌ **Gap** |
| location_count | (none — could be derived from child properties for multi-location, but not a field) | ❌ **Gap** |
| service_areas | (close to Identity > Location free text) | ⚠️ Partial — `Location` field exists but is free text |
| seasonality_notes | (none) | ❌ **Gap** |

**Bottom line:** 4 of 15 covered, 11 missing. Project Setup is the most operationally important section of P0 and the most under-represented in v2.

### B. Data Access (P0 Tab 3) → v2 UI

| Data source | v2 UI? |
|---|---|
| Google Search Console (Jepto dataset) | ❌ No surface |
| Google Ads (Customer ID) | ❌ No surface |
| Google Analytics (GA4 property) | ❌ No surface |
| Screaming Frog Crawl | ❌ No surface |
| Client Keyword Data | ❌ No surface |

**Bottom line:** entire surface missing. Adam's admin portal has a Datasets view at the client level, but our app doesn't surface or manage data source access status per property. This is a meaningful workspace-level or property-level gap (probably a "Data Access" tab or a workspace "Integrations" surface).

### C. Competitors (P0 Tab 4) → v2 UI

| P0 field | v2 UI field | Status |
|---|---|---|
| domain | Competitors card (in Brand DNA Overview) | ✅ |
| priority | priority column | ✅ |
| notes | (not displayed) | ⚠️ |

**Bottom line:** mostly covered. Notes column dropped in our UI. Otherwise aligned.

### D. Services (P0 Tab 5) → v2 UI Offerings

| P0 field | v2 UI Offerings field | Status |
|---|---|---|
| service_name | Name | ✅ |
| priority | (none on Offerings) | ❌ **Gap** |
| category | (none on Offerings) | ❌ **Gap** |
| — | Type (service/solution) | extra in v2 |
| — | Brand Relation (owner) | extra in v2 |
| — | Status | extra in v2 |
| — | URL | extra in v2 |

**Bottom line:** v2 schema is richer (Type, Brand Relation, Status, URL) but drops priority + category. Categories matter for SEO clustering — they group services for keyword targeting. Worth restoring.

### E. Seed Keywords (P0 Tab 6) → v2 UI

| P0 field | v2 UI field | Status |
|---|---|---|
| keyword | (placeholder) | ❌ |
| category | (placeholder) | ❌ |
| source (persona/client/competitor/research) | (placeholder) | ❌ |

**Bottom line:** v2 Seed Keywords is just a count chip in the subnav. P0 schema is 3 fields × 20-100+ rows. **Schema exists, UI doesn't.**

### F. Personas (P0 Tab 7) → v2 UI

P0 has **31 fields × 3-6 personas** across 8 grouped sections. v2 UI Personas is a count chip in the subnav. None of the rich schema (ICP scoring, JTBD, journey keywords, conversion psychology, unit economics) has a UI surface.

**Bottom line: major gap.** This is probably the single most under-developed area in v2 given how rich P0 already defines it.

The Journey keywords (awareness/consideration/decision) in particular feed Phase 3 keyword expansion — they're a load-bearing input to other phases.

### G. Companion sheet — Locations → v2 UI

| Locations field | v2 UI | Status |
|---|---|---|
| location | (none — close to property.url_prefix but different concept) | ❌ **Gap** |
| country | (none) | ❌ **Gap** |
| priority | (none) | ❌ **Gap** |
| notes | (none) | ❌ **Gap** |

**Bottom line:** the multi-location concept exists in P0 (companion sheet only). v2 has `property.url_prefix` which is close but not the same — url_prefix is structural (URL routing), while locations is strategic (geographic targets). For franchise networks especially, locations is core.

### H. Skyward Scoring Rubric → v2 UI

| Pillar | v2 UI surface? |
|---|---|
| Website SEO (9 factors) | ❌ No surface |
| Local SEO (10 factors) | ❌ No surface |
| Paid Search (7 factors) | ❌ No surface |
| Composite score | ❌ No surface |

**Bottom line:** **entirely missing.** The rubric is a P0 baseline artifact and P6 re-measurement artifact. There's no place in the v2 UI to view, compute, or visualize the score. This is a workspace concept too (clients need to see this on lead-engagement docs) but at minimum needs a per-property surface.

Most natural home: **Overview tab** on property (the dashboard-style view I already mocked up). Show the score with the 26-factor breakdown, banded color, and historical trend if Phase 6 re-measurement runs.

### I. Client Manifest → v2 UI

| Manifest section | v2 UI | Status |
|---|---|---|
| Client info (industry · platform · DR · ClickUp folder · industry req ptr) | partial (some on Client; industry/platform/DR not surfaced) | ⚠️ Partial |
| Phase Status (P0–P6) | partial (property.pipeline_phase shows current; full P0–P6 status with dates not surfaced) | ⚠️ Partial |
| Per-phase deliverables (WQA workbook, deck, audit doc, etc.) | ❌ No surface | **Gap** |
| BigQuery data (table list per phase) | partial (admin portal has datasets; not surfaced in our app) | ❌ **Gap** |
| Screaming Frog crawls | ❌ No surface | **Gap** |
| Open items | partial (maps to Signals / Priorities) | ⚠️ Partial |

**Bottom line:** the manifest is a deliverables registry that operational strategists use. v2 has nothing equivalent. Probably a property-level "Deliverables" tab or a section on the Overview.

### J. v2 UI fields NOT in P0

Worth flagging — these come from the brand-strategy tradition (Tryggvi-style) rather than the operational SEO pipeline:

- **Brand Personality** (long-form prose)
- **Brand Story** (long-form prose)
- **Target Audience** (long-form prose — in addition to structured Personas)
- **Positioning** (long-form prose)
- **Trust signals** (long-form prose)
- **Proof themes** (long-form prose)
- **Voice in 1 sentence**
- **Voice traits / avoid (chip lists)**
- **Writing Style / Voice Do's / Voice Don'ts**
- **Brand Terms** (canonical patterns for tagging)

These are valuable for Brand DNA Assistant + content drafting. P0 doesn't capture them because P0 is operational data setup, not brand strategy. **No problem — we're additive here.** Just worth knowing that "Brand DNA" in v2 is a **superset** of what P0 captures for two reasons: (1) brand-strategy fields P0 doesn't track, (2) richer per-section editing models.

---

## Summary of P0 gaps in v2

Ranked by surface area / value:

| Rank | Gap | Where it'd go |
|---|---|---|
| 1 | **Personas schema** (31 fields × N personas) | Brand DNA → Personas tab |
| 2 | **Skyward Scoring Rubric** (26 factors, composite, banding) | Property Overview + workspace-level lead-engagement surface |
| 3 | **Seed Keywords schema** (3 fields × 20-100 rows) | Brand DNA → Seed Keywords tab |
| 4 | **Data Access surface** (5 sources × access status + property IDs) | Property tab "Data Access" OR workspace "Integrations" |
| 5 | **Project Setup metadata** (location_code, language_code, kickoff_date, target_completion, business_model, geographic_focus, location_count, service_areas, seasonality_notes) | Project entity + Property Overview |
| 6 | **Deliverables registry** (per-phase artifacts) | Property tab or Project detail page |
| 7 | **Locations** (multi-location targeting) | Brand DNA → Audiences or its own Locations surface |
| 8 | **Services priority + category** (lost in Offerings) | Add columns to Offerings table |
| 9 | **Industry classification** (Transport / Creative Services / etc.) | Property metadata or Identity |
| 10 | **Project owner / team assignment** | Project entity |

## What's well-covered

- Client name + domain + abbreviation + status → ✅
- Competitor domains + priority → ✅
- Service names (in Offerings, richer schema) → ✅ (with category/priority caveat)
- Property as the operational unit → ✅
- Pipeline phase as a state → ✅ (visible on property hero)

## Recommended next moves (just options, not a plan)

1. **Personas tab** — design the full 31-field schema as a structured form with collapsible 8-section grouping. Each persona is a card; click in to edit. Journey keywords get special prominence (they feed Phase 3).
2. **Seed Keywords tab** — table view with keyword/category/source columns. + Add button. Bulk-import affordance (paste a list, auto-categorize).
3. **Property Overview score panel** — render the Skyward composite score and the 26 factors. P0 measurement + P6 re-measurement compared if both exist.
4. **Data Access section** — could live on Property Overview or as its own tab. 5 default rows for the standard sources; rows configurable.
5. **Project Setup fields** — expose `location_code`, `language_code`, `business_model`, `geographic_focus`, `kickoff_date`, etc. as editable property metadata. Probably in a "Property settings" surface or extended Identity form.
