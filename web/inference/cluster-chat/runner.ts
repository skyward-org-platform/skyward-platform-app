// Cluster-chat agent runner. Mirrors the brand DNA assistant pattern at
// web/app/api/brand-dna/ask/[slug]/route.ts but simplified for v1:
//   - Blocking, non-streaming Anthropic call (the parent server action
//     does its own revalidation/refresh; no SSE consumer wired in 5.4).
//   - Auto-executes all four tools server-side. No "propose" cards — the
//     mark_keyword_excluded tool is the only mutating tool and writes
//     directly (the user can audit/undo via the Keywords drawer).
//   - Multi-turn tool loop bounded by MAX_TURNS so models that chain
//     tool calls (find → search → exclude) finish in one HTTP request.
//
// Persistence shape:
//   - User message stored as one cluster_chat_message row (role='user').
//   - Each tool invocation stored as one cluster_chat_message row
//     (role='tool', tool_calls + tool_results populated).
//   - Final assistant text stored as one cluster_chat_message row
//     (role='assistant'). If the model produced tool_use blocks alongside
//     text, the tool_calls jsonb on the assistant row captures them for
//     later replay/audit.

import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";
import { appendMessage, getClusterMessages } from "@/lib/cluster-chat";
import { upsertKeyword } from "@/lib/keywords";
import { recordLlmCall } from "@/lib/llm-usage";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2000;
const MAX_TURNS = 4;

export type ClusterContext = {
  propertyId: string;
  propertySlug: string;
  clusterId: string;
  headTerm: string;
  members: string[];
  topUrls: string[];
  priority: string;
  pageAction: string | null;
};

// ─── Tool definitions ────────────────────────────────────────────────────
type InputSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
};

const TOOLS: {
  name: string;
  description: string;
  input_schema: InputSchema;
}[] = [
  {
    name: "find_more_keywords",
    description:
      "Search this property's keyword universe for keywords matching a seed (substring match). Returns up to 30 keywords with status + source. Use when the user asks 'are there related keywords we're missing?' or 'what else is in the universe near X?'.",
    input_schema: {
      type: "object",
      properties: {
        seed: {
          type: "string",
          description:
            "Substring or phrase to match against existing keywords (ILIKE %seed%).",
        },
      },
      required: ["seed"],
    },
  },
  {
    name: "expand_cluster",
    description:
      "Return the full member list of a cluster (cluster_id is the keyword_cluster.id uuid). Use to inspect what's already in a cluster before suggesting additions or splits.",
    input_schema: {
      type: "object",
      properties: {
        cluster_id: {
          type: "string",
          description: "The keyword_cluster.id uuid.",
        },
      },
      required: ["cluster_id"],
    },
  },
  {
    name: "search_serp",
    description:
      "Look up a cached SERP for a keyword from the DataForSEO BigQuery cache. Returns the top organic results if cached; returns a 'not cached' note otherwise. Does NOT trigger a live DFS pull — that's a manual SEO ops step.",
    input_schema: {
      type: "object",
      properties: {
        keyword: {
          type: "string",
          description: "Exact keyword to look up.",
        },
      },
      required: ["keyword"],
    },
  },
  {
    name: "mark_keyword_excluded",
    description:
      "Set a keyword's status to 'Excluded' with a reason appended to notes. Use when the user asks to drop a keyword from scope (off-topic, irrelevant, low intent). Writes immediately — the user reviews via the Universe table.",
    input_schema: {
      type: "object",
      properties: {
        keyword: {
          type: "string",
          description: "Exact keyword to exclude.",
        },
        reason: {
          type: "string",
          description:
            "Short explanation appended to the keyword's notes column.",
        },
      },
      required: ["keyword", "reason"],
    },
  },
];

// ─── Tool implementations ────────────────────────────────────────────────
async function toolFindMoreKeywords(
  ctx: ClusterContext,
  args: { seed: string },
): Promise<string> {
  const seed = (args.seed ?? "").trim();
  if (!seed) return "Empty seed; pass a substring to match.";
  const { data, error } = await supabase
    .from("keyword")
    .select("keyword, status, source")
    .eq("property_id", ctx.propertyId)
    .ilike("keyword", `%${seed}%`)
    .limit(30);
  if (error) return `find_more_keywords error: ${error.message}`;
  const rows = (data ?? []) as { keyword: string; status: string; source: string | null }[];
  if (rows.length === 0) return `No keywords match "${seed}".`;
  const lines = rows.map(
    (r) => `- ${r.keyword} [${r.status}${r.source ? ` · ${r.source}` : ""}]`,
  );
  return `Matched ${rows.length} keyword(s) for "${seed}":\n${lines.join("\n")}`;
  // TODO: wire a real keyword-discovery API (Ahrefs / DFS expand) here in
  // v2. For v1 we only search the existing universe so the tool is
  // deterministic and free.
}

