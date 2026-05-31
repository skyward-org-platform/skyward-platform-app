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

// ─── runLinkAudit (v1 stub) ────────────────────────────────────────────────
// Ahrefs MCP isn't reachable from a server action. Stub records an audit
// row with a topline_findings note so the Audits tab still shows the run.
export async function runLinkAudit(
  slug: string,
  costCapUnits = 2000,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const propertyId = await resolvePropertyId(slug);
  if (!propertyId) return { ok: false, error: "property not found" };
  try {
    const { error } = await supabase.from("link_audit").insert({
      property_id: propertyId,
      audited_by: getOperator(),
      topline_findings: {
        note:
          "ingest not yet implemented; ran the Python script instead",
        requested_cost_cap_units: costCapUnits,
      },
    });
    if (error) return { ok: false, error: error.message };
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
