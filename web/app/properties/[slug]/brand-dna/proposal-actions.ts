"use server";

// Apply a Brand DNA Assistant proposal. The assistant generates proposals
// via Anthropic tool use (see /api/brand-dna/ask/[slug]/route.ts); the user
// clicks Apply on the inline card; this action dispatches based on the
// tool name and calls the existing write helpers.
//
// Object-shape sections (identity, voice_tone, future_audience,
// site_structure, goals) → upsertBrandDnaField per key.
// Array-shape sections (personas, offerings, brand_terms, proof,
// seed_keywords) → upsertBrandDnaField with the merged items array.
// Project Brain → createBrainEntry.

import { supabase } from "@/lib/supabase";
import { requireWriteToken } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { upsertBrandDnaField } from "@/app/properties/[slug]/brand-dna/actions";
import { createBrainEntry } from "@/app/properties/[slug]/project-brain/actions";

const OBJECT_SECTIONS = new Set([
  "identity",
  "voice_tone",
  "future_audience",
  "site_structure",
  "goals",
]);

const ARRAY_SECTIONS = new Set([
  "personas",
  "offerings",
  "brand_terms",
  "proof",
  "seed_keywords",
]);

type Ok = { ok: true; summary: string };
type Err = { ok: false; error: string };

export type ProposalInput = {
  tool: string;
  input: Record<string, unknown>;
};

export async function applyBrandDnaProposal(
  propertySlug: string,
  proposal: ProposalInput,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;

  try {
    switch (proposal.tool) {
      case "update_brand_field":
        return await applyUpdateBrandField(propertySlug, proposal.input);
      case "update_brand_items":
        return await applyUpdateBrandItems(propertySlug, proposal.input);
      case "add_brain_entry":
        return await applyAddBrainEntry(propertySlug, proposal.input);
      default:
        return { ok: false, error: `Unknown tool: ${proposal.tool}` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function applyUpdateBrandField(
  propertySlug: string,
  input: Record<string, unknown>,
): Promise<Ok | Err> {
  const section = String(input.section ?? "");
  const fields = input.fields as Record<string, unknown> | undefined;
  if (!OBJECT_SECTIONS.has(section)) {
    return { ok: false, error: `Section ${section} doesn't take fields.` };
  }
  if (!fields || typeof fields !== "object") {
    return { ok: false, error: "fields object missing." };
  }
  const keys = Object.keys(fields);
  if (keys.length === 0) {
    return { ok: false, error: "No fields to set." };
  }

  for (const key of keys) {
    const res = await upsertBrandDnaField(
      propertySlug,
      section,
      key,
      fields[key],
    );
    if (!res.ok) {
      return { ok: false, error: `Field "${key}": ${res.error}` };
    }
  }
  return {
    ok: true,
    summary: `Updated ${keys.length} field${keys.length === 1 ? "" : "s"} on ${section}.`,
  };
}

async function applyUpdateBrandItems(
  propertySlug: string,
  input: Record<string, unknown>,
): Promise<Ok | Err> {
  const section = String(input.section ?? "");
  const mode = String(input.mode ?? "append");
  const items = input.items;
  if (!ARRAY_SECTIONS.has(section)) {
    return { ok: false, error: `Section ${section} isn't row-based.` };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "items array missing or empty." };
  }
  if (mode !== "append" && mode !== "replace") {
    return { ok: false, error: `Invalid mode: ${mode}` };
  }

  // For brand_terms, the array key is different (branded_terms + exceptions).
  // Per the existing schema, brand_terms section has TWO arrays. We only
  // support proposing into branded_terms via this tool — exceptions stays
  // manual. The model is instructed accordingly via the tool description.
  const contentKey = section === "brand_terms" ? "branded_terms" : "items";

  // Resolve property → section → existing items, then merge / replace.
  const { data: prop } = await supabase
    .from("property")
    .select("id")
    .eq("slug", propertySlug)
    .single();
  if (!prop) return { ok: false, error: "Property not found." };

  const { data: existing } = await supabase
    .from("brand_dna_section")
    .select("content")
    .eq("property_id", prop.id)
    .eq("section", section)
    .maybeSingle();

  const existingItems =
    existing &&
    existing.content &&
    Array.isArray((existing.content as Record<string, unknown>)[contentKey])
      ? ((existing.content as Record<string, unknown>)[contentKey] as unknown[])
      : [];

  const nextItems =
    mode === "replace" ? items : [...existingItems, ...items];

  const res = await upsertBrandDnaField(
    propertySlug,
    section,
    contentKey,
    nextItems,
  );
  if (!res.ok) return { ok: false, error: res.error };

  return {
    ok: true,
    summary:
      mode === "replace"
        ? `Replaced ${section} with ${items.length} row${items.length === 1 ? "" : "s"}.`
        : `Appended ${items.length} row${items.length === 1 ? "" : "s"} to ${section}.`,
  };
}

/** Read the current items array for a row-based section so the proposal
 *  card can preview what Replace-mode will overwrite. Returns an empty
 *  array if the section doesn't exist yet. */
export async function getSectionItems(
  propertySlug: string,
  sectionKey: string,
): Promise<unknown[]> {
  const authed = await requireWriteToken();
  if (!authed.ok) return [];
  if (!ARRAY_SECTIONS.has(sectionKey)) return [];

  const { data: prop } = await supabase
    .from("property")
    .select("id")
    .eq("slug", propertySlug)
    .single();
  if (!prop) return [];

  const { data } = await supabase
    .from("brand_dna_section")
    .select("content")
    .eq("property_id", prop.id)
    .eq("section", sectionKey)
    .maybeSingle();
  if (!data?.content) return [];
  const contentKey = sectionKey === "brand_terms" ? "branded_terms" : "items";
  const v = (data.content as Record<string, unknown>)[contentKey];
  return Array.isArray(v) ? v : [];
}

async function applyAddBrainEntry(
  propertySlug: string,
  input: Record<string, unknown>,
): Promise<Ok | Err> {
  const type = String(input.type ?? "");
  const title = String(input.title ?? "");
  const body = String(input.body ?? "");
  const confidence =
    typeof input.confidence === "number" ? input.confidence : null;
  const res = await createBrainEntry(propertySlug, {
    type,
    title,
    body,
    source: "ai:assistant",
    confidence,
  });
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath(`/properties/${propertySlug}/brand-dna`, "layout");
  return { ok: true, summary: `Added Project Brain entry: "${title}".` };
}
