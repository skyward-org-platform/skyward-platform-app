---
title: UI Organization Spec v1
status: draft
version: v1 | 2026-05-06
owner: Paul Skirbe
related:
  - operations/seo-platform/specs/supabase-schema-spec-v1.md
  - operations/seo-platform/specs/brand-dna-brain-spec-v1.md
  - operations/seo-platform/research/tryggvi-stack-notes-v1.md
  - operations/external-training/tryggvi-rafn/pipeline-vs-tryggvi-comparison-v1.md
  - operations/process-library/1. seo-pipeline/sop/phase-0-setup/sop_phase_0_client_onboarding.md
  - operations/process-library/1. seo-pipeline/sop/phase-1-wqa/website-quality-audit-sop-v5.md
  - operations/process-library/1. seo-pipeline/pipeline-structure-v2.md
---

# UI Organization Spec v1

## Purpose

Defines how the Skyward SEO Platform UI is organized: the navigation shell, the per-property information architecture, the relationship between the Next.js app and Claude Code skills, and the build order for shipping each surface. The schema (`supabase-schema-spec-v1.md`) defines what data exists; this spec defines how humans see and act on it.

The first concrete surfaces are the **Phase 0 + Phase 1 UIs** (Brand DNA editor + Pages Triage), which replace the existing Phase 0 BigQuery tables and the WQA Excel workbook respectively.

## Scope of v1

**In scope**
- App shell (sidebar, top bar, command palette)
- Per-property information architecture (5 JTBD tabs)
- Cross-property workspace surfaces (Home, Signals, Runs)
- Skill-firing model (app vs Claude Code split)
- Build order across 8 phases
- Detailed design for the first surface (Phase 0 + Phase 1: Brand DNA + Pages Triage)

**Out of scope (later versions or other specs)**
- Detailed component-level designs for Strategy, Discovery, Execution, Performance beyond what ships in P0 and P1
- Visual design system / theming (handled at implementation time, shadcn baseline)
- Mobile layouts (desktop-first in v1)
- Client-facing logins (internal-only in v1; schema supports it for v2)
- Realtime subscriptions on signals (polling is fine for v1)

## Locked decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Primary problem | Per-property context unification | Today brand DNA, audit decisions, brain entries live across markdown, ClickUp, BigQuery, session notes. UI is anchored on the Property page |
| 2 | Property page IA | Job-To-Be-Done (5 tabs) | Overview / Strategy / Discovery / Execution / Performance. Scales as new entities are added |
| 3 | Shell pattern | Persistent sidebar | Cross-property triage one click away; supports 15+ properties without nav fatigue |
| 4 | Skill firing | Hybrid | Quick + signal-driven skills fire from app buttons; long phase runs stay in Claude Code; unified timeline via `playbook_runs` |
| 5 | Property list | Client-grouped | TNA expands to 3 properties; single-property clients render flat. Multi-domain native |
| 6 | Editing model | Forms + agent assist | Structured forms by default, with Research & Fill button + Brand DNA Assistant chat for power-fill |
| 7 | Source of truth | Supabase | Markdown export to `delivery/{slug}/` for git history, but DB is canon |
| 8 | Embeddings | OpenAI `text-embedding-3-small` | See schema spec |

## Tab structure: per-property page

Five tabs per property, in order:

| Tab | Schema entities | What it surfaces |
|---|---|---|
| **Overview** | aggregations | Pipeline phase, recent edits, signal count, run count, key stats |
| **Strategy** | brand_dna_section, project_brain_entry | Brand DNA editor (Phase 0 onboarding output), Project Brain typed entries |
| **Discovery** | page, keyword, cluster | Pages triage (Phase 1 WQA), Keyword Universe (Phase 3 in pipeline), Clusters |
| **Execution** | brief, playbook_run | Briefs lifecycle, playbook run timeline, fire-buttons for quick playbooks |
| **Performance** | keyword.rank_history, signal | Per-property rankings, per-property signal queue, opportunity bands |

