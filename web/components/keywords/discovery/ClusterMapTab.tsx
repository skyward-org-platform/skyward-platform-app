"use client";

// Cluster Map — every SERP-overlap cluster sorted by total search volume.
// Read-only for v1; priority + page action chips become editable in
// Chunk 4. Inline search over head_term so analysts can jump.

import { useMemo, useState } from "react";
import {
  EmptyTab,
  TabHeader,
  TableShell,
  fmtN,
} from "@/components/wqa/helpers";
import { ClusterPriorityPill } from "../ClusterPriorityPill";
import { ClusterPageActionChip } from "../ClusterPageActionChip";
import type { KeywordsViewProps } from "../KeywordsView";
import type { ClusterRow } from "@/lib/clusters";

export function ClusterMapTab(props: KeywordsViewProps) {
  const { clusters, propertySlug } = props;
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clusters;
    return clusters.filter((c) => {
      const name = (c.name_override || c.head_term).toLowerCase();
      return name.includes(q) || c.head_term.toLowerCase().includes(q);
    });
  }, [clusters, search]);

  if (clusters.length === 0) {
    return <EmptyTab message="No clusters computed yet." />;
  }

  return (
    <section>
      <TabHeader
        title="Cluster Map"
        subtitle={
          <>
            SERP-overlap clusters with size + total search volume + average
            difficulty. Priority and page action chips are read-only for now —
            inline editing wires up in the drawer in a follow-up.
          </>
        }
        count={filtered.length}
        total={clusters.length}
      />

      <div className="mb-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search head term…"
          className="text-[12px] px-2 py-1.5 border rounded bg-card w-72"
        />
      </div>

      <TableShell>
        <thead className="sticky top-0 bg-muted/80 backdrop-blur text-[10px] uppercase tracking-wider text-muted-foreground z-10">
          <tr>
            <th className="text-right px-2 py-2 font-medium">#</th>
            <th className="text-left px-2 py-2 font-medium">Priority</th>
            <th className="text-left px-3 py-2 font-medium min-w-[240px]">
              Cluster
            </th>
            <th className="text-right px-2 py-2 font-medium">Keywords</th>
            <th className="text-right px-2 py-2 font-medium">Total SV</th>
            <th className="text-right px-2 py-2 font-medium">Max SV</th>
            <th className="text-right px-2 py-2 font-medium">Avg KD</th>
            <th className="text-left px-2 py-2 font-medium">Page action</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((c) => (
            <ClusterRowView
              key={c.id}
              cluster={c}
              propertySlug={propertySlug}
            />
          ))}
        </tbody>
      </TableShell>
    </section>
  );
}

function ClusterRowView({
  cluster,
  propertySlug,
}: {
  cluster: ClusterRow;
  propertySlug: string;
}) {
  const name = cluster.name_override || cluster.head_term;
  return (
    <tr className="border-t hover:bg-muted/40">
      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
        {cluster.cluster_number}
      </td>
      <td className="px-2 py-1.5">
        <ClusterPriorityPill
          propertySlug={propertySlug}
          clusterId={cluster.id}
          initialPriority={cluster.priority}
        />
      </td>
      <td className="px-3 py-1.5 text-[11.5px] truncate max-w-0">
        <div className="font-medium truncate" title={name}>
          {name}
        </div>
        {cluster.name_override && (
          <div className="text-[10.5px] text-muted-foreground truncate" title={cluster.head_term}>
            head: {cluster.head_term}
          </div>
        )}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {fmtN(cluster.member_count)}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {fmtN(cluster.total_sv)}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
        {fmtN(cluster.max_sv)}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
        {cluster.avg_kd != null ? cluster.avg_kd.toFixed(1) : "—"}
      </td>
      <td className="px-2 py-1.5">
        <ClusterPageActionChip
          propertySlug={propertySlug}
          clusterId={cluster.id}
          initialAction={cluster.page_action}
        />
      </td>
    </tr>
  );
}
