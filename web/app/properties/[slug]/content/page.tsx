import { supabase } from "@/lib/supabase";
import { getContentRowsByProperty } from "@/lib/content-rows";
import { getClustersByProperty } from "@/lib/clusters";
import { ContentView } from "@/components/content/ContentView";

export default async function ContentTab({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { data: prop } = await supabase
    .from("property")
    .select("id, primary_domain, name")
    .eq("slug", slug)
    .single();
  if (!prop) {
    return <div className="p-8 text-sm text-muted-foreground">Property not found.</div>;
  }
  const [rows, clusters] = await Promise.all([
    getContentRowsByProperty(prop.id),
    getClustersByProperty(prop.id),
  ]);
  return (
    <ContentView
      propertySlug={slug}
      propertyId={prop.id}
      propertyName={prop.name}
      primaryDomain={prop.primary_domain}
      rows={rows}
      clusters={clusters}
    />
  );
}
