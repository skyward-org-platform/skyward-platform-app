"use server";

// Phase 6 Tracking server actions. Annotation CRUD + a manual Ahrefs
// current-snapshot refresh (history backfill stays in the Python script
// because the per-property history call cost is too high to run from
// the UI).

import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { requireWriteToken } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import type { AnnotationKind } from "@/lib/tracking";

type Ok<T = Record<string, never>> = { ok: true } & T;
type Err = { ok: false; error: string };

const ALLOWED_KINDS: AnnotationKind[] = [
  "publish",
  "refresh",
  "redirect",
  "technical_fix",
  "brand_change",
  "algo_update",
  "external_event",
  "other",
];

async function resolvePropertyId(slug: string): Promise<string | null> {
  const { data } = await supabase
    .from("property")
    .select("id")
    .eq("slug", slug)
    .single();
  return data?.id ?? null;
}

export async function createAnnotation(
  propertySlug: string,
  input: {
    occurred_at: string;
    kind: AnnotationKind;
    title: string;
    body?: string;
    applied_to_url?: string;
    applied_to_keyword?: string;
  },
): Promise<Ok<{ id: string }> | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;

  const title = input.title.trim();
  if (!title) return { ok: false, error: "Title is required." };
  if (!ALLOWED_KINDS.includes(input.kind)) {
    return { ok: false, error: `Invalid kind "${input.kind}".` };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurred_at)) {
    return { ok: false, error: "occurred_at must be ISO date YYYY-MM-DD." };
  }

  const propertyId = await resolvePropertyId(propertySlug);
  if (!propertyId) return { ok: false, error: "Property not found." };

  const operator = getOperator();
  const body = input.body && input.body.trim().length > 0 ? input.body.trim() : null;
  const appliedUrl =
    input.applied_to_url && input.applied_to_url.trim().length > 0
      ? input.applied_to_url.trim()
      : null;
  const appliedKw =
    input.applied_to_keyword && input.applied_to_keyword.trim().length > 0
      ? input.applied_to_keyword.trim().toLowerCase()
      : null;

  const { data, error } = await supabase
    .from("change_annotation")
    .insert({
      property_id: propertyId,
      occurred_at: input.occurred_at,
      kind: input.kind,
      title,
      body,
      applied_to_url: appliedUrl,
      applied_to_keyword: appliedKw,
      source: "operator",
      created_by: operator,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Insert failed." };
  }
  revalidatePath(`/properties/${propertySlug}/tracking`);
  return { ok: true, id: data.id };
}

// ── Ahrefs current-snapshot refresh ────────────────────────────────────

const AHREFS_BASE = "https://api.ahrefs.com/v3";
const REFRESH_UNIT_CAP = 500;

type AhrefsCostBody = {
  apiUsageCosts?: {
    "units-cost-total-actual"?: number;
    "units-cost-total"?: number;
  };
};

function extractUnits(body: unknown): number {
  if (!body || typeof body !== "object") return 0;
  const costs = (body as AhrefsCostBody).apiUsageCosts;
  if (!costs) return 0;
  const actual = costs["units-cost-total-actual"];
  if (typeof actual === "number") return actual;
  const total = costs["units-cost-total"];
  if (typeof total === "number") return total;
  return 0;
}

function asNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asInt(v: unknown): number | null {
  const n = asNum(v);
  return n === null ? null : Math.round(n);
}

function pickObj(body: unknown, key: string): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const v = (body as Record<string, unknown>)[key];
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

async function ahrefsFetch(
  apiKey: string,
  path: string,
  params: Record<string, string>,
): Promise<{ body: unknown; units: number }> {
  const url = new URL(`${AHREFS_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const text = await resp.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Ahrefs ${path} non-JSON ${resp.status}: ${text.slice(0, 200)}`);
  }
  if (!resp.ok) {
    const msg =
      body && typeof body === "object" && "error" in body
        ? String((body as Record<string, unknown>).error)
        : `HTTP ${resp.status}`;
    throw new Error(`Ahrefs ${path} failed: ${msg}`);
  }
  return { body, units: extractUnits(body) };
}

export async function refreshAhrefsMetrics(
  propertySlug: string,
): Promise<
  | Ok<{
      snapshotDate: string;
      units: number;
      drCurrent: number | null;
      rdsCurrent: number | null;
      kwsCurrent: number | null;
      trafficCurrent: number | null;
    }>
  | Err
> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;

  const apiKey = process.env.AHREFS_API_KEY;
  if (!apiKey) return { ok: false, error: "AHREFS_API_KEY not configured." };

  const { data: prop, error: propErr } = await supabase
    .from("property")
    .select("id, primary_domain")
    .eq("slug", propertySlug)
    .single();
  if (propErr || !prop) return { ok: false, error: "Property not found." };
  const domain: string | null = prop.primary_domain;
  if (!domain) {
    return { ok: false, error: "Property has no primary_domain set." };
  }

  const today = new Date().toISOString().slice(0, 10);
  let units = 0;

  let metricsBody: unknown = null;
  try {
    const r = await ahrefsFetch(apiKey, "/site-explorer/metrics", {
      target: domain,
      mode: "domain",
      country: "au",
      date: today,
      protocol: "both",
    });
    metricsBody = r.body;
    units += r.units;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (units >= REFRESH_UNIT_CAP) {
    return {
      ok: false,
      error: `Ahrefs cost cap reached (${units}/${REFRESH_UNIT_CAP}) after first call.`,
    };
  }

  let statsBody: unknown = null;
  try {
    const r = await ahrefsFetch(apiKey, "/site-explorer/backlinks-stats", {
      target: domain,
      mode: "domain",
      date: today,
      protocol: "both",
    });
    statsBody = r.body;
    units += r.units;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (units >= REFRESH_UNIT_CAP) {
    return {
      ok: false,
      error: `Ahrefs cost cap reached (${units}/${REFRESH_UNIT_CAP}) after second call.`,
    };
  }

  let drBody: unknown = null;
  try {
    const r = await ahrefsFetch(apiKey, "/site-explorer/domain-rating", {
      target: domain,
      mode: "domain",
      date: today,
      protocol: "both",
    });
    drBody = r.body;
    units += r.units;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (units > REFRESH_UNIT_CAP) {
    return {
      ok: false,
      error: `Ahrefs cost cap exceeded (${units}/${REFRESH_UNIT_CAP}).`,
    };
  }

  const m =
    pickObj(metricsBody, "metrics") ??
    (metricsBody && typeof metricsBody === "object"
      ? (metricsBody as Record<string, unknown>)
      : {});
  const s =
    pickObj(statsBody, "stats") ??
    pickObj(statsBody, "metrics") ??
    (statsBody && typeof statsBody === "object"
      ? (statsBody as Record<string, unknown>)
      : {});
  const d =
    pickObj(drBody, "domain_rating") ??
    (drBody && typeof drBody === "object"
      ? (drBody as Record<string, unknown>)
      : {});

  const organicKeywords =
    asInt(m["org_keywords"]) ?? asInt(m["organic_keywords"]);
  const organicTraffic =
    asInt(m["org_traffic"]) ?? asInt(m["organic_traffic"]);
  const organicCost = asNum(m["org_cost"]) ?? asNum(m["organic_cost"]);
  const backlinksTotal =
    asInt(s["live"]) ?? asInt(s["live_backlinks"]) ?? asInt(m["backlinks"]);
  const referringDomains =
    asInt(s["live_refdomains"]) ??
    asInt(s["refdomains_live"]) ??
    asInt(m["refdomains"]);
  const domainRating =
    asNum(d["domain_rating"]) ??
    asNum(m["domain_rating"]) ??
    asNum(s["domain_rating"]);

  const payload = {
    property_id: prop.id as string,
    scope: "site",
    scope_id: null as string | null,
    captured_date: today,
    source: "ahrefs",
    domain_rating: domainRating,
    referring_domains: referringDomains,
    organic_keywords: organicKeywords,
    organic_traffic: organicTraffic,
    organic_traffic_value_cents:
      organicCost !== null ? Math.round(organicCost) : null,
    backlinks_total: backlinksTotal,
  };

  // Check-then-write because the unique index uses COALESCE(scope_id, '').
  const { data: existing, error: selErr } = await supabase
    .from("metric_snapshot")
    .select("id")
    .eq("property_id", prop.id)
    .eq("scope", "site")
    .is("scope_id", null)
    .eq("captured_date", today)
    .eq("source", "ahrefs")
    .limit(1);
  if (selErr) return { ok: false, error: selErr.message };

  if (existing && existing.length > 0) {
    const { error: updErr } = await supabase
      .from("metric_snapshot")
      .update(payload)
      .eq("id", existing[0].id);
    if (updErr) return { ok: false, error: updErr.message };
  } else {
    const { error: insErr } = await supabase
      .from("metric_snapshot")
      .insert(payload);
    if (insErr) return { ok: false, error: insErr.message };
  }

  revalidatePath(`/properties/${propertySlug}/tracking`);

  return {
    ok: true,
    snapshotDate: today,
    units,
    drCurrent: domainRating,
    rdsCurrent: referringDomains,
    kwsCurrent: organicKeywords,
    trafficCurrent: organicTraffic,
  };
}

export async function deleteAnnotation(
  propertySlug: string,
  annotationId: string,
): Promise<{ ok: true } | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const propertyId = await resolvePropertyId(propertySlug);
  if (!propertyId) return { ok: false, error: "Property not found." };

  const { error } = await supabase
    .from("change_annotation")
    .delete()
    .eq("id", annotationId)
    .eq("property_id", propertyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/properties/${propertySlug}/tracking`);
  return { ok: true };
}
