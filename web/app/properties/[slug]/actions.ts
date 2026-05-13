"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";

export async function updateBrandDnaBody(
  sectionId: string,
  newBody: string,
  propertySlug: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("brand_dna_section")
    .update({
      body: newBody,
      updated_by: "ui:prototype",
      updated_at: new Date().toISOString(),
    })
    .eq("id", sectionId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/properties/${propertySlug}`);
  return { ok: true };
}
