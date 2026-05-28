"use server";

// Phase 6 Tracking server actions. Annotation CRUD only — metric_snapshot
// writes are handled by upstream ingestion jobs (GA4 / GSC / Ahrefs),
// never via the UI.

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
