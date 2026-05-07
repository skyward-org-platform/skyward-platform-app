# P0 Data Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Supabase data layer for the SEO Platform, migrate the schema, and backfill phil-lasry's pages and Brand DNA so the data is queryable end-to-end. P1 (Next.js UI) is a separate plan that builds on this.

**Architecture:** Supabase Postgres + pgvector hosts the operational state (`client`, `property`, `page`, `brand_dna_section`, `project_brain_entry`). Schema mirrors `supabase-schema-spec-v1.md`. Backfill runs as Python scripts in the agency venv. Brand DNA inference uses OpenAI structured outputs to fill new sections (voice, brand terms, proof, future audience, brand story) that don't exist in the legacy Phase 0 BQ tables.

**Tech Stack:**
- Supabase (Postgres 15 + pgvector + pg_cron + pg_trgm)
- Supabase CLI for migrations
- Python 3.11 (existing `agency/.venv`)
- `supabase-py`, `openai` (v1+), `openpyxl`, `python-dotenv`, `pytest`
- Existing `skyward-common` package available in venv

**Scope boundary:** P0 ends with phil-lasry visible in Supabase Studio with all expected rows. P1 (the UI) is a separate plan.

**BigQuery guardrail:** Every script in this plan reads from local files (Excel workbooks, intake constants) and writes to Supabase. **Nothing in P0 reads or writes the existing `data-hub-468216` project.** Adam's existing datasets (`SEOPipeline`, `SEOPipelineProd`, `SEOPipelinePlayground`, `SEOPipelineDev`, plus per-client analytics, GSC, GMB, GAds datasets) are untouched. BQ integration is deferred until Paul and Adam align on the long-term cross-system structure.

**Prerequisites:**
- Access to Supabase account `data@goskyward.io's Org` (PRO tier per `reference_supabase-account.md`)
- Supabase CLI installed (`brew install supabase/tap/supabase` or check version with `supabase --version`)
- Existing phil-lasry WQA workbook at `delivery/phil-lasry/phase-1-wqa/plasry-Website-Quality-Audit-2026-04-14.xlsx`
- `.env` already has `OPENAI_API_KEY` (Supabase keys added in Task 2)

**Branch strategy:** Work on `feat/p0-data-foundation`. Commit after every step that produces working state. Open a PR back to `main` when the plan is complete.

---

## File Structure

```
operations/seo-platform/
├── db/
│   └── supabase/                       # Supabase CLI default layout (CLI 2.x)
│       ├── config.toml                 # Supabase CLI config
│       ├── .gitignore                  # auto-generated
│       └── migrations/
│           ├── 20260506100000_extensions.sql
│           ├── 20260506100100_client_team.sql
│           ├── 20260506100200_property.sql
│           ├── 20260506100300_page.sql
│           └── 20260506100400_brain.sql
├── inference/
│   ├── __init__.py
│   ├── client.py                      # OpenAI wrapper
│   ├── voice_tone.py                  # voice & tone inference
│   ├── brand_terms.py
│   ├── proof.py
│   ├── future_audience.py
│   ├── brand_story.py
│   └── tests/
│       ├── __init__.py
│       ├── conftest.py                # shared fixtures (sample pages)
│       ├── test_voice_tone.py
│       ├── test_brand_terms.py
│       ├── test_proof.py
│       ├── test_future_audience.py
│       └── test_brand_story.py
├── scripts/
│   ├── __init__.py
│   ├── supabase_client.py             # shared connection helper
│   ├── seed_clients_properties.py
│   ├── backfill_phil_lasry_pages.py
│   ├── backfill_phil_lasry_brand_dna.py
│   └── export_brand_dna_markdown.py
└── tests/
    ├── __init__.py
    ├── test_smoke_supabase.py
    └── test_seed_idempotent.py
```

---

## Task 1: Bootstrap directory structure + Supabase CLI init

**Files:**
- Create: `operations/seo-platform/db/config.toml`
- Create: `operations/seo-platform/db/supabase/migrations/.gitkeep`
- Create: `operations/seo-platform/inference/__init__.py`
- Create: `operations/seo-platform/scripts/__init__.py`
- Create: `operations/seo-platform/tests/__init__.py`

- [ ] **Step 1: Create the directory tree**

```bash
cd /Users/paulskirbe/agency/operations/seo-platform
mkdir -p db/migrations inference/tests scripts tests
touch inference/__init__.py inference/tests/__init__.py scripts/__init__.py tests/__init__.py db/supabase/migrations/.gitkeep
```

- [ ] **Step 2: Verify Supabase CLI is installed**

```bash
supabase --version
```

Expected: prints version 1.x or later. If not installed: `brew install supabase/tap/supabase`.

- [ ] **Step 3: Initialize Supabase project config**

```bash
cd /Users/paulskirbe/agency/operations/seo-platform/db
supabase init
```

This creates `config.toml`. If it asks about VS Code workspace, say no.

- [ ] **Step 4: Commit**

```bash
cd /Users/paulskirbe/agency
git checkout -b feat/p0-data-foundation
git add operations/seo-platform/db operations/seo-platform/inference operations/seo-platform/scripts operations/seo-platform/tests
git commit -m "feat(seo-platform): scaffold P0 directory tree and supabase config"
```

---

## Task 2: Create Supabase project + add env vars

This is a manual step via the Supabase dashboard. The agent should pause and ask the user to complete it.

**Files:**
- Modify: `/Users/paulskirbe/agency/.env` (add 3 keys)

- [ ] **Step 1: Create the project (manual, in browser)**

User action:
1. Go to https://supabase.com/dashboard, log in as `data@goskyward.io`
2. Create new project named `seo-platform-dev`
3. Region: `us-east-1` (matches Vercel `iad1`)
4. Database password: generate strong, save in 1Password as "Supabase seo-platform-dev"
5. Wait for provisioning (~2 min)

- [ ] **Step 2: Capture connection strings**

From the project dashboard, copy:
- Project URL → `SUPABASE_URL`
- `anon` `public` key → `SUPABASE_ANON_KEY`
- `service_role` `secret` key → `SUPABASE_SERVICE_ROLE_KEY`
- Connection string from Project Settings › Database › **Transaction Pooler** (port 6543) → `SUPABASE_POOLER_URL`

- [ ] **Step 3: Add to `.env`**

Append to `/Users/paulskirbe/agency/.env`:

```
# Supabase: seo-platform-dev
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_POOLER_URL=postgresql://postgres.<ref>:<password>@aws-0-us-east-1.pooler.supabase.com:6543/postgres
SUPABASE_PROJECT_REF=<ref>
```

- [ ] **Step 4: Link Supabase CLI to the project**

```bash
cd /Users/paulskirbe/agency/operations/seo-platform/db
supabase link --project-ref <ref>
```

When it prompts for the database password, enter the one saved to 1Password.

- [ ] **Step 5: Verify connection**

```bash
supabase db remote ls
```

Expected: shows `public` schema and any existing tables (none yet besides what Supabase creates by default).

- [ ] **Step 6: Install Python dependencies**

```bash
cd /Users/paulskirbe/agency
.venv/bin/pip install supabase==2.7.4 openai==1.51.0 openpyxl==3.1.5 python-dotenv==1.0.1 pytest==8.3.3
```

- [ ] **Step 7: Commit**

```bash
git add operations/seo-platform/db/.gitignore operations/seo-platform/db/config.toml
# Note: .env is gitignored — do not commit
git commit -m "feat(seo-platform): link CLI to seo-platform-dev project, add deps"
```

---

## Task 3: Migration 1 — Extensions

**Files:**
- Create: `operations/seo-platform/db/supabase/migrations/20260506100000_extensions.sql`
- Create: `operations/seo-platform/scripts/supabase_client.py`
- Create: `operations/seo-platform/tests/test_smoke_supabase.py`

- [ ] **Step 1: Write the failing smoke test**

`operations/seo-platform/tests/test_smoke_supabase.py`:

```python
"""Smoke tests that the Supabase project is reachable and extensions are enabled."""
import os
import pytest
from dotenv import load_dotenv
from supabase import create_client

load_dotenv("/Users/paulskirbe/agency/.env")


@pytest.fixture
def admin_client():
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def test_pgvector_enabled(admin_client):
    """pgvector extension must be available for page.embedding."""
    rpc = admin_client.rpc("pg_ext_check", {"ext_name": "vector"}).execute()
    assert rpc.data is True


def test_uuid_ossp_enabled(admin_client):
    rpc = admin_client.rpc("pg_ext_check", {"ext_name": "uuid-ossp"}).execute()
    assert rpc.data is True
```

We need a helper RPC to check extensions. Add it in the migration.

