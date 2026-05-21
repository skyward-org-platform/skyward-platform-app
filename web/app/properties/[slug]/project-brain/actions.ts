"use server";

// Server actions for /properties/[slug]/project-brain (v2 screen 16).
// All writes require the APP_WRITE_TOKEN cookie via requireWriteToken().
//
// The underlying schema is db/supabase/migrations/20260506100400_brain.sql:
//   project_brain_entry (id, property_id, type, title, body, tags,
//                        confidence, source, status, superseded_by,
//                        related_entries[], timestamps)
// Existing `type` enum: issue/working/research/preference/strategy/insight
// Existing `status` enum: active/archived/superseded
//
// V2 mockup labels map onto these as documented in
// handoff/design/v2-screens.md screen 16.

import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { requireWriteToken } from "@/lib/auth";

// All 6 type values from the project_brain_entry enum (per the
// 20260506100400_brain.sql migration). Matches the transcript's reference
// taxonomy: issue · working · research · preference · strategy · insight.
const VALID_TYPES = new Set([
  "issue",
  "working",
  "research",
  "preference",
  "strategy",
  "insight",
] as const);

const VALID_STATUS = new Set(["active", "archived"] as const);

type Ok = { ok: true };
type Err = { ok: false; error: string };

async function getPropertyId(
  propertySlug: string,
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase
    .from("property")
    .select("id")
    .eq("slug", propertySlug)
    .single();
  if (error) return { error: error.message };
  if (!data) return { error: `No property ${propertySlug}` };
  return data;
}

export async function createBrainEntry(
  propertySlug: string,
  fields: {
    type: string;
    title: string;
    body: string;
    source?: string;
    confidence?: number | null;
  },
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;

  if (!VALID_TYPES.has(fields.type as never)) {
    return { ok: false, error: `Invalid type: ${fields.type}` };
  }
  if (!fields.title.trim() || !fields.body.trim()) {
    return { ok: false, error: "Title and body are required" };
  }

  const propRes = await getPropertyId(propertySlug);
  if ("error" in propRes) return { ok: false, error: propRes.error };

  const { error } = await supabase.from("project_brain_entry").insert({
    property_id: propRes.id,
    type: fields.type,
    title: fields.title.trim(),
    body: fields.body.trim(),
    source: fields.source ?? "ui:project-brain",
    confidence:
      fields.confidence === null || fields.confidence === undefined
        ? null
        : fields.confidence,
    status: "active",
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/properties/${propertySlug}/project-brain`);
  return { ok: true };
}

export async function updateBrainEntryStatus(
  entryId: string,
  newStatus: string,
  propertySlug: string,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;

  if (!VALID_STATUS.has(newStatus as never)) {
    return { ok: false, error: `Invalid status: ${newStatus}` };
  }

  const { error } = await supabase
    .from("project_brain_entry")
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", entryId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/properties/${propertySlug}/project-brain`);
  return { ok: true };
}

export async function deleteBrainEntry(
  entryId: string,
  propertySlug: string,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;

  const { error } = await supabase
    .from("project_brain_entry")
    .delete()
    .eq("id", entryId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/properties/${propertySlug}/project-brain`);
  return { ok: true };
}
