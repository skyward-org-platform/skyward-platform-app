# Phase 3 Keyword Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/properties/[slug]/keywords` as the canonical Phase 3 surface — Discovery/Optimization modes, 9 sub-tabs, polymorphic drawer for URL/Keyword/Cluster, per-cluster agent chat — sitting on top of re-clustered keyword data from BQ + new Supabase tables.

**Architecture:** Re-cluster once at threshold=4 + backfill Supabase. Build read-only viewer over BQ kga_output + Supabase clusters. Layer in editing via inline chips + drawer. Drawer goes polymorphic to handle three subjects. Agent chat mirrors existing BrandDnaAssistantDrawer.

**Tech Stack:** Next.js 16 (App Router, RSC), Supabase Postgres + RLS, Python (cluster pipeline + Supabase backfill via supabase-py), networkx 3.6, openpyxl, pandas, existing `@/lib/supabase` singleton.

**Spec:** `docs/superpowers/specs/2026-05-22-phase3-surface-design.md`

---

## File Structure

```
db/supabase/migrations/
  20260522_keyword.sql                                          [new] keyword + history + trigger
  20260522_keyword_cluster.sql                                  [new] keyword_cluster + history + trigger
  20260522_keyword_cluster_member.sql                           [new] keyword_cluster_member
  20260522_page_cluster_assignment.sql                          [new] page_cluster_assignment + history + trigger
  20260522_cluster_chat.sql                                     [new] cluster_chat_thread + cluster_chat_message

delivery/tna/
  cluster_buscharter.py                                         [modify] OVERLAP_THRESHOLD = 4
  phase3_backfill_supabase.py                                   [new] one-shot script: CSV → Supabase tables

web/lib/
  keywords.ts                                                   [new] typed Supabase queries for keyword + keyword_cluster_member
  clusters.ts                                                   [new] typed queries for keyword_cluster + members + URL assignment + chat
  cluster-chat.ts                                               [new] thread + message helpers

web/app/properties/[slug]/keywords/
  page.tsx                                                      [modify] real route (was placeholder); fetch data, pass to KeywordsView
  actions.ts                                                    [new] all server actions per spec §"Editable surface map"

web/components/keywords/
  KeywordsView.tsx                                              [new] mode switcher shell (Discovery / Optimization)
  KeywordsModeShell.tsx                                         [new] sub-tab nav inside each mode
  discovery/UniverseTab.tsx                                     [new]
  discovery/SourcesTab.tsx                                      [new]
  discovery/ClusterMapTab.tsx                                   [new]
  discovery/ActionLegendTab.tsx                                 [new]
  optimization/UrlMapTab.tsx                                    [new]
  optimization/OpportunitiesTab.tsx                             [new]
  optimization/ForecastingTab.tsx                               [new]
  optimization/CompetitiveGapTab.tsx                            [new]
  optimization/CoverageTab.tsx                                  [new]
  KeywordStatusChip.tsx                                         [new] Retained/Excluded/Candidate action chip
  ClusterPriorityPill.tsx                                       [new] High/Watch/Low/Unset status pill
  ClusterPageActionChip.tsx                                     [new] Build/Optimize/Remove/Skip
  ClusterPicker.tsx                                             [new] reusable cluster picker for manual overrides
  ClusterChatPanel.tsx                                          [new] agent chat drawer section per cluster

web/components/
  UrlDrawer.tsx                                                 [modify] rename internally to EntityDrawer; add subject discriminated union (URL/Keyword/Cluster)
```

---

## Chunk 1: Recluster + Supabase backfill

### Task 1.1: Re-cluster at threshold = 4

**Files:**
- Modify: `delivery/tna/cluster_buscharter.py:35`

- [ ] **Step 1: Bump the overlap threshold**

Change line 35:
```python
OVERLAP_THRESHOLD = 4  # was 3 — tighter clusters per spec
```

- [ ] **Step 2: Re-run the pipeline**

```bash
cd /Users/paulskirbe/agency && uv run python delivery/tna/cluster_buscharter.py 2>&1 | tail -15
```

Expected: existing cached SERPs reused (no DFS spend); `498 clusters` from prior run becomes ~600-800 clusters; CSVs at `delivery/tna/buscharter/phase-3-keywords/buscharter-clusters-2026-05-21.csv` and `buscharter-url-map-2026-05-21.csv` overwritten.

- [ ] **Step 3: Verify counts**

```bash
wc -l delivery/tna/buscharter/phase-3-keywords/buscharter-clusters-2026-05-21.csv delivery/tna/buscharter/phase-3-keywords/buscharter-url-map-2026-05-21.csv
```

Expected: cluster count ≥ 500 (more than the 498 we got at threshold=3); URL map count = 115 (URLs touch ≥ 1 cluster).

- [ ] **Step 4: Commit**

```bash
cd /Users/paulskirbe/agency && git add delivery/tna/cluster_buscharter.py delivery/tna/buscharter/phase-3-keywords/buscharter-clusters-2026-05-21.csv delivery/tna/buscharter/phase-3-keywords/buscharter-url-map-2026-05-21.csv
git commit -m "feat(phase-3): recluster buscharter at overlap threshold = 4"
```

### Task 1.2: Build the Supabase backfill script

**Files:**
- Create: `delivery/tna/phase3_backfill_supabase.py`

- [ ] **Step 1: Write the script**

