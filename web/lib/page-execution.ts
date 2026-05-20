// Typed reads + writes for page_execution. One row per (property_id, url)
// captures the operator's execution state on top of the SOP-derived WQA
// action: status, owner, due_date, notes, and the target meta values being
// staged for publish.
//
// All callers use the singleton `supabase` service-role client from
// @/lib/supabase — same pattern as wqa-actions.ts. Writes pass through the
// page-execution server actions (web/app/properties/[slug]/pages/wqa-actions.ts)
// which gate on requireWriteToken() before calling upsertExecution.

import { supabase } from "@/lib/supabase";

export type ExecutionStatus = "To Do" | "In Progress" | "Blocked" | "Done";

export const EXECUTION_STATUSES: readonly ExecutionStatus[] = [
  "To Do",
  "In Progress",
  "Blocked",
  "Done",
] as const;

export type PageExecutionRow = {
  id: string;
  property_id: string;
  url: string;
  status: ExecutionStatus;
  owner: string | null;
  due_date: string | null;
  notes: string | null;
  target_url: string | null;
  target_h1: string | null;
  target_title: string | null;
  target_meta: string | null;
  updated_by: string;
  updated_at: string;
};

export type ExecutionUpsert = {
  property_id: string;
  url: string;
  status?: ExecutionStatus;
  owner?: string | null;
  due_date?: string | null;
  notes?: string | null;
  target_url?: string | null;
  target_h1?: string | null;
  target_title?: string | null;
  target_meta?: string | null;
  updated_by: string;
};

/** Read every page_execution row for a property, keyed by URL. The Pages
 *  list overlays these onto the WQA aggregate rows. */
export async function getExecutionByUrl(
  propertyId: string,
): Promise<Map<string, PageExecutionRow>> {
  const { data, error } = await supabase
    .from("page_execution")
    .select(
      "id, property_id, url, status, owner, due_date, notes, target_url, target_h1, target_title, target_meta, updated_by, updated_at",
    )
    .eq("property_id", propertyId);
  if (error || !data) return new Map();
  const out = new Map<string, PageExecutionRow>();
  for (const row of data as PageExecutionRow[]) {
    out.set(row.url, row);
  }
  return out;
}

/** Upsert a single page_execution row. Conflict target is the unique
 *  (property_id, url) index — existing row is updated in place, which
 *  fires trg_snapshot_page_execution to preserve the OLD values. */
export async function upsertExecution(
  input: ExecutionUpsert,
): Promise<PageExecutionRow> {
  const payload = {
    ...input,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("page_execution")
    .upsert(payload, { onConflict: "property_id,url" })
    .select(
      "id, property_id, url, status, owner, due_date, notes, target_url, target_h1, target_title, target_meta, updated_by, updated_at",
    )
    .single();
  if (error || !data) {
    throw new Error(`upsertExecution failed: ${error?.message ?? "no data"}`);
  }
  return data as PageExecutionRow;
}