async function toolExpandCluster(
  ctx: ClusterContext,
  args: { cluster_id: string },
): Promise<string> {
  const clusterId = (args.cluster_id ?? "").trim();
  if (!clusterId) return "Pass a cluster_id (uuid).";
  // For the current cluster, we already have the member list in context.
  if (clusterId === ctx.clusterId) {
    return `Current cluster "${ctx.headTerm}" has ${ctx.members.length} member(s):\n${
      ctx.members.map((m) => `- ${m}`).join("\n")
    }`;
  }
  const { data, error } = await supabase
    .from("keyword_cluster_member")
    .select("keyword, assignment")
    .eq("cluster_id", clusterId);
  if (error) return `expand_cluster error: ${error.message}`;
  const rows = (data ?? []) as { keyword: string; assignment: string }[];
  if (rows.length === 0) return `Cluster ${clusterId} has no members.`;
  return `Cluster ${clusterId} has ${rows.length} member(s):\n${rows
    .map((r) => `- ${r.keyword}${r.assignment === "manual" ? " (manual)" : ""}`)
    .join("\n")}`;
}

async function toolSearchSerp(
  _ctx: ClusterContext,
  args: { keyword: string },
): Promise<string> {
  const kw = (args.keyword ?? "").trim();
  if (!kw) return "Pass a keyword to look up.";
  // v1: no live DFS pulls (cost + complexity). Real BQ lookup against
  // `data-hub-468216.DataForSEO.serp-google-organic` requires the Python
  // API; we'd add a /api/serp endpoint to bridge it. For now return a
  // clear "not cached" so the model can plan around it.
  return `SERP for "${kw}": not cached in v1. Ask SEO ops to pull manually via DataForSEO if needed.`;
}

async function toolMarkKeywordExcluded(
  ctx: ClusterContext,
  args: { keyword: string; reason: string },
): Promise<string> {
  const kw = (args.keyword ?? "").trim();
  const reason = (args.reason ?? "").trim();
  if (!kw) return "Pass a keyword to exclude.";
  try {
    // Pull existing notes so we can append rather than overwrite.
    const { data: existing } = await supabase
      .from("keyword")
      .select("notes")
      .eq("property_id", ctx.propertyId)
      .eq("keyword", kw)
      .maybeSingle();
    const prevNotes =
      existing && typeof (existing as { notes?: string }).notes === "string"
        ? (existing as { notes: string }).notes
        : "";
    const appended = reason
      ? prevNotes
        ? `${prevNotes}\n[excluded via chat] ${reason}`
        : `[excluded via chat] ${reason}`
      : prevNotes;
    await upsertKeyword({
      property_id: ctx.propertyId,
      keyword: kw,
      status: "Excluded",
      notes: appended || null,
      updated_by: "cluster-chat-agent",
    });
    return `Excluded "${kw}". Notes updated.`;
  } catch (e) {
    return `mark_keyword_excluded error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function executeTool(
  ctx: ClusterContext,
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  if (name === "find_more_keywords") {
    return toolFindMoreKeywords(ctx, input as { seed: string });
  }
  if (name === "expand_cluster") {
    return toolExpandCluster(ctx, input as { cluster_id: string });
  }
  if (name === "search_serp") {
    return toolSearchSerp(ctx, input as { keyword: string });
  }
  if (name === "mark_keyword_excluded") {
    return toolMarkKeywordExcluded(
      ctx,
      input as { keyword: string; reason: string },
    );
  }
  return `Unknown tool: ${name}`;
}

// ─── System prompt ───────────────────────────────────────────────────────
function buildSystemPrompt(ctx: ClusterContext): string {
  const lines: string[] = [];
  lines.push(
    `You are the cluster-scope research agent for keyword cluster "${ctx.headTerm}". You help the SEO operator curate this cluster: find missing keywords, inspect SERPs, and exclude noise.`,
  );
  lines.push("");
  lines.push("# Cluster context");
  lines.push(`- cluster_id: ${ctx.clusterId}`);
  lines.push(`- head_term: ${ctx.headTerm}`);
  lines.push(`- priority: ${ctx.priority}`);
  lines.push(`- page_action: ${ctx.pageAction ?? "(unset)"}`);
  lines.push(`- members (${ctx.members.length}):`);
  for (const m of ctx.members.slice(0, 40)) lines.push(`  - ${m}`);
  if (ctx.members.length > 40) {
    lines.push(`  ... +${ctx.members.length - 40} more`);
  }
  if (ctx.topUrls.length > 0) {
    lines.push(`- assigned URLs:`);
    for (const u of ctx.topUrls.slice(0, 10)) lines.push(`  - ${u}`);
  }
  lines.push("");
  lines.push("# How to act");
  lines.push(
    "- Be concise. Mirror the operator's terminology. Plain prose; **bold** for emphasis; bullet lists OK. No `#` headers.",
  );
  lines.push(
    "- When the user asks about related keywords, call `find_more_keywords` with a seed before answering.",
  );
  lines.push(
    "- When inspecting another cluster, call `expand_cluster`. The CURRENT cluster's members are already in context above — no need to look them up.",
  );
  lines.push(
    "- `search_serp` returns cached data only in v1. If a SERP isn't cached, say so — don't pretend to have data.",
  );
  lines.push(
    "- `mark_keyword_excluded` is a write. Only call when the user clearly asks to drop a keyword. Pass a short reason — it lands in the keyword's notes.",
  );
  lines.push(
    "- After tool calls, summarize what you found and what (if anything) you did. Don't dump raw tool output — synthesize.",
  );
  return lines.join("\n");
}

