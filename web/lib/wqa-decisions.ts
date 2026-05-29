// Read-only helper for fetching human overrides of the SOP triage. Pulled
// out of pages/wqa-actions.ts (which is "use server") so we can wrap with
// React.cache + unstable_cache — server actions can't be cached the same way.
//
// Tag CACHE_TAGS.wqaDecisions is busted in WQA mutation actions
// (wqa-actions.ts) so the next read reflects the override.
//
// P2 (action semantics overhaul) added:
//   - Action7 / WqaStatus / LogicCode type exports + label maps + color tokens
//   - WqaDecisionRow (full row shape including status / logic_notes / drift fields)
//   - upsertWqaDecision (server-side writer used by the new wqa-actions.ts in
//     Chunk 2). Old DecisionRow + getWqaDecisions kept for back-compat — the
//     UI chip refactor (Chunk 3) migrates consumers to WqaDecisionRow.

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { supabase } from "./supabase";
import { CACHE_TAGS, TTL } from "./cache";

// ─── Action semantics v2 (P2) ────────────────────────────────────────────

export type Action7 =
  | "Optimize"
  | "Restore"
  | "Redirect"
  | "Consolidate"
  | "Remove"
  | "Keep"
  | "Investigate";

export type WqaStatus = "Open" | "In Progress" | "Done" | "Drifted";

// Closed enum of logic codes (per spec § "Logic codes").
export type LogicCode =
  | "revenue_critical"
  | "page_1_protect"
  | "striking_distance"
  | "has_visibility"
  | "utility_light_touch"
  | "404_with_inbound_traffic"
  | "404_no_value"
  | "5xx_server_error"
  | "redirect_to_relevant"
  | "non_primary_variant"
  | "duplicate_content"
  | "internal_links_no_external_signals"
  | "data_conflict"
  | "human_judgment"
  | "system_url"
  | "legitimate_keep";

export const LOGIC_CODE_LABELS: Record<LogicCode, string> = {
  revenue_critical: "Revenue-critical traffic + conversion value",
  page_1_protect: "Currently ranks position 1-10",
  striking_distance: "Currently ranks position 11-20",
  has_visibility: "Some impressions / clicks; lower priority",
  utility_light_touch: "Low-priority page, kept in working set",
  "404_with_inbound_traffic": "4xx response; historical traffic justifies restore",
  "404_no_value": "4xx response; no historical signal",
  "5xx_server_error": "Server error (5xx); not a content issue",
  redirect_to_relevant: "3xx response with relevant destination",
  non_primary_variant: "Canonical points elsewhere; this is a variant",
  duplicate_content: "Near-duplicate; merge into primary",
  internal_links_no_external_signals: "Linked internally; no GSC/GA/Ahrefs signal",
  data_conflict: "Data sources disagree",
  human_judgment: "Pipeline flagged for explicit operator review",
  system_url: "Fragment / param / utility URL; leave as is",
  legitimate_keep: "Strategic decision to leave alone",
};

// Mapping action → which logic_codes commonly apply.
export const TYPICAL_LOGIC_FOR_ACTION: Record<Action7, LogicCode[]> = {
  Optimize: [
    "revenue_critical",
    "page_1_protect",
    "striking_distance",
    "has_visibility",
    "utility_light_touch",
  ],
  Restore: ["404_with_inbound_traffic", "5xx_server_error"],
  Redirect: ["redirect_to_relevant"],
  Consolidate: ["non_primary_variant", "duplicate_content"],
  Remove: ["404_no_value"],
  Keep: ["system_url", "legitimate_keep"],
  Investigate: [
    "internal_links_no_external_signals",
    "data_conflict",
    "human_judgment",
  ],
};

// Action color tokens (v2 design system). Resolved to Tailwind classes at
// the chip layer so the lib stays framework-agnostic.
export const ACTION_COLOR: Record<Action7, string> = {
  Optimize: "sky",
  Restore: "emerald",
  Redirect: "amber",
  Consolidate: "violet",
  Remove: "rose",
  Keep: "slate",
  Investigate: "neutral",
};

// Status color tokens.
export const STATUS_COLOR: Record<WqaStatus, string> = {
  Open: "slate",
  "In Progress": "indigo",
  Done: "emerald",
  Drifted: "rose",
};

