---
title: Tryggvi Rafn's Automated SEO System vs. Skyward Pipeline v2
source: Edward Show podcast #1,027 (Apr 2026) — transcript at `automated-seo-system-podcast-transcript.md`
compared-against: `operations/process-library/1. seo-pipeline/pipeline-structure-v2.md` v2.1
version: v1 | 2026-04-28
---

# Side-by-side

| Capability | Tryggvi's System | Skyward Pipeline v2 | Gap |
|---|---|---|---|
| Business profiling | **Brand DNA Brain**: structured 8-9 section artifact (buyers, products, voice, brand terms, site structure) that every downstream agent queries | Phase 0 intake form + client questionnaire + persona slides | We capture similar info but it's not a structured, queryable artifact agents read at runtime |
| Per-project knowledge layer | **Project Brain**: confidence-scored knowledge units tagged as issue / working / research / preference / strategy / insight; updated by talking to agents | Session notes + memory directory (global) | No per-client structured brain with confidence scores and typed entries |
| Keyword universe sources | 5 sources: Ahrefs, GSC, **page-content vector DB (cosine similarity)**, forum scraping, scheduled agent expansion via brand DNA | Ahrefs, DataForSEO, GSC, competitor gaps, InfraNodus | No vector embedding of client pages; no forum scraping; no scheduled expansion (one-shot per phase) |
| Keyword lifecycle | Status states: candidate → retained / excluded with **relevance score 0-100 + reason** | Discovered → clustered → mapped (no explicit relevance gate) | No auditable relevance score with reason; nothing to "reactivate" later |
| Clustering | Auto-cluster + **singleton / still-open clusters** that keep accepting new keywords on a cron | One-shot SERP-overlap clustering at Phase 3 | Clusters are static after delivery |
| Intent | Captured AND **tracked over time** as a signal (intent shift = trigger to review page) | Captured at Phase 3, treated as tiebreaker (memory: intent tags unreliable) | No drift tracking; no trigger when intent changes |
| Page type awareness | Built-in: landing / tool / service / blog all first-class in playbooks | Phase 1 Service Summary + Phase 4 covers all page types | Aligned in spirit; less explicit in tooling |
| Workflow orchestration | **Command Center → Playbooks → Mission Control → stateless worker agents**; signals auto-trigger workflows (e.g., top-20 → information-gain analysis) | ClickUp tasks created at gates; SOPs run by humans/notebooks | No playbook engine that auto-triggers on data signals |
| Content brief generation | Information-gain brief for any top-20 keyword: scrapes top 10, finds entity/section gaps, builds brief | Phase 4 brief per Content Workbook; InfraNodus page-level SERP topic mapping (Phase 6 SOP) | We have the building blocks but not the auto-trigger |
| Content production | Brief → stateless writing agent → editor with comments → review state → approved | Brief → draft → feedback → delivery (humans-in-loop) | Our pipeline is more manual; theirs has stateless-agent handoffs |
| Quality control on AI writing | Per-project writing preferences stored in Project Brain ("don't use this structure for this client"), iterated against | Global feedback memory (no em dashes, etc.); per-client style not structured | Per-client writing prefs aren't codified |
| Image library | Media library with auto-tagged alt text per brand | Not a Phase 4 deliverable | Not in scope today |
| Backlog UI | Backlog → In Progress → Needs Review → Approved state machine in his app | ClickUp lists | Different surface, similar function |
| Site-level audit | Not mentioned | **Phase 2 T1-T20 / C1-C20 / S1-S12 (44 checks) + Word doc + architecture diagrams** | We're meaningfully stronger |
| Authority / link building | Not mentioned | **Phase 5 full pipeline** (link gap, prospects, outreach, citations, monitoring, disavow) | We're stronger |
| Tracking + QBR feedback | Not mentioned | **Phase 6 with formalized QBR loops back to Phase 3/4/5** | We're stronger |
| Client deliverable surface | Internal tool only | Workbook + deck + Word doc per phase, client-reviewable | We're stronger on client-facing artifact discipline |

# What's worth stealing

Ranked by leverage / fit with our roadmap.