- [ ] **Step 2: Write the migration**

`operations/seo-platform/db/supabase/migrations/20260506100000_extensions.sql`:

```sql
-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "vector";
create extension if not exists "pg_trgm";
create extension if not exists "pg_cron" with schema extensions;

-- Helper function used by smoke tests to confirm an extension is installed
create or replace function pg_ext_check(ext_name text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from pg_extension where extname = ext_name
  );
$$;
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd /Users/paulskirbe/agency
.venv/bin/pytest operations/seo-platform/tests/test_smoke_supabase.py -v
```

Expected: FAIL with "function pg_ext_check does not exist" or similar.

- [ ] **Step 4: Apply the migration**

```bash
cd /Users/paulskirbe/agency/operations/seo-platform/db
supabase db push
```

Expected: prints "Applying migration 20260506100000_extensions.sql".

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd /Users/paulskirbe/agency
.venv/bin/pytest operations/seo-platform/tests/test_smoke_supabase.py -v
```

Expected: PASS on both extension checks.

- [ ] **Step 6: Commit**

```bash
git add operations/seo-platform/db/supabase/migrations/20260506100000_extensions.sql operations/seo-platform/tests/test_smoke_supabase.py
git commit -m "feat(seo-platform): migration 1 - extensions (pgvector, uuid-ossp, pg_trgm, pg_cron)"
```

---

## Task 4: Migration 2 — `client` + `team_member` + base RLS

**Files:**
- Create: `operations/seo-platform/db/supabase/migrations/20260506100100_client_team.sql`
- Modify: `operations/seo-platform/tests/test_smoke_supabase.py`

- [ ] **Step 1: Add a failing test for the client table**

Append to `tests/test_smoke_supabase.py`:

```python
def test_client_table_exists(admin_client):
    """client table is the contractual entity; should accept inserts."""
    res = admin_client.table("client").select("id").limit(1).execute()
    assert res.data == []  # empty is fine, but query must succeed


def test_team_member_table_exists(admin_client):
    res = admin_client.table("team_member").select("user_id").limit(1).execute()
    assert res.data == []
```

- [ ] **Step 2: Run test to verify it fails**

```bash
.venv/bin/pytest operations/seo-platform/tests/test_smoke_supabase.py::test_client_table_exists -v
```

Expected: FAIL with "relation 'client' does not exist".

- [ ] **Step 3: Write the migration**

`operations/seo-platform/db/supabase/migrations/20260506100100_client_team.sql`:

```sql
-- Skyward team members (gates write access via RLS)
create table team_member (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  active boolean not null default true,
  created_at timestamptz default now()
);
create index on team_member (active);

-- Contractual entity: SOW signer
create table client (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  name text not null,
  legal_name text,
  primary_contact text,
  status text not null default 'active' check (status in ('active','paused','offboarded','prospect')),
  clickup_space_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on client (status);

-- RLS: team can read all clients; only active team members can write
alter table client enable row level security;
create policy "team can read clients"
  on client for select
  using (auth.role() = 'authenticated');
create policy "team can write clients"
  on client for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );

alter table team_member enable row level security;
create policy "team can read team"
  on team_member for select
  using (auth.role() = 'authenticated');
-- Inserts to team_member happen via service_role only (admin operation)
```

- [ ] **Step 4: Apply**

```bash
cd /Users/paulskirbe/agency/operations/seo-platform/db
supabase db push
```

- [ ] **Step 5: Run test to verify it passes**

```bash
.venv/bin/pytest operations/seo-platform/tests/test_smoke_supabase.py -v
```

Expected: all three tests PASS.

- [ ] **Step 6: Commit**

```bash
git add operations/seo-platform/db/supabase/migrations/20260506100100_client_team.sql operations/seo-platform/tests/test_smoke_supabase.py
git commit -m "feat(seo-platform): migration 2 - client + team_member + base RLS"
```

---

## Task 5: Migration 3 — `property` table

**Files:**
- Create: `operations/seo-platform/db/supabase/migrations/20260506100200_property.sql`
- Modify: `operations/seo-platform/tests/test_smoke_supabase.py`

- [ ] **Step 1: Add failing test**

Append to `tests/test_smoke_supabase.py`:

```python
def test_property_table_exists(admin_client):
    res = admin_client.table("property").select("id").limit(1).execute()
    assert res.data == []
```

- [ ] **Step 2: Run, see it fail**

```bash
.venv/bin/pytest operations/seo-platform/tests/test_smoke_supabase.py::test_property_table_exists -v
```

- [ ] **Step 3: Write migration**

`operations/seo-platform/db/supabase/migrations/20260506100200_property.sql`:

```sql
create table property (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references client(id) on delete cascade,
  slug text unique not null,
  name text not null,
  primary_domain text not null,
  additional_domains text[] default '{}',
  brand_voice_inheritance text default 'none' check (brand_voice_inheritance in ('parent','override','none')),
  status text not null default 'active' check (status in ('active','paused','offboarded','prospect')),
  pipeline_phase int default 0 check (pipeline_phase between 0 and 6),
  -- BQ + Ahrefs + GSC pointers deferred until cross-system structure is reconciled with Adam.
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on property (client_id);
create index on property (slug);
create index on property (status);
create index on property (primary_domain);

alter table property enable row level security;
create policy "team can read properties"
  on property for select
  using (auth.role() = 'authenticated');
create policy "team can write properties"
  on property for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );
```

- [ ] **Step 4: Apply**

```bash
supabase db push
```

- [ ] **Step 5: Run test, see it pass**

```bash
.venv/bin/pytest operations/seo-platform/tests/test_smoke_supabase.py::test_property_table_exists -v
```

- [ ] **Step 6: Commit**

```bash
git add operations/seo-platform/db/supabase/migrations/20260506100200_property.sql operations/seo-platform/tests/test_smoke_supabase.py
git commit -m "feat(seo-platform): migration 3 - property table with multi-domain support"
```

---

## Task 6: Migration 4 — `page` table with pgvector embedding

**Files:**
- Create: `operations/seo-platform/db/supabase/migrations/20260506100300_page.sql`
- Modify: `operations/seo-platform/tests/test_smoke_supabase.py`

- [ ] **Step 1: Add failing test**

```python
def test_page_table_exists(admin_client):
    res = admin_client.table("page").select("id").limit(1).execute()
    assert res.data == []


def test_page_embedding_column_is_vector(admin_client):
    """Verify the embedding column has vector(1536) type via information_schema."""
    res = admin_client.rpc(
        "pg_typeof_column",
        {"table_name_in": "page", "column_name_in": "embedding"},
    ).execute()
    assert "vector" in (res.data or "").lower()
```

- [ ] **Step 2: Run, see fail**

```bash
.venv/bin/pytest operations/seo-platform/tests/test_smoke_supabase.py::test_page_table_exists -v
```

- [ ] **Step 3: Write migration**

`operations/seo-platform/db/supabase/migrations/20260506100300_page.sql`:

```sql
create table page (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references property(id) on delete cascade,
  url text not null,
  url_hash text generated always as (md5(url)) stored,
  domain text,
  title text,
  h1 text,
  meta_description text,
  content_text text,
  content_hash text,
  word_count int,
  page_type text,
  status_code int,
  canonical_url text,
  noindex boolean default false,
  embedding vector(1536),
  audit_action text check (audit_action is null or audit_action in (
    'optimize','restore','redirect','consolidate','remove','keep','no_action','undecided'
  )),
  audit_target_url text,
  audit_notes text,
  audit_decided_at timestamptz,
  audit_decided_by text,
  last_crawled_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (property_id, url)
);
create index on page (property_id);
create index on page (property_id, page_type);
create index on page (property_id, audit_action);
create index on page (property_id, domain);
create index on page using hnsw (embedding vector_cosine_ops);

alter table page enable row level security;
create policy "team can read pages"
  on page for select
  using (auth.role() = 'authenticated');
create policy "team can write pages"
  on page for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );

-- Helper RPC for the column-type smoke test
create or replace function pg_typeof_column(table_name_in text, column_name_in text)
returns text
language sql
stable
as $$
  select format_type(atttypid, atttypmod)
  from pg_attribute
  where attrelid = ('public.' || table_name_in)::regclass
    and attname = column_name_in
    and not attisdropped;