```python
"""Backfill Phase 3 Supabase tables from cluster CSVs + KGA BQ data.

Reads:
  - delivery/tna/buscharter/phase-3-keywords/buscharter-clusters-*.csv
  - delivery/tna/buscharter/phase-3-keywords/buscharter-url-map-*.csv
  - BQ kga_output for keyword universe + sources

Writes to Supabase:
  - keyword (one row per unique keyword in property scope)
  - keyword_cluster (one row per cluster)
  - keyword_cluster_member (many-to-many, assignment='algorithm')
  - page_cluster_assignment (one row per URL, assignment='algorithm')
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from google.cloud import bigquery
from supabase import create_client

load_dotenv(Path("/Users/paulskirbe/agency/.env"))

PROPERTY_SLUG = "buscharter"
KGA_JOB_ID = "6259976d-c4d0-4bb6-8269-5574303a58b6"
COMPUTED_AT = datetime.now(timezone.utc).isoformat()
OPERATOR = "system:phase3-backfill"

CLUSTERS_CSV = Path("/Users/paulskirbe/agency/delivery/tna/buscharter/phase-3-keywords/buscharter-clusters-2026-05-21.csv")
URL_MAP_CSV = Path("/Users/paulskirbe/agency/delivery/tna/buscharter/phase-3-keywords/buscharter-url-map-2026-05-21.csv")


def get_property_id(db, slug: str) -> str:
    rows = db.table("property").select("id").eq("slug", slug).execute().data
    if not rows:
        raise SystemExit(f"property slug={slug} not found")
    return rows[0]["id"]


def backfill_keywords(db, bq, property_id: str):
    sql = """
    SELECT DISTINCT keyword,
      CASE
        WHEN MAX(CASE WHEN role = 'client' AND rank IS NOT NULL THEN 1 ELSE 0 END) = 1
        THEN 'Retained' ELSE 'Candidate'
      END AS status,
      'dfs' AS source
    FROM `data-hub-468216.SEOPipelineDev.kga_output`
    WHERE job_id = @job_id
    GROUP BY keyword
    """
    df = bq.query(sql, job_config=bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("job_id", "STRING", KGA_JOB_ID)],
    )).result().to_dataframe()
    print(f"[keywords] loaded {len(df):,} unique keywords from KGA")

    rows = [{
        "property_id": property_id,
        "keyword": row["keyword"],
        "status": row["status"],
        "source": row["source"],
        "updated_by": OPERATOR,
    } for _, row in df.iterrows()]

    BATCH = 500
    for i in range(0, len(rows), BATCH):
        db.table("keyword").upsert(rows[i:i+BATCH], on_conflict="property_id,keyword").execute()
        print(f"[keywords] upserted {i + min(BATCH, len(rows)-i):,}/{len(rows):,}")


def backfill_clusters(db, property_id: str) -> dict[int, str]:
    clusters = pd.read_csv(CLUSTERS_CSV)
    print(f"[clusters] loaded {len(clusters):,} clusters")

    rows = [{
        "property_id": property_id,
        "cluster_number": int(row["cluster_id"]),
        "head_term": row["primary_keyword"],
        "member_count": int(row["member_count"]),
        "total_sv": int(row["total_sv"]),
        "max_sv": int(row["max_sv"]),
        "avg_kd": float(row["avg_kd"]) if pd.notna(row["avg_kd"]) else None,
        "computed_at": COMPUTED_AT,
        "updated_by": OPERATOR,
    } for _, row in clusters.iterrows()]

    BATCH = 500
    cluster_id_map: dict[int, str] = {}
    for i in range(0, len(rows), BATCH):
        result = db.table("keyword_cluster").upsert(
            rows[i:i+BATCH], on_conflict="property_id,cluster_number"
        ).execute()
        for r in result.data:
            cluster_id_map[r["cluster_number"]] = r["id"]
        print(f"[clusters] upserted {i + min(BATCH, len(rows)-i):,}/{len(rows):,}")
    return cluster_id_map


def backfill_cluster_members(db, property_id: str, cluster_id_map: dict[int, str], bq):
    """Membership comes from cluster_buscharter.py output — we re-load the
    graph members from the CSV's 'members' column (truncated) AND from BQ
    by re-running the clustering query (more reliable). For simplicity here
    we read the CSV truncated list and accept that the full membership lives
    in the clustering pipeline output. Better path: extend
    cluster_buscharter.py to emit a (cluster_id, keyword) members CSV."""
    raise SystemExit(
        "Membership backfill requires a (cluster_id, keyword) CSV. "
        "Run cluster_buscharter.py with --emit-members first."
    )


def backfill_url_assignments(db, property_id: str, cluster_id_map: dict[int, str]):
    urls = pd.read_csv(URL_MAP_CSV)
    print(f"[url_map] loaded {len(urls):,} URL assignments")
    rows = [{
        "property_id": property_id,
        "url": row["url"],
        "primary_cluster_id": cluster_id_map[int(row["primary_cluster_id"])],
        "score": float(row["score"]),
        "assignment": "algorithm",
        "computed_at": COMPUTED_AT,
        "updated_by": OPERATOR,
    } for _, row in urls.iterrows() if int(row["primary_cluster_id"]) in cluster_id_map]

    BATCH = 200
    for i in range(0, len(rows), BATCH):
        db.table("page_cluster_assignment").upsert(
            rows[i:i+BATCH], on_conflict="property_id,url"
        ).execute()
        print(f"[url_map] upserted {i + min(BATCH, len(rows)-i):,}/{len(rows):,}")


def main():
    db = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    bq = bigquery.Client(project="data-hub-468216")

    property_id = get_property_id(db, PROPERTY_SLUG)
    print(f"property_id = {property_id}")

    backfill_keywords(db, bq, property_id)
    cluster_id_map = backfill_clusters(db, property_id)
    backfill_cluster_members(db, property_id, cluster_id_map, bq)
    backfill_url_assignments(db, property_id, cluster_id_map)

    print("\nDONE")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Extend cluster_buscharter.py to emit members CSV**

Modify `delivery/tna/cluster_buscharter.py`. After the `components, kw_urls = build_clusters(serp_df)` call, add a members emit:

```python
# Emit (cluster_number, keyword) membership CSV for Supabase backfill.
MEMBERS_CSV = OUT_DIR / "buscharter-cluster-members-2026-05-21.csv"
member_rows = []
for cid, members in enumerate(components, start=1):
    for kw in members:
        member_rows.append({"cluster_id": cid, "keyword": kw})
pd.DataFrame(member_rows).to_csv(MEMBERS_CSV, index=False)
print(f"[members] saved {len(member_rows):,} memberships to {MEMBERS_CSV}")
```

- [ ] **Step 3: Replace the placeholder backfill_cluster_members with the real implementation**

Replace the `raise SystemExit(...)` body of `backfill_cluster_members` in `phase3_backfill_supabase.py`:

```python
def backfill_cluster_members(db, property_id: str, cluster_id_map: dict[int, str], bq):
    members_csv = CLUSTERS_CSV.parent / "buscharter-cluster-members-2026-05-21.csv"
    if not members_csv.exists():
        raise SystemExit(f"Run cluster_buscharter.py first to emit {members_csv}")
    members = pd.read_csv(members_csv)
    print(f"[members] loaded {len(members):,} memberships")

    rows = []
    for _, row in members.iterrows():
        cnum = int(row["cluster_id"])
        if cnum not in cluster_id_map:
            continue
        rows.append({
            "cluster_id": cluster_id_map[cnum],
            "keyword": row["keyword"],
            "assignment": "algorithm",
        })

    # Wipe existing algorithm rows before re-inserting (preserves manual rows).
    db.table("keyword_cluster_member").delete().eq("assignment", "algorithm").in_(
        "cluster_id", list(cluster_id_map.values())
    ).execute()

    BATCH = 1000
    for i in range(0, len(rows), BATCH):
        db.table("keyword_cluster_member").upsert(
            rows[i:i+BATCH], on_conflict="cluster_id,keyword"
        ).execute()
        print(f"[members] upserted {i + min(BATCH, len(rows)-i):,}/{len(rows):,}")
```

- [ ] **Step 4: Commit (not run yet — needs migrations applied first)**

```bash
cd /Users/paulskirbe/agency && git add delivery/tna/cluster_buscharter.py delivery/tna/phase3_backfill_supabase.py && git commit -m "feat(phase-3): Supabase backfill script + cluster_buscharter members CSV emit"
```

### Task 1.3: Run backfill (after migrations land — return to this task at end of Chunk 2)

This task gets executed after Chunk 2 completes. Listed here for sequencing visibility.

- [ ] **Step 1: Re-run cluster_buscharter.py to emit members.csv**

```bash
cd /Users/paulskirbe/agency && uv run python delivery/tna/cluster_buscharter.py 2>&1 | tail -5
```

Expected: confirms the new `members.csv` lands.

- [ ] **Step 2: Run the backfill**

```bash
cd /Users/paulskirbe/agency && uv run --with supabase --with google-cloud-bigquery --with python-dotenv --with pandas python delivery/tna/phase3_backfill_supabase.py 2>&1 | tail -30
```

Expected: row counts in keyword (~9k), keyword_cluster (~600-800), keyword_cluster_member (~2.5k), page_cluster_assignment (~115).

- [ ] **Step 3: Smoke-verify in Supabase**

Run via Supabase MCP or psql:

```sql
SELECT
  (SELECT COUNT(*) FROM keyword WHERE property_id = (SELECT id FROM property WHERE slug = 'buscharter')) AS keywords,
  (SELECT COUNT(*) FROM keyword_cluster WHERE property_id = (SELECT id FROM property WHERE slug = 'buscharter')) AS clusters,
  (SELECT COUNT(*) FROM keyword_cluster_member kcm
   JOIN keyword_cluster kc ON kcm.cluster_id = kc.id
   WHERE kc.property_id = (SELECT id FROM property WHERE slug = 'buscharter')) AS members,
  (SELECT COUNT(*) FROM page_cluster_assignment WHERE property_id = (SELECT id FROM property WHERE slug = 'buscharter')) AS url_assignments;
