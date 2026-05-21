// /properties/[slug]/pages — unified Pages tab. WQA aggregate from BQ is
// the canonical row source; SOP-derived triage is the default action;
// human overrides in wqa_decision take precedence per-URL.

import { getPropertyBySlug } from "@/lib/property";
import { getWqaForDomain } from "@/lib/wqa";
import { getWqaDecisions } from "@/lib/wqa-decisions";
import { getExecutionByUrl } from "@/lib/page-execution";
import { getCheckStateByUrlCheck } from "@/lib/page-check-state";
import { PagesView } from "@/components/PagesView";

export default async function PagesTab({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const prop = await getPropertyBySlug(slug);
  const primaryDomain = prop?.primary_domain ?? null;
  const propertyId = prop?.id ?? null;

  const wqa = primaryDomain
    ? await getWqaForDomain(primaryDomain, "dev")
    : null;
  const decisions = await getWqaDecisions(slug);

  // Fetch the operator-side overlays (page_execution + page_check_state) so
  // the drawer can render status/owner/due/check-status without a second
  // round-trip. Both reads are property-scoped and return Maps the client
  // can index in O(1).
  const [executions, checkStates] = propertyId
    ? await Promise.all([
        getExecutionByUrl(propertyId),
        getCheckStateByUrlCheck(propertyId),
      ])
    : [new Map(), new Map()];

  const wqaPayload =
    wqa && "ok" in wqa && wqa.ok
      ? {
          rows: wqa.rows,
          summary: wqa.site_summary,
          projectId: wqa.project_id,
          version: wqa.version,
          dataset: wqa.dataset,
          message: wqa.message,
        }
      : null;
  const wqaError = wqa && "ok" in wqa && !wqa.ok ? wqa.error : null;

  return (
    <PagesView
      propertySlug={slug}
      propertyId={propertyId}
      wqa={wqaPayload}
      wqaError={wqaError}
      primaryDomain={primaryDomain}
      decisions={decisions}
      executions={Array.from(executions.values())}
      checkStates={Array.from(checkStates.values())}
    />
  );
}
