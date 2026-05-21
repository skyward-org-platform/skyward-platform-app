// Cross-property activity feed — fetcher used by the Activity page (v2
// screen 10). The dashboard's recent-activity card has similar inline logic
// for its top-8 view; that can be migrated onto this helper later if it
// becomes worth the refactor.
//
// Three Supabase reads in parallel, merged in memory and sorted by
// timestamp. No new schema:
//   - brand_dna_section_history → "Brand DNA edit" events
//   - page (audit_decided_at NOT NULL) → "Page audit" events
//   - project_brain_entry → "Project Brain" entry creates / updates
//
// Skipped (would need infra not yet in place):
//   - BQ Meta project events
//   - AI / system events

import { supabase } from "./supabase";

export type ActivityKind = "brand_dna_edit" | "page_audit" | "project_brain";

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  at: string;
  actor: string;
  property_id: string | null;
  property_name: string | null;
  property_slug: string | null;
  /** Short label — section name, audit action, brain entry title. */
  title: string;
  /** Free-form follow-up text (URL, body excerpt, etc.). */
  detail: string;
  /** Where clicking the activity row should go. */
  href: string;
};

/** Fetch up to `limit` activity items across all properties, newest first.
 *  Each source contributes up to `perSource` rows; merged and sliced. */
export async function getActivityFeed({
  limit = 100,
  perSource = 50,
}: {
  limit?: number;
  perSource?: number;
} = {}): Promise<ActivityItem[]> {
  const [editsRes, auditsRes, brainsRes] = await Promise.all([
    supabase
      .from("brand_dna_section_history")
      .select(
        `id, snapshotted_at, updated_by,
         section:section_id ( section,
           property:property_id ( id, name, slug ) )`,
      )
      .order("snapshotted_at", { ascending: false })
      .limit(perSource),
    supabase
      .from("page")
      .select(
        `id, audit_decided_at, audit_decided_by, audit_action, url,
         property:property_id ( id, name, slug )`,
      )
      .not("audit_decided_at", "is", null)
      .order("audit_decided_at", { ascending: false })
      .limit(perSource),
    supabase
      .from("project_brain_entry")
      .select(
        `id, created_at, updated_at, type, title, body, source, status,
         property:property_id ( id, name, slug )`,
      )
      .order("updated_at", { ascending: false })
      .limit(perSource),
  ]);

  const edits: ActivityItem[] = (
    (editsRes.data ?? []) as unknown as Array<{
      id: string;
      snapshotted_at: string;
      updated_by: string | null;
      section: {
        section: string;
        property: { id: string; name: string; slug: string } | null;
      } | null;
    }>
  ).map((e) => {
    const prop = e.section?.property ?? null;
    const sectionLabel = (e.section?.section ?? "section").replace(/_/g, " ");
    return {
      id: `edit:${e.id}`,
      kind: "brand_dna_edit",
      at: e.snapshotted_at,
      actor: e.updated_by ?? "unknown",
      property_id: prop?.id ?? null,
      property_name: prop?.name ?? null,
      property_slug: prop?.slug ?? null,
      title: `Brand DNA · ${sectionLabel}`,
      detail: prop?.name ? `on ${prop.name}` : "",
      href: prop?.slug
        ? `/properties/${prop.slug}/brand-dna/${sectionToSlug(e.section?.section ?? "")}`
        : "#",
    };
  });

  const audits: ActivityItem[] = (
    (auditsRes.data ?? []) as unknown as Array<{
      id: string;
      audit_decided_at: string;
      audit_decided_by: string | null;
      audit_action: string | null;
      url: string;
      property: { id: string; name: string; slug: string } | null;
    }>
  ).map((d) => ({
    id: `audit:${d.id}`,
    kind: "page_audit",
    at: d.audit_decided_at,
    actor: d.audit_decided_by ?? "unknown",
    property_id: d.property?.id ?? null,
    property_name: d.property?.name ?? null,
    property_slug: d.property?.slug ?? null,
    title: `Page · ${d.audit_action ?? "?"}`,
    detail: d.url,
    href: d.property?.slug ? `/properties/${d.property.slug}/pages` : "#",
  }));

  const brains: ActivityItem[] = (
    (brainsRes.data ?? []) as unknown as Array<{
      id: string;
      created_at: string;
      updated_at: string;
      type: string;
      title: string;
      body: string;
      source: string | null;
      status: string;
      property: { id: string; name: string; slug: string } | null;
    }>
  ).map((b) => {
    // If created_at == updated_at, treat as a create event; else as an update.
    const created = b.created_at === b.updated_at;
    const at = b.updated_at;
    return {
      id: `brain:${b.id}:${at}`,
      kind: "project_brain",
      at,
      actor: b.source ?? "agent",
      property_id: b.property?.id ?? null,
      property_name: b.property?.name ?? null,
      property_slug: b.property?.slug ?? null,
      title: `Project Brain · ${created ? "added" : "updated"} · ${b.type.replace(/_/g, " ")}`,
      detail: b.title,
      href: b.property?.slug
        ? `/properties/${b.property.slug}/project-brain`
        : "#",
    };
  });

  return [...edits, ...audits, ...brains]
    .sort((a, b) => +new Date(b.at) - +new Date(a.at))
    .slice(0, limit);
}

function sectionToSlug(section: string): string {
  switch (section) {
    case "identity":
      return "identity";
    case "voice_tone":
      return "voice-tone";
    case "offerings":
      return "offerings";
    case "brand_terms":
      return "brand-terms";
    case "proof":
      return "proof";
    case "site_structure":
      return "site-structure";
    case "goals":
      return "commercial-policy";
    case "future_audience":
      return "audiences";
    case "personas":
      return "personas";
    default:
      return "";
  }
}