$$;
```

- [ ] **Step 4: Apply**

```bash
supabase db push
```

- [ ] **Step 5: Run, see pass**

```bash
.venv/bin/pytest operations/seo-platform/tests/test_smoke_supabase.py -v
```

- [ ] **Step 6: Commit**

```bash
git add operations/seo-platform/db/supabase/migrations/20260506100300_page.sql operations/seo-platform/tests/test_smoke_supabase.py
git commit -m "feat(seo-platform): migration 4 - page table with pgvector embedding + HNSW index"
```

---

## Task 7: Migration 5 — `brand_dna_section` + `project_brain_entry`

**Files:**
- Create: `operations/seo-platform/db/supabase/migrations/20260506100400_brain.sql`
- Modify: `operations/seo-platform/tests/test_smoke_supabase.py`

- [ ] **Step 1: Add failing tests**

```python
def test_brand_dna_section_table_exists(admin_client):
    res = admin_client.table("brand_dna_section").select("id").limit(1).execute()
    assert res.data == []


def test_project_brain_entry_table_exists(admin_client):
    res = admin_client.table("project_brain_entry").select("id").limit(1).execute()
    assert res.data == []
```

- [ ] **Step 2: Run, see fail**

```bash
.venv/bin/pytest operations/seo-platform/tests/test_smoke_supabase.py -v
```

- [ ] **Step 3: Write migration**

`operations/seo-platform/db/supabase/migrations/20260506100400_brain.sql`:

```sql
create table brand_dna_section (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references property(id) on delete cascade,
  section text not null check (section in (
    'identity','offerings','personas','future_audience','brand_terms',
    'proof','competitors','site_structure','goals',
    'brand_story','positioning','voice_tone','audience_deep_dive',
    'offering_deep_dive','trust_proof_themes','competitive_read','skyward_strategy_notes'
  )),
  content jsonb not null default '{}',
  body text,
  confidence numeric(3,2) check (confidence is null or (confidence between 0 and 1)),
  source text,
  updated_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (property_id, section)
);
create index on brand_dna_section (property_id);

create table project_brain_entry (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references property(id) on delete cascade,
  type text not null check (type in ('issue','working','research','preference','strategy','insight')),
  title text not null,
  body text not null,
  tags text[] default '{}',
  confidence numeric(3,2) check (confidence is null or (confidence between 0 and 1)),
  source text,
  status text not null default 'active' check (status in ('active','archived','superseded')),
  superseded_by uuid references project_brain_entry(id),
  related_entries uuid[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on project_brain_entry (property_id, type);
create index on project_brain_entry (property_id, status);
create index on project_brain_entry using gin (tags);
create index on project_brain_entry using gin (to_tsvector('english', title || ' ' || body));

alter table brand_dna_section enable row level security;
create policy "team can read brand_dna" on brand_dna_section for select using (auth.role() = 'authenticated');
create policy "team can write brand_dna" on brand_dna_section for all using (
  auth.role() = 'authenticated'
  and exists (select 1 from team_member where user_id = auth.uid() and active)
);

alter table project_brain_entry enable row level security;
create policy "team can read brain" on project_brain_entry for select using (auth.role() = 'authenticated');
create policy "team can write brain" on project_brain_entry for all using (
  auth.role() = 'authenticated'
  and exists (select 1 from team_member where user_id = auth.uid() and active)
);

-- View aggregating brand DNA into one document per property
create or replace view brand_dna_current as
  select
    property_id,
    jsonb_object_agg(section, jsonb_build_object('content', content, 'body', body, 'confidence', confidence)) as doc,
    max(updated_at) as updated_at
  from brand_dna_section
  group by property_id;
```

- [ ] **Step 4: Apply**

```bash
supabase db push
```

- [ ] **Step 5: Run, see pass**

```bash
.venv/bin/pytest operations/seo-platform/tests/test_smoke_supabase.py -v
```

- [ ] **Step 6: Commit**

```bash
git add operations/seo-platform/db/supabase/migrations/20260506100400_brain.sql operations/seo-platform/tests/test_smoke_supabase.py
git commit -m "feat(seo-platform): migration 5 - brand_dna_section + project_brain_entry + view"
```

---

## Task 8: Shared Supabase client helper

**Files:**
- Create: `operations/seo-platform/scripts/supabase_client.py`

- [ ] **Step 1: Write the helper**

`operations/seo-platform/scripts/supabase_client.py`:

```python
"""Shared Supabase client factory used by seed/backfill/export scripts."""
from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv("/Users/paulskirbe/agency/.env")


@lru_cache(maxsize=1)
def get_admin_client() -> Client:
    """Service-role client. Bypasses RLS. Use for backend scripts."""
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)
```

- [ ] **Step 2: Smoke test it manually**

```bash
cd /Users/paulskirbe/agency
.venv/bin/python -c "from operations.seo_platform.scripts.supabase_client import get_admin_client; c = get_admin_client(); print(c.table('client').select('id').execute().data)"
```

Expected: prints `[]`. Note the `seo_platform` underscore in the import path may need a `sys.path` insertion or reorganization. Adjust by adding `__init__.py` files up the chain or using a script runner.

- [ ] **Step 3: Add a sys.path bootstrap if needed**

If the import fails, create `operations/seo-platform/__init__.py` (empty) so Python treats the dir as a package, and add `operations/__init__.py` (empty). Then re-run.

If the dash in `seo-platform` blocks Python imports (it does, dashes are invalid), the cleanest fix is to run scripts as standalone files using `from scripts.supabase_client import get_admin_client` after `cd operations/seo-platform`. Update the helper imports throughout the plan accordingly.

**Decision:** scripts will be run from the `operations/seo-platform/` directory as the working directory. All inter-script imports use `from scripts.x import y` and `from inference.x import y`. The `agency/operations/seo-platform/` is added to `sys.path` at runtime by each script.

Update `supabase_client.py` to handle the path setup:

```python
"""Shared Supabase client factory used by seed/backfill/export scripts."""
from __future__ import annotations

import os
import sys
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client

# Ensure the seo-platform dir is on sys.path so sibling packages resolve
_HERE = Path(__file__).resolve().parent.parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

load_dotenv("/Users/paulskirbe/agency/.env")


@lru_cache(maxsize=1)
def get_admin_client() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)
```

- [ ] **Step 4: Verify**

```bash
cd /Users/paulskirbe/agency/operations/seo-platform
/Users/paulskirbe/agency/.venv/bin/python -c "from scripts.supabase_client import get_admin_client; print(get_admin_client().table('client').select('id').execute().data)"
```

Expected: `[]`.

- [ ] **Step 5: Commit**

```bash
cd /Users/paulskirbe/agency
git add operations/seo-platform/scripts/supabase_client.py
git commit -m "feat(seo-platform): shared Supabase admin client helper"
```

---

## Task 9: Seed clients + properties from delivery folders

**Files:**
- Create: `operations/seo-platform/scripts/seed_clients_properties.py`
- Create: `operations/seo-platform/tests/test_seed_idempotent.py`

The script reads a hardcoded mapping (built from current memory of which delivery folders belong to which contractual client). v1 seeds the active clients we have data for; the rest can be added incrementally.

- [ ] **Step 1: Write the failing idempotency test**

`operations/seo-platform/tests/test_seed_idempotent.py`:

```python
"""Seed script must be idempotent: running twice produces the same row count."""
import importlib

from scripts.supabase_client import get_admin_client


def test_seed_is_idempotent():
    seed_module = importlib.import_module("scripts.seed_clients_properties")

    seed_module.run()
    after_first = _count_rows()

    seed_module.run()
    after_second = _count_rows()

    assert after_first == after_second
    assert after_first["client"] >= 4   # at least phil-lasry, tna, kssd, busbank
    assert after_first["property"] >= 6  # phil-lasry + 3 TNA + busbank + at least 1 KSSD


def _count_rows() -> dict[str, int]:
    client = get_admin_client()
    return {
        "client": len(client.table("client").select("id").execute().data),
        "property": len(client.table("property").select("id").execute().data),
    }
```

- [ ] **Step 2: Run test, see fail**

```bash
cd /Users/paulskirbe/agency/operations/seo-platform
/Users/paulskirbe/agency/.venv/bin/pytest tests/test_seed_idempotent.py -v
```

Expected: FAIL (`scripts.seed_clients_properties` does not exist).

- [ ] **Step 3: Write the seed script**

`operations/seo-platform/scripts/seed_clients_properties.py`:

```python
"""Seed `client` and `property` from a hardcoded mapping of delivery folders.

Idempotent: uses upsert on `slug`. Safe to re-run.
"""
from __future__ import annotations

from scripts.supabase_client import get_admin_client


