"use client";

// Performance Tracker — forecast + observed rank columns.
//
//   • Filters to rows with a non-null target_keyword.
//   • Cluster SV derived from the keyword_cluster row joined in via cluster_id.
//   • 6mo / 12mo target ranks derived from action_type.
//   • 6mo / 12mo Est. Clicks derived from ClusterSV × CTR(rank).
//   • Refresh flag computed: rank_90d > 1.43 × 6mo_target.
//   • 30d / 60d / 90d rank cells are read-only this chunk — Chunk 4 wires
//     inline numeric editors via setRowField.

import { useMemo, useState } from "react";
import {
  EmptyTab,
  TabHeader,
  TableShell,
  fmtN,
} from "@/components/wqa/helpers";
import { TextFilter, SelectFilter, NumericFilter, parseNumeric } from "../keywords/filters";
import { ACTION_TINT } from "./MasterPlanTab";
import type { ContentViewProps } from "./ContentView";
import type { ContentRow, ContentActionType } from "@/lib/content-rows";
import type { ClusterRow } from "@/lib/clusters";

const ACTION_VALUES: ContentActionType[] = [
  "Optimize",
  "Refresh",
  "Rewrite",
  "New",
  "Remove",
];

const PAGE_SIZE = 100;

function targetRank6mo(action: ContentActionType): number {
  return action === "Optimize" || action === "Refresh" ? 8 : 12;
}
function targetRank12mo(action: ContentActionType): number {
  return action === "Optimize" || action === "Refresh" ? 4 : 6;
}
function estClicks(clusterSv: number, rankTarget: number): number {
  // 6mo: 7% if top10, else 2%. 12mo: 15% if top5, else 7%.
  // Caller decides the rank window via rankTarget threshold.
  if (rankTarget <= 5) return clusterSv * 0.15;
  if (rankTarget <= 10) return clusterSv * 0.07;
  return clusterSv * 0.02;
}

// Helper to apply the per-window curve — 6mo top10 yields 7%, else 2%;
// 12mo top5 yields 15%, else 7%.
function est6moClicks(clusterSv: number, target6mo: number): number {
  return target6mo <= 10 ? clusterSv * 0.07 : clusterSv * 0.02;
}
function est12moClicks(clusterSv: number, target12mo: number): number {
  return target12mo <= 5 ? clusterSv * 0.15 : clusterSv * 0.07;
}

export function PerformanceTrackerTab({ rows, clusters }: ContentViewProps) {
  const clusterById = useMemo(
    () => new Map(clusters.map((c) => [c.id, c])),
    [clusters],
  );

  // Restrict to rows with a target keyword.
  const eligible = useMemo(
    () => rows.filter((r) => r.target_keyword && r.target_keyword.trim() !== ""),
    [rows],
  );

  const [colFilters, setColFilters] = useState({
    url: "",
    keyword: "",
    action: "" as "" | ContentActionType,
    sv: "",
    refreshOnly: false,
  });
  const setColFilter = <K extends keyof typeof colFilters>(
    k: K,
    v: (typeof colFilters)[K],
  ) => setColFilters((prev) => ({ ...prev, [k]: v }));

  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const url = colFilters.url.trim().toLowerCase();
    const kw = colFilters.keyword.trim().toLowerCase();
    const svFilter = parseNumeric(colFilters.sv);
    return eligible.filter((r) => {
      const action = r.action_type_override ?? r.action_type;
      if (colFilters.action && action !== colFilters.action) return false;
      if (url && !r.url.toLowerCase().includes(url)) return false;
      if (kw && !(r.target_keyword ?? "").toLowerCase().includes(kw)) return false;
      const cluster = r.cluster_id ? clusterById.get(r.cluster_id) ?? null : null;
      const sv = cluster?.total_sv ?? null;
      if (svFilter) {
        if (sv == null) return false;
        if (svFilter.op === ">=" && !(sv >= svFilter.n)) return false;
        if (svFilter.op === "<=" && !(sv <= svFilter.n)) return false;
        if (svFilter.op === "=" && sv !== svFilter.n) return false;
      }
      if (colFilters.refreshOnly) {
        const target6 = targetRank6mo(action);
        const flag = r.rank_90d != null && r.rank_90d > target6 * 1.43;
        if (!flag) return false;
      }
      return true;
    });
  }, [eligible, clusterById, colFilters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  if (rows.length === 0) {
    return <EmptyTab message="No content rows for this property yet." />;
  }
  if (eligible.length === 0) {
    return (
      <EmptyTab message="No rows have a target keyword yet — the Performance Tracker is empty." />
    );
  }

  return (
    <section>
      <TabHeader
        title="Performance Tracker"
        subtitle={
          <>
            Forecast targets + observed rankings for every URL with a target
            keyword. Cluster SV powers the click forecasts. Refresh flag fires
            when 90-day rank is 30%+ worse than the 6-month target. Inline
            rank entry lands in Chunk 4.
          </>
        }
        count={filtered.length}
        total={eligible.length}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={colFilters.refreshOnly}
            onChange={(e) => {
              setColFilter("refreshOnly", e.target.checked);
              setPage(0);
            }}
          />
          Refresh-flag only
        </label>
      </div>

      <TableShell>
        <thead className="sticky top-0 bg-muted/80 backdrop-blur text-[10px] uppercase tracking-wider text-muted-foreground z-10">
          <tr>
            <th className="text-left px-3 py-2 font-medium min-w-[240px]">URL</th>
            <th className="text-left px-2 py-2 font-medium min-w-[180px]">Target Keyword</th>
            <th className="text-right px-2 py-2 font-medium">Cluster SV</th>
            <th className="text-left px-2 py-2 font-medium">Action</th>
            <th className="text-right px-2 py-2 font-medium">6mo Target</th>
            <th className="text-right px-2 py-2 font-medium">6mo Est Clicks</th>
            <th className="text-right px-2 py-2 font-medium">12mo Target</th>
            <th className="text-right px-2 py-2 font-medium">12mo Est Clicks</th>
            <th className="text-right px-2 py-2 font-medium">30d Rank</th>
            <th className="text-right px-2 py-2 font-medium">60d Rank</th>
            <th className="text-right px-2 py-2 font-medium">90d Rank</th>
            <th className="text-center px-2 py-2 font-medium">Refresh?</th>
          </tr>
          <tr className="bg-muted/60 border-t">
            <th className="px-3 py-1.5 font-normal">
              <TextFilter
                value={colFilters.url}
                onChange={(v) => {
                  setColFilter("url", v);
                  setPage(0);
                }}
                placeholder="search url…"
              />
            </th>
            <th className="px-2 py-1.5 font-normal">
              <TextFilter
                value={colFilters.keyword}
                onChange={(v) => {
                  setColFilter("keyword", v);
                  setPage(0);
                }}
                placeholder="search keyword…"
              />
            </th>
            <th className="px-2 py-1.5 font-normal">
              <NumericFilter
                value={colFilters.sv}
                onChange={(v) => {
                  setColFilter("sv", v);
                  setPage(0);
                }}
                placeholder="≥"
              />
            </th>
            <th className="px-2 py-1.5 font-normal">
              <SelectFilter
                value={colFilters.action}
                onChange={(v) => {
                  setColFilter("action", v as "" | ContentActionType);
                  setPage(0);
                }}
                options={ACTION_VALUES}
              />
            </th>
            <th className="px-2 py-1.5 font-normal" />
            <th className="px-2 py-1.5 font-normal" />
            <th className="px-2 py-1.5 font-normal" />
            <th className="px-2 py-1.5 font-normal" />
            <th className="px-2 py-1.5 font-normal" />
            <th className="px-2 py-1.5 font-normal" />
            <th className="px-2 py-1.5 font-normal" />
            <th className="px-2 py-1.5 font-normal" />
          </tr>
        </thead>
        <tbody>
          {pageRows.map((r) => (
            <PerfRowView key={r.id} row={r} clusterById={clusterById} />
          ))}
        </tbody>
      </TableShell>

      <Pagination
        page={safePage}
        totalPages={totalPages}
        onPageChange={setPage}
        total={filtered.length}
      />
    </section>
  );
}

