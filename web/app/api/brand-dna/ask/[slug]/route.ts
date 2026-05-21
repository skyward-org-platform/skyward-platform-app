// Brand DNA Assistant — streaming chat endpoint that can both READ from
// and WRITE to the brand DNA via Anthropic tool use. The model can call:
//
//   - update_brand_field   (object-shape sections: identity, voice_tone, …)
//   - update_brand_items   (array-shape sections: personas, offerings, …)
//   - add_brain_entry      (project_brain_entry rows)
//
// These tools return immediately with a synthetic tool_result so the model
// can wrap its reply, but they're not auto-applied — each tool_use is
// surfaced to the client as a "proposal" event. The user clicks Apply on
// the inline card, which calls applyBrandDnaProposal server-side.
//
// Conversation history (with tool_use + tool_result pairing) lives on the
// client; this route is stateless.

import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";
import { requireWriteToken } from "@/lib/auth";
import {
  fetchAboutPage,
  fetchHomepage,
  HTML_MAX_CHARS,
} from "@/lib/research";
import { recordLlmCall } from "@/lib/llm-usage";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 3000;
const RESEARCH_MAX_TOKENS = 1500;
const MAX_TURNS = 3; // safety: stop the loop after N model passes per request

export const maxDuration = 120;

type BrandDnaSectionRow = {
  section: string;
  content: Record<string, unknown> | null;
  body: string | null;
};

type ProjectBrainRow = {
  type: string;
  title: string;
  body: string;
  status: string;
};

type PropertyContext = {
  id: string;
  name: string;
  slug: string;
  primary_domain: string | null;
  pipeline_phase: number | null;
  client: { name: string } | null;
};

