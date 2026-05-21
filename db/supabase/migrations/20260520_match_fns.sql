-- pgvector match helpers for the platform UI + scripts. Keeps the cosine
-- math server-side so we don't ship 1536-dim vectors over PostgREST.

-- Top-N pages by cosine similarity to a single keyword's stored embedding.
-- Returns one row per (keyword, matching page); use rank_position = 1 to
-- get the best match per keyword.
create or replace function match_keywords_to_pages(p_property_id uuid)
returns table (
  keyword_id      uuid,
  keyword         text,
  intent          text,
  category        text,
  current_rank    integer,
  search_volume   integer,
  best_match_url  text,
  cosine_similarity float,
  rank_position   integer
)
language sql
stable
as $$
  with ranked as (
    select
      k.id as keyword_id,
      k.keyword,
      k.intent,
      k.category,
      k.current_rank,
      k.search_volume,
      p.url as best_match_url,
      1 - (k.embedding <=> p.embedding) as cosine_similarity,
      row_number() over (
        partition by k.id
        order by k.embedding <=> p.embedding asc
      ) as rank_position
    from keyword k
    cross join page_embedding p
    where k.property_id = p_property_id
      and p.property_id = p_property_id
      and k.embedding is not null
  )
  select keyword_id, keyword, intent, category, current_rank, search_volume,
         best_match_url, cosine_similarity, rank_position::integer
  from ranked
  where rank_position <= 3
  order by keyword, rank_position;
$$;

-- Top-N keywords for a single page's stored embedding. Symmetric inverse
-- of the above. Useful for "what should this page rank for?".
create or replace function match_page_to_keywords(p_property_id uuid, p_url text, p_limit integer default 5)
returns table (
  keyword         text,
  intent          text,
  category        text,
  cosine_similarity float
)
language sql
stable
as $$
  select
    k.keyword,
    k.intent,
    k.category,
    1 - (p.embedding <=> k.embedding) as cosine_similarity
  from page_embedding p
  cross join keyword k
  where p.property_id = p_property_id
    and k.property_id = p_property_id
    and p.url = p_url
    and k.embedding is not null
  order by p.embedding <=> k.embedding asc
  limit p_limit;
$$;
