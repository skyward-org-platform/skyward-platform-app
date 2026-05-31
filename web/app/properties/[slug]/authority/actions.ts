"use server";

import { revalidatePath } from "next/cache";
import { requireWriteToken } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import { apiBase } from "@/lib/api-base";
import {
  updateReferringDomain,
  upsertDisavowEntry,
  updateDisavowEntry,
  getDisavowEntries,
  type RefDomainQuality,
  type DisavowStatus,
} from "@/lib/authority";
import type {
  RdStatus,
  ProspectStatus,
  ProspectPriority,
} from "@/lib/authority";
import { supabase } from "@/lib/supabase";
import {
  runAhrefsAudit,
  type AuditMode,
  type AuditResult,
  type BacklinkPayload,
  type RdPayload,
  type SpamRd,
  type AuditMetrics,
} from "@/lib/ahrefs-audit";

type Ok = { ok: true };
type Err = { ok: false; error: string };

function bust(slug: string) {
  revalidatePath(`/properties/${slug}/authority`);
}

async function resolvePropertyId(slug: string): Promise<string | null> {
  const { data } = await supabase
    .from("property")
    .select("id")
    .eq("slug", slug)
    .single();
  return data?.id ?? null;
}

async function resolveDomainRowId(
  slug: string,
  domain: string,
): Promise<string | null> {
  const propertyId = await resolvePropertyId(slug);
  if (!propertyId) return null;
  const { data: row } = await supabase
    .from("referring_domain")
    .select("id")
    .eq("property_id", propertyId)
    .eq("domain", domain)
    .single();
  return row?.id ?? null;
}

async function resolveDisavowRowId(
  slug: string,
  domain: string,
): Promise<string | null> {
  const propertyId = await resolvePropertyId(slug);
  if (!propertyId) return null;
  const { data: row } = await supabase
    .from("disavow_entry")
    .select("id")
    .eq("property_id", propertyId)
    .eq("domain", domain)
    .single();
  return row?.id ?? null;
}