## Shell + sidebar

```
┌──────────────────────┬────────────────────────────────────┐
│ Skyward SEO  v0.1    │ Breadcrumb · Contextual actions    │
├──────────────────────┼────────────────────────────────────┤
│ 🔍 Search… ⌘K        │                                    │
│                      │                                    │
│ WORKSPACE            │                                    │
│  🏠 Home             │                                    │
│  ⚡ Signals       8  │      Main pane                     │
│  ▶ Runs    2 active  │      (Home / Signals / Runs        │
│                      │       or Property page)            │
│ PROPERTIES   + New   │                                    │
│  ★ Pinned            │                                    │
│   phil-lasry    P3   │                                    │
│  ▼ TNA           3   │                                    │
│   tnabushire    P2   │                                    │
│   buscharter ● P2    │                                    │
│   minibushire   P1   │                                    │
│  ▶ Kitchen Svc.SD 2  │                                    │
│   busbank       P4   │                                    │
│   + 8 more…          │                                    │
│                      │                                    │
│ ──────────────────── │                                    │
│ 🅟 Paul Skirbe   ⚙   │                                    │
└──────────────────────┴────────────────────────────────────┘
```

**Sidebar elements:**
- Workspace nav (Home, Signals badge, Runs status)
- Search at top (⌘K command palette: searches properties, briefs, brain entries, signals across all properties)
- Pinned properties section (1-3 hot properties, persisted per-user)
- Client-grouped property list (multi-property clients collapsible, single-property clients render flat)
- Phase badges per property (P0-P6, color-coded by phase color)
- Alert dots when a property has unhandled signals
- Account footer with settings access

**Top bar:**
- Breadcrumb (workspace › property › section › sub-section)
- Contextual actions on the right (varies by view)
- Deliberately minimal to avoid competing with the sidebar

## Cross-property workspace views

### Home

Three zones, deliberately spare:

1. **Needs your attention** (full width). Top 3-5 highest-priority signals across all properties. Click row to act. Color-coded by signal type.
2. **In flight**. Active + recent playbook runs across all properties. Live status (running / queued / done). Click for run detail.
3. **Portfolio**. Distribution of properties across phases (bar chart) plus a recent-edits feed.

Deferred zones (add if a daily-look-at thing emerges): upcoming meetings, content calendar, contract status, weekly KPI summary.

### Signals

Cross-property triage queue. Same data as Home Zone 1 unfiltered. Filterable by property, signal type, age, priority. Sortable. Bulk-select to fire playbooks across many at once. History of dismissed/handled signals retained for audit.

### Runs

Cross-property playbook run history. Same data as Home Zone 2 unfiltered. Full status timeline, error logs, output artifacts. Click into a run to see input/output/artifacts.

## Skill firing model

Hybrid. Two firing paths, one timeline:

**App fires** (button-click in UI):
- Information-gain brief on a top-20 signal
- Single-keyword scoring + relevance reason
- Brand DNA "Research & Fill" agent
- Brief approval / status transitions
- Re-crawl a property
- Bulk audit-action assignment

**Claude Code fires** (terminal):
- `/phase-0-onboarding` (multi-step, conversational)
- `/phase-1-wqa` through `/phase-6-tracking` (long, multi-step)
- `/lead-engagement`, `/seo-audit`, `/competitor-analysis` (multi-output)

**Shared timeline:** Both paths write to `playbook_runs`. The Runs page in the app shows fires from either source in chronological order with status, input, output, and artifact paths. Claude Code reads from the same table when invoking skills, so app users and terminal users see each other's work.

## Build order

Eight phases. P0-P6 ship in series; P7 is ongoing polish. Estimates are rough.

