"use client";

// URL Map — every URL that touches at least one cluster, joined to its
// primary cluster for context. Score is the SERP-overlap pipeline's match
// confidence (higher = stronger primary). n_clusters_touched would require
// a BigQuery join (deferred).

import { useMemo } from "react";
import {
  EmptyTab,
  TabHeader,
  TableShell,
  UrlCell,
  fmtN,
} from "@/components/wqa/helpers";
import type { KeywordsViewProps } from "../KeywordsView";

export function UrlMapTab(props: KeywordsViewProps) {
  const { urlAssignments, clusters } = props;

  const clusterById = useMemo(
    () => new Map(clusters.map((c) => [c.id, c])),
    [clusters],
  );

  const rows = useMemo(() => {
    return [...urlAssignments].sort((a, b) => b.score - a.score);
  }, [urlAssignments]);

  if (urlAssignments.length === 0) {
    return <EmptyTab message="No URL-to-cluster assignments yet." />;
  }

  return (
    <section>
      <TabHeader
        title="URL Map"
        subtitle={
          <>
            Every URL with a primary cluster assignment. Score is the
            SERP-overlap pipeline&rsquo;s match confidence. Cluster size and
            cross-cluster reach are surfaced here to spot pages that overload
            on a single intent.
          </>
        }
        count={rows.length}
      />

      <TableShell>
        <thead className="sticky top-0 bg-muted/80 backdrop-blur text-[10px] uppercase tracking-wider text-muted-foreground z-10">
          <tr>
            <th className="text-left px-3 py-2 font-medium min-w-[280px]">URL</th>
            <th className="text-left px-2 py-2 font-medium min-w-[220px]">
              Primary cluster
            </th>
            <th className="text-right px-2 py-2 font-medium">Score</th>
            <th className="text-right px-2 py-2 font-medium">Cluster size</th>
            <th className="text-right px-2 py-2 font-medium"># clusters</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const cluster = clusterById.get(a.primary_cluster_id);
            const name = cluster
              ? cluster.name_override || cluster.head_term
              : "(unknown cluster)";
            return (
              <tr key={a.id} className="border-t hover:bg-muted/40">
                <td className="px-3 py-1.5 max-w-0">
                  <UrlCell url={a.url} />
                </td>
                <td className="px-2 py-1.5 text-[11.5px] truncate max-w-0" title={name}>
                  {name}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {a.score.toFixed(2)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {cluster ? fmtN(cluster.member_count) : "—"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  —
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableShell>
    </section>
  );
}