function encodeEvent(payload: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function humanLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatSectionContent(
  content: Record<string, unknown> | null,
  body: string | null,
): string {
  const lines: string[] = [];
  if (body && body.trim()) lines.push(body.trim());
  if (content) {
    for (const [key, value] of Object.entries(content)) {
      if (value === null || value === undefined) continue;
      if (typeof value === "string") {
        if (!value.trim()) continue;
        lines.push(`**${humanLabel(key)}**: ${value.trim()}`);
      } else if (Array.isArray(value)) {
        if (value.length === 0) continue;
        const sample = value.slice(0, 20);
        if (sample.every((v) => typeof v === "string")) {
          lines.push(
            `**${humanLabel(key)}**: ${(sample as string[]).join(", ")}`,
          );
        } else {
          lines.push(
            `**${humanLabel(key)}**:\n${sample
              .map((v) => `- ${JSON.stringify(v)}`)
              .join("\n")}`,
          );
        }
      } else if (typeof value === "object") {
        lines.push(`**${humanLabel(key)}**: ${JSON.stringify(value)}`);
      }
    }
  }
  return lines.join("\n\n").trim();
}

async function getBrandContext(propertySlug: string): Promise<{
  prop: PropertyContext | null;
  sections: BrandDnaSectionRow[];
  brain: ProjectBrainRow[];
}> {
  const { data: propRow } = await supabase
    .from("property")
    .select(
      "id, name, slug, primary_domain, pipeline_phase, client:client_id(name)",
    )
    .eq("slug", propertySlug)
    .single();
  const prop = (propRow as unknown as PropertyContext) ?? null;
  if (!prop) return { prop: null, sections: [], brain: [] };

  const [{ data: sections }, { data: brain }] = await Promise.all([
    supabase
      .from("brand_dna_section")
      .select("section, content, body")
      .eq("property_id", prop.id),
    supabase
      .from("project_brain_entry")
      .select("type, title, body, status")
      .eq("property_id", prop.id)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(40),
  ]);

  return {
    prop,
    sections: (sections as BrandDnaSectionRow[] | null) ?? [],
    brain: (brain as ProjectBrainRow[] | null) ?? [],
  };
}

function buildSystemPrompt(
  prop: PropertyContext,
  sections: BrandDnaSectionRow[],
  brain: ProjectBrainRow[],
): string {
  const lines: string[] = [];
  lines.push(
    `You are the Brand DNA Brain for "${prop.name}" — the conversational agent that profiles this brand. You have access to its complete Brand DNA profile and the Project Brain knowledge base below, plus three tools that let you PROPOSE new knowledge.`,
  );
  lines.push("");
  lines.push("# Mission");
  lines.push(
    "Bring this brand's profile to operational completeness so the keyword universe, content pipeline, and downstream agents have everything they need to seed campaigns. You're not just a Q&A bot — you interview the user, propose structured updates, and capture the side-knowledge that comes out of every conversation.",
  );
  lines.push("");
  lines.push("# How to act");
  lines.push(
    "- When the user asks a factual question, answer it using the data below. If the data doesn't cover it, say so plainly AND ask the question that would let you fill the gap.",
  );
  lines.push(
    "- **When the user asks for analysis, drafting, suggestions, or new ideas — ALWAYS propose them via tools as part of your reply.** Don't ask permission first; don't end with \"Want me to build this out?\" Just propose, and the user clicks Apply or Discard.",
  );
  lines.push(
    "  Examples that should always produce a tool call:",
  );
  lines.push(
    '    • "Suggest N personas" → `update_brand_items(section: personas, mode: append, items: [...])`',
  );
  lines.push(
    '    • "Draft our positioning" → `update_brand_field(section: identity, fields: {positioning: "..."})`',
  );
  lines.push(
    '    • "What seed keywords should we use" → `update_brand_items(section: seed_keywords, mode: append, items: [...])`',
  );
  lines.push(
    '    • "Suggest 3 audience segments to test" → `update_brand_items(section: personas, mode: append, items: [...])` (each segment becomes a persona row) — AND `add_brain_entry(type: strategy)` capturing the testing plan',
  );
  lines.push(
    "- Tools only PROPOSE; the user clicks Apply on each card before anything is written. After calling a tool, briefly say what you proposed and why.",
  );
  lines.push(
    "- It's normal to call MULTIPLE tools in one reply (e.g., update_brand_items + add_brain_entry together). Default to MORE proposals, not fewer — the user can Discard the ones they don't want.",
  );
  lines.push(
    "- Be concise. Mirror the brand's voice (see Voice & Tone) when drafting anything that would appear in copy.",
  );
  lines.push(
    "- Format with plain prose. Avoid markdown headers (`#`, `##`, `###`) and horizontal rules (`---`); use **bold** + short paragraphs + bullet lists instead. The chat UI renders inline markdown but not block-level headers.",
  );
  lines.push(
    "- When you reference a specific Brand DNA field in prose, name it in **bold** so the user can navigate to the editor.",
  );
  lines.push("");
  lines.push("# Ambient Project Brain capture (IMPORTANT)");
  lines.push(
    "Throughout the conversation, watch for signal — corrections, preferences, decisions, strategic intent, problems revealed in passing. When you spot one, call `add_brain_entry` to capture it as part of your reply. Don't ask for permission first — propose it; the user will Apply or Discard.",
  );
  lines.push("");
  lines.push("Map signal → type:");
  lines.push(
    '- User corrects something or pushes back on a draft → `preference` ("Brand prefers shorter sentences" / "Avoid the word \\"premium\\"")',
  );
  lines.push(
    "- User announces a committed direction → `strategy` (\"Pivoting to high-end real estate marketers\")",
  );
  lines.push(
    '- User describes something currently in progress or ongoing → `working` ("Migrating to Shopify Plus this quarter")',
  );
  lines.push(
    '- User reveals a known problem or risk → `issue` ("Pricing page confuses buyers" / "Insurance compliance gap on /services")',
  );
  lines.push(
    '- User shares a fact or observation worth remembering → `research` ("Top competitor X is undercutting on enterprise tier")',
  );
  lines.push(
    '- You arrive at a sharper observation explaining existing behavior → `insight` ("Conversion drops on /pricing because the table hides setup fees below the fold")',
  );
  lines.push("");
  lines.push(
    "Set `confidence`: 0.9+ for direct user statements; 0.6–0.8 for clear inferences; below 0.6 don't bother — drop it.",
  );
  lines.push("");
  lines.push("# When to use which tool");
  lines.push(
    "- **research_brand_topic** — EXECUTES IMMEDIATELY. Use when the user asks something this brief doesn't cover (e.g. \"what trust signals does the homepage feature?\"). The tool fetches the homepage + /about and returns findings inline. You can then chain into update_brand_field / update_brand_items with what you learned.",
  );
  lines.push(
    "- **update_brand_field** — for single-document sections (identity, voice_tone, future_audience, site_structure, goals). Pass partial field updates.",
  );
  lines.push(
    "- **update_brand_items** — for row-based sections (personas, offerings, brand_terms, proof, seed_keywords). Mode 'append' adds rows; 'replace' overwrites the whole list (use sparingly).",
  );
  lines.push(
    "- **add_brain_entry** — for the ambient capture above, AND for one-off notes that don't fit a Brand DNA section.",
  );
  lines.push("");
  lines.push("# Property metadata");
  lines.push(`- name: ${prop.name}`);
  lines.push(`- slug: ${prop.slug}`);
  lines.push(`- primary_domain: ${prop.primary_domain ?? "—"}`);
  lines.push(`- pipeline_phase: ${prop.pipeline_phase ?? "—"}`);
  if (prop.client?.name) lines.push(`- client: ${prop.client.name}`);
  lines.push("");
  if (sections.length === 0) {
    lines.push("# Brand DNA");
    lines.push(
      "_No Brand DNA sections filled in yet. If the user asks for brand-specific drafting, propose a starting Identity (via update_brand_field) using what you can infer from the property name, primary domain, and the conversation._",
    );
  } else {
    lines.push("# Brand DNA");
    for (const s of sections) {
      const formatted = formatSectionContent(s.content, s.body);
      if (!formatted) continue;
      lines.push(`\n## ${humanLabel(s.section)}`);
      lines.push(formatted);
    }
  }
  if (brain.length > 0) {
    lines.push("\n# Project Brain (active entries)");
    for (const b of brain) {
      lines.push(`\n## [${b.type}] ${b.title}`);
      lines.push(b.body);
    }
  }
  return lines.join("\n");
}

// ─── Tools the model can call ────────────────────────────────────────────

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
    name: "update_brand_field",
    description:
      "Propose setting fields on a single-document Brand DNA section. Use for: identity, voice_tone, future_audience (audiences), site_structure, goals (commercial policy). Pass only the fields you want to change; unmentioned fields are preserved.",
    input_schema: {
      type: "object",
      properties: {
        section: {
          type: "string",
          enum: [
            "identity",
            "voice_tone",
            "future_audience",
            "site_structure",
            "goals",
          ],
        },
        fields: {
          type: "object",
          description:
            "Map of field key → new value. Values may be strings, numbers, or arrays of strings (match the section's schema).",
        },
        rationale: {
          type: "string",
          description:
            "One- or two-sentence justification — what evidence or reasoning supports these changes.",
        },
      },
      required: ["section", "fields", "rationale"],
    },
  },
  {
    name: "update_brand_items",
    description:
      "Propose changes to a row-array Brand DNA section. Use for: personas, offerings, brand_terms, proof, seed_keywords. Mode 'append' adds rows; 'replace' overwrites the whole list. Each item should follow that section's schema. For brand_terms this writes to the branded_terms list (not exceptions).",
    input_schema: {
      type: "object",
      properties: {
        section: {
          type: "string",
          enum: [
            "personas",
            "offerings",
            "proof",
            "brand_terms",
            "seed_keywords",
          ],
        },
        mode: { type: "string", enum: ["append", "replace"] },
        items: {
          type: "array",
          description:
            "Array of row objects. Each object's keys match the section's row schema.",
          items: { type: "object", properties: {} },
        },
        rationale: { type: "string" },
      },
      required: ["section", "mode", "items", "rationale"],
    },
  },
  {
    name: "research_brand_topic",
    description:
      "Fetch the brand's homepage + /about page and synthesize an answer to a specific research query. Use when the user asks something the brand DNA below doesn't cover, OR when the user explicitly asks you to research a topic. This EXECUTES IMMEDIATELY (not a proposal) and returns findings inline; you can then chain into update_brand_field / update_brand_items / add_brain_entry with what you learned.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Specific question to research. Examples: 'What case studies does the brand feature?', 'Find evidence the brand makes its trust-signal claims.', 'List the named service tiers.'",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "add_brain_entry",
    description:
      "Propose adding a Project Brain entry — an observation, decision, preference, or issue. Used both for ambient capture during conversation AND for one-off notes that don't fit a structured Brand DNA section. Always set confidence based on how directly the user stated it.",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: [
            "issue",
            "working",
            "research",
            "preference",
            "strategy",
            "insight",
          ],
          description:
            "issue = known problem/risk; working = an in-progress effort the brand is doing now; research = factual finding; preference = user-stated taste/rule; strategy = a committed direction; insight = a sharper observation that explains existing behavior.",
        },
        title: { type: "string", description: "Short heading — one line." },
        body: {
          type: "string",
          description:
            "Full prose body of the entry. Stand on its own — agents will read this later without surrounding context.",
        },
        confidence: {
          type: "number",
          description:
            "0–1 confidence. 0.9+ for direct user statements; 0.6–0.8 for clear inferences from context; below 0.6 means the signal is too weak — don't propose at all.",
        },
        rationale: {
          type: "string",
          description:
            "What part of the conversation triggered this entry. Quote the user if helpful.",
        },
      },
      required: ["type", "title", "body", "confidence", "rationale"],
    },
  },
];

