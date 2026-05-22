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
