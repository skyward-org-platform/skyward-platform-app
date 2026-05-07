---
title: Supabase Schema Spec v1
status: draft
version: v1 | 2026-05-06
owner: Paul Skirbe
related:
  - operations/seo-platform/README.md
  - operations/seo-platform/specs/brand-dna-brain-spec-v1.md
  - operations/seo-platform/research/tryggvi-stack-notes-v1.md
  - operations/external-training/tryggvi-rafn/pipeline-vs-tryggvi-comparison-v1.md
  - operations/process-library/1. seo-pipeline/pipeline-structure-v2.md
---

# Supabase Schema Spec v1

## Purpose

Defines the operational database that backs the Skyward SEO Platform. Supabase is the integration contract between three producers and consumers:

1. Adam's `skyward-seo-pipeline` Python package (writes pipeline outputs)
2. Paul's Claude Code skills (read context, write decisions)
3. The Next.js app on Vercel (read/write live state, surface to humans)

BigQuery (`data-hub-468216`) remains the warehouse for raw pipeline outputs, history, and analytics. Supabase holds operational state: the things that get edited, queried interactively, embedded, queued, and surfaced.

## Scope of v1

**In scope**
- Table schema for the 10 core entities (client + property + 8 operational tables)
- Indexes (including pgvector)
- Row-level security model
- BQ-to-Supabase sync model
- Migration / project setup

