"use client";

// Referring Domains — read-only table mirroring the UniverseTab pattern.
//
//   • Counter chip strip (All, Pending, Quality, Spam, Disavow). Click
//     toggles `?quality=` URL param (comma-separated multi-select).
//   • Per-column filter row (text/numeric/select).
//   • Static colored Quality pill (Chunk 4 swaps for editable QualityChip).
//   • Open button stub (drawer hook lands in Chunk 4).
//   • Pagination 100/page.
//
// IMPORTANT — DR labeling: the `domain_rating` column stores DataForSEO's
// `rank` field on a 0-1000 scale. The column is labeled "DFS Rank" with a
// hint, not "Domain Rating", to avoid being mistaken for Ahrefs DR.

import { useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  EmptyTab,
  TabHeader,
  TableShell,
} from "@/components/wqa/helpers";
import { TextFilter, SelectFilter, NumericFilter, parseNumeric } from "@/components/keywords/filters";
import type { AuthorityViewProps } from "./AuthorityView";
import type { ReferringDomainRow, RefDomainQuality } from "@/lib/authority";

const QUALITY_VALUES: RefDomainQuality[] = ["Pending", "Quality", "Spam", "Disavow"];

const QUALITY_TINT: Record<
  RefDomainQuality,
  { active: string; idle: string; dot: string; pill: string }
