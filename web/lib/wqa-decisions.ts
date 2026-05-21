// Read-only helper for fetching human overrides of the SOP triage. Pulled
// out of pages/wqa-actions.ts (which is "use server") so we can wrap with
// React.cache — server actions can't be cached the same way.
//
// Cross-request caching via unstable_cache was tried and removed (Next 16
// factory-pattern issues). React.cache() still dedupes within a request.

import { cache } from "react";
import { supabase } from "./supabase";

export type DecisionRow = {
  url: string;
  action: string;
  decided_by: string;
  decided_at: string;
};

async function fetchWqaDecisionsRaw(
  propertySlug: string,
): Promise<DecisionRow[]> {
  const { data: prop } = await supabase
    .from("property")
    .select("id")
    .eq("slug", propertySlug)
    .single();
  if (!prop) return [];
  const { data } = await supabase
    .from("wqa_decision")
    .select("url, action, decided_by, decided_at")
    .eq("property_id", prop.id);
  return (data ?? []) as DecisionRow[];
}

export const getWqaDecisions = cache(fetchWqaDecisionsRaw);