// ─── Persistence shape returned to caller ────────────────────────────────
export type RunResult =
  | { ok: true; assistantText: string }
  | { ok: false; error: string };

// ─── Runner ──────────────────────────────────────────────────────────────
export async function runClusterChat(args: {
  threadId: string;
  userMessage: string;
  ctx: ClusterContext;
}): Promise<RunResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };
  }

  // Load the persisted history (including the user message we just
  // appended) so the model sees the full thread.
  const history = await getClusterMessages(args.threadId);

  // Convert persisted messages into Anthropic message shape. Tool messages
  // (role='tool') get folded into the preceding assistant turn as
  // tool_result blocks — Anthropic requires every tool_use to pair with a
  // tool_result on the next user message.
  const messages: Anthropic.MessageParam[] = [];
  for (const m of history) {
    if (m.role === "user") {
      messages.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      // Replay both the text and any persisted tool_calls so the model
      // sees its own prior reasoning. tool_results that paired with those
      // tool_calls live on the NEXT 'tool' row in history.
      const content: Anthropic.ContentBlockParam[] = [];
      if (m.content) content.push({ type: "text", text: m.content });
      const toolCalls = (m.tool_calls ?? null) as
        | { id: string; name: string; input: Record<string, unknown> }[]
        | null;
      if (toolCalls && Array.isArray(toolCalls)) {
        for (const tc of toolCalls) {
          content.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.input,
          });
        }
      }
      if (content.length > 0) messages.push({ role: "assistant", content });
    } else if (m.role === "tool") {
      // tool row carries tool_results paired with the prior assistant
      // turn's tool_use blocks. Pack them into a user message.
      const results = (m.tool_results ?? null) as
        | { tool_use_id: string; content: string }[]
        | null;
      if (results && Array.isArray(results) && results.length > 0) {
        messages.push({
          role: "user",
          content: results.map((r) => ({
            type: "tool_result" as const,
            tool_use_id: r.tool_use_id,
            content: r.content,
          })),
        });
      }
    }
  }

  // If the most recent persisted row is the user message (the typical
  // case — postClusterChatMessage appended it before calling us), the
  // messages array already ends in role=user. Good.
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    messages.push({ role: "user", content: args.userMessage });
  }

  const client = new Anthropic({ apiKey });
  const system = buildSystemPrompt(args.ctx);

  let finalText = "";
  let finalToolCalls:
    | { id: string; name: string; input: Record<string, unknown> }[]
    | null = null;

  try {
    let conversation = messages;
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        tools: TOOLS,
        messages: conversation,
      });

      // Telemetry — fire-and-forget, errors swallowed.
      void recordLlmCall({
        propertySlug: args.ctx.propertySlug,
        agent: "assistant",
        model: MODEL,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        metadata: { surface: "cluster-chat", turn, cluster_id: args.ctx.clusterId },
      });

      // Collect text + tool_use blocks emitted this turn.
      const textBlocks: string[] = [];
      const toolUses: {
        id: string;
        name: string;
        input: Record<string, unknown>;
      }[] = [];
      for (const block of response.content) {
        if (block.type === "text") {
          textBlocks.push(block.text);
        } else if (block.type === "tool_use") {
          toolUses.push({
            id: block.id,
            name: block.name,
            input: (block.input as Record<string, unknown>) ?? {},
          });
        }
      }

      // If the model is done (no tool calls), we have our final reply.
      if (toolUses.length === 0 || response.stop_reason !== "tool_use") {
        finalText = textBlocks.join("\n\n").trim();
        if (toolUses.length > 0) finalToolCalls = toolUses;
        // Persist the assistant turn.
        await appendMessage(
          args.threadId,
          "assistant",
          finalText || "(no reply)",
          finalToolCalls,
          null,
        );
        return { ok: true, assistantText: finalText || "(no reply)" };
      }

      // Tool calls present — persist the assistant turn (with its
      // tool_calls), execute each tool, persist a 'tool' row carrying the
      // tool_results, then loop.
      const assistantText = textBlocks.join("\n\n").trim();
      await appendMessage(
        args.threadId,
        "assistant",
        assistantText,
        toolUses,
        null,
      );

      const toolResults: { tool_use_id: string; content: string }[] = [];
      for (const tu of toolUses) {
        const result = await executeTool(args.ctx, tu.name, tu.input);
        toolResults.push({ tool_use_id: tu.id, content: result });
      }
      await appendMessage(
        args.threadId,
        "tool",
        `(${toolUses.map((t) => t.name).join(", ")})`,
        null,
        toolResults,
      );

      // Build the next round's conversation: append the assistant + tool
      // turns we just emitted.
      conversation = [
        ...conversation,
        { role: "assistant", content: response.content },
        {
          role: "user",
          content: toolResults.map((r) => ({
            type: "tool_result" as const,
            tool_use_id: r.tool_use_id,
            content: r.content,
          })),
        },
      ];
    }

    // MAX_TURNS exhausted without a clean stop. Persist a fallback.
    const fallback =
      "Stopped after the tool-use loop ran the max number of turns. Try a more specific question.";
    await appendMessage(args.threadId, "assistant", fallback, null, null);
    return { ok: true, assistantText: fallback };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await appendMessage(
      args.threadId,
      "assistant",
      `Runner error: ${error}`,
      null,
      null,
    );
    return { ok: false, error };
  }
}

