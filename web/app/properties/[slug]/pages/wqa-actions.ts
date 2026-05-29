"use server";

// Server actions for the Pages surface. Split conceptually into:
//
//   1. WQA decision overrides — operator overrides of the pipeline-derived
//      action / status / logic notes / target URL on the wqa_decision table.
//      Rewritten in P2 (action semantics v2). 8-action API:
//      setAction / setStatus / clearDrift / setLogicNotes / setTargetUrl /
//      verifyTargetUrl / clearActionOverride / clearTargetUrlOverride.
//      Chunk 3 deleted the v1 back-compat shims (setWqaDecision /
//      clearWqaDecision / WqaActionValue / LEGACY_TO_ACTION7) — callers
//      now invoke the v2 actions directly with Action7.
//
//   2. page_execution + page_check_state mutations — Execution / Audit
//      drawer + audit tabs use these. Untouched by P2 (orthogonal table).

import { revalidatePath, revalidateTag } from "next/cache";
import { requireWriteToken } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import { apiBase } from "@/lib/api-base";
import { supabase } from "@/lib/supabase";
import { CACHE_TAGS } from "@/lib/cache";
import {
  upsertWqaDecision,
  type Action7,
  type WqaStatus,
} from "@/lib/wqa-decisions";
import {
  upsertExecution,
  type ExecutionStatus,
} from "@/lib/page-execution";
import { upsertCheckState } from "@/lib/page-check-state";

type Ok = { ok: true };
type Err = { ok: false; error: string };

async function resolveProperty(slug: string): Promise<{ id: string } | Err> {
  const { data, error } = await supabase
    .from("property")
    .select("id")
    .eq("slug", slug)
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Property not found" };
  return { id: data.id };
}

function bust(slug: string) {
  // Bust both the per-route cache and the coarse wqa-decisions tag so
  // unstable_cache readers (e.g. getWqaDecisions) re-fetch on next render.
  revalidateTag(CACHE_TAGS.wqaDecisions, "default");
  revalidatePath(`/properties/${slug}/pages`);
}

// ═══ WQA decision overrides (P2 action semantics v2) ══════════════════════

