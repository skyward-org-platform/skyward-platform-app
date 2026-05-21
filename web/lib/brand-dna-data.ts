// Centralized reader for brand_dna_section + chat history + LLM usage
// rollup. All three are called by multiple components per request (the
// Brand DNA Overview hero + subnav layout both want sections; the
// Overview also wants chat history and usage). React.cache() dedupes
// these to one Supabase query per nav.
//
// Cross-request caching (via unstable_cache) was removed — the factory
// pattern was implicated in Next 16 layout throws on newly-created
// properties. Re-add via "use cache" later.

import { cache } from "react";
import { supabase } from "./supabase";
import type { AssistantBlock } from "@/app/properties/[slug]/brand-dna/chat-actions";

export type BrandDnaSection = {
  id: string;
  section: string;
  content: Record<string, unknown> | null;
  body: string | null;
  source: string | null;
  confidence: number | null;
  updated_at: string | null;
  updated_by: string | null;
};

async function fetchAllSectionsRaw(slug: string): Promise<BrandDnaSection[]> {
  const { data: prop } = await supabase
    .from("property")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!prop) return [];
  const { data } = await supabase
    .from("brand_dna_section")
    .select("id, section, content, body, source, confidence, updated_at, updated_by")
    .eq("property_id", prop.id);
  return (data as BrandDnaSection[] | null) ?? [];
}

export const getAllSections = cache(fetchAllSectionsRaw);

/** One section by key. */
export async function getSection(
  slug: string,
  sectionKey: string,
): Promise<BrandDnaSection | null> {
  const all = await getAllSections(slug);
  return all.find((s) => s.section === sectionKey) ?? null;
}

// ─── Chat history ────────────────────────────────────────────────────────

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text?: string;
  blocks?: AssistantBlock[];
  created_at: string;
};

async function fetchChatHistoryRaw(slug: string): Promise<ChatMessage[]> {
  const { data: prop } = await supabase
    .from("property")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!prop) return [];
  const { data } = await supabase
    .from("brand_dna_chat_message")
    .select("id, role, content, created_at")
    .eq("property_id", prop.id)
    .order("created_at", { ascending: true });
  return ((data ?? []) as {
    id: string;
    role: "user" | "assistant";
    content: { text?: string; blocks?: AssistantBlock[] };
    created_at: string;
  }[]).map((row) => ({
    id: row.id,
    role: row.role,
    text: row.content.text,
    blocks: row.content.blocks,
    created_at: row.created_at,
  }));
}

export const getCachedChatHistory = cache(fetchChatHistoryRaw);

// ─── LLM usage rollup ────────────────────────────────────────────────────

export type UsageRollup = {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  byAgent: { agent: string; calls: number; cost: number }[];
};

async function fetchUsageRaw(slug: string): Promise<UsageRollup> {
  const empty: UsageRollup = {
    totalCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUsd: 0,
    byAgent: [],
  };
  const { data: prop } = await supabase
    .from("property")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!prop) return empty;
  const { data } = await supabase
    .from("llm_call_log")
    .select("agent, input_tokens, output_tokens, cost_usd")
    .eq("property_id", prop.id)
    .order("created_at", { ascending: false })
    .limit(500);
  const rows = (data ?? []) as {
    agent: string;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  }[];
  let totalCalls = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;
  const byAgent = new Map<string, { calls: number; cost: number }>();
  for (const r of rows) {
    totalCalls += 1;
    totalInputTokens += r.input_tokens;
    totalOutputTokens += r.output_tokens;
    totalCostUsd += Number(r.cost_usd);
    const acc = byAgent.get(r.agent) ?? { calls: 0, cost: 0 };
    acc.calls += 1;
    acc.cost += Number(r.cost_usd);
    byAgent.set(r.agent, acc);
  }
  return {
    totalCalls,
    totalInputTokens,
    totalOutputTokens,
    totalCostUsd,
    byAgent: Array.from(byAgent.entries())
      .map(([agent, v]) => ({ agent, ...v }))
      .sort((a, b) => b.cost - a.cost),
  };
}

export const getCachedUsageForProperty = cache(fetchUsageRaw);
