"use server";

import { revalidatePath } from "next/cache";
import { requireWriteToken } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import { supabase } from "@/lib/supabase";
import {
  upsertKeyword,
  type KeywordStatus,
} from "@/lib/keywords";
import {
  updateCluster,
  moveKeywordToCluster as moveKeyword,
  setUrlClusterAssignment as setUrlCluster,
  type ClusterPriority,
  type ClusterState,
  type ClusterPageAction,
} from "@/lib/clusters";
import {
  appendMessage,
  getClusterMessages,
  getOrCreateClusterThread,
  type ChatMessage,
} from "@/lib/cluster-chat";

type Ok = { ok: true };
type Err = { ok: false; error: string };

async function resolveProperty(slug: string): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase
    .from("property")
    .select("id")
    .eq("slug", slug)
    .single();
  if (error || !data) return { error: error?.message ?? "Property not found" };
  return { id: data.id };
}

function bust(slug: string) {
  revalidatePath(`/properties/${slug}/keywords`);
}

// ─── keyword ────────────────────────────────────────────────────────────────
export async function setKeywordStatus(
  slug: string,
  keyword: string,
  status: KeywordStatus,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const prop = await resolveProperty(slug);
  if ("error" in prop) return { ok: false, error: prop.error };
  try {
    await upsertKeyword({
      property_id: prop.id,
      keyword,
      status,
      updated_by: getOperator(),
    });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setKeywordNotes(
  slug: string,
  keyword: string,
  notes: string | null,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const prop = await resolveProperty(slug);
  if ("error" in prop) return { ok: false, error: prop.error };
  try {
    await upsertKeyword({
      property_id: prop.id,
      keyword,
      notes,
      updated_by: getOperator(),
    });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── cluster ────────────────────────────────────────────────────────────────
export async function setClusterPriority(
  slug: string,
  clusterId: string,
  priority: ClusterPriority,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  try {
    await updateCluster({ id: clusterId, priority, updated_by: getOperator() });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setClusterField(
  slug: string,
  clusterId: string,
  field: "name_override" | "state" | "page_action" | "notes",
  value: string | null,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const update: Parameters<typeof updateCluster>[0] = {
    id: clusterId,
    updated_by: getOperator(),
  };
  if (field === "state") {
    if (value !== "open" && value !== "closed") {
      return { ok: false, error: "state must be 'open' or 'closed'" };
    }
    update.state = value as ClusterState;
  } else if (field === "page_action") {
    update.page_action = (value as ClusterPageAction | null) ?? null;
  } else {
    update[field] = value;
  }
  try {
    await updateCluster(update);
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function moveKeywordToCluster(
  slug: string,
  keyword: string,
  fromClusterId: string | null,
  toClusterId: string,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  try {
    await moveKeyword({
      keyword,
      fromClusterId,
      toClusterId,
      movedBy: getOperator(),
    });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setUrlClusterAssignment(
  slug: string,
  url: string,
  clusterId: string,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const prop = await resolveProperty(slug);
  if ("error" in prop) return { ok: false, error: prop.error };
  try {
    await setUrlCluster({
      propertyId: prop.id,
      url,
      primaryClusterId: clusterId,
      updatedBy: getOperator(),
    });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── cluster chat ───────────────────────────────────────────────────────────
// One thread per cluster. Each call appends the user turn, runs the agent
// (stub here; real runner lands in 5.3), and appends the assistant turn.

export type PostClusterChatResult =
  | { ok: true; messages: ChatMessage[] }
  | { ok: false; error: string };

export async function getClusterChatThread(
  slug: string,
  clusterId: string,
): Promise<PostClusterChatResult> {
  const prop = await resolveProperty(slug);
  if ("error" in prop) return { ok: false, error: prop.error };
  try {
    const threadId = await getOrCreateClusterThread({
      propertyId: prop.id,
      clusterId,
      createdBy: getOperator(),
    });
    const messages = await getClusterMessages(threadId);
    return { ok: true, messages };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function postClusterChatMessage(
  slug: string,
  clusterId: string,
  content: string,
): Promise<PostClusterChatResult> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const prop = await resolveProperty(slug);
  if ("error" in prop) return { ok: false, error: prop.error };

  const trimmed = content.trim();
  if (!trimmed) return { ok: false, error: "Empty message." };

  const op = getOperator();
  try {
    const threadId = await getOrCreateClusterThread({
      propertyId: prop.id,
      clusterId,
      createdBy: op,
    });
    await appendMessage(threadId, "user", trimmed);

    // V1 stub assistant reply. Real runner with Anthropic + 4 tools lands
    // in Task 5.3 — replace this block with `runClusterChat(...)` from
    // web/inference/cluster-chat/runner.ts.
    const reply = `(stub) Received: "${trimmed}". Tools wiring lands in 5.3.`;
    await appendMessage(threadId, "assistant", reply);

    const messages = await getClusterMessages(threadId);
    bust(slug);
    return { ok: true, messages };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