| Phase | Scope | Est. | Critical? |
|---|---|---|---|
| **P0** Ingest | Crawler populates `page` + `brand_dna_section` (inference). Auth, app foundation, Supabase migration #1, backfill phil-lasry | ~2 wks | Yes |
| **P1** Surface | Property page shell + Pages Triage + Brand DNA editor + Project Brain | ~2 wks | Yes (highest-leverage) |
| **P2** Discovery (extended) | Keyword Universe + Clusters + cluster detail panel | ~2-3 wks | High |
| **P3** Execution | Briefs lifecycle + Playbook Runs view + quick-fire skill buttons | ~2 wks | Medium |
| **P4** Performance + cross-property | Per-property rankings, cross-property Signals + Runs pages | ~1.5 wks | Medium |
| **P5** Home + Command Center | Three-zone Home dashboard + Tryggvi-style Playbooks (batch fire opportunities) | ~1.5 wks | Medium |
| **P6** Cross-cutting | ⌘K command palette, pinned, notifications, settings, admin user mgmt | ~1.5 wks | Low |
| **P7** Optional | Mission Control real-time agents, in-app rich-text editor for briefs | ongoing | No |

**Critical path:** P0 → P1. Once P1 ships, Adam's pipeline can read Brand DNA from Supabase as context and every downstream skill gets smarter immediately. P2-P6 extend value without blocking that win.

**Total time-to-real-value:** ~4 weeks (P0 + P1).
**Time to feature-complete v1:** ~10-12 weeks (P0 through P6).

## Phase 0 + Phase 1 surfaces (first build, detailed)

This section details the two views that ship in P1, since they're the first concrete UIs.

### Phase 0 surface: Brand DNA editor + Project Brain

**Replaces:** the 6 Phase 0 BigQuery tables (`projects`, `services`, `competitors`, `seed_keywords`, `personas`, `data_access`), the persona slides PowerPoint, and the scattered intake artifacts.

**Lives at:** Property page › Strategy tab › Brand DNA sub-tab

**Layout:**
- Section pills across the top: Identity ✓ · Voice & Tone · Offerings (n) · Personas (n) · Brand Terms (n) · Proof (n) · Competitors (n) · Future Audience · Site Structure · Goals
- Visual completion state per pill: ✓ complete · count (in-progress) · *empty* (amber) · *partial* (amber)
- Form fields per section (one section visible at a time)
- Source tag on each field/section: `intake form` / `inferred` / `manual`
- "Updated by paul · 4d ago" timestamp
- Right rail with Research & Fill button + Brand DNA Assistant chat
- Markdown sync line at bottom: `delivery/phil-lasry/00-brand-dna.md` (generated on save)

**Mapping from existing Phase 0 BQ tables:**

| Existing BQ table | Brand DNA section |
|---|---|
| `projects` (domain, industry, locations, engagement) | Identity + Goals |
| `services` (catalog with vertical tagging) | Offerings |
| `competitors` (with priority) | Competitors |
| `seed_keywords` (operator-seeded) | Offerings.keywords_seed |
| `personas` (with journey-stage keywords) | Personas |
| `data_access` (credentials, access) | Stays operational; not in Brand DNA |

