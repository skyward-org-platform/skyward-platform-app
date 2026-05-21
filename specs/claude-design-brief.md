# Skyward Platform App — Design Brief

A single-file brief for Claude Design (or any design tool). Captures what the app is, the conceptual model, the information architecture, every screen's purpose, the adaptive UI patterns, and real sample data. Read top to bottom or pull individual sections.

---

## 1. Product context

**What it is:** An internal web app for Skyward (a digital marketing agency) to manage client work across SEO, paid search, paid social, and adjacent channels. The interface where strategists view a client's brand identity, decide which website pages to optimize / restore / redirect / remove, track keyword work, and monitor active engagements.

**Who uses it:** Skyward team members — strategists, content engineers, SEO analysts, paid-media managers, and the founder (Paul). Internal-only. No client-facing UI.

**Why it exists:** Skyward operates a 7-phase SEO pipeline (P0-P6) plus paid and authority workflows. Today these live across Google Sheets, BigQuery, ClickUp, and a few standalone scripts. This app is the operational interface that unifies them — brand intelligence, audit decisions, keyword strategy, all per-client.

**Production URL:** https://skyward-seo-platform.vercel.app

**Stack:** Next.js 16 (App Router, React 19, Tailwind 4, shadcn/ui), Supabase Postgres + pgvector for our data, BigQuery for shared Skyward metadata (via Python serverless functions calling `skyward-common`).

---

## 2. Visual style — current baseline

- Light theme. White background. Slate grays for text (`#0f172a` body, `#64748b` muted, `#e2e8f0` borders).
- Accent: blue for "active" or "selected" states (`#3b82f6`); emerald for "active/healthy" status pills; amber for "pending"; rose/red for errors.
- Generous whitespace. Cards with thin 1px borders rather than heavy shadows.
- Type: `-apple-system, BlinkMacSystemFont, Inter, sans-serif`. 14px body, 13px in tables, 11px in metadata. 22px h1, 18px h2, 14px section labels.
- Status badges as small pills: 10px, uppercase, letterspacing 0.05em, rounded, colored backgrounds.
- Sidebar at left (256px), main content right. Sidebar is sticky; main scrolls.
- Inline editing is the primary interaction model — click any field to edit, blur to save. No giant modal forms.

A separate admin portal (`skyward-platform`, FastAPI + Next.js) uses a **dark theme** with similar typography. Open question: should this app convert to dark too for visual consistency, or stay light?

---

## 3. Information architecture

```
Sidebar
├── Workspace
│   ├── 🏠  Home
│   ├── 👥  Clients
│   ├── ⚡  Signals      (placeholder, no data yet)
│   └── ▶  Runs          (placeholder)
└── Properties           (grouped by client)
    ├── Phil Lasry · plasry.com · P3
    ├── TNA
    │    ├── BusCharter · phase 2
    │    ├── TNA Bus Hire · phase 3
    │    └── Mini Bus Hire AU · phase 1
    ├── Kitchen Services of San Diego
    │    ├── Kitchen Services SD
    │    └── Kitchen Services DFW
    ├── BusBank · phase 0
    └── (others)

Routes
├── /
├── /clients
├── /clients/[id]
├── /properties/[slug]              ← Brand DNA (default)
├── /properties/[slug]/pages
├── /properties/[slug]/keywords     ← appears when SEO project active
├── /properties/[slug]/campaigns    ← appears when paid project active
└── /properties/[slug]/projects
```

---

## 4. Conceptual model — client → property → project

This is the foundation. Three tiers plus cross-relationships.

### Tier 1: Client
The legal entity that signs SOWs. One row per contractual counterparty.

| Field | Example |
|---|---|
| name | Phil Lasry · TNA · Kitchen Services of Provo |
| legal_name | Phil Lasry LLC · TNA Pty Ltd · Tacoma Legacy Partners, LLC |
| primary_contact | Phil Lasry · Wade · RJ Schultz |
| status | active · paused · offboarded · prospect |
| related_clients[] | Soft affinity (franchisor↔franchisee). NOT parent-child. |

### Tier 2: Property
The operational unit. Brand + website + pipeline state. One client can have many.

| Field | Example |
|---|---|
| name | Phil Lasry · BusCharter · Kitchen Guard Corporate |
| primary_domain | plasry.com · buscharter.com.au · kitchenguard.com |
| url_prefix | null · null · /provo |
| additional_domains[] | [] · [thedentalshop.us] (parked) |
| status | active · inactive · paused · offboarded · prospect |
| pipeline_phase | 0–6 |
| brand_voice_inheritance | none · parent · override |
| parent_property_id | null · KG Corporate's property id |

