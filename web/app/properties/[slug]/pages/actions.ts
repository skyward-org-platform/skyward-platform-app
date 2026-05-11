"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";

const VALID_ACTIONS = new Set([
  "optimize",
  "restore",
  "redirect",
  "consolidate",
  "remove",
  "keep",
  "no_action",
  "undecided",
]);

export async function updateAuditAction(
  pageId: string,
  newAction: string,
  propertySlug: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!VALID_ACTIONS.has(newAction)) {
    return { ok: false, error: `Invalid action: ${newAction}` };
  }
  const { error } = await supabase
    .from("page")
    .update({
      audit_action: newAction,
      audit_decided_by: "ui:prototype",
      audit_decided_at: new Date().toISOString(),
    })
    .eq("id", pageId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/properties/${propertySlug}/pages`);
  return { ok: true };
}
