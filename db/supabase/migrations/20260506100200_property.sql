create table property (
  id uuid primary key default extensions.uuid_generate_v4(),
  client_id uuid not null references client(id) on delete cascade,
  slug text unique not null,
  name text not null,
  primary_domain text not null,
  additional_domains text[] default '{}',
  brand_voice_inheritance text default 'none' check (brand_voice_inheritance in ('parent','override','none')),
  status text not null default 'active' check (status in ('active','paused','offboarded','prospect')),
  pipeline_phase int default 0 check (pipeline_phase between 0 and 6),
  -- BQ + Ahrefs + GSC pointers deferred until cross-system structure is reconciled with Adam.
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on property (client_id);
create index on property (slug);
create index on property (status);
create index on property (primary_domain);

alter table property enable row level security;
create policy "team can read properties"
  on property for select
  using (auth.role() = 'authenticated');
create policy "team can write properties"
  on property for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );
