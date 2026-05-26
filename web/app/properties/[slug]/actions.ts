"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { supabase } from "@/lib/supabase";
import { requireWriteToken } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import { CACHE_TAGS } from "@/lib/cache";

/** Flip a phase gate from black to green. The "commit + push" gesture
 *  that opens the floodgates: downstream phases will consume the
 *  current live state of this phase from this point on, and continue
 *  to reflect future changes automatically (no re-approval needed). */
export async function approvePhase(
  propertyId: string,
  phaseIndex: number,
  propertySlug: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  if (phaseIndex < 0 || phaseIndex > 6 || !Number.isInteger(phaseIndex)) {
    return { ok: false, error: `Invalid phase index ${phaseIndex}` };
  }
  const atCol = `phase_${phaseIndex}_approved_at`;
  const byCol = `phase_${phaseIndex}_approved_by`;
  const { error } = await supabase
    .from("property")
    .update({
      [atCol]: new Date().toISOString(),
      [byCol]: getOperator(),
    })
    .eq("id", propertyId);
  if (error) return { ok: false, error: error.message };
  // Hero strip reads from the layout, so revalidate the whole property
  // subtree. Any downstream surface gated on this phase will also
  // re-render on its next read.
  revalidatePath(`/properties/${propertySlug}`, "layout");
  return { ok: true };
}

export async function updateBrandDnaBody(
  sectionId: string,
  newBody: string,
  propertySlug: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const { error } = await supabase
    .from("brand_dna_section")
    .update({
      body: newBody,
      updated_by: getOperator(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sectionId);
  if (error) return { ok: false, error: error.message };
  revalidateTag(CACHE_TAGS.brandDna);
  revalidateTag(CACHE_TAGS.signals);
  // 'layout' so the sub-layout's count badges + every /brand-dna/[section]
  // child page see the new content on next render.
  revalidatePath(`/properties/${propertySlug}/brand-dna`, "layout");
  return { ok: true };
}

export async function updateBrandDnaContentKey(
  sectionId: string,
  key: string,
  newValue: unknown,
  propertySlug: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const { data: row, error: readErr } = await supabase
    .from("brand_dna_section")
    .select("content")
    .eq("id", sectionId)
    .single();
  if (readErr) return { ok: false, error: readErr.message };

  const nextContent = { ...((row?.content as Record<string, unknown>) ?? {}) };
  nextContent[key] = newValue;

  const { error } = await supabase
    .from("brand_dna_section")
    .update({
      content: nextContent,
      updated_by: getOperator(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sectionId);
  if (error) return { ok: false, error: error.message };
  revalidateTag(CACHE_TAGS.brandDna);
  revalidateTag(CACHE_TAGS.signals);
  // 'layout' so the sub-layout's count badges + every /brand-dna/[section]
  // child page see the new content on next render.
  revalidatePath(`/properties/${propertySlug}/brand-dna`, "layout");
  return { ok: true };
}