```

Expected: keywords > 8000, clusters > 500, members > 2000, url_assignments = ~115.

---

## Chunk 2: DB migrations + server actions + libs

### Task 2.1: keyword migration

**Files:**
- Create: `db/supabase/migrations/20260522_keyword.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Per-property keyword universe. status tracks the curator's decision:
-- Candidate (auto-ingested, not yet reviewed), Retained (in scope), Excluded (out).

create table if not exists keyword (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references property(id) on delete cascade,
  keyword         text not null,
  status          text not null default 'Candidate'
                   check (status in ('Candidate','Retained','Excluded')),
  relevance_score int check (relevance_score is null or (relevance_score between 0 and 100)),
  source          text check (source is null or source in (
    'ahrefs','gsc','dfs','scraped','seed','manual'
  )),
  notes           text,
  updated_by      text not null,
  updated_at      timestamptz not null default now()
);

create unique index if not exists idx_keyword_property_keyword on keyword (property_id, keyword);
create index if not exists idx_keyword_property_status on keyword (property_id, status);

alter table keyword enable row level security;
create policy "team can read keyword" on keyword for select
  using (auth.role() = 'authenticated');
create policy "team can write keyword" on keyword for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );

create table if not exists keyword_history (
  id            uuid primary key default gen_random_uuid(),
  keyword_id    uuid not null references keyword(id) on delete cascade,
  property_id   uuid not null,
  keyword       text not null,
  status        text not null,
  relevance_score int,
  source        text,
  notes         text,
  updated_by    text not null,
  snapshotted_at timestamptz not null default now()
);

create index if not exists idx_keyword_history_kw on keyword_history (keyword_id, snapshotted_at desc);

create or replace function snapshot_keyword() returns trigger
language plpgsql as $$
begin
  insert into keyword_history
    (keyword_id, property_id, keyword, status, relevance_score, source, notes, updated_by)
  values
    (old.id, old.property_id, old.keyword, old.status, old.relevance_score, old.source, old.notes, old.updated_by);
  return new;
end; $$;

drop trigger if exists trg_snapshot_keyword on keyword;
create trigger trg_snapshot_keyword
  before update on keyword
  for each row
  when (
    old.status is distinct from new.status
    or old.notes is distinct from new.notes
    or old.relevance_score is distinct from new.relevance_score
  )
  execute function snapshot_keyword();

alter table keyword_history enable row level security;
create policy "team can read keyword_history" on keyword_history for select
  using (auth.role() = 'authenticated');
```

- [ ] **Step 2: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add db/supabase/migrations/20260522_keyword.sql && git commit -m "feat(db): keyword table + history trigger"
```

### Task 2.2: keyword_cluster migration

**Files:**
- Create: `db/supabase/migrations/20260522_keyword_cluster.sql`

- [ ] **Step 1: Write the migration**

```sql
create table if not exists keyword_cluster (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references property(id) on delete cascade,
  cluster_number  int not null,
  head_term       text not null,
  name_override   text,
  priority        text not null default 'Unset'
                   check (priority in ('High','Watch','Low','Unset')),
  state           text not null default 'open'
                   check (state in ('open','closed')),
  page_action     text check (page_action is null or page_action in (
    'build_new','optimize_existing','remove','skip'
  )),
  member_count    int not null default 0,
  total_sv        bigint not null default 0,
  max_sv          bigint not null default 0,
  avg_kd          numeric,
  notes           text,
  computed_at     timestamptz not null default now(),
  updated_by      text not null,
  updated_at      timestamptz not null default now()
);

create unique index if not exists idx_keyword_cluster_property_number on keyword_cluster (property_id, cluster_number);
create index if not exists idx_keyword_cluster_property_priority on keyword_cluster (property_id, priority);
create index if not exists idx_keyword_cluster_property_action on keyword_cluster (property_id, page_action);

alter table keyword_cluster enable row level security;
create policy "team can read keyword_cluster" on keyword_cluster for select
  using (auth.role() = 'authenticated');
create policy "team can write keyword_cluster" on keyword_cluster for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );

create table if not exists keyword_cluster_history (
  id            uuid primary key default gen_random_uuid(),
  cluster_id    uuid not null references keyword_cluster(id) on delete cascade,
  property_id   uuid not null,
  cluster_number int not null,
  head_term     text not null,
  name_override text,
  priority      text not null,
  state         text not null,
  page_action   text,
  notes         text,
  updated_by    text not null,
  snapshotted_at timestamptz not null default now()
);

create index if not exists idx_keyword_cluster_history_cluster on keyword_cluster_history (cluster_id, snapshotted_at desc);

create or replace function snapshot_keyword_cluster() returns trigger
language plpgsql as $$
begin
  insert into keyword_cluster_history
    (cluster_id, property_id, cluster_number, head_term, name_override,
     priority, state, page_action, notes, updated_by)
  values
    (old.id, old.property_id, old.cluster_number, old.head_term, old.name_override,
     old.priority, old.state, old.page_action, old.notes, old.updated_by);
  return new;
end; $$;

drop trigger if exists trg_snapshot_keyword_cluster on keyword_cluster;
create trigger trg_snapshot_keyword_cluster
  before update on keyword_cluster
  for each row
  when (
    old.priority is distinct from new.priority
    or old.name_override is distinct from new.name_override
    or old.state is distinct from new.state
    or old.page_action is distinct from new.page_action
    or old.notes is distinct from new.notes
  )
  execute function snapshot_keyword_cluster();

alter table keyword_cluster_history enable row level security;
create policy "team can read keyword_cluster_history" on keyword_cluster_history for select
  using (auth.role() = 'authenticated');
```

- [ ] **Step 2: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add db/supabase/migrations/20260522_keyword_cluster.sql && git commit -m "feat(db): keyword_cluster table + history trigger"
```

### Task 2.3: keyword_cluster_member migration

**Files:**
- Create: `db/supabase/migrations/20260522_keyword_cluster_member.sql`

- [ ] **Step 1: Write the migration**

```sql
create table if not exists keyword_cluster_member (
  cluster_id  uuid not null references keyword_cluster(id) on delete cascade,
  keyword     text not null,
  assignment  text not null default 'algorithm'
               check (assignment in ('algorithm','manual')),
  moved_by    text,
  moved_at    timestamptz,
  primary key (cluster_id, keyword)
);

create index if not exists idx_keyword_cluster_member_keyword on keyword_cluster_member (keyword);
create index if not exists idx_keyword_cluster_member_assignment on keyword_cluster_member (assignment);

alter table keyword_cluster_member enable row level security;
create policy "team can read keyword_cluster_member" on keyword_cluster_member for select
  using (auth.role() = 'authenticated');