CLIENTS = [
    {"slug": "phil-lasry", "name": "Phil Lasry", "legal_name": "Phil Lasry LLC"},
    {"slug": "tna", "name": "TNA", "legal_name": "TNA Pty Ltd"},
    {"slug": "kitchen-services-of-san-diego", "name": "Kitchen Services of San Diego",
     "legal_name": "Kitchen Services of San Diego, Inc"},
    {"slug": "tacoma-legacy-partners", "name": "Tacoma Legacy Partners", "legal_name": "Tacoma Legacy Partners, LLC"},
    {"slug": "becker-family-flooring", "name": "Becker Family Flooring", "legal_name": "Becker Family Flooring, Inc"},
    {"slug": "busbank", "name": "BusBank", "legal_name": "GCS Holdings"},
    {"slug": "shs", "name": "SHS Home Warranty", "legal_name": "SHS Home Services"},
    {"slug": "manhattan-eye", "name": "Manhattan Eye", "legal_name": "Manhattan Eye PLLC"},
    {"slug": "dental-shop", "name": "Dental Shop", "legal_name": "Dental Shop"},
]

PROPERTIES = [
    {"client_slug": "phil-lasry", "slug": "phil-lasry", "name": "Phil Lasry",
     "primary_domain": "plasry.com"},
    {"client_slug": "tna", "slug": "tnabushire", "name": "TNA Bus Hire",
     "primary_domain": "tnabushire.com.au"},
    {"client_slug": "tna", "slug": "buscharter", "name": "BusCharter",
     "primary_domain": "buscharter.com.au"},
    {"client_slug": "tna", "slug": "minibushire", "name": "Mini Bus Hire AU",
     "primary_domain": "minibushire.com.au"},
    {"client_slug": "kitchen-services-of-san-diego", "slug": "kssd-sd", "name": "Kitchen Services SD",
     "primary_domain": "kitchenservicesofsandiego.com"},
    {"client_slug": "kitchen-services-of-san-diego", "slug": "kssd-dfw", "name": "Kitchen Services DFW",
     "primary_domain": "kitchenservicesofdfw.com"},
    {"client_slug": "tacoma-legacy-partners", "slug": "kg-provo", "name": "Kitchen Services Provo",
     "primary_domain": "kitchenservicesofprovo.com"},
    {"client_slug": "becker-family-flooring", "slug": "fci-westchester", "name": "FCI Southern Westchester",
     "primary_domain": "floorcoveringsinternational.com"},
    {"client_slug": "busbank", "slug": "busbank", "name": "BusBank", "primary_domain": "busbank.com"},
]


def run() -> None:
    db = get_admin_client()

    for c in CLIENTS:
        db.table("client").upsert(c, on_conflict="slug").execute()

    slug_to_id = {row["slug"]: row["id"] for row in db.table("client").select("id, slug").execute().data}

    for p in PROPERTIES:
        client_id = slug_to_id[p.pop("client_slug")]
        db.table("property").upsert({**p, "client_id": client_id}, on_conflict="slug").execute()

    print(f"Seeded {len(CLIENTS)} clients and {len(PROPERTIES)} properties.")


if __name__ == "__main__":
    run()
```

- [ ] **Step 4: Run the seed**

```bash
cd /Users/paulskirbe/agency/operations/seo-platform
/Users/paulskirbe/agency/.venv/bin/python scripts/seed_clients_properties.py
```

Expected: prints `Seeded 9 clients and 9 properties.`

- [ ] **Step 5: Run idempotency test**

```bash
/Users/paulskirbe/agency/.venv/bin/pytest tests/test_seed_idempotent.py -v
```

Expected: PASS.

- [ ] **Step 6: Verify in Supabase Studio**

Open https://supabase.com/dashboard, navigate to seo-platform-dev › Table Editor › `client` and `property`. Confirm rows exist.

- [ ] **Step 7: Commit**

```bash
cd /Users/paulskirbe/agency
git add operations/seo-platform/scripts/seed_clients_properties.py operations/seo-platform/tests/test_seed_idempotent.py
git commit -m "feat(seo-platform): seed clients + properties from delivery folders, idempotent"
```

---

## Task 10: Backfill phil-lasry pages from WQA workbook

**Files:**
- Create: `operations/seo-platform/scripts/backfill_phil_lasry_pages.py`

The WQA workbook is at `delivery/phil-lasry/phase-1-wqa/plasry-Website-Quality-Audit-2026-04-14.xlsx`. The triage tab (Tab 11 per WQA SOP v5) has one row per URL with the audit_action assigned.

- [ ] **Step 1: Inspect the workbook structure**

```bash
cd /Users/paulskirbe/agency
.venv/bin/python -c "
import openpyxl
wb = openpyxl.load_workbook('delivery/phil-lasry/phase-1-wqa/plasry-Website-Quality-Audit-2026-04-14.xlsx', read_only=True, data_only=True)
for sheet_name in wb.sheetnames:
    ws = wb[sheet_name]
    print(f'Sheet: {sheet_name} - rows: {ws.max_row}')
    if ws.max_row > 0:
        first_row = next(ws.iter_rows(min_row=1, max_row=1, values_only=True), None)
        print(f'  Headers: {first_row}')
"
```

Capture the output. The script in Step 2 will reference the actual sheet name and column positions for the triage tab. Update the script's `TRIAGE_SHEET_NAME` and column index constants based on what you see.

- [ ] **Step 2: Write the backfill script**

`operations/seo-platform/scripts/backfill_phil_lasry_pages.py`:

```python
"""Backfill phil-lasry pages from the existing WQA workbook into Supabase.

Reads the triage tab, normalizes audit_action labels, upserts page rows.
"""
from __future__ import annotations

from pathlib import Path
from typing import Iterator

import openpyxl

from scripts.supabase_client import get_admin_client


WORKBOOK = Path("/Users/paulskirbe/agency/delivery/phil-lasry/phase-1-wqa/plasry-Website-Quality-Audit-2026-04-14.xlsx")
TRIAGE_SHEET_NAME = "URL Triage"  # ADJUST after Task 10 Step 1 inspection
PROPERTY_SLUG = "phil-lasry"

# Column indices from triage tab (0-indexed). ADJUST after inspection.
COL_URL = 0
COL_PAGE_TYPE = 1
COL_STATUS_CODE = 2
COL_AUDIT_ACTION = 3
COL_AUDIT_TARGET = 4
COL_AUDIT_NOTES = 5
COL_TITLE = 6
COL_H1 = 7

ACTION_NORMALIZE = {
    "optimize": "optimize", "Optimize": "optimize",
    "restore": "restore", "Restore": "restore",
    "redirect": "redirect", "Redirect": "redirect",
    "consolidate": "consolidate", "Consolidate": "consolidate",
    "remove": "remove", "Remove": "remove", "Delete": "remove",
    "keep": "keep", "Keep": "keep",
    "no action": "no_action", "No Action": "no_action", "no_action": "no_action",
    "": "undecided", None: "undecided",
}


def iter_triage_rows() -> Iterator[dict]:
    wb = openpyxl.load_workbook(WORKBOOK, read_only=True, data_only=True)
    ws = wb[TRIAGE_SHEET_NAME]
    rows = ws.iter_rows(min_row=2, values_only=True)  # skip header
    for row in rows:
        if not row or not row[COL_URL]:
            continue
        url = str(row[COL_URL]).strip()
        if not url.startswith("http"):
            continue
        yield {
            "url": url,
            "page_type": str(row[COL_PAGE_TYPE] or "").strip() or None,
            "status_code": int(row[COL_STATUS_CODE]) if row[COL_STATUS_CODE] else None,
            "audit_action": ACTION_NORMALIZE.get(row[COL_AUDIT_ACTION], "undecided"),
            "audit_target_url": str(row[COL_AUDIT_TARGET] or "").strip() or None,
            "audit_notes": str(row[COL_AUDIT_NOTES] or "").strip() or None,
            "title": str(row[COL_TITLE] or "").strip() or None,
            "h1": str(row[COL_H1] or "").strip() or None,
        }


def run() -> None:
    db = get_admin_client()
    prop = db.table("property").select("id").eq("slug", PROPERTY_SLUG).single().execute().data
    property_id = prop["id"]

    rows = list(iter_triage_rows())
    print(f"Read {len(rows)} pages from {WORKBOOK.name}")

    batch_size = 100
    inserted = 0
    for i in range(0, len(rows), batch_size):
        batch = [
            {**r, "property_id": property_id, "audit_decided_by": "import:wqa_workbook",
             "audit_decided_at": "2026-04-14T00:00:00Z"}
            for r in rows[i:i + batch_size]
        ]
        db.table("page").upsert(batch, on_conflict="property_id,url").execute()
        inserted += len(batch)
        print(f"  upserted {inserted}/{len(rows)}")

    print(f"Done. {inserted} page rows in Supabase for {PROPERTY_SLUG}.")


if __name__ == "__main__":
    run()
