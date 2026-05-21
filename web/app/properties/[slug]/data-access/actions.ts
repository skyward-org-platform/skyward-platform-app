"use server";

// Server actions for the Data Access tab.
//
// BQ-backed sources (GSC, GMB, GA4, Facebook) are read-only on this page —
// the source of truth is skyward-common's Meta.client_datasets, surfaced
// via /api/data-access/sources. Edits flow through the admin portal's
// MetaClient CRUD.
//
// Non-BQ sources (Google Ads ID, Screaming Frog crawl, Client Keyword Data)
// live in property.data_access jsonb. This action upserts a single field.

import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { requireWriteToken } from "@/lib/auth";
import { apiBase } from "@/lib/api-base";

const VALID_LOCAL_SOURCES = new Set(["ads", "crawl", "keywords"] as const);
const VALID_FIELDS = new Set(["status", "property_id", "notes"] as const);

type Ok = { ok: true };
type Err = { ok: false; error: string };

export async function updateDataAccessField(
  propertySlug: string,
  source: string,
  fieldKey: string,
  value: string,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;

  if (!VALID_LOCAL_SOURCES.has(source as "ads" | "crawl" | "keywords")) {
    return {
      ok: false,
      error: `Source ${source} isn't writable here — BQ-backed sources live in Meta.client_datasets and are edited via skyward-common.`,
    };
  }
  if (!VALID_FIELDS.has(fieldKey as "status" | "property_id" | "notes")) {
    return { ok: false, error: `Invalid field: ${fieldKey}` };
  }

  const { data: prop, error: readErr } = await supabase
    .from("property")
    .select("id, data_access")
    .eq("slug", propertySlug)
    .single();
  if (readErr || !prop) {
    return { ok: false, error: readErr?.message ?? "Property not found." };
  }

  const current = (prop.data_access ?? {}) as Record<string, unknown>;
  const sourceConfig = {
    ...((current[source] as Record<string, unknown>) ?? {}),
  };
  const trimmed = value.trim();
  if (trimmed === "") {
    delete sourceConfig[fieldKey];
  } else {
    sourceConfig[fieldKey] = trimmed;
  }

  const nextDataAccess = { ...current, [source]: sourceConfig };

  const { error: updErr } = await supabase
    .from("property")
    .update({ data_access: nextDataAccess })
    .eq("id", prop.id);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath(`/properties/${propertySlug}/data-access`);
  return { ok: true };
}

const BQ_TYPES = new Set(["gsc", "gmb", "ga4", "facebook"] as const);

type RegisterOk = { ok: true; status: string; warning: string | null };
type RegisterErr = { ok: false; error: string };

/** Register a BQ dataset for the property's client via skyward-common's
 *  MetaClient.add_client_dataset. The property's primary_domain is the
 *  resolution key — it drives client lookup in Meta.client_domains. */
export async function registerClientDataset(
  propertySlug: string,
  fields: {
    dataset_type: string;
    dataset_id: string;
    hostname?: string;
    notes?: string;
  },
): Promise<RegisterOk | RegisterErr> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;

  if (!BQ_TYPES.has(fields.dataset_type as "gsc" | "gmb" | "ga4" | "facebook")) {
    return { ok: false, error: `Unknown dataset_type: ${fields.dataset_type}` };
  }
  const datasetId = fields.dataset_id.trim();
  if (!datasetId) {
    return { ok: false, error: "Dataset ID is required." };
  }

  const { data: prop, error: propErr } = await supabase
    .from("property")
    .select("primary_domain")
    .eq("slug", propertySlug)
    .single();
  if (propErr || !prop?.primary_domain) {
    return {
      ok: false,
      error: "Property has no primary_domain — can't resolve to a client.",
    };
  }

  const token = process.env.APP_WRITE_TOKEN;
  try {
    const res = await fetch(`${apiBase()}/api/data-access/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        domain: prop.primary_domain,
        dataset_id: datasetId,
        dataset_type: fields.dataset_type,
        hostname: fields.hostname?.trim() || undefined,
        notes: fields.notes?.trim() || undefined,
      }),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || !body.ok) {
      return {
        ok: false,
        error: (body.error as string) ?? `HTTP ${res.status}`,
      };
    }
    revalidatePath(`/properties/${propertySlug}/data-access`);
    return {
      ok: true,
      status: (body.status as string) ?? "added",
      warning: (body.warning as string | null) ?? null,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
