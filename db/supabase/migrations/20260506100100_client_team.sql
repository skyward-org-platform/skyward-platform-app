-- Skyward team members (gates write access via RLS)
create table team_member (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  active boolean not null default true,
  created_at timestamptz default now()
);
create index on team_member (active);

-- Contractual entity: SOW signer
create table client (
  id uuid primary key default extensions.uuid_generate_v4(),
  slug text unique not null,
  name text not null,
  legal_name text,
  primary_contact text,
  status text not null default 'active' check (status in ('active','paused','offboarded','prospect')),
  clickup_space_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on client (status);

-- RLS: team can read all clients; only active team members can write
alter table client enable row level security;
create policy "team can read clients"
  on client for select
  using (auth.role() = 'authenticated');
create policy "team can write clients"
  on client for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );

alter table team_member enable row level security;
create policy "team can read team"
  on team_member for select
  using (auth.role() = 'authenticated');
-- Inserts to team_member happen via service_role only (admin operation)
