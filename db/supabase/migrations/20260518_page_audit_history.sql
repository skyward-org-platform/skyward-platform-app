-- Append-only history for page audit decisions. Snapshots the OLD row from
-- `page` before any UPDATE that changes audit_action or audit_target_url, so
-- we can audit and revert chip changes. Mirrors brand_dna_section_history.

create table if not exists page_audit_history (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references page(id) on delete cascade,
  audit_action text,
  audit_target_url text,
  audit_decided_by text,
  snapshotted_at timestamptz not null default now()
);

create index if not exists idx_page_audit_history_page_snap
  on page_audit_history (page_id, snapshotted_at desc);

create or replace function snapshot_page_audit() returns trigger
language plpgsql
as $$
begin
  insert into page_audit_history
    (page_id, audit_action, audit_target_url, audit_decided_by)
  values
    (old.id, old.audit_action, old.audit_target_url, old.audit_decided_by);
  return new;
end;
$$;

drop trigger if exists trg_snapshot_page_audit on page;
create trigger trg_snapshot_page_audit
  before update on page
  for each row
  when (
    old.audit_action is distinct from new.audit_action
    or old.audit_target_url is distinct from new.audit_target_url
  )
  execute function snapshot_page_audit();
