-- Per-URL execution state for the Pages surface. One row per
-- (property_id, url) — captures the human workflow on top of the
-- SOP-derived WQA action. The Pages list reads this row (if present)
-- to show owner, due date, status, and the target meta values the
-- operator is staging for publish.
--
-- This is symmetric to wqa_decision (override of the SOP action) but
-- tracks the *work* not the *decision*. The two tables join on
-- (property_id, url).

create table if not exists page_execution (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references property(id) on delete cascade,
  url           text not null,
  status        text not null default 'To Do'
                check (status in ('To Do','In Progress','Blocked','Done')),
  owner         text,
  due_date      date,
  notes         text,
  target_url    text,
  target_h1     text,
  target_title  text,
  target_meta   text,
  updated_by    text not null,
  updated_at    timestamptz not null default now()
);

create unique index if not exists idx_page_execution_property_url
  on page_execution (property_id, url);

create index if not exists idx_page_execution_property_status
  on page_execution (property_id, status);

alter table page_execution enable row level security;

drop policy if exists "team can read page_execution" on page_execution;
create policy "team can read page_execution"
  on page_execution for select
  using (auth.role() = 'authenticated');

drop policy if exists "team can write page_execution" on page_execution;
create policy "team can write page_execution"
  on page_execution for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );

-- History mirror — append-only snapshot of the OLD row before each
-- meaningful UPDATE. Read-only via RLS; writes happen only inside the
-- snapshot_page_execution trigger.

create table if not exists page_execution_history (
  id             uuid primary key default gen_random_uuid(),
  execution_id   uuid not null references page_execution(id) on delete cascade,
  property_id    uuid not null,
  url            text not null,
  status         text not null,
  owner          text,
  due_date       date,
  notes          text,
  target_url     text,
  target_h1      text,
  target_title   text,
  target_meta    text,
  updated_by     text not null,
  snapshotted_at timestamptz not null default now()
);

create index if not exists idx_page_execution_history_execution
  on page_execution_history (execution_id, snapshotted_at desc);

create or replace function snapshot_page_execution() returns trigger
language plpgsql
as $$
begin
  insert into page_execution_history
    (execution_id, property_id, url, status, owner, due_date, notes,
     target_url, target_h1, target_title, target_meta, updated_by)
  values
    (old.id, old.property_id, old.url, old.status, old.owner, old.due_date,
     old.notes, old.target_url, old.target_h1, old.target_title,
     old.target_meta, old.updated_by);
  return new;
end;
$$;

drop trigger if exists trg_snapshot_page_execution on page_execution;
create trigger trg_snapshot_page_execution
  before update on page_execution
  for each row
  when (
    old.status       is distinct from new.status
    or old.owner        is distinct from new.owner
    or old.due_date     is distinct from new.due_date
    or old.notes        is distinct from new.notes
    or old.target_url   is distinct from new.target_url
    or old.target_h1    is distinct from new.target_h1
    or old.target_title is distinct from new.target_title
    or old.target_meta  is distinct from new.target_meta
  )
  execute function snapshot_page_execution();

alter table page_execution_history enable row level security;

drop policy if exists "team can read page_execution_history" on page_execution_history;
create policy "team can read page_execution_history"
  on page_execution_history for select
  using (auth.role() = 'authenticated');
