"use client";

// Universe — every keyword in the property's curated universe.
//
// This is the workhorse table. It has:
//   • A status counter strip above the table (Retained / Candidate /
//     Excluded). Click a chip to toggle filter inclusion (multi-select
//     OR). Selected chips persist in `?status=Retained,Candidate`.
//   • An inline cluster column with click-to-open-cluster-drawer.
//   • A color-coded relevance pill.
//   • Per-column filter inputs (text / select / numeric ≥).
//
// Intent counters are deferred — `keyword` table doesn't have an intent
// column today (data lives in BQ kga_output, not yet backfilled). When
// the column lands, add an intent counter row alongside status.

import { useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  EmptyTab,
  TabHeader,
  TableShell,
  fmtN,
} from "@/components/wqa/helpers";
import { KeywordStatusChip } from "../KeywordStatusChip";
import { RelevancePill } from "../RelevancePill";
import { TextFilter, SelectFilter, NumericFilter } from "../filters";
import { parseNumeric } from "../filters";
import type { KeywordsViewProps, RowClickHandler } from "../KeywordsView";
import type { KeywordRow, KeywordStatus, KeywordSource } from "@/lib/keywords";
import type { ClusterRow } from "@/lib/clusters";

const STATUS_VALUES: KeywordStatus[] = ["Retained", "Candidate", "Excluded"];
const SOURCE_VALUES: KeywordSource[] = ["ahrefs", "gsc", "dfs", "scraped", "seed", "manual"];

const STATUS_TINT: Record<KeywordStatus, { active: string; idle: string; dot: string }> = {
  Retained: {
    active: "bg-emerald-100 text-emerald-900 border-emerald-300",
    idle: "bg-emerald-50/60 text-emerald-800 border-emerald-200/60 hover:bg-emerald-50",
    dot: "bg-emerald-500",
  },
  Candidate: {
    active: "bg-slate-200 text-slate-900 border-slate-400",
    idle: "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100",
    dot: "bg-slate-400",
  },
  Excluded: {
    active: "bg-rose-100 text-rose-900 border-rose-300",
    idle: "bg-rose-50/60 text-rose-800 border-rose-200/60 hover:bg-rose-50",
    dot: "bg-rose-500",
  },
};

const PAGE_SIZE = 100;

export type UniverseTabProps = KeywordsViewProps & {
  onRowClick?: RowClickHandler;
  onClusterClick?: (cluster: ClusterRow) => void;
  /** When set, force these statuses pre-selected (e.g. Review Queue). */
  forceStatuses?: KeywordStatus[];
  /** Suppress the header (Review Queue renders its own). */
  hideHeader?: boolean;
};

