create table page (
  id uuid primary key default extensions.uuid_generate_v4(),
  property_id uuid not null references property(id) on delete cascade,
  url text not null,
  url_hash text generated always as (md5(url)) stored,
  domain text,
  title text,
  h1 text,
  meta_description text,
  content_text text,
  content_hash text,
  word_count int,
  page_type text,
  status_code int,
  canonical_url text,
  noindex boolean default false,
  embedding vector(1536),
  audit_action text check (audit_action is null or audit_action in (
    'optimize','restore','redirect','consolidate','remove','keep','no_action','undecided'
  )),
  audit_target_url text,
  audit_notes text,
  audit_decided_at timestamptz,
  audit_decided_by text,
  last_crawled_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (property_id, url)
);
create index on page (property_id);
create index on page (property_id, page_type);
create index on page (property_id, audit_action);
create index on page (property_id, domain);
create index on page using hnsw (embedding vector_cosine_ops);

alter table page enable row level security;
create policy "team can read pages"
  on page for select
  using (auth.role() = 'authenticated');
create policy "team can write pages"
  on page for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );

-- Helper RPC for the column-type smoke test
create or replace function pg_typeof_column(table_name_in text, column_name_in text)
returns text
language sql
stable
as $$
  select format_type(atttypid, atttypmod)
  from pg_attribute
  where attrelid = ('public.' || table_name_in)::regclass
    and attname = column_name_in
    and not attisdropped;
$$;
