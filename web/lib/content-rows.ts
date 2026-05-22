import { supabase } from "./supabase";

export type ContentStatus = "Not Started" | "Brief" | "Draft" | "Review" | "Published";
export type ContentActionType = "Optimize" | "Refresh" | "Rewrite" | "New" | "Remove";
export type ContentSource = "phase1_optimize" | "phase1_restore" | "phase3_gap_cluster";
export type ContentBriefStatus = "Not Started" | "In Progress" | "Approved";
export type ContentCalendarStatus = "Scheduled" | "Slipped" | "Done";

export type ContentRow = {
  id: string;
  property_id: string;
  url: string;
  source: ContentSource;
  cluster_id: string | null;

  vertical: string | null;
  action_type: ContentActionType;
  action_type_override: ContentActionType | null;
  page_type: string | null;
  parent_page: string | null;
  priority_tier: string | null;
  target_keyword: string | null;

  sprint: number | null;
  brief_due: string | null;
  draft_due: string | null;
  target_publish: string | null;
  owners: string | null;
  calendar_status: ContentCalendarStatus;

  title_formatted: string | null;
  title_override: string | null;
  h1_target: string | null;
  h1_override: string | null;
  meta_description_spec: string | null;
  meta_description_override: string | null;
  word_count_target: string | null;
  phase2_yellow_resolution: string | null;
  brief_status: ContentBriefStatus;

  entities_blocked: string;
  faqs_blocked: string;
  fanout_blocked: string;

  status: ContentStatus;
  writer: string | null;
  word_count_actual: number | null;
  draft_link: string | null;
  published_url: string | null;
  feedback_notes: string | null;

  dependencies: string | null;
  internal_links_out: string | null;
  internal_links_in: string | null;
  current_schema: string | null;
  required_schema: string | null;
  jsonld_notes: string | null;
  post_publish_tasks: string | null;

  rank_30d: number | null;
  rank_60d: number | null;
  rank_90d: number | null;

  computed_at: string;
  updated_by: string;
  updated_at: string;
};

export async function getContentRowsByProperty(propertyId: string): Promise<ContentRow[]> {
  const { data, error } = await supabase
    .from("content_row")
    .select("*")
    .eq("property_id", propertyId);
  if (error) throw new Error(`getContentRowsByProperty: ${error.message}`);
  return (data ?? []) as ContentRow[];
}

export type ContentRowUpdate = {
  id: string;
  updated_by: string;
} & Partial<Pick<
  ContentRow,
  "status" | "writer" | "sprint" | "brief_status" | "calendar_status"
    | "action_type_override" | "title_override" | "h1_override"
    | "meta_description_override" | "draft_link" | "published_url"
    | "word_count_actual" | "feedback_notes" | "owners"
    | "rank_30d" | "rank_60d" | "rank_90d"
>>;

export async function updateContentRow(input: ContentRowUpdate): Promise<ContentRow> {
  const { id, updated_by, ...changes } = input;
  const { data, error } = await supabase
    .from("content_row")
    .update({ ...changes, updated_by, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`updateContentRow: ${error.message}`);
  return data as ContentRow;
}
