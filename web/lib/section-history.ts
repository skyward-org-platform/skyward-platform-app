// Server-side helper for the SectionHistoryPanel. Reads the most recent
// brand_dna_section_history snapshots for a section. The trigger
// (db/supabase/migrations/20260513_brand_dna_section_history.sql) writes
// the OLD row before every UPDATE that changes `body` or `content`, so
// each snapshot describes "what the section was BEFORE the next edit at
// snapshotted_at."

import { supabase } from "./supabase";

export type SectionHistorySnapshot = {
  id: string;
  body: string | null;
  content: Record<string, unknown> | null;
  source: string | null;
  confidence: number | null;
  updated_by: string | null;
  snapshotted_at: string;
};

export async function getSectionHistory(
  propertySlug: string,
  sectionKey: string,
  limit = 10,
): Promise<SectionHistorySnapshot[]> {
  const { data: prop } = await supabase
    .from("property")
    .select("id")
    .eq("slug", propertySlug)
    .single();
  if (!prop) return [];

  const { data: section } = await supabase
    .from("brand_dna_section")
    .select("id")
    .eq("property_id", prop.id)
    .eq("section", sectionKey)
    .maybeSingle();
  if (!section) return [];

  const { data } = await supabase
    .from("brand_dna_section_history")
    .select("id, body, content, source, confidence, updated_by, snapshotted_at")
    .eq("section_id", section.id)
    .order("snapshotted_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as SectionHistorySnapshot[];
}