// ─── Message sanitization ────────────────────────────────────────────────

type ClientContentBlock =
  | { type: "text"; text: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
      status: "pending" | "applied" | "discarded" | "error";
      error?: string;
    };

type ClientMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; blocks: ClientContentBlock[] };

/** Fetch the brand's homepage + /about, then ask Claude to synthesize a
 *  specific answer to `query`. Used by the research_brand_topic tool so
 *  the assistant can volunteer findings inline without sending the user
 *  to the Research & Fill surface. */
async function runResearch(
  client: Anthropic,
  domain: string,
  propertyName: string,
  query: string,
  propertySlug: string,
): Promise<string> {
  if (!domain) {
    return "Skipped — no primary_domain on this property.";
  }
  const [home, about] = await Promise.all([
    fetchHomepage(domain),
    fetchAboutPage(domain),
  ]);
  if (!home && !about) {
    return `Couldn't fetch any content from ${domain}.`;
  }
  const content = [
    `[Homepage @ ${domain}]`,
    home,
    about ? `\n\n[About page @ ${domain}/about]` : "",
    about,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, HTML_MAX_CHARS);

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: RESEARCH_MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: `You're a research analyst examining the website of "${propertyName}" (${domain}).

Website content:
"""
${content}
"""

Research query: ${query}

Answer concisely and only from the content above. Quote specific phrases when relevant; if the website doesn't cover the query, say so plainly. Use **bold** for named items.`,
      },
    ],
  });
  await recordLlmCall({
    propertySlug,
    agent: "research-handoff",
    model: MODEL,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    metadata: { query },
  });
  const textBlock = res.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  return textBlock?.text ?? "No findings.";
}

