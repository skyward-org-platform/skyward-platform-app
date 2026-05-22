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
