import { supabase } from "./supabase";

export type ClusterPriority = "High" | "Watch" | "Low" | "Unset";
export type ClusterState = "open" | "closed";
export type ClusterPageAction = "build_new" | "optimize_existing" | "remove" | "skip";

export type ClusterRow = {
  id: string;
  property_id: string;
  cluster_number: number;
  head_term: string;
  name_override: string | null;
  priority: ClusterPriority;
  state: ClusterState;
  page_action: ClusterPageAction | null;
  member_count: number;
  total_sv: number;
  max_sv: number;
  avg_kd: number | null;
  notes: string | null;
  computed_at: string;
  updated_by: string;
  updated_at: string;
};

export type ClusterMemberRow = {
  cluster_id: string;
  keyword: string;
  assignment: "algorithm" | "manual";
  moved_by: string | null;
  moved_at: string | null;
};

export type UrlClusterAssignmentRow = {
  id: string;
  property_id: string;
  url: string;
  primary_cluster_id: string;
  score: number;
  assignment: "algorithm" | "manual";
  computed_at: string;
  updated_by: string;
  updated_at: string;
};

export async function getClustersByProperty(propertyId: string): Promise<ClusterRow[]> {
  const { data, error } = await supabase
    .from("keyword_cluster")
    .select("*")
    .eq("property_id", propertyId)
    .order("total_sv", { ascending: false });
  if (error) throw new Error(`getClustersByProperty: ${error.message}`);
  return (data ?? []) as ClusterRow[];
}

export async function getClusterMembersByProperty(propertyId: string): Promise<ClusterMemberRow[]> {
  const { data, error } = await supabase
    .from("keyword_cluster_member")
    .select("cluster_id, keyword, assignment, moved_by, moved_at, keyword_cluster!inner(property_id)")
    .eq("keyword_cluster.property_id", propertyId);
  if (error) throw new Error(`getClusterMembersByProperty: ${error.message}`);
  return (data ?? []) as unknown as ClusterMemberRow[];
}

export async function getUrlAssignmentsByProperty(propertyId: string): Promise<UrlClusterAssignmentRow[]> {
  const { data, error } = await supabase
    .from("page_cluster_assignment")
    .select("*")
    .eq("property_id", propertyId);
  if (error) throw new Error(`getUrlAssignmentsByProperty: ${error.message}`);
  return (data ?? []) as UrlClusterAssignmentRow[];
}

export type ClusterUpdate = {
  id: string;
  priority?: ClusterPriority;
  name_override?: string | null;
  state?: ClusterState;
  page_action?: ClusterPageAction | null;
  notes?: string | null;
  updated_by: string;
};

export async function updateCluster(input: ClusterUpdate): Promise<ClusterRow> {
  const { id, updated_by, ...changes } = input;
  const { data, error } = await supabase
    .from("keyword_cluster")
    .update({ ...changes, updated_by, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`updateCluster: ${error.message}`);
  return data as ClusterRow;
}

export async function moveKeywordToCluster(args: {
  keyword: string;
  fromClusterId: string | null;
  toClusterId: string;
  movedBy: string;
}) {
  // Delete from old cluster (if any)
  if (args.fromClusterId) {
    const { error: delErr } = await supabase
      .from("keyword_cluster_member")
      .delete()
      .eq("cluster_id", args.fromClusterId)
      .eq("keyword", args.keyword);
    if (delErr) throw new Error(`moveKeyword (delete): ${delErr.message}`);
  }
  const { error } = await supabase
    .from("keyword_cluster_member")
    .upsert({
      cluster_id: args.toClusterId,
      keyword: args.keyword,
      assignment: "manual",
      moved_by: args.movedBy,
      moved_at: new Date().toISOString(),
    }, { onConflict: "cluster_id,keyword" });
  if (error) throw new Error(`moveKeyword (insert): ${error.message}`);
}

export async function setUrlClusterAssignment(args: {
  propertyId: string;
  url: string;
  primaryClusterId: string;
  updatedBy: string;
}) {
  const { error } = await supabase
    .from("page_cluster_assignment")
    .update({
      primary_cluster_id: args.primaryClusterId,
      assignment: "manual",
      updated_by: args.updatedBy,
      updated_at: new Date().toISOString(),
    })
    .eq("property_id", args.propertyId)
    .eq("url", args.url);
  if (error) throw new Error(`setUrlClusterAssignment: ${error.message}`);
}
