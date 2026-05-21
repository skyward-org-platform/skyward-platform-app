-- Per-URL human override of the SOP-derived WQA triage action. WQA
-- aggregate from BQ is the canonical row source; this table stores ONLY
-- the rows a human has explicitly re-triaged. Joining wqa_output to this
-- table left-outer gives every row its effective action (override > SOP).
--
-- Replaces the older `page.audit_action` column for this surface. We
-- leave that column in place for now since it still has history rows
-- referencing it; new edits land here instead.

create table if not exists wqa_decision (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references property(id) on delete cascade,
  url             text not null,
  action          text not null check (action in (
    'Optimize','Restore','Redirect','Consolidate','Remove','Evaluate',
    'Leave as 404','Non-addressable','Non-indexable','Investigate'
  )),
  target_url      text,
  note            text,
  decided_by      text not null,
  decided_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists idx_wqa_decision_property_url
  on wqa_decision (property_id, url);

-- History trigger: snapshot OLD row to wqa_decision_history before each
-- UPDATE. Symmetric to the brand_dna_section_history pattern.

create table if not exists wqa_decision_history (
  id              uuid primary key default gen_random_uuid(),
  decision_id     uuid not null references wqa_decision(id) on delete cascade,
  property_id     uuid not null,
  url             text not null,
  action          text not null,
  target_url      text,
  note            text,
  decided_by      text not null,
  snapshotted_at  timestamptz not null default now()
);

create index if not exists idx_wqa_decision_history_decision
  on wqa_decision_history (decision_id, snapshotted_at desc);

create or replace function snapshot_wqa_decision() returns trigger
language plpgsql
as $$
begin
  insert into wqa_decision_history
    (decision_id, property_id, url, action, target_url, note, decided_by)
  values
    (old.id, old.property_id, old.url, old.action, old.target_url,
     old.note, old.decided_by);
  return new;
end;
$$;

drop trigger if exists trg_snapshot_wqa_decision on wqa_decision;
create trigger trg_snapshot_wqa_decision
  before update on wqa_decision
  for each row
  when (
    old.action       is distinct from new.action
    or old.target_url is distinct from new.target_url
    or old.note      is distinct from new.note
  )
  execute function snapshot_wqa_decision();
