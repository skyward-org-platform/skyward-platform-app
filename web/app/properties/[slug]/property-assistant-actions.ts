"use server";

// Apply a Property Assistant proposal. The assistant's bulk tools (see
// web/lib/property-assistant/tools.ts) don't auto-execute — the route
// handler emits a proposal SSE event and the chat UI renders an inline
// "Apply" card. When the operator clicks Apply, this dispatcher routes
// the proposal back to the existing server action that owns the write.
//
// The 6 bulk tools handled here:
//   bulk_set_wqa_action      → bulkSetAction
//   bulk_set_wqa_status      → bulkSetStatus
//   bulk_clear_action_override → bulkClearActionOverride
//   bulk_add_seed_keywords   → inline batch insert against property_seed_keyword
//   bulk_add_competitors     → inline batch insert against property_competitor
//   approve_phase            → approvePhase
//
// Mirrors web/app/properties/[slug]/brand-dna/proposal-actions.ts for the
// Brand DNA assistant — same shape: requireWriteToken → switch on tool
// name → dispatch → return { ok, summary } so the Apply card can render
// a confirmation toast.

import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { requireWriteToken } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import type { ProposalPayload } from "@/lib/property-assistant/types";
import {
  bulkSetAction,
  bulkSetStatus,
  bulkClearActionOverride,
} from "@/app/properties/[slug]/pages/wqa-actions";
import { approvePhase } from "@/app/properties/[slug]/actions";

type Ok = { ok: true; summary: string };
type Err = { ok: false; error: string };

