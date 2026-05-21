"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { requireWriteToken } from "@/lib/auth";
import { getOperator } from "@/lib/operator";

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

const TARGETED_ACTIONS = new Set(["redirect", "consolidate"]);

export async function updateAuditAction(
  pageId: string,
  newAction: string,
  propertySlug: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  if (!VALID_ACTIONS.has(newAction)) {
    return { ok: false, error: `Invalid action: ${newAction}` };
  }
  // Clear any stale target URL when switching to an action that doesn't use
  // one. Avoids "remove" rows carrying a leftover redirect target.
  const patch: Record<string, unknown> = {
    audit_action: newAction,
    audit_decided_by: getOperator(),
    audit_decided_at: new Date().toISOString(),
  };
  if (!TARGETED_ACTIONS.has(newAction)) {
    patch.audit_target_url = null;
  }
  const { error } = await supabase.from("page").update(patch).eq("id", pageId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/properties/${propertySlug}/pages`);
  revalidatePath(`/properties/${propertySlug}`);
  revalidatePath("/activity");
  revalidatePath("/", "layout"); // sidebar signal count
  return { ok: true };
}

// Set or clear the redirect/consolidate target URL. Only valid when the
// page's current action is redirect or consolidate; the chip enforces this
// in the UI. Passing an empty string clears the target.
export async function updateAuditTarget(
  pageId: string,
  newTargetUrl: string,
  propertySlug: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;

  const trimmed = newTargetUrl.trim();
  if (trimmed.length > 0) {
    try {
      // Accept absolute URLs (http/https) or site-relative paths (/x/y).
      if (!trimmed.startsWith("/")) new URL(trimmed);
    } catch {
      return { ok: false, error: "Target must be a URL or /-prefixed path." };
    }
  }

  const { error } = await supabase
    .from("page")
    .update({
      audit_target_url: trimmed === "" ? null : trimmed,
      audit_decided_by: getOperator(),
      audit_decided_at: new Date().toISOString(),
    })
    .eq("id", pageId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/properties/${propertySlug}/pages`);
  revalidatePath(`/properties/${propertySlug}`);
  revalidatePath("/activity");
  revalidatePath("/", "layout"); // sidebar signal count
  return { ok: true };
}