// ─── referring_domain ───────────────────────────────────────────────────────
export async function setDomainQuality(
  slug: string,
  domain: string,
  quality: RefDomainQuality,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const id = await resolveDomainRowId(slug, domain);
  if (!id) return { ok: false, error: "referring_domain not found" };
  try {
    await updateReferringDomain({ id, quality, updated_by: getOperator() });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setDomainNotes(
  slug: string,
  domain: string,
  notes: string | null,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const id = await resolveDomainRowId(slug, domain);
  if (!id) return { ok: false, error: "referring_domain not found" };
  try {
    await updateReferringDomain({ id, notes, updated_by: getOperator() });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── disavow_entry ──────────────────────────────────────────────────────────
export async function addToDisavow(
  slug: string,
  domain: string,
  reason: string | null,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const propertyId = await resolvePropertyId(slug);
  if (!propertyId) return { ok: false, error: "property not found" };
  try {
    await upsertDisavowEntry({
      property_id: propertyId,
      domain,
      reason,
      added_by: getOperator(),
    });
    // Mirror quality=Disavow on the referring_domain row (if one exists).
    const id = await resolveDomainRowId(slug, domain);
    if (id) {
      await updateReferringDomain({
        id,
        quality: "Disavow",
        updated_by: getOperator(),
      });
    }
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setDisavowStatus(
  slug: string,
  domain: string,
  status: DisavowStatus,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const id = await resolveDisavowRowId(slug, domain);
  if (!id) return { ok: false, error: "disavow_entry not found" };
  try {
    await updateDisavowEntry(id, { status });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setDisavowReason(
  slug: string,
  domain: string,
  reason: string | null,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const id = await resolveDisavowRowId(slug, domain);
  if (!id) return { ok: false, error: "disavow_entry not found" };
  try {
    await updateDisavowEntry(id, { reason });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── refresh + export ───────────────────────────────────────────────────────
export async function runAuthorityRefresh(slug: string): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  try {
    const url = `${apiBase()}/api/authority/refresh?slug=${encodeURIComponent(slug)}`;
    const headers: Record<string, string> = {
      "X-Operator": getOperator(),
    };
    // Forward the bearer token so the Python endpoint's _check_auth
    // accepts the request when APP_WRITE_TOKEN is configured.
    const token = process.env.APP_WRITE_TOKEN;
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const resp = await fetch(url, {
      method: "POST",
      headers,
      cache: "no-store",
    });
    if (!resp.ok) {
      const body = await resp.text();
      return {
        ok: false,
        error: `refresh failed (${resp.status}): ${body.slice(0, 300)}`,
      };
    }
    const data = await resp.json();
    if (!data.ok) {
      return { ok: false, error: data.error ?? "refresh returned ok=false" };
    }
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function exportDisavowTxt(
  slug: string,
): Promise<string | { error: string }> {
  const propertyId = await resolvePropertyId(slug);
  if (!propertyId) return { error: "property not found" };
  const entries = await getDisavowEntries(propertyId);
  const inFile = entries.filter(
    (e) => e.status === "In File" || e.status === "Confirmed by GSC",
  );
  const sorted = [...inFile].sort((a, b) => a.domain.localeCompare(b.domain));
  const lines = [
    `# Disavow file for ${slug}`,
    `# Generated ${new Date().toISOString()} from Skyward Platform`,
    `# Includes ${sorted.length} domains marked 'In File' or 'Confirmed by GSC'`,
    "",
    ...sorted.map((e) => `domain:${e.domain}`),
  ];
  return lines.join("\n");
}

// ═════════════════════════════════════════════════════════════════════════
// Phase 5 v2 actions — referring_domain status/tactic/notes,
// disavow lifecycle (pending → approved/rejected), prospects, audits,
// export Google disavow file.
// ═════════════════════════════════════════════════════════════════════════

// ─── referring_domain v2: status / tactic / notes ──────────────────────────
export async function setReferringDomainStatus(
  slug: string,
  domains: string[],
  status: RdStatus,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const propertyId = await resolvePropertyId(slug);
  if (!propertyId) return { ok: false, error: "property not found" };
  try {
    const { error } = await supabase
      .from("referring_domain")
      .update({
        status,
        updated_by: getOperator(),
        updated_at: new Date().toISOString(),
      })
      .eq("property_id", propertyId)
      .in("domain", domains);
    if (error) return { ok: false, error: error.message };
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setReferringDomainTactic(
  slug: string,
  domains: string[],
  tactic: string | null,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const propertyId = await resolvePropertyId(slug);
  if (!propertyId) return { ok: false, error: "property not found" };
  try {
    const { error } = await supabase
      .from("referring_domain")
      .update({
        tactic,
        updated_by: getOperator(),
        updated_at: new Date().toISOString(),
      })
      .eq("property_id", propertyId)
      .in("domain", domains);
    if (error) return { ok: false, error: error.message };
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setReferringDomainNotes(
  slug: string,
  domain: string,
  notes: string | null,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const id = await resolveDomainRowId(slug, domain);
  if (!id) return { ok: false, error: "referring_domain not found" };
  try {
    await updateReferringDomain({ id, notes, updated_by: getOperator() });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Disavow lifecycle ─────────────────────────────────────────────────────
export async function flagAsDisavowCandidate(
  slug: string,
  domains: string[],
  reason: string | null,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const propertyId = await resolvePropertyId(slug);
  if (!propertyId) return { ok: false, error: "property not found" };
  try {
    const nowIso = new Date().toISOString();
    // Bulk update referring_domain.status → disavow_pending
    const { error: rdErr } = await supabase
      .from("referring_domain")
      .update({
        status: "disavow_pending",
        updated_by: getOperator(),
        updated_at: nowIso,
      })
      .eq("property_id", propertyId)
      .in("domain", domains);
    if (rdErr) return { ok: false, error: rdErr.message };

    // Upsert one disavow_entry per domain with status='pending'
    const rows = domains.map((d) => ({
      property_id: propertyId,
      domain: d,
      reason,
      status: "pending",
      added_by: getOperator(),
      updated_at: nowIso,
    }));
    const { error: dErr } = await supabase
      .from("disavow_entry")
      .upsert(rows, { onConflict: "property_id,domain" });
    if (dErr) return { ok: false, error: dErr.message };

    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function approveDisavow(
  slug: string,
  domains: string[],
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const propertyId = await resolvePropertyId(slug);
  if (!propertyId) return { ok: false, error: "property not found" };
  try {
    const nowIso = new Date().toISOString();
    const { error: dErr } = await supabase
      .from("disavow_entry")
      .update({ status: "approved", updated_at: nowIso })
      .eq("property_id", propertyId)
      .in("domain", domains);
    if (dErr) return { ok: false, error: dErr.message };

    const { error: rdErr } = await supabase
      .from("referring_domain")
      .update({
        status: "disavowed",
        updated_by: getOperator(),
        updated_at: nowIso,
      })
      .eq("property_id", propertyId)
      .in("domain", domains);
    if (rdErr) return { ok: false, error: rdErr.message };

    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function rejectDisavow(
  slug: string,
  domains: string[],
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const propertyId = await resolvePropertyId(slug);
  if (!propertyId) return { ok: false, error: "property not found" };
  try {
    const nowIso = new Date().toISOString();
    const { error: dErr } = await supabase
      .from("disavow_entry")
      .update({ status: "rejected", updated_at: nowIso })
      .eq("property_id", propertyId)
      .in("domain", domains);
    if (dErr) return { ok: false, error: dErr.message };

    const { error: rdErr } = await supabase
      .from("referring_domain")
      .update({
        status: "active",
        updated_by: getOperator(),
        updated_at: nowIso,
      })
      .eq("property_id", propertyId)
      .in("domain", domains);
    if (rdErr) return { ok: false, error: rdErr.message };

    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Prospects ─────────────────────────────────────────────────────────────
export async function setProspectStatus(
  slug: string,
  prospectIds: string[],
  status: ProspectStatus,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  try {
    const patch: Record<string, unknown> = {
      status,
      updated_by: getOperator(),
      updated_at: new Date().toISOString(),
    };
    if (status === "contacted") {
      patch.last_contacted_at = new Date().toISOString();
    }
    if (status === "placed") {
      patch.placed_at = new Date().toISOString();
    }
    const { error } = await supabase
      .from("link_prospect")
      .update(patch)
      .in("id", prospectIds);
    if (error) return { ok: false, error: error.message };
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setProspectPriority(
  slug: string,
  prospectIds: string[],
  priority: ProspectPriority,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  try {
    const { error } = await supabase
      .from("link_prospect")
      .update({
        priority,
        updated_by: getOperator(),
        updated_at: new Date().toISOString(),
      })
      .in("id", prospectIds);
    if (error) return { ok: false, error: error.message };
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setProspectTactic(
  slug: string,
  prospectIds: string[],
  tactic: string | null,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  try {
    const { error } = await supabase
      .from("link_prospect")
      .update({
        tactic,
        updated_by: getOperator(),
        updated_at: new Date().toISOString(),
      })
      .in("id", prospectIds);
    if (error) return { ok: false, error: error.message };
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type ProspectInput = {
  domain: string;
  dr?: number | null;
  url?: string | null;
  tactic?: string | null;
  priority?: ProspectPriority;
  contact_name?: string | null;
  contact_email?: string | null;
  notes?: string | null;
  source?: string | null;
  competitor_referring?: string | null;
};

export async function createProspectsBulk(
  slug: string,
  items: ProspectInput[],
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const propertyId = await resolvePropertyId(slug);
  if (!propertyId) return { ok: false, error: "property not found" };
  if (items.length === 0) return { ok: false, error: "no items to insert" };
  try {
    const rows = items.map((it) => ({
      property_id: propertyId,
      domain: it.domain,
      dr: it.dr ?? null,
      url: it.url ?? null,
      tactic: it.tactic ?? null,
      priority: it.priority ?? "medium",
      contact_name: it.contact_name ?? null,
      contact_email: it.contact_email ?? null,
      notes: it.notes ?? null,
      source: it.source ?? null,
      competitor_referring: it.competitor_referring ?? null,
      updated_by: getOperator(),
    }));
    const { error } = await supabase.from("link_prospect").insert(rows);
    if (error) return { ok: false, error: error.message };
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Export Google disavow file (plain-text, one "domain:<domain>" per line)
export async function exportDisavowFile(
  slug: string,
): Promise<{ ok: true; content: string; filename: string } | Err> {
  const propertyId = await resolvePropertyId(slug);
  if (!propertyId) return { ok: false, error: "property not found" };
  const { data, error } = await supabase
    .from("disavow_entry")
    .select("domain, status")
    .eq("property_id", propertyId)
    .eq("status", "approved");
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as { domain: string; status: string }[];
  const sorted = [...rows].sort((a, b) => a.domain.localeCompare(b.domain));
  const date = new Date().toISOString().slice(0, 10);
  const content = [
    `# Google Disavow file for ${slug}`,
    `# Generated ${new Date().toISOString()} by Skyward Platform`,
    `# Includes ${sorted.length} approved domain${sorted.length === 1 ? "" : "s"}`,
    "",
    ...sorted.map((e) => `domain:${e.domain}`),
  ].join("\n");
  return {
    ok: true,
    content,
    filename: `disavow-${slug}-${date}.txt`,
  };
}

// ─── runLinkAudit (v2: real Ahrefs ingest) ─────────────────────────────────
// Pulls metrics + backlinks + RDs from Ahrefs via lib/ahrefs-audit, then
// atomically writes backlink (append-only via ahrefs_id dedup), upserts
// referring_domain (preserving operator-set fields), inserts disavow_entry
// rows for newly-flagged spam, and records a link_audit row capturing the
// run's cost + topline metrics.
//
// Fails clean if AHREFS_API_KEY is missing. If a partial result comes back
// (cost cap reached mid-flight), still ingests what was collected and
// writes a link_audit row noting the partial run.

export type RunLinkAuditResult =
  | {
      ok: true;
      auditId: string;
      costUnits: number;
      liveRds: number;
      spamRds: number;
      disavowAutoFlagged: number;
      partial: boolean;
    }
  | { ok: false; error: string };

export type RunLinkAuditOpts = {
  mode?: AuditMode;
  capUnits?: number;
};

export async function runLinkAudit(
  slug: string,
  opts: RunLinkAuditOpts = {},
): Promise<RunLinkAuditResult> {
  const mode: AuditMode = opts.mode ?? "quick";
  const capUnits = opts.capUnits ?? 3000;

  // 1. Auth gate
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;

  // 2. Resolve property → id + primary_domain
  const { data: prop, error: propErr } = await supabase
    .from("property")
    .select("id, primary_domain")
    .eq("slug", slug)
    .single();
  if (propErr || !prop?.id) {
    return { ok: false, error: "property not found" };
  }
  const propertyId = prop.id as string;
  const primaryDomain = (prop.primary_domain ?? "").trim();
  if (!primaryDomain) {
    return {
      ok: false,
      error: "property.primary_domain is empty; set it before running an audit",
    };
  }

  // 3. Pre-flight env check (handled in runAhrefsAudit, but we surface
  // the message early so the UI doesn't even start the long fetch).
  if (!process.env.AHREFS_API_KEY) {
    return { ok: false, error: "AHREFS_API_KEY not configured in env" };
  }

  // 4. Call the Ahrefs audit. Wrap in try/catch so a network error doesn't
  // crash the action (still record a failed-audit row for the operator).
  let result: AuditResult;
  try {
    result = await runAhrefsAudit({
      domain: primaryDomain,
      mode,
      capUnits,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await safeInsertAuditFailure(propertyId, mode, capUnits, msg);
    bust(slug);
    return { ok: false, error: `Ahrefs audit threw: ${msg}` };
  }

  // 5. Collect what we got (ok or partial).
  const partial = result.ok === false && result.partial != null;
  const backlinks: BacklinkPayload[] = result.ok
    ? result.backlinks
    : (result.partial?.backlinks ?? []);
  const referringDomains: RdPayload[] = result.ok
    ? result.referringDomains
    : (result.partial?.referringDomains ?? []);
  const spamRds: SpamRd[] = result.ok
    ? result.spamRds
    : (result.partial?.spamRds ?? []);
  const metrics: AuditMetrics | null = result.ok
    ? result.metrics
    : (result.partial?.metrics ?? null);
  const costUnits = result.ok
    ? result.costUnits
    : (result.partial?.costUnits ?? 0);
  const durationMs = result.ok
    ? result.durationMs
    : (result.partial?.durationMs ?? 0);

  // If the call failed AND we got nothing back, record a failed audit and
  // bail. (This is distinct from "partial" where we got some data but the
  // cap killed it.)
  if (!result.ok && !partial) {
    await safeInsertAuditFailure(propertyId, mode, capUnits, result.error);
    bust(slug);
    return { ok: false, error: result.error };
  }

  // 6. Ingest. Each step is wrapped so a single failure surfaces in the
  // error message but doesn't prevent the link_audit row from recording
  // what happened.
  const operator = getOperator();
  const nowIso = new Date().toISOString();
  let ingestErrors: string[] = [];
  let disavowAutoFlagged = 0;

  // 6a. Backlinks (append-only). Dedup via ahrefs_id when present, else
  // skip rows that already exist on (source_url, target_url).
  if (backlinks.length > 0) {
    try {
      const blRows = backlinks.map((b) => ({
        property_id: propertyId,
        source_url: b.source_url,
        source_domain: b.source_domain,
        source_dr: b.source_dr,
        source_traffic: b.source_traffic,
        target_url: b.target_url,
        anchor: b.anchor,
        link_type: b.link_type,
        first_seen: b.first_seen,
        last_seen: b.last_seen,
        is_lost: b.is_lost,
        ahrefs_id: b.ahrefs_id,
        ingested_at: nowIso,
      }));
      // Upsert on ahrefs_id where present, ignoring null-id rows (insert
      // them straight). Partial unique index on backlink(ahrefs_id) where
      // ahrefs_id is not null handles dedup for the keyed rows.
      const keyed = blRows.filter((r) => r.ahrefs_id != null);
      const unkeyed = blRows.filter((r) => r.ahrefs_id == null);
      if (keyed.length > 0) {
        const { error } = await supabase
          .from("backlink")
          .upsert(keyed, { onConflict: "ahrefs_id", ignoreDuplicates: true });
        if (error) ingestErrors.push(`backlink upsert: ${error.message}`);
      }
      if (unkeyed.length > 0) {
        const { error } = await supabase.from("backlink").insert(unkeyed);
        if (error) ingestErrors.push(`backlink insert: ${error.message}`);
      }
    } catch (e) {
      ingestErrors.push(
        `backlink ingest threw: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // 6b. Referring domains. Upsert preserves operator-set quality, notes,
  // status, tactic — only patches the metrics columns Ahrefs owns.
  if (referringDomains.length > 0) {
    try {
      // Pull existing rows so we can preserve operator-set fields.
      const domainList = referringDomains.map((r) => r.domain);
      const { data: existing } = await supabase
        .from("referring_domain")
        .select("domain, quality, notes, status, tactic, spam_signal")
        .eq("property_id", propertyId)
        .in("domain", domainList);
      const existingByDomain = new Map<
        string,
        Record<string, unknown>
      >(
        ((existing ?? []) as Array<Record<string, unknown>>).map((r) => [
          r.domain as string,
          r,
        ]),
      );

      const rdRows = referringDomains.map((r) => {
        const prev = existingByDomain.get(r.domain);
        return {
          property_id: propertyId,
          domain: r.domain,
          first_seen: r.first_seen,
          last_seen: r.last_seen,
          domain_rating: r.domain_rating,
          traffic_domain: r.traffic_domain,
          dofollow_links: r.dofollow_links,
          links_to_target: r.links_to_target,
          detected_spam: r.detected_spam,
          backlink_count: r.backlink_count,
          // Preserve operator-set fields on re-runs.
          quality: prev?.quality ?? "Pending",
          notes: prev?.notes ?? null,
          status: prev?.status ?? "active",
          tactic: prev?.tactic ?? r.tactic,
          spam_signal: prev?.spam_signal ?? r.spam_signal,
          last_refreshed_at: nowIso,
          updated_by: operator,
          updated_at: nowIso,
        };
      });
      const { error } = await supabase
        .from("referring_domain")
        .upsert(rdRows, { onConflict: "property_id,domain" });
      if (error) ingestErrors.push(`referring_domain upsert: ${error.message}`);
    } catch (e) {
      ingestErrors.push(
        `RD ingest threw: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // 6c. Disavow auto-flag. Insert a pending disavow_entry for every spam
  // RD that doesn't already have one. Mirror RD.status → disavow_pending.
  if (spamRds.length > 0) {
    try {
      const spamDomains = spamRds.map((s) => s.domain);
      const { data: existingDisavow } = await supabase
        .from("disavow_entry")
        .select("domain")
        .eq("property_id", propertyId)
        .in("domain", spamDomains);
      const existingSet = new Set(
        ((existingDisavow ?? []) as Array<{ domain: string }>).map(
          (r) => r.domain,
        ),
      );
      const toInsert = spamRds
        .filter((s) => !existingSet.has(s.domain))
        .map((s) => ({
          property_id: propertyId,
          domain: s.domain,
          reason: s.signal,
          status: "pending",
          added_by: operator,
          updated_at: nowIso,
        }));
      if (toInsert.length > 0) {
        const { error } = await supabase
          .from("disavow_entry")
          .upsert(toInsert, { onConflict: "property_id,domain" });
        if (error) {
          ingestErrors.push(`disavow_entry insert: ${error.message}`);
        } else {
          disavowAutoFlagged = toInsert.length;
        }
        // Mirror referring_domain.status → disavow_pending for the same
        // domains. Don't downgrade rows already "disavowed".
        const { error: rdStatusErr } = await supabase
          .from("referring_domain")
          .update({
            status: "disavow_pending",
            updated_by: operator,
            updated_at: nowIso,
          })
          .eq("property_id", propertyId)
          .in(
            "domain",
            toInsert.map((t) => t.domain),
          )
          .neq("status", "disavowed");
        if (rdStatusErr) {
          ingestErrors.push(`RD status mirror: ${rdStatusErr.message}`);
        }
      }
    } catch (e) {
      ingestErrors.push(
        `disavow ingest threw: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // 6d. link_audit row.
  const toplineFindings: Record<string, unknown> = {
    mode,
    cap_units: capUnits,
    partial,
    domain: primaryDomain,
    backlinks_ingested: backlinks.length,
    rds_ingested: referringDomains.length,
    spam_rds_detected: spamRds.length,
    disavow_auto_flagged: disavowAutoFlagged,
    dr_distribution: metrics?.dr_distribution ?? null,
    ingest_errors: ingestErrors.length > 0 ? ingestErrors : null,
  };
  if (!result.ok) {
    toplineFindings.error = result.error;
  }

  const liveRds = metrics?.live_rds ?? referringDomains.length;
  const liveBacklinks = metrics?.live_backlinks ?? backlinks.length;
  const spamRdsCount = spamRds.length;
  const toxicPct =
    liveRds > 0 ? Number(((spamRdsCount / liveRds) * 100).toFixed(2)) : null;

  let auditId: string | null = null;
  try {
    const { data: auditRow, error: auditErr } = await supabase
      .from("link_audit")
      .insert({
        property_id: propertyId,
        audited_by: operator,
        total_backlinks: metrics?.total_backlinks ?? null,
        live_backlinks: liveBacklinks,
        total_rds: metrics?.total_rds ?? null,
        live_rds: liveRds,
        spam_rds: spamRdsCount,
        toxic_pct: toxicPct,
        topline_findings: toplineFindings,
        ahrefs_cost_units: costUnits,
        duration_ms: durationMs,
      })
      .select("id")
      .single();
    if (auditErr) {
      ingestErrors.push(`link_audit insert: ${auditErr.message}`);
    } else {
      auditId = (auditRow?.id as string) ?? null;
    }
  } catch (e) {
    ingestErrors.push(
      `link_audit insert threw: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // 7. Bust cache so the next render shows everything.
  bust(slug);

  if (!auditId) {
    return {
      ok: false,
      error: `Audit completed but recording failed: ${ingestErrors.join("; ") || "unknown"}`,
    };
  }

  return {
    ok: true,
    auditId,
    costUnits,
    liveRds,
    spamRds: spamRdsCount,
    disavowAutoFlagged,
    partial,
  };
}

// Record a failed-audit link_audit row so operators see the run attempted.
async function safeInsertAuditFailure(
  propertyId: string,
  mode: AuditMode,
  capUnits: number,
  errorMessage: string,
): Promise<void> {
  try {
    await supabase.from("link_audit").insert({
      property_id: propertyId,
      audited_by: getOperator(),
      ahrefs_cost_units: 0,
      duration_ms: 0,
      topline_findings: {
        mode,
        cap_units: capUnits,
        partial: false,
        error: errorMessage,
      },
    });
  } catch {
    // Best-effort. If even this fails, we surface via the action return.
  }
}
