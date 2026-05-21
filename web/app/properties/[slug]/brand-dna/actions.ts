"use server";

// Upsert-style write action for the bespoke Brand DNA form pages (Identity,
// Voice & Tone). Resolves property → section, creates the section row on
// first save, then merges a single content field. Mirrors the trigger-driven
// history snapshot via the standard brand_dna_section UPDATE path.
//
// The dynamic [section] editor still uses updateBrandDnaContentKey for its
// click-to-edit JSON flow — this action is separate so the form pages don't
// need to await a server-side row creation before they render.

import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { requireWriteToken } from "@/lib/auth";
import { getOperator } from "@/lib/operator";

type Ok = { ok: true; sectionId: string };
type Err = { ok: false; error: string };

export async function upsertBrandDnaField(
  propertySlug: string,
  sectionKey: string,
  fieldKey: string,
  newValue: unknown,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;

  const { data: prop, error: propErr } = await supabase
    .from("property")
    .select("id")
    .eq("slug", propertySlug)
    .single();
  if (propErr || !prop) {
    return { ok: false, error: "Property not found." };
  }

  const operator = getOperator();
  const now = new Date().toISOString();

  const { data: existing, error: readErr } = await supabase
    .from("brand_dna_section")
    .select("id, content")
    .eq("property_id", prop.id)
    .eq("section", sectionKey)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };

  if (!existing) {
    const { data: created, error: insertErr } = await supabase
      .from("brand_dna_section")
      .insert({
        property_id: prop.id,
        section: sectionKey,
        content: { [fieldKey]: newValue },
        source: "ui:brand-dna",
        updated_by: operator,
        updated_at: now,
      })
      .select("id")
      .single();
    if (insertErr || !created) {
      return { ok: false, error: insertErr?.message ?? "Insert failed." };
    }
    revalidatePath(`/properties/${propertySlug}/brand-dna`, "layout");
    return { ok: true, sectionId: created.id };
  }

  const nextContent = {
    ...((existing.content as Record<string, unknown>) ?? {}),
    [fieldKey]: newValue,
  };
  const { error: updErr } = await supabase
    .from("brand_dna_section")
    .update({
      content: nextContent,
      updated_by: operator,
      updated_at: now,
    })
    .eq("id", existing.id);
  if (updErr) return { ok: false, error: updErr.message };
  revalidatePath(`/properties/${propertySlug}/brand-dna`, "layout");
  return { ok: true, sectionId: existing.id };
}