// ─── setAction ────────────────────────────────────────────────────────────
export async function setAction(
  slug: string, url: string, action: Action7,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const prop = await resolveProperty(slug);
  if ("ok" in prop && prop.ok === false) return prop;
  try {
    await upsertWqaDecision({
      property_id: (prop as { id: string }).id, url, action,
      decided_by: getOperator(),
    });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── setStatus ────────────────────────────────────────────────────────────
// Operator can set Open / In Progress / Done; Drifted is auto-only.
export async function setStatus(
  slug: string, url: string, status: WqaStatus,
): Promise<Ok | Err> {
  if (status === "Drifted") {
    return { ok: false, error: "Drifted is auto-set only; cannot manually transition" };
  }
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const prop = await resolveProperty(slug);
  if ("ok" in prop && prop.ok === false) return prop;
  try {
    await upsertWqaDecision({
      property_id: (prop as { id: string }).id, url, status,
      decided_by: getOperator(),
    });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── clearDrift ───────────────────────────────────────────────────────────
// Drifted → Open + clear drift_reason. Operator acknowledgement.
export async function clearDrift(slug: string, url: string): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const prop = await resolveProperty(slug);
  if ("ok" in prop && prop.ok === false) return prop;
  try {
    await upsertWqaDecision({
      property_id: (prop as { id: string }).id, url,
      status: "Open",
      drift_reason: null,
      decided_by: getOperator(),
    });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── setLogicNotes ────────────────────────────────────────────────────────
export async function setLogicNotes(
  slug: string, url: string, notes: string | null,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const prop = await resolveProperty(slug);
  if ("ok" in prop && prop.ok === false) return prop;
  try {
    await upsertWqaDecision({
      property_id: (prop as { id: string }).id, url,
      logic_notes: notes,
      decided_by: getOperator(),
    });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── setTargetUrl ─────────────────────────────────────────────────────────
export async function setTargetUrl(
  slug: string, url: string, targetUrl: string | null,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const prop = await resolveProperty(slug);
  if ("ok" in prop && prop.ok === false) return prop;
  try {
    await upsertWqaDecision({
      property_id: (prop as { id: string }).id, url,
      target_url: targetUrl,
      decided_by: getOperator(),
    });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── verifyTargetUrl ──────────────────────────────────────────────────────
// Live HTTP check. Fetches the SOURCE URL and follows the redirect chain,
// then compares the actual final URL to the configured target_url:
//
//   match + 2xx/3xx       → status → Done    (live site implements the redirect)
//   mismatch + 2xx/3xx    → status unchanged (live site redirects, but to a
//                            different URL than configured — flag the drift)
//   4xx/5xx               → status unchanged (broken or blocked)
//
// `matched` and `actualDestination` let the UI distinguish "the live site
// does what we configured" from "the live site does something else."
export type VerifyResult =
  | {
      ok: true;
      configuredTarget: string;
      actualDestination: string;
      finalStatus: number;
      chain: { url: string; status: number }[];
      matched: boolean;
      flippedStatusToDone: boolean;
    }
  | { ok: false; error: string; chain?: { url: string; status: number }[] };

/** Normalize URLs for the source/target comparison. Trailing slash and
 *  case-insensitive scheme/host are noise; path case is content-meaningful. */
function normalizeUrlForCompare(u: string): string {
  try {
    const parsed = new URL(u);
    parsed.hash = "";
    let path = parsed.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}${parsed.search}`;
  } catch {
    return u;
  }
}

export async function verifyTargetUrl(
  slug: string, url: string, flipStatusOnSuccess: boolean,
): Promise<VerifyResult> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const prop = await resolveProperty(slug);
  if ("ok" in prop && prop.ok === false) return prop;
  const propertyId = (prop as { id: string }).id;

  // Read the configured target_url for this row
  const { data: row } = await supabase
    .from("wqa_decision")
    .select("target_url")
    .eq("property_id", propertyId)
    .eq("url", url)
    .single();
  if (!row?.target_url) return { ok: false, error: "No target_url set on this row" };
  const configuredTarget: string = row.target_url;

  // Fetch the SOURCE URL via the verify endpoint, follow the chain.
  // This tells us where the live site actually sends visitors, vs where
  // the operator has configured the destination.
  const verifyEndpoint = `${apiBase()}/api/verify-url?target=${encodeURIComponent(url)}`;
  let chain: { url: string; status: number }[] = [];
  let actualDestination = url;
  let finalStatus = 0;
  try {
    const resp = await fetch(verifyEndpoint);
    if (!resp.ok) return { ok: false, error: `verify endpoint returned ${resp.status}` };
    const body = await resp.json();
    chain = body.chain ?? [];
    actualDestination = body.finalUrl ?? url;
    finalStatus = body.finalStatus ?? 0;
    if (!body.ok && body.error) {
      return { ok: false, error: body.error, chain };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const reachable = finalStatus >= 200 && finalStatus < 400;
  const matched = reachable && normalizeUrlForCompare(actualDestination) === normalizeUrlForCompare(configuredTarget);
  const shouldFlip = flipStatusOnSuccess && reachable && matched;

  // Stamp last_implementation_check_at + optionally flip status. The row
  // already exists (we just read it), so plain UPDATE — an upsert here
  // would attempt INSERT-with-conflict and fail Postgres' NOT NULL on
  // `action` (validated before conflict resolution).
  try {
    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = {
      last_implementation_check_at: nowIso,
      decided_by: getOperator(),
      updated_at: nowIso,
    };
    if (shouldFlip) patch.status = "Done";
    const { error } = await supabase
      .from("wqa_decision")
      .update(patch)
      .eq("property_id", propertyId)
      .eq("url", url);
    if (error) throw new Error(error.message);
    bust(slug);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), chain };
  }

  return {
    ok: true,
    configuredTarget,
    actualDestination,
    finalStatus,
    chain,
    matched,
    flippedStatusToDone: shouldFlip,
  };
}

// ─── clearActionOverride ──────────────────────────────────────────────────
// Delete the wqa_decision row entirely (so the joined view falls back to
// the pipeline's wqa_output action). This is the "trust the pipeline again"
// affordance from the spec.
export async function clearActionOverride(slug: string, url: string): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const prop = await resolveProperty(slug);
  if ("ok" in prop && prop.ok === false) return prop;
  try {
    const { error } = await supabase
      .from("wqa_decision")
      .delete()
      .eq("property_id", (prop as { id: string }).id)
      .eq("url", url);
    if (error) return { ok: false, error: error.message };
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── clearTargetUrlOverride ───────────────────────────────────────────────
export async function clearTargetUrlOverride(slug: string, url: string): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const prop = await resolveProperty(slug);
  if ("ok" in prop && prop.ok === false) return prop;
  try {
    await upsertWqaDecision({
      property_id: (prop as { id: string }).id, url,
      target_url: null,
      decided_by: getOperator(),
    });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ═══ page_execution mutations ═════════════════════════════════════════════
// Mirror the WQA-decision shape: requireWriteToken -> resolve property ->
// getOperator -> lib upsert -> bust. Untouched by P2 — different table.

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
  if ("ok" in prop && prop.ok === false) return prop;

  try {
    await upsertExecution({
      property_id: (prop as { id: string }).id,
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
  if ("ok" in prop && prop.ok === false) return prop;

  // Normalize empty string -> null so blank inputs don't pollute the DB.
  const normalized = value === "" ? null : value;

  try {
    await upsertExecution({
      property_id: (prop as { id: string }).id,
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

// ═══ page_check_state mutations ═══════════════════════════════════════════

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
  if ("ok" in prop && prop.ok === false) return prop;

  try {
    await upsertCheckState({
      property_id: (prop as { id: string }).id,
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
  if ("ok" in prop && prop.ok === false) return prop;

  const normalized = notes === "" ? null : notes;

  try {
    await upsertCheckState({
      property_id: (prop as { id: string }).id,
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
  if ("ok" in prop && prop.ok === false) return prop;

  const normalized = owner === "" ? null : owner;

  try {
    await upsertCheckState({
      property_id: (prop as { id: string }).id,
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

// Back-compat shims (setWqaDecision / clearWqaDecision / WqaActionValue /
// LEGACY_TO_ACTION7) were removed when WqaActionChip was rewritten in
// Chunk 3. Callers now invoke setAction / clearActionOverride directly
// with Action7. The legacy → Action7 mapping moved to web/lib/wqa-decisions.ts
// as `toAction7()` so client-side callers can defensively coerce any
// pipeline action string until Chunk 5 lands.

// ═══ Bulk operations ══════════════════════════════════════════════════════
// One Supabase upsert call per bulk action across N URLs. Avoids the N
// round-trip loop that single-URL setAction would require for large
// selections. Bulk results return { ok, updated } so the BulkActionBar
// can show the count of rows actually mutated.

type BulkOk = { ok: true; updated: number };
type BulkErr = { ok: false; error: string };

export async function bulkSetAction(
  slug: string,
  urls: string[],
  action: Action7,
): Promise<BulkOk | BulkErr> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  if (urls.length === 0) return { ok: true, updated: 0 };
  const prop = await resolveProperty(slug);
  if ("ok" in prop && prop.ok === false) return prop;
  const propertyId = (prop as { id: string }).id;
  const operator = getOperator();
  const now = new Date().toISOString();
  const rows = urls.map((url) => ({
    property_id: propertyId,
    url,
    action,
    decided_by: operator,
    updated_at: now,
  }));
  const { data, error } = await supabase
    .from("wqa_decision")
    .upsert(rows, { onConflict: "property_id,url" })
    .select("id");
  if (error) return { ok: false, error: error.message };
  bust(slug);
  return { ok: true, updated: data?.length ?? 0 };
}

export async function bulkSetStatus(
  slug: string,
  urls: string[],
  status: WqaStatus,
): Promise<BulkOk | BulkErr> {
  if (status === "Drifted") {
    return { ok: false, error: "Drifted is auto-set only; cannot bulk-set" };
  }
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  if (urls.length === 0) return { ok: true, updated: 0 };
  const prop = await resolveProperty(slug);
  if ("ok" in prop && prop.ok === false) return prop;
  const propertyId = (prop as { id: string }).id;
  const operator = getOperator();
  const now = new Date().toISOString();
  const rows = urls.map((url) => ({
    property_id: propertyId,
    url,
    status,
    decided_by: operator,
    updated_at: now,
  }));
  const { data, error } = await supabase
    .from("wqa_decision")
    .upsert(rows, { onConflict: "property_id,url" })
    .select("id");
  if (error) return { ok: false, error: error.message };
  bust(slug);
  return { ok: true, updated: data?.length ?? 0 };
}

/** Bulk-verify N rows. For each row with a target_url, fetches the
 *  SOURCE URL via /api/verify-url, captures the actual final URL, and
 *  compares to the configured target_url:
 *    - source reaches target_url cleanly → status → Done (matched)
 *    - source reaches a different live URL → flag as mismatch, no flip
 *    - source 4xx/5xx → fail, no flip
 *  Rows without a target_url are skipped. Concurrency 5. */
export async function bulkVerifyTargetUrls(
  slug: string,
  urls: string[],
): Promise<
  | {
      ok: true;
      total: number;
      matched: number;
      mismatched: number;
      failed: number;
      skipped: number;
      flippedToDone: number;
      mismatches: { url: string; configured: string; actual: string }[];
      failures: { url: string; error: string }[];
    }
  | BulkErr
> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  if (urls.length === 0) {
    return { ok: true, total: 0, matched: 0, mismatched: 0, failed: 0, skipped: 0, flippedToDone: 0, mismatches: [], failures: [] };
  }
  const prop = await resolveProperty(slug);
  if ("ok" in prop && prop.ok === false) return prop;
  const propertyId = (prop as { id: string }).id;

  const { data: rows, error: readErr } = await supabase
    .from("wqa_decision")
    .select("url, target_url")
    .eq("property_id", propertyId)
    .in("url", urls);
  if (readErr) return { ok: false, error: readErr.message };

  const targets = new Map<string, string>();
  for (const r of rows ?? []) {
    if (r.target_url) targets.set(r.url, r.target_url);
  }
  const skipped = urls.length - targets.size;

  const CONCURRENCY = 5;
  const base = apiBase();
  const operator = getOperator();
  const nowIso = new Date().toISOString();

  const matchedUrls: string[] = [];
  const mismatches: { url: string; configured: string; actual: string }[] = [];
  const failures: { url: string; error: string }[] = [];

  const queue = Array.from(targets.entries());
  async function worker() {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) break;
      const [sourceUrl, configuredTarget] = next;
      try {
        const resp = await fetch(`${base}/api/verify-url?target=${encodeURIComponent(sourceUrl)}`);
        if (!resp.ok) {
          failures.push({ url: sourceUrl, error: `endpoint ${resp.status}` });
          continue;
        }
        const body = await resp.json();
        if (!body.ok) {
          failures.push({ url: sourceUrl, error: body.error ?? "verify failed" });
          continue;
        }
        const finalStatus: number = body.finalStatus ?? 0;
        const actualDestination: string = body.finalUrl ?? sourceUrl;
        if (finalStatus < 200 || finalStatus >= 400) {
          failures.push({ url: sourceUrl, error: `final status ${finalStatus}` });
          continue;
        }
        if (normalizeUrlForCompare(actualDestination) === normalizeUrlForCompare(configuredTarget)) {
          matchedUrls.push(sourceUrl);
        } else {
          mismatches.push({ url: sourceUrl, configured: configuredTarget, actual: actualDestination });
        }
      } catch (e) {
        failures.push({ url: sourceUrl, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

  // Three UPDATE batches: matched (→ Done), mismatched (stamp only), failed (stamp only).
  if (matchedUrls.length > 0) {
    const { error: upErr } = await supabase
      .from("wqa_decision")
      .update({
        status: "Done",
        last_implementation_check_at: nowIso,
        decided_by: operator,
        updated_at: nowIso,
      })
      .eq("property_id", propertyId)
      .in("url", matchedUrls);
    if (upErr) return { ok: false, error: upErr.message };
  }
  const stampOnly = [
    ...mismatches.map((m) => m.url),
    ...failures.map((f) => f.url),
  ];
  if (stampOnly.length > 0) {
    const { error: upErr } = await supabase
      .from("wqa_decision")
      .update({
        last_implementation_check_at: nowIso,
        decided_by: operator,
        updated_at: nowIso,
      })
      .eq("property_id", propertyId)
      .in("url", stampOnly);
    if (upErr) return { ok: false, error: upErr.message };
  }
  bust(slug);

  return {
    ok: true,
    total: targets.size,
    matched: matchedUrls.length,
    mismatched: mismatches.length,
    failed: failures.length,
    skipped,
    flippedToDone: matchedUrls.length,
    mismatches,
    failures,
  };
}

/** Bulk-clear the operator action override - the wqa_decision rows are
 *  deleted so the rows fall back to the pipeline-derived action.
 *  Existing status / logic_notes on those rows are lost; intentional, the
 *  override IS the row. Operator should re-set status separately if needed. */
export async function bulkClearActionOverride(
  slug: string,
  urls: string[],
): Promise<BulkOk | BulkErr> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  if (urls.length === 0) return { ok: true, updated: 0 };
  const prop = await resolveProperty(slug);
  if ("ok" in prop && prop.ok === false) return prop;
  const propertyId = (prop as { id: string }).id;
  const { data, error } = await supabase
    .from("wqa_decision")
    .delete()
    .eq("property_id", propertyId)
    .in("url", urls)
    .select("id");
  if (error) return { ok: false, error: error.message };
  bust(slug);
  return { ok: true, updated: data?.length ?? 0 };
}

// ─── suggestRedirectDestination ───────────────────────────────────────────
// Powers the "Suggest destination" button on the Redirect tab. Calls the
// shared lib helper that embeds the source URL's slug text via OpenAI +
// runs the match_page_embeddings pgvector RPC, returning top-K candidates
// bucketed by confidence (high / medium / low). Read-only — no writes
// to wqa_decision or page_execution.

import { suggestDestinationsForUrl } from "@/lib/redirect-suggester";

export async function suggestRedirectDestination(
  propertySlug: string,
  sourceUrl: string,
): Promise<
  | { ok: true; slugText: string; suggestions: { url: string; similarity: number; confidence: "high" | "medium" | "low" }[] }
  | { ok: false; error: string }
> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  try {
    const res = await suggestDestinationsForUrl(propertySlug, sourceUrl, 3);
    return { ok: true, ...res };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
