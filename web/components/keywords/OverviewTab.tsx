"use client";

// Overview — the landing tab for /keywords. Four big-number stat tiles
// (Total Clusters / Total Keywords / Total Volume in clusters / Mapped vs
// Unmapped) plus a "Top 5 clusters by SV" mini-table so the surface has
// immediate substance.
//
// Volume note: the `keyword` table does NOT have a per-keyword search
// volume column today (intent + SV live in BQ kga_output, not yet
// backfilled to Supabase). The honest aggregate we CAN compute is the
// sum of cluster.total_sv across clusters — that's the SV captured by
// SERP-overlap clustering. Surface that and label the source.

import { useMemo } from "react";
import { TabHeader, fmtN } from "@/components/wqa/helpers";
import type { KeywordsViewProps, RowClickHandler } from "./KeywordsView";
import { ClusterPriorityPill } from "./ClusterPriorityPill";

export function OverviewTab(
  props: KeywordsViewProps & { onRowClick?: RowClickHandler },
) {
  const { keywords, clusters, clusterMembers, urlAssignments, propertySlug, onRowClick } = props;

  const stats = useMemo(() => {
    const totalClusters = clusters.length;
    const totalKeywords = keywords.length;
    const totalVolume = clusters.reduce((acc, c) => acc + (c.total_sv || 0), 0);

    // Mapped clusters = clusters that have at least one URL assignment.
    const mappedClusterIds = new Set(urlAssignments.map((a) => a.primary_cluster_id));
    const mappedClusters = clusters.filter((c) => mappedClusterIds.has(c.id)).length;

    return { totalClusters, totalKeywords, totalVolume, mappedClusters };
  }, [keywords, clusters, urlAssignments]);

  const membersByCluster = useMemo(() => {
    const m = new Map<string, typeof clusterMembers>();
    for (const cm of clusterMembers) {
      const list = m.get(cm.cluster_id) ?? [];
      list.push(cm);
      m.set(cm.cluster_id, list);
    }
    return m;
  }, [clusterMembers]);

  const urlsByCluster = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const a of urlAssignments) {
      const list = m.get(a.primary_cluster_id) ?? [];
      list.push(a.url);
      m.set(a.primary_cluster_id, list);
    }
    return m;
  }, [urlAssignments]);

  const topClusters = useMemo(() => {
    return [...clusters]
      .sort((a, b) => (b.total_sv || 0) - (a.total_sv || 0))
      .slice(0, 5);
  }, [clusters]);

  return (
    <section>
      <TabHeader
        title="Overview"
        subtitle={
          <>
            Phase 3 universe at a glance — cluster + keyword counts, captured
            search volume, and URL mapping coverage. Use the per-tab views
            for triage.
          </>
        }
        count={stats.totalClusters}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatTile
          label="Total Clusters"
          value={fmtN(stats.totalClusters)}
        />
        <StatTile
          label="Total Keywords"
          value={fmtN(stats.totalKeywords)}
        />
        <StatTile
          label="Total Volume"
          value={fmtVolume(stats.totalVolume)}
          subtitle="sum of cluster total_sv"
        />
        <StatTile
          label="Mapped vs Unmapped"
          value={`${stats.mappedClusters} / ${stats.totalClusters}`}
          subtitle={`${stats.totalClusters - stats.mappedClusters} clusters with no URL`}
        />
      </div>

      <div className="border rounded-lg bg-card overflow-hidden">
        <div className="border-b px-4 py-2.5 bg-muted/30 flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
            Top 5 clusters by search volume
          </div>
          <div className="text-[10.5px] text-muted-foreground">
            click a row for cluster detail
          </div>
        </div>
        <table className="w-full text-[11.5px]">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium min-w-[240px]">Cluster</th>
              <th className="text-left px-2 py-2 font-medium">Priority</th>
              <th className="text-right px-2 py-2 font-medium">Members</th>
              <th className="text-right px-2 py-2 font-medium">Total SV</th>
              <th className="text-right px-2 py-2 font-medium">Avg KD</th>
            </tr>
          </thead>
          <tbody>
            {topClusters.map((c) => {
              const name = c.name_override || c.head_term;
              return (
                <tr
                  key={c.id}
                  className={
                    "border-t hover:bg-muted/40 " +
                    (onRowClick ? "cursor-pointer" : "")
                  }
                  onClick={
                    onRowClick
                      ? () =>
                          onRowClick({
                            kind: "cluster",
                            cluster: c,
                            members: membersByCluster.get(c.id) ?? [],
                            urlsInCluster: urlsByCluster.get(c.id) ?? [],
                          })
                      : undefined
                  }
                >
                  <td className="px-3 py-2 font-medium truncate max-w-0" title={name}>
                    {name}
                  </td>
                  <td className="px-2 py-2">
                    <ClusterPriorityPill
                      propertySlug={propertySlug}
                      clusterId={c.id}
                      initialPriority={c.priority}
                    />
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {fmtN(c.member_count)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {fmtN(c.total_sv)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                    {c.avg_kd != null ? c.avg_kd.toFixed(1) : "—"}
                  </td>
                </tr>
              );
            })}
            {topClusters.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  No clusters computed yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatTile({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </div>
      <div className="text-3xl font-semibold tabular-nums mt-1.5">
        {value}
      </div>
      {subtitle && (
        <div className="text-[10.5px] text-muted-foreground mt-1">
          {subtitle}
        </div>
      )}
    </div>
  );
}

function fmtVolume(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
