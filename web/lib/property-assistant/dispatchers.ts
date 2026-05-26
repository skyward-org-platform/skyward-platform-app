// Server-side execution of read tools called by the PropertyAssistant
// Anthropic route handler. Every branch returns a ToolResult so the route
// can forward the JSON straight back to the model as a tool_result block.
//
// All Supabase calls use the service-role client (bypasses RLS). Filtering
// for WQA happens client-side after fetching the cached BQ aggregate;
// status_code / sessions / impressions / backlinks come from the row dump.

import { supabase } from "@/lib/supabase";
import { getMission } from "@/lib/property-mission";
import { getWqaForDomain, type WqaRow } from "@/lib/wqa";
import { getWqaDecisions } from "@/lib/wqa-decisions";
import type { ToolResult } from "./types";

export type DispatchContext = {
  propertyId: string;
  propertySlug: string;
  primaryDomain: string | null;
};

type ToolInput = Record<string, unknown>;

export async function dispatchToolCall(
  name: string,
  input: ToolInput,
  ctx: DispatchContext,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "read_property_meta":
        return await readPropertyMeta(ctx);
      case "read_wqa_urls":
        return await readWqaUrls(input, ctx);
      case "read_wqa_decisions":
        return await readWqaDecisions(input, ctx);
      case "read_brand_dna":
        return await readBrandDna(input, ctx);
      case "read_competitors":
        return await readCompetitors(ctx);
      case "read_seed_keywords":
        return await readSeedKeywords(input, ctx);
      case "read_keyword_clusters":
        return await readKeywordClusters(ctx);
      case "read_audit_docs":
        return await readAuditDocs(ctx);
      case "read_page_embedding_match":
        return await readPageEmbeddingMatch(input, ctx);
      case "read_recent_activity":
        return await readRecentActivity(input);
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

// ─── 1. read_property_meta ───────────────────────────────────────────────

async function readPropertyMeta(ctx: DispatchContext): Promise<ToolResult> {
  const propQ = supabase
    .from("property")
    .select(
      [
        "id",
        "slug",
        "name",
        "primary_domain",
        "status",
        "pipeline_phase",
        "phase_0_approved_at",
        "phase_1_approved_at",
        "phase_2_approved_at",
        "phase_3_approved_at",
        "phase_4_approved_at",
        "phase_5_approved_at",
        "phase_6_approved_at",
      ].join(", "),
    )
    .eq("id", ctx.propertyId)
    .maybeSingle();

  const totalQ = supabase
    .from("page")
    .select("id", { count: "exact", head: true })
    .eq("property_id", ctx.propertyId);

  const optimizeQ = supabase
    .from("page")
    .select("id", { count: "exact", head: true })
    .eq("property_id", ctx.propertyId)
    .eq("audit_action", "optimize");

  const [propRes, totalRes, optimizeRes, mission] = await Promise.all([
    propQ,
    totalQ,
    optimizeQ,
    getMission(ctx.propertyId),
  ]);

  if (propRes.error) {
    return { ok: false, error: `read_property_meta: ${propRes.error.message}` };
  }

  const prop = (propRes.data ?? null) as Record<string, unknown> | null;
  if (!prop) {
    return { ok: false, error: `Property not found: ${ctx.propertyId}` };
  }

  return {
    ok: true,
    data: {
      ...prop,
      mission: (mission?.body as string | undefined) ?? null,
      page_count: totalRes.count ?? 0,
      optimize_count: optimizeRes.count ?? 0,
    },
  };
}

// ─── 2. read_wqa_urls ────────────────────────────────────────────────────

async function readWqaUrls(
  input: ToolInput,
  ctx: DispatchContext,
): Promise<ToolResult> {
  if (!ctx.primaryDomain) {
    return { ok: true, data: [] };
  }

  const wqa = await getWqaForDomain(ctx.primaryDomain, "dev");
  if (!wqa.ok) {
    return { ok: false, error: `read_wqa_urls: ${wqa.error}` };
  }

  const statusCodeMin = numOrNull(input.status_code_min);
  const statusCodeMax = numOrNull(input.status_code_max);
  const minSessions = numOrNull(input.min_sessions);
  const minImpressions = numOrNull(input.min_impressions);
  const minBacklinks = numOrNull(input.min_backlinks);
  const minRefdomains = numOrNull(input.min_refdomains);
  const hasBacklinks =
    typeof input.has_backlinks === "boolean"
      ? (input.has_backlinks as boolean)
      : null;
  const isIndexable =
    typeof input.is_indexable === "boolean"
      ? (input.is_indexable as boolean)
      : null;

  const rows: WqaRow[] = wqa.rows.filter((r) => {
    const code = r.status_code ?? 0;
    if (statusCodeMin !== null && code < statusCodeMin) return false;
    if (statusCodeMax !== null && code > statusCodeMax) return false;
    if (minSessions !== null && (r.sessions ?? 0) < minSessions) return false;
    if (
      minImpressions !== null &&
      (r.average_impressions ?? 0) < minImpressions
    )
      return false;
    if (minBacklinks !== null && (r.backlinks ?? 0) < minBacklinks) return false;
    if (
      minRefdomains !== null &&
      (r.referring_domains ?? 0) < minRefdomains
    )
      return false;
    if (hasBacklinks !== null) {
      const bl = r.backlinks ?? 0;
      if (hasBacklinks && bl <= 0) return false;
      if (!hasBacklinks && bl !== 0) return false;
    }
    if (isIndexable === true) {
      const idx = (r.indexability ?? "").toLowerCase();
      if (!idx.includes("indexable")) return false;
    }
    return true;
  });

  const limit = Math.min(numOrNull(input.limit) ?? 100, 500);
  const trimmed = rows.slice(0, limit).map((r) => ({
    url: r.url,
    status_code: r.status_code,
    title: r.current_title,
    sessions: r.sessions,
    impressions: r.average_impressions,
    refdomains: r.referring_domains,
    backlinks: r.backlinks,
    indexability: r.indexability,
  }));

  return { ok: true, data: trimmed };
}

// ─── 3. read_wqa_decisions ───────────────────────────────────────────────

async function readWqaDecisions(
  input: ToolInput,
  ctx: DispatchContext,
): Promise<ToolResult> {
  const rows = await getWqaDecisions(ctx.propertySlug);
  const status = typeof input.status === "string" ? input.status : null;
  const action = typeof input.action === "string" ? input.action : null;
  const filtered = rows.filter((r) => {
    if (status && r.status !== status) return false;
    if (action && r.action !== action) return false;
    return true;
  });
  return { ok: true, data: filtered };
}

// ─── 4. read_brand_dna ───────────────────────────────────────────────────

async function readBrandDna(
  input: ToolInput,
  ctx: DispatchContext,
): Promise<ToolResult> {
  const section = typeof input.section === "string" ? input.section : null;
  if (section) {
    const { data, error } = await supabase
      .from("brand_dna_section")
      .select("section, content, body, updated_at")
      .eq("property_id", ctx.propertyId)
      .eq("section", section)
      .maybeSingle();
    if (error) {
      return { ok: false, error: `read_brand_dna: ${error.message}` };
    }
    return { ok: true, data: data ?? null };
  }

  const { data, error } = await supabase
    .from("brand_dna_section")
    .select("section, content, body, updated_at")
    .eq("property_id", ctx.propertyId);
  if (error) {
    return { ok: false, error: `read_brand_dna: ${error.message}` };
  }

  type Row = {
    section: string;
    content: Record<string, unknown> | null;
    body: string | null;
    updated_at: string | null;
  };
  const summary = ((data ?? []) as Row[]).map((s) => ({
    section: s.section,
    content_size: s.content ? Object.keys(s.content).length : 0,
    body_len: s.body ? s.body.length : 0,
    updated_at: s.updated_at,
  }));
  return { ok: true, data: summary };
}

// ─── 5. read_competitors ─────────────────────────────────────────────────

async function readCompetitors(ctx: DispatchContext): Promise<ToolResult> {
  const { data, error } = await supabase
    .from("property_competitor")
    .select("id, domain, priority, notes, source")
    .eq("property_id", ctx.propertyId)
    .order("priority", { ascending: true });
  if (error) {
    return { ok: false, error: `read_competitors: ${error.message}` };
  }
  return { ok: true, data: data ?? [] };
}

// ─── 6. read_seed_keywords ───────────────────────────────────────────────

async function readSeedKeywords(
  input: ToolInput,
  ctx: DispatchContext,
): Promise<ToolResult> {
  let q = supabase
    .from("property_seed_keyword")
    .select("id, keyword, category, seed_category, intent, priority, source")
    .eq("property_id", ctx.propertyId);
  if (typeof input.intent === "string") {
    q = q.eq("intent", input.intent);
  }
  if (typeof input.priority === "string") {
    q = q.eq("priority", input.priority);
  }
  const { data, error } = await q;
  if (error) {
    return { ok: false, error: `read_seed_keywords: ${error.message}` };
  }
  return { ok: true, data: data ?? [] };
}

// ─── 7. read_keyword_clusters ────────────────────────────────────────────

async function readKeywordClusters(
  ctx: DispatchContext,
): Promise<ToolResult> {
  // Flat name list only - cluster_member join syntax is unreliable.
  const { data, error } = await supabase
    .from("keyword_cluster")
    .select("id, name")
    .eq("property_id", ctx.propertyId);
  if (error) {
    return { ok: false, error: `read_keyword_clusters: ${error.message}` };
  }
  return { ok: true, data: data ?? [] };
}

// ─── 8. read_audit_docs ──────────────────────────────────────────────────

async function readAuditDocs(ctx: DispatchContext): Promise<ToolResult> {
  const { data, error } = await supabase
    .from("audit_doc")
    .select("id, title, notes, generated_at")
    .eq("property_id", ctx.propertyId)
    .order("generated_at", { ascending: false });
  if (error) {
    return { ok: false, error: `read_audit_docs: ${error.message}` };
  }
  return { ok: true, data: data ?? [] };
}

// ─── 9. read_page_embedding_match ────────────────────────────────────────

async function readPageEmbeddingMatch(
  input: ToolInput,
  ctx: DispatchContext,
): Promise<ToolResult> {
  const url = typeof input.url === "string" ? input.url : null;
  if (!url) {
    return { ok: false, error: "read_page_embedding_match: url is required" };
  }
  const { suggestDestinationsForUrl } = await import("@/lib/redirect-suggester");
  const result = await suggestDestinationsForUrl(ctx.propertySlug, url, 3);
  return { ok: true, data: result };
}

// ─── 10. read_recent_activity ────────────────────────────────────────────

async function readRecentActivity(input: ToolInput): Promise<ToolResult> {
  const limit = Math.min(numOrNull(input.limit) ?? 20, 50);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [brand, decisions, competitors, seeds] = await Promise.all([
    supabase
      .from("brand_dna_section")
      .select("section, updated_at, updated_by")
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(limit),
    supabase
      .from("wqa_decision")
      .select("url, action, status, updated_at, decided_by")
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(limit),
    supabase
      .from("property_competitor")
      .select("domain, priority, updated_at, updated_by")
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(limit),
    supabase
      .from("property_seed_keyword")
      .select("keyword, intent, priority, updated_at, updated_by")
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(limit),
  ]);

  return {
    ok: true,
    data: {
      brand_dna_edits: brand.data ?? [],
      wqa_decisions: decisions.data ?? [],
      competitor_edits: competitors.data ?? [],
      seed_keyword_edits: seeds.data ?? [],
    },
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────

function numOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}