Two properties can share a `primary_domain` distinguished by `url_prefix` (e.g. KG Corporate at `kitchenguard.com` root vs. KS Provo at `kitchenguard.com/provo`). A property can inherit Brand DNA from another property (potentially across clients via affinity).

### Tier 3: Project
A playbook running in a specific channel. Belongs to a client, attached to one or more properties.

| Field | Example |
|---|---|
| type | seo · paid_search · paid_social |
| name | "BusCharter SEO Q2" · "KS Provo paid search launch" |
| status | active · paused · completed |
| client_id | foreign key |
| property_ids[] | usually one, sometimes many |

The seven SEO pipeline phases (Brand DNA → Technical → Keywords → Content → Authority → Tracking) all live inside a single `seo` project. Content production isn't a separate project type — it's Phase 4 of SEO.

### Brand DNA — the property-level knowledge layer

Each property has a set of `brand_dna_section` rows. Each section is one of:

- **identity** — who is this property/brand
- **brand_story** — narrative arc
- **voice_tone** — how this brand sounds
- **brand_terms** — canonical terminology + variants
- **proof** — credibility points (case studies, awards, stats)
- **future_audience** — who we want to reach next
- **competitors** — read-only, sourced from BQ Meta (will eventually become editable)
- **personas** — buyer profiles
- **offerings** — products / services
- **site_structure** — URL hierarchy strategy
- **goals** — what this property is trying to achieve
- **positioning** — vs. competitors

Each section has structured `content` (jsonb) AND optional `body` (long-form prose). The editor picks the right input type based on content shape.

---

## 5. Page-by-page specs

### 5.1 / (Home)
A minimal welcome. Says "Pick a property from the sidebar." Replace with a useful dashboard later (active projects across clients, recent edits, urgent decisions awaiting input).

### 5.2 /clients

