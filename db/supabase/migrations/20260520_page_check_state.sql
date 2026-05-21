-- Per-(URL, check) execution state. One row for each failing T/C/S
-- check on a given URL. The SOP-derived "failing checks" list comes
-- from web/lib/wqa-checks.ts; this table tracks the human disposition
-- of each check (status, notes, owner, when the fix was applied).
--
-- check_id values: T1..T20, C1..C20, S1..S12 (per SOP v4 §7).

create table if not exists page_check_state (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references property(id) on delete cascade,
  url             text not null,
  check_id        text not null,
  status          text not null default 'To Do'
                  check (status in ('To Do','In Progress','Blocked','Done')),
  notes           text,
  owner           text,
  fix_applied_at  timestamptz,
  updated_by      text not null,
  updated_at      timestamptz not null default now()
);

create unique index if not exists idx_page_check_state_property_url_check
  on page_check_state (property_id, url, check_id);

create index if not exists idx_page_check_state_property_check
  on page_check_state (property_id, check_id);

create index if not exists idx_page_check_state_property_status
  on page_check_state (property_id, status);

alter table page_check_state enable row level security;

drop policy if exists "team can read page_check_state" on page_check_state;
create policy "team can read page_check_state"
  on page_check_state for select
  using (auth.role() = 'authenticated');

drop policy if exists "team can write page_check_state" on page_check_state;
create policy "team can write page_check_state"
  on page_check_state for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );

-- History mirror.

create table if not exists page_check_state_history (
  id              uuid primary key default gen_random_uuid(),
  check_state_id  uuid not null references page_check_state(id) on delete cascade,
  property_id     uuid not null,
  url             text not null,
  check_id        text not null,
  status          text not null,
  notes           text,
  owner           text,
  fix_applied_at  timestamptz,
  updated_by      text not null,
  snapshotted_at  timestamptz not null default now()
);

create index if not exists idx_page_check_state_history_state
  on page_check_state_history (check_state_id, snapshotted_at desc);

create or replace function snapshot_page_check_state() returns trigger
language plpgsql
as $$
begin
  insert into page_check_state_history
    (check_state_id, property_id, url, check_id, status, notes, owner,
     fix_applied_at, updated_by)
  values
    (old.id, old.property_id, old.url, old.check_id, old.status, old.notes,
     old.owner, old.fix_applied_at, old.updated_by);
  return new;
end;
$$;

drop trigger if exists trg_snapshot_page_check_state on page_check_state;
create trigger trg_snapshot_page_check_state
  before update on page_check_state
  for each row
  when (
    old.status         is distinct from new.status
    or old.notes          is distinct from new.notes
    or old.owner          is distinct from new.owner
    or old.fix_applied_at is distinct from new.fix_applied_at
  )
  execute function snapshot_page_check_state();

alter table page_check_state_history enable row level security;

drop policy if exists "team can read page_check_state_history" on page_check_state_history;
create policy "team can read page_check_state_history"
  on page_check_state_history for select
  using (auth.role() = 'authenticated');