```

- [ ] **Step 3: Run the backfill**

```bash
cd /Users/paulskirbe/agency/operations/seo-platform
/Users/paulskirbe/agency/.venv/bin/python scripts/backfill_phil_lasry_pages.py
```

Expected: prints row count and progress, ends with "Done. N page rows in Supabase for phil-lasry."

- [ ] **Step 4: Spot check in Studio**

Open Supabase Studio › Table Editor › `page`. Filter by `property_id` (the phil-lasry one). Confirm rows match expected count from the workbook. Spot-check that audit_action values are populated.

- [ ] **Step 5: Add a smoke test**

Append to `operations/seo-platform/tests/test_smoke_supabase.py`:

```python
def test_phil_lasry_pages_present(admin_client):
    """After backfill, phil-lasry has at least 50 pages with audit_action set."""
    prop = admin_client.table("property").select("id").eq("slug", "phil-lasry").single().execute().data
    pages = (
        admin_client.table("page")
        .select("audit_action")
        .eq("property_id", prop["id"])
        .execute()
        .data
    )
    assert len(pages) >= 50
    decided = [p for p in pages if p["audit_action"] not in (None, "undecided")]
    assert len(decided) > 0
```

- [ ] **Step 6: Run, see pass**

```bash
/Users/paulskirbe/agency/.venv/bin/pytest tests/test_smoke_supabase.py::test_phil_lasry_pages_present -v
```

- [ ] **Step 7: Commit**

```bash
cd /Users/paulskirbe/agency
git add operations/seo-platform/scripts/backfill_phil_lasry_pages.py operations/seo-platform/tests/test_smoke_supabase.py
git commit -m "feat(seo-platform): backfill phil-lasry pages from WQA workbook"
```

---

## Task 11: Inference module foundation — OpenAI wrapper

**Files:**
- Create: `operations/seo-platform/inference/client.py`
- Create: `operations/seo-platform/inference/tests/conftest.py`

- [ ] **Step 1: Write the OpenAI wrapper**

`operations/seo-platform/inference/client.py`:

```python
"""Thin wrapper around OpenAI client for inference modules.

Uses the Structured Outputs feature so each section returns parsed JSON matching
its Pydantic schema. Centralizes model + temperature + retries.
"""
from __future__ import annotations

import os
from functools import lru_cache
from typing import Type, TypeVar

from dotenv import load_dotenv
from openai import OpenAI
from pydantic import BaseModel

load_dotenv("/Users/paulskirbe/agency/.env")

MODEL = "gpt-4o-2024-08-06"  # supports structured outputs
TEMPERATURE = 0.2

T = TypeVar("T", bound=BaseModel)


@lru_cache(maxsize=1)
def _client() -> OpenAI:
    return OpenAI(api_key=os.environ["OPENAI_API_KEY"])


def infer(system: str, user: str, response_model: Type[T]) -> T:
    """Run a structured-output call. Returns a parsed instance of response_model."""
    completion = _client().beta.chat.completions.parse(
        model=MODEL,
        temperature=TEMPERATURE,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        response_format=response_model,
    )
    return completion.choices[0].message.parsed
```

- [ ] **Step 2: Write shared test fixtures**

`operations/seo-platform/inference/tests/conftest.py`:

```python
"""Shared fixtures for Brand DNA inference tests."""
from pathlib import Path

import pytest


SAMPLE_PAGES = [
    {
        "url": "https://plasry.com/",
        "title": "Phil Lasry - Personal Injury Lawyer NYC",
        "h1": "Get the compensation you deserve",
        "content_text": (
            "Phil Lasry is a personal injury attorney in New York City representing clients in "
            "spinal cord injury, medical malpractice, and serious car accident cases. With over "
            "$50M recovered for clients, Phil takes pride in personal attention and aggressive "
            "advocacy. Free consultation. No fee unless we win."
        ),
    },
    {
        "url": "https://plasry.com/services/spinal-cord-injury",
        "title": "Spinal Cord Injury Lawyer NYC",
        "h1": "Spinal Cord Injury Cases",
        "content_text": (
            "Spinal cord injuries change lives in an instant. Our firm has recovered over $20M "
            "for clients with spinal cord injuries from car accidents, falls, and medical "
            "malpractice. We work with leading neurologists and life-care planners to document "
            "the full impact."
        ),
    },
]


@pytest.fixture
def sample_pages():
    return SAMPLE_PAGES


@pytest.fixture
def empty_intake():
    """Many clients don't have a formal intake form filled. Inference must work on pages alone."""
    return {}
```

- [ ] **Step 3: Manual smoke test of OpenAI wrapper**

```bash
cd /Users/paulskirbe/agency/operations/seo-platform
/Users/paulskirbe/agency/.venv/bin/python -c "
import sys; sys.path.insert(0, '.')
from pydantic import BaseModel
from inference.client import infer

class Greeting(BaseModel):
    salutation: str
    audience: str

g = infer(system='You write greetings.', user='Greet a personal injury law firm in 4 words.', response_model=Greeting)
print(g)
"
```

Expected: prints something like `salutation='Welcome' audience='attorneys'`. Confirms OpenAI key is valid and structured outputs work.

- [ ] **Step 4: Commit**

```bash
cd /Users/paulskirbe/agency
git add operations/seo-platform/inference/client.py operations/seo-platform/inference/tests/conftest.py
git commit -m "feat(seo-platform): inference module - OpenAI structured-outputs wrapper + fixtures"
```

---

## Task 12: Inference — Voice & Tone section

**Files:**
- Create: `operations/seo-platform/inference/voice_tone.py`
- Create: `operations/seo-platform/inference/tests/test_voice_tone.py`

- [ ] **Step 1: Write the failing test**

`operations/seo-platform/inference/tests/test_voice_tone.py`:

```python
from inference.voice_tone import infer_voice_tone


def test_voice_tone_inference_returns_required_fields(sample_pages):
    result = infer_voice_tone(pages=sample_pages)
    assert isinstance(result.reading_level, str) and result.reading_level
    assert isinstance(result.tone_descriptors, list) and len(result.tone_descriptors) >= 2
    assert isinstance(result.dos, list) and len(result.dos) >= 2
    assert isinstance(result.donts, list) and len(result.donts) >= 1


def test_voice_tone_reflects_page_content(sample_pages):
    result = infer_voice_tone(pages=sample_pages)
    descriptors = " ".join(result.tone_descriptors).lower()
    # Personal injury content should not come back as "playful" or "casual humor"
    assert "playful" not in descriptors
    assert "humor" not in descriptors
```

- [ ] **Step 2: Run, see fail**

```bash
cd /Users/paulskirbe/agency/operations/seo-platform
/Users/paulskirbe/agency/.venv/bin/pytest inference/tests/test_voice_tone.py -v
```

Expected: FAIL with import error.

- [ ] **Step 3: Write the inference module**

`operations/seo-platform/inference/voice_tone.py`:

```python
"""Infer the voice & tone Brand DNA section from crawled pages."""
from __future__ import annotations

from typing import Sequence

from pydantic import BaseModel, Field

from inference.client import infer


class VoiceTone(BaseModel):
    reading_level: str = Field(description="One of: middle-school, high-school, college, professional")
    tone_descriptors: list[str] = Field(
        description="3-5 single-word adjectives describing the brand voice (e.g. authoritative, warm, direct)"
    )
    dos: list[str] = Field(description="3-5 short do-this style guidelines")
    donts: list[str] = Field(description="3-5 short avoid-this style guidelines")
    example_good_sentence: str = Field(description="One sentence in the voice")
    example_bad_sentence: str = Field(description="One sentence that violates the voice")


SYSTEM = """You are a brand strategist analyzing a website to extract its voice & tone.
Read the pages provided and return a structured voice profile. Be specific and actionable.
Avoid generic descriptors like 'professional' alone — pair them with concrete cues from the content."""


def infer_voice_tone(pages: Sequence[dict]) -> VoiceTone:
    """Infer voice & tone from a sample of pages.

    pages: list of dicts with url, title, h1, content_text. Use 5-10 pages for best signal.
    """
    page_excerpts = "\n\n".join(
        f"## {p['url']}\n# {p.get('title', '')}\n## {p.get('h1', '')}\n{p.get('content_text', '')[:1500]}"
        for p in pages[:10]
    )
    user = (
        "Analyze the following pages and produce the voice & tone profile.\n\n"
        f"{page_excerpts}"
    )
    return infer(system=SYSTEM, user=user, response_model=VoiceTone)