// ─── Legacy → Action7 mapping ────────────────────────────────────────────
// The Python pipeline (build_phase1_wqa.py) still emits the old 10-value
// enum until Chunk 5 lands. Until then the UI must defensively map any
// legacy action string from BQ wqa_output (or the in-memory triageRow
// result) into the canonical 7-value enum. Mirrors the SQL backfill in
// db/supabase/migrations/20260525_wqa_decision_v2.sql.
//
// Removed once Chunk 5 ships and BQ writes only Action7 values.
const LEGACY_TO_ACTION7: Record<string, Action7> = {
  Optimize: "Optimize",
  Restore: "Restore",
  Redirect: "Redirect",
  Consolidate: "Consolidate",
  Remove: "Remove",
  Keep: "Keep",
  Investigate: "Investigate",
  // Legacy values collapse per the SQL backfill.
  Evaluate: "Investigate",
  "Leave as 404": "Keep",
  "Non-addressable": "Keep",
  "Non-indexable": "Keep",
};

/** Defensive mapper: accepts any action string (legacy 10-value or new
 *  7-value enum) and returns the canonical Action7. Falls back to
 *  "Investigate" for unknown values so the UI never blanks out. */
export function toAction7(action: string | null | undefined): Action7 {
  if (!action) return "Investigate";
  return LEGACY_TO_ACTION7[action] ?? "Investigate";
}

// ─── Row shapes ──────────────────────────────────────────────────────────

// Read-only row shape returned by getWqaDecisions(). Extended in P2 to
// surface status / logic_notes / target_url / drift_reason so the chips
// and drawer can render without a second round-trip. logic_code stays
// out of this view because the chip reads it from the BQ wqa_output row
// (Chunk 5 add); the override side does not duplicate it.
export type DecisionRow = {
  url: string;
  action: string;
  target_url: string | null;
  status: WqaStatus;
  logic_notes: string | null;
  drift_reason: string | null;
  last_implementation_check_at: string | null;
  decided_by: string;
  decided_at: string;
  // Verification rollup (denormalized from verification_event for the
  // main-table "Verified" chip). null when the row has never been verified.
  last_verification_kind?: "matched" | "mismatch" | "failed" | null;
  last_verification_final_status?: number | null;
  last_verification_actual?: string | null;
};

// Full row shape — used by the new server actions + chip refactor (Chunk 3).
export type WqaDecisionRow = {
  id: string;
  property_id: string;
  url: string;
  action: Action7;
  target_url: string | null;
  note: string | null; // legacy free-text; superseded by logic_notes
  status: WqaStatus;
  logic_notes: string | null;
  last_implementation_check_at: string | null;
  drift_reason: string | null;
  decided_by: string;
  decided_at: string;
  updated_at: string;
  // Verification rollup (denormalized from verification_event for the
  // main-table "Verified" chip).
  last_verification_kind?: "matched" | "mismatch" | "failed" | null;
  last_verification_final_status?: number | null;
  last_verification_actual?: string | null;
};

// ─── Reader ──────────────────────────────────────────────────────────────

async function fetchWqaDecisionsRaw(
  propertySlug: string,
): Promise<DecisionRow[]> {
  const { data: prop } = await supabase
    .from("property")
    .select("id")
    .eq("slug", propertySlug)
    .single();
  if (!prop) return [];
  const { data } = await supabase
    .from("wqa_decision")
    .select(
      "url, action, target_url, status, logic_notes, drift_reason, last_implementation_check_at, decided_by, decided_at, last_verification_kind, last_verification_final_status, last_verification_actual",
    )
    .eq("property_id", prop.id);
  return (data ?? []) as DecisionRow[];
}

const fetchWqaDecisionsCached = unstable_cache(
  fetchWqaDecisionsRaw,
  ["wqa-decisions"],
  { revalidate: TTL.data, tags: [CACHE_TAGS.wqaDecisions] },
);

export const getWqaDecisions = cache(fetchWqaDecisionsCached);

// ─── Writer ──────────────────────────────────────────────────────────────

export type WqaDecisionUpsert = {
  property_id: string;
  url: string;
  action?: Action7;
  target_url?: string | null;
  status?: WqaStatus;
  logic_notes?: string | null;
  drift_reason?: string | null;
  last_implementation_check_at?: string | null;
  decided_by: string;
};

// Upsert the operator override row. The new server actions in
// wqa-actions.ts (Chunk 2) call this with a focused subset of fields; the
// onConflict clause keeps existing columns intact when only one field is
// being updated.
export async function upsertWqaDecision(
  input: WqaDecisionUpsert,
): Promise<WqaDecisionRow> {
  const { property_id, url, decided_by, ...changes } = input;
  const { data, error } = await supabase
    .from("wqa_decision")
    .upsert(
      {
        property_id,
        url,
        decided_by,
        ...changes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "property_id,url" },
    )
    .select()
    .single();
  if (error) throw new Error(`upsertWqaDecision: ${error.message}`);
  return data as WqaDecisionRow;
}