create policy "team can write keyword_cluster_member" on keyword_cluster_member for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );
```

- [ ] **Step 2: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add db/supabase/migrations/20260522_keyword_cluster_member.sql && git commit -m "feat(db): keyword_cluster_member table"
```

### Task 2.4: page_cluster_assignment migration

**Files:**
- Create: `db/supabase/migrations/20260522_page_cluster_assignment.sql`

- [ ] **Step 1: Write the migration**

```sql
create table if not exists page_cluster_assignment (
  id                  uuid primary key default gen_random_uuid(),
  property_id         uuid not null references property(id) on delete cascade,
  url                 text not null,
  primary_cluster_id  uuid not null references keyword_cluster(id) on delete cascade,
  score               numeric not null,
  assignment          text not null default 'algorithm'
                       check (assignment in ('algorithm','manual')),
  computed_at         timestamptz not null default now(),
  updated_by          text not null,
  updated_at          timestamptz not null default now()
);

create unique index if not exists idx_page_cluster_assignment_property_url on page_cluster_assignment (property_id, url);
create index if not exists idx_page_cluster_assignment_cluster on page_cluster_assignment (primary_cluster_id);

alter table page_cluster_assignment enable row level security;
create policy "team can read page_cluster_assignment" on page_cluster_assignment for select
  using (auth.role() = 'authenticated');
create policy "team can write page_cluster_assignment" on page_cluster_assignment for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );

create table if not exists page_cluster_assignment_history (
  id                  uuid primary key default gen_random_uuid(),
  assignment_id       uuid not null references page_cluster_assignment(id) on delete cascade,
  property_id         uuid not null,
  url                 text not null,
  primary_cluster_id  uuid not null,
  score               numeric not null,
  assignment          text not null,
  updated_by          text not null,
  snapshotted_at      timestamptz not null default now()
);

create index if not exists idx_page_cluster_assignment_history on page_cluster_assignment_history (assignment_id, snapshotted_at desc);

create or replace function snapshot_page_cluster_assignment() returns trigger
language plpgsql as $$
begin
  insert into page_cluster_assignment_history
    (assignment_id, property_id, url, primary_cluster_id, score, assignment, updated_by)
  values
    (old.id, old.property_id, old.url, old.primary_cluster_id, old.score, old.assignment, old.updated_by);
  return new;
end; $$;

drop trigger if exists trg_snapshot_page_cluster_assignment on page_cluster_assignment;
create trigger trg_snapshot_page_cluster_assignment
  before update on page_cluster_assignment
  for each row
  when (old.primary_cluster_id is distinct from new.primary_cluster_id)
  execute function snapshot_page_cluster_assignment();

alter table page_cluster_assignment_history enable row level security;
create policy "team can read page_cluster_assignment_history" on page_cluster_assignment_history for select
  using (auth.role() = 'authenticated');
```

- [ ] **Step 2: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add db/supabase/migrations/20260522_page_cluster_assignment.sql && git commit -m "feat(db): page_cluster_assignment + history trigger"
```

### Task 2.5: cluster_chat_thread + cluster_chat_message migrations

**Files:**
- Create: `db/supabase/migrations/20260522_cluster_chat.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Mirrors brand_dna_chat_thread / brand_dna_chat_message schema.

create table if not exists cluster_chat_thread (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references property(id) on delete cascade,
  cluster_id  uuid not null references keyword_cluster(id) on delete cascade,
  created_by  text not null,
  created_at  timestamptz not null default now()
);

create unique index if not exists idx_cluster_chat_thread_cluster on cluster_chat_thread (cluster_id);

alter table cluster_chat_thread enable row level security;
create policy "team can read cluster_chat_thread" on cluster_chat_thread for select
  using (auth.role() = 'authenticated');
create policy "team can write cluster_chat_thread" on cluster_chat_thread for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );

create table if not exists cluster_chat_message (
  id            uuid primary key default gen_random_uuid(),
  thread_id     uuid not null references cluster_chat_thread(id) on delete cascade,
  role          text not null check (role in ('user','assistant','tool')),
  content       text not null,
  tool_calls    jsonb,
  tool_results  jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_cluster_chat_message_thread on cluster_chat_message (thread_id, created_at);

alter table cluster_chat_message enable row level security;
create policy "team can read cluster_chat_message" on cluster_chat_message for select
  using (auth.role() = 'authenticated');
create policy "team can write cluster_chat_message" on cluster_chat_message for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );
```

- [ ] **Step 2: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add db/supabase/migrations/20260522_cluster_chat.sql && git commit -m "feat(db): cluster_chat_thread + cluster_chat_message"
```

### Task 2.6: Apply migrations via direct SQL

The repo's pattern (per chunk 1 of /pages execution surface) applies migrations via `supabase db query --linked --file` because `supabase db push` would apply unrelated pending migrations. Repeat that pattern here.

- [ ] **Step 1: Apply each migration**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app/db && \
for f in supabase/migrations/20260522_keyword.sql \
         supabase/migrations/20260522_keyword_cluster.sql \
         supabase/migrations/20260522_keyword_cluster_member.sql \
         supabase/migrations/20260522_page_cluster_assignment.sql \
         supabase/migrations/20260522_cluster_chat.sql; do
  echo "--- applying $f ---"
  supabase db query --linked --file "$f"
done
```

Expected: each migration prints `Success` or returns no error. `IF NOT EXISTS` clauses make re-runs safe.

- [ ] **Step 2: Smoke-verify the 7 new tables exist**

```bash
supabase db query --linked --sql "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('keyword','keyword_history','keyword_cluster','keyword_cluster_history','keyword_cluster_member','page_cluster_assignment','page_cluster_assignment_history','cluster_chat_thread','cluster_chat_message') ORDER BY table_name;"
```

Expected: 9 rows (5 tables + 3 history tables + 1 messages table).

### Task 2.7: web/lib/keywords.ts (typed queries)

**Files:**
- Create: `web/lib/keywords.ts`

- [ ] **Step 1: Write the lib**

```typescript
import { supabase } from "./supabase";

export type KeywordStatus = "Candidate" | "Retained" | "Excluded";
export type KeywordSource = "ahrefs" | "gsc" | "dfs" | "scraped" | "seed" | "manual";

export type KeywordRow = {
  id: string;
  property_id: string;
  keyword: string;
  status: KeywordStatus;
  relevance_score: number | null;
  source: KeywordSource | null;
  notes: string | null;
  updated_by: string;
  updated_at: string;
};

export async function getKeywordsByProperty(propertyId: string): Promise<KeywordRow[]> {
  const { data, error } = await supabase
    .from("keyword")
    .select("*")
    .eq("property_id", propertyId);
  if (error) throw new Error(`getKeywordsByProperty: ${error.message}`);
  return (data ?? []) as KeywordRow[];
}

export type KeywordUpsert = {
  property_id: string;
  keyword: string;
  status?: KeywordStatus;
  relevance_score?: number | null;
  source?: KeywordSource | null;
  notes?: string | null;
  updated_by: string;
};

