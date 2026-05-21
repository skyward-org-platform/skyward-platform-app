# v2 Screens

One entry per screen designed in `v2-ui-mockup.html`. Read this when implementing or modifying a surface — the rationale paragraphs are the design's own justification and should not be paraphrased loosely.

Route mapping is the proposed implementation route. **All routes stay within the existing `client → property → project → page` hierarchy** per the change-log directive: *"This is purely a frontend reorganization; nothing in the Python or schema layer would need to move."*

Data dependencies note where the screen reads from. Almost all reads from Supabase (`property`, `page`, `brand_dna_section`, `project_brain_entry`) and BigQuery `Meta.*` (via the Vercel Python functions in `web/api/`) are existing — see anti-goals.

---

## 1 · Workspace Dashboard

- **Route:** `/`
- **Replaces:** today's "Welcome." page that just says "Pick a property from the sidebar"
- **Purpose:** the strategist's landing page — who's active, what's progressing, what needs attention
- **Key sections:**
  - 4-up stat tile row: Active clients · Properties in pipeline · Pages triaged this month · Brand DNA edits
  - `split-2` lower section:
    - Wide (2fr): Active engagements table — one row per active client, phase strip inline, last-activity timestamp
    - Narrow (1fr): Signals card (severity-tiered list with action affordance) + Recent activity feed
- **Data dependencies:**
  - Active client count: `MetaClient.list_clients()` filtered `is_active=true`
  - Properties / phases: Supabase `property` table
  - Pages triaged this month: Supabase `page` filtered on `audit_decided_at`
  - Brand DNA edits: Supabase `brand_dna_section_history` (count of recent snapshots)
  - Signals: **mock for now** — real signals (ranking deltas, stale audits) depend on infra not yet in place. Mark `// TODO: signals data` per the brief
  - Activity feed: new Supabase view that UNIONs recent `brand_dna_section` updates + recent `page.audit_decided_at` changes
- **What's new:** the four big-number stats anchor the page. The active engagements table shows where every client sits on the 7-phase pipeline as a visual strip. Signals finally has data — pulled from ranking deltas, stale audits, and Brand DNA changes that need approval. The two-column lower split keeps "what's active" wide and supplementary feeds narrow.

---

## 2 · Clients list

- **Route:** `/clients`
- **Replaces:** today's plain client list
- **Purpose:** scannable engagement-aware client roster
- **Key sections:**
  - Topbar filter chips (segment by channel · status · region)
  - Table columns: Client · Active channels (chip cluster: SEO / Paid Search / Paid Social) · Properties (count) · Pipeline coverage (small stacked bar) · Status pill · Last activity
  - Prospect clients get a muted row treatment
- **Data dependencies:**
  - Client list: `MetaClient.list_clients(include_counts=true)` (BQ Meta via Python fn)
  - Active channels: derived from `Meta.projects` joined to clients — count active projects by `project_type` per client
  - Pipeline coverage: per-property `pipeline_phase` from Supabase; aggregate to a per-client distribution
- **What's new:** the "Active channels" column shows which project types are live (SEO / Paid Search / Paid Social), so you can see at-a-glance which clients are multi-channel. The Pipeline coverage column visualizes how far through the 7-phase pipeline each client is via a small stacked bar. Prospects get a muted row treatment so they're clearly distinct from active. Filter dropdowns in the topbar replace today's lack of filtering.

---

## 3 · Client detail — multi-property portfolio

- **Route:** `/clients/[id]`
- **Replaces:** today's three-stacked-tables client page
- **Purpose:** portfolio-first view for multi-property clients (TNA is the test case)
- **Key sections:**
  - 5-up top-line stat row: properties · pages · avg phase · projects · competitors
  - Properties as cards (prop-card grid) — each with its own pipeline strip
  - Owned domains table (kept from today)
  - Active projects table (kept from today)
  - Placeholder for "related clients" (will matter for Kitchen Guard later — `client.related_clients` is already in the schema)
  - **Removed:** standalone competitor section (moved to property level per the 2026-05-14 hierarchy framework)
- **Data dependencies:**
  - Client + owned domains: `MetaClient.get_client(id)` + `.get_client_domains(client_id)` (existing Python fn at `/api/clients/[id]`)
  - Per-property phase: Supabase `property.pipeline_phase`
  - Page counts per property: aggregated from Supabase `page` per property
  - Projects: `Meta.projects` filtered by client_id