**Out of scope (later versions)**
- Realtime subscriptions (we'll add when the app needs them)
- Audit logs as separate tables (use `updated_at` + git for now)
- Multi-tenant client logins (internal-only in v1)
- Edge Function business logic (start with Postgres + REST + RPC)

## Project setup

Spin up a new Supabase project: `seo-platform-dev` (and later `seo-platform-prod`). Existing `scope-builder-dev` stays separate; do not co-locate.

Standing rules per `reference_supabase-account.md`:
- Always use Transaction Pooler (port 6543) for Vercel-deployed connections.
- `SUPABASE_URL` + `SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` go in agency root `.env`.
- Vercel project gets the same vars via `vercel env`.

Extensions to enable:
- `pgvector` (embeddings)
- `pg_cron` (scheduled jobs inside Postgres for lightweight syncs)
- `pg_trgm` (fuzzy text matching on keywords / brand terms)
- `uuid-ossp` (default uuid generation)

## Naming conventions

- Snake_case for tables and columns.
- Singular table names where the row is one logical thing (`client`, `keyword`), plural for collections / events (`signals`, `playbook_runs`).
- Foreign keys named `{table}_id`.
- Timestamps `created_at`, `updated_at` on every mutable table, defaults `now()`.
- Soft delete via `archived_at timestamptz null` rather than DELETE, except where retention is irrelevant.

## Entities

The 10-entity model splits the contractual layer (`client`) from the operational layer (`property` + 8 tables). All operational tables key on `property_id`. To roll up to client, join via `property.client_id`.

```
client (1) ─── (1..N) property (1) ─── (N) brand_dna_section
                              │
                              ├── (N) project_brain_entry
                              ├── (N) page ─── (N) brief
                              ├── (N) keyword ─── (N..1) cluster
                              ├── (N) signal
                              └── (N) playbook_run
```

### 1. `client`

Contractual entity. One row per SOW signer. May own multiple `property` rows.

```sql
create table client (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,                -- e.g. 'tna', 'phil-lasry', 'busbank'
  name text not null,                       -- display name
  legal_name text,
  primary_contact text,
  status text not null default 'active',    -- active | paused | offboarded | prospect
  clickup_space_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on client (slug);
create index on client (status);
```

### 1b. `property`

Brand / domain entity. The unit at which Skyward runs the pipeline. Single-domain clients have one property. Multi-domain clients (TNA, BusBank with GCS) have several. **All operational tables hang off property, not client.**

```sql
create table property (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references client(id) on delete cascade,
  slug text unique not null,                -- matches delivery/{slug}/
  name text not null,                       -- e.g. 'BusCharter', 'tnabushire', 'minibushire AU'
  primary_domain text not null,             -- canonical domain
  additional_domains text[] default '{}',   -- subdomains, alt TLDs
  brand_voice_inheritance text,             -- 'parent' | 'override' | 'none' — does property inherit brand DNA from client level
  status text not null default 'active',    -- active | paused | offboarded | prospect
  pipeline_phase int default 0,             -- last completed phase 0-6, per-property
  -- BQ + Ahrefs + GSC project pointers deferred until BQ integration is reconciled with Adam's pipeline.
  -- Adam's existing convention (data-hub-468216.SEOPipeline.projects.project_id, e.g. 'plasry.com_001') will be the model.
  -- Add these as a migration when BQ reads/writes are wired.
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on property (client_id);
create index on property (slug);
create index on property (status);
create index on property (primary_domain);
```

**Examples:**
- `client(slug=phil-lasry)` → 1 property `(slug=phil-lasry, domain=plasry.com)`
- `client(slug=tna)` → 3 properties: `tnabushire`, `buscharter`, `minibushire`
- `client(slug=kitchen-services-of-san-diego)` → 2 properties: SD market, DFW market

The `delivery/{slug}/` folder convention follows **property slug**, not client slug. That matches existing structure (`delivery/tnabushire/`, `delivery/buscharter/`).

### 2. `brand_dna_section`

Implements the Brand DNA Brain (per `brand-dna-brain-spec-v1.md`) as a queryable table rather than a flat markdown file. Markdown export remains the human-readable artifact at `delivery/{slug}/00-brand-dna.md` (where slug is the **property** slug), generated from Supabase and committed to git for history.

One row per (property, section). Sections match the spec: identity, offerings, personas, future_audience, brand_terms, proof, competitors, site_structure, goals, brand_story, positioning, voice_tone, audience_deep_dive, offering_deep_dive, trust_proof_themes, competitive_read, skyward_strategy_notes.

```sql
create table brand_dna_section (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references property(id) on delete cascade,
  section text not null,                    -- enum-like, see list above
  content jsonb not null default '{}',      -- structured fields per spec frontmatter
  body text,                                -- prose narrative for body sections
  confidence numeric(3,2),                  -- 0.00 - 1.00
  source text,                              -- 'agent:brand_dna_v1' | 'human:paul' | 'import:phase_0'
  updated_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (property_id, section)
);
create index on brand_dna_section (property_id);
```

A view `brand_dna_current(property_id, doc jsonb)` aggregates all sections into one document per property for skill consumption (replaces "load the markdown file"). Multi-domain clients with shared brand voice can use a parent-level fallback by reading both client-level and property-level sections; the `brand_voice_inheritance` flag on `property` controls this.

### 3. `project_brain_entry`

Tryggvi's Project Brain. Typed, confidence-scored, edited by humans and agents.

```sql
create table project_brain_entry (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references property(id) on delete cascade,
  type text not null,                       -- issue | working | research | preference | strategy | insight
  title text not null,
  body text not null,
  tags text[] default '{}',
  confidence numeric(3,2),                  -- 0.00 - 1.00
  source text,                              -- 'agent:wqa_v5' | 'human:paul' | 'meeting:2026-05-06'
  status text not null default 'active',    -- active | archived | superseded
  superseded_by uuid references project_brain_entry(id),
  related_entries uuid[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on project_brain_entry (property_id, type);
create index on project_brain_entry (property_id, status);
create index on project_brain_entry using gin (tags);
create index on project_brain_entry using gin (to_tsvector('english', title || ' ' || body));
```

### 4. `page`

One row per crawled URL per property. Holds the embedding for cosine similarity (Tryggvi's keyword-seeding pattern). Holds the Phase 1 audit decision so the WQA workbook is regenerable from this table.

```sql
create table page (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references property(id) on delete cascade,
  url text not null,
  url_hash text generated always as (md5(url)) stored,
  domain text,                              -- extracted host from url; supports per-domain filtering for properties with additional_domains
  title text,
  h1 text,
  meta_description text,
  content_text text,                        -- cleaned body for embedding + briefs
  content_hash text,                        -- to detect content drift
  word_count int,
  page_type text,                           -- landing | service | location | blog | tool | resource | other
  status_code int,
  canonical_url text,
  noindex boolean default false,
  embedding vector(1536),                   -- text-embedding-3-small default; bump to 3072 if we go large
  audit_action text,                        -- optimize | restore | redirect | consolidate | remove | keep | no_action
  audit_target_url text,                    -- for redirect / consolidate
  audit_notes text,
  audit_decided_at timestamptz,
  audit_decided_by text,
  last_crawled_at timestamptz,
  archived_at timestamptz,                  -- soft delete: set when URL is removed (404, redirected away)
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (property_id, url)
);
create index on page (property_id);
create index on page (property_id, page_type);
create index on page (property_id, audit_action);
create index on page (property_id, domain);
create index on page using hnsw (embedding vector_cosine_ops);
```

HNSW chosen over IVFFlat: better recall on the page counts we see (hundreds to low thousands per client), no index-build training step needed.

### 5. `keyword`

Per-client keyword universe. Status reflects Tryggvi's pipeline (candidate → retained / excluded), with relevance score + reason.

```sql
create table keyword (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references property(id) on delete cascade,
  term text not null,
  term_hash text generated always as (md5(lower(term))) stored,
  source text not null,                     -- ahrefs | gsc | embedding | forum | competitor | manual | brand_dna
  source_detail jsonb default '{}',         -- what query / page / competitor it came from
  status text not null default 'candidate', -- candidate | retained | excluded
  relevance_score int,                      -- 0-100, Tryggvi's gate
  relevance_reason text,
  search_volume int,
  keyword_difficulty int,
  cpc_cents int,
  intent text,                              -- informational | commercial | transactional | navigational
  intent_history jsonb default '[]',        -- array of {date, intent} for drift tracking
  cluster_id uuid references cluster(id) on delete set null,
  is_cluster_head boolean default false,
  current_rank int,                         -- from rank tracker, latest snapshot
  ranking_url text,                         -- which URL of the property currently ranks
  rank_history jsonb default '[]',          -- array of {date, rank, url}
  discovered_at timestamptz default now(),
  scored_at timestamptz,
  excluded_at timestamptz,
  reactivated_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (property_id, term_hash)
);
create index on keyword (property_id, status);
create index on keyword (property_id, cluster_id);
create index on keyword (property_id, current_rank) where current_rank is not null;
create index on keyword using gin (term gin_trgm_ops);
```

### 6. `cluster`

Keyword clusters with Tryggvi's "still open / singleton" pattern.

```sql
create table cluster (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references property(id) on delete cascade,
  head_term text not null,
  type text not null default 'cluster',     -- cluster | singleton | still_open
  status text not null default 'open',      -- open | closed | merged
  merged_into uuid references cluster(id),
  assigned_page_id uuid references page(id) on delete set null,
  member_count int default 0,
  total_search_volume int,
  primary_intent text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on cluster (property_id, status);
create index on cluster (assigned_page_id);
```

### 7. `signal`

Events that can fire playbooks. Lightweight queue, not a full message bus.

```sql
create table signal (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references property(id) on delete cascade,
  type text not null,                       -- rank_top20_entry | rank_drop | intent_drift | page_404 | new_serp_feature | gsc_query_new | content_stale | etc.
  payload jsonb not null default '{}',
  source text not null,                     -- rank_tracker | gsc | crawl | infranodus | manual
  status text not null default 'new',       -- new | processing | handled | ignored | failed
  priority int default 50,                  -- 0 (high) to 100 (low)
  related_page_id uuid references page(id) on delete set null,
  related_keyword_id uuid references keyword(id) on delete set null,
  related_cluster_id uuid references cluster(id) on delete set null,
  created_at timestamptz default now(),
  processed_at timestamptz,
  expires_at timestamptz
);
create index on signal (property_id, status, priority);
create index on signal (type, status);
create index on signal (created_at);
```

### 8. `playbook_run`

History of playbook fires. The `schedule` skill and `/loop` skill write here when they fire a workflow; the Next.js app surfaces the timeline.

```sql
create table playbook_run (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references property(id) on delete cascade,
  playbook text not null,                   -- 'information_gain_brief' | 'link_outreach' | 'phase_3_keywords' | etc.
  trigger_type text not null,               -- signal | schedule | manual
  trigger_signal_id uuid references signal(id) on delete set null,
  triggered_by text,                        -- 'human:paul' | 'scheduler' | 'agent:loop'
  status text not null default 'queued',    -- queued | running | success | failed | cancelled
  input jsonb default '{}',
  output jsonb default '{}',
  error text,
  artifact_paths text[] default '{}',       -- e.g. paths to generated decks/workbooks/briefs
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz default now()
);
create index on playbook_run (property_id, status);
create index on playbook_run (playbook, status);
create index on playbook_run (created_at desc);
```

### 9. `brief`

Content briefs (Phase 4 + information-gain auto-trigger). Generated by skills, edited by humans, used by writers.

```sql
create table brief (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references property(id) on delete cascade,
  page_id uuid references page(id) on delete set null,
  cluster_id uuid references cluster(id) on delete set null,
  primary_keyword_id uuid references keyword(id) on delete set null,
  type text not null,                       -- new_page | refresh | optimize | information_gain
  status text not null default 'draft',     -- draft | approved | in_writing | editing | review | published | killed
  content jsonb not null default '{}',      -- structured: target_title, target_meta, h1, h2s, entities, faqs, internal_links, word_count_target, etc.
  source_run_id uuid references playbook_run(id) on delete set null,
  assigned_writer text,
  assigned_editor text,
  approved_at timestamptz,
  published_at timestamptz,
  published_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on brief (property_id, status);
create index on brief (page_id);
create index on brief (cluster_id);
```

## Cross-cutting concerns

### Row-level security

v1 is internal-only. Two roles:

- `service_role` — Adam's pipeline package, scheduled agents, server-side skill execution. Bypasses RLS.
- `authenticated` — Skyward team members logged in via Supabase Auth. RLS allows full read on every table; writes are gated by team membership in a `team_member` table.

```sql
-- example for project_brain_entry
alter table project_brain_entry enable row level security;
create policy "team can read all brain entries"
  on project_brain_entry for select
  using (auth.role() = 'authenticated');
create policy "team can write all brain entries"
  on project_brain_entry for all
  using (auth.role() = 'authenticated' and exists (
    select 1 from team_member where user_id = auth.uid() and active
  ));
```

Apply the same pattern across mutable tables. Future client-login work (clients see their own data only) is a v2 concern; the schema already supports it by joining `property → client` and gating on `client_id`.

### Embeddings

- **Decided 2026-05-06:** OpenAI `text-embedding-3-small` (1536 dims). Already in `.env`, $0.02/M tokens, no new vendor, sufficient quality for v1 cosine-similarity keyword seeding. Upgrade path to Voyage `voyage-3-large` or `text-embedding-3-large` documented if the in-domain eval shows recall@5 below ~70%.
- Embedding column on `page` only in v1. If we later embed briefs or brand DNA sections, add columns there.
- Re-embed trigger: any change to `content_hash`. Queued via `signal` (type=`content_changed`).
- **Eval methodology:** Build a 50-pair (page, ideal-keyword) ground truth from phil-lasry. Measure recall@1 / recall@5 / cost on each candidate model. Re-run quarterly to detect drift. Switch on evidence, not vibes.

### Sync with BigQuery

**Deferred post-P0 (revised 2026-05-06).** Earlier draft proposed creating `data-hub-468216.seo_platform_ops` as the integration dataset. That puts our operational mirror inside Adam's existing GCP project, which conflicts with his clean dev / playground / production split (`SEOPipelineDev`, `SEOPipelinePlayground`, `SEOPipeline`, `SEOPipelineProd`). Until Adam and Paul agree on the long-term BQ structure, P0 is **Supabase-only**.

**P0 guardrail:** every script in the P0 plan reads from local files (Excel workbooks, intake forms) and writes to Supabase. None touch BigQuery in `data-hub-468216`. Adam's existing datasets (`SEOPipeline`, `SEOPipelineProd`, per-client custom analysis tables) are untouched.

**Existing BQ structure observed in `data-hub-468216`** (to inform future integration, not P0 work):
- `SEOPipeline` is the active legacy working dataset (71 tables, fully populated)
- `SEOPipelinePlayground` mirrors that structure as a parallel playground
- `SEOPipelineDev` is Adam's dev environment
- `SEOPipelineProd` is the production target (currently empty)
- Shared core tables (e.g., `projects`, `services`, `competitors`, `personas`, `seed_keywords`, `keyword_clusters`) join on `project_id` strings like `plasry.com_001`, `busbank_001`
- Per-client custom tables prefixed with the client slug (`busbank_*`, `shs_*`)

**Future sync directions** (when reconciled with Adam):

| Direction | What | How |
|---|---|---|
| BQ → Supabase | Pipeline-produced data: crawl results, keyword research, audit metadata | Sync layer (TBD: external ETL or in-package writes), reads from Adam's prod dataset |
| Supabase → BQ | Human/agent edits worth keeping for analytics history | Nightly `pg_cron` job, target dataset TBD |
| BQ raw → App | Read-only analytics views | App's BQ client reads directly |

Conflict resolution principle (when wired): Supabase wins on fields the app/humans edit, BQ wins on fields the pipeline writes.

### Migrations

Use Supabase CLI migrations checked into `seo-platform/db/migrations/`. Naming `YYYYMMDDHHMM_descriptive_name.sql`. Migration #1 stands up everything in this spec. RLS policies migrate alongside table definitions.

### Seed data

Seed `client` and `property` from existing `delivery/` folders. One-time script:
1. Builds a manual mapping of property folder → contractual client (e.g., `tnabushire`, `buscharter`, `minibushire` → client `tna`).
2. Inserts `client` rows (one per contractual entity).
3. Inserts `property` rows (one per `delivery/{slug}/` folder), linked to client.
4. Infers `primary_domain` from each property's intake / last crawl.

Brand DNA, Project Brain, pages, keywords, etc. are populated by Phase 0 / agent runs, not seeds.

## Skill integration

Updated skill responsibilities (matching the Brand DNA spec's read API patterns):

All operational skills run with a `property_id` parameter, not `client_id`. For multi-property clients (TNA), the human picks which property to act on; cross-property analytics are app-level views.

| Skill | Reads | Writes |
|---|---|---|
| `/phase-0-onboarding` | `client`, `property` | `client`, `property`, `brand_dna_section` (creates), `page` (initial crawl) |
| `/phase-1-wqa` | `property`, `brand_dna_section`, `page` | `page.audit_action`, `project_brain_entry` (issues found), `playbook_run` |
| `/phase-2-technical` | `property`, `page` | `project_brain_entry` (technical issues), `playbook_run` |
| `/phase-3-keywords` | `property`, `brand_dna_section`, `page` (embedding lookups), `keyword` | `keyword`, `cluster`, `playbook_run` |
| `/phase-4-content` | `property`, `brand_dna_section`, `keyword`, `cluster`, `page` | `brief`, `playbook_run` |
| `/phase-5-authority` | `property`, `brand_dna_section`, `page` | `project_brain_entry`, `playbook_run` |
| `/phase-6-tracking` | `property`, `keyword.rank_history`, `signal` | `signal` (rank-based triggers), `playbook_run` |
| `/lead-engagement` | `brand_dna_section` (prospect form) | `client` + `property` (status='prospect'), `brand_dna_section` |
| `/content-brief` | `brand_dna_section`, `page` (embedding similarity), `keyword` | `brief`, `playbook_run` |
| `schedule` / `/loop` | `signal` queue (filtered by property) | `playbook_run`, fires above skills |

## Open questions

1. ~~**Markdown sync canon.**~~ **Resolved 2026-05-06:** Supabase is canon for Brand DNA. Markdown at `delivery/{slug}/00-brand-dna.md` is a generated snapshot exported from Supabase on demand (and committed to git for human-readable history + offline review).

2. ~~**Embedding model + dim.**~~ **Resolved 2026-05-06:** OpenAI `text-embedding-3-small` (1536). Re-evaluate via in-domain eval after pilot.

3. ~~**Adam's BQ write path.**~~ **Resolved 2026-05-06:** Adam's package writes only to BQ. Dedicated `data-hub-468216.seo_platform_ops` dataset holds operational state. External ETL materializes into Supabase. See Sync section.

4. ~~**`content_text` storage cost.**~~ **Resolved 2026-05-06:** Accept whatever it costs in testing. Revisit only if it materially blows the Supabase plan budget.

5. ~~**Realtime.**~~ **Resolved 2026-05-06:** Defer to v2. Polling is fine for v1.

6. ~~**Multi-domain clients.**~~ **Resolved 2026-05-06:** `property` is now a first-class entity. `client` is the contractual signer; `property` is the brand/domain unit. All operational tables (brand DNA, project brain, page, keyword, cluster, signal, playbook run, brief) hang off `property_id`. Single-domain clients have one property; multi-domain clients (TNA) have several. `delivery/{slug}/` follows property slug.

7. ~~**Soft delete vs. hard delete on `page`.**~~ **Resolved 2026-05-06:** Soft delete. Keep the row with `archived_at` set when a URL is removed; history matters for Phase 6 trend analysis.

## Definition of Done — for the spec

- [x] Entity list defined
- [x] Per-table column definitions
- [x] Index strategy (including pgvector)
- [x] RLS model
- [x] BQ sync model
- [x] Skill integration map
- [ ] Adam's review and BQ-write-path decision
- [ ] Migration #1 written and applied to `seo-platform-dev`
- [ ] Pilot with one client (recommend phil-lasry, has the most data on hand) end-to-end
- [ ] Spec validated against a second client (TNA portfolio) before declaring v1 final

## Next steps

1. Walk Adam through this spec for sign-off on the BQ ops dataset + ETL ownership.
2. Spin up `seo-platform-dev` Supabase project; enable extensions.
3. Write migration #1 implementing every table + index + RLS policy in this doc.
4. Build the client → property mapping for existing delivery folders. Seed both tables.
5. Pilot Brand DNA Brain on phil-lasry: one client, one property. Import the markdown spec output into `brand_dna_section` and update `/phase-3-keywords` to read from Supabase rather than file.
6. Test multi-property pattern on TNA (one client, three properties: tnabushire, buscharter, minibushire).
7. Then Project Brain spec, then Keyword Universe spec, then Command Center.