export async function upsertKeyword(input: KeywordUpsert): Promise<KeywordRow> {
  const { data, error } = await supabase
    .from("keyword")
    .upsert({ ...input, updated_at: new Date().toISOString() }, { onConflict: "property_id,keyword" })
    .select()
    .single();
  if (error) throw new Error(`upsertKeyword: ${error.message}`);
  return data as KeywordRow;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add web/lib/keywords.ts && git commit -m "feat(lib): keyword typed queries"
```

### Task 2.8: web/lib/clusters.ts (typed queries)

**Files:**
- Create: `web/lib/clusters.ts`

- [ ] **Step 1: Write the lib**

```typescript
import { supabase } from "./supabase";

export type ClusterPriority = "High" | "Watch" | "Low" | "Unset";
export type ClusterState = "open" | "closed";
export type ClusterPageAction = "build_new" | "optimize_existing" | "remove" | "skip";

export type ClusterRow = {
  id: string;
  property_id: string;
  cluster_number: number;
  head_term: string;
  name_override: string | null;
  priority: ClusterPriority;
  state: ClusterState;
  page_action: ClusterPageAction | null;
  member_count: number;
  total_sv: number;
  max_sv: number;
  avg_kd: number | null;
  notes: string | null;
  computed_at: string;
  updated_by: string;
  updated_at: string;
};

export type ClusterMemberRow = {
  cluster_id: string;
  keyword: string;
  assignment: "algorithm" | "manual";
  moved_by: string | null;
  moved_at: string | null;
};

export type UrlClusterAssignmentRow = {
  id: string;
  property_id: string;
  url: string;
  primary_cluster_id: string;
  score: number;
  assignment: "algorithm" | "manual";
  computed_at: string;
  updated_by: string;
  updated_at: string;
};

export async function getClustersByProperty(propertyId: string): Promise<ClusterRow[]> {
  const { data, error } = await supabase
    .from("keyword_cluster")
    .select("*")
    .eq("property_id", propertyId)
    .order("total_sv", { ascending: false });
  if (error) throw new Error(`getClustersByProperty: ${error.message}`);
  return (data ?? []) as ClusterRow[];
}

export async function getClusterMembersByProperty(propertyId: string): Promise<ClusterMemberRow[]> {
  const { data, error } = await supabase
    .from("keyword_cluster_member")
    .select("cluster_id, keyword, assignment, moved_by, moved_at, keyword_cluster!inner(property_id)")
    .eq("keyword_cluster.property_id", propertyId);
  if (error) throw new Error(`getClusterMembersByProperty: ${error.message}`);
  return (data ?? []) as unknown as ClusterMemberRow[];
}

export async function getUrlAssignmentsByProperty(propertyId: string): Promise<UrlClusterAssignmentRow[]> {
  const { data, error } = await supabase
    .from("page_cluster_assignment")
    .select("*")
    .eq("property_id", propertyId);
  if (error) throw new Error(`getUrlAssignmentsByProperty: ${error.message}`);
  return (data ?? []) as UrlClusterAssignmentRow[];
}

export type ClusterUpdate = {
  id: string;
  priority?: ClusterPriority;
  name_override?: string | null;
  state?: ClusterState;
  page_action?: ClusterPageAction | null;
  notes?: string | null;
  updated_by: string;
};

export async function updateCluster(input: ClusterUpdate): Promise<ClusterRow> {
  const { id, updated_by, ...changes } = input;
  const { data, error } = await supabase
    .from("keyword_cluster")
    .update({ ...changes, updated_by, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`updateCluster: ${error.message}`);
  return data as ClusterRow;
}

export async function moveKeywordToCluster(args: {
  keyword: string;
  fromClusterId: string | null;
  toClusterId: string;
  movedBy: string;
}) {
  // Delete from old cluster (if any)
  if (args.fromClusterId) {
    const { error: delErr } = await supabase
      .from("keyword_cluster_member")
      .delete()
      .eq("cluster_id", args.fromClusterId)
      .eq("keyword", args.keyword);
    if (delErr) throw new Error(`moveKeyword (delete): ${delErr.message}`);
  }
  const { error } = await supabase
    .from("keyword_cluster_member")
    .upsert({
      cluster_id: args.toClusterId,
      keyword: args.keyword,
      assignment: "manual",
      moved_by: args.movedBy,
      moved_at: new Date().toISOString(),
    }, { onConflict: "cluster_id,keyword" });
  if (error) throw new Error(`moveKeyword (insert): ${error.message}`);
}

export async function setUrlClusterAssignment(args: {
  propertyId: string;
  url: string;
  primaryClusterId: string;
  updatedBy: string;
}) {
  const { error } = await supabase
    .from("page_cluster_assignment")
    .update({
      primary_cluster_id: args.primaryClusterId,
      assignment: "manual",
      updated_by: args.updatedBy,
      updated_at: new Date().toISOString(),
    })
    .eq("property_id", args.propertyId)
    .eq("url", args.url);
  if (error) throw new Error(`setUrlClusterAssignment: ${error.message}`);
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add web/lib/clusters.ts && git commit -m "feat(lib): cluster typed queries"
```

### Task 2.9: web/app/properties/[slug]/keywords/actions.ts (server actions)

**Files:**
- Create: `web/app/properties/[slug]/keywords/actions.ts`

- [ ] **Step 1: Write all server actions**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireWriteToken } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import { supabase } from "@/lib/supabase";
import {
  upsertKeyword,
  type KeywordStatus,
} from "@/lib/keywords";
import {
  updateCluster,
  moveKeywordToCluster as moveKeyword,
  setUrlClusterAssignment as setUrlCluster,
  type ClusterPriority,
  type ClusterState,
  type ClusterPageAction,
} from "@/lib/clusters";

type Ok = { ok: true };
type Err = { ok: false; error: string };

async function resolveProperty(slug: string): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase
    .from("property")
    .select("id")
    .eq("slug", slug)
    .single();
  if (error || !data) return { error: error?.message ?? "Property not found" };
  return { id: data.id };
}

function bust(slug: string) {
  revalidatePath(`/properties/${slug}/keywords`);
}

// ─── keyword ────────────────────────────────────────────────────────────────
export async function setKeywordStatus(
  slug: string,
  keyword: string,
  status: KeywordStatus,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const prop = await resolveProperty(slug);
  if ("error" in prop) return { ok: false, error: prop.error };
  try {
    await upsertKeyword({
      property_id: prop.id,
      keyword,
      status,
      updated_by: getOperator(),
    });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setKeywordNotes(
  slug: string,
  keyword: string,
  notes: string | null,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const prop = await resolveProperty(slug);
  if ("error" in prop) return { ok: false, error: prop.error };
  try {
    await upsertKeyword({
      property_id: prop.id,
      keyword,
      notes,
      updated_by: getOperator(),
    });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── cluster ────────────────────────────────────────────────────────────────
export async function setClusterPriority(
  slug: string,
  clusterId: string,
  priority: ClusterPriority,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  try {
    await updateCluster({ id: clusterId, priority, updated_by: getOperator() });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setClusterField(
  slug: string,
  clusterId: string,
  field: "name_override" | "state" | "page_action" | "notes",
  value: string | null,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const update: Parameters<typeof updateCluster>[0] = {
    id: clusterId,
    updated_by: getOperator(),
  };
  if (field === "state") {
    if (value !== "open" && value !== "closed") {
      return { ok: false, error: "state must be 'open' or 'closed'" };
    }
    update.state = value as ClusterState;
  } else if (field === "page_action") {
    update.page_action = (value as ClusterPageAction | null) ?? null;
  } else {
    update[field] = value;
  }
  try {
    await updateCluster(update);
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function moveKeywordToCluster(
  slug: string,
  keyword: string,
  fromClusterId: string | null,
  toClusterId: string,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  try {
    await moveKeyword({
      keyword,
      fromClusterId,
      toClusterId,
      movedBy: getOperator(),
    });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setUrlClusterAssignment(
  slug: string,
  url: string,
  clusterId: string,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const prop = await resolveProperty(slug);
  if ("error" in prop) return { ok: false, error: prop.error };
  try {
    await setUrlCluster({
      propertyId: prop.id,
      url,
      primaryClusterId: clusterId,
      updatedBy: getOperator(),
    });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
```

- [ ] **Step 2: Verify the file type-checks**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app/web && npx tsc --noEmit
```

Expected: no errors related to the new file.

- [ ] **Step 3: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add web/app/properties/[slug]/keywords/actions.ts && git commit -m "feat(actions): keyword + cluster + url-assignment server actions"
```

After this task, return to **Task 1.3** to run the backfill against the live tables.

---

## Chunk 3: Read-only /keywords surface

### Task 3.1: page.tsx — fetch + pass to view

**Files:**
- Modify: `web/app/properties/[slug]/keywords/page.tsx`

- [ ] **Step 1: Replace placeholder with real fetch**

Replace the entire file:

```tsx
import { supabase } from "@/lib/supabase";
import { getKeywordsByProperty } from "@/lib/keywords";
import {
  getClustersByProperty,
  getClusterMembersByProperty,
  getUrlAssignmentsByProperty,
} from "@/lib/clusters";
import { KeywordsView } from "@/components/keywords/KeywordsView";

async function getProperty(slug: string) {
  const { data } = await supabase
    .from("property")
    .select("id, primary_domain, name")
    .eq("slug", slug)
    .single();
  return data ?? null;
}

export default async function KeywordsTab({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const prop = await getProperty(slug);
  if (!prop) {
    return <div className="p-8 text-sm text-muted-foreground">Property not found.</div>;
  }

  const [keywords, clusters, members, urlAssignments] = await Promise.all([
    getKeywordsByProperty(prop.id),
    getClustersByProperty(prop.id),
    getClusterMembersByProperty(prop.id),
    getUrlAssignmentsByProperty(prop.id),
  ]);

  return (
    <KeywordsView
      propertySlug={slug}
      propertyId={prop.id}
      propertyName={prop.name}
      primaryDomain={prop.primary_domain}
      keywords={keywords}
      clusters={clusters}
      clusterMembers={members}
      urlAssignments={urlAssignments}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add web/app/properties/[slug]/keywords/page.tsx && git commit -m "feat(pages): /keywords route fetches Supabase data"
```

### Task 3.2: KeywordsView shell with mode switcher

**Files:**
- Create: `web/components/keywords/KeywordsView.tsx`

- [ ] **Step 1: Write the shell**

```tsx
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import type { KeywordRow } from "@/lib/keywords";
import type { ClusterRow, ClusterMemberRow, UrlClusterAssignmentRow } from "@/lib/clusters";
import { KeywordsModeShell } from "./KeywordsModeShell";

type Mode = "discovery" | "optimization";

export type KeywordsViewProps = {
  propertySlug: string;
  propertyId: string;
  propertyName: string;
  primaryDomain: string | null;
  keywords: KeywordRow[];
  clusters: ClusterRow[];
  clusterMembers: ClusterMemberRow[];
  urlAssignments: UrlClusterAssignmentRow[];
};

export function KeywordsView(props: KeywordsViewProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const mode = (sp.get("mode") || "discovery") as Mode;

  function setMode(next: Mode) {
    const params = new URLSearchParams(sp.toString());
    params.set("mode", next);
    params.delete("view");
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Keywords</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Phase 3 keyword universe + SERP-overlap clusters + URL map for{" "}
          <span className="font-mono">{props.primaryDomain}</span>. Curate the
          universe in Discovery; act on it in Optimization.
        </p>
      </header>

      <div className="mb-5 inline-flex rounded-md border bg-muted p-0.5">
        {(["discovery", "optimization"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={
              "px-4 py-1.5 text-xs font-semibold uppercase tracking-wider rounded " +
              (mode === m
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {m}
          </button>
        ))}
      </div>

      <KeywordsModeShell mode={mode} {...props} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add web/components/keywords/KeywordsView.tsx && git commit -m "feat(keywords): mode switcher shell"
```

### Task 3.3: KeywordsModeShell — sub-tab nav per mode

**Files:**
- Create: `web/components/keywords/KeywordsModeShell.tsx`

- [ ] **Step 1: Write the shell**

```tsx
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import type { KeywordsViewProps } from "./KeywordsView";
import { UniverseTab } from "./discovery/UniverseTab";
import { SourcesTab } from "./discovery/SourcesTab";
import { ClusterMapTab } from "./discovery/ClusterMapTab";
import { ActionLegendTab } from "./discovery/ActionLegendTab";
import { UrlMapTab } from "./optimization/UrlMapTab";
import { OpportunitiesTab } from "./optimization/OpportunitiesTab";
import { ForecastingTab } from "./optimization/ForecastingTab";
import { CompetitiveGapTab } from "./optimization/CompetitiveGapTab";
import { CoverageTab } from "./optimization/CoverageTab";

const DISCOVERY_TABS = [
  ["universe", "Universe"],
  ["sources", "Sources"],
  ["clusters", "Cluster Map"],
  ["legend", "Action Legend"],
] as const;

const OPTIMIZATION_TABS = [
  ["url-map", "URL Map"],
  ["opportunities", "Opportunities"],
  ["forecasting", "Forecasting"],
  ["gap", "Competitive Gap"],
  ["coverage", "Coverage"],
] as const;

export function KeywordsModeShell(props: KeywordsViewProps & { mode: "discovery" | "optimization" }) {
  const router = useRouter();
  const sp = useSearchParams();
  const tabs = props.mode === "discovery" ? DISCOVERY_TABS : OPTIMIZATION_TABS;
  const view = sp.get("view") || tabs[0][0];

  function setView(next: string) {
    const params = new URLSearchParams(sp.toString());
    params.set("view", next);
    router.push(`?${params.toString()}`);
  }

  return (
    <>
      <nav className="flex gap-1 border-b mb-4 overflow-x-auto">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setView(k)}
            className={
              "px-3 py-1.5 text-sm border-b-2 -mb-px whitespace-nowrap " +
              (view === k
                ? "border-foreground font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            {label}
          </button>
        ))}
      </nav>

      {props.mode === "discovery" && (
        <>
          {view === "universe" && <UniverseTab {...props} />}
          {view === "sources" && <SourcesTab {...props} />}
          {view === "clusters" && <ClusterMapTab {...props} />}
          {view === "legend" && <ActionLegendTab />}
        </>
      )}
      {props.mode === "optimization" && (
        <>
          {view === "url-map" && <UrlMapTab {...props} />}
          {view === "opportunities" && <OpportunitiesTab {...props} />}
          {view === "forecasting" && <ForecastingTab {...props} />}
          {view === "gap" && <CompetitiveGapTab {...props} />}
          {view === "coverage" && <CoverageTab {...props} />}
        </>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add web/components/keywords/KeywordsModeShell.tsx && git commit -m "feat(keywords): sub-tab nav shell per mode"
```

### Tasks 3.4 - 3.12: Individual tab components

For brevity in this plan, each tab follows the same pattern: client component, accepts `KeywordsViewProps`, renders a table or grid using existing primitives (`TableShell`, `TabHeader`, `UrlCell` from `web/components/wqa/helpers.tsx`).

Pattern per tab:
1. Build a derived data structure from `keywords` / `clusters` / `clusterMembers` / `urlAssignments`
2. Render a table sorted by the primary metric
3. Add filter chips at top where useful (search, status)
4. Each row click — drawer integration deferred to Chunk 4
5. Read-only — no edit controls yet

Reference implementations to copy patterns from:
- Table layout: `web/components/wqa/OptimizeTab.tsx`
- Empty state: `web/components/wqa/helpers.tsx::EmptyTab`
- Header: `web/components/wqa/helpers.tsx::TabHeader`

Each tab is one file in `web/components/keywords/discovery/` or `web/components/keywords/optimization/`. Each is one commit:

- [ ] **Task 3.4** — `discovery/UniverseTab.tsx` — table of all `keywords`. Columns: keyword · status pill (read-only chip; editable in Chunk 4) · source · SV · KD · client rank · best comp rank · cluster name. Filter chips: source, status. Search box. Commit: `feat(keywords): UniverseTab read-only`.

- [ ] **Task 3.5** — `discovery/SourcesTab.tsx` — derive `Map<source, {count, retained, top5}>`. One row per source. Commit: `feat(keywords): SourcesTab read-only`.

- [ ] **Task 3.6** — `discovery/ClusterMapTab.tsx` — table of `clusters` sorted by total_sv desc. Columns: cluster_number · priority pill · head_term (with name_override) · member_count · total_sv · max_sv · avg_kd · page_action chip. Commit: `feat(keywords): ClusterMapTab read-only`.

- [ ] **Task 3.7** — `discovery/ActionLegendTab.tsx` — static reference. Cluster priorities + page actions + keyword statuses. Mirrors the existing /pages `ActionLegendTab` pattern. Commit: `feat(keywords): ActionLegendTab`.

- [ ] **Task 3.8** — `optimization/UrlMapTab.tsx` — table of `urlAssignments` joined with `clusters` for cluster name + total_sv. Columns: URL · cluster · score · sessions (from kga — defer to Chunk 4 since we'd need BQ here; for v1 just URL + cluster + score). Commit: `feat(keywords): UrlMapTab read-only`.

- [ ] **Task 3.9** — `optimization/OpportunitiesTab.tsx` — derive greenfield keywords from `keywords` + `clusterMembers`. Filter: status='Candidate' OR status='Retained' AND no client rank. SV >= 100. Sort by SV desc. Commit: `feat(keywords): OpportunitiesTab read-only`.

- [ ] **Task 3.10** — `optimization/ForecastingTab.tsx` — placeholder for v1; reads kga_output via existing `/api/wqa/pages` BQ pattern in a Chunk 5 follow-up. For now render "Forecasting requires BQ access — wire in Chunk 5" placeholder. Commit: `feat(keywords): ForecastingTab placeholder`.

- [ ] **Task 3.11** — `optimization/CompetitiveGapTab.tsx` — same placeholder treatment as Forecasting; requires BQ-side data. Commit: `feat(keywords): CompetitiveGapTab placeholder`.

- [ ] **Task 3.12** — `optimization/CoverageTab.tsx` — same. Commit: `feat(keywords): CoverageTab placeholder`.

After Chunk 3: navigate to `/properties/buscharter/keywords` on a preview deploy, verify Discovery + Optimization mode switch + each sub-tab renders without runtime errors. `npm run build` must pass.

---

## Chunk 4: Editing + polymorphic drawer

### Task 4.1: Refactor UrlDrawer to handle multiple subjects

**Files:**
- Modify: `web/components/UrlDrawer.tsx`

Strategy: keep the file named UrlDrawer.tsx but introduce a discriminated union for `subject`. Backward-compatible: existing callers pass `{kind: 'url', row, currentAction, ...}`; new callers pass `{kind: 'keyword', ...}` or `{kind: 'cluster', ...}`.

- [ ] **Step 1: Add subject type + dispatch**

At the top of `UrlDrawer.tsx`, after the existing imports, add:

```typescript
import type { KeywordRow } from "@/lib/keywords";
import type { ClusterRow, ClusterMemberRow, UrlClusterAssignmentRow } from "@/lib/clusters";

export type DrawerSubject =
  | { kind: "url"; /* existing fields */ }
  | { kind: "keyword"; keyword: KeywordRow; clusterName: string | null }
  | { kind: "cluster"; cluster: ClusterRow; members: ClusterMemberRow[]; urlsInCluster: string[] };
```

Then modify the existing top-level component signature to accept `subject` as a prop. Add a switch statement at render top:

```tsx
if (subject.kind === "keyword") {
  return <KeywordDrawer subject={subject} {...common} />;
}
if (subject.kind === "cluster") {
  return <ClusterDrawer subject={subject} {...common} />;
}
// existing UrlDrawer body for kind === "url"
```

- [ ] **Step 2: Stub KeywordDrawer + ClusterDrawer**

```tsx
function KeywordDrawer({ subject, ...common }: { subject: Extract<DrawerSubject, {kind: "keyword"}> } & CommonProps) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={common.onClose} />
      <aside className="relative w-[560px] h-full bg-background border-l overflow-y-auto p-5">
        <h3 className="text-lg font-semibold mb-2">{subject.keyword.keyword}</h3>
        {/* Wire status / notes / cluster nav in Tasks 4.4-4.6 */}
      </aside>
    </div>
  );
}

function ClusterDrawer({ subject, ...common }: { subject: Extract<DrawerSubject, {kind: "cluster"}> } & CommonProps) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={common.onClose} />
      <aside className="relative w-[560px] h-full bg-background border-l overflow-y-auto p-5">
        <h3 className="text-lg font-semibold mb-2">
          {subject.cluster.name_override || subject.cluster.head_term}
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          {subject.cluster.member_count} keywords · SV {subject.cluster.total_sv.toLocaleString()}
        </p>
        {/* Wire priority / page_action / members / chat in Tasks 4.5, 5.x */}
      </aside>
    </div>
  );
}
```

- [ ] **Step 3: Build verifies type-safety**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app/web && npm run build 2>&1 | tail -5
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add web/components/UrlDrawer.tsx && git commit -m "feat(ui): UrlDrawer polymorphism — Keyword + Cluster subjects"
```

### Task 4.2-4.6: wire editing per Section 4 of spec

Each task is a small inline-editor component + a row-level open-drawer hook. Follow the same pattern used in `/pages` (chip + onChange → server action; stopPropagation on interactive elements).

- [ ] **Task 4.2** — Create `web/components/keywords/KeywordStatusChip.tsx`. Action chip with three states (Retained=emerald / Excluded=rose / Candidate=neutral). onChange → `setKeywordStatus`. Stop propagation. Wire into UniverseTab. Commit: `feat(keywords): inline KeywordStatusChip editor`.

- [ ] **Task 4.3** — Create `web/components/keywords/ClusterPriorityPill.tsx` + wire into ClusterMapTab. Commit: `feat(keywords): inline ClusterPriorityPill editor`.

- [ ] **Task 4.4** — Create `web/components/keywords/ClusterPageActionChip.tsx` + wire into ClusterMapTab. Commit: `feat(keywords): inline ClusterPageActionChip editor`.

- [ ] **Task 4.5** — Create `web/components/keywords/ClusterPicker.tsx` (combobox over `clusters`). Wire into UrlMapTab row for `setUrlClusterAssignment`. Commit: `feat(keywords): inline ClusterPicker for URL override`.

- [ ] **Task 4.6** — Wire row clicks to open drawer (Keyword + Cluster subjects). Cluster Map row → cluster drawer; Universe row → keyword drawer; URL Map row → existing URL drawer with new Phase 3 section. Commit: `feat(keywords): row-click drawer integration`.

After Chunk 4: full edit flow works in preview. Toggle status / priority / page action / cluster override; persistence verified by refresh.

---

## Chunk 5: Agent chat per cluster

### Task 5.1: cluster-chat.ts lib

**Files:**
- Create: `web/lib/cluster-chat.ts`

- [ ] **Step 1: Write the lib**

```typescript
import { supabase } from "./supabase";

export type ChatRole = "user" | "assistant" | "tool";

export type ChatMessage = {
  id: string;
  thread_id: string;
  role: ChatRole;
  content: string;
  tool_calls: unknown | null;
  tool_results: unknown | null;
  created_at: string;
};

export async function getOrCreateClusterThread(args: {
  propertyId: string;
  clusterId: string;
  createdBy: string;
}): Promise<string> {
  const { data: existing } = await supabase
    .from("cluster_chat_thread")
    .select("id")
    .eq("cluster_id", args.clusterId)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data, error } = await supabase
    .from("cluster_chat_thread")
    .insert({
      property_id: args.propertyId,
      cluster_id: args.clusterId,
      created_by: args.createdBy,
    })
    .select("id")
    .single();
  if (error) throw new Error(`getOrCreateClusterThread: ${error.message}`);
  return data.id as string;
}

export async function getClusterMessages(threadId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("cluster_chat_message")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getClusterMessages: ${error.message}`);
  return (data ?? []) as ChatMessage[];
}

export async function appendMessage(
  threadId: string,
  role: ChatRole,
  content: string,
  tool_calls: unknown = null,
  tool_results: unknown = null,
): Promise<void> {
  const { error } = await supabase
    .from("cluster_chat_message")
    .insert({ thread_id: threadId, role, content, tool_calls, tool_results });
  if (error) throw new Error(`appendMessage: ${error.message}`);
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add web/lib/cluster-chat.ts && git commit -m "feat(lib): cluster_chat thread + message helpers"
```

### Task 5.2: postClusterChatMessage server action

**Files:**
- Modify: `web/app/properties/[slug]/keywords/actions.ts`

- [ ] **Step 1: Add the action**

Append to actions.ts:

```typescript
import { getOrCreateClusterThread, appendMessage } from "@/lib/cluster-chat";

export async function postClusterChatMessage(
  slug: string,
  clusterId: string,
  content: string,
): Promise<Ok | (Err & { error: string })> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const prop = await resolveProperty(slug);
  if ("error" in prop) return { ok: false, error: prop.error };

  const op = getOperator();
  try {
    const threadId = await getOrCreateClusterThread({
      propertyId: prop.id,
      clusterId,
      createdBy: op,
    });
    await appendMessage(threadId, "user", content);

    // For v1 the assistant response is a placeholder. Chunk 5 follow-up wires
    // the actual model call via the existing inference layer (see
    // web/inference/brand-dna for the pattern).
    const reply = `(stub) Received: "${content}". Tools wiring lands in 5.3-5.5.`;
    await appendMessage(threadId, "assistant", reply);

    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add web/app/properties/[slug]/keywords/actions.ts && git commit -m "feat(actions): postClusterChatMessage stub (assistant reply wires in 5.3)"
```

### Task 5.3-5.5: Real agent — adapt BrandDnaAssistant patterns

These tasks adapt the existing brand DNA assistant infra at `web/inference/brand-dna/` for cluster chat. Before sprinting, read `web/inference/brand-dna/` files + `web/components/BrandDnaAssistantDrawer.tsx` to understand the pattern.

- [ ] **Task 5.3** — Create `web/inference/cluster-chat/` mirroring `web/inference/brand-dna/`. Define `runClusterChat(threadId, userMessage, clusterContext)` that calls OpenAI with tool definitions. Tools: `find_more_keywords(seed)`, `expand_cluster(cluster_id)`, `search_serp(keyword)`, `mark_keyword_excluded(keyword, reason)`. Each tool resolves to a Python or BQ pull. Replace the stub reply in actions.ts:5.2 with this runner. Commit: `feat(inference): cluster-chat runner + 4 tools`.

- [ ] **Task 5.4** — Create `web/components/keywords/ClusterChatPanel.tsx`. Adapt `BrandDnaAssistantDrawer` pattern: scrollable message list + bottom textarea + submit button + streaming animation. Wire `postClusterChatMessage` server action. Commit: `feat(keywords): ClusterChatPanel`.

- [ ] **Task 5.5** — Render `ClusterChatPanel` inside the `ClusterDrawer` from Task 4.1 in a collapsible "Agent" section. Lazy-load message history. Commit: `feat(keywords): wire ClusterChatPanel into cluster drawer`.

After Chunk 5: full feature complete. End-to-end: open cluster drawer → see members + URLs + edit fields → click "Agent" section → chat about the cluster → tools fire → results stream back.

---

## Deployment

Same path as /pages execution surface:

```bash
cd web && npm run build      # local verify
vercel deploy --yes          # preview
# manual smoke on preview URL
vercel --prod --yes          # promote when smoke passes
```

---

## Self-Review

**1. Spec coverage** (against `docs/superpowers/specs/2026-05-22-phase3-surface-design.md`):
- ✓ Five new Supabase tables (Tasks 2.1-2.5)
- ✓ Server actions per Section 4 of spec (Task 2.9)
- ✓ Universal drawer polymorphism (Task 4.1)
- ✓ Discovery mode: 4 tabs (Tasks 3.4-3.7)
- ✓ Optimization mode: 5 tabs (Tasks 3.8-3.12)
- ✓ Edit chips for status / priority / page action / URL override (Tasks 4.2-4.5)
- ✓ Mode switcher (Task 3.2)
- ✓ Sub-tab nav (Task 3.3)
- ✓ Cluster agent chat (Tasks 5.1-5.5)
- ✓ Override preservation in recluster pipeline (Task 1.2 — DELETE WHERE assignment='algorithm', preserve manual rows)
- ✓ Cross-link drawer (Task 4.1 covers polymorphism; Task 4.6 wires row clicks)
- ⚠ Forecasting / Competitive Gap / Coverage tabs are placeholders in Chunk 3 because they need BQ reads — covered by the parenthetical in Task 3.10/3.11/3.12. These rendered placeholders match the spec's "no BQ pass-through in this round" implicit scoping. Worth a follow-up to wire them via the existing `/api/wqa/pages` pattern.

**2. Placeholder scan**: Search for "TBD", "fill in", "etc." → none in mandatory steps. Tasks 3.4-3.12 collapse multiple similar tabs into a single bulleted format that points to reference impls — that's intentional (DRY) but means an implementer reads the reference. Acceptable given Chunk 4 forces re-touching most of them.

**3. Type consistency**: KeywordStatus / ClusterPriority / ClusterState / ClusterPageAction defined once in libs (Tasks 2.7-2.8), imported by actions (Task 2.9) and consumed by chips (Tasks 4.2-4.4). DrawerSubject discriminated union in Task 4.1 uses the same KeywordRow / ClusterRow / ClusterMemberRow / UrlClusterAssignmentRow types from the libs.
