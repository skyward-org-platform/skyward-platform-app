"use server";

// Upsert-style write action for the bespoke Brand DNA form pages (Identity,
// Voice & Tone). Resolves property → section, creates the section row on
// first save, then merges a single content field. Mirrors the trigger-driven
// history snapshot via the standard brand_dna_section UPDATE path.
//
// The dynamic [section] editor still uses updateBrandDnaContentKey for its
// click-to-edit JSON flow — this action is separate so the form pages don't
// need to await a server-side row creation before they render.

import { revalidatePath, revalidateTag } from "next/cache";
import { supabase } from "@/lib/supabase";
import { requireWriteToken } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import { CACHE_TAGS } from "@/lib/cache";
import { apiBase } from "@/lib/api-base";
import {
  normalizeCompetitorDomain,
  type CompetitorPriority,
} from "@/lib/competitors";
import {
  normalizeSeedKeyword,
  type SeedKeywordIntent,
  type SeedKeywordPriority,
} from "@/lib/seed-keywords";

type Ok = { ok: true; sectionId: string };
type Err = { ok: false; error: string };

export async function upsertBrandDnaField(
  propertySlug: string,
  sectionKey: string,
  fieldKey: string,
  newValue: unknown,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;

  const { data: prop, error: propErr } = await supabase
    .from("property")
    .select("id")
    .eq("slug", propertySlug)
    .single();
  if (propErr || !prop) {
    return { ok: false, error: "Property not found." };
  }

  const operator = getOperator();
  const now = new Date().toISOString();

  const { data: existing, error: readErr } = await supabase
    .from("brand_dna_section")
    .select("id, content")
    .eq("property_id", prop.id)
    .eq("section", sectionKey)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };

  if (!existing) {
    const { data: created, error: insertErr } = await supabase
      .from("brand_dna_section")
      .insert({
        property_id: prop.id,
        section: sectionKey,
        content: { [fieldKey]: newValue },
        source: "ui:brand-dna",
        updated_by: operator,
        updated_at: now,
      })
      .select("id")
      .single();
    if (insertErr || !created) {
      return { ok: false, error: insertErr?.message ?? "Insert failed." };
    }
    revalidateTag(CACHE_TAGS.brandDna);
    revalidateTag(CACHE_TAGS.signals);
    revalidatePath(`/properties/${propertySlug}/brand-dna`, "layout");
    return { ok: true, sectionId: created.id };
  }

  const nextContent = {
    ...((existing.content as Record<string, unknown>) ?? {}),
    [fieldKey]: newValue,
  };
  const { error: updErr } = await supabase
    .from("brand_dna_section")
    .update({
      content: nextContent,
      updated_by: operator,
      updated_at: now,
    })
    .eq("id", existing.id);
  if (updErr) return { ok: false, error: updErr.message };
  revalidateTag(CACHE_TAGS.brandDna);
  revalidateTag(CACHE_TAGS.signals);
  revalidatePath(`/properties/${propertySlug}/brand-dna`, "layout");
  return { ok: true, sectionId: existing.id };
}

// ─── Competitor CRUD ───────────────────────────────────────────────────────
// Operator-owned via property_competitor. BQ Meta is the seed via the
// importCompetitorsFromBqMeta action; ongoing CRUD lives here.

type CompetitorOk = { ok: true };
type CompetitorErr = { ok: false; error: string };

async function resolvePropertyId(slug: string): Promise<string | null> {
  const { data } = await supabase
    .from("property")
    .select("id")
    .eq("slug", slug)
    .single();
  return data?.id ?? null;
}

function revalidateCompetitors(propertySlug: string) {
  revalidateTag(CACHE_TAGS.brandDna);
  // Same three-path coverage as seed keywords - the Overview reads
  // hasCompetitors() directly so needs its own path bust.
  revalidatePath(`/properties/${propertySlug}/brand-dna`);
  revalidatePath(`/properties/${propertySlug}/brand-dna/competitors`);
  revalidatePath(`/properties/${propertySlug}`, "layout");
}

export async function addCompetitor(
  propertySlug: string,
  rawDomain: string,
  priority: CompetitorPriority,
  notes: string | null,
): Promise<CompetitorOk | CompetitorErr> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const domain = normalizeCompetitorDomain(rawDomain);
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    return { ok: false, error: "Invalid domain. Use host only, e.g. example.com" };
  }
  const propertyId = await resolvePropertyId(propertySlug);
  if (!propertyId) return { ok: false, error: "Property not found." };

  const operator = getOperator();
  const { error } = await supabase.from("property_competitor").insert({
    property_id: propertyId,
    domain,
    priority,
    notes: notes && notes.trim().length > 0 ? notes.trim() : null,
    source: "operator",
    created_by: operator,
    updated_by: operator,
  });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: `${domain} is already on the competitor list.` };
    }
    return { ok: false, error: error.message };
  }
  revalidateCompetitors(propertySlug);
  return { ok: true };
}