export function UniverseTab(props: UniverseTabProps) {
  const {
    keywords,
    clusters,
    clusterMembers,
    propertySlug,
    onRowClick,
    onClusterClick,
    forceStatuses,
    hideHeader,
  } = props;

  const router = useRouter();
  const sp = useSearchParams();

  // ─── Selected status set (multi-select OR) ─────────────────────────
  const selectedStatuses = useMemo<Set<KeywordStatus>>(() => {
    if (forceStatuses) return new Set(forceStatuses);
    const raw = sp.get("status");
    if (!raw) return new Set();
    return new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is KeywordStatus => STATUS_VALUES.includes(s as KeywordStatus)),
    );
  }, [sp, forceStatuses]);

  function toggleStatus(s: KeywordStatus) {
    if (forceStatuses) return; // locked when forced
    const next = new Set(selectedStatuses);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    const params = new URLSearchParams(sp.toString());
    if (next.size === 0) params.delete("status");
    else params.set("status", Array.from(next).join(","));
    router.push(`?${params.toString()}`);
  }

  // ─── Status counts (over the WHOLE universe, not filtered) ─────────
  const statusCounts = useMemo(() => {
    const m = new Map<KeywordStatus, number>();
    for (const s of STATUS_VALUES) m.set(s, 0);
    for (const k of keywords) m.set(k.status, (m.get(k.status) ?? 0) + 1);
    return m;
  }, [keywords]);

  // ─── keyword → cluster lookup ──────────────────────────────────────
  const clusterByKeyword = useMemo(() => {
    const clusterById = new Map(clusters.map((c) => [c.id, c]));
    const m = new Map<string, { id: string; name: string; cluster: ClusterRow }>();
    for (const cm of clusterMembers) {
      const c = clusterById.get(cm.cluster_id);
      if (c) m.set(cm.keyword, { id: c.id, name: c.name_override || c.head_term, cluster: c });
    }
    return m;
  }, [clusters, clusterMembers]);

  // ─── Per-column filter state ───────────────────────────────────────
  const [colFilters, setColFilters] = useState({
    keyword: "",
    cluster: "",
    status: "" as "" | KeywordStatus,
    source: "" as "" | KeywordSource,
    relevance: "",
  });
  const setColFilter = <K extends keyof typeof colFilters>(k: K, v: (typeof colFilters)[K]) =>
    setColFilters((prev) => ({ ...prev, [k]: v }));

  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const kw = colFilters.keyword.trim().toLowerCase();
    const cl = colFilters.cluster.trim().toLowerCase();
    const rel = parseNumeric(colFilters.relevance);
    return keywords.filter((k) => {
      if (selectedStatuses.size > 0 && !selectedStatuses.has(k.status)) return false;
      if (colFilters.status && k.status !== colFilters.status) return false;
      if (colFilters.source && k.source !== colFilters.source) return false;
      if (kw && !k.keyword.toLowerCase().includes(kw)) return false;
      if (cl) {
        const link = clusterByKeyword.get(k.keyword);
        const name = (link?.name ?? "").toLowerCase();
        if (!name.includes(cl)) return false;
      }
      if (rel && k.relevance_score != null) {
        if (rel.op === ">=" && !(k.relevance_score >= rel.n)) return false;
        if (rel.op === "<=" && !(k.relevance_score <= rel.n)) return false;
        if (rel.op === "=" && k.relevance_score !== rel.n) return false;
      } else if (rel && k.relevance_score == null) {
        return false;
      }
      return true;
    });
  }, [keywords, selectedStatuses, colFilters, clusterByKeyword]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  if (keywords.length === 0) {
    return <EmptyTab message="No keywords in the universe yet." />;
  }

  return (
    <section>
      {!hideHeader && (
        <TabHeader
          title="All Keywords"
          subtitle={
            <>
              Every keyword in the property&rsquo;s universe with curation
              status, source, relevance, and assigned cluster. Click a row
              to open the keyword drawer; click a cluster name to open the
              cluster drawer.
            </>
          }
          count={filtered.length}
          total={keywords.length}
        />
      )}

      {/* ── Counter strip ── */}
      {!forceStatuses && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {STATUS_VALUES.map((s) => {
            const tint = STATUS_TINT[s];
            const active = selectedStatuses.has(s);
            return (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className={
                  "inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-2 py-1 rounded border transition-colors " +
                  (active ? tint.active : tint.idle)
                }
              >
                <span className={`size-1.5 rounded-full ${tint.dot}`} />
                <span>{s}</span>
                <span className="tabular-nums opacity-80 font-normal normal-case tracking-normal">
                  {(statusCounts.get(s) ?? 0).toLocaleString()}
                </span>
              </button>
            );
          })}
          <span className="text-[10.5px] text-muted-foreground ml-1">
            {selectedStatuses.size > 0
              ? "click chip to toggle"
              : "click a chip to filter"}
          </span>
          {/* TODO: intent counters require backfilling intent column from kga_output */}
        </div>
      )}

      <TableShell>
        <thead className="sticky top-0 bg-muted/80 backdrop-blur text-[10px] uppercase tracking-wider text-muted-foreground z-10">
          <tr>
            <th className="text-left px-3 py-2 font-medium min-w-[240px]">Keyword</th>
            <th className="text-left px-2 py-2 font-medium min-w-[180px]">Cluster</th>
            <th className="text-left px-2 py-2 font-medium">Status</th>
            <th className="text-left px-2 py-2 font-medium">Source</th>
            <th className="text-right px-2 py-2 font-medium">Relevance</th>
          </tr>
          <tr className="bg-muted/60 border-t">
            <th className="px-3 py-1.5 font-normal">
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
              <SelectFilter
                value={colFilters.status}
                onChange={(v) => {
                  setColFilter("status", v as "" | KeywordStatus);
                  setPage(0);
                }}
                options={STATUS_VALUES}
              />
            </th>
            <th className="px-2 py-1.5 font-normal">
              <SelectFilter
                value={colFilters.source}
                onChange={(v) => {
                  setColFilter("source", v as "" | KeywordSource);
                  setPage(0);
                }}
                options={SOURCE_VALUES}
              />
            </th>
            <th className="px-2 py-1.5 font-normal">
              <NumericFilter
                value={colFilters.relevance}
                onChange={(v) => {
                  setColFilter("relevance", v);
                  setPage(0);
                }}
                placeholder="≥"
              />
            </th>
          </tr>
        </thead>
        <tbody>
          {pageRows.map((k) => {
            const link = clusterByKeyword.get(k.keyword) ?? null;
            return (
              <KeywordRowView
                key={k.id}
                row={k}
                clusterLink={link}
                propertySlug={propertySlug}
                onRowClick={onRowClick}
                onClusterClick={onClusterClick}
              />
            );
          })}
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

function KeywordRowView({
  row,
  clusterLink,
  propertySlug,
  onRowClick,
  onClusterClick,
}: {
  row: KeywordRow;
  clusterLink: { id: string; name: string; cluster: ClusterRow } | null;
  propertySlug: string;
  onRowClick?: RowClickHandler;
  onClusterClick?: (cluster: ClusterRow) => void;
}) {
  return (
    <tr
      className={
        "border-t hover:bg-muted/40 " +
        (onRowClick ? "cursor-pointer" : "")
      }
      onClick={
        onRowClick
          ? () =>
              onRowClick({
                kind: "keyword",
                keyword: row,
                clusterName: clusterLink?.name ?? null,
                clusterId: clusterLink?.id ?? null,
              })
          : undefined
      }
    >
      <td className="px-3 py-1.5 text-[11.5px] truncate max-w-0" title={row.keyword}>
        {row.keyword}
      </td>
      <td className="px-2 py-1.5 text-[11px] truncate max-w-0">
        {clusterLink ? (
          <button
            type="button"
            title={`Open cluster — ${clusterLink.name}`}
            className="text-left hover:underline truncate max-w-full text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onClusterClick?.(clusterLink.cluster);
            }}
          >
            {clusterLink.name}
          </button>
        ) : (
          <span className="text-muted-foreground">unassigned</span>
        )}
      </td>
      <td className="px-2 py-1.5">
        <KeywordStatusChip
          propertySlug={propertySlug}
          keyword={row.keyword}
          initialStatus={row.status}
        />
      </td>
      <td className="px-2 py-1.5 text-[11px] text-muted-foreground">
        {row.source ?? "—"}
      </td>
      <td className="px-2 py-1.5 text-right">
        <RelevancePill score={row.relevance_score} />
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