// Build the runner's context from supabase queries. Called by the server
// action so the runner stays pure(ish) — it only knows about the context
// shape, not how to fetch it.
export async function buildClusterContext(args: {
  propertyId: string;
  propertySlug: string;
  clusterId: string;
}): Promise<ClusterContext | { error: string }> {
  const { data: cluster, error: clusterErr } = await supabase
    .from("keyword_cluster")
    .select("id, head_term, priority, page_action")
    .eq("id", args.clusterId)
    .maybeSingle();
  if (clusterErr || !cluster) {
    return { error: clusterErr?.message ?? "Cluster not found." };
  }
  const [{ data: members }, { data: urls }] = await Promise.all([
    supabase
      .from("keyword_cluster_member")
      .select("keyword")
      .eq("cluster_id", args.clusterId)
      .limit(200),
    supabase
      .from("page_cluster_assignment")
      .select("url")
      .eq("primary_cluster_id", args.clusterId)
      .eq("property_id", args.propertyId)
      .limit(20),
  ]);
  return {
    propertyId: args.propertyId,
    propertySlug: args.propertySlug,
    clusterId: args.clusterId,
    headTerm:
      (cluster as { head_term: string }).head_term ?? "(no head term)",
    priority: (cluster as { priority: string }).priority ?? "Unset",
    pageAction:
      (cluster as { page_action: string | null }).page_action ?? null,
    members: ((members ?? []) as { keyword: string }[]).map((r) => r.keyword),
    topUrls: ((urls ?? []) as { url: string }[]).map((r) => r.url),
  };
}
