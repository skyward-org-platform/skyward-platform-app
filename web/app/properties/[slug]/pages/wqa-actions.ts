"use server";

// Human override of the SOP-derived WQA triage. Writes land in
// wqa_decision, keyed by (property_id, url). The Pages UI reads the
// override (if any) and falls back to the SOP-computed action otherwise.

import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { requireWriteToken } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import {
  upsertExecution,
  type ExecutionStatus,
} from "@/lib/page-execution";
import { upsertCheckState } from "@/lib/page-check-state";

export type WqaActionValue =
  | "Optimize"
  | "Restore"
  | "Redirect"
  | "Consolidate"
  | "Remove"
  | "Evaluate"
  | "Leave as 404"
  | "Non-addressable"
  | "Non-indexable"
  | "Investigate";

const VALID_ACTIONS: ReadonlySet<WqaActionValue> = new Set([
  "Optimize",
  "Restore",
  "Redirect",
  "Consolidate",
  "Remove",
  "Evaluate",
  "Leave as 404",
  "Non-addressable",
  "Non-indexable",
  "Investigate",
]);

type Ok = { ok: true };
type Err = { ok: false; error: string };

async function resolveProperty(
  slug: string,
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase
    .from("property")
    .select("id")
    .eq("slug", slug)
    .single();
  if (error || !data) return { error: error?.message ?? "Property not found" };
  return { id: data.id };
}