> = {
  Quality: {
    active: "bg-emerald-100 text-emerald-900 border-emerald-300",
    idle: "bg-emerald-50/60 text-emerald-800 border-emerald-200/60 hover:bg-emerald-50",
    dot: "bg-emerald-500",
    pill: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  Spam: {
    active: "bg-rose-100 text-rose-900 border-rose-300",
    idle: "bg-rose-50/60 text-rose-800 border-rose-200/60 hover:bg-rose-50",
    dot: "bg-rose-500",
    pill: "bg-rose-100 text-rose-800 border-rose-200",
  },
  Pending: {
    active: "bg-slate-200 text-slate-900 border-slate-400",
    idle: "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100",
    dot: "bg-slate-400",
    pill: "bg-slate-100 text-slate-700 border-slate-200",
  },
  Disavow: {
    active: "bg-violet-100 text-violet-900 border-violet-300",
    idle: "bg-violet-50/60 text-violet-800 border-violet-200/60 hover:bg-violet-50",
    dot: "bg-violet-500",
    pill: "bg-violet-100 text-violet-800 border-violet-200",
  },
};

const PAGE_SIZE = 100;

export function ReferringDomainsTab(props: AuthorityViewProps) {
  const { refDomains } = props;
  const router = useRouter();
  const sp = useSearchParams();

  // ─── Selected quality set (multi-select OR via ?quality=) ────────────
  const selectedQualities = useMemo<Set<RefDomainQuality>>(() => {
    const raw = sp.get("quality");
    if (!raw) return new Set();
    return new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is RefDomainQuality =>
          QUALITY_VALUES.includes(s as RefDomainQuality),
        ),
    );
  }, [sp]);

  function toggleQuality(q: RefDomainQuality) {
    const next = new Set(selectedQualities);
    if (next.has(q)) next.delete(q);
    else next.add(q);
    const params = new URLSearchParams(sp.toString());
    if (next.size === 0) params.delete("quality");
    else params.set("quality", Array.from(next).join(","));
    router.push(`?${params.toString()}`);
  }

  function clearQualities() {
    const params = new URLSearchParams(sp.toString());
    params.delete("quality");
    router.push(`?${params.toString()}`);
  }

  // ─── Quality counts (over the whole list) ────────────────────────────
  const qualityCounts = useMemo(() => {
    const m = new Map<RefDomainQuality, number>();
    for (const q of QUALITY_VALUES) m.set(q, 0);
    for (const r of refDomains) m.set(r.quality, (m.get(r.quality) ?? 0) + 1);
    return m;
  }, [refDomains]);

  // ─── Per-column filter state ─────────────────────────────────────────
  const [colFilters, setColFilters] = useState({
    domain: "",
    rank: "",
    traffic: "",
    quality: "" as "" | RefDomainQuality,
  });
  const setColFilter = <K extends keyof typeof colFilters>(
    k: K,
    v: (typeof colFilters)[K],
  ) => setColFilters((prev) => ({ ...prev, [k]: v }));

  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const dom = colFilters.domain.trim().toLowerCase();
    const rank = parseNumeric(colFilters.rank);
    const traf = parseNumeric(colFilters.traffic);
    return refDomains.filter((r) => {
      if (selectedQualities.size > 0 && !selectedQualities.has(r.quality)) return false;
      if (colFilters.quality && r.quality !== colFilters.quality) return false;
      if (dom && !r.domain.toLowerCase().includes(dom)) return false;
      if (rank) {
        if (r.domain_rating == null) return false;
        if (rank.op === ">=" && !(r.domain_rating >= rank.n)) return false;
        if (rank.op === "<=" && !(r.domain_rating <= rank.n)) return false;
        if (rank.op === "=" && r.domain_rating !== rank.n) return false;
      }
      if (traf) {
        if (r.traffic_domain == null) return false;
        if (traf.op === ">=" && !(r.traffic_domain >= traf.n)) return false;
        if (traf.op === "<=" && !(r.traffic_domain <= traf.n)) return false;
        if (traf.op === "=" && r.traffic_domain !== traf.n) return false;
      }
      return true;
    });
  }, [refDomains, selectedQualities, colFilters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  if (refDomains.length === 0) {
    return (
      <EmptyTab message="No referring domains tracked yet. Click 'Refresh data' on the Overview tab to pull initial data." />
    );
  }

  return (
    <section>
      <TabHeader
        title="Referring Domains"
        subtitle={
          <>
            Every referring domain tracked for this property. Use the chip
            strip to filter by quality classification, or the per-column
            inputs for finer filtering.
          </>
        }
        count={filtered.length}
        total={refDomains.length}
      />

      {/* ── Counter strip ── */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={clearQualities}
          className={
            "inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-2 py-1 rounded border transition-colors " +
            (selectedQualities.size === 0
              ? "bg-foreground text-background border-foreground"
              : "bg-card text-muted-foreground border-border hover:bg-muted")
          }
        >
          <span>All</span>
          <span className="tabular-nums opacity-80 font-normal normal-case tracking-normal">
            {refDomains.length.toLocaleString()}
          </span>
        </button>
        {QUALITY_VALUES.map((q) => {
          const tint = QUALITY_TINT[q];
          const active = selectedQualities.has(q);
          return (
            <button
              key={q}
              onClick={() => toggleQuality(q)}
              className={
                "inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-2 py-1 rounded border transition-colors " +
                (active ? tint.active : tint.idle)
              }
            >
              <span className={`size-1.5 rounded-full ${tint.dot}`} />
              <span>{q}</span>
              <span className="tabular-nums opacity-80 font-normal normal-case tracking-normal">
                {(qualityCounts.get(q) ?? 0).toLocaleString()}
              </span>
            </button>
          );
        })}
        <span className="text-[10.5px] text-muted-foreground ml-1">
          {selectedQualities.size > 0
            ? "click chip to toggle"
            : "click a chip to filter"}
        </span>
      </div>

      <TableShell>
        <thead className="sticky top-0 bg-muted/80 backdrop-blur text-[10px] uppercase tracking-wider text-muted-foreground z-10">
          <tr>
            <th className="text-left px-3 py-2 font-medium min-w-[220px]">Domain</th>
            <th className="text-right px-2 py-2 font-medium">DFS Rank</th>
            <th className="text-right px-2 py-2 font-medium">Traffic</th>
            <th className="text-left px-2 py-2 font-medium">First Seen</th>
            <th className="text-right px-2 py-2 font-medium">Dofollow</th>
            <th className="text-center px-2 py-2 font-medium">Spam</th>
            <th className="text-left px-2 py-2 font-medium">Quality</th>
            <th className="text-left px-2 py-2 font-medium min-w-[180px]">Notes</th>
            <th className="text-right px-2 py-2 font-medium">Open</th>
          </tr>
          <tr className="bg-muted/60 border-t">
            <th className="px-3 py-1.5 font-normal">
              <TextFilter
                value={colFilters.domain}
                onChange={(v) => {
                  setColFilter("domain", v);
                  setPage(0);
                }}
                placeholder="search domain…"
              />
            </th>
            <th className="px-2 py-1.5 font-normal">
              <NumericFilter
                value={colFilters.rank}
                onChange={(v) => {
                  setColFilter("rank", v);
                  setPage(0);
                }}
                placeholder="≥"
              />
            </th>
            <th className="px-2 py-1.5 font-normal">
              <NumericFilter
                value={colFilters.traffic}
                onChange={(v) => {
                  setColFilter("traffic", v);
                  setPage(0);
                }}
                placeholder="≥"
              />
            </th>
            <th />
            <th />
            <th />
            <th className="px-2 py-1.5 font-normal">
              <SelectFilter
                value={colFilters.quality}
                onChange={(v) => {
                  setColFilter("quality", v as "" | RefDomainQuality);
                  setPage(0);
                }}
                options={QUALITY_VALUES}
              />
            </th>
            <th />
            <th />
          </tr>
        </thead>
        <tbody>
          {pageRows.map((r) => (
            <RefDomainRow key={r.id} row={r} />
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

function RefDomainRow({ row }: { row: ReferringDomainRow }) {
  const tint = QUALITY_TINT[row.quality];
  const notesPreview = row.notes
    ? row.notes.length > 60
      ? `${row.notes.slice(0, 60)}…`
      : row.notes
    : "";
  return (
    <tr className="border-t hover:bg-muted/40">
      <td className="px-3 py-1.5 font-mono text-[11.5px] truncate max-w-0" title={row.domain}>
        {row.domain}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {row.domain_rating != null ? row.domain_rating.toFixed(0) : "—"}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {row.traffic_domain != null ? row.traffic_domain.toLocaleString() : "—"}
      </td>
      <td className="px-2 py-1.5 text-[11px] text-muted-foreground">
        {row.first_seen
          ? new Date(row.first_seen).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })
          : "—"}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {row.dofollow_links ?? 0}
      </td>
      <td className="px-2 py-1.5 text-center">
        {row.detected_spam ? (
          <span
            className="inline-flex items-center justify-center size-4 rounded-full bg-rose-100 text-rose-700"
            title="Flagged spam by detector"
          >
            <svg
              viewBox="0 0 16 16"
              className="size-2.5"
              fill="currentColor"
              aria-hidden
            >
              <path d="M3 1.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 .354.854L9.207 6l3.647 4.146A.5.5 0 0 1 12.5 11H4v3.5a.5.5 0 0 1-1 0V1.5z" />
            </svg>
          </span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </td>
      <td className="px-2 py-1.5">
        <span
          className={`inline-block text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded border ${tint.pill}`}
        >
          {row.quality}
        </span>
      </td>
      <td
        className="px-2 py-1.5 text-[11px] text-muted-foreground truncate max-w-0"
        title={row.notes ?? ""}
      >
        {notesPreview}
      </td>
      <td className="px-2 py-1.5 text-right">
        <button
          type="button"
          disabled
          className="text-[11px] px-2 py-0.5 rounded border bg-card text-muted-foreground/60 cursor-not-allowed"
          title="Drawer wired in Chunk 4"
        >
          Open
        </button>
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
