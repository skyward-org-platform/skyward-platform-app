---
title: Brand DNA Brain — Spec v1
status: draft
version: v1 | 2026-04-29
owner: Paul Skirbe
related:
  - operations/external-training/tryggvi-rafn/automated-seo-system-podcast-transcript.md
  - operations/external-training/tryggvi-rafn/pipeline-vs-tryggvi-comparison-v1.md
  - operations/process-library/1. seo-pipeline/pipeline-structure-v2.md
---

# Brand DNA Brain — Spec v1

## Purpose

A single per-client artifact that captures everything Skyward needs to know about a business in a structured, machine-readable form. Every downstream phase agent (WQA, Technical, Keywords, Content, Authority, Tracking) reads it to make better decisions. Replaces the scattered context that today lives across intake forms, persona slides, session notes, and Paul's head.

## Why now

- Phase 0 ends with BQ tables and persona slides today. Downstream phases re-derive context from raw data each time. Wasteful and inconsistent.
- Skills like `/lead-engagement`, `/content-brief`, `/phase-3-keywords` would all benefit from one canonical source of business context.
- Tryggvi's tool demonstrates that a structured brand profile is the linchpin for relevance scoring across keywords, pages, and content.
- Cheapest of the six recommended improvements; unblocks the next four (Project Brain, embeddings, keyword universe, info-gain triggers).

## Scope of v1

**In scope:**
- File format and section schema
- File location and naming
- Authoring workflow (how it gets filled)
- Read API for downstream agents (how skills consume it)
- Update workflow and versioning

**Out of scope (future versions):**
- Real-time edits via a web UI
- Per-field confidence scoring (deferred to Project Brain spec)
- Auto-refresh on competitor / SERP changes

## File location

```
delivery/{client}/00-brand-dna.md
```

One file per client. Lives in the client's delivery folder so it's portable, version-controlled with their other deliverables, and visible to anyone working on the account. Phase 0 is responsible for creating it; later phases read it.

## File format

A markdown file with two layers:

1. **YAML frontmatter** — structured facts that agents query directly (services, brand terms, personas list, competitors). Machine-readable.
2. **Body sections** — narrative prose for things that don't fit a schema (brand story, voice & tone guidance, positioning). Human-readable, agent-readable as context.

The split: anything an agent needs to filter or score by goes in frontmatter. Anything an agent needs as flavor / instruction goes in prose.

## Schema (frontmatter)

```yaml
---
client: phil-lasry
domain: plasry.com
version: v1
last_updated: 2026-04-29
last_updated_by: paul
phase_0_status: complete

# Identity
legal_name: Phil Lasry LLC
brand_name: Phil Lasry
founded: 2018
hq_location: New York, NY
operating_locations:
  - New York
  - New Jersey

# What they sell
offerings:
  - name: Service A
    type: service          # service | product | tool | content
    description: One-sentence elevator pitch.
    primary_buyer: persona-key
    price_band: high       # low | mid | high | enterprise
    priority: 1            # 1 = focus, 5 = legacy
    page: /service-a       # canonical URL on the site
    keywords_seed:
      - "primary head term"

# Who buys
personas:
  - key: persona-1
    name: "Mid-market ops director"
    role: decision-maker   # decision-maker | influencer | end-user
    pain_points:
      - bullet
    decision_criteria:
      - bullet
    objections:
      - bullet
    where_they_research:
      - source

# Future state — Tryggvi's "who they want their audience to be"
future_audience:
  horizon_months: 18
  shift: "From X buyer to Y buyer"
  why: "One sentence."

# Brand terminology
brand_terms:
  always_use:
    - "Term A"
  never_use:
    - "competitor-style phrasing"
  variants:
    - canonical: "Term A"
      acceptable: ["Term A's variant"]

# Trust signals
proof:
  case_studies:
    - name
    - name
  testimonials_count: 24
  certifications:
    - cert
  awards:
    - award
  press:
    - publication

# Competitive
competitors:
  - domain: competitor1.com
    type: direct           # direct | adjacent | aspirational
    positioning_vs_them: "We are X, they are Y."
  - domain: competitor2.com
    type: adjacent

# Site structure (high level — full inventory in Phase 0 BQ)
site_structure:
  hub_pages:
    - /services
    - /locations
  page_types_in_use:
    - service
    - location
    - blog
    - resource
  page_types_missing:
    - tool
    - case-study

# Goals & constraints
goals:
  primary_kpi: "qualified leads / month"
  near_term_priorities:
    - bullet
  things_to_avoid:
    - bullet
  scope_constraints:
    - bullet
---
```

## Body sections

Eight required sections, in order. Sections with no content show "TBD" rather than being omitted (so agents can detect gaps).