- **What's new:** the portfolio finally looks like a portfolio. Five top-line stats summarize the engagement at a glance (3 properties, 1,903 pages, P2 avg, 3 projects, 13 competitors). Properties become cards with their own pipeline strip — visually obvious which is leading vs. lagging. The Owned-domains and Active-projects tables stay; competitor section is gone (moved to property level per the framework).

---

## 4 · Property overview (NEW default route)

- **Route:** `/properties/[slug]` ← **STEP 3 of the brief: NEW default landing**
- **Replaces:** today's `/properties/[slug]` which lands on Brand DNA
- **Purpose:** the property's story in one screen
- **Key sections:**
  - `prop-hero` — client breadcrumb, property name + status pill, monospace domain, phase strip with labeled cells (P0–P6), 4-up `prop-hero-meta` row (key metrics)
  - `tabstrip` with cluster separators — Overview · Brand DNA · Pages ⎮ Keywords ⎮ Projects · Project Brain
  - Below the tabstrip (Overview content):
    - Brand snapshot — top Brand DNA sections in read-only mode, click-through to dedicated tab to edit
    - Action distribution histogram — preview of the Pages tab
    - Active projects strip
    - Competitors preview (3-row table)
    - Recent activity feed (5–7 items)
- **Data dependencies:**
  - Property + hero metrics: Supabase `property` table
  - Brand snapshot: top-3 from Supabase `brand_dna_section` filtered to non-empty content
  - Action distribution: aggregate `page.audit_action` counts (already supported)
  - Active projects: `/api/properties/[slug]/projects` (existing Python fn)
  - Competitors: `/api/properties/[slug]/competitors` (existing Python fn)
  - Recent activity: same activity view as Dashboard, scoped to property_id
- **What's new:** a full Property hero (client breadcrumb, name, status, domain, phase-strip with labeled phases, 4 key metrics) replaces today's small left-aligned header. The default tab is Overview, not Brand DNA — Brand DNA, Pages, etc. become explicit destinations. The overview is the at-a-glance view: brand snapshot (top sections only, click to edit on the dedicated tab), action distribution histogram, active projects, competitors preview, recent activity. The tab cluster separator visually groups always-on tabs (Brand DNA, Pages) vs. project-driven tabs (Keywords) vs. meta tabs (Projects).

---

## 5 · Brand DNA

- **Route:** `/properties/[slug]/brand-dna` (Overview default; subnav switches between sections)
- **Replaces:** today's `/properties/[slug]` content (the click-to-edit section cards)
- **Purpose:** the editing surface for a property's Brand DNA, now with explicit structure
- **Subnav** (10 items, ordered by editing journey):
  1. Overview *(no count)*
  2. Identity *(no count)*
  3. Voice & Tone *(no count)*
  4. Offerings *(count: e.g. 11)*
  5. Brand Terms *(count: e.g. 2)*
  6. Site Structure *(no count)*
  7. Commercial Policy *(no count)*
  8. Audiences *(count: e.g. 3)*
  9. Personas *(count: e.g. 4)*
  10. Seed Keywords *(count: e.g. 24)*
- **Overview (the default landing) — three stacked full-width cards:**
  - **Assistant** — live chat with Claude primed with this property's voice + personas + goals. Monogram bubbles for user, sparkle + soft violet bubbles for assistant, typing indicator.
  - **Research & Fill** — descriptive copy + animated sweeping progress bar + 4-step status list (checkmarks done / pulsing dots current / muted pending). Fire-and-forget pipeline that fills empty sections.
  - **Completeness** — circular gauge with serif % in the middle + 12-section status checklist as completeness chips (green filled / violet inherited / dashed empty) + "next up" recommendation.
- **Data dependencies:**
  - All sections read/write `brand_dna_section` (existing) keyed on (property_id, section)
  - Inheritance: `property.parent_property_id` resolves which property to inherit from
  - History: existing `brand_dna_section_history` trigger captures snapshots
  - Assistant: backend not built yet — V2 horizon
