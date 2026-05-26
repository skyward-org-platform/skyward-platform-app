// Per-property strategic context loaded into every PropertyAssistant
// conversation. One row per property in property_mission.

import { supabase } from "@/lib/supabase";

export type PropertyMission = {
  property_id: string;
  body: string;
  updated_by: string | null;
  updated_at: string;
};

export async function getMission(propertyId: string): Promise<PropertyMission | null> {
  const { data, error } = await supabase
    .from("property_mission")
    .select("*")
    .eq("property_id", propertyId)
    .maybeSingle();
  if (error) {
    console.error("getMission failed", error);
    return null;
  }
  return (data as PropertyMission) ?? null;
}

export async function upsertMission(
  propertyId: string,
  body: string,
  updatedBy: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("property_mission")
    .upsert(
      {
        property_id: propertyId,
        body,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "property_id" },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
