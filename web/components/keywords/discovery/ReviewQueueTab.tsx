"use client";

// Review Queue — the slice of the universe that needs human triage.
// Functionally: keywords where status = 'Candidate' sorted by
// relevance_score desc. Reuses UniverseTab with a forced status filter
// so the universal column filters + cluster column + relevance pill
// come along for free.
//
// (Replaces the old "Opportunities" tab — same data, more accurate name.)

import { TabHeader } from "@/components/wqa/helpers";
import { UniverseTab } from "./UniverseTab";
import type { KeywordsViewProps, RowClickHandler } from "../KeywordsView";
import type { ClusterRow } from "@/lib/clusters";
import { useMemo } from "react";

export function ReviewQueueTab(
  props: KeywordsViewProps & {
    onRowClick?: RowClickHandler;
    onClusterClick?: (cluster: ClusterRow) => void;
  },
) {
  // Sort Candidate keywords by relevance desc before passing through, so
  // analysts see the highest-signal items first. UniverseTab is a stable
  // filter pipeline so this ordering survives.
  const sorted = useMemo(() => {
    return [...props.keywords].sort((a, b) => {
      const ra = a.relevance_score ?? -1;
      const rb = b.relevance_score ?? -1;
      if (ra !== rb) return rb - ra;
      return a.keyword.localeCompare(b.keyword);
    });
  }, [props.keywords]);

  const candidateCount = sorted.filter((k) => k.status === "Candidate").length;

  return (
    <section>
      <TabHeader
        title="Review Queue"
        subtitle={
          <>
            Keywords still in <span className="font-semibold">Candidate</span>{" "}
            status — auto-ingested but not yet triaged. Set status to
            Retained or Excluded to clear them from the queue.
          </>
        }
        count={candidateCount}
        total={props.keywords.length}
      />
      <UniverseTab
        {...props}
        keywords={sorted}
        forceStatuses={["Candidate"]}
        hideHeader
      />
    </section>
  );
}