- **What's new:** Brand DNA gets a 10-item subnav below the main tabstrip — peer items, ordered by editing journey. Counts shown on countable items only. The active item gets an elevated white pill. Overview is the strategist's first move when opening Brand DNA — Assistant + Research & Fill + Completeness.

---

## 6 · Pages triage

- **Route:** `/properties/[slug]/pages`
- **Replaces:** today's flat URL table
- **Purpose:** decision-distribution-first triage with click-to-filter
- **Key sections:**
  - 7-cell action distribution histogram at top — clickable cells scope the table below
  - "Review" cell (undecided action) is visually distinct (warm yellow)
  - Page actions (Filters · Bulk action · Export) in the header
  - Table with secondary subtitle per row (page title under URL) — URL isn't the only identifier
  - Redirect / consolidate rows show their target inline
  - Undecided rows get a warm-yellow row background
- **Data dependencies:** unchanged from today — Supabase `page` table filtered by property_id, paginated. `updateAuditAction` server action already exists.
- **What's new:** the action distribution histogram at top doubles as a filter — click any cell to scope the table. The "Review" cell is visually distinct (warm yellow) to draw the eye to undecided work. Each row gets a secondary subtitle (the page title) so URLs aren't the only identifier. Redirect / consolidate actions show their target inline. Undecided rows get a warm-yellow row background for the same reason. Page actions in the header (Filters, Bulk action, Export) make batch operations a first-class workflow.

---

## 7 · Projects

- **Route:** `/properties/[slug]/projects`
- **Replaces:** today's table of BQ Meta rows
- **Purpose:** projects as a stream of work-in-flight
- **Key sections:**
  - 2-column card grid
  - Each card: project type/name + current phase as labeled progress strip + key outputs + last-activity hook + direct links to artifacts
  - Dashed "Start new project" card at the end (create flow deferred to admin portal during prototype phase)
- **Data dependencies:** unchanged — `/api/properties/[slug]/projects` (existing Python fn → BQ Meta `projects` + `project_domains`).
- **What's new:** projects render as cards in a 2-column grid, not a flat row of metadata. Each card surfaces the project's current phase as a labeled progress strip. "Last activity" gives a hook for "what's actually happening here." A dashed "Start new project" card sits at the end for the create flow (deferred to admin portal during prototype phase).

---

## 8 · Keywords (future state)

- **Route:** `/properties/[slug]/keywords`
- **Status:** currently a placeholder; v2 design is **speculative** — data layer doesn't exist yet
- **Purpose:** the keyword aggregate landing for the property — what Adam's Phase 3 pipeline produces
- **Key sections (mocked):**
  - 4 stats up top — volume · ranking top 10 · opportunity · competitive gap
  - Top clusters table — each row is a content target (one URL per cluster), with opportunity bar visualization
  - Competitive gap widget
  - Ranking-change widget
- **Data dependencies:** none yet. When Adam's Phase 3 aggregate ships, expected to flow into Supabase `keyword` + `cluster` tables (per the May-8 spec) joined to property via `property_id`.
- **What's new:** the empty placeholder gets replaced with a real workspace. Four key stats up top (volume / ranking top 10 / opportunity / competitive gap). The top clusters table is the operational unit — each row is a content target (one URL per cluster). The opportunity bar gives a quick visual scan. Speculative until Adam's keyword aggregate lands.
- **V1.1 status:** keep the existing placeholder. Don't implement this surface in V1.1 — it's V2.

---

## 9 · Signals

- **Route:** `/signals` (new top-level workspace surface; appears in Sidebar Workspace group with count)
- **Replaces:** the greyed "⚡ Signals" placeholder that's been sitting in the sidebar
- **Purpose:** the team's "what needs attention" inbox — system-detected, severity-ranked, cross-property
- **Distinct from Dashboard signals card:** dashboard is a summary; this is the triage surface
- **Key sections:**
  - 3 severity tiers, each visually banded — **Urgent** / **Watch** / **Info**
  - Urgent rows: type icon + signal title + property tag + detail + detection metadata + action buttons (Snooze · Take action / Open Pages / Review)
  - Watch rows: denser
  - Info rows: single-line
  - Each signal carries source mechanism in its meta line ("why it fired")
  - "Snoozed" tile at the end — defer without losing context
