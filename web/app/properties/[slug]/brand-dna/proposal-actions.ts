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
import { getOperator } from "@/lib/operator";
import {
  normalizeSeedKeyword,
  type SeedKeywordIntent,
  type SeedKeywordPriority,
} from "@/lib/seed-keywords";

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

  // seed_keywords no longer lives in brand_dna_section (the CHECK
  // constraint never accepted that value anyway). Route to the
  // dedicated property_seed_keyword table.
  if (section === "seed_keywords") {
    return applySeedKeywordItems(propertySlug, items, mode);
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
 *  array if the section doesn't exist yet. seed_keywords now lives in
 *  its own table; read from there instead of brand_dna_section. */
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

  if (sectionKey === "seed_keywords") {
    const { data } = await supabase
      .from("property_seed_keyword")
      .select("keyword, category, seed_category, intent, priority")
      .eq("property_id", prop.id);
    return data ?? [];
  }

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

/** Map a chatbot-proposed seed keyword row to the property_seed_keyword
 *  shape. Items typically come in like:
 *    { keyword: "group transport for corporate events",
 *      intent: "informational",
 *      priority: "high",
 *      notes: "Corporate Event Coordinator — awareness stage" }
 *  We keep keyword/intent/priority verbatim, parse the notes prefix
 *  before any em-dash as the category (persona name in practice),
 *  and tag seed_category as 'persona' since these flow from persona
 *  journey fields. Operator can re-categorize in the editor after. */
function shapeSeedKeywordItem(
  item: unknown,
): {
  keyword: string;
  category: string | null;
  seed_category: string;
  intent: SeedKeywordIntent | null;
  priority: SeedKeywordPriority;
} | null {
  if (!item || typeof item !== "object") return null;
  const r = item as Record<string, unknown>;
  const kw = normalizeSeedKeyword(String(r.keyword ?? ""));
  if (!kw) return null;
  const intentRaw = String(r.intent ?? "").toLowerCase();
  const validIntents: SeedKeywordIntent[] = [
    "informational",
    "commercial",
    "transactional",
    "navigational",
  ];
  const intent: SeedKeywordIntent | null = validIntents.includes(
    intentRaw as SeedKeywordIntent,
  )
    ? (intentRaw as SeedKeywordIntent)
    : null;
  const priorityRaw = String(r.priority ?? "medium").toLowerCase();
  const priority: SeedKeywordPriority =
    priorityRaw === "high" || priorityRaw === "low" ? priorityRaw : "medium";
  // Parse "Persona Name — context" → category = "Persona Name"
  const notes = String(r.notes ?? "").trim();
  const category =
    notes.length > 0
      ? notes.split(/\s+[-—]\s+/, 1)[0].trim() || null
      : null;
  return {
    keyword: kw,
    category,
    seed_category: "persona",
    intent,
    priority,
  };
}

async function applySeedKeywordItems(
  propertySlug: string,
  items: unknown[],
  mode: "append" | "replace",
): Promise<Ok | Err> {
  const { data: prop } = await supabase
    .from("property")
    .select("id")
    .eq("slug", propertySlug)
    .single();
  if (!prop) return { ok: false, error: "Property not found." };

  const shaped = items
    .map(shapeSeedKeywordItem)
    .filter((x): x is NonNullable<ReturnType<typeof shapeSeedKeywordItem>> => x !== null);
  if (shaped.length === 0) {
    return { ok: false, error: "No usable seed keyword rows in the proposal." };
  }

  const operator = getOperator();

  if (mode === "replace") {
    const { error: delErr } = await supabase
      .from("property_seed_keyword")
      .delete()
      .eq("property_id", prop.id);
    if (delErr) return { ok: false, error: delErr.message };
  }

  // On-conflict-do-nothing semantics: read existing keywords first,
  // insert only the new ones. Avoids 23505 errors interrupting batch
  // application of a multi-row chatbot proposal.
  const { data: existing } = await supabase
    .from("property_seed_keyword")
    .select("keyword")
    .eq("property_id", prop.id);
  const existingKeywords = new Set(
    (existing ?? []).map((r: { keyword: string }) => r.keyword),
  );
  const newRows = shaped
    .filter((r) => !existingKeywords.has(r.keyword))
    .map((r) => ({
      property_id: prop.id,
      keyword: r.keyword,
      category: r.category,
      seed_category: r.seed_category,
      intent: r.intent,
      priority: r.priority,
      source: "operator" as const,
      created_by: operator,
      updated_by: operator,
    }));

  if (newRows.length === 0) {
    return {
      ok: true,
      summary: `All ${shaped.length} keyword${shaped.length === 1 ? "" : "s"} already present, nothing to add.`,
    };
  }
  const { error } = await supabase
    .from("property_seed_keyword")
    .insert(newRows);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/properties/${propertySlug}/brand-dna`);
  revalidatePath(`/properties/${propertySlug}/brand-dna/seed-keywords`);
  revalidatePath(`/properties/${propertySlug}`, "layout");

  const skipped = shaped.length - newRows.length;
  return {
    ok: true,
    summary:
      mode === "replace"
        ? `Replaced seed keywords with ${newRows.length} row${newRows.length === 1 ? "" : "s"}.`
        : `Appended ${newRows.length} seed keyword${newRows.length === 1 ? "" : "s"}${
            skipped > 0 ? ` (${skipped} already present)` : ""
          }.`,
  };
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
