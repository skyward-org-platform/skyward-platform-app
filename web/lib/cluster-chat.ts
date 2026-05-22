// Typed helpers for the per-cluster chat thread + message tables. One
// thread per cluster (idx_cluster_chat_thread_cluster is unique); messages
// are append-only in insertion order. Schema mirrors brand_dna_chat_*.

import { supabase } from "./supabase";

export type ChatRole = "user" | "assistant" | "tool";

export type ChatMessage = {
  id: string;
  thread_id: string;
  role: ChatRole;
  content: string;
  tool_calls: unknown | null;
  tool_results: unknown | null;
  created_at: string;
};

export async function getOrCreateClusterThread(args: {
  propertyId: string;
  clusterId: string;
  createdBy: string;
}): Promise<string> {
  const { data: existing } = await supabase
    .from("cluster_chat_thread")
    .select("id")
    .eq("cluster_id", args.clusterId)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data, error } = await supabase
    .from("cluster_chat_thread")
    .insert({
      property_id: args.propertyId,
      cluster_id: args.clusterId,
      created_by: args.createdBy,
    })
    .select("id")
    .single();
  if (error) throw new Error(`getOrCreateClusterThread: ${error.message}`);
  return data.id as string;
}

export async function getClusterMessages(threadId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("cluster_chat_message")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getClusterMessages: ${error.message}`);
  return (data ?? []) as ChatMessage[];
}

export async function appendMessage(
  threadId: string,
  role: ChatRole,
  content: string,
  tool_calls: unknown = null,
  tool_results: unknown = null,
): Promise<void> {
  const { error } = await supabase
    .from("cluster_chat_message")
    .insert({ thread_id: threadId, role, content, tool_calls, tool_results });
  if (error) throw new Error(`appendMessage: ${error.message}`);
}
