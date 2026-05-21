// /properties/[slug]/project-brain — v2 screen 16.
//
// Server component: fetches every brain entry for this property, hands off to
// the ProjectBrainList client component for filtering, search, new-entry
// composer, and per-card actions.

import { supabase } from "@/lib/supabase";
import {
  ProjectBrainList,
} from "@/components/ProjectBrainList";
import type { BrainEntry } from "@/components/ProjectBrainCard";

async function getEntries(slug: string): Promise<BrainEntry[]> {
  const { data: prop } = await supabase
    .from("property")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!prop) return [];
  const { data } = await supabase
    .from("project_brain_entry")
    .select("id, type, title, body, source, confidence, status, created_at, updated_at")
    .eq("property_id", prop.id)
    .order("updated_at", { ascending: false });
  return (data ?? []) as BrainEntry[];
}

export default async function ProjectBrainTab({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entries = await getEntries(slug);
  return <ProjectBrainList entries={entries} propertySlug={slug} />;
}
