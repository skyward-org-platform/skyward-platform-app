// Read-only helper for page_index_state. Powered by the
// /api/check-index-status route handler (writes) + this getter (reads).
//
// page_index_state holds the most recent Google index-status snapshot for
// each (property_id, url) pair as observed via a DataForSEO `site:` SERP
// query. The Redirect tab uses it to flag URLs that are still indexed
// after a redirect should have dropped them out.

import { supabase } from "./supabase";

export type PageIndexStateRow = {
  property_id: string;
  url: string;
  in_index: boolean | null;
  checked_at: string;
  source: string;
};

export async function getIndexStateByUrl(
  propertyId: string,
): Promise<Map<string, PageIndexStateRow>> {
  const { data } = await supabase
    .from("page_index_state")
    .select("property_id, url, in_index, checked_at, source")
    .eq("property_id", propertyId);
  const m = new Map<string, PageIndexStateRow>();
  for (const r of (data ?? []) as PageIndexStateRow[]) {
    m.set(r.url, r);
  }
  return m;
}