- **Data dependencies:** **does not exist yet.** Requires infra to detect signals (ranking deltas from GSC, stale audits from `page.last_crawled_at`, pending Brand DNA approvals from `brand_dna_section.confidence`). V1.1 implementation note from brief: mock data acceptable, mark `// TODO: signals data`.
- **What's new:** a real surface for the placeholder that's been sitting in the sidebar all session. Three severity tiers (Urgent / Watch / Info), each visually banded. Urgent gets the full treatment. Watch rows are denser. Info is single-line. Each signal carries the source mechanism in its meta line so the user knows why it fired. The "Snoozed" tile creates a way to defer without losing context.

---

## 10 · Activity

- **Route:** `/activity` (new top-level workspace surface; appears in Sidebar Workspace group)
- **Purpose:** chronological audit trail of everything happening across the platform
- **Distinct from Signals:** Signals = "what should happen next." Activity = "what happened."
- **Key sections:**
  - Filter chips up top — narrow by event type
  - Three info densities: **Today** (full treatment: avatar + actor + diff) / **Yesterday** (denser) / **This week** (single-line)
  - Brand DNA edits render inline diffs (`+ B2B-fluent · − casual`)
  - AI events render with violet "AI" avatar + cost line
  - System events use a settings glyph
- **Data dependencies:** new Supabase view that UNIONs:
  - `brand_dna_section_history` (existing — captures every Brand DNA edit)
  - `page` rows with non-null `audit_decided_at` (existing)
  - `project` events from BQ Meta (would need a new endpoint)
- **What's new:** the chronological audit trail. Three info densities. Diffs render inline for Brand DNA edits. AI events render with a violet AI avatar + cost line. System events use a settings glyph. Filter chips up top let the user narrow by event type. Connects to Signals via shared event sources — every signal that fires writes an activity event.

---

## 11 · Brand Identity — form pattern

- **Route:** `/properties/[slug]/brand-dna/identity` (Brand DNA subnav)
- **Purpose:** the Identity section of Brand DNA, rendered as a clean single-page form
- **Key sections:**
  - "Use Research & Fill on Overview" callback at top
  - Stacked-label inputs for short fields (Brand Name, Legal Name, Founded, HQ Location, Operating Locations, Tagline)
  - Prose textareas for long fields (Brand Personality, Brand Story, Target Audience, Positioning, Proof Themes)
  - Save button top-right (primary)
- **Data dependencies:** `brand_dna_section` row with `section='identity'`. Existing `updateBrandDnaContentKey` server action for per-field saves.
- **What's new:** Identity rendered as the reference's form pattern. Single-page form with stacked labels above inputs, prose textareas for the long fields. Save button top-right (primary). Top-of-card callback points back to Research & Fill on the Overview tab. Subnav shows the new 10-item structure (Identity active here).

---

## 12 · Voice & Tone

- **Route:** `/properties/[slug]/brand-dna/voice-tone`
- **Purpose:** the Voice & Tone section, chip-pattern editor
- **Key sections:**
  - Voice in one sentence (text input)
  - Voice traits (chip list with "+ add" affordance)
  - Avoid (chip list with "+ add" affordance)
  - Writing Style (prose textarea)
  - Voice Do's (prose textarea)
  - Voice Don'ts (prose textarea)
  - Save button top-right
  - "Research & Fill on Overview" callback in the subcopy
- **Data dependencies:** `brand_dna_section` row with `section='voice_tone'`. `updateBrandDnaContentKey` per field.
- **What's new:** chip-pattern from earlier preserved (slider pattern from the reference held). Single-page form with the same shape as Identity. The chip list captures vibes; the prose textareas give the AI Assistant concrete patterns to imitate.

---

## 13 · Offerings

- **Route:** `/properties/[slug]/brand-dna/offerings`
- **Purpose:** services and solutions the property sells — the row data that feeds SEO clustering + content roadmap + paid landing pages
- **Key sections:**
  - Table with columns: Name · Type (service | solution) · Brand Relation (owner | partner | reseller) · Status (current | retired | draft) · URL
  - Hover-revealed delete glyph at row end
  - "+ Add offering" affordance at top or bottom
