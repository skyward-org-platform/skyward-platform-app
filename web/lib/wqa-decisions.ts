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

// ─── Row shapes ──────────────────────────────────────────────────────────

// Legacy read-only shape kept for back-compat with the v1 consumers
// (PagesView, WqaTabs, audit/* tabs). Chunk 3 migrates to WqaDecisionRow.
export type DecisionRow = {
  url: string;
  action: string;
  decided_by: string;
  decided_at: string;
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
    .select("url, action, decided_by, decided_at")
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
