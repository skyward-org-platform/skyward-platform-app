"use client";

// Master Plan — the workhorse Phase 4 table. One row per URL in the content plan.
//
//   • Chip strip above the table — status counts, action_type counts, source
//     counts. Click a chip to toggle inclusion in the multi-select filter.
//     URL-persisted via `?status=` `?action=` `?source=`.
//   • 9 inline columns + Open button column.
//   • Per-column filter row under the header.
//   • Pagination (100 rows/page) mirroring UniverseTab.
//
// All edit affordances are READ-ONLY in this chunk. Chunk 4 wires inline
// editors (Status / ActionType / Writer / Sprint) + the Content drawer.

import { useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { EmptyTab, TabHeader, TableShell } from "@/components/wqa/helpers";
import { TextFilter, SelectFilter, NumericFilter, parseNumeric } from "../keywords/filters";
import type { ContentViewProps } from "./ContentView";
import type {
  ContentRow,
  ContentStatus,
  ContentActionType,
  ContentSource,
} from "@/lib/content-rows";
import type { ClusterRow } from "@/lib/clusters";

const STATUS_VALUES: ContentStatus[] = [
  "Not Started",
  "Brief",
  "Draft",
  "Review",
  "Published",
];
const ACTION_VALUES: ContentActionType[] = [
  "Optimize",
  "Refresh",
  "Rewrite",
  "New",
  "Remove",
];
const SOURCE_VALUES: ContentSource[] = [
  "phase1_optimize",
  "phase1_restore",
  "phase3_gap_cluster",
];
const SOURCE_LABEL: Record<ContentSource, string> = {
  phase1_optimize: "Phase 1 Optimize",
  phase1_restore: "Phase 1 Restore",
  phase3_gap_cluster: "Phase 3 Gap Cluster",
};

const STATUS_TINT: Record<
  ContentStatus,
  { active: string; idle: string; dot: string; chip: string }
> = {
  "Not Started": {
    active: "bg-slate-200 text-slate-900 border-slate-400",
    idle: "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100",
    dot: "bg-slate-400",
    chip: "bg-slate-100 text-slate-700",
  },
  Brief: {
    active: "bg-indigo-100 text-indigo-900 border-indigo-300",
    idle: "bg-indigo-50/60 text-indigo-800 border-indigo-200/60 hover:bg-indigo-50",
    dot: "bg-indigo-500",
    chip: "bg-indigo-100 text-indigo-800",
  },
  Draft: {
    active: "bg-sky-100 text-sky-900 border-sky-300",
    idle: "bg-sky-50/60 text-sky-800 border-sky-200/60 hover:bg-sky-50",
    dot: "bg-sky-500",
    chip: "bg-sky-100 text-sky-800",
  },
  Review: {
    active: "bg-amber-100 text-amber-900 border-amber-300",
    idle: "bg-amber-50/60 text-amber-800 border-amber-200/60 hover:bg-amber-50",
    dot: "bg-amber-500",
    chip: "bg-amber-100 text-amber-800",
  },
  Published: {
    active: "bg-emerald-100 text-emerald-900 border-emerald-300",
    idle: "bg-emerald-50/60 text-emerald-800 border-emerald-200/60 hover:bg-emerald-50",
    dot: "bg-emerald-500",
    chip: "bg-emerald-100 text-emerald-800",
  },
};

const ACTION_TINT: Record<
  ContentActionType,
  { active: string; idle: string; dot: string; chip: string }
> = {
  Optimize: {
    active: "bg-emerald-100 text-emerald-900 border-emerald-300",
    idle: "bg-emerald-50/60 text-emerald-800 border-emerald-200/60 hover:bg-emerald-50",
    dot: "bg-emerald-500",
    chip: "bg-emerald-100 text-emerald-800",
  },
  Refresh: {
    active: "bg-amber-100 text-amber-900 border-amber-300",
    idle: "bg-amber-50/60 text-amber-800 border-amber-200/60 hover:bg-amber-50",
    dot: "bg-amber-500",
    chip: "bg-amber-100 text-amber-800",
  },
  Rewrite: {
    active: "bg-sky-100 text-sky-900 border-sky-300",
    idle: "bg-sky-50/60 text-sky-800 border-sky-200/60 hover:bg-sky-50",
    dot: "bg-sky-500",
    chip: "bg-sky-100 text-sky-800",
  },
  New: {
    active: "bg-violet-100 text-violet-900 border-violet-300",
    idle: "bg-violet-50/60 text-violet-800 border-violet-200/60 hover:bg-violet-50",
    dot: "bg-violet-500",
    chip: "bg-violet-100 text-violet-800",
  },
  Remove: {
    active: "bg-rose-100 text-rose-900 border-rose-300",
    idle: "bg-rose-50/60 text-rose-800 border-rose-200/60 hover:bg-rose-50",
    dot: "bg-rose-500",
    chip: "bg-rose-100 text-rose-800",
  },
};

const SOURCE_TINT: Record<ContentSource, { active: string; idle: string; dot: string }> = {
  phase1_optimize: {
    active: "bg-emerald-100 text-emerald-900 border-emerald-300",
    idle: "bg-emerald-50/60 text-emerald-800 border-emerald-200/60 hover:bg-emerald-50",
    dot: "bg-emerald-500",
  },
  phase1_restore: {
    active: "bg-rose-100 text-rose-900 border-rose-300",
    idle: "bg-rose-50/60 text-rose-800 border-rose-200/60 hover:bg-rose-50",
    dot: "bg-rose-500",
  },
  phase3_gap_cluster: {
    active: "bg-violet-100 text-violet-900 border-violet-300",
    idle: "bg-violet-50/60 text-violet-800 border-violet-200/60 hover:bg-violet-50",
    dot: "bg-violet-500",
  },
};

const PAGE_SIZE = 100;

export function MasterPlanTab({ rows, clusters }: ContentViewProps) {
  const router = useRouter();
  const sp = useSearchParams();

  // ─── URL-persisted multi-select chip filters ─────────────────────
  const selectedStatuses = useMemo<Set<ContentStatus>>(
    () => parseCsv(sp.get("status"), STATUS_VALUES),
    [sp],
  );
  const selectedActions = useMemo<Set<ContentActionType>>(
    () => parseCsv(sp.get("action"), ACTION_VALUES),
    [sp],
  );
  const selectedSources = useMemo<Set<ContentSource>>(
    () => parseCsv(sp.get("source"), SOURCE_VALUES),
    [sp],
  );

  function toggleParam<T extends string>(
    key: string,
    selected: Set<T>,
    value: T,
    allowed: readonly T[],
  ) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    const params = new URLSearchParams(sp.toString());
    if (next.size === 0 || next.size === allowed.length) params.delete(key);
    else params.set(key, Array.from(next).join(","));
    router.push(`?${params.toString()}`);
  }

  // ─── Per-column filter state ─────────────────────────────────────
  const [colFilters, setColFilters] = useState({
    url: "",
    sprint: "",
    action: "" as "" | ContentActionType,
    priority: "",
    cluster: "",
    keyword: "",
    status: "" as "" | ContentStatus,
    writer: "",
  });
  const setColFilter = <K extends keyof typeof colFilters>(
    k: K,
    v: (typeof colFilters)[K],
  ) => setColFilters((prev) => ({ ...prev, [k]: v }));

  const [page, setPage] = useState(0);

  // ─── Cluster lookup map (id → row) ───────────────────────────────
  const clusterById = useMemo(
    () => new Map(clusters.map((c) => [c.id, c])),
    [clusters],
  );

  // ─── Counts over whole population (not filtered) ─────────────────
  const statusCounts = useMemo(() => {
    const m = new Map<ContentStatus, number>();
    for (const s of STATUS_VALUES) m.set(s, 0);
    for (const r of rows) m.set(r.status, (m.get(r.status) ?? 0) + 1);
    return m;
  }, [rows]);
  const actionCounts = useMemo(() => {
    const m = new Map<ContentActionType, number>();
    for (const a of ACTION_VALUES) m.set(a, 0);
    for (const r of rows) {
      const a = r.action_type_override ?? r.action_type;
      m.set(a, (m.get(a) ?? 0) + 1);
    }
    return m;
  }, [rows]);
  const sourceCounts = useMemo(() => {
    const m = new Map<ContentSource, number>();
    for (const s of SOURCE_VALUES) m.set(s, 0);
    for (const r of rows) m.set(r.source, (m.get(r.source) ?? 0) + 1);
    return m;
  }, [rows]);

  const filtered = useMemo(() => {
    const url = colFilters.url.trim().toLowerCase();
    const cluster = colFilters.cluster.trim().toLowerCase();
    const keyword = colFilters.keyword.trim().toLowerCase();
    const writer = colFilters.writer.trim().toLowerCase();
    const priority = colFilters.priority.trim().toLowerCase();
    const sprintFilter = parseNumeric(colFilters.sprint);
    return rows.filter((r) => {
      const action = r.action_type_override ?? r.action_type;
      if (selectedStatuses.size > 0 && !selectedStatuses.has(r.status)) return false;
      if (selectedActions.size > 0 && !selectedActions.has(action)) return false;
      if (selectedSources.size > 0 && !selectedSources.has(r.source)) return false;
      if (colFilters.status && r.status !== colFilters.status) return false;
      if (colFilters.action && action !== colFilters.action) return false;
      if (url && !r.url.toLowerCase().includes(url)) return false;
      if (priority && !(r.priority_tier ?? "").toLowerCase().includes(priority)) return false;
      if (writer && !(r.writer ?? "").toLowerCase().includes(writer)) return false;
      if (keyword && !(r.target_keyword ?? "").toLowerCase().includes(keyword)) return false;
      if (cluster) {
        const c = r.cluster_id ? clusterById.get(r.cluster_id) : null;
        const name = (c?.name_override || c?.head_term || "").toLowerCase();
        if (!name.includes(cluster)) return false;
      }
      if (sprintFilter) {
        if (r.sprint == null) return false;
        if (sprintFilter.op === ">=" && !(r.sprint >= sprintFilter.n)) return false;
        if (sprintFilter.op === "<=" && !(r.sprint <= sprintFilter.n)) return false;
        if (sprintFilter.op === "=" && r.sprint !== sprintFilter.n) return false;
      }
      return true;
    });
  }, [
    rows,
    clusterById,
    selectedStatuses,
    selectedActions,
    selectedSources,
    colFilters,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  if (rows.length === 0) {
    return <EmptyTab message="No content rows for this property yet." />;
  }

  return (
    <section>
      <TabHeader
        title="Master Plan"
        subtitle={
          <>
            Every URL in the Phase 4 content plan, with its action type,
            priority tier, target cluster, target keyword, status, and writer.
            Inline edits land in Chunk 4.
          </>
        }
        count={filtered.length}
        total={rows.length}
      />

      {/* ── Chip strip — Status / Action / Source ── */}
      <div className="mb-3 space-y-1.5">
        <ChipRow
          label="Status"
          values={STATUS_VALUES}
          selected={selectedStatuses}
          counts={statusCounts}
          tint={STATUS_TINT}
          onToggle={(v) =>
            toggleParam("status", selectedStatuses, v, STATUS_VALUES)
          }
        />
        <ChipRow
          label="Action"
          values={ACTION_VALUES}
          selected={selectedActions}
          counts={actionCounts}
          tint={ACTION_TINT}
          onToggle={(v) =>
            toggleParam("action", selectedActions, v, ACTION_VALUES)
          }
        />
        <ChipRow
          label="Source"
          values={SOURCE_VALUES}
          selected={selectedSources}
          counts={sourceCounts}
          tint={SOURCE_TINT}
          onToggle={(v) =>
            toggleParam("source", selectedSources, v, SOURCE_VALUES)
          }
          labelMap={SOURCE_LABEL}
        />
      </div>

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
              <NumericFilter
                value={colFilters.sprint}
                onChange={(v) => {
                  setColFilter("sprint", v);
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
            <th className="px-2 py-1.5 font-normal">
              <TextFilter
                value={colFilters.priority}
                onChange={(v) => {
                  setColFilter("priority", v);
                  setPage(0);
                }}
                placeholder="tier…"
              />
            </th>
            <th className="px-2 py-1.5 font-normal">
              <TextFilter
                value={colFilters.cluster}
                onChange={(v) => {
                  setColFilter("cluster", v);
                  setPage(0);
                }}
                placeholder="search cluster…"
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
              <SelectFilter
                value={colFilters.status}
                onChange={(v) => {
                  setColFilter("status", v as "" | ContentStatus);
                  setPage(0);
                }}
                options={STATUS_VALUES}
              />
            </th>
            <th className="px-2 py-1.5 font-normal">
              <TextFilter
                value={colFilters.writer}
                onChange={(v) => {
                  setColFilter("writer", v);
                  setPage(0);
                }}
                placeholder="search writer…"
              />
            </th>
            <th className="px-2 py-1.5 font-normal" />
          </tr>
        </thead>
        <tbody>
          {pageRows.map((r) => (
            <PlanRowView key={r.id} row={r} clusterById={clusterById} />
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

export function PlanRowView({
  row,
  clusterById,
}: {
  row: ContentRow;
  clusterById: Map<string, ClusterRow>;
}) {
  const action = row.action_type_override ?? row.action_type;
  const cluster = row.cluster_id ? clusterById.get(row.cluster_id) ?? null : null;
  const clusterName = cluster ? cluster.name_override || cluster.head_term : null;

  return (
    <tr className="border-t hover:bg-muted/40">
      <td className="px-3 py-1.5 text-[11px] font-mono truncate max-w-0" title={row.url}>
        {row.url}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-[11.5px]">
        {row.sprint ?? "—"}
      </td>
      <td className="px-2 py-1.5">
        <span
          className={`inline-flex items-center text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${ACTION_TINT[action].chip}`}
        >
          {action}
        </span>
      </td>
      <td className="px-2 py-1.5">
        <PriorityPill tier={row.priority_tier} />
      </td>
      <td
        className="px-2 py-1.5 text-[11px] truncate max-w-0"
        title={clusterName ?? ""}
      >
        {clusterName ?? <span className="text-muted-foreground">—</span>}
      </td>
      <td
        className="px-2 py-1.5 text-[11px] truncate max-w-0"
        title={row.target_keyword ?? ""}
      >
        {row.target_keyword ?? <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-2 py-1.5">
        <span
          className={`inline-flex items-center text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${STATUS_TINT[row.status].chip}`}
        >
          {row.status}
        </span>
      </td>
      <td className="px-2 py-1.5 text-[11px]">
        {row.writer ?? <span className="text-muted-foreground">TBD</span>}
      </td>
      <td className="px-2 py-1.5 text-center">
        <button
          type="button"
          disabled
          aria-label="Open content drawer (wired in Chunk 4)"
          title="Drawer integration lands in Chunk 4"
          className="text-[11px] px-1.5 py-0.5 rounded border bg-card opacity-50 cursor-not-allowed"
        >
          Open
        </button>
      </td>
    </tr>
  );
}

function PriorityPill({ tier }: { tier: string | null }) {
  if (!tier) return <span className="text-muted-foreground text-[11px]">—</span>;
  const head = tier.trim().charAt(0);
  let tint = "bg-slate-100 text-slate-700 border-slate-200";
  let dot = "bg-slate-400";
  if (head === "1") {
    tint = "bg-indigo-50 text-indigo-800 border-indigo-200";
    dot = "bg-indigo-500";
  } else if (head === "2") {
    tint = "bg-sky-50 text-sky-800 border-sky-200";
    dot = "bg-sky-500";
  } else if (head === "3") {
    tint = "bg-amber-50 text-amber-800 border-amber-200";
    dot = "bg-amber-500";
  }
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${tint}`}
      title={tier}
    >
      <span className={`size-1.5 rounded-full ${dot}`} />
      <span className="truncate max-w-[120px]">{tier}</span>
    </span>
  );
}

function ChipRow<T extends string>({
  label,
  values,
  selected,
  counts,
  tint,
  onToggle,
  labelMap,
}: {
  label: string;
  values: readonly T[];
  selected: Set<T>;
  counts: Map<T, number>;
  tint: Record<T, { active: string; idle: string; dot: string }>;
  onToggle: (v: T) => void;
  labelMap?: Record<T, string>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold w-16">
        {label}
      </span>
      {values.map((v) => {
        const t = tint[v];
        const active = selected.has(v);
        return (
          <button
            key={v}
            type="button"
            onClick={() => onToggle(v)}
            className={
              "inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-2 py-1 rounded border transition-colors " +
              (active ? t.active : t.idle)
            }
          >
            <span className={`size-1.5 rounded-full ${t.dot}`} />
            <span>{labelMap?.[v] ?? v}</span>
            <span className="tabular-nums opacity-80 font-normal normal-case tracking-normal">
              {(counts.get(v) ?? 0).toLocaleString()}
            </span>
          </button>
        );
      })}
    </div>
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

function parseCsv<T extends string>(raw: string | null, allowed: readonly T[]): Set<T> {
  if (!raw) return new Set();
  const set = new Set<T>();
  for (const piece of raw.split(",").map((s) => s.trim())) {
    if (allowed.includes(piece as T)) set.add(piece as T);
  }
  return set;
}

// Re-export shared chip/status tints for sibling tabs (SprintCalendar) to reuse.
export { STATUS_TINT, ACTION_TINT };