- **Data dependencies:** Each offering is a row in `brand_dna_section.content['offerings']` (jsonb array). Existing `updateBrandDnaContentKey` for the array as a whole; v2 may want per-row CRUD which would be a small server-action addition.
- **What's new:** table pattern adopted from the reference. Columns: Name · Type · Brand Relation · Status · URL, plus hover-revealed delete. Types: service or solution. Brand Relation defaults to owner. Status: current / retired / draft. The row data feeds SEO clustering, content roadmap, and paid landing pages.

---

## 14 · Brand Terms

- **Route:** `/properties/[slug]/brand-dna/brand-terms`
- **Purpose:** keyword-tagging rules — what auto-tags as branded in the Keyword Universe and GSC performance
- **Key sections:**
  - **Branded Terms** table — patterns that auto-tag matching keywords. Columns: Pattern · Match (word | contains) · Brand Type (own_brand initially; expandable to competitor_brand / partner_brand). Header has "+ Add" affordance.
  - **Exceptions** table — patterns NEVER tagged as branded even when a rule above matches. Columns include a Reason field for future-you. Header has "+ Add" affordance.
  - **Top-right actions:** "Clean up product names" (rose tint — maintenance/dedupe) + "✦ Autofill from Brand" (violet tint — suggests terms from Identity tab's Company Name / Tagline). Both soft-tinted, not solid primaries.
- **Data dependencies:** `brand_dna_section.content['brand_terms']` jsonb. New surface so the JSON schema may need iteration — keep flexible.
- **What's new:** Brand Terms is now a keyword-tagging rules surface, not a copy-style guide. Two sections (Branded Terms · Exceptions), each with header (title + subcopy + + Add button) above a table. Branded Terms: patterns that auto-tag. Exceptions: patterns NEVER tagged as branded (with Reason column). Two soft-tinted top-right actions: Clean up product names (rose, maintenance) + Autofill from Brand (violet, AI-suggestion).

---

## 15 · Proof Assets

- **Route:** `/properties/[slug]/brand-dna/proof`
- **Purpose:** structured catalogue of trust evidence — stats, case studies, testimonials, awards — that downstream pipelines (content briefs, landing pages, ad copy) draw from
- **Key sections:**
  - Asset table — Title · Type (stat | case_study | testimonial | award; extensible) · Active · delete affordance
  - Footer: type breakdown + "Run extraction" button (auto-extract proof points from live site copy)
- **Data dependencies:** `brand_dna_section` row with `section='proof'`. content jsonb with an `assets[]` array per the schema.
- **What's new:** Proof is back as its own Brand DNA subnav target, rendered as a structured asset table. Columns: Title · Type · Active + delete. Types: stat, case_study, testimonial, award — extensible. Each row is an attestable claim the Assistant can drop into drafts as evidence. Footer shows a type breakdown + "Run extraction" affordance. The Proof themes field on the Identity tab is the strategic version; this is the tactical asset list those themes draw from.

---

## 16 · Project Brain

- **Route:** `/properties/[slug]/project-brain` (new top-level property tab alongside Brand DNA, Pages, Projects)
- **Purpose:** shared working memory across all agents — known issues, research, decisions, preferences — that every other Brand DNA / Pages / Projects surface reads from when generating outputs
- **Key sections:**
  - "✤ Project Brain" header with cross-cutting tagline
  - Search input + 2 dropdown filters (Categories · Statuses)
  - Vertical card list — each entry:
    - Prose body (the actual knowledge)
    - Source / tool / confidence / date footer
    - Status pill cluster top-right: **category** (known_issue · research · decision · preference) + **state** (working · locked · active)
    - Three action glyphs: ✓ accept · ✗ reject · 🗑 delete
- **Data dependencies:** schema **already exists** — `project_brain_entry` table from `db/supabase/migrations/20260506100400_brain.sql`. Migration defines: type enum (issue | working | research | preference | strategy | insight), title, body, tags, confidence, source, status, superseded_by, related_entries[]. New server actions needed for create/update_state/delete (per Step 7 of the brief).
- **What's new:** Project Brain is a new top-level property tab. Reference-driven layout. Five sample entries shown for BusCharter covering all entry types: known issues from agents, research observations, locked strategic decisions, preference rules. This is the working memory that every other Brand DNA / Pages / Projects surface reads from when generating outputs.
- **V1.1 status:** **Phase 5 (optional)** per the brief. Hold until explicit go-ahead. Requires new server actions and a new route — substantial new product surface.
