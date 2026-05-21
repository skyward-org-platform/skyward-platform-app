// Shared property lookup. Uses React.cache() for per-request dedupe —
// multiple components in one render only hit Supabase once. Cross-request
// caching via unstable_cache was tried and removed (Next 16 deprecation
// patterns surfaced runtime errors on newly-created properties). Re-add
// via "use cache" later when scoped + verified.

import { cache } from "react";
import { supabase } from "./supabase";

export type Property = {
  id: string;
  slug: string;
  name: string;
  primary_domain: string | null;
  url_prefix: string | null;
  pipeline_phase: number | null;
  status: string | null;
  client_id: string | null;
};

async function fetchPropertyRaw(slug: string): Promise<Property | null> {
  const { data } = await supabase
    .from("property")
    .select(
      "id, slug, name, primary_domain, url_prefix, pipeline_phase, status, client_id",
    )
    .eq("slug", slug)
    .single();
  return (data as Property | null) ?? null;
}

/** Cached property metadata by slug — React.cache() dedupes calls within
 *  a single render. The layout + page.tsx + sub-components all calling
 *  getPropertyBySlug(slug) collapse to one Supabase query per nav. */
export const getPropertyBySlug = cache(fetchPropertyRaw);
