-- Pages action semantics overhaul (P2)
-- Spec: docs/superpowers/specs/2026-05-25-action-semantics-design.md

-- 1. Backfill: remap old action values BEFORE tightening the check.
--    Existing rows use the 10-value enum; we collapse to 7 + add logic_notes
--    captured from the existing `note` column where present.

update wqa_decision
   set action = case action
     when 'Evaluate'         then 'Investigate'
     when 'Leave as 404'     then 'Keep'
     when 'Non-addressable'  then 'Keep'
     when 'Non-indexable'    then 'Keep'
     else action  -- Optimize/Restore/Redirect/Consolidate/Remove/Investigate unchanged
   end
 where action in ('Evaluate','Leave as 404','Non-addressable','Non-indexable');

-- 2. Drop the old check constraint + install the new 7-value one.
alter table wqa_decision drop constraint if exists wqa_decision_action_check;
alter table wqa_decision
  add constraint wqa_decision_action_check
  check (action in (
    'Optimize','Restore','Redirect','Consolidate',
    'Remove','Keep','Investigate'
  ));

-- 3. Add new columns: status workflow + logic_notes + drift fields.
alter table wqa_decision
  add column if not exists status text not null default 'Open'
    check (status in ('Open','In Progress','Done','Drifted'));

alter table wqa_decision
  add column if not exists logic_notes text;

alter table wqa_decision
  add column if not exists last_implementation_check_at timestamptz;

alter table wqa_decision
  add column if not exists drift_reason text;

-- 4. Copy existing `note` into `logic_notes` where logic_notes is null.
update wqa_decision
   set logic_notes = note
 where logic_notes is null and note is not null;

-- 5. Indexes for the new query patterns.
create index if not exists idx_wqa_decision_property_status
  on wqa_decision (property_id, status);
create index if not exists idx_wqa_decision_drifted
  on wqa_decision (property_id) where status = 'Drifted';

-- 6. Extend the history trigger condition + extend the history table shape.
alter table wqa_decision_history
  add column if not exists status text,
  add column if not exists logic_notes text,
  add column if not exists drift_reason text;

create or replace function snapshot_wqa_decision() returns trigger
language plpgsql
as $$
begin
  insert into wqa_decision_history
    (decision_id, property_id, url, action, target_url, note,
     status, logic_notes, drift_reason, decided_by)
  values
    (old.id, old.property_id, old.url, old.action, old.target_url, old.note,
     old.status, old.logic_notes, old.drift_reason, old.decided_by);
  return new;
end;
$$;

drop trigger if exists trg_snapshot_wqa_decision on wqa_decision;
create trigger trg_snapshot_wqa_decision
  before update on wqa_decision
  for each row
  when (
       old.action       is distinct from new.action
    or old.target_url   is distinct from new.target_url
    or old.note         is distinct from new.note
    or old.status       is distinct from new.status
    or old.logic_notes  is distinct from new.logic_notes
    or old.drift_reason is distinct from new.drift_reason
  )
  execute function snapshot_wqa_decision();
