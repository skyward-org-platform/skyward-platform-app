// Typed reads + writes for page_check_state. One row per
// (property_id, url, check_id) — captures the operator's per-check
// workflow state (To Do / In Progress / Blocked / Done) plus optional
// notes, owner, and when the fix landed.
//
// Mirrors page-execution.ts in shape. Map key uses the ASCII unit
// separator (\x1f) to compose "url\x1fcheck_id" safely — URLs never
// contain that byte.

import { supabase } from "@/lib/supabase";
import type { ExecutionStatus } from "@/lib/page-execution";

export type PageCheckStateRow = {
  id: string;
  property_id: string;
  url: string;
  check_id: string;
  status: ExecutionStatus;
  notes: string | null;
  owner: string | null;
  fix_applied_at: string | null;
  updated_by: string;
  updated_at: string;
};

export type CheckStateUpsert = {
  property_id: string;
  url: string;
  check_id: string;
  status?: ExecutionStatus;
  notes?: string | null;
  owner?: string | null;
  fix_applied_at?: string | null;
  updated_by: string;
};

/** Compose the Map key for (url, check_id). */
export function checkStateKey(url: string, checkId: string): string {
  return `${url}\x1f${checkId}`;
}

/** Read every page_check_state row for a property, keyed by
 *  "url\x1fcheck_id". Used by the per-URL drill-down to mark each
 *  failing T/C check with its execution status. */
export async function getCheckStateByUrlCheck(
  propertyId: string,
): Promise<Map<string, PageCheckStateRow>> {
  const { data, error } = await supabase
    .from("page_check_state")
    .select(
      "id, property_id, url, check_id, status, notes, owner, fix_applied_at, updated_by, updated_at",
    )
    .eq("property_id", propertyId);
  if (error || !data) return new Map();
  const out = new Map<string, PageCheckStateRow>();
  for (const row of data as PageCheckStateRow[]) {
    out.set(checkStateKey(row.url, row.check_id), row);
  }
  return out;
}

/** Upsert a single page_check_state row. Conflict target is the unique
 *  (property_id, url, check_id) index. */
export async function upsertCheckState(
  input: CheckStateUpsert,
): Promise<PageCheckStateRow> {
  const payload = {
    ...input,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("page_check_state")
    .upsert(payload, { onConflict: "property_id,url,check_id" })
    .select(
      "id, property_id, url, check_id, status, notes, owner, fix_applied_at, updated_by, updated_at",
    )
    .single();
  if (error || !data) {
    throw new Error(`upsertCheckState failed: ${error?.message ?? "no data"}`);
  }
  return data as PageCheckStateRow;
}
