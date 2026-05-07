create table brand_dna_section (
  id uuid primary key default extensions.uuid_generate_v4(),
  property_id uuid not null references property(id) on delete cascade,
  section text not null check (section in (
    'identity','offerings','personas','future_audience','brand_terms',
    'proof','competitors','site_structure','goals',
    'brand_story','positioning','voice_tone','audience_deep_dive',
    'offering_deep_dive','trust_proof_themes','competitive_read','skyward_strategy_notes'
  )),
  content jsonb not null default '{}',
  body text,
  confidence numeric(3,2) check (confidence is null or (confidence between 0 and 1)),
  source text,
  updated_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (property_id, section)
);
create index on brand_dna_section (property_id);

create table project_brain_entry (
  id uuid primary key default extensions.uuid_generate_v4(),
  property_id uuid not null references property(id) on delete cascade,
  type text not null check (type in ('issue','working','research','preference','strategy','insight')),
  title text not null,
  body text not null,
  tags text[] default '{}',
  confidence numeric(3,2) check (confidence is null or (confidence between 0 and 1)),
  source text,
  status text not null default 'active' check (status in ('active','archived','superseded')),
  superseded_by uuid references project_brain_entry(id),
  related_entries uuid[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on project_brain_entry (property_id, type);
create index on project_brain_entry (property_id, status);
create index on project_brain_entry using gin (tags);
create index on project_brain_entry using gin (to_tsvector('english', title || ' ' || body));

alter table brand_dna_section enable row level security;
create policy "team can read brand_dna" on brand_dna_section for select using (auth.role() = 'authenticated');
create policy "team can write brand_dna" on brand_dna_section for all using (
  auth.role() = 'authenticated'
  and exists (select 1 from team_member where user_id = auth.uid() and active)
);

alter table project_brain_entry enable row level security;
create policy "team can read brain" on project_brain_entry for select using (auth.role() = 'authenticated');
create policy "team can write brain" on project_brain_entry for all using (
  auth.role() = 'authenticated'
  and exists (select 1 from team_member where user_id = auth.uid() and active)
);

-- View aggregating brand DNA into one document per property
create or replace view brand_dna_current as
  select
    property_id,
    jsonb_object_agg(section, jsonb_build_object('content', content, 'body', body, 'confidence', confidence)) as doc,
    max(updated_at) as updated_at
  from brand_dna_section
  group by property_id;
