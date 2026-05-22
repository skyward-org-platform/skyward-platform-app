"use client";

// Cluster Map — every SERP-overlap cluster sorted by total search volume.
// Per-column filters: head_term (text), priority (select), page_action
// (select), member_count (numeric ≥), total_sv (numeric ≥), avg_kd
// (numeric ≤).

import { useMemo, useState } from "react";
import {
  EmptyTab,
  TabHeader,
  TableShell,
  fmtN,
} from "@/components/wqa/helpers";
import { ClusterPriorityPill } from "../ClusterPriorityPill";
import { ClusterPageActionChip } from "../ClusterPageActionChip";
import {
  TextFilter,
  SelectFilter,
  NumericFilter,
  parseNumeric,
} from "../filters";
import type { KeywordsViewProps, RowClickHandler } from "../KeywordsView";
import type {
  ClusterRow,
  ClusterMemberRow,
  ClusterPriority,
  ClusterPageAction,
} from "@/lib/clusters";

const PRIORITY_VALUES: ClusterPriority[] = ["High", "Watch", "Low", "Unset"];
const PAGE_ACTION_VALUES: ClusterPageAction[] = [
  "build_new",
  "optimize_existing",
  "remove",
  "skip",
];

export function ClusterMapTab(
  props: KeywordsViewProps & { onRowClick?: RowClickHandler },
) {
  const { clusters, clusterMembers, urlAssignments, propertySlug, onRowClick } =
    props;

  const membersByCluster = useMemo(() => {
    const m = new Map<string, ClusterMemberRow[]>();
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

  const [colFilters, setColFilters] = useState({
    head: "",
    priority: "" as "" | ClusterPriority,
    page_action: "" as "" | ClusterPageAction,
    members: "",
    sv: "",
    kd: "",
  });
  const setColFilter = <K extends keyof typeof colFilters>(
    k: K,
    v: (typeof colFilters)[K],
  ) => setColFilters((prev) => ({ ...prev, [k]: v }));

  const filtered = useMemo(() => {
    const head = colFilters.head.trim().toLowerCase();
    const memN = parseNumeric(colFilters.members);
    const svN = parseNumeric(colFilters.sv);
    const kdN = parseNumeric(colFilters.kd);
    return clusters.filter((c) => {
      const name = (c.name_override || c.head_term).toLowerCase();
      if (head && !name.includes(head) && !c.head_term.toLowerCase().includes(head))
        return false;
      if (colFilters.priority && c.priority !== colFilters.priority) return false;
      if (colFilters.page_action && c.page_action !== colFilters.page_action) return false;
      if (memN) {
        const v = c.member_count;
        if (memN.op === ">=" && !(v >= memN.n)) return false;
        if (memN.op === "<=" && !(v <= memN.n)) return false;
        if (memN.op === "=" && v !== memN.n) return false;
      }
      if (svN) {
        const v = c.total_sv;
        if (svN.op === ">=" && !(v >= svN.n)) return false;
        if (svN.op === "<=" && !(v <= svN.n)) return false;
        if (svN.op === "=" && v !== svN.n) return false;
      }
      if (kdN) {
        if (c.avg_kd == null) return false;
        const v = c.avg_kd;
        if (kdN.op === ">=" && !(v >= kdN.n)) return false;
        if (kdN.op === "<=" && !(v <= kdN.n)) return false;
        if (kdN.op === "=" && v !== kdN.n) return false;
      }
      return true;
    });
  }, [clusters, colFilters]);

  if (clusters.length === 0) {
    return <EmptyTab message="No clusters computed yet." />;
  }

  return (
    <section>
      <TabHeader
        title="Clusters"
        subtitle={
          <>
            SERP-overlap clusters with size + total search volume + average
            difficulty. Edit priority or page action inline; the chips
            persist on the row.
          </>
        }
        count={filtered.length}
        total={clusters.length}
      />

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
          <tr className="bg-muted/60 border-t">
            <th />
            <th className="px-2 py-1.5">
              <SelectFilter
                value={colFilters.priority}
                onChange={(v) => setColFilter("priority", v as "" | ClusterPriority)}
                options={PRIORITY_VALUES}
              />
            </th>
            <th className="px-3 py-1.5">
              <TextFilter
                value={colFilters.head}
                onChange={(v) => setColFilter("head", v)}
                placeholder="search head term…"
              />
            </th>
            <th className="px-2 py-1.5">
              <NumericFilter
                value={colFilters.members}
                onChange={(v) => setColFilter("members", v)}
                placeholder="≥"
              />
            </th>
            <th className="px-2 py-1.5">
              <NumericFilter
                value={colFilters.sv}
                onChange={(v) => setColFilter("sv", v)}
                placeholder="≥"
              />
            </th>
            <th />
            <th className="px-2 py-1.5">
              <NumericFilter
                value={colFilters.kd}
                onChange={(v) => setColFilter("kd", v)}
                placeholder="≤"
              />
            </th>
            <th className="px-2 py-1.5">
              <SelectFilter
                value={colFilters.page_action}
                onChange={(v) =>
                  setColFilter("page_action", v as "" | ClusterPageAction)
                }
                options={PAGE_ACTION_VALUES}
              />
            </th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((c) => (
            <ClusterRowView
              key={c.id}
              cluster={c}
              propertySlug={propertySlug}
              members={membersByCluster.get(c.id) ?? []}
              urlsInCluster={urlsByCluster.get(c.id) ?? []}
              onRowClick={onRowClick}
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
  members,
  urlsInCluster,
  onRowClick,
}: {
  cluster: ClusterRow;
  propertySlug: string;
  members: ClusterMemberRow[];
  urlsInCluster: string[];
  onRowClick?: RowClickHandler;
}) {
  const name = cluster.name_override || cluster.head_term;
  return (
    <tr
      className={
        "border-t hover:bg-muted/40 " + (onRowClick ? "cursor-pointer" : "")
      }
      onClick={
        onRowClick
          ? () =>
              onRowClick({
                kind: "cluster",
                cluster,
                members,
                urlsInCluster,
              })
          : undefined
      }
    >
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
          <div
            className="text-[10.5px] text-muted-foreground truncate"
            title={cluster.head_term}
          >
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
