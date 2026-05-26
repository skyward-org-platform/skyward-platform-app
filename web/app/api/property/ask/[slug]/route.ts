// Property Assistant — streaming Anthropic endpoint scoped to a single
// property. The model has access to ALL_TOOLS (read-only at this stage)
// and may call them in a multi-turn agentic loop bounded by MAX_TURNS.
//
// Conversation history is provided by the client on every request and
// the new turn is persisted to property_chat_message after the loop ends.

import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";
import { requireWriteToken } from "@/lib/auth";
import { recordLlmCall } from "@/lib/llm-usage";
import { ALL_TOOLS } from "@/lib/property-assistant/tools";
import { dispatchToolCall } from "@/lib/property-assistant/dispatchers";
import { buildSystemPrompt } from "@/lib/property-assistant/system-prompt";
import type { RouteContext } from "@/lib/property-assistant/types";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 3000;
const MAX_TURNS = 5;

export const maxDuration = 120;

type PropertyRow = {
  id: string;
  name: string;
  primary_domain: string | null;
  client: { name: string } | null;
};

type RequestBody = {
  message: string;
  history: Array<{ role: "user" | "assistant"; content: unknown }>;
  route: RouteContext;
};

function encode(payload: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const authed = await requireWriteToken();
  if (!authed.ok) {
    return Response.json({ error: authed.error }, { status: 401 });
  }

  const { slug } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Partial<RequestBody>;
  const userMessage = typeof body.message === "string" ? body.message : "";
  const history = Array.isArray(body.history) ? body.history : [];
  const route: RouteContext = (body.route as RouteContext) ?? {
    pathname: "",
    search: "",
  };

  if (!userMessage.trim()) {
    return Response.json({ error: "No message provided." }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not configured." },
      { status: 500 },
    );
  }

  const { data: propData } = await supabase
    .from("property")
    .select("id, name, primary_domain, client:client_id(name)")
    .eq("slug", slug)
    .maybeSingle();
  const prop = (propData as unknown as PropertyRow) ?? null;
  if (!prop) {
    return Response.json({ error: "Property not found." }, { status: 404 });
  }

  const { data: missionRow } = await supabase
    .from("property_mission")
    .select("body")
    .eq("property_id", prop.id)
    .maybeSingle();
  const mission = (missionRow?.body as string | undefined) ?? null;

  const systemPrompt = buildSystemPrompt({
    propertyName: prop.name,
    propertyDomain: prop.primary_domain,
    clientName: prop.client?.name ?? null,
    mission,
    route,
  });

  const anthropicTools = ALL_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as never,
  }));

  const messages: Anthropic.MessageParam[] = [
    ...(history as Anthropic.MessageParam[]),
    { role: "user", content: userMessage },
  ];

  const client = new Anthropic({ apiKey });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (p: object) => controller.enqueue(encode(p));

      try {
        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const resp = await client.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: systemPrompt,
            tools: anthropicTools,
            messages,
          });

          // Fire-and-forget usage telemetry.
          recordLlmCall({
            propertySlug: slug,
            agent: "assistant",
            model: MODEL,
            inputTokens: resp.usage.input_tokens,
            outputTokens: resp.usage.output_tokens,
            metadata: { turn, route_pathname: route.pathname },
          }).catch(() => {});

          // Emit each content block.
          for (const block of resp.content) {
            if (block.type === "text") {
              emit({ event: "delta", text: block.text });
            } else if (block.type === "tool_use") {
              emit({
                event: "tool_use",
                id: block.id,
                name: block.name,
                input: block.input,
              });
            }
          }

          messages.push({ role: "assistant", content: resp.content });

          if (resp.stop_reason !== "tool_use") break;

          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of resp.content) {
            if (block.type !== "tool_use") continue;
            const result = await dispatchToolCall(
              block.name,
              (block.input ?? {}) as Record<string, unknown>,
              {
                propertyId: prop.id,
                propertySlug: slug,
                primaryDomain: prop.primary_domain,
              },
            );
            emit({ event: "tool_result", id: block.id, result });
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          }

          messages.push({ role: "user", content: toolResults });
        }

        emit({ event: "done" });

        // Persist the new turn. The assistant content is stored as a
        // JSON string of the final assistant turn's content blocks so
        // tool_use + text are both round-trippable on the next request.
        const lastAssistant = [...messages]
          .reverse()
          .find((m) => m.role === "assistant");
        await supabase.from("property_chat_message").insert([
          {
            property_id: prop.id,
            role: "user",
            content: userMessage,
          },
          {
            property_id: prop.id,
            role: "assistant",
            content: JSON.stringify(lastAssistant?.content ?? []),
          },
        ]);
      } catch (e) {
        emit({
          event: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