export async function updateCompetitor(
  propertySlug: string,
  competitorId: string,
  patch: { priority?: CompetitorPriority; notes?: string | null },
): Promise<CompetitorOk | CompetitorErr> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const update: Record<string, unknown> = { updated_by: getOperator() };
  if (patch.priority !== undefined) update.priority = patch.priority;
  if (patch.notes !== undefined) {
    update.notes =
      patch.notes && patch.notes.trim().length > 0 ? patch.notes.trim() : null;
  }
  const { error } = await supabase
    .from("property_competitor")
    .update(update)
    .eq("id", competitorId);
  if (error) return { ok: false, error: error.message };
  revalidateCompetitors(propertySlug);
  return { ok: true };
}

export async function removeCompetitor(
  propertySlug: string,
  competitorId: string,
): Promise<CompetitorOk | CompetitorErr> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const { error } = await supabase
    .from("property_competitor")
    .delete()
    .eq("id", competitorId);
  if (error) return { ok: false, error: error.message };
  revalidateCompetitors(propertySlug);
  return { ok: true };
}

/** One-shot seeding from BQ Meta. Hits the existing Python API to read
 *  the BQ rows, then inserts each as source='bq_meta_import'. Existing
 *  Supabase rows are NOT overwritten - duplicates are skipped via the
 *  unique (property_id, domain) constraint. Safe to re-run. */
export async function importCompetitorsFromBqMeta(
  propertySlug: string,
): Promise<{ ok: true; imported: number; skipped: number } | CompetitorErr> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const propertyId = await resolvePropertyId(propertySlug);
  if (!propertyId) return { ok: false, error: "Property not found." };

  let bqRows: {
    domain: string;
    priority: string | null;
    notes: string | null;
  }[] = [];
  try {
    const r = await fetch(
      `${apiBase()}/api/properties/${propertySlug}/competitors`,
      { cache: "no-store" },
    );
    if (!r.ok) return { ok: false, error: `BQ Meta fetch failed (${r.status}).` };
    const j = (await r.json()) as { competitors: typeof bqRows };
    bqRows = j.competitors ?? [];
  } catch (e) {
    return { ok: false, error: `BQ Meta fetch error: ${(e as Error).message}` };
  }
  if (bqRows.length === 0) {
    return { ok: true, imported: 0, skipped: 0 };
  }

  const operator = getOperator();
  const validPriorities: CompetitorPriority[] = ["high", "medium", "low"];
  const inserts = bqRows
    .map((r) => ({
      property_id: propertyId,
      domain: normalizeCompetitorDomain(r.domain ?? ""),
      priority: (validPriorities.includes(
        (r.priority ?? "").toLowerCase() as CompetitorPriority,
      )
        ? (r.priority ?? "").toLowerCase()
        : "medium") as CompetitorPriority,
      notes: r.notes ?? null,
      source: "bq_meta_import" as const,
      created_by: operator,
      updated_by: operator,
    }))
    .filter((r) => r.domain.length > 0);

  // Insert with on-conflict-do-nothing semantics: read existing domains
  // first, then insert only the new ones. (Supabase JS doesn't expose
  // a clean upsert-ignore for unique constraints, so we split it.)
  const { data: existing } = await supabase
    .from("property_competitor")
    .select("domain")
    .eq("property_id", propertyId);
  const existingDomains = new Set(
    (existing ?? []).map((r: { domain: string }) => r.domain),
  );
  const newRows = inserts.filter((r) => !existingDomains.has(r.domain));
  if (newRows.length === 0) {
    revalidateCompetitors(propertySlug);
    return { ok: true, imported: 0, skipped: inserts.length };
  }
  const { error } = await supabase.from("property_competitor").insert(newRows);
  if (error) return { ok: false, error: error.message };
  revalidateCompetitors(propertySlug);
  return {
    ok: true,
    imported: newRows.length,
    skipped: inserts.length - newRows.length,
  };
}

// ─── Seed keyword CRUD ─────────────────────────────────────────────────────
// Operator-owned via property_seed_keyword. BQ SEOPipeline.seed_keywords
// is the legacy seed via the importSeedKeywordsFromBq action.

type SeedKwOk = { ok: true };
type SeedKwErr = { ok: false; error: string };

function revalidateSeedKeywords(propertySlug: string) {
  revalidateTag(CACHE_TAGS.brandDna);
  // Three explicit paths because the Brand DNA Overview reads
  // hasSeedKeywords() directly (no fetch tag), so a tag bust alone
  // doesn't catch it. Each path covers a different surface:
  //   - /brand-dna             - Overview (completeness checklist)
  //   - /brand-dna/seed-keywords - editor page itself
  //   - /properties/[slug]     - layout (hero badge + phase strip)
  revalidatePath(`/properties/${propertySlug}/brand-dna`);
  revalidatePath(`/properties/${propertySlug}/brand-dna/seed-keywords`);
  revalidatePath(`/properties/${propertySlug}`, "layout");
}

