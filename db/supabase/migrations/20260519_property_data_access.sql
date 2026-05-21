-- property.data_access — per-property infrastructure config for the SEO
-- pipeline's data sources (GSC, Google Ads, GA4, GMB, Screaming Frog crawl,
-- Client Keyword Data). Schema mirrors the team's keyword research intake
-- template (operations/process-library/.../keyword_research_intake_template.xlsx,
-- Data Access sheet) — one object per source keyed by short slug:
--
--   {
--     "gsc":      { "status": "granted", "property_id": "sc-domain:...",
--                   "bq_dataset": "...", "bq_table": "...", "notes": "..." },
--     "ads":      { "status": "granted", "property_id": "123-456-7890",
--                   "notes": "..." },
--     "ga4":      { "status": "granted", "property_id": "...", "notes": "..." },
--     "gmb":      { "status": "granted", "property_id": "...",
--                   "bq_dataset": "...", "notes": "..." },
--     "crawl":    { "status": "completed", "notes": "..." },
--     "keywords": { "status": "not_available", "notes": "..." }
--   }

alter table property
  add column if not exists data_access jsonb not null default '{}'::jsonb;
