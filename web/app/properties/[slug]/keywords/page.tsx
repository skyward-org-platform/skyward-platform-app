import { supabase } from "@/lib/supabase";
import { getKeywordsByProperty } from "@/lib/keywords";
import {
  getClustersByProperty,
  getClusterMembersByProperty,
  getUrlAssignmentsByProperty,
} from "@/lib/clusters";
import { KeywordsView } from "@/components/keywords/KeywordsView";

async function getProperty(slug: string) {
  const { data } = await supabase
    .from("property")
    .select("id, primary_domain, name")
    .eq("slug", slug)
    .single();
  return data ?? null;
}

export default async function KeywordsTab({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const prop = await getProperty(slug);
  if (!prop) {
    return <div className="p-8 text-sm text-muted-foreground">Property not found.</div>;
  }

  const [keywords, clusters, members, urlAssignments] = await Promise.all([
    getKeywordsByProperty(prop.id),
    getClustersByProperty(prop.id),
    getClusterMembersByProperty(prop.id),
    getUrlAssignmentsByProperty(prop.id),
  ]);

  return (
    <KeywordsView
      propertySlug={slug}
      propertyId={prop.id}
      propertyName={prop.name}
      primaryDomain={prop.primary_domain}
      keywords={keywords}
      clusters={clusters}
      clusterMembers={members}
      urlAssignments={urlAssignments}
    />
  );
}