export async function addSeedKeyword(
  propertySlug: string,
  rawKeyword: string,
  fields: {
    category: string | null;
    seedCategory: string | null;
    intent: SeedKeywordIntent | null;
    priority: SeedKeywordPriority;
  },
): Promise<SeedKwOk | SeedKwErr> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const keyword = normalizeSeedKeyword(rawKeyword);
  if (!keyword) return { ok: false, error: "Keyword cannot be empty." };
  const propertyId = await resolvePropertyId(propertySlug);
  if (!propertyId) return { ok: false, error: "Property not found." };

  const operator = getOperator();
  const { error } = await supabase.from("property_seed_keyword").insert({
    property_id: propertyId,
    keyword,
    category: fields.category?.trim() || null,
    seed_category: fields.seedCategory?.trim() || null,
    intent: fields.intent,
    priority: fields.priority,
    source: "operator",
    created_by: operator,
    updated_by: operator,
  });
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: `"${keyword}" is already in the seed keyword list.`,
      };
    }
    return { ok: false, error: error.message };
  }
  revalidateSeedKeywords(propertySlug);
  return { ok: true };
}

export async function updateSeedKeyword(
  propertySlug: string,
  seedId: string,
  patch: {
    category?: string | null;
    seedCategory?: string | null;
    intent?: SeedKeywordIntent | null;
    priority?: SeedKeywordPriority;
  },
): Promise<SeedKwOk | SeedKwErr> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const update: Record<string, unknown> = { updated_by: getOperator() };
  if (patch.category !== undefined) {
    update.category = patch.category?.trim() || null;
  }
  if (patch.seedCategory !== undefined) {
    update.seed_category = patch.seedCategory?.trim() || null;
  }
  if (patch.intent !== undefined) update.intent = patch.intent;
  if (patch.priority !== undefined) update.priority = patch.priority;
  const { error } = await supabase
    .from("property_seed_keyword")
    .update(update)
    .eq("id", seedId);
  if (error) return { ok: false, error: error.message };
  revalidateSeedKeywords(propertySlug);
  return { ok: true };
}

export async function removeSeedKeyword(
  propertySlug: string,
  seedId: string,
): Promise<SeedKwOk | SeedKwErr> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const { error } = await supabase
    .from("property_seed_keyword")
    .delete()
    .eq("id", seedId);
  if (error) return { ok: false, error: error.message };
  revalidateSeedKeywords(propertySlug);
  return { ok: true };
}

export async function importSeedKeywordsFromBq(
  propertySlug: string,
): Promise<{ ok: true; imported: number; skipped: number } | SeedKwErr> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const propertyId = await resolvePropertyId(propertySlug);
  if (!propertyId) return { ok: false, error: "Property not found." };

  type BqRow = {
    keyword: string;
    category: string | null;
    seed_category: string | null;
    source: string | null;
    project_id: string | null;
  };
  let bqRows: BqRow[] = [];
  try {
    const r = await fetch(
      `${apiBase()}/api/properties/${propertySlug}/seed-keywords-bq`,
      { cache: "no-store" },
    );
    if (!r.ok) return { ok: false, error: `BQ fetch failed (${r.status}).` };
    const j = (await r.json()) as { seed_keywords: BqRow[] };
    bqRows = j.seed_keywords ?? [];
  } catch (e) {
    return { ok: false, error: `BQ fetch error: ${(e as Error).message}` };
  }
  if (bqRows.length === 0) return { ok: true, imported: 0, skipped: 0 };

  const operator = getOperator();
  const inserts = bqRows
    .map((r) => ({
      property_id: propertyId,
      keyword: normalizeSeedKeyword(r.keyword ?? ""),
      category: r.category?.trim() || null,
      seed_category: r.seed_category?.trim() || null,
      // BQ has no intent / priority - default to commercial / medium so the
      // operator can re-prioritize in the editor.
      intent: "commercial" as SeedKeywordIntent,
      priority: "medium" as SeedKeywordPriority,
      source: "bq_import" as const,
      bq_project_id: r.project_id ?? null,
      created_by: operator,
      updated_by: operator,
    }))
    .filter((r) => r.keyword.length > 0);

  const { data: existing } = await supabase
    .from("property_seed_keyword")
    .select("keyword")
    .eq("property_id", propertyId);
  const existingKeywords = new Set(
    (existing ?? []).map((r: { keyword: string }) => r.keyword),
  );
  const newRows = inserts.filter((r) => !existingKeywords.has(r.keyword));
  if (newRows.length === 0) {
    revalidateSeedKeywords(propertySlug);
    return { ok: true, imported: 0, skipped: inserts.length };
  }
  const { error } = await supabase
    .from("property_seed_keyword")
    .insert(newRows);
  if (error) return { ok: false, error: error.message };
  revalidateSeedKeywords(propertySlug);
  return {
    ok: true,
    imported: newRows.length,
    skipped: inserts.length - newRows.length,
  };
}
