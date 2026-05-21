"use server";

// Persistent chat history for the Brand DNA Assistant. One row per turn in
// brand_dna_chat_message. Assistant turns store the full blocks array so
// proposal status (pending/applied/discarded/error) survives reloads.

import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { requireWriteToken } from "@/lib/auth";

export type AssistantBlock =
  | { type: "text"; text: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
      status: "pending" | "applied" | "discarded" | "error";
      error?: string;
      summary?: string;
    };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text?: string;
  blocks?: AssistantBlock[];
  created_at: string;
};

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };

async function resolveProperty(
  propertySlug: string,
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase
    .from("property")
    .select("id")
    .eq("slug", propertySlug)
    .single();
  if (error || !data) return { error: error?.message ?? "Property not found." };
  return { id: data.id };
}

export async function getChatHistory(
  propertySlug: string,
): Promise<ChatMessage[]> {
  const prop = await resolveProperty(propertySlug);
  if ("error" in prop) return [];
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

type SaveTurnOk = Ok<{
  userMessageId: string;
  assistantMessageId: string;
}>;

export async function saveChatTurn(
  propertySlug: string,
  userText: string,
  assistantBlocks: AssistantBlock[],
): Promise<SaveTurnOk | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;

  const prop = await resolveProperty(propertySlug);
  if ("error" in prop) return { ok: false, error: prop.error };

  const { data: userRow, error: userErr } = await supabase
    .from("brand_dna_chat_message")
    .insert({
      property_id: prop.id,
      role: "user",
      content: { text: userText },
    })
    .select("id")
    .single();
  if (userErr || !userRow) {
    return { ok: false, error: userErr?.message ?? "Insert (user) failed." };
  }

  const { data: assistantRow, error: assistantErr } = await supabase
    .from("brand_dna_chat_message")
    .insert({
      property_id: prop.id,
      role: "assistant",
      content: { blocks: assistantBlocks },
    })
    .select("id")
    .single();
  if (assistantErr || !assistantRow) {
    return {
      ok: false,
      error: assistantErr?.message ?? "Insert (assistant) failed.",
    };
  }

  return {
    ok: true,
    userMessageId: userRow.id,
    assistantMessageId: assistantRow.id,
  };
}

/** Update a single proposal's status inside an assistant turn's blocks array.
 *  Used when the user clicks Apply / Discard so the status sticks across
 *  reloads. */
export async function updateAssistantBlocks(
  messageId: string,
  blocks: AssistantBlock[],
): Promise<{ ok: true } | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;

  const { error } = await supabase
    .from("brand_dna_chat_message")
    .update({ content: { blocks } })
    .eq("id", messageId)
    .eq("role", "assistant");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function clearChatHistory(
  propertySlug: string,
): Promise<{ ok: true } | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;

  const prop = await resolveProperty(propertySlug);
  if ("error" in prop) return { ok: false, error: prop.error };

  const { error } = await supabase
    .from("brand_dna_chat_message")
    .delete()
    .eq("property_id", prop.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/properties/${propertySlug}/brand-dna`);
  return { ok: true };
}
