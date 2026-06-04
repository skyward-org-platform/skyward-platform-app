-- Seed GBP links for the Kitchen Services (Kitchen Guard franchise)
-- properties. Both unconnected -> DataForSEO fallback by CID + coords.
-- Resolved by slug so the seed is id-agnostic; no-op if a property is absent.
insert into public.local_seo_profile
  (property_id, gbp_name, gbp_cid, connected, search_lat, search_lng, primary_geo)
select p.id, v.gbp_name, v.gbp_cid, false, v.lat, v.lng, v.geo
from public.property p
join (
  values
    ('kssd-sd',  'Kitchen Guard of San Diego',          '12150829757867491455', 33.1192, -117.0864, 'San Diego County, CA'),
    ('kssd-dfw', 'Kitchen Guard of Dallas-Fort Worth',  '13074547460630799462', 32.7767,  -96.7970, 'Dallas-Fort Worth Metroplex, TX')
) as v(slug, gbp_name, gbp_cid, lat, lng, geo) on p.slug = v.slug
on conflict (property_id) do update
  set gbp_name = excluded.gbp_name,
      gbp_cid = excluded.gbp_cid,
      search_lat = excluded.search_lat,
      search_lng = excluded.search_lng,
      primary_geo = excluded.primary_geo,
      updated_at = now();