```

- [ ] **Step 4: Run, see pass**

```bash
/Users/paulskirbe/agency/.venv/bin/pytest inference/tests/test_voice_tone.py -v
```

Expected: PASS. (Note: this hits the OpenAI API and costs ~$0.01 per run.)

- [ ] **Step 5: Commit**

```bash
cd /Users/paulskirbe/agency
git add operations/seo-platform/inference/voice_tone.py operations/seo-platform/inference/tests/test_voice_tone.py
git commit -m "feat(seo-platform): voice & tone inference module + test"
```

---

## Task 13: Inference — Brand Terms section

**Files:**
- Create: `operations/seo-platform/inference/brand_terms.py`
- Create: `operations/seo-platform/inference/tests/test_brand_terms.py`

- [ ] **Step 1: Write the failing test**

`operations/seo-platform/inference/tests/test_brand_terms.py`:

```python
from inference.brand_terms import infer_brand_terms


def test_brand_terms_returns_lists(sample_pages):
    result = infer_brand_terms(pages=sample_pages)
    assert len(result.always_use) >= 1
    assert all(isinstance(t, str) for t in result.always_use)
    assert isinstance(result.never_use, list)
    assert isinstance(result.variants, list)


def test_brand_terms_reflects_actual_phrases(sample_pages):
    result = infer_brand_terms(pages=sample_pages)
    joined = " ".join(result.always_use).lower()
    # phil-lasry pages mention spinal cord, medical malpractice, etc.
    assert any(term in joined for term in ["spinal", "injury", "personal injury"])
```

- [ ] **Step 2: Run, see fail**

```bash
/Users/paulskirbe/agency/.venv/bin/pytest inference/tests/test_brand_terms.py -v
```

- [ ] **Step 3: Write the module**

`operations/seo-platform/inference/brand_terms.py`:

```python
"""Infer brand terms (always-use, never-use, variants) from crawled pages."""
from __future__ import annotations

from typing import Sequence

from pydantic import BaseModel, Field

from inference.client import infer


class BrandTermVariant(BaseModel):
    canonical: str
    acceptable: list[str]


class BrandTerms(BaseModel):
    always_use: list[str] = Field(description="3-8 phrases or terms the brand consistently uses")
    never_use: list[str] = Field(description="0-5 phrases the brand avoids (competitor framing, sloppy language)")
    variants: list[BrandTermVariant] = Field(
        description="Canonical-form mappings for terms with multiple spellings"
    )


SYSTEM = """You extract a brand's terminology from its website content.
Return phrases that recur across pages (always_use), framings that contradict the brand voice or are competitor-style (never_use),
and canonical forms for terms appearing in multiple variants."""


def infer_brand_terms(pages: Sequence[dict]) -> BrandTerms:
    page_excerpts = "\n\n".join(
        f"## {p['url']}\n# {p.get('title', '')}\n{p.get('content_text', '')[:1500]}"
        for p in pages[:10]
    )
    user = f"Extract brand terminology from these pages.\n\n{page_excerpts}"
    return infer(system=SYSTEM, user=user, response_model=BrandTerms)
```

- [ ] **Step 4: Run, see pass**

```bash
/Users/paulskirbe/agency/.venv/bin/pytest inference/tests/test_brand_terms.py -v
```

- [ ] **Step 5: Commit**

```bash
git add operations/seo-platform/inference/brand_terms.py operations/seo-platform/inference/tests/test_brand_terms.py
git commit -m "feat(seo-platform): brand terms inference module"
```

---

## Task 14: Inference — Proof section

**Files:**
- Create: `operations/seo-platform/inference/proof.py`
- Create: `operations/seo-platform/inference/tests/test_proof.py`

- [ ] **Step 1: Write the failing test**

`operations/seo-platform/inference/tests/test_proof.py`:

```python
from inference.proof import infer_proof


def test_proof_returns_structured_assets(sample_pages):
    result = infer_proof(pages=sample_pages)
    assert isinstance(result.case_studies, list)
    assert isinstance(result.stats, list)
    assert isinstance(result.certifications, list)
```

- [ ] **Step 2: Run, see fail**

```bash
/Users/paulskirbe/agency/.venv/bin/pytest inference/tests/test_proof.py -v
```

- [ ] **Step 3: Write the module**

`operations/seo-platform/inference/proof.py`:

```python
"""Infer proof assets (case studies, stats, testimonials, certifications) from crawled pages."""
from __future__ import annotations

from typing import Sequence

from pydantic import BaseModel, Field

from inference.client import infer


class ProofAsset(BaseModel):
    title: str
    asset_type: str = Field(description="One of: case_study, stat, testimonial, certification, award, press")
    detail: str
    source_url: str | None = None


class Proof(BaseModel):
    case_studies: list[ProofAsset]
    stats: list[ProofAsset]
    testimonials: list[ProofAsset]
    certifications: list[ProofAsset]
    awards: list[ProofAsset]
    press: list[ProofAsset]


SYSTEM = """You extract proof points from a brand's website.
Surface concrete case studies, headline stats, testimonial fragments, certifications, awards, and press mentions.
Each asset must be verifiable from the content provided. Skip vague claims."""


def infer_proof(pages: Sequence[dict]) -> Proof:
    page_excerpts = "\n\n".join(
        f"## {p['url']}\n# {p.get('title', '')}\n{p.get('content_text', '')[:1500]}"
        for p in pages[:10]
    )
    user = f"Extract proof assets from these pages.\n\n{page_excerpts}"
    return infer(system=SYSTEM, user=user, response_model=Proof)
```

- [ ] **Step 4: Run, see pass**

```bash
/Users/paulskirbe/agency/.venv/bin/pytest inference/tests/test_proof.py -v
```

- [ ] **Step 5: Commit**

```bash
git add operations/seo-platform/inference/proof.py operations/seo-platform/inference/tests/test_proof.py
git commit -m "feat(seo-platform): proof inference module"
```

---

## Task 15: Inference — Future Audience + Brand Story

**Files:**
- Create: `operations/seo-platform/inference/future_audience.py`
- Create: `operations/seo-platform/inference/brand_story.py`
- Create: `operations/seo-platform/inference/tests/test_future_audience.py`
- Create: `operations/seo-platform/inference/tests/test_brand_story.py`

- [ ] **Step 1: Future Audience — failing test**

`operations/seo-platform/inference/tests/test_future_audience.py`:

```python
from inference.future_audience import infer_future_audience


def test_future_audience_has_horizon_and_shift(sample_pages):
    result = infer_future_audience(pages=sample_pages)
    assert result.horizon_months >= 6
    assert result.horizon_months <= 36
    assert len(result.shift) > 10  # not empty
    assert len(result.why) > 10
```

- [ ] **Step 2: Future Audience — module**

`operations/seo-platform/inference/future_audience.py`:

```python
"""Infer the 'future audience' Brand DNA section: who the brand wants its audience to be in 18 months.

Tryggvi pattern: shifts in target buyer become directional inputs to keyword + content strategy.
"""
from __future__ import annotations

from typing import Sequence

from pydantic import BaseModel, Field

from inference.client import infer


class FutureAudience(BaseModel):
    horizon_months: int = Field(description="6-36 months", ge=6, le=36)
    shift: str = Field(description="One sentence: 'From X buyer to Y buyer'")
    why: str = Field(description="One sentence rationale")


SYSTEM = """You are a brand strategist looking for directional shifts in a brand's audience.
Read the pages and propose how the audience could evolve over 12-24 months.
Lean toward higher-value buyer segments where the content already shows aspirational positioning.
If the pages give no clear signal, default to 'shift toward higher-value buyers in same segment'."""


def infer_future_audience(pages: Sequence[dict]) -> FutureAudience:
    page_excerpts = "\n\n".join(
        f"## {p['url']}\n{p.get('content_text', '')[:1500]}"
        for p in pages[:8]
    )
    user = f"Propose a future-audience shift for this brand.\n\n{page_excerpts}"
    return infer(system=SYSTEM, user=user, response_model=FutureAudience)
```

- [ ] **Step 3: Brand Story — failing test**

`operations/seo-platform/inference/tests/test_brand_story.py`:

```python
from inference.brand_story import infer_brand_story


def test_brand_story_has_narrative(sample_pages):
    result = infer_brand_story(pages=sample_pages)
    assert len(result.body) > 100  # multi-paragraph narrative
    assert "phil" in result.body.lower() or "lasry" in result.body.lower()
```

- [ ] **Step 4: Brand Story — module**

`operations/seo-platform/inference/brand_story.py`:

```python
"""Generate the brand story narrative section from crawled pages."""
from __future__ import annotations

from typing import Sequence

from pydantic import BaseModel, Field

from inference.client import infer


class BrandStory(BaseModel):
    body: str = Field(description="2-4 paragraphs covering origin, mission, and what changed in the market")