## 1. Brand DNA Brain as a structured Phase 0 artifact (high leverage)
Today our Phase 0 ends in BigQuery tables + persona slides. Tryggvi's brand DNA is a single queryable doc agents reference at every phase. We could codify it as a YAML or markdown file at `delivery/{client}/00-brand-dna.md` with fixed sections (buyers, voice/tone, products, brand terms, trust signals, proof, site structure, competitors). Phase 1-6 agents read it as context. This is a small change with compounding value: every downstream skill (`/phase-1-wqa`, `/phase-3-keywords`, `/phase-4-content`, `/lead-engagement`, `/content-brief`) gets richer client context for free. Pairs with `superagent-system` which already wants per-client Internal Docs.

## 2. Project Brain — typed, confidence-scored per-client knowledge layer (high leverage)
We have global agency memory but no per-client structured brain. A `delivery/{client}/brain/` directory with typed entries (issue / working / research / preference / strategy / insight) and confidence scores would solve real pain: today, per-client context lives in scattered session notes and is invisible to skills. Light implementation — frontmatter convention + an index file per client. Models the same pattern that's already working for `~/.claude/projects/-Users-paulskirbe-agency/memory/`.

## 3. Page-content vector embeddings → seed keywords (medium-high leverage)
At Phase 0 crawl, embed every page (OpenAI ada or local) and store vectors in BigQuery or sqlite. At Phase 3, run cosine similarity from each page to a keyword corpus to surface seed keywords automatically — especially commercial-intent keywords for service/product pages. Cheap to add (the embedding pipeline is one notebook), feeds straight into our existing Keyword Universe tab. Most-direct improvement to keyword discovery quality.

## 4. Continuous keyword universe with cron expansion (medium leverage)
Our Phase 3 is one-shot. Make it ongoing: a scheduled job (weekly?) that pulls new GSC queries, expands high-relevance clusters, runs SERP/volume checks, and flags new clusters into a "review queue." This is the natural Phase 6 → Phase 3 feedback loop our Tracking SOP already mentions but doesn't operationalize. Could live as a `/loop` or scheduled remote agent.

## 5. Information-gain playbook auto-trigger for top-20 keywords (medium leverage)
We have the InfraNodus SOP for page-level SERP topic mapping. Tryggvi's twist: it auto-fires when a keyword crosses into top 20 (high-leverage zone). Wire to rank tracker output → if rank moves to 11-20, generate a refresh brief. This is the kind of signal-driven playbook that turns Phase 6 from passive reporting into proactive optimization. Needs a playbook engine (#7).

## 6. Forum scraping for pain points (low-medium leverage)
Adds a feed to FAQs and content-brief tabs. Cheap to bolt on; doesn't change the pipeline structure. Useful for any client where Reddit / industry forums have signal (less useful for transport, more useful for plasry, dental-shop, vivara-cr).

## 7. Command Center / playbook engine (high leverage, high cost)
The orchestration layer that turns signals into actions. This is the multi-month infrastructure project. Worth scoping but not the next thing to build — start with the data inputs (#1, #2, #3) so playbooks have something to trigger on.

# What we're better at and shouldn't lose
- Triage rigor (Phase 1's 6 actions, every URL accounted for) — Tryggvi's tool doesn't appear to have an equivalent
- Technical SEO depth (44 checks, platform ceiling assessment, site architecture audit)
- Authority/link building as a first-class phase
- QBR feedback loops formalized
- Client-facing deliverable discipline (workbook + deck + Word doc per phase)

# Recommended sequence
1. **Brand DNA Brain** spec — week of work, ~80% of the leverage
2. **Project Brain** convention — pairs with #1, codifies per-client memory
3. **Page-content embeddings** — drops into Phase 0/3 as an extra signal source
4. **Continuous keyword universe** — Phase 6 → Phase 3 cron
5. **Information-gain auto-trigger** — needs Phase 6 rank-tracker output wired
6. **Command Center playbook engine** — only after the data feeds above are real

Open question: how much of this is replicating Tryggvi (build a tool) vs. extracting patterns into our SOPs and skills (the Skyward way). Most of #1-5 is SOP + light scripting, not a new app.
