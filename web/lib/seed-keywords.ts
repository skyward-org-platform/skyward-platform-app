// Supabase-backed seed keyword list. Operator owns this data going
// forward; BigQuery SEOPipeline.seed_keywords is read-only and imported
// once via the 'Import from BQ' action.

import { supabase } from "@/lib/supabase";

export type SeedKeywordIntent =
  | "informational"
  | "commercial"
  | "transactional"
  | "navigational";

export type SeedKeywordPriority = "high" | "medium" | "low";

export type SeedKeyword = {
  id: string;
  property_id: string;
  keyword: string;
  category: string | null;
  /** Free-text in BQ; common values are 'persona', 'client', 'competitor',
   *  'research', 'manual', or compound like 'client+competitor'. We accept
   *  whatever lands here and surface the value as-is in the UI. */
  seed_category: string | null;
  intent: SeedKeywordIntent | null;
  priority: SeedKeywordPriority;
  source: "operator" | "bq_import";
  bq_project_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
};

export async function getSeedKeywordsForProperty(
  propertyId: string,
): Promise<SeedKeyword[]> {
  const { data, error } = await supabase
    .from("property_seed_keyword")
    .select("*")
    .eq("property_id", propertyId)
    .order("category", { ascending: true, nullsFirst: false })
    .order("keyword", { ascending: true });
  if (error) {
    console.error("getSeedKeywordsForProperty failed", error);
    return [];
  }
  return (data ?? []) as SeedKeyword[];
}

export async function hasSeedKeywords(propertyId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("property_seed_keyword")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId);
  if (error) {
    console.error("hasSeedKeywords failed", error);
    return false;
  }
  return (count ?? 0) > 0;
}

/** Light normalization: trim + collapse internal whitespace + lowercase.
 *  The unique constraint is case-sensitive in Postgres by default, so we
 *  lowercase here to keep "Charter Bus" and "charter bus" from coexisting. */
export function normalizeSeedKeyword(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}