function sanitizeMessages(raw: unknown): ClientMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ClientMessage[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const obj = m as Record<string, unknown>;
    if (obj.role === "user" && typeof obj.content === "string") {
      if (obj.content.trim()) out.push({ role: "user", content: obj.content });
    } else if (obj.role === "assistant" && Array.isArray(obj.blocks)) {
      const blocks = (obj.blocks as unknown[])
        .filter((b): b is ClientContentBlock => {
          if (!b || typeof b !== "object") return false;
          const bb = b as Record<string, unknown>;
          if (bb.type === "text" && typeof bb.text === "string") return true;
          if (
            bb.type === "tool_use" &&
            typeof bb.id === "string" &&
            typeof bb.name === "string" &&
            typeof bb.input === "object" &&
            typeof bb.status === "string"
          )
            return true;
          return false;
        });
      if (blocks.length > 0) out.push({ role: "assistant", blocks });
    }
  }
  return out.slice(-20);
}

/** Convert the client's chat history into Anthropic's API message shape,
 *  pairing each prior tool_use block with a tool_result block on the next
 *  user message so the conversation is well-formed. */
function toAnthropicMessages(
  client: ClientMessage[],
): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  // Track tool_use blocks from the most recent assistant turn that still
  // need a tool_result attached on the next user turn.
  let pendingToolUses: { id: string; status: string; error?: string }[] = [];

  for (const m of client) {
    if (m.role === "user") {
      const content: Anthropic.ContentBlockParam[] = [];
      for (const tu of pendingToolUses) {
        const resultText =
          tu.status === "applied"
            ? "Applied to brand DNA."
            : tu.status === "discarded"
              ? "User discarded the proposal."
              : tu.status === "error"
                ? `Apply failed: ${tu.error ?? "unknown error"}`
                : "Awaiting user review.";
        content.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: resultText,
        });
      }
      pendingToolUses = [];
      content.push({ type: "text", text: m.content });
      out.push({ role: "user", content });
    } else {
      // Assistant message — emit each block, track tool_use ids.
      const content: Anthropic.ContentBlockParam[] = [];
      pendingToolUses = [];
      for (const b of m.blocks) {
        if (b.type === "text") {
          if (b.text.trim()) content.push({ type: "text", text: b.text });
        } else {
          content.push({
            type: "tool_use",
            id: b.id,
            name: b.name,
            input: b.input,
          });
          pendingToolUses.push({
            id: b.id,
            status: b.status,
            error: b.error,
          });
        }
      }
      if (content.length === 0) continue;
      out.push({ role: "assistant", content });
    }
  }
  return out;
}

