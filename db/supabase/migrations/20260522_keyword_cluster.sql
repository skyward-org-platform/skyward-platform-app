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