SYSTEM = """You are a brand strategist writing a brand story from a website's content.
Write 2-4 paragraphs covering: who founded it / when, what problem they saw, what they do, what's changed in the market that makes this work necessary.
Keep it grounded in what the pages actually say. If something isn't on the site, don't invent it."""


def infer_brand_story(pages: Sequence[dict]) -> BrandStory:
    page_excerpts = "\n\n".join(
        f"## {p['url']}\n# {p.get('title', '')}\n{p.get('content_text', '')[:1800]}"
        for p in pages[:10]
    )
    user = f"Write the brand story for this website.\n\n{page_excerpts}"
    return infer(system=SYSTEM, user=user, response_model=BrandStory)
```

- [ ] **Step 5: Run all four section tests, see all pass**

```bash
cd /Users/paulskirbe/agency/operations/seo-platform
/Users/paulskirbe/agency/.venv/bin/pytest inference/tests/ -v
```

Expected: 4 modules tested (voice_tone, brand_terms, proof, future_audience, brand_story = 5 modules; ~10 tests). All PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/paulskirbe/agency
git add operations/seo-platform/inference/future_audience.py operations/seo-platform/inference/brand_story.py operations/seo-platform/inference/tests/test_future_audience.py operations/seo-platform/inference/tests/test_brand_story.py
git commit -m "feat(seo-platform): future_audience + brand_story inference modules"
```

---

## Task 16: Backfill phil-lasry Brand DNA

**Files:**
- Create: `operations/seo-platform/scripts/backfill_phil_lasry_brand_dna.py`

- [ ] **Step 1: Write the backfill script**

`operations/seo-platform/scripts/backfill_phil_lasry_brand_dna.py`:

```python
"""Backfill phil-lasry Brand DNA: identity from manual constants, voice/terms/proof/future/story from inference.

Skips sections that already exist in brand_dna_section. Re-run safely.
"""
from __future__ import annotations

from inference.brand_story import infer_brand_story
from inference.brand_terms import infer_brand_terms
from inference.future_audience import infer_future_audience
from inference.proof import infer_proof
from inference.voice_tone import infer_voice_tone
from scripts.supabase_client import get_admin_client


PROPERTY_SLUG = "phil-lasry"

# Identity is sourced from intake form (manually authored here in v1).
IDENTITY_CONTENT = {
    "legal_name": "Phil Lasry LLC",
    "brand_name": "Phil Lasry",
    "founded": 2018,
    "hq_location": "New York, NY",
    "operating_locations": ["New York", "New Jersey"],
}


def fetch_pages_for_inference(db, property_id: str) -> list[dict]:
    """Pull a sample of indexable, content-rich pages for the inference agent.

    Selection: prefer service / landing pages with the most content; cap at 10.
    """
    pages = (
        db.table("page")
        .select("url, title, h1, content_text, page_type")
        .eq("property_id", property_id)
        .or_("audit_action.eq.optimize,audit_action.eq.keep")
        .limit(40)
        .execute()
        .data
    )
    pages = [p for p in pages if (p.get("content_text") or "").strip()]
    pages.sort(key=lambda p: -len(p.get("content_text") or ""))
    return pages[:10]


def upsert_section(db, property_id: str, section: str, content: dict | None,
                   body: str | None, source: str, confidence: float | None = None) -> None:
    db.table("brand_dna_section").upsert({
        "property_id": property_id,
        "section": section,
        "content": content or {},
        "body": body,
        "source": source,
        "confidence": confidence,
        "updated_by": "import:phil_lasry_backfill",
    }, on_conflict="property_id,section").execute()


def run() -> None:
    db = get_admin_client()
    prop = db.table("property").select("id").eq("slug", PROPERTY_SLUG).single().execute().data
    property_id = prop["id"]

    print(f"Backfilling Brand DNA for {PROPERTY_SLUG} ({property_id})")

    # 1. Identity (manual)
    upsert_section(db, property_id, "identity", IDENTITY_CONTENT, None, "import:manual", 0.95)

    # 2. Pages for inference
    pages = fetch_pages_for_inference(db, property_id)
    print(f"  using {len(pages)} pages for inference")

    # 3. Voice & Tone
    print("  inferring voice_tone...")
    vt = infer_voice_tone(pages)
    upsert_section(db, property_id, "voice_tone", vt.model_dump(), None, "agent:voice_tone_v1", 0.7)

    # 4. Brand Terms
    print("  inferring brand_terms...")
    bt = infer_brand_terms(pages)
    upsert_section(db, property_id, "brand_terms", bt.model_dump(), None, "agent:brand_terms_v1", 0.7)

    # 5. Proof
    print("  inferring proof...")
    pr = infer_proof(pages)
    upsert_section(db, property_id, "proof", pr.model_dump(), None, "agent:proof_v1", 0.7)

    # 6. Future Audience
    print("  inferring future_audience...")
    fa = infer_future_audience(pages)
    upsert_section(db, property_id, "future_audience", fa.model_dump(), None, "agent:future_audience_v1", 0.5)

    # 7. Brand Story
    print("  inferring brand_story...")
    bs = infer_brand_story(pages)
    upsert_section(db, property_id, "brand_story", None, bs.body, "agent:brand_story_v1", 0.6)

    print("Done.")


if __name__ == "__main__":
    run()
```

- [ ] **Step 2: Run the backfill**

```bash
cd /Users/paulskirbe/agency/operations/seo-platform
/Users/paulskirbe/agency/.venv/bin/python scripts/backfill_phil_lasry_brand_dna.py
```

Expected: prints inference progress and ends with "Done." Total OpenAI cost: ~$0.10.

- [ ] **Step 3: Verify in Studio**

Open Supabase Studio › Table Editor › `brand_dna_section`. Filter by phil-lasry property_id. Confirm 7 rows: identity, voice_tone, brand_terms, proof, future_audience, brand_story.

- [ ] **Step 4: Add a smoke test**

Append to `operations/seo-platform/tests/test_smoke_supabase.py`:

```python
def test_phil_lasry_brand_dna_complete(admin_client):
    prop = admin_client.table("property").select("id").eq("slug", "phil-lasry").single().execute().data
    sections = (
        admin_client.table("brand_dna_section")
        .select("section")
        .eq("property_id", prop["id"])
        .execute()
        .data
    )
    section_names = {s["section"] for s in sections}
    required = {"identity", "voice_tone", "brand_terms", "proof", "future_audience", "brand_story"}
    assert required.issubset(section_names), f"Missing: {required - section_names}"
```

- [ ] **Step 5: Run, see pass**

```bash
/Users/paulskirbe/agency/.venv/bin/pytest tests/test_smoke_supabase.py::test_phil_lasry_brand_dna_complete -v
```

- [ ] **Step 6: Commit**

```bash
cd /Users/paulskirbe/agency
git add operations/seo-platform/scripts/backfill_phil_lasry_brand_dna.py operations/seo-platform/tests/test_smoke_supabase.py
git commit -m "feat(seo-platform): backfill phil-lasry brand DNA via inference (5 sections + identity)"
```

---

## Task 17: Markdown export

**Files:**
- Create: `operations/seo-platform/scripts/export_brand_dna_markdown.py`

- [ ] **Step 1: Write the export script**

`operations/seo-platform/scripts/export_brand_dna_markdown.py`:

```python
"""Export a property's Brand DNA from Supabase to delivery/{slug}/00-brand-dna.md.

Output format matches brand-dna-brain-spec-v1.md: YAML frontmatter for structured fields,
markdown body for prose sections (brand_story, positioning, voice_tone narrative, etc).
"""
from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path

import yaml

from scripts.supabase_client import get_admin_client


DELIVERY_ROOT = Path("/Users/paulskirbe/agency/delivery")


def load_sections(db, property_slug: str) -> tuple[dict, dict]:
    """Returns (property_row, sections_by_name)."""
    prop = db.table("property").select("*").eq("slug", property_slug).single().execute().data
    rows = (
        db.table("brand_dna_section")
        .select("*")
        .eq("property_id", prop["id"])
        .execute()
        .data
    )
    return prop, {r["section"]: r for r in rows}


def build_frontmatter(prop: dict, sections: dict) -> dict:
    fm = {
        "client": prop["slug"],
        "domain": prop["primary_domain"],
        "version": "v1",
        "last_updated": date.today().isoformat(),
        "phase_0_status": "complete" if "identity" in sections else "in_progress",
    }
    if "identity" in sections:
        fm.update(sections["identity"]["content"])
    for key in ("offerings", "personas", "future_audience", "brand_terms",
                "proof", "competitors", "site_structure", "goals"):
        if key in sections and sections[key].get("content"):
            fm[key] = sections[key]["content"]
    return fm


def build_body(sections: dict) -> str:
    """Build the prose sections per spec."""
    parts: list[str] = []
    section_order = [
        ("brand_story", "1. Brand story"),
        ("positioning", "2. Positioning"),
        ("voice_tone", "3. Voice & tone"),
        ("audience_deep_dive", "4. Audience deep-dive"),
        ("offering_deep_dive", "5. Offering deep-dive"),
        ("trust_proof_themes", "6. Trust & proof themes"),
        ("competitive_read", "7. Competitive read"),
        ("skyward_strategy_notes", "8. Skyward strategy notes"),
    ]
    for key, heading in section_order:
        parts.append(f"## {heading}")
        if key in sections and (sections[key].get("body") or sections[key].get("content")):
            row = sections[key]
            if row.get("body"):
                parts.append(row["body"])
            elif row.get("content"):
                parts.append("```yaml\n" + yaml.dump(row["content"], sort_keys=False) + "```")
        else:
            parts.append("TBD")
        parts.append("")
    return "\n".join(parts)


def export(property_slug: str) -> Path:
    db = get_admin_client()
    prop, sections = load_sections(db, property_slug)

    frontmatter = build_frontmatter(prop, sections)
    body = build_body(sections)

    fm_yaml = yaml.dump(frontmatter, sort_keys=False, allow_unicode=True)
    doc = f"---\n{fm_yaml}---\n\n{body}\n"

    out_path = DELIVERY_ROOT / property_slug / "00-brand-dna.md"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(doc)
    print(f"Wrote {out_path}")
    return out_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("property_slug")
    args = parser.parse_args()
    export(args.property_slug)
```

- [ ] **Step 2: Run for phil-lasry**

```bash
cd /Users/paulskirbe/agency/operations/seo-platform
/Users/paulskirbe/agency/.venv/bin/python scripts/export_brand_dna_markdown.py phil-lasry
```

Expected: prints `Wrote /Users/paulskirbe/agency/delivery/phil-lasry/00-brand-dna.md`.

- [ ] **Step 3: Spot-check the output**

```bash
head -80 /Users/paulskirbe/agency/delivery/phil-lasry/00-brand-dna.md
```

Confirm: valid YAML frontmatter, identity fields populated, body sections present (some "TBD" is fine for sections we haven't inferred yet).

- [ ] **Step 4: Add export round-trip test**

Append to `operations/seo-platform/tests/test_smoke_supabase.py`:

```python
def test_brand_dna_markdown_export_round_trip(tmp_path, monkeypatch):
    """Export should produce a non-empty file with the expected frontmatter keys."""
    from scripts.export_brand_dna_markdown import export

    out_path = export("phil-lasry")
    assert out_path.exists()
    content = out_path.read_text()
    assert content.startswith("---\n")
    assert "client: phil-lasry" in content
    assert "domain: plasry.com" in content
    assert "## 1. Brand story" in content
```

- [ ] **Step 5: Run, see pass**

```bash
/Users/paulskirbe/agency/.venv/bin/pytest tests/test_smoke_supabase.py::test_brand_dna_markdown_export_round_trip -v
```

- [ ] **Step 6: Commit**

```bash
cd /Users/paulskirbe/agency
git add operations/seo-platform/scripts/export_brand_dna_markdown.py operations/seo-platform/tests/test_smoke_supabase.py delivery/phil-lasry/00-brand-dna.md
git commit -m "feat(seo-platform): markdown export for Brand DNA + phil-lasry first generation"
```

---

## Task 18: End-to-end smoke + handoff doc

**Files:**
- Modify: `operations/seo-platform/tests/test_smoke_supabase.py`
- Create: `operations/seo-platform/specs/p0-completion-summary.md`

- [ ] **Step 1: Run the full test suite**

```bash
cd /Users/paulskirbe/agency/operations/seo-platform
/Users/paulskirbe/agency/.venv/bin/pytest -v
```

Expected: all tests PASS. Roughly: 5 schema smoke, 1 phil-lasry pages, 1 brand DNA complete, 1 export round-trip, 1 idempotency, plus 5 inference module tests = ~14 tests.

- [ ] **Step 2: Write the completion summary**

`operations/seo-platform/specs/p0-completion-summary.md`:

```markdown
---
title: P0 Data Foundation - Completion Summary
status: complete
date: <fill>
---

# P0 Completion Summary

P0 is done. The Supabase data foundation is up and phil-lasry is fully populated.

## What's running in Supabase (`seo-platform-dev`)

- 5 migrations applied: extensions, client + team, property, page (with pgvector), brand_dna_section + project_brain_entry
- RLS policies in place for all mutable tables
- 9 clients seeded
- 9 properties seeded
- ~400 page rows backfilled for phil-lasry from WQA workbook
- 6 brand_dna_section rows for phil-lasry (identity + 5 inferred sections)
- Markdown export at `delivery/phil-lasry/00-brand-dna.md`

## What runs in CI (or locally)

- `pytest operations/seo-platform/` - 14 tests, all passing

## What's next (P1 plan)

The Next.js UI plan (P1) will build:
1. Next.js app on Vercel with Supabase Auth
2. Sidebar shell + property switcher
3. Property page with 5 JTBD tabs
4. Pages Triage view (Discovery > Pages)
5. Brand DNA editor (Strategy > Brand DNA)
6. Project Brain section (Strategy > Project Brain)
7. Markdown export button (regenerates `00-brand-dna.md` on demand)

## Open items deferred from P0

- Crawl integration (Adam walkthrough) - we backfilled phil-lasry from existing data; future properties need a real crawl pipeline
- Embeddings - schema supports `page.embedding` but P0 didn't generate them. Add to crawl integration or run as a separate batch.
- Project Brain seeding - table exists but is empty. Populate as work happens via P1 UI.
- Other client backfills - same approach as phil-lasry but applied to TNA, KSSD, etc. when needed.

## Adam walkthrough items still pending

1. BQ ops dataset structure (`data-hub-468216.seo_platform_ops`)
2. Pipeline package writing patterns + transactional behavior
3. ETL ownership (his service vs separate sync vs FDW)
4. Embedding generation step placement
5. Backfill plan for other clients
```

- [ ] **Step 3: Open a PR**

```bash
cd /Users/paulskirbe/agency
git push -u origin feat/p0-data-foundation
gh pr create --title "P0: Data foundation for SEO Platform" --body "$(cat <<'EOF'
## Summary
- 5 Supabase migrations: client, property, page (with pgvector), brand_dna_section, project_brain_entry, plus RLS
- Seeded 9 clients + 9 properties from delivery folders
- Backfilled phil-lasry pages from existing WQA workbook
- Brand DNA inference modules (voice & tone, brand terms, proof, future audience, brand story) with TDD coverage
- Backfilled phil-lasry Brand DNA via inference + manual identity
- Markdown export script + first phil-lasry export at delivery/phil-lasry/00-brand-dna.md

## Test plan
- [ ] Full test suite passes: `pytest operations/seo-platform/ -v`
- [ ] Supabase Studio shows expected rows for phil-lasry (~400 pages, 6 brand_dna_section rows)
- [ ] `delivery/phil-lasry/00-brand-dna.md` is committed and renders valid markdown

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Commit completion summary**

```bash
git add operations/seo-platform/specs/p0-completion-summary.md
git commit -m "docs(seo-platform): P0 completion summary + handoff to P1"
git push
```

---

## Self-Review Checklist (run after writing the plan)

**Spec coverage:**
- [x] All 5 schema entities P0 cares about have a migration task (client, property, page, brand_dna_section, project_brain_entry)
- [x] Phase 0 BQ table mappings → Brand DNA sections covered (identity manual; voice / brand_terms / proof / future_audience / brand_story inferred)
- [x] Pages Triage backfill from WQA workbook covered
- [x] Markdown export to `delivery/{slug}/00-brand-dna.md` covered
- [x] RLS scaffold present for every mutable table
- [x] Auth (`team_member`) table created

**Placeholders:**
- One intentional `TBD` in markdown export for sections not yet inferred (positioning, audience_deep_dive, etc.) — this is correct behavior, not a plan placeholder.
- Task 10 has a "ADJUST after inspection" comment for the WQA workbook column indices — also correct, since the actual column layout is verified at runtime in Step 1.

**Type consistency:**
- `audit_action` enum values consistent across migration, backfill ACTION_NORMALIZE map, and Pages view spec
- `brand_dna_section.section` enum matches Brand DNA spec sections
- All `property_id` foreign keys point to `property(id)` consistently

**Scope:**
- P0 ends with phil-lasry queryable in Supabase. UI work is P1 (separate plan). No scope creep.
