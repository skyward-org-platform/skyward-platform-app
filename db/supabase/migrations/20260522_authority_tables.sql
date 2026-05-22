-- site_snapshot: append-only time-series
create table if not exists site_snapshot (
  id                    uuid primary key default gen_random_uuid(),
  property_id           uuid not null references property(id) on delete cascade,
  snapshotted_at        timestamptz not null default now(),
  domain_rating         numeric,
  ahrefs_rank           bigint,
  live_backlinks        int,
  live_refdomains       int,
  organic_keywords      int,
  organic_keywords_top3 int,
  organic_traffic       int,
  organic_value_cents   int,
  source                text not null default 'dataforseo'
                         check (source in ('dataforseo','ahrefs','manual')),
  fetched_by            text not null
);

create index if not exists idx_site_snapshot_property_at
  on site_snapshot (property_id, snapshotted_at desc);

alter table site_snapshot enable row level security;
create policy "team can read site_snapshot" on site_snapshot for select
  using (auth.role() = 'authenticated');
create policy "team can write site_snapshot" on site_snapshot for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );

-- referring_domain: per-domain state with user quality override
create table if not exists referring_domain (
  id                  uuid primary key default gen_random_uuid(),
  property_id         uuid not null references property(id) on delete cascade,
  domain              text not null,
  first_seen          timestamptz,
  last_seen           timestamptz,
  domain_rating       numeric,
  traffic_domain      int,
  dofollow_links      int default 0,
  links_to_target     int default 1,
  detected_spam       boolean default false,
  quality             text not null default 'Pending'
                       check (quality in ('Quality','Spam','Pending','Disavow')),
  notes               text,
  last_refreshed_at   timestamptz,
  updated_by          text not null,
  updated_at          timestamptz not null default now()
);

create unique index if not exists idx_ref_domain_property_domain on referring_domain (property_id, domain);
create index if not exists idx_ref_domain_property_quality on referring_domain (property_id, quality);
create index if not exists idx_ref_domain_property_first_seen on referring_domain (property_id, first_seen desc);

alter table referring_domain enable row level security;
create policy "team can read referring_domain" on referring_domain for select
  using (auth.role() = 'authenticated');
create policy "team can write referring_domain" on referring_domain for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );

create table if not exists referring_domain_history (
  id              uuid primary key default gen_random_uuid(),
  referring_domain_id uuid not null references referring_domain(id) on delete cascade,
  property_id     uuid not null,
  domain          text not null,
  quality         text,
  notes           text,
  updated_by      text not null,
  snapshotted_at  timestamptz not null default now()
);

create index if not exists idx_ref_domain_history on referring_domain_history (referring_domain_id, snapshotted_at desc);

create or replace function snapshot_referring_domain() returns trigger
language plpgsql as $$
begin
  insert into referring_domain_history
    (referring_domain_id, property_id, domain, quality, notes, updated_by)
  values
    (old.id, old.property_id, old.domain, old.quality, old.notes, old.updated_by);
  return new;
end; $$;

drop trigger if exists trg_snapshot_referring_domain on referring_domain;
create trigger trg_snapshot_referring_domain
  before update on referring_domain
  for each row
  when (
       old.quality is distinct from new.quality
    or old.notes is distinct from new.notes
  )
  execute function snapshot_referring_domain();

alter table referring_domain_history enable row level security;
create policy "team can read referring_domain_history" on referring_domain_history for select
  using (auth.role() = 'authenticated');

-- disavow_entry: managed disavow file
create table if not exists disavow_entry (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references property(id) on delete cascade,
  domain          text not null,
  reason          text,
  status          text not null default 'Pending'
                   check (status in ('Pending','In File','Confirmed by GSC')),
  added_at        timestamptz not null default now(),
  added_by        text not null,
  notes           text,
  updated_at      timestamptz not null default now()
);

create unique index if not exists idx_disavow_property_domain on disavow_entry (property_id, domain);
create index if not exists idx_disavow_property_status on disavow_entry (property_id, status);

alter table disavow_entry enable row level security;
create policy "team can read disavow_entry" on disavow_entry for select
  using (auth.role() = 'authenticated');
create policy "team can write disavow_entry" on disavow_entry for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );

create table if not exists disavow_entry_history (
  id              uuid primary key default gen_random_uuid(),
  disavow_entry_id uuid not null references disavow_entry(id) on delete cascade,
  property_id     uuid not null,
  domain          text not null,
  reason          text,
  status          text not null,
  added_by        text not null,
  snapshotted_at  timestamptz not null default now()
);

create index if not exists idx_disavow_history on disavow_entry_history (disavow_entry_id, snapshotted_at desc);

create or replace function snapshot_disavow_entry() returns trigger
language plpgsql as $$
begin
  insert into disavow_entry_history
    (disavow_entry_id, property_id, domain, reason, status, added_by)
  values
    (old.id, old.property_id, old.domain, old.reason, old.status, old.added_by);
  return new;
end; $$;

drop trigger if exists trg_snapshot_disavow_entry on disavow_entry;
create trigger trg_snapshot_disavow_entry
  before update on disavow_entry
  for each row
  when (
       old.status is distinct from new.status
    or old.reason is distinct from new.reason
  )
  execute function snapshot_disavow_entry();

alter table disavow_entry_history enable row level security;
create policy "team can read disavow_entry_history" on disavow_entry_history for select
  using (auth.role() = 'authenticated');

-- audit_doc: pointers to markdown audit docs
create table if not exists audit_doc (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references property(id) on delete cascade,
  title           text not null,
  filepath        text,
  markdown        text,
  generated_at    timestamptz not null,
  generated_by    text,
  notes           text
);

create index if not exists idx_audit_doc_property_at on audit_doc (property_id, generated_at desc);

alter table audit_doc enable row level security;
create policy "team can read audit_doc" on audit_doc for select
  using (auth.role() = 'authenticated');
create policy "team can write audit_doc" on audit_doc for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );
