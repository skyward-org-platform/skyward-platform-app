// Per-call usage logger for every Anthropic invocation in the platform.
//
// Flow on each completion:
//   1. Read input_tokens + output_tokens from the SDK response usage.
//   2. POST to /api/llm/calculate-cost — Python route wraps skyward-common's
//      `skyward.llm.costs.calculate_cost` (single source of truth for
//      pricing across all Skyward projects).
//   3. Write a row to the llm_call_log Supabase table.
//
// Failures are swallowed and logged — usage telemetry is best-effort, it
// must never break the user-facing chat or research flow.

import { supabase } from "./supabase";
import { apiBase } from "./api-base";

export type LlmUsageInput = {
  propertySlug?: string | null;
  agent: "assistant" | "research-fill" | "research-handoff";
  model: string;
  inputTokens: number;
  outputTokens: number;
  metadata?: Record<string, unknown>;
};

export async function recordLlmCall(input: LlmUsageInput): Promise<void> {
  try {
    const token = process.env.APP_WRITE_TOKEN;

    // 1. Compute cost via skyward-common (Python).
    const costRes = await fetch(`${apiBase()}/api/llm/calculate-cost`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        model: input.model,
        input_tokens: input.inputTokens,
        output_tokens: input.outputTokens,
        provider: "anthropic",
      }),
      cache: "no-store",
    });
    const costBody = (await costRes.json().catch(() => ({}))) as {
      ok?: boolean;
      cost_usd?: number;
      model_normalized?: string;
      error?: string;
    };
    if (!costBody.ok || typeof costBody.cost_usd !== "number") {
      console.warn(
        `[llm-usage] cost lookup failed: ${costBody.error ?? "unknown"}`,
      );
      return;
    }

    // 2. Resolve property_id from slug (best-effort — null is fine).
    let propertyId: string | null = null;
    if (input.propertySlug) {
      const { data: prop } = await supabase
        .from("property")
        .select("id")
        .eq("slug", input.propertySlug)
        .maybeSingle();
      propertyId = (prop?.id as string | undefined) ?? null;
    }

    // 3. Insert log row.
    const { error } = await supabase.from("llm_call_log").insert({
      property_id: propertyId,
      agent: input.agent,
      model: costBody.model_normalized ?? input.model,
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      cost_usd: costBody.cost_usd,
      metadata: input.metadata ?? {},
    });
    if (error) {
      console.warn(`[llm-usage] log insert failed: ${error.message}`);
    }
  } catch (e) {
    console.warn(
      `[llm-usage] unexpected failure: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
}

export type UsageRollup = {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  byAgent: { agent: string; calls: number; cost: number }[];
};

/** Read-only aggregate of llm_call_log scoped to a single property. Powers
 *  the small "$X spent" panel on the Brand DNA Overview. */
export async function getUsageForProperty(
  propertySlug: string,
): Promise<UsageRollup> {
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
    .eq("slug", propertySlug)
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
