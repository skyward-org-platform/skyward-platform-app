create table if not exists content_row (
  id                          uuid primary key default gen_random_uuid(),
  property_id                 uuid not null references property(id) on delete cascade,
  url                         text not null,
  source                      text not null
                               check (source in ('phase1_optimize','phase1_restore','phase3_gap_cluster')),
  cluster_id                  uuid references keyword_cluster(id) on delete set null,

  -- Identity & Strategy
  vertical                    text,
  action_type                 text not null
                               check (action_type in ('Optimize','Refresh','Rewrite','New','Remove')),
  action_type_override        text
                               check (action_type_override is null or action_type_override in ('Optimize','Refresh','Rewrite','New','Remove')),
  page_type                   text,
  parent_page                 text,
  priority_tier               text,
  target_keyword              text,

  -- Calendar
  sprint                      int,
  brief_due                   date,
  draft_due                   date,
  target_publish              date,
  owners                      text default 'Skyward (writer) + Client (review)',
  calendar_status             text default 'Scheduled'
                               check (calendar_status in ('Scheduled','Slipped','Done')),

  -- Brief Spec
  title_formatted             text,
  title_override              text,
  h1_target                   text,
  h1_override                 text,
  meta_description_spec       text,
  meta_description_override   text,
  word_count_target           text,
  phase2_yellow_resolution    text,
  brief_status                text default 'Not Started'
                               check (brief_status in ('Not Started','In Progress','Approved')),

  -- Content Inputs (blocked placeholders)
  entities_blocked            text default 'BLOCKED — run InfraNodus per cluster at brief time',
  faqs_blocked                text default 'BLOCKED — extract from cluster top SERP PAA at brief time',
  fanout_blocked              text default 'BLOCKED — LLM fan-out per cluster at brief time',

  -- Draft & Production
  status                      text not null default 'Not Started'
                               check (status in ('Not Started','Brief','Draft','Review','Published')),
  writer                      text,
  word_count_actual           int,
  draft_link                  text,
  published_url               text,
  feedback_notes              text,

  -- Dependencies + Linking + Schema + Post-Publish
  dependencies                text,
  internal_links_out          text,
  internal_links_in           text,
  "current_schema"            text default '—',
  required_schema             text,
  jsonld_notes                text,
  post_publish_tasks          text,

  -- Performance Tracker
  rank_30d                    int,
  rank_60d                    int,
  rank_90d                    int,

  -- Meta
  computed_at                 timestamptz not null default now(),
  updated_by                  text not null,
  updated_at                  timestamptz not null default now()
);

create unique index if not exists idx_content_row_property_url on content_row (property_id, url);
create index if not exists idx_content_row_property_status on content_row (property_id, status);
create index if not exists idx_content_row_property_sprint on content_row (property_id, sprint);
create index if not exists idx_content_row_property_priority on content_row (property_id, priority_tier);

alter table content_row enable row level security;
create policy "team can read content_row" on content_row for select
  using (auth.role() = 'authenticated');
create policy "team can write content_row" on content_row for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );

create table if not exists content_row_history (
  id              uuid primary key default gen_random_uuid(),
  content_row_id  uuid not null references content_row(id) on delete cascade,
  property_id     uuid not null,
  url             text not null,
  status          text,
  writer          text,
  sprint          int,
  brief_status    text,
  calendar_status text,
  action_type_override text,
  title_override  text,
  h1_override     text,
  meta_description_override text,
  draft_link      text,
  published_url   text,
  word_count_actual int,
  feedback_notes  text,
  owners          text,
  rank_30d        int,
  rank_60d        int,
  rank_90d        int,
  updated_by      text not null,
  snapshotted_at  timestamptz not null default now()
);

create index if not exists idx_content_row_history on content_row_history (content_row_id, snapshotted_at desc);

create or replace function snapshot_content_row() returns trigger
language plpgsql as $$
begin
  insert into content_row_history
    (content_row_id, property_id, url, status, writer, sprint,
     brief_status, calendar_status, action_type_override,
     title_override, h1_override, meta_description_override,
     draft_link, published_url, word_count_actual, feedback_notes,
     owners, rank_30d, rank_60d, rank_90d, updated_by)
  values
    (old.id, old.property_id, old.url, old.status, old.writer, old.sprint,
     old.brief_status, old.calendar_status, old.action_type_override,
     old.title_override, old.h1_override, old.meta_description_override,
     old.draft_link, old.published_url, old.word_count_actual, old.feedback_notes,
     old.owners, old.rank_30d, old.rank_60d, old.rank_90d, old.updated_by);
  return new;
end; $$;

drop trigger if exists trg_snapshot_content_row on content_row;
create trigger trg_snapshot_content_row
  before update on content_row
  for each row
  when (
       old.status is distinct from new.status
    or old.writer is distinct from new.writer
    or old.sprint is distinct from new.sprint
    or old.brief_status is distinct from new.brief_status
    or old.calendar_status is distinct from new.calendar_status
    or old.action_type_override is distinct from new.action_type_override
    or old.title_override is distinct from new.title_override
    or old.h1_override is distinct from new.h1_override
    or old.meta_description_override is distinct from new.meta_description_override
    or old.draft_link is distinct from new.draft_link
    or old.published_url is distinct from new.published_url
    or old.word_count_actual is distinct from new.word_count_actual
    or old.feedback_notes is distinct from new.feedback_notes
    or old.owners is distinct from new.owners
    or old.rank_30d is distinct from new.rank_30d
    or old.rank_60d is distinct from new.rank_60d
    or old.rank_90d is distinct from new.rank_90d
  )
  execute function snapshot_content_row();

alter table content_row_history enable row level security;
create policy "team can read content_row_history" on content_row_history for select
  using (auth.role() = 'authenticated');
