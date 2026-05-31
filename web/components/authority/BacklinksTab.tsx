"use client";

// Backlinks tab — read-only paginated table of every backlink row.
// Filters: source_domain (text), target_url (text), link_type (followed /
// nofollow), DR range (numeric min). Sort: source_dr desc default.

import { useMemo, useState } from "react";
import {
  EmptyTab,
  HeaderTip,
  TabHeader,
  TableShell,
} from "@/components/wqa/helpers";
import {
  NumericFilter,
  parseNumeric,
  SelectFilter,
  TextFilter,
} from "@/components/keywords/filters";
import type { BacklinkRow } from "@/lib/authority";
import { DrPill } from "./DrPill";

const PAGE_SIZE = 30;
const LINK_TYPE_OPTIONS = ["followed", "nofollow", "sponsored", "ugc", "text"] as const;

export function BacklinksTab({ backlinks }: { backlinks: BacklinkRow[] }) {
  const [filters, setFilters] = useState({
    source: "",
    target: "",
    link_type: "",
    dr: "",
  });
  const [page, setPage] = useState(0);

  const setF = <K extends keyof typeof filters>(
    k: K,
    v: (typeof filters)[K],
  ) => setFilters((p) => ({ ...p, [k]: v }));

  const filtered = useMemo(() => {
    const src = filters.source.trim().toLowerCase();
    const tgt = filters.target.trim().toLowerCase();
    const dr = parseNumeric(filters.dr);
    return backlinks.filter((b) => {
      if (src && !b.source_domain.toLowerCase().includes(src)) return false;
      if (tgt && !b.target_url.toLowerCase().includes(tgt)) return false;
      if (filters.link_type && b.link_type !== filters.link_type) return false;
      if (dr) {
        if (b.source_dr == null) return false;
        if (dr.op === ">=" && !(b.source_dr >= dr.n)) return false;
        if (dr.op === "<=" && !(b.source_dr <= dr.n)) return false;
        if (dr.op === "=" && b.source_dr !== dr.n) return false;
      }
      return true;
    });
  }, [backlinks, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  if (backlinks.length === 0) {
    return (
      <EmptyTab message="No backlinks ingested yet. Run the ingest script to populate this table." />
    );
  }

  return (
    <section>
      <TabHeader
        title="Backlinks"
        subtitle={
          <>
            Every backlink row ingested for this property. Read-only for v1.
            Sort defaults to source DR descending.
          </>
        }
        count={filtered.length}
        total={backlinks.length}
      />

      <TableShell>
        <thead className="sticky top-0 bg-muted/80 backdrop-blur text-[10px] uppercase tracking-wider text-muted-foreground z-10">
          <tr>
            <th className="text-left px-3 py-2 font-medium min-w-[200px]">
              <HeaderTip
                label="Source domain"
                tip="The referring root domain hosting the backlink."
              />
            </th>
            <th className="text-right px-2 py-2 font-medium">
              <HeaderTip
                label="DR"
                tip="Domain Rating (0-100, higher is stronger) of the source domain at ingest time."
              />
            </th>
            <th className="text-right px-2 py-2 font-medium">
              <HeaderTip
                label="Traffic"
                tip="Estimated monthly organic traffic to the source domain."
              />
            </th>
            <th className="text-left px-2 py-2 font-medium min-w-[220px]">
              <HeaderTip
                label="Target URL"
                tip="The page on your property that this backlink points to."
              />
            </th>
            <th className="text-left px-2 py-2 font-medium min-w-[180px]">Anchor</th>
            <th className="text-left px-2 py-2 font-medium">
              <HeaderTip
                label="Link type"
                tip="followed / nofollow / sponsored / ugc per HTML rel attribute."
              />
            </th>
            <th className="text-left px-2 py-2 font-medium">First seen</th>
          </tr>
          <tr className="bg-muted/60 border-t">
            <th className="px-3 py-1.5 font-normal">
              <TextFilter
                value={filters.source}
                onChange={(v) => {
                  setF("source", v);
                  setPage(0);
                }}
                placeholder="search domain…"
              />
            </th>
            <th className="px-2 py-1.5 font-normal">
              <NumericFilter
                value={filters.dr}
                onChange={(v) => {
                  setF("dr", v);
                  setPage(0);
                }}
                placeholder="≥"
              />
            </th>
            <th />
            <th className="px-2 py-1.5 font-normal">
              <TextFilter
                value={filters.target}
                onChange={(v) => {
                  setF("target", v);
                  setPage(0);
                }}
                placeholder="search target…"
              />
            </th>
            <th />
            <th className="px-2 py-1.5 font-normal">
              <SelectFilter
                value={filters.link_type}
                onChange={(v) => {
                  setF("link_type", v);
                  setPage(0);
                }}
                options={LINK_TYPE_OPTIONS}
              />
            </th>
            <th />
          </tr>
        </thead>
        <tbody>
          {pageRows.map((b) => (
            <tr key={b.id} className="border-t hover:bg-muted/40">
              <td className="px-3 py-1.5 font-mono text-[11.5px] truncate max-w-0" title={b.source_domain}>
                <a
                  href={b.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                >
                  {b.source_domain}
                </a>
              </td>
              <td className="px-2 py-1.5 text-right">
                <DrPill value={b.source_dr} />
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-[11px]">
                {b.source_traffic != null
                  ? b.source_traffic.toLocaleString()
                  : "—"}
              </td>
              <td className="px-2 py-1.5 truncate max-w-0 font-mono text-[11px]" title={b.target_url}>
                <a
                  href={b.target_url}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                >
                  {b.target_url}
                </a>
              </td>
              <td className="px-2 py-1.5 truncate max-w-0 text-[11px]" title={b.anchor ?? ""}>
                {b.anchor || <span className="text-muted-foreground">—</span>}
              </td>
              <td className="px-2 py-1.5 text-[11px]">
                {b.link_type ?? "—"}
              </td>
              <td className="px-2 py-1.5 text-[11px] text-muted-foreground">
                {b.first_seen
                  ? new Date(b.first_seen).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "2-digit",
                    })
                  : "—"}
              </td>
            </tr>
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
        Showing {(page * PAGE_SIZE + 1).toLocaleString()}-
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
