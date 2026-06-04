-- local_seo_profile: links one property to its single Google Business
-- Profile. Connected rows carry a Jepto dataset + locationId (read from
-- BigQuery); unconnected rows carry a CID + search coordinates so the
-- profile can be pulled live from DataForSEO. One profile per property.
create table if not exists public.local_seo_profile (
  property_id uuid primary key references public.property(id) on delete cascade,
  gbp_name text,
  gbp_cid text,
  gbp_place_id text,
  jepto_dataset text,
  jepto_location_id text,
  connected boolean not null default false,
  search_lat double precision,
  search_lng double precision,
  primary_geo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.local_seo_profile enable row level security;

create policy local_seo_profile_service_all on public.local_seo_profile
  for all using (true) with check (true);
