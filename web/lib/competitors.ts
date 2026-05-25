// Supabase-backed competitor list. Operator owns this data going forward;
// BQ Meta.client_domains is used only as a one-time seed via the
// 'Import from BQ Meta' action in the competitors page.

import { supabase } from "@/lib/supabase";

export type CompetitorPriority = "high" | "medium" | "low";

export type Competitor = {
  id: string;
  property_id: string;
  domain: string;
  priority: CompetitorPriority;
  notes: string | null;
  source: "operator" | "bq_meta_import";
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
};

/** Fetch all competitors for a property, ordered by priority then domain. */
export async function getCompetitorsForProperty(
  propertyId: string,
): Promise<Competitor[]> {
  const { data, error } = await supabase
    .from("property_competitor")
    .select("*")
    .eq("property_id", propertyId)
    .order("priority", { ascending: true })
    .order("domain", { ascending: true });
  if (error) {
    // Service-role bypasses RLS so an error here is structural.
    console.error("getCompetitorsForProperty failed", error);
    return [];
  }
  return (data ?? []) as Competitor[];
}

/** Lightweight presence check used by the phase-0 gate signal + hero
 *  badge math. Doesn't fetch row payloads. */
export async function hasCompetitors(propertyId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("property_competitor")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId);
  if (error) {
    console.error("hasCompetitors failed", error);
    return false;
  }
  return (count ?? 0) > 0;
}

/** Normalize a user-typed domain: lowercase, strip scheme + www + trailing
 *  slash. Mirrors the P0 intake convention (host only). */
export function normalizeCompetitorDomain(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^www\./, "");
  s = s.replace(/\/.*$/, "");
  return s;
}
