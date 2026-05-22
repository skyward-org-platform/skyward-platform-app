-- Mirrors brand_dna_chat_thread / brand_dna_chat_message schema.

create table if not exists cluster_chat_thread (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references property(id) on delete cascade,
  cluster_id  uuid not null references keyword_cluster(id) on delete cascade,
  created_by  text not null,
  created_at  timestamptz not null default now()
);

create unique index if not exists idx_cluster_chat_thread_cluster on cluster_chat_thread (cluster_id);

alter table cluster_chat_thread enable row level security;
create policy "team can read cluster_chat_thread" on cluster_chat_thread for select
  using (auth.role() = 'authenticated');
create policy "team can write cluster_chat_thread" on cluster_chat_thread for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );

create table if not exists cluster_chat_message (
  id            uuid primary key default gen_random_uuid(),
  thread_id     uuid not null references cluster_chat_thread(id) on delete cascade,
  role          text not null check (role in ('user','assistant','tool')),
  content       text not null,
  tool_calls    jsonb,
  tool_results  jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_cluster_chat_message_thread on cluster_chat_message (thread_id, created_at);

alter table cluster_chat_message enable row level security;
create policy "team can read cluster_chat_message" on cluster_chat_message for select
  using (auth.role() = 'authenticated');
create policy "team can write cluster_chat_message" on cluster_chat_message for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );
