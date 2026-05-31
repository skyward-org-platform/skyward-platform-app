"use client";

// Disavow tab — list of disavow_entry rows joined inline with their
// referring_domain for DR + spam_signal context. Bulk approve / reject.
// Top-right Export disavow file button triggers a browser download.

import { useMemo, useState, useTransition } from "react";
import {
  EmptyTab,
  HeaderTip,
  TabHeader,
  TableShell,
} from "@/components/wqa/helpers";
import { SelectFilter, TextFilter } from "@/components/keywords/filters";
import type {
  DisavowEntryRow,
  ReferringDomainRow,
} from "@/lib/authority";
import { useBulkSelection } from "@/components/wqa/useBulkSelection";
import { AuthorityBulkActionBar } from "./AuthorityBulkActionBar";
import { StatusChip } from "./StatusChip";
import { DrPill } from "./DrPill";
import {
  approveDisavow,
  rejectDisavow,
  exportDisavowFile,
} from "@/app/properties/[slug]/authority/actions";

const PAGE_SIZE = 30;
const STATUS_OPTIONS = [
  "pending",
  "approved",
  "rejected",
  "In File",
  "Confirmed by GSC",
  "Pending",
];

export function DisavowTab({
  disavow,
  refDomains,
  propertySlug,
}: {
  disavow: DisavowEntryRow[];
  refDomains: ReferringDomainRow[];
  propertySlug: string;
}) {
  const [filters, setFilters] = useState({ status: "", domain: "" });
  const [page, setPage] = useState(0);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const rdByDomain = useMemo(() => {
    const m = new Map<string, ReferringDomainRow>();
    for (const r of refDomains) m.set(r.domain, r);
    return m;
  }, [refDomains]);

  const filtered = useMemo(() => {
    const dom = filters.domain.trim().toLowerCase();
    return disavow.filter((d) => {
      if (filters.status && d.status !== filters.status) return false;
      if (dom && !d.domain.toLowerCase().includes(dom)) return false;
      return true;
    });
  }, [disavow, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const visibleKeys = pageRows.map((r) => r.domain);
  const sel = useBulkSelection(visibleKeys);

  function flash(ok: boolean, text: string) {
    setMessage({ ok, text });
    setTimeout(() => setMessage(null), 3500);
  }

  function bulkApprove() {
    const domains = Array.from(sel.selected);
    if (domains.length === 0) return;
    if (
      !confirm(
        `Approve ${domains.length} disavow entr${domains.length === 1 ? "y" : "ies"}? Their referring_domain.status will flip to "disavowed".`,
      )
    )
      return;
    startTransition(async () => {
      const res = await approveDisavow(propertySlug, domains);
      if (!res.ok) {
        flash(false, res.error);
        return;
      }
      flash(true, `Approved ${domains.length}.`);
      sel.clear();
      window.location.reload();
    });
  }

  function bulkReject() {
    const domains = Array.from(sel.selected);
    if (domains.length === 0) return;
    if (
      !confirm(
        `Reject ${domains.length} disavow entr${domains.length === 1 ? "y" : "ies"}? Their referring_domain.status will restore to "active".`,
      )
    )
      return;
    startTransition(async () => {
      const res = await rejectDisavow(propertySlug, domains);
      if (!res.ok) {
        flash(false, res.error);
        return;
      }
      flash(true, `Rejected ${domains.length}.`);
      sel.clear();
      window.location.reload();
    });
  }

  function downloadDisavow() {
    startTransition(async () => {
      const res = await exportDisavowFile(propertySlug);
      if (!res.ok) {
        flash(false, res.error);
        return;
      }
      const blob = new Blob([res.content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  if (disavow.length === 0) {
    return (
      <>
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight">Disavow</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Disavow file workspace. Empty.
            </p>
          </div>
          <button
            type="button"
            onClick={downloadDisavow}
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded border bg-foreground text-background disabled:opacity-50"
          >
            Export disavow file
          </button>
        </header>
        <EmptyTab message="No disavow candidates yet. Flag domains as disavow_pending on the Referring Domains tab to populate this list." />
      </>
    );
  }

  return (
    <section>
      <TabHeader
        title="Disavow"
        subtitle={
          <>
            Disavow workspace. Approve flagged domains to add them to the
            disavow file, or reject to restore. Export builds the file in
            Google&apos;s expected format.
          </>
        }
        count={filtered.length}
        total={disavow.length}
        rightSlot={
          <button
            type="button"
            onClick={downloadDisavow}
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded border bg-foreground text-background disabled:opacity-50"
            title="Download a plain-text disavow file containing every domain with status='approved'"
          >
            Export disavow file
          </button>
        }
      />

      <AuthorityBulkActionBar
        count={sel.count}
        onClear={sel.clear}
        pending={pending}
        message={message}
        actions={[
          { label: "Approve", onPick: bulkApprove },
          { label: "Reject", onPick: bulkReject },
        ]}
      />

      <TableShell>
        <thead className="sticky top-0 bg-muted/80 backdrop-blur text-[10px] uppercase tracking-wider text-muted-foreground z-10">
          <tr>
            <th className="px-2 py-2 w-8">
              <input
                type="checkbox"
                checked={sel.allVisibleSelected}
                onChange={() => sel.toggleAll(visibleKeys)}
                aria-label="Select all visible"
              />
            </th>
            <th className="text-left px-3 py-2 font-medium min-w-[200px]">Domain</th>
            <th className="text-right px-2 py-2 font-medium">DR</th>
            <th className="text-left px-2 py-2 font-medium">
              <HeaderTip
                label="Spam signal"
                tip="Why the domain was flagged: ahrefs_spam, tld_spam, attack_pattern, manual, or null."
              />
            </th>
            <th className="text-left px-2 py-2 font-medium">Reason</th>
            <th className="text-left px-2 py-2 font-medium">Status</th>
            <th className="text-left px-2 py-2 font-medium">Added</th>
          </tr>
          <tr className="bg-muted/60 border-t">
            <th />
            <th className="px-3 py-1.5 font-normal">
              <TextFilter
                value={filters.domain}
                onChange={(v) => {
                  setFilters((p) => ({ ...p, domain: v }));
                  setPage(0);
                }}
                placeholder="search…"
              />
            </th>
            <th />
            <th />
            <th />
            <th className="px-2 py-1.5 font-normal">
              <SelectFilter
                value={filters.status}
                onChange={(v) => {
                  setFilters((p) => ({ ...p, status: v }));
                  setPage(0);
                }}
                options={STATUS_OPTIONS}
              />
            </th>
            <th />
          </tr>
        </thead>
        <tbody>
          {pageRows.map((d) => {
            const rd = rdByDomain.get(d.domain);
            const checked = sel.selected.has(d.domain);
            return (
              <tr key={d.id} className="border-t hover:bg-muted/40">
                <td className="px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => sel.toggle(d.domain)}
                    aria-label={`Select ${d.domain}`}
                  />
                </td>
                <td className="px-3 py-1.5 font-mono text-[11.5px] truncate max-w-0" title={d.domain}>
                  {d.domain}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <DrPill value={rd?.domain_rating ?? null} />
                </td>
                <td className="px-2 py-1.5 text-[11px]">
                  {rd?.spam_signal ? (
                    <span className="font-mono">{rd.spam_signal}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-[11px] text-muted-foreground truncate max-w-0" title={d.reason ?? ""}>
                  {d.reason ?? "—"}
                </td>
                <td className="px-2 py-1.5">
                  <StatusChip value={d.status} />
                </td>
                <td className="px-2 py-1.5 text-[11px] text-muted-foreground">
                  {new Date(d.added_at).toLocaleDateString()}
                </td>
              </tr>
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
