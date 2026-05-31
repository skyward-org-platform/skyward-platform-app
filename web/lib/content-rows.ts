import { supabase } from "./supabase";

export type ContentStatus = "Not Started" | "Brief" | "Draft" | "Review" | "Published";
export type ContentActionType = "Optimize" | "Refresh" | "Rewrite" | "New" | "Remove";
export type ContentSource = "phase1_optimize" | "phase1_restore" | "phase3_gap_cluster";
export type ContentBriefStatus = "Not Started" | "In Progress" | "Approved";
export type ContentCalendarStatus = "Scheduled" | "Slipped" | "Done";
export type ContentPillar =
  | "informational"
  | "educational"
  | "emotional"
  | "commercial";

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
  reviewer: string | null;
  word_count_actual: number | null;
  draft_link: string | null;
  published_url: string | null;
  published_at: string | null;
  feedback_notes: string | null;
  pillar: ContentPillar | null;
  why_it_matters: string | null;

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

// ─── Portfolio (cross-property) view ────────────────────────────────────────
// One content_row enriched with its property slug/name + client name, so the
// top-level /content dashboard can show every piece across the book of
// business without the operator drilling into each property. Solves the
// "no 30,000-ft view" pain (call 146940114).

export type PortfolioContentRow = ContentRow & {
  property_slug: string;
  property_name: string;
  client_name: string | null;
};

type PortfolioEmbed = ContentRow & {
  property: {
    slug: string;
    name: string;
    client: { name: string } | null;
  } | null;
};

// PostgREST defaults to a 1000-row page; content_row is ~3.5k across the
// portfolio, so we page through explicitly in 1000-row ranges.
const PORTFOLIO_PAGE = 1000;

export async function getPortfolioContentRows(): Promise<PortfolioContentRow[]> {
  const out: PortfolioContentRow[] = [];
  for (let from = 0; ; from += PORTFOLIO_PAGE) {
    const { data, error } = await supabase
      .from("content_row")
      .select("*, property:property_id(slug,name,client:client_id(name))")
      .order("property_id", { ascending: true })
      .order("url", { ascending: true })
      .range(from, from + PORTFOLIO_PAGE - 1);
    if (error) throw new Error(`getPortfolioContentRows: ${error.message}`);
    const page = (data ?? []) as unknown as PortfolioEmbed[];
    for (const r of page) {
      const { property, ...row } = r;
      out.push({
        ...(row as ContentRow),
        property_slug: property?.slug ?? "",
        property_name: property?.name ?? "(unknown)",
        client_name: property?.client?.name ?? null,
      });
    }
    if (page.length < PORTFOLIO_PAGE) break;
  }
  return out;
}

// ─── History reader ─────────────────────────────────────────────────────────
// content_row_history is populated by the before-update snapshot trigger.
// Surfaced in the drawer timeline so operators can see what moved / what's
// held up (the "published task disappeared" pain, call 146940114).

export type ContentRowHistory = {
  id: string;
  content_row_id: string;
  status: ContentStatus | null;
  writer: string | null;
  sprint: number | null;
  brief_status: ContentBriefStatus | null;
  calendar_status: ContentCalendarStatus | null;
  draft_link: string | null;
  published_url: string | null;
  feedback_notes: string | null;
  updated_by: string;
  snapshotted_at: string;
};

export async function getContentRowHistory(
  contentRowId: string,
  limit = 20,
): Promise<ContentRowHistory[]> {
  const { data, error } = await supabase
    .from("content_row_history")
    .select(
      "id, content_row_id, status, writer, sprint, brief_status, calendar_status, draft_link, published_url, feedback_notes, updated_by, snapshotted_at",
    )
    .eq("content_row_id", contentRowId)
    .order("snapshotted_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getContentRowHistory: ${error.message}`);
  return (data ?? []) as ContentRowHistory[];
}

// Whether the M1 columns (reviewer / published_at / pillar / why_it_matters)
// exist yet. The migration db/supabase/migrations/20260531_content_row_m1.sql
// may not be applied in every environment, so the review/publish actions probe
// once and degrade gracefully when it's absent. Only the positive result is
// memoized, so the app self-heals on the next call after the migration lands
// (no server restart needed).
let _m1Supported = false;
export async function contentRowSupportsM1(): Promise<boolean> {
  if (_m1Supported) return true;
  const { error } = await supabase.from("content_row").select("reviewer").limit(1);
  if (!error) {
    _m1Supported = true;
    return true;
  }
  return false;
}

export async function getContentRowById(id: string): Promise<ContentRow | null> {
  const { data, error } = await supabase
    .from("content_row")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getContentRowById: ${error.message}`);
  return (data as ContentRow | null) ?? null;
}

export type ContentRowUpdate = {
  id: string;
  updated_by: string;
} & Partial<Pick<
  ContentRow,
  "status" | "writer" | "reviewer" | "sprint" | "brief_status" | "calendar_status"
    | "action_type_override" | "title_override" | "h1_override"
    | "meta_description_override" | "draft_link" | "published_url" | "published_at"
    | "word_count_actual" | "feedback_notes" | "owners" | "pillar" | "why_it_matters"
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