// ─── Route handler ───────────────────────────────────────────────────────

export async function POST(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;

  const authed = await requireWriteToken();
  if (!authed.ok) {
    return Response.json({ error: authed.error }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const clientMessages = sanitizeMessages(body?.messages);
  const scopedSection =
    typeof body?.scopedSection === "string" && body.scopedSection.trim()
      ? body.scopedSection.trim()
      : null;
  if (clientMessages.length === 0) {
    return Response.json({ error: "No messages provided." }, { status: 400 });
  }
  if (clientMessages[clientMessages.length - 1].role !== "user") {
    return Response.json(
      { error: "Last message must come from the user." },
      { status: 400 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not configured." },
      { status: 500 },
    );
  }

  const { prop, sections, brain } = await getBrandContext(slug);
  if (!prop) {
    return Response.json({ error: "Property not found." }, { status: 404 });
  }

  let systemPrompt = buildSystemPrompt(prop, sections, brain);
  if (scopedSection) {
    systemPrompt += `\n\n# Current focus\nThe user is on the editor for **${scopedSection.replace(/_/g, " ")}** right now. Bias your proposals toward this section unless the conversation clearly steers elsewhere. When they ask a generic question like "what should I add here?" assume they mean THIS section.`;
  }
  const anthropicMessages = toAnthropicMessages(clientMessages);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (p: object) => controller.enqueue(encodeEvent(p));
      const client = new Anthropic({ apiKey });

      // The conversation can iterate multiple times within one HTTP request
      // when the model calls auto-executable tools (research_brand_topic).
      // Propose-only tools (update_brand_field / update_brand_items /
      // add_brain_entry) just close the turn — the user reviews them.
      let conversation: Anthropic.MessageParam[] = anthropicMessages;

      try {
        for (let turn = 0; turn < MAX_TURNS; turn++) {
          type ToolBlockBuffer = {
            id: string;
            name: string;
            inputJson: string;
          };
          let currentTool: ToolBlockBuffer | null = null;
          const responseBlocks: Anthropic.ContentBlock[] = [];

          const response = client.messages.stream({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: systemPrompt,
            tools: TOOLS,
            messages: conversation,
          });

          for await (const event of response) {
            if (event.type === "content_block_start") {
              if (event.content_block.type === "tool_use") {
                currentTool = {
                  id: event.content_block.id,
                  name: event.content_block.name,
                  inputJson: "",
                };
              }
            } else if (event.type === "content_block_delta") {
              if (event.delta.type === "text_delta") {
                emit({ type: "delta", text: event.delta.text });
              } else if (
                event.delta.type === "input_json_delta" &&
                currentTool
              ) {
                currentTool.inputJson += event.delta.partial_json;
              }
            } else if (event.type === "content_block_stop") {
              if (currentTool) {
                let input: Record<string, unknown> = {};
                try {
                  input = currentTool.inputJson
                    ? JSON.parse(currentTool.inputJson)
                    : {};
                } catch (e) {
                  emit({
                    type: "proposal_error",
                    id: currentTool.id,
                    error: `Couldn't parse tool input: ${
                      e instanceof Error ? e.message : String(e)
                    }`,
                  });
                  currentTool = null;
                  continue;
                }
                // Propose-only tools: surface as a proposal card. The model
                // doesn't get a tool_result back in THIS turn — propose-only
                // tools end the assistant's reply.
                if (currentTool.name !== "research_brand_topic") {
                  emit({
                    type: "proposal",
                    id: currentTool.id,
                    tool: currentTool.name,
                    input,
                  });
                }
                currentTool = null;
              }
            }
          }

          // Pull the full assembled message so we know all tool_use blocks.
          const finalMessage = await response.finalMessage();
          for (const block of finalMessage.content) responseBlocks.push(block);

          // Usage telemetry — awaited so it completes before the serverless
          // function terminates. Adds ~300ms between turns but no perceived
          // latency since the user has already seen this turn's deltas.
          await recordLlmCall({
            propertySlug: slug,
            agent: "assistant",
            model: MODEL,
            inputTokens: finalMessage.usage.input_tokens,
            outputTokens: finalMessage.usage.output_tokens,
            metadata: {
              turn,
              scoped_section: scopedSection,
              tool_uses: finalMessage.content
                .filter((b) => b.type === "tool_use")
                .map((b) => (b as Anthropic.ToolUseBlock).name),
            },
          });

          // Find research_brand_topic calls that need server-side execution.
          const researchCalls = finalMessage.content.filter(
            (b): b is Anthropic.ToolUseBlock =>
              b.type === "tool_use" && b.name === "research_brand_topic",
          );

          if (researchCalls.length === 0) {
            // Done — no auto-execute tools. Whatever propose-only tool_use
            // blocks existed have already been emitted to the client.
            break;
          }

          // Append the assistant's turn to the conversation history.
          conversation = [
            ...conversation,
            { role: "assistant", content: finalMessage.content },
          ];

          // Execute each research call, build tool_result blocks. Synthesize
          // tool_results for propose-only tool_use blocks too — Anthropic's
          // API requires every tool_use to have a paired tool_result before
          // the next user message.
          const toolResults: Anthropic.ContentBlockParam[] = [];
          for (const block of finalMessage.content) {
            if (block.type !== "tool_use") continue;
            if (block.name === "research_brand_topic") {
              const query = String(
                (block.input as Record<string, unknown>)?.query ?? "",
              );
              emit({ type: "research_running", id: block.id, query });
              const finding = await runResearch(
                client,
                prop.primary_domain ?? "",
                prop.name,
                query,
                slug,
              );
              emit({
                type: "research_done",
                id: block.id,
                query,
                finding,
              });
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: finding,
              });
            } else {
              // Propose-only tools — synthetic "awaiting review" result.
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: "Awaiting user review.",
              });
            }
          }

          conversation = [
            ...conversation,
            { role: "user", content: toolResults },
          ];

          // Loop continues: the model gets the research findings + can
          // chain into proposals.
        }

        emit({ type: "done" });
        controller.close();
      } catch (e) {
        emit({
          type: "error",
          error: e instanceof Error ? e.message : String(e),
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