export async function setWqaDecision(
  propertySlug: string,
  url: string,
  action: string,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;

  if (!VALID_ACTIONS.has(action as WqaActionValue)) {
    return { ok: false, error: `Invalid action: ${action}` };
  }
  if (!url) return { ok: false, error: "URL required" };

  const prop = await resolveProperty(propertySlug);
  if ("error" in prop) return { ok: false, error: prop.error };

  const { error } = await supabase
    .from("wqa_decision")
    .upsert(
      {
        property_id: prop.id,
        url,
        action,
        decided_by: getOperator(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "property_id,url" },
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/properties/${propertySlug}/pages`);
  return { ok: true };
}

/** Remove the override — row reverts to the SOP-computed action. */
export async function clearWqaDecision(
  propertySlug: string,
  url: string,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const prop = await resolveProperty(propertySlug);
  if ("error" in prop) return { ok: false, error: prop.error };
  const { error } = await supabase
    .from("wqa_decision")
    .delete()
    .eq("property_id", prop.id)
    .eq("url", url);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/properties/${propertySlug}/pages`);
  return { ok: true };
}

export type DecisionRow = {
  url: string;
  action: WqaActionValue;
  decided_by: string;
  decided_at: string;
};

/** Server-side reader — used by the Pages route to overlay overrides onto
 *  the WQA rows before triage runs. */
export async function getWqaDecisions(
  propertySlug: string,
): Promise<DecisionRow[]> {
  const prop = await resolveProperty(propertySlug);
  if ("error" in prop) return [];
  const { data } = await supabase
    .from("wqa_decision")
    .select("url, action, decided_by, decided_at")
    .eq("property_id", prop.id);
  return (data ?? []) as DecisionRow[];
}

// ───── page_execution mutations ───────────────────────────────────────────
// Mirror the setWqaDecision shape: requireWriteToken -> resolve property ->
// getOperator -> lib upsert -> updateTag(property). The Pages list reads
// page_execution via getExecutionByUrl on the next render, which is fresh
// once the cache tag busts.

const VALID_STATUSES: ReadonlySet<ExecutionStatus> = new Set<ExecutionStatus>([
  "To Do",
  "In Progress",
  "Blocked",
  "Done",
]);

const VALID_EXECUTION_FIELDS = new Set([
  "owner",
  "due_date",
  "notes",
  "target_url",
  "target_h1",
  "target_title",
  "target_meta",
] as const);

export type ExecutionField = typeof VALID_EXECUTION_FIELDS extends Set<infer T>
  ? T
  : never;

function bustPagesCache(slug: string): void {
  revalidatePath(`/properties/${slug}/pages`);
}

export async function setExecutionStatus(
  propertySlug: string,
  url: string,
  status: ExecutionStatus,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  if (!url) return { ok: false, error: "URL required" };
  if (!VALID_STATUSES.has(status)) {
    return { ok: false, error: `Invalid status: ${status}` };
  }
  const prop = await resolveProperty(propertySlug);
  if ("error" in prop) return { ok: false, error: prop.error };

  try {
    await upsertExecution({
      property_id: prop.id,
      url,
      status,
      updated_by: getOperator(),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  bustPagesCache(propertySlug);
  return { ok: true };
}

export async function setExecutionField(
  propertySlug: string,
  url: string,
  field: ExecutionField,
  value: string | null,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  if (!url) return { ok: false, error: "URL required" };
  if (!VALID_EXECUTION_FIELDS.has(field)) {
    return { ok: false, error: `Invalid field: ${field}` };
  }
  const prop = await resolveProperty(propertySlug);
  if ("error" in prop) return { ok: false, error: prop.error };

  // Normalize empty string -> null so blank inputs don't pollute the DB.
  const normalized = value === "" ? null : value;

  try {
    await upsertExecution({
      property_id: prop.id,
      url,
      [field]: normalized,
      updated_by: getOperator(),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  bustPagesCache(propertySlug);
  return { ok: true };
}

// ───── page_check_state mutations ─────────────────────────────────────────

export async function setCheckStatus(
  propertySlug: string,
  url: string,
  checkId: string,
  status: ExecutionStatus,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  if (!url) return { ok: false, error: "URL required" };
  if (!checkId) return { ok: false, error: "checkId required" };
  if (!VALID_STATUSES.has(status)) {
    return { ok: false, error: `Invalid status: ${status}` };
  }
  const prop = await resolveProperty(propertySlug);
  if ("error" in prop) return { ok: false, error: prop.error };

  try {
    await upsertCheckState({
      property_id: prop.id,
      url,
      check_id: checkId,
      status,
      // Stamp fix_applied_at when the operator marks a check Done; clear
      // when they walk it back. Keeps the cohort metric (% of checks
      // resolved this week) cheap to compute.
      fix_applied_at: status === "Done" ? new Date().toISOString() : null,
      updated_by: getOperator(),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  bustPagesCache(propertySlug);
  return { ok: true };
}

export async function setCheckNotes(
  propertySlug: string,
  url: string,
  checkId: string,
  notes: string | null,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  if (!url) return { ok: false, error: "URL required" };
  if (!checkId) return { ok: false, error: "checkId required" };
  const prop = await resolveProperty(propertySlug);
  if ("error" in prop) return { ok: false, error: prop.error };

  const normalized = notes === "" ? null : notes;

  try {
    await upsertCheckState({
      property_id: prop.id,
      url,
      check_id: checkId,
      notes: normalized,
      updated_by: getOperator(),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  bustPagesCache(propertySlug);
  return { ok: true };
}

/** Per-check owner override. Mirrors setCheckStatus / setCheckNotes: the
 *  Audit Check Detail view edits owner inline so the cohort accountability
 *  picture is per-(url, check_id), not per-URL. Empty string normalizes to
 *  null so blanking the input clears the override. */
export async function setCheckOwner(
  propertySlug: string,
  url: string,
  checkId: string,
  owner: string | null,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  if (!url) return { ok: false, error: "URL required" };
  if (!checkId) return { ok: false, error: "checkId required" };
  const prop = await resolveProperty(propertySlug);
  if ("error" in prop) return { ok: false, error: prop.error };

  const normalized = owner === "" ? null : owner;

  try {
    await upsertCheckState({
      property_id: prop.id,
      url,
      check_id: checkId,
      owner: normalized,
      updated_by: getOperator(),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  bustPagesCache(propertySlug);
  return { ok: true };
}
