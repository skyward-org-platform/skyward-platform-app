"use client";

// Opportunities — keywords with status='Candidate'. Per the spec the
// backfill marks anything the client doesn't already rank for as Candidate,
// so this list approximates "greenfield demand we should chase." Sorted by
// relevance_score desc (falls back to alphabetical when score is null).
// "Mark for build" is a placeholder — actual wiring happens once the
// drawer flow lands.

import { useMemo, useState } from "react";
import {
  EmptyTab,
  TabHeader,
  TableShell,
} from "@/components/wqa/helpers";
import type { KeywordsViewProps } from "../KeywordsView";
import type { KeywordRow } from "@/lib/keywords";

const PAGE_SIZE = 100;

export function OpportunitiesTab(props: KeywordsViewProps) {
  const { keywords, clusters, clusterMembers } = props;

  const clusterByKeyword = useMemo(() => {
    const clusterById = new Map(clusters.map((c) => [c.id, c]));
    const m = new Map<string, string>();
    for (const cm of clusterMembers) {
      const c = clusterById.get(cm.cluster_id);
      if (c) m.set(cm.keyword, c.name_override || c.head_term);
    }
    return m;
  }, [clusters, clusterMembers]);

  const opportunities = useMemo(() => {
    return keywords
      .filter((k) => k.status === "Candidate")
      .sort((a, b) => {
        const ra = a.relevance_score ?? -1;
        const rb = b.relevance_score ?? -1;
        if (ra !== rb) return rb - ra;
        return a.keyword.localeCompare(b.keyword);
      });
  }, [keywords]);

  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(opportunities.length / PAGE_SIZE));
  const pageRows = opportunities.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (opportunities.length === 0) {
    return (
      <EmptyTab message="No Candidate keywords. Every keyword in the universe has already been triaged." />
    );
  }

  return (
    <section>
      <TabHeader
        title="Opportunities"
        subtitle={
          <>
            Keywords still in <span className="font-semibold">Candidate</span>{" "}
            status — greenfield demand the client doesn&rsquo;t already rank
            for. Sorted by analyst relevance score. &ldquo;Mark for
            build&rdquo; is wired up once cluster + drawer editing lands.
          </>
        }
        count={opportunities.length}
      />

      <TableShell>
        <thead className="sticky top-0 bg-muted/80 backdrop-blur text-[10px] uppercase tracking-wider text-muted-foreground z-10">
          <tr>
            <th className="text-left px-3 py-2 font-medium min-w-[260px]">
              Keyword
            </th>
            <th className="text-left px-2 py-2 font-medium">Status</th>
            <th className="text-right px-2 py-2 font-medium">Relevance</th>
            <th className="text-left px-2 py-2 font-medium min-w-[200px]">
              Cluster
            </th>
            <th className="text-right px-2 py-2 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {pageRows.map((k) => (
            <OpportunityRow
              key={k.id}
              row={k}
              clusterName={clusterByKeyword.get(k.keyword) ?? null}
            />
          ))}
        </tbody>
      </TableShell>

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
          <div>
            Showing {(page * PAGE_SIZE + 1).toLocaleString()}–
            {Math.min((page + 1) * PAGE_SIZE, opportunities.length).toLocaleString()} of{" "}
            {opportunities.length.toLocaleString()}
          </div>
          <div className="inline-flex gap-1">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="px-2 py-1 border rounded bg-card disabled:opacity-40 hover:bg-muted/60"
            >
              Prev
            </button>
            <span className="px-2 py-1 tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="px-2 py-1 border rounded bg-card disabled:opacity-40 hover:bg-muted/60"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function OpportunityRow({
  row,
  clusterName,
}: {
  row: KeywordRow;
  clusterName: string | null;
}) {
  return (
    <tr className="border-t hover:bg-muted/40">
      <td className="px-3 py-1.5 text-[11.5px] truncate max-w-0" title={row.keyword}>
        {row.keyword}
      </td>
      <td className="px-2 py-1.5">
        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
          <span className="size-1.5 rounded-full bg-slate-400" />
          {row.status}
        </span>
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {row.relevance_score ?? "—"}
      </td>
      <td className="px-2 py-1.5 text-[11px] truncate max-w-0">
        {clusterName ? (
          <span title={clusterName}>{clusterName}</span>
        ) : (
          <span className="text-muted-foreground">unassigned</span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right">
        <button
          disabled
          title="Wires up in the drawer flow"
          className="text-[10.5px] px-2 py-0.5 rounded border bg-card text-muted-foreground opacity-60 cursor-not-allowed"
        >
          Mark for build
        </button>
      </td>
    </tr>
  );
}
