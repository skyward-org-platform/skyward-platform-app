import { supabase } from "./supabase";

export type KeywordStatus = "Candidate" | "Retained" | "Excluded";
export type KeywordSource = "ahrefs" | "gsc" | "dfs" | "scraped" | "seed" | "manual";

export type KeywordRow = {
  id: string;
  property_id: string;
  keyword: string;
  status: KeywordStatus;
  relevance_score: number | null;
  source: KeywordSource | null;
  notes: string | null;
  updated_by: string;
  updated_at: string;
};

export async function getKeywordsByProperty(propertyId: string): Promise<KeywordRow[]> {
  const { data, error } = await supabase
    .from("keyword")
    .select("*")
    .eq("property_id", propertyId);
  if (error) throw new Error(`getKeywordsByProperty: ${error.message}`);
  return (data ?? []) as KeywordRow[];
}

export type KeywordUpsert = {
  property_id: string;
  keyword: string;
  status?: KeywordStatus;
  relevance_score?: number | null;
  source?: KeywordSource | null;
  notes?: string | null;
  updated_by: string;
};

export async function upsertKeyword(input: KeywordUpsert): Promise<KeywordRow> {
  const { data, error } = await supabase
    .from("keyword")
    .upsert({ ...input, updated_at: new Date().toISOString() }, { onConflict: "property_id,keyword" })
    .select()
    .single();
  if (error) throw new Error(`upsertKeyword: ${error.message}`);
  return data as KeywordRow;
}
