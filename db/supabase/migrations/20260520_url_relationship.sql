-- Append-only log of URL-to-URL relationships established by the
-- operator. Captures the four kinds of "this URL points to that URL"
-- the Pages workflow produces:
--   redirect_to        — Redirect action; source 301s to target
--   canonical_to       — Canonicalize action; source has canonical -> target
--   consolidate_into   — Consolidate action; source merged into target
--   mentioned_in       — soft link (e.g. notes reference)
--
-- No history mirror — rows are append-only and created_at carries the
-- temporal signal. Deleting a row is treated as a hard correction
-- (rare) and is acceptable to lose.

create table if not exists url_relationship (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references property(id) on delete cascade,
  source_url  text not null,
  target_url  text not null,
  kind        text not null check (kind in (
    'redirect_to','canonical_to','consolidate_into','mentioned_in'
  )),
  created_by  text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_url_relationship_property_source
  on url_relationship (property_id, source_url);

create index if not exists idx_url_relationship_property_target
  on url_relationship (property_id, target_url);

create index if not exists idx_url_relationship_property_kind
  on url_relationship (property_id, kind);

alter table url_relationship enable row level security;

drop policy if exists "team can read url_relationship" on url_relationship;
create policy "team can read url_relationship"
  on url_relationship for select
  using (auth.role() = 'authenticated');

drop policy if exists "team can write url_relationship" on url_relationship;
create policy "team can write url_relationship"
  on url_relationship for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );
