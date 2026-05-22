-- Per-property keyword universe. status tracks the curator's decision:
-- Candidate (auto-ingested, not yet reviewed), Retained (in scope), Excluded (out).
--
-- NOTE: An earlier migration (20260520_keyword.sql) created a different
-- shape of the `keyword` table for the embedding-based matching pipeline
-- (source NOT NULL with legacy values 'dfs:ranked' / 'ai-generated', plus
-- search_volume / current_rank / intent / category / embedding / etc.).
-- That table is live with ~33 rows. This migration ADDS the Phase 3
-- curation columns (status, relevance_score, notes, updated_by) idempotently
-- and broadens the `source` check to allow both legacy + new values so
-- existing rows survive. The unique (property_id, keyword) index and the
-- history mirror / trigger are added regardless of which path created the
-- base table.

create table if not exists keyword (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references property(id) on delete cascade,
  keyword         text not null,
  status          text not null default 'Candidate'
                   check (status in ('Candidate','Retained','Excluded')),
  relevance_score int check (relevance_score is null or (relevance_score between 0 and 100)),
  source          text check (source is null or source in (
    'ahrefs','gsc','dfs','scraped','seed','manual',
    'dfs:ranked','ai-generated'
  )),
  notes           text,
  updated_by      text not null,
  updated_at      timestamptz not null default now()
);

-- Idempotent column adds for the case where the table already existed
-- (e.g. the legacy 20260520_keyword.sql shape). updated_by needs a default
-- for the ALTER to succeed against existing rows.
alter table keyword add column if not exists status text not null default 'Candidate';
alter table keyword add column if not exists relevance_score int;
alter table keyword add column if not exists notes text;
alter table keyword add column if not exists updated_by text not null default 'system:legacy';
alter table keyword add column if not exists updated_at timestamptz not null default now();

-- Refresh constraints. Drop any prior versions, then re-add the canonical
-- set. CHECK constraints are namespaced per-column so this is safe.
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'keyword_status_check') then
    alter table keyword drop constraint keyword_status_check;
  end if;
end $$;
alter table keyword add constraint keyword_status_check
  check (status in ('Candidate','Retained','Excluded'));

do $$ begin
  if exists (select 1 from pg_constraint where conname = 'keyword_relevance_score_check') then
    alter table keyword drop constraint keyword_relevance_score_check;
  end if;
end $$;
alter table keyword add constraint keyword_relevance_score_check
  check (relevance_score is null or (relevance_score between 0 and 100));

do $$ begin
  if exists (select 1 from pg_constraint where conname = 'keyword_source_check') then
    alter table keyword drop constraint keyword_source_check;
  end if;
end $$;
alter table keyword add constraint keyword_source_check
  check (source is null or source in (
    'ahrefs','gsc','dfs','scraped','seed','manual',
    'dfs:ranked','ai-generated'
  ));

create unique index if not exists idx_keyword_property_keyword on keyword (property_id, keyword);
create index if not exists idx_keyword_property_status on keyword (property_id, status);

alter table keyword enable row level security;
drop policy if exists "team can read keyword" on keyword;
create policy "team can read keyword" on keyword for select
  using (auth.role() = 'authenticated');
drop policy if exists "team can write keyword" on keyword;
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
drop policy if exists "team can read keyword_history" on keyword_history;
create policy "team can read keyword_history" on keyword_history for select
  using (auth.role() = 'authenticated');
