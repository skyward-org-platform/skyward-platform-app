---
date: 2026-05-15
audience: Paul
purpose: Compare the v2 UI mockup surface to the full Skyward process library — identify gaps before we commit to the UI build.
source: /Users/paulskirbe/agency/operations/process-library/
---

# Process library ↔ v2 UI gap analysis

## What's in the process library (the source of truth)

14 numbered pipelines plus 2 cross-cutting folders. Each pipeline is a real Skyward service area with named SOPs that produce concrete deliverables. Counts below.

| # | Pipeline | SOPs | Key sub-processes |
|---|---|---|---|
| 0 | `0. sales-pipeline` | 3 | CRM stage automations, pipeline review notes. Not the proposal pipeline (that's at `sales-pipeline/`). |
| 1 | `1. seo-pipeline` | ~25+ across phases | P0 client onboarding · P1 Website Quality Audit · P1b Technical Audit · P2 Keyword Discovery · P3 Clustering / Categorization · P4 Content Roadmap · P6 Tracking. Plus link-building, industry SOPs. |
| 2 | `2. content-pipeline` | 6 SOPs | `cnt-article-new` · `cnt-brief` · `cnt-internal-linking` · `cnt-location-page` · `cnt-optimization` · `cnt-schema` |
| 3 | `3. outreach-pipeline` | 5 SOPs + link-building sub-pipeline | `aut-prospecting` · `aut-outreach` · `aut-placement` · `aut-link-monitoring` · `aut-link-gap-audit`. Link-building has its own 6-script automation set. |
| 4 | `4. Review Generation` | 1 process | Review request workflow. |
| 5 | `5. paid-media-pipeline` | 10 SOPs | PPC: `strategy` · `onboarding` · `launch` · `optimization` · `performance`. PSO (paid social): same 5 phases. |
| 6 | `6. local-seo-pipeline` | **16 SOPs** | Citations (audit/build/maintain/setup), GBP (mgmt/setup), link-building, multi-location, NAP-audit, profiles-setup, rank-tracking/monitoring, review-gen/mgmt, schema, strategy. |
| 7 | `7. account-management` | 5 SOPs | `acc-onboarding` · `acc-project-mgmt` · `acc-status-external` · `acc-status-internal` · `acc-consulting-hours` |
| 8 | `8. tracking-reporting` | 6 SOPs | `trk-weekly` · `trk-monthly` · `trk-qbr` · `trk-dashboard-build` · `trk-dashboard-page` · `trk-cro-audit` |
| 9 | `9. marketing-ops` | 6 SOPs | `ops-crm-setup` · `ops-crm-mgmt` · `ops-email-setup` · `ops-email-campaign` · `ops-email-retainer` · `ops-email-automation` |
| 10 | `10. design-development` | 7 SOPs | `des-web` (build/maintenance/redesign) · `des-graphic` (retainer/unit) · `dev-content-stack` |
| 11 | `11. aeo-pipeline` | 8 phases | AEO-P0 baseline · P1 prompt research · P2 entity optimization · P3 AI schema · P4 AI content · P5 citation building · P6-setup tracking · P6-mgmt monitoring |
| 12 | `12. abm-pipeline` | 6 SOPs | `abm-strategy` · `abm-onboarding` · `abm-launch` · `abm-campaign-mgmt` · `abm-manual-engagement` · `abm-performance` |
| 13 | `13. strategy-consulting` | 4 SOPs | `flex-opportunistic` · `str-competitive` · `str-custom-tooling` · `str-training` |
| — | `sales-pipeline/` (unnumbered) | proposal pipeline (6 phases: 0-5) + lead-engagement SOP + services catalog | Proposal generation, lead engagement, what-we-sell catalog. |
| — | `presentation-templates/` | base.html + slide library + components + deck builder | Deck rendering infrastructure (already used). |

Plus inside `1. seo-pipeline/`: 13 notebooks (keyword discovery, clustering, backlink analysis, content gap, entity extraction, etc.), 6 scripts, ~16 templates (workbooks, intake forms, manifests), 18 reference folders (Tryggvi, ipullrank, Eubanks, etc.), and project-specific working folders.

## What the v2 UI mockup covers today

Workspace-level (sidebar): Dashboard · Clients · Activity · Signals

Property-level (main tabs): Overview · Brand DNA · Pages · Keywords · Campaigns · Projects · Priorities · Guidelines · Project Brain

Brand DNA subnav: Overview · Identity · Voice & Tone · Offerings · Proof · Brand Terms · Site Structure · Commercial Policy · Audiences · Personas · Seed Keywords

## Mapping: where each pipeline lives in the UI (or doesn't)

| Pipeline | UI home today | Status |
|---|---|---|
| 0. sales-pipeline | (none) | **Gap** — CRM stages, sales-process docs have no home |
| 1. seo-pipeline P0 onboarding | Brand DNA (Overview → Identity, etc.) | ✅ Partial — intake form / questionnaire / scoring rubric concepts not surfaced |
| 1. seo-pipeline P1 WQA | Pages tab | ✅ Covered |
| 1. seo-pipeline P1b Technical | Pages tab (audit_action) | ✅ Partial — technical-audit-specific outputs not surfaced |
| 1. seo-pipeline P2 Keywords | Keywords tab (placeholder) | ✅ Surface exists, content pending |
| 1. seo-pipeline P3 Clustering | Keywords tab (placeholder) | ✅ Surface exists, content pending |
| 1. seo-pipeline P4 Content | (none) | **Gap** — content roadmap workbook, content briefs |
| 1. seo-pipeline P6 Tracking | (none) | **Gap** — tracking setup, rank dashboards |
| 2. content-pipeline (briefs, articles, location pages, internal linking, schema, optimization) | (none) | **Gap** — major omission |
| 3. outreach-pipeline (link prospects, outreach, placements, monitoring, gap audits) | (none) | **Gap** — major omission |
| 4. Review Generation | (none) | **Gap** — small but distinct |
| 5. paid-media-pipeline (PPC + PSO × 5 phases) | Campaigns tab (placeholder) | ✅ Surface exists, content pending |
| 6. local-seo-pipeline (16 SOPs: citations, GBP, NAP, multi-location, etc.) | (none) | **Gap** — major omission, biggest single area |
| 7. account-management (onboarding, project mgmt, status reports, consulting hours) | Projects · Priorities (partial) | ⚠️ Maybe — needs explicit surfaces for onboarding + status reports |
| 8. tracking-reporting (weekly / monthly / QBR / dashboard / CRO) | (none) | **Gap** — no Reports surface |
| 9. marketing-ops (CRM setup, email campaigns) | (none) | **Gap** — probably workspace-level not property-level |
| 10. design-development (web build/redesign, graphic retainers, content stack) | (none) | **Gap** — workspace-level or per-property? |
| 11. aeo-pipeline (8 phases parallel to SEO) | (none) | **Gap** — needs equivalent to Keywords/Pages but for AEO |
| 12. abm-pipeline (strategy, campaigns, manual engagement) | (none) | **Gap** — new channel, needs its own surface |
| 13. strategy-consulting (competitive, custom tooling, training) | (none) | **Gap** — could fit as project types, but no view |
| sales-pipeline (proposal pipeline + lead engagement + services catalog) | (none) | **Gap** — sales-side surface entirely missing |
| presentation-templates | (none, intentional) | ➖ Not required in app |

## The big gaps, ranked by surface area

### Tier 1 — Major pipelines with zero UI

1. **Local SEO (6.)** — 16 SOPs, biggest single workflow with no home. Citations, GBP listings, NAP audits, multi-location franchise patterns, local rank tracking, review generation/management. For franchise-network clients (KG, FCI, KSSD), this is the bulk of the work. Could be its own property tab; multi-location pattern especially needs surface.

2. **Content Pipeline (2.)** — 6 distinct content workflows: briefs, articles, internal linking, location pages, optimization, schema. These produce the actual content deliverables. No Content tab in the UI.

3. **Outreach / Authority (3.)** — link gap audits, prospecting, outreach campaigns, placements, monitoring. Has its own automation (6 Python scripts in `link-building/`). No Authority/Outreach tab.

4. **AEO Pipeline (11.)** — full 8-phase parallel pipeline for LLM/answer-engine optimization. Distinct from SEO; needs its own tabs. Adam has prompt-research + entity-optimization + AI-schema processes. Major gap given Skyward positioning.

5. **Tracking & Reporting (8.)** — weekly / monthly / QBR reports, dashboard build, CRO audits. The deliverables side of client engagements. No Reports tab.

### Tier 2 — Distinct channels with no surface

6. **ABM Pipeline (12.)** — 6 SOPs: strategy, onboarding, launch, campaign mgmt, manual engagement, performance. Different sales motion from PPC/PSO. EngageFi-style enterprise work.

7. **Design-Development (10.)** — web build / redesign / maintenance, graphic retainers, dev-content-stack. Could be project-types or its own surface for portfolio of design work.

8. **Marketing Ops (9.)** — CRM setup/mgmt, email automation/campaign/retainer. Probably workspace-level cross-property surface, not per-property.

### Tier 3 — Sales / commercial layer entirely missing

9. **Sales pipeline + Proposals + Services catalog** — the proposal pipeline alone is 6 phases (P0 intake → P5 polish & deploy). Lead engagement SOP. Services catalog (`services-catalog.md`). None of this exists in the UI. Adam's admin portal partially covers some client/project metadata, but Skyward's sales motion has no operational surface here.

10. **Account Management (7.)** — onboarding flow, project management cadence, status reports (internal + external), consulting hours. Some maps to Projects/Priorities, but the explicit `acc-onboarding` workflow is not represented.

### Tier 4 — Concepts inside SEO pipeline P0 that don't fully surface

11. **Client intake form / questionnaire** — `sop_client_intake_form_creation.md`. The Brand DNA tab roughly maps but isn't structured as a guided intake.
12. **Skyward Scoring Rubric** — `sop_skyward_scoring_rubric_v1.md`. 26-factor scorecard (9 Website SEO + 10 Local SEO + 7 Paid Search). Baseline measurement at P0, re-measure at P6. No surface to view, edit, or visualize the composite score.
13. **Persona intake form** — `persona_intake_form_template.xlsx`. The Personas subnav tab exists but isn't structured as an intake form.
14. **Client manifest** — `client-manifest-template.md`. The thing that lists everything we know about a client. Brand Identity form covers some; doesn't fully replace.

### Tier 5 — Inside SEO pipeline, things mostly covered but missing nuance

15. **Phase 4 content roadmap** — has its own workbook + deck SOP. The Pages tab covers triage decisions; content roadmap with brief generation is separate. Could live in Content tab (Tier 1 gap).
16. **Phase 6 tracking setup + reporting cadence** — `tracking-setup-sop` + `reporting-cadence-sop`. Need a Reports tab or workspace-level tracking surface.
17. **Industry-specific SOPs** — `industry/` has transport-requirements.md and creative-services-requirements.md. UI doesn't carry industry-level Brand DNA inheritance or templating.
18. **Link-building inside SEO pipeline** — has its own SOP (`sop/link-building/`). Overlaps with outreach-pipeline. Where would this live?

## Subnav-level gaps (Brand DNA)

Our 11-item Brand DNA subnav is: Overview · Identity · Voice & Tone · Offerings · Proof · Brand Terms · Site Structure · Commercial Policy · Audiences · Personas · Seed Keywords

**Not represented but exist as concepts:**

- **Industry classification** — process library distinguishes Transport vs Creative Services with different intake. No industry field surfaced.
- **Skyward score baseline** — 26-factor composite. Nowhere to view or update.
- **Client manifest / questionnaire** — guided intake form pattern that walks new clients through onboarding. Identity is closer to a static form than a guided flow.
- **Tools + tech stack** — clients have CMS, CRM, analytics, ad platforms, etc. Operations manual addition questionnaire (`operations_manual_addition_questionnaire.md`) captures this. No "Tools / Stack" surface.

**Probably covered, but worth confirming:**

- **Site Structure** (in subnav) — likely maps to the site architecture artifacts produced by Phase 1.
- **Audiences vs Personas** — overlap. Process library has both intake forms but the line between them is fuzzy in the UI.

## Property-tab-level gaps (the big tabs)

Currently: Overview · Brand DNA · Pages · Keywords · Campaigns · Projects · Priorities · Guidelines · Project Brain

What's missing (mapped to pipelines):

| Missing tab | Drawing from pipeline(s) | Why it matters |
|---|---|---|
| **Content** | 2. content-pipeline + 1. seo-pipeline/phase-4 | The actual content-production surface. Briefs in flight, drafts in review, published. |
| **Authority** (or Outreach / Links) | 3. outreach-pipeline + 1. seo-pipeline/link-building + 6. local-seo-pipeline/link-building | Link gap → prospect list → outreach → placement → monitoring. Full lifecycle. |
| **Local** (or per-location dashboard) | 6. local-seo-pipeline (16 SOPs) | Multi-location franchise pattern is core to KG / FCI / KSSD work. Needs first-class home. |
| **AEO** | 11. aeo-pipeline (8 phases) | Parallel to SEO. Brand monitoring across LLMs. Adam's pipeline. |
| **Reports** (or Tracking) | 8. tracking-reporting + 1. seo-pipeline/phase-6 | Weekly / monthly / QBR cadence. Dashboards. CRO audits. |
| **Reviews** | 4. Review Generation + 6. local-seo-pipeline (loc-review-gen, loc-review-mgmt) | Review-request workflow, review responses, surfacing review schema. |

## Workspace-level gaps (sidebar)

Currently: Dashboard · Clients · Activity · Signals

What's missing:

- **Proposals** queue / sales-side surface — covers sales-pipeline + proposal-pipeline. Lead engagement docs, proposal drafts, deals in flight.
- **Services catalog** — what Skyward sells, SKU-level. Lives at `sales-pipeline/services-catalog.md` today.
- **Team** — who's on the account. Some of this is in `team_member` Supabase table but no UI.
- **Tools / integrations** — Ahrefs, DataForSEO, BigQuery, ClickUp, etc. No connection-management surface.
- **CRM** — marketing-ops/`ops-crm-mgmt`. Could be external (ClickUp / HubSpot) but referenced or linked.
- **Email campaigns** — marketing-ops/email. Could be external (Lemlist / HubSpot) but referenced.

## Tier-1 summary

**5 major pipelines have zero UI surface:** Local SEO · Content · Outreach/Authority · AEO · Tracking & Reporting.

**3 more have minimal surface:** Account Management (partial via Projects) · Design-Development (none) · Marketing Ops (none).

**Sales-side is entirely missing:** Proposals · Lead engagement · Services catalog.

**Brand DNA subnav** is reasonably complete for branding work but missing: Industry, Skyward Score, Tools/Stack, Client Manifest as guided intake.

## What this means for the UI direction

You'll want to decide:

1. **Property-tab strategy** — keep adding tabs (Content · Authority · Local · AEO · Reports · Reviews) until each pipeline has a home? That's 6 more tabs on top of the 9 we have = 15+ tab strip. Reorganize into pipeline clusters with sub-routing?
2. **Channel projects** — project types currently `seo / paid_search / paid_social`. Add: `aeo / content / outreach / local_seo / abm / review_gen / design / strategy`? That's 11 channel types total. The Projects tab + adaptive UI would then surface them.
3. **Workspace surfaces** — Proposals · Services · Tools · Team · CRM. Probably workspace-level (sidebar), not property-level.
4. **Brand DNA additions** — Industry · Skyward Score · Tools/Stack · maybe consolidated Client Manifest view.