```markdown
## 1. Brand story
Two to four paragraphs. Origin, mission, what changed in the market that made this business necessary.

## 2. Positioning
One paragraph. What this business is and is not. The shape of the wedge.

## 3. Voice & tone
Bulleted style guidance. Reading level. Do's and don'ts. Examples of "good" and "bad" sentences if available.

## 4. Audience deep-dive
For each persona, expand on the frontmatter with narrative — a day-in-the-life, what they Google, what makes them say yes.

## 5. Offering deep-dive
For each priority offering, expand on the frontmatter — the buyer journey, common questions, conversion path.

## 6. Trust & proof themes
Which case studies / testimonials / metrics carry the most weight, and where they should appear in content.

## 7. Competitive read
What competitors are doing well, what they're doing badly, and where the gaps for us are.

## 8. Skyward strategy notes
Skyward-internal: page types we're prioritizing, any constraints from the SOW, anything a phase agent should know that doesn't fit elsewhere.
```

## Authoring workflow

Three modes — pick based on what's already available.

### Mode A: Manual (Phase 0 today)
1. Paul or Cristina fills the file from intake form, client questionnaire, and Phase 0 Industry Requirements doc.
2. Save as v1, commit.
3. Client reviews the audience + offering + competitive sections in the Phase 0 kickoff deck.

### Mode B: Agent-assisted (recommended default)
1. A Brand DNA Agent reads: site crawl, Ahrefs domain data, intake form, questionnaire.
2. Agent generates v0.1 draft populating as much of the schema as it can from public data, marking gaps as TBD.
3. Human reviews and fills TBDs, corrects errors.
4. Save as v1, commit.

### Mode C: Conversational (Tryggvi's mode)
1. Human launches a "talk to brand DNA" session with the agent.
2. Agent asks questions in order of section priority, fills in answers as it goes.
3. Outputs the file when sections are sufficiently complete.
4. Human reviews, commits.

Mode B is the right default for new clients. Mode A is the floor — always possible, no agent needed. Mode C is best for refresh cycles when you want to iterate fast.

## Read API for downstream agents

Agents consume the file by reading it and parsing the frontmatter. Three usage patterns:

### Pattern 1: Filter / score
"Is this keyword relevant to this client?" → pull `offerings`, `personas`, `competitors`, `goals.things_to_avoid`. Score against keyword. (Powers Phase 3 relevance scoring.)

### Pattern 2: Context injection
"Write a content brief for this URL" → load the entire file into the prompt as system context, then ask for the brief. (Powers Phase 4 briefs.)

### Pattern 3: Structured lookup
"What brand terms must this title contain / never contain?" → pull `brand_terms.always_use` / `never_use`. (Powers technical and content QA.)

Skill integration order (which skills should read it first):
1. `/phase-0-onboarding` — owns creation
2. `/lead-engagement` — same schema applies to prospects
3. `/phase-3-keywords` — relevance scoring
4. `/phase-4-content` — content briefs
5. `/content-brief` — single-keyword briefs
6. `/phase-1-wqa` — page action interpretation
7. `/phase-5-authority` — prospect fit + positioning
8. `/competitor-analysis` — competitive context

## Update workflow

- Bump `version` (v1 → v2) on any structural change to a section.
- Update `last_updated` and `last_updated_by` on every commit.
- Phase 0 owns creation. QBR (Phase 6 quarterly cadence) owns refresh.
- Out-of-cycle updates allowed when client tells us something material (new offering, persona shift, brand voice change). Note the trigger in `## 8. Skyward strategy notes`.

## Versioning beyond v1

| Version | Trigger |
|---|---|
| v1 → v2 | New offering launched / killed; persona priorities change; major positioning shift |
| Within-version edits | Wording tweaks, new case studies, additional brand terms |

Old versions stay in git history; we don't keep `00-brand-dna-v1.md` as a separate file.

## Open questions

1. **Confidence scoring per field.** Tryggvi has it; we deferred to Project Brain. Revisit after Project Brain spec lands.
2. **Storage in BQ.** Should the structured frontmatter mirror to a BQ table (`brand_dna_current` per client) for Looker dashboards and cross-client queries? Probably yes, but not v1.
3. **Prospect vs. client.** Do prospects (lead-engagement) get a lighter `00-brand-dna-prospect.md` schema, or the same one filled with public-data inferences? Lean: same schema, with a `phase_0_status: prospect` flag.
4. **Multi-brand clients.** TNA and BusBank are multi-domain. Does each domain get its own brand DNA file, or do we have a parent brand DNA + per-domain overrides? TNA portfolio precedent suggests per-domain.

## Definition of Done — for the spec, not the artifact

- [x] Schema defined for frontmatter
- [x] Body section structure defined
- [x] Authoring modes defined
- [x] Read API patterns defined
- [x] Update workflow defined
- [ ] Pilot file created for one client (recommend phil-lasry — most data on hand)
- [ ] One downstream skill (suggest `/phase-3-keywords`) updated to read the file
- [ ] Spec validated against a second client (TNA or KitchenGuard) before declaring v1 final

## Next steps

1. Build `delivery/phil-lasry/00-brand-dna.md` as the pilot. Use Mode B (agent-assisted draft + human cleanup).
2. Update `/phase-3-keywords` skill to load the file and use it for relevance scoring.
3. Run Phase 3 keywords for plasry with vs. without the file. Compare keyword universe quality.
4. If pilot proves out, roll to all active clients (phil-lasry, KWEV, SHS, Manhattan Eye, BusBank, Dental Shop, TNA).
5. Then start the Project Brain spec.