**New sections beyond Phase 0:**
- Voice & Tone (style guidance, reading level, do's and don'ts)
- Brand Terms (always-use, never-use, variants)
- Proof (case studies, testimonials, certifications, awards, press)
- Future Audience (Tryggvi's "who they want to be in 18 months")
- Brand Story / Positioning narrative

**Inference pipeline** (the "Research & Fill" agent):
1. Reads the `page` table for this property (already populated by crawl)
2. Reads any existing intake form imports
3. Reads competitor pages if listed
4. Calls OpenAI with structured-output prompts to infer values for the new sections (voice, brand terms, proof, future audience, site structure)
5. Writes proposed values to `brand_dna_section.content` with `source = 'agent:research_fill'` and `confidence` score
6. Human reviews and edits in the form

**Brand DNA Assistant** (conversational mode):
- Chat interface with Claude
- Asks questions tailored to which sections are empty or partial
- Updates `brand_dna_section` rows as the conversation progresses
- Mode B in the Brand DNA spec authoring workflow

### Phase 1 surface: Pages Triage

**Replaces:** the WQA Excel workbook (Tab 11 + the per-URL action assignment tabs).

**Lives at:** Property page › Discovery tab › Pages sub-tab

**Layout:**
- Audit-action filter chips with counts: All · Optimize · Restore · Redirect · Remove · Consolidate · Keep · **Undecided** (amber)
- Search bar (URL, title)
- Top-right actions: Re-crawl, Export workbook (client deliverable)
- Sortable data table:
  - Checkbox (bulk select)
  - URL (with title underneath)
  - Page Type (color-coded chip)
  - Status code (200 / 404 / 301 etc.)
  - Audit Action (inline-editable dropdown, color-coded)
  - GSC Clicks 90d (sortable, right-aligned)
  - Decided (decided_by + age)
- Footer: row counts ("Showing 7 of 412 · 34 undecided · 12 changed in last 24h")
- Bulk action bar (visible when rows are selected): assign action, assign owner

**Editing model:**
- Inline `audit_action` editing via dropdown (Optimize / Restore / Redirect / Remove / Consolidate / Keep / Undecided)
- On change, write back to Supabase + invalidate row, no modal needed
- Optional notes field accessible via row expand or detail side panel
- Undo via row history (last decided_by + decided_at on change)

**Workbook export:**
- Client deliverable still works: button generates the existing 12-tab WQA workbook from current Supabase state
- Adapter reads from Supabase, writes XLSX, uploads to client Google Drive
- Replaces today's manual workbook curation; Excel is now a derived artifact, not the source of truth

## Open questions

1. **Brand DNA inference agent placement.** Lives in Adam's pipeline package as a Python module after crawl, or as a separate Claude Code skill called by the pipeline, or as a Cloud Run job? Open until Adam walkthrough.
2. **Existing intake form Excel sync direction.** Should the Excel intake stay primary (with Brand DNA mirroring it), or does Brand DNA become primary (with Excel as a generated export)? Lean: Brand DNA primary, Excel becomes a populate-once seed and a regenerable export.
3. **Persona slides PowerPoint.** Today `00c_generate_persona_slides.ipynb` builds slides from the BQ `personas` table. Should this stay as a separate notebook output, or get rolled into a "Generate kickoff deck" button in the app that renders from `brand_dna_section`?
4. **Property creation flow.** When onboarding a new client, where does the human start: app or Phase 0 onboarding skill? Probably the skill (it owns intake import), but the app needs at least a "+ New property" entry point in the sidebar.
5. **Multi-property brand DNA inheritance.** TNA has 3 properties. Do they share any brand DNA at the client level, or are they fully independent? Schema has `property.brand_voice_inheritance` flag (parent / override / none) for this; UI surface for it not yet designed.

## Definition of Done (for the spec)

- [x] Shell + sidebar designed
- [x] Per-property tab structure defined
- [x] Cross-property views scoped
- [x] Skill firing model defined
- [x] Build order with estimates
- [x] First-build surfaces detailed (Phase 0 + Phase 1)
- [ ] User reviews and approves
- [ ] Transition to writing-plans for P0+P1 implementation

## Next steps

1. User review of this spec.
2. After approval: invoke `superpowers:writing-plans` to create the P0+P1 implementation plan.
3. Walk Adam through the schema spec + this UI spec for sign-off on the inference agent placement (Open Question #1).
4. Spin up `seo-platform-dev` Supabase project + apply migration #1.
5. Bootstrap the Next.js app with shadcn baseline.
6. Backfill phil-lasry from existing WQA workbook + run Brand DNA inference for the new sections.
7. Build the Property page shell + Pages Triage + Brand DNA editor.
8. Use the app for the next live WQA (likely the next active client) instead of Excel.
