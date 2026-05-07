---
title: SEO Platform — Handoff Overview
audience: Adam
from: Paul
date: 2026-05-06
read_time: 5 min
---

# SEO Platform — Handoff Overview

## TL;DR

I've spent the last week digesting Tryggvi Rafn's automated SEO system (the YouTube interview from Edward Show #1,027) and figuring out how to bake those patterns into what you and I are already building, without rebuilding the pipeline. The answer is a small new operational layer that sits alongside `skyward-seo-pipeline`. This doc explains it in 5 minutes; the full schema spec is the next file.

There are six decisions where your input drives the answer. They're listed in section 5.

## 1. Why now

Tryggvi's system has four ideas worth importing:

1. **Brand DNA Brain** — a structured business profile every downstream agent queries
2. **Project Brain** — typed, confidence-scored per-client knowledge layer
3. **Continuous keyword universe** — embeddings, scoring, clustering on a cron
4. **Signal-driven playbooks** — events trigger workflows automatically

We already do most of this in pieces (Phase 0 intake, persona slides, keyword research notebooks, ClickUp tasks at gates). What we don't have is a **shared operational data layer** that all of it reads from and writes to. That's the gap this spec closes.

Detailed comparison vs. the Skyward pipeline v2 is in `pipeline-vs-tryggvi-comparison-v1.md`.

## 2. Architecture in one diagram

```
┌─────────────────────────────┐    ┌──────────────────────────────┐
│    BigQuery (warehouse)     │    │   Supabase (operational)     │
│                             │    │                              │
│  per-property datasets:     │    │  client                      │
│   • plasry                  │    │  property                    │
│   • tnabushire              │ ─► │  brand_dna_section           │
│   • buscharter              │    │  project_brain_entry         │
│   • ...                     │    │  page (with vector embedding)│
│                             │    │  keyword                     │
│  seo_platform_ops (NEW):    │    │  cluster                     │
│   ops state mirror          │    │  signal                      │
└─────────────────────────────┘    │  playbook_run                │
              ▲                    │  brief                       │
              │                    └──────────────────────────────┘
              │ (your package writes here)            ▲
              │                                       │
        Adam's pipeline                Next.js app on Vercel (later)
```

**Three layers:**
- **BigQuery** — warehouse. Your `skyward-seo-pipeline` package owns this. Your existing per-property datasets stay as-is. We add one new dataset (`seo_platform_ops`) that mirrors Supabase.
- **Supabase Postgres + pgvector** — operational truth. Edits, vectors, signal queue, live state. Internal-only in v1.
- **Next.js app on Vercel** — unified surface. Reads/writes Supabase. Reads BQ for analytics. Built later, after the data feeds are real.

## 3. The 10-entity data model

```
client (contractual signer)
  └── property (brand/domain unit, what we run the pipeline on)
        ├── brand_dna_section
        ├── project_brain_entry
        ├── page  ─────► brief
        ├── keyword ──► cluster
        ├── signal
        └── playbook_run
```

`client` is the SOW signer. `property` is what the pipeline runs on. Single-domain clients have one property; multi-domain clients (TNA, KSSD, BusBank/GCS) have several. **All operational tables key on `property_id`.**

Examples:
- `client(slug=phil-lasry)` → 1 property
- `client(slug=tna)` → 3 properties: tnabushire, buscharter, minibushire
- `client(slug=kitchen-services-of-san-diego)` → 2 properties (SD market, DFW market)

Folder convention follows property slug (already matches `delivery/{slug}/` today).

## 4. What's already locked (don't relitigate)

| Decision | Choice |
|---|---|
| Operational DB | Supabase Postgres + pgvector |
| Vector store | Supabase pgvector (not BQ vector search) |
| Embedding model | OpenAI `text-embedding-3-small` (1536 dims). Eval-driven upgrade path |
| Brand DNA storage | Supabase is canon. Markdown at `delivery/{slug}/00-brand-dna.md` is a generated snapshot for git history |
| BQ as the integration contract | Yes. New `data-hub-468216.seo_platform_ops` dataset mirrors Supabase |
| Sync direction | BQ ops → Supabase on pipeline run + hourly catch-up. Supabase → BQ ops nightly for human/agent edits |
| Conflict resolution | Supabase wins on human-edited fields. BQ wins on pipeline-generated fields |
| RLS / auth | Internal-only v1. Service role for pipeline / agents. Authenticated team members for app. Client logins are v2 |
| Soft delete on `page` | Yes. `archived_at` set, row stays for Phase 6 history |

## 5. What needs your input (the walkthrough)

**A. BQ ops dataset structure.** Confirm the name (`seo_platform_ops`) and that it can sit alongside per-property datasets. Should the schema be a 1:1 mirror of Supabase, or a selective mirror (only fields needed for analytics)? One ops dataset per env (Adam-dev / prod / Paul-playground)?

**B. Pipeline package writing patterns.** Your package today writes raw outputs to per-property datasets. We're adding writes of *operational state* (audit decisions, keyword status, brain entries, embeddings) to `seo_platform_ops`. Where does that fit in your package architecture? What's the transactional behavior if raw write succeeds but ops write fails?

**C. ETL ownership: BQ ops → Supabase.** Three options:
1. Your package writes to both BQ and Supabase directly
2. Separate Cloud Run sync service reads BQ and upserts to Supabase
3. Supabase pulls via Foreign Data Wrapper to BQ

Lean #2 for clean separation, but your call based on what fits your code.

**D. Embedding generation step.** Probably lives in your package as a post-crawl step (after the page body is captured). Confirm placement, decide if embeddings get written to BQ ops first or directly to Supabase pgvector. Re-embed on `content_hash` change.

**E. Backfill plan for existing data.** Plasry, TNA properties, BusBank already have BQ data from prior phases. Backfill into `seo_platform_ops` + Supabase, or start fresh on next pipeline run? Affects pilot timing.

**F. Per-property BQ alignment.** Confirm your existing dataset structure is per-property (not per-client). For TNA, three separate datasets — confirm.

## 6. What you produce after the walkthrough

- BQ schema DDL for `seo_platform_ops` (the BQ side of the integration contract)
- Plan / branch in `skyward-seo-pipeline` for the ops-state writer module
- Embedding step plan
- ETL component sketch (whichever option from C)
- Backfill plan with rough timeline
- Estimate for landing a working `seo_platform_ops` writer + ETL on `seo-platform-dev`

## 7. Reference doc map

| File | What it is | Read priority |
|---|---|---|
| `00-overview.md` | This doc | Start here |
| `supabase-schema-spec-v1.md` | Full schema, all 10 tables, indexes, RLS, sync model, skill integration | **Required reading** |
| `brand-dna-brain-spec-v1.md` | Format and authoring workflow for the Brand DNA Brain artifact | Skim |
| `pipeline-vs-tryggvi-comparison-v1.md` | Side-by-side of Tryggvi's system vs. our pipeline. Shows what we're stealing and what we're keeping | Skim for the "why" |
| `tryggvi-stack-notes-v1.md` | What we know vs. don't know about Tryggvi's infrastructure. Stack decisions documented | Optional |
| `seo-platform-readme.md` | Top-level overview of the `operations/seo-platform/` directory | Optional |

## 8. Suggested next step

45-60 min walkthrough next week. Goal: lock answers to the six decisions in section 5 so you can start writing the BQ ops dataset DDL and the ops-state writer module without further blocking.