export async function applyPropertyAssistantProposal(
  propertySlug: string,
  proposal: ProposalPayload,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;

  try {
    switch (proposal.tool) {
      case "bulk_set_wqa_action": {
        const urls = (proposal.input.urls as string[]) ?? [];
        const action = String(proposal.input.action ?? "");
        const r = await bulkSetAction(propertySlug, urls, action as never);
        if (!r.ok) return { ok: false, error: r.error };
        return { ok: true, summary: `Set ${r.updated} URLs to ${action}.` };
      }

      case "bulk_set_wqa_status": {
        const urls = (proposal.input.urls as string[]) ?? [];
        const status = String(proposal.input.status ?? "");
        const r = await bulkSetStatus(propertySlug, urls, status as never);
        if (!r.ok) return { ok: false, error: r.error };
        return { ok: true, summary: `Set ${r.updated} URLs to ${status}.` };
      }

      case "bulk_clear_action_override": {
        const urls = (proposal.input.urls as string[]) ?? [];
        const r = await bulkClearActionOverride(propertySlug, urls);
        if (!r.ok) return { ok: false, error: r.error };
        return {
          ok: true,
          summary: `Cleared overrides on ${r.updated} URLs.`,
        };
      }

      case "bulk_add_seed_keywords":
        return await applyBulkAddSeedKeywords(propertySlug, proposal.input);

      case "bulk_add_competitors":
        return await applyBulkAddCompetitors(propertySlug, proposal.input);

      case "approve_phase":
        return await applyApprovePhase(propertySlug, proposal.input);

      default:
        return { ok: false, error: `Unknown bulk tool: ${proposal.tool}` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── bulk_add_seed_keywords ──────────────────────────────────────────────
// Resolve property → normalize each item → dedup against existing keywords
// for that property_id → batch-insert the new rows. Mirrors the on-conflict-
// do-nothing pattern in importSeedKeywordsFromBq.

async function applyBulkAddSeedKeywords(
  propertySlug: string,
  input: Record<string, unknown>,
): Promise<Ok | Err> {
  const items = Array.isArray(input.items) ? input.items : [];
  if (items.length === 0) {
    return { ok: false, error: "No seed keyword items in the proposal." };
  }

  const { data: prop } = await supabase
    .from("property")
    .select("id")
    .eq("slug", propertySlug)
    .single();
  if (!prop) return { ok: false, error: "Property not found." };
  const propertyId = (prop as { id: string }).id;

  const operator = getOperator();

  const shaped = items
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const keyword = String(r.keyword ?? "").trim().toLowerCase();
      if (!keyword) return null;
      const category =
        r.category !== undefined && r.category !== null
          ? String(r.category).trim() || null
          : null;
      const seed_category =
        r.seed_category !== undefined && r.seed_category !== null
          ? String(r.seed_category).trim() || null
          : null;
      const intent =
        r.intent !== undefined && r.intent !== null
          ? String(r.intent).trim() || null
          : null;
      const priorityRaw = String(r.priority ?? "medium").toLowerCase();
      const priority =
        priorityRaw === "high" || priorityRaw === "low"
          ? priorityRaw
          : "medium";
      return {
        property_id: propertyId,
        keyword,
        category,
        seed_category,
        intent,
        priority,
        source: "operator" as const,
        created_by: operator,
        updated_by: operator,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (shaped.length === 0) {
    return { ok: false, error: "No usable seed keyword rows in the proposal." };
  }

  const { data: existing } = await supabase
    .from("property_seed_keyword")
    .select("keyword")
    .eq("property_id", propertyId);
  const existingKeywords = new Set(
    (existing ?? []).map((r: { keyword: string }) => r.keyword),
  );
  const newRows = shaped.filter((r) => !existingKeywords.has(r.keyword));
  const skipped = shaped.length - newRows.length;

  if (newRows.length === 0) {
    return {
      ok: true,
      summary: `Added 0 seed keywords (${skipped} duplicates skipped).`,
    };
  }

  const { error } = await supabase
    .from("property_seed_keyword")
    .insert(newRows);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/properties/${propertySlug}/brand-dna/seed-keywords`);
  revalidatePath(`/properties/${propertySlug}/brand-dna`);
  revalidatePath(`/properties/${propertySlug}`, "layout");

  return {
    ok: true,
    summary: `Added ${newRows.length} seed keywords (${skipped} duplicates skipped).`,
  };
}

// ─── bulk_add_competitors ────────────────────────────────────────────────
// Same shape as seed keywords — resolve, normalize, dedup, batch insert.
// Domain normalization matches normalizeCompetitorDomain (lowercase, strip
// protocol, strip www., strip path).

async function applyBulkAddCompetitors(
  propertySlug: string,
  input: Record<string, unknown>,
): Promise<Ok | Err> {
  const items = Array.isArray(input.items) ? input.items : [];
  if (items.length === 0) {
    return { ok: false, error: "No competitor items in the proposal." };
  }

  const { data: prop } = await supabase
    .from("property")
    .select("id")
    .eq("slug", propertySlug)
    .single();
  if (!prop) return { ok: false, error: "Property not found." };
  const propertyId = (prop as { id: string }).id;

  const operator = getOperator();

  const shaped = items
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const domain = String(r.domain ?? "")
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/.*$/, "");
      if (!domain) return null;
      const priorityRaw = String(r.priority ?? "medium").toLowerCase();
      const priority =
        priorityRaw === "high" || priorityRaw === "low"
          ? priorityRaw
          : "medium";
      const notesRaw =
        r.notes !== undefined && r.notes !== null
          ? String(r.notes).trim()
          : "";
      const notes = notesRaw.length > 0 ? notesRaw : null;
      return {
        property_id: propertyId,
        domain,
        priority,
        notes,
        source: "operator" as const,
        created_by: operator,
        updated_by: operator,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (shaped.length === 0) {
    return { ok: false, error: "No usable competitor rows in the proposal." };
  }

  const { data: existing } = await supabase
    .from("property_competitor")
    .select("domain")
    .eq("property_id", propertyId);
  const existingDomains = new Set(
    (existing ?? []).map((r: { domain: string }) => r.domain),
  );
  const newRows = shaped.filter((r) => !existingDomains.has(r.domain));
  const skipped = shaped.length - newRows.length;

  if (newRows.length === 0) {
    return {
      ok: true,
      summary: `Added 0 competitors (${skipped} duplicates skipped).`,
    };
  }

  const { error } = await supabase
    .from("property_competitor")
    .insert(newRows);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/properties/${propertySlug}/brand-dna/competitors`);
  revalidatePath(`/properties/${propertySlug}/brand-dna`);
  revalidatePath(`/properties/${propertySlug}`, "layout");

  return {
    ok: true,
    summary: `Added ${newRows.length} competitors (${skipped} duplicates skipped).`,
  };
}

// ─── approve_phase ───────────────────────────────────────────────────────
// Resolve slug → property_id, then defer to the existing approvePhase
// action. Phase index comes from the proposal input.

async function applyApprovePhase(
  propertySlug: string,
  input: Record<string, unknown>,
): Promise<Ok | Err> {
  const phaseIndex = Number(input.phase);
  if (!Number.isFinite(phaseIndex)) {
    return { ok: false, error: `Invalid phase index: ${input.phase}` };
  }

  const { data: prop } = await supabase
    .from("property")
    .select("id")
    .eq("slug", propertySlug)
    .single();
  if (!prop) return { ok: false, error: "Property not found." };

  const r = await approvePhase(
    (prop as { id: string }).id,
    phaseIndex,
    propertySlug,
  );
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, summary: `Phase ${phaseIndex} approved.` };
}