function PerfRowView({
  row,
  clusterById,
}: {
  row: ContentRow;
  clusterById: Map<string, ClusterRow>;
}) {
  const action = row.action_type_override ?? row.action_type;
  const cluster = row.cluster_id ? clusterById.get(row.cluster_id) ?? null : null;
  const clusterSv = cluster?.total_sv ?? null;
  const target6 = targetRank6mo(action);
  const target12 = targetRank12mo(action);
  const est6 = clusterSv != null ? est6moClicks(clusterSv, target6) : null;
  const est12 = clusterSv != null ? est12moClicks(clusterSv, target12) : null;
  const refreshFlag = row.rank_90d != null && row.rank_90d > target6 * 1.43;

  return (
    <tr className="border-t hover:bg-muted/40">
      <td className="px-3 py-1.5 text-[11px] font-mono truncate max-w-0" title={row.url}>
        {row.url}
      </td>
      <td
        className="px-2 py-1.5 text-[11px] truncate max-w-0"
        title={row.target_keyword ?? ""}
      >
        {row.target_keyword}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-[11.5px]">
        {clusterSv != null ? fmtN(clusterSv) : <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-2 py-1.5">
        <span
          className={`inline-flex items-center text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${ACTION_TINT[action].chip}`}
        >
          {action}
        </span>
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-[11.5px]">{target6}</td>
      <td className="px-2 py-1.5 text-right tabular-nums text-[11.5px]">
        {est6 != null ? fmtN(Math.round(est6)) : "—"}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-[11.5px]">{target12}</td>
      <td className="px-2 py-1.5 text-right tabular-nums text-[11.5px]">
        {est12 != null ? fmtN(Math.round(est12)) : "—"}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-[11.5px]">
        {row.rank_30d ?? <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-[11.5px]">
        {row.rank_60d ?? <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-[11.5px]">
        {row.rank_90d ?? <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-2 py-1.5 text-center">
        {refreshFlag ? (
          <span className="inline-flex items-center text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800">
            Refresh
          </span>
        ) : (
          <span className="text-muted-foreground text-[11px]">—</span>
        )}
      </td>
    </tr>
  );
}

function Pagination({
  page,
  totalPages,
  onPageChange,
  total,
}: {
  page: number;
  totalPages: number;
  onPageChange: (next: number) => void;
  total: number;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
      <div>
        Showing {(page * PAGE_SIZE + 1).toLocaleString()}–
        {Math.min((page + 1) * PAGE_SIZE, total).toLocaleString()} of{" "}
        {total.toLocaleString()}
      </div>
      <div className="inline-flex gap-1">
        <button
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="px-2 py-1 border rounded bg-card disabled:opacity-40 hover:bg-muted/60"
        >
          Prev
        </button>
        <span className="px-2 py-1 tabular-nums">
          {page + 1} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className="px-2 py-1 border rounded bg-card disabled:opacity-40 hover:bg-muted/60"
        >
          Next
        </button>
      </div>
    </div>
  );
}
