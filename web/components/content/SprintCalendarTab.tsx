"use client";

// Sprint Calendar — same row shape as Master Plan, but grouped by sprint.
//   • Group header shows Brief due / Publish target / row count.
//   • Sprints sorted ascending.
//   • Rows with `sprint == null` group under "Unscheduled" at the top.
//
// Inline edits + drawer integration land in Chunk 4.

import { useMemo } from "react";
import { EmptyTab, TabHeader, TableShell } from "@/components/wqa/helpers";
import { PlanRowView } from "./MasterPlanTab";
import type { ContentViewProps, ContentRowClickHandler } from "./ContentView";
import type { ContentRow } from "@/lib/content-rows";
import type { ClusterRow } from "@/lib/clusters";

type SprintGroup = {
  key: string; // numeric sprint as string OR "unscheduled"
  sprint: number | null;
  briefDue: string | null;
  publishTarget: string | null;
  rows: ContentRow[];
};

export function SprintCalendarTab({
  rows,
  clusters,
  propertySlug,
  onRowClick,
}: ContentViewProps & { onRowClick?: ContentRowClickHandler }) {
  const clusterById = useMemo(
    () => new Map(clusters.map((c) => [c.id, c])),
    [clusters],
  );

  const groups = useMemo<SprintGroup[]>(() => {
    const byKey = new Map<string, ContentRow[]>();
    for (const r of rows) {
      const k = r.sprint == null ? "unscheduled" : String(r.sprint);
      const list = byKey.get(k) ?? [];
      list.push(r);
      byKey.set(k, list);
    }
    const out: SprintGroup[] = [];
    // Unscheduled first (if any).
    if (byKey.has("unscheduled")) {
      const list = byKey.get("unscheduled")!;
      out.push({
        key: "unscheduled",
        sprint: null,
        briefDue: null,
        publishTarget: null,
        rows: list,
      });
      byKey.delete("unscheduled");
    }
    const numeric = Array.from(byKey.entries())
      .map(([k, list]) => ({ k, n: Number(k), list }))
      .sort((a, b) => a.n - b.n);
    for (const { k, n, list } of numeric) {
      out.push({
        key: k,
        sprint: n,
        briefDue: list[0]?.brief_due ?? null,
        publishTarget: list[0]?.target_publish ?? null,
        rows: list,
      });
    }
    return out;
  }, [rows]);

  if (rows.length === 0) {
    return <EmptyTab message="No content rows for this property yet." />;
  }

  return (
    <section>
      <TabHeader
        title="Sprint Calendar"
        subtitle={
          <>
            Same rows as Master Plan, grouped by sprint. Each header card
            shows brief due / publish target / row count. Rows without a
            sprint assignment group under &ldquo;Unscheduled&rdquo; at the top.
          </>
        }
        count={rows.length}
      />

      <div className="space-y-4">
        {groups.map((g) => (
          <SprintGroupCard
            key={g.key}
            group={g}
            clusterById={clusterById}
            propertySlug={propertySlug}
            onRowClick={onRowClick}
          />
        ))}
      </div>
    </section>
  );
}

function SprintGroupCard({
  group,
  clusterById,
  propertySlug,
  onRowClick,
}: {
  group: SprintGroup;
  clusterById: Map<string, ClusterRow>;
  propertySlug: string;
  onRowClick?: ContentRowClickHandler;
}) {
  const heading =
    group.sprint == null ? "Unscheduled" : `Sprint ${group.sprint}`;
  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      <header className="px-4 py-3 bg-muted/40 border-b flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="text-sm font-semibold tracking-tight">{heading}</div>
        <div className="text-[11px] text-muted-foreground">
          {group.briefDue ? (
            <>
              Brief due <span className="font-mono">{group.briefDue}</span>
            </>
          ) : (
            <>Brief due —</>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {group.publishTarget ? (
            <>
              Publish target{" "}
              <span className="font-mono">{group.publishTarget}</span>
            </>
          ) : (
            <>Publish target —</>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums ml-auto">
          {group.rows.length.toLocaleString()} rows
        </div>
      </header>
      <TableShell>
        <thead className="sticky top-0 bg-muted/80 backdrop-blur text-[10px] uppercase tracking-wider text-muted-foreground z-10">
          <tr>
            <th className="text-left px-3 py-2 font-medium min-w-[260px]">URL</th>
            <th className="text-right px-2 py-2 font-medium">Sprint</th>
            <th className="text-left px-2 py-2 font-medium">Action</th>
            <th className="text-left px-2 py-2 font-medium">Priority</th>
            <th className="text-left px-2 py-2 font-medium min-w-[180px]">Cluster</th>
            <th className="text-left px-2 py-2 font-medium min-w-[180px]">Target Keyword</th>
            <th className="text-left px-2 py-2 font-medium">Status</th>
            <th className="text-left px-2 py-2 font-medium">Writer</th>
            <th className="text-center px-2 py-2 font-medium">Open</th>
          </tr>
        </thead>
        <tbody>
          {group.rows.map((r) => (
            <PlanRowView
              key={r.id}
              row={r}
              clusterById={clusterById}
              propertySlug={propertySlug}
              onRowClick={onRowClick}
            />
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
