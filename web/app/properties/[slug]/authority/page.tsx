import { supabase } from "@/lib/supabase";
import {
  getSiteSnapshots,
  getReferringDomains,
  getDisavowEntries,
  getAuditDocs,
  computeAlerts,
  getBacklinksByProperty,
  getLinkProspectsByProperty,
  getLatestLinkAudit,
  getLinkAuditHistory,
} from "@/lib/authority";
import { AuthorityView } from "@/components/authority/AuthorityView";

async function getProperty(slug: string) {
  const { data } = await supabase
    .from("property")
    .select("id, primary_domain, name")
    .eq("slug", slug)
    .single();
  return data ?? null;
}

export default async function AuthorityTab({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const prop = await getProperty(slug);
  if (!prop) {
    return <div className="p-8 text-sm text-muted-foreground">Property not found.</div>;
  }

  const [
    snapshots,
    refDomains,
    disavow,
    audits,
    backlinks,
    prospects,
    latestAudit,
    auditHistory,
  ] = await Promise.all([
    getSiteSnapshots(prop.id),
    getReferringDomains(prop.id),
    getDisavowEntries(prop.id),
    getAuditDocs(prop.id),
    getBacklinksByProperty(prop.id),
    getLinkProspectsByProperty(prop.id),
    getLatestLinkAudit(prop.id),
    getLinkAuditHistory(prop.id, 20),
  ]);
  const alerts = computeAlerts(snapshots, refDomains, disavow);

  return (
    <AuthorityView
      propertySlug={slug}
      propertyId={prop.id}
      propertyName={prop.name}
      primaryDomain={prop.primary_domain}
      snapshots={snapshots}
      refDomains={refDomains}
      disavow={disavow}
      audits={audits}
      alerts={alerts}
      backlinks={backlinks}
      prospects={prospects}
      latestAudit={latestAudit}
      auditHistory={auditHistory}
    />
  );
}
