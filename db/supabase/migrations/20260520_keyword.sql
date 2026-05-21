-- Per-property keyword inventory with embeddings. Populated from:
--   • DFS ranked_keywords (terms the property already ranks for)
--   • brand_dna_section[seed_keywords] (manual seeds)
--   • AI-generated from Offerings + Identity (commercial intent terms)
--
-- The embedding column drives keyword → page matching: for any keyword,
-- find best-fitting existing pages via cosine; for any page, find which
-- keywords it serves.

create extension if not exists vector;

create table if not exists keyword (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references property(id) on delete cascade,
  keyword       text not null,
  -- "dfs:ranked" | "seed" | "ai-generated" | "manual"
  source        text not null,
  -- DFS-discovered fields (NULL when source != "dfs:ranked").
  search_volume integer,
  current_rank  integer,
  intent        text,  -- informational | commercial | transactional | navigational
  category      text,  -- service / topic grouping
  embedding     vector(1536),
  embed_model   text default 'text-embedding-3-small',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists idx_keyword_property_keyword
  on keyword (property_id, keyword);

create index if not exists idx_keyword_hnsw
  on keyword using hnsw (embedding vector_cosine_ops);
