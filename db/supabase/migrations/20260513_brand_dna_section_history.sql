-- Append-only history for brand_dna_section. Snapshots the OLD row into
-- brand_dna_section_history before any UPDATE that changes body or content,
-- so we can audit and revert human + agent edits.

create table if not exists brand_dna_section_history (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references brand_dna_section(id) on delete cascade,
  body text,
  content jsonb,
  source text,
  confidence numeric,
  updated_by text,
  snapshotted_at timestamptz not null default now()
);

create index if not exists idx_bdsh_section_snap
  on brand_dna_section_history (section_id, snapshotted_at desc);

create or replace function snapshot_brand_dna_section() returns trigger
language plpgsql
as $$
begin
  insert into brand_dna_section_history
    (section_id, body, content, source, confidence, updated_by)
  values
    (old.id, old.body, old.content, old.source, old.confidence, old.updated_by);
  return new;
end;
$$;

drop trigger if exists trg_snapshot_brand_dna_section on brand_dna_section;
create trigger trg_snapshot_brand_dna_section
  before update on brand_dna_section
  for each row
  when (
    old.body is distinct from new.body
    or old.content is distinct from new.content
  )
  execute function snapshot_brand_dna_section();