A table of all clients. Source: BigQuery Meta (Adam's catalog) via a Python serverless function.

Columns: Name · Abbreviation · Owned Domains count · Competitor Domains count · Projects count · Status. Click name → /clients/[id].

Sample rows (16 total):

| Client | Abbr | Domains | Competitors | Projects | Status |
|---|---|---|---|---|---|
| Dental Shop | DS | 2 | 0 | 0 | Active |
| Global Charter Services | GCS | 5 | 0 | 2 | Active |
| Phil Lasry Photography | (none) | 1 | 0 | 0 | Active |
| Transport Network Australia | TNA | 4 | 13 | 6 | Active |

Above the table: search box, "Sourced from BigQuery Meta" caption, link to admin portal for create/edit operations.

### 5.3 /clients/[id]

Single client detail. Sections (stacked):

1. **Client details** — name, abbreviation, created date, notes
2. **Owned domains** — table (domain, name, priority, status)
3. **Projects** — table (id, type, name, status, created date)

Header: client name, status pill, "Sourced from BigQuery Meta · Edits in admin portal" caption with link.

(Competitors used to be a section here. They've moved to the property level — see 5.5.)

### 5.4 Property layout (wraps 5.5–5.9)

A persistent header + tab strip across all property routes.

```
┌─────────────────────────────────────────────────────────────┐
│ TNA                                                         │
│ BusCharter                                       [Phase 2]  │
│ buscharter.com.au                                           │
├─────────────────────────────────────────────────────────────┤
│ Brand DNA   Pages   Keywords   Projects                    │
└─────────────────────────────────────────────────────────────┘
```

Tab list is **adaptive** based on which project types are active on this property (see §6).

### 5.5 /properties/[slug] (Brand DNA tab)

A vertical grid of cards, one per Brand DNA section. Each card:

```
┌─────────────────────────────────────────────────────────────┐
│ Identity                              gpt-4o · conf 0.92    │
├─────────────────────────────────────────────────────────────┤
│ <click-to-edit fields>                                       │
└─────────────────────────────────────────────────────────────┘
```

**Editing model — IMPORTANT:**

- For sections with structured `content` (typed fields), the editor inspects each value and shows the right input:
  - short strings (≤80 chars) → single-line input
  - long strings → autosizing textarea
  - numbers → number input
  - string arrays → chip list with click-to-edit / X-to-remove / + add
  - objects/nested → JSON textarea with parse validation
- For sections with prose `body`, a markdown-flavor autosizing textarea.
- Click a field to enter edit mode. Blur or Cmd-Enter to save. Each save is one row update.
- A trigger snapshots the previous state into `brand_dna_section_history` on every edit. (History viewer UI is pending.)

**Source/confidence metadata:** When generated by an inference pipeline (OpenAI gpt-4o, Anthropic, Gemini, etc.), the source provider name + confidence score are shown in small text in the card header. Hand-edited sections clear these.

**Competitors card** — special case:
- Read-only (no edit affordances).
- Sourced from BigQuery Meta. Labeled "BQ Meta · read-only" in header.
- Shows the BQ Meta client name as context ("13 competitors of Transport Network Australia").
- Renders a simple table: domain, name, priority.

### 5.6 /properties/[slug]/pages (Pages Triage tab)

A table of every URL on the property's site with an "audit_action" decision.

Action values (audit triage decisions): `optimize · restore · redirect · consolidate · remove · keep · no_action · undecided`.

Columns: URL · Type (page_type: blog / service / contact / etc.) · Status Code · **Action** · Word Count.

Inline-editable action: click the action pill, get a dropdown, save on change. The action pills are colored:
- optimize → blue
- restore → green
- redirect → amber
- remove → red
- keep → slate
- undecided → light gray

Top of table: small "X pages" count. Filter bar (status code, action, page type) would be a nice add but isn't built yet.

Real sample data exists for: Phil Lasry (42 pages), BusCharter (1,096), TNA Bus Hire (608), Mini Bus Hire AU (199).

### 5.7 /properties/[slug]/keywords (Keywords tab — placeholder)

Currently empty state. Future: keyword universe per property, with cluster assignments, search volume, opportunity scoring, and competitive gap markers. Adam's Phase 3 keyword aggregate pipeline will populate this.

Renders only when an SEO project is active on the property (see §6).

### 5.8 /properties/[slug]/projects (Projects tab)

A table of projects this property is part of. Sourced from BigQuery Meta (project + project_domains tables) matched by domain.

Columns: Type · Name · Status · Matched on (which of the property's domains caused this project to surface) · Role · Priority · Created.

Status pills: active=green, completed=blue, paused=amber.

Empty state when no projects: "Projects are tracked in BigQuery Meta. When Adam (or the pipeline) creates a project linked to one of this property's domains, it will appear here."

### 5.9 /properties/[slug]/campaigns (Campaigns tab — placeholder)

Renders only when a `paid_search` or `paid_social` project is active. Future content: campaign list, budget tracking, geo + audience targeting, ad copy library, landing page register. Not built yet.

---

## 6. Adaptive UI pattern (THE key pattern)

The property layout's tab list adapts to which project types are active on that property. Always-on tabs: **Brand DNA · Pages · Projects**. Conditional tabs based on project type:

| Active project type | Adds tabs |
|---|---|
| `seo` (or `seo_pipeline` for backwards compat) | + Keywords |
| `paid_search` or `paid_social` | + Campaigns |

Project types are fetched from BigQuery Meta for the property's primary_domain. Cached 60s so tab navigation inside one property doesn't re-hit the function.

**Examples in current data:**

| Property | Active project types | Tabs shown |
|---|---|---|
| `phil-lasry` (Phil Lasry / plasry.com) | none | Brand DNA · Pages · Projects |
| `buscharter` (TNA / buscharter.com.au) | seo_pipeline ×3 | Brand DNA · Pages · **Keywords** · Projects |
| `tnabushire` (TNA / tnabushire.com.au) | seo_pipeline (inherited via client) | Brand DNA · Pages · **Keywords** · Projects |
| `busbank` (GCS / busbank.com) | none | Brand DNA · Pages · Projects |

---

## 7. Cross-cutting features

### 7.1 Sidebar — clients with their properties

The properties section groups by client:

```
PROPERTIES
  Phil Lasry · plasry.com [P3]
  TNA
    BusCharter [P2]
    TNA Bus Hire [P3]
    Mini Bus Hire AU [P1]
  Kitchen Services of San Diego
    Kitchen Services SD
    Kitchen Services DFW
  BusBank [P0]
  ...
```

Each leaf clickable to `/properties/[slug]`. Phase badge (P0–P6) at right.

### 7.2 Related clients

`related_clients[]` is a uuid array on each client. Example use: Kitchen Guard Inc (corporate) is related to Kitchen Services of San Diego (franchisee), and to Kitchen Services of Provo (franchisee). The clients are NOT parent-child — they're independent legal entities. The affinity is shown on the client detail page as a small linked list near the bottom. Future UI item.

### 7.3 Brand DNA inheritance (property to property)

A property can have `brand_voice_inheritance = 'parent'` and `parent_property_id` pointing at another property. UI implication: on the child's Brand DNA tab, sections inherit values from the parent (rendered slightly grayed/muted with a "inherited from X" badge), and the user can override per-section. The override creates a new local row.

Example: KS Provo at `kitchenguard.com/provo` inherits from Kitchen Guard Corporate's property at `kitchenguard.com`. KS Provo overrides the **identity** + **personas** sections (location-specific) but inherits everything else.

Future UI item. Schema is ready; no data populates this yet.

### 7.4 Brand DNA history viewer

Every edit to a Brand DNA section snapshots the prior state into `brand_dna_section_history` via a trigger. Future UI: a small "history" affordance per section that opens a panel showing the last N edits (timestamp, who, what changed) with a revert button per snapshot.

### 7.5 Status pills (color rules)

Consistent across all entities:

| Status | Color |
|---|---|
| active | emerald (`bg-emerald-100 text-emerald-700`) |
| completed | blue |
| paused | amber |
| inactive / offboarded | slate |
| prospect | light blue / outlined |
| error / blocked | rose |

Action pills (pages triage) use a different palette to avoid confusion with status.

---

## 8. Five realistic scenarios (use these to validate the design)

### Scenario A: Simple — one client, one property, one project
Phil Lasry. One client (Phil Lasry LLC), one property (plasry.com, 42 pages), planning to start an SEO project. Vanilla case.

### Scenario B: One brand with a parked secondary domain
Dental Shop. Primary site at `thedentalshop.com`. Secondary domain `thedentalshop.us` parked but monitored — could be a sibling URL in `additional_domains[]` (same site, redirects) OR a second property with `status='inactive'` if independently monitored. Design should support both.

### Scenario C: Multi-property portfolio under one client
TNA. One client (TNA Pty Ltd), three properties (BusCharter / TNA Bus Hire / Mini Bus Hire AU) each at its own domain. One SOW funds all three. Each property progresses through its own pipeline. Client detail page should show a portfolio summary (count of properties, aggregate pages, phase distribution). No umbrella project entity — each property has its own SEO project.

### Scenario D: Franchise corporate with subfolder microsites
Kitchen Guard Corporate at `kitchenguard.com`. The corporate site has 53 franchise microsites at `kitchenguard.com/austin`, `kitchenguard.com/seattle`, etc. Each is ~8 pages with its own brand DNA but inheriting from corporate. **Child-property model**: each franchise = separate property row sharing the `kitchenguard.com` domain, distinguished by `url_prefix='/austin'`. Brand DNA inherits via `parent_property_id` → KG Corporate's property. A "Locations" tab on the corporate property would list all child properties.

### Scenario E: Franchisee with their own SOW, single channel
Kitchen Services of Provo (legal: Tacoma Legacy Partners LLC). Their property is `kitchenguard.com/provo` — a subfolder of KG Corporate's site, distinguished by `url_prefix`. They hire Skyward for paid search ONLY (no SEO). On the property page: tabs would be **Brand DNA · Pages · Projects · Campaigns** (no Keywords because no SEO project). Brand DNA inherits from KG Corporate via `parent_property_id` — cross-client inheritance enabled by `related_clients[]` affinity.

---

## 9. What's NOT in scope (parking lot)

- A paid-media campaign management interface (budget tracking, geo + audience definitions, ad copy library) — future module
- Site monitoring / uptime / Lighthouse / Web Vitals widgets — future module
- AI assistant / agent surfaces — eventual but not yet
- A "Signals" view that watches BQ Meta + ranking changes and surfaces things requiring attention — placeholder in sidebar today
- A "Runs" view for executing playbooks — placeholder
- Multi-tenant client-facing views — not happening, this is internal-only
- Native mobile — desktop-only, internal tool

---

## 10. Reference repos

- `skyward-platform-app` — this app (Next.js + Supabase)
- `skyward-common` — shared Python package (BQ + DataForSEO + LLM wrappers)
- `skyward-platform` — Adam's admin portal (FastAPI + Next.js, dark theme) over BigQuery Meta tables

---

## 11. Things to design that I'd value most

In rough priority:

1. A more polished **Brand DNA editor** for the page-builder feel. Today it's functional but utilitarian — every section is its own Card with click-to-edit fields. Could be more visual: a personality module up top showing the brand's "voice signature," competitor positioning matrix, persona avatars.

2. A **portfolio summary view** on the client detail page that visualizes property states across the pipeline phases (P0-P6). For TNA with 3 properties, this should communicate "all three on the same SEO pipeline at different stages."

3. **Brand DNA inheritance UI** — when a child property inherits from a parent, how do you make the inheritance visible without cluttering the page? Show inherited sections grayed? Hide entirely with a "5 sections inherited from KG Corporate" summary? Toggle to expand?

4. A **history viewer + revert** for any Brand DNA edit. The data exists; the UI doesn't. Should feel safe (no accidental reverts) and educational ("what did the AI say two weeks ago that we overrode?").

5. A **Locations tab** for franchise-corporate properties (Scenario D) — a hierarchical view of child properties with quick status at a glance.

6. The **adaptive tab strip** could be more elegant. Today it's flat text links. Could be more visually grouped (SEO cluster · Paid cluster · Project meta).

---

## 12. Sample data block (paste-ready)

```yaml
clients:
  - name: "Phil Lasry"
    legal_name: "Phil Lasry LLC"
    primary_contact: "Phil Lasry"
    status: active
    properties:
      - { name: "Phil Lasry", primary_domain: "plasry.com", pipeline_phase: 3, pages: 42 }

  - name: "TNA"
    legal_name: "TNA Pty Ltd"
    primary_contact: "Wade"
    status: active
    properties:
      - { name: "BusCharter",      primary_domain: "buscharter.com.au",   pipeline_phase: 2, pages: 1096 }
      - { name: "TNA Bus Hire",    primary_domain: "tnabushire.com.au",   pipeline_phase: 3, pages: 608 }
      - { name: "Mini Bus Hire AU", primary_domain: "minibushire.com.au", pipeline_phase: 1, pages: 199 }
    sow:
      id: "SOW v2"
      shipped: "2026-03-30"
      covers_all_properties: true

  - name: "Kitchen Guard"
    legal_name: "Kitchen Guard Inc"
    primary_contact: "Molly Lombardo"
    status: prospect
    properties:
      - { name: "Kitchen Guard Corporate", primary_domain: "kitchenguard.com", url_prefix: null }
    related_clients: ["Kitchen Services of Provo", "Kitchen Services of San Diego"]

  - name: "Kitchen Services of Provo"
    legal_name: "Tacoma Legacy Partners, LLC"
    primary_contact: "RJ Schultz"
    status: prospect
    properties:
      - name: "Kitchen Services of Provo"
        primary_domain: "kitchenguard.com"
        url_prefix: "/provo"
        brand_voice_inheritance: parent
        parent_property: "Kitchen Guard Corporate"
    related_clients: ["Kitchen Guard"]

  - name: "Dental Shop"
    primary_contact: "Andrea Phillips"
    status: active
    properties:
      - name: "Dental Shop"
        primary_domain: "thedentalshop.com"
        additional_domains: ["thedentalshop.us"]   # parked

brand_dna_sample:  # one property's Brand DNA, abbreviated
  property: "Phil Lasry"
  sections:
    identity:
      content:
        name: "Phil Lasry"
        category: "Real estate photography"
        location: "Greater Chicago"
        founded: 2018
    voice_tone:
      content:
        traits: ["confident", "warm", "technical"]
        avoid: ["jargon", "salesy", "passive"]
    brand_terms:
      content:
        canonical: "Phil Lasry"
        variants: ["Phil Lasry Photography", "PL Photo"]
    proof:
      content:
        case_studies: 12
        testimonials: 34
        awards: ["Chicago Choice 2025"]

projects_sample:  # BQ Meta projects (real)
  - { property: "buscharter",    type: seo_pipeline, name: "qa_test_001",     status: active }
  - { property: "buscharter",    type: seo_pipeline, name: "e2e_test_001",    status: active }
  - { property: "buscharter",    type: seo_pipeline, name: "zz_qa_test_kga",  status: active }
  - { property: "busbank",       type: seo_pipeline, name: "production-gcs",  status: active }
```

---

End of brief. Hand this to Claude Design (or any design partner) with: "Design version 2 of this app's UI/UX. Use the IA + page specs + scenarios verbatim. Treat visual style as open — propose something more polished than the current Tailwind defaults."
