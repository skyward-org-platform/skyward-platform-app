"use client";

// Universe — every keyword in the property's curated universe. Read-only
// for v1 (status chip becomes editable in Chunk 4). Joined with cluster
// membership so we can show which cluster owns each keyword.

import { useMemo, useState } from "react";
import {
  EmptyTab,
  TabHeader,
  TableShell,
  fmtN,
} from "@/components/wqa/helpers";
import type { KeywordsViewProps } from "../KeywordsView";
import type { KeywordRow, KeywordStatus, KeywordSource } from "@/lib/keywords";

const STATUS_TINT: Record<KeywordStatus, { band: string; dot: string }> = {
  Retained: { band: "bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" },
  Excluded: { band: "bg-rose-50 text-rose-800", dot: "bg-rose-500" },
  Candidate: { band: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
};

const SOURCES: (KeywordSource | "all")[] = [
  "all",
  "ahrefs",
  "gsc",
  "dfs",
  "scraped",
  "seed",
  "manual",
];

const STATUSES: (KeywordStatus | "all")[] = [
  "all",
  "Retained",
  "Excluded",
  "Candidate",
];

const PAGE_SIZE = 100;

export function UniverseTab(props: KeywordsViewProps) {
  const { keywords, clusters, clusterMembers } = props;

  // Build keyword → cluster head_term map in O(K+M).
  const clusterByKeyword = useMemo(() => {
    const clusterById = new Map(clusters.map((c) => [c.id, c]));
    const m = new Map<string, string>();
    for (const cm of clusterMembers) {
      const c = clusterById.get(cm.cluster_id);
      if (c) m.set(cm.keyword, c.name_override || c.head_term);
    }
    return m;
  }, [clusters, clusterMembers]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<KeywordStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<KeywordSource | "all">("all");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return keywords.filter((k) => {
      if (statusFilter !== "all" && k.status !== statusFilter) return false;
      if (sourceFilter !== "all" && k.source !== sourceFilter) return false;
      if (q && !k.keyword.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [keywords, search, statusFilter, sourceFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (keywords.length === 0) {
    return <EmptyTab message="No keywords in the universe yet." />;
  }

  return (
    <section>
      <TabHeader
        title="Universe"
        subtitle={
          <>
            Every keyword in the property&rsquo;s universe with its curation
            status, source, relevance, and assigned cluster. Edit chips land in
            the drawer in a follow-up — read-only for now.
          </>
        }
        count={filtered.length}
        total={keywords.length}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="Search keyword…"
          className="text-[12px] px-2 py-1.5 border rounded bg-card w-56"
        />
        <FilterChips
          label="Status"
          options={STATUSES}
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v as KeywordStatus | "all");
            setPage(0);
          }}
        />
        <FilterChips
          label="Source"
          options={SOURCES}
          value={sourceFilter}
          onChange={(v) => {
            setSourceFilter(v as KeywordSource | "all");
            setPage(0);
          }}
        />
      </div>

      <TableShell>
        <thead className="sticky top-0 bg-muted/80 backdrop-blur text-[10px] uppercase tracking-wider text-muted-foreground z-10">
          <tr>
            <th className="text-left px-3 py-2 font-medium min-w-[260px]">Keyword</th>
            <th className="text-left px-2 py-2 font-medium">Status</th>
            <th className="text-left px-2 py-2 font-medium">Source</th>
            <th className="text-right px-2 py-2 font-medium">Relevance</th>
            <th className="text-right px-2 py-2 font-medium">Client rank</th>
            <th className="text-right px-2 py-2 font-medium">Best comp rank</th>
            <th className="text-left px-2 py-2 font-medium min-w-[200px]">Cluster</th>
          </tr>
        </thead>
        <tbody>
          {pageRows.map((k) => (
            <KeywordRowView
              key={k.id}
              row={k}
              clusterName={clusterByKeyword.get(k.keyword) ?? null}
            />
          ))}
        </tbody>
      </TableShell>

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        total={filtered.length}
      />
    </section>
  );
}

function KeywordRowView({
  row,
  clusterName,
}: {
  row: KeywordRow;
  clusterName: string | null;
}) {
  const tint = STATUS_TINT[row.status];
  return (
    <tr className="border-t hover:bg-muted/40">
      <td className="px-3 py-1.5 text-[11.5px] truncate max-w-0" title={row.keyword}>
        {row.keyword}
      </td>
      <td className="px-2 py-1.5">
        <span
          className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${tint.band}`}
        >
          <span className={`size-1.5 rounded-full ${tint.dot}`} />
          {row.status}
        </span>
      </td>
      <td className="px-2 py-1.5 text-[11px] text-muted-foreground">
        {row.source ?? "—"}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {fmtN(row.relevance_score)}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
        —
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
        —
      </td>
      <td className="px-2 py-1.5 text-[11px] truncate max-w-0">
        {clusterName ? (
          <span title={clusterName}>{clusterName}</span>
        ) : (
          <span className="text-muted-foreground">unassigned</span>
        )}
      </td>
    </tr>
  );
}

function FilterChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 text-[11px]">
      <span className="text-muted-foreground uppercase tracking-wider text-[10px]">
        {label}:
      </span>
      <div className="inline-flex border rounded overflow-hidden">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={
              "px-2 py-1 text-[11px] " +
              (value === opt
                ? "bg-foreground text-background"
                : "bg-card hover:bg-muted/60 text-muted-foreground")
            }
          >
            {opt}
          </button>
        ))}
      </div>
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
