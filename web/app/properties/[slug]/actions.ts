"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { requireWriteToken } from "@/lib/auth";
import { getOperator } from "@/lib/operator";

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
  // 'layout' so the sub-layout's count badges + every /brand-dna/[section]
  // child page see the new content on next render.
  revalidatePath(`/properties/${propertySlug}/brand-dna`, "layout");
  return { ok: true };
}
