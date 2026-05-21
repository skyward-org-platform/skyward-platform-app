// Streaming endpoint for a single section's Research & Fill pass.
//
// Emits Server-Sent Events as the work progresses:
//   { phase: "fetching_homepage" }
//   { phase: "fetching_about" }
//   { phase: "asking_claude" }
//   { phase: "saving" }
//   { phase: "done", filledKeys: [...] }
//   { phase: "error", error: "..." }
//
// Lets the client surface real milestones in the section's status pill
// instead of a single opaque "Researching…" spinner. Same auth gate as the
// equivalent server action (requireWriteToken via the skw_write cookie).

import Anthropic from "@anthropic-ai/sdk";
import { recordLlmCall } from "@/lib/llm-usage";
import { supabase } from "@/lib/supabase";
import { requireWriteToken } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import {
  buildResearchPrompt,
  fetchHomepage,
  fetchAboutPage,
  getTool,
  isResearchable,
  HTML_MAX_CHARS,
  MODEL,
  MAX_TOKENS,
  SYSTEM_PROMPT,
} from "@/lib/research";

// Keep this well under the Vercel function timeout. A typical section
// finishes in 10-60s; allow up to 120s for slow pages.
export const maxDuration = 120;

type Phase =
  | { phase: "fetching_homepage" }
  | { phase: "fetching_about" }
  | { phase: "asking_claude" }
  | { phase: "saving" }
  | { phase: "done"; filledKeys: string[] }
  | { phase: "error"; error: string };

function encodeEvent(payload: Phase): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ slug: string; section: string }> },
) {
  const { slug, section } = await ctx.params;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (p: Phase) => controller.enqueue(encodeEvent(p));
      const fail = (msg: string) => {
        emit({ phase: "error", error: msg });
        controller.close();
      };

      const authed = await requireWriteToken();
      if (!authed.ok) {
        return fail(authed.error);
      }

      if (!isResearchable(section)) {
        return fail(`Section ${section} isn't researchable.`);
      }

      // Look up property + domain.
      const { data: prop, error: propErr } = await supabase
        .from("property")
        .select("id, name, primary_domain")
        .eq("slug", slug)
        .single();
      if (propErr || !prop) return fail("Property not found.");
      if (!prop.primary_domain) {
        return fail(
          "Property has no primary_domain — set one before researching.",
        );
      }

      // Fetch homepage.
      emit({ phase: "fetching_homepage" });
      const homeText = await fetchHomepage(prop.primary_domain);
      if (!homeText) return fail(`Couldn't fetch ${prop.primary_domain}.`);

      // Fetch /about.
      emit({ phase: "fetching_about" });
      const aboutText = await fetchAboutPage(prop.primary_domain);

      const combined = [
        `[Homepage]\n${homeText}`,
        aboutText ? `\n\n[About page]\n${aboutText}` : "",
      ]
        .join("")
        .slice(0, HTML_MAX_CHARS);

      // Ask Claude.
      emit({ phase: "asking_claude" });
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return fail("ANTHROPIC_API_KEY is not configured.");

      const tool = getTool(section);
      const userPrompt = buildResearchPrompt(
        prop.name ?? slug,
        prop.primary_domain,
        combined,
        section,
      );

      const client = new Anthropic({ apiKey });
      let toolInput: Record<string, unknown> | null = null;
      try {
        const res = await client.messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          tools: [tool],
          tool_choice: { type: "tool", name: tool.name },
          messages: [{ role: "user", content: userPrompt }],
        });
        await recordLlmCall({
          propertySlug: slug,
          agent: "research-fill",
          model: MODEL,
          inputTokens: res.usage.input_tokens,
          outputTokens: res.usage.output_tokens,
          metadata: { section },
        });
        const toolUse = res.content.find(
          (block): block is Anthropic.ToolUseBlock =>
            block.type === "tool_use",
        );
        if (!toolUse) return fail("Model didn't call the publish tool.");
        toolInput = toolUse.input as Record<string, unknown>;
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }

      // Drop empty values so a low-confidence pass can't blow away edits.
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(toolInput)) {
        if (v === null || v === undefined) continue;
        if (typeof v === "string" && v.trim() === "") continue;
        if (Array.isArray(v) && v.length === 0) continue;
        cleaned[k] = v;
      }
      const filledKeys = Object.keys(cleaned);
      if (filledKeys.length === 0) {
        return fail("Research returned no usable fields.");
      }

      // Save.
      emit({ phase: "saving" });
      const operator = `${getOperator()} (research)`;
      const now = new Date().toISOString();

      const { data: existing, error: readErr } = await supabase
        .from("brand_dna_section")
        .select("id, content")
        .eq("property_id", prop.id)
        .eq("section", section)
        .maybeSingle();
      if (readErr) return fail(readErr.message);

      if (!existing) {
        const { error: insertErr } = await supabase
          .from("brand_dna_section")
          .insert({
            property_id: prop.id,
            section,
            content: cleaned,
            source: "ai:research-and-fill",
            updated_by: operator,
            updated_at: now,
          });
        if (insertErr) return fail(insertErr.message);
      } else {
        const nextContent = {
          ...((existing.content as Record<string, unknown>) ?? {}),
          ...cleaned,
        };
        const { error: updErr } = await supabase
          .from("brand_dna_section")
          .update({
            content: nextContent,
            source: "ai:research-and-fill",
            updated_by: operator,
            updated_at: now,
          })
          .eq("id", existing.id);
        if (updErr) return fail(updErr.message);
      }

      emit({ phase: "done", filledKeys });
      controller.close();
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
