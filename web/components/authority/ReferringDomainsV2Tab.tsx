"use client";

// Referring Domains (v2) — paginated table with bulk actions:
//   - Flag for disavow (sets status=disavow_pending + inserts disavow_entry pending)
//   - Set tactic, Set status (active/disavow_pending/disavowed)
//   - Set notes (single-row inline edit; bulk version sets the same text on all)
//
// Filters: tactic, status, spam_signal, DR range, domain text.
// Shows backlink_count + primary_target + primary_anchor inline.

import { useMemo, useState, useTransition } from "react";
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
import type {
  RdStatus,
  ReferringDomainRow,
  SpamSignal,
} from "@/lib/authority";
import { useBulkSelection } from "@/components/wqa/useBulkSelection";
import { AuthorityBulkActionBar } from "./AuthorityBulkActionBar";
import { StatusChip } from "./StatusChip";
import { TacticChip } from "./TacticChip";
import { DrPill } from "./DrPill";
import {
  flagAsDisavowCandidate,
  setReferringDomainStatus,
  setReferringDomainTactic,
} from "@/app/properties/[slug]/authority/actions";

const PAGE_SIZE = 30;
const STATUSES: RdStatus[] = ["active", "disavow_pending", "disavowed"];
const SPAM_SIGNALS: SpamSignal[] = [
  "ahrefs_spam",
  "tld_spam",
  "attack_pattern",
  "manual",
];
const TACTIC_OPTIONS = [
  "editorial_earned",
  "editorial_authoritative",
  "guest_post",
  "directory_citation",
  "resource_page",
  "broken_link",
  "haro",
  "partnership",
  "press_release",
  "spam",
  "unknown",
  "other",
];

export function ReferringDomainsV2Tab({
  refDomains,
  propertySlug,
}: {
  refDomains: ReferringDomainRow[];
  propertySlug: string;
}) {
  const [filters, setFilters] = useState({
    domain: "",
    status: "" as "" | RdStatus,
    tactic: "",
    spam: "" as "" | SpamSignal,
    dr: "",
  });
  const [page, setPage] = useState(0);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const setF = <K extends keyof typeof filters>(
    k: K,
    v: (typeof filters)[K],
  ) => setFilters((p) => ({ ...p, [k]: v }));

  const filtered = useMemo(() => {
    const dom = filters.domain.trim().toLowerCase();
    const dr = parseNumeric(filters.dr);
    return refDomains.filter((r) => {
      if (dom && !r.domain.toLowerCase().includes(dom)) return false;
      if (filters.status && r.status !== filters.status) return false;
      if (filters.tactic && r.tactic !== filters.tactic) return false;
      if (filters.spam && r.spam_signal !== filters.spam) return false;
      if (dr) {
        if (r.domain_rating == null) return false;
        if (dr.op === ">=" && !(r.domain_rating >= dr.n)) return false;
        if (dr.op === "<=" && !(r.domain_rating <= dr.n)) return false;
        if (dr.op === "=" && r.domain_rating !== dr.n) return false;
      }
      return true;
    });
  }, [refDomains, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const visibleKeys = pageRows.map((r) => r.domain);
  const sel = useBulkSelection(visibleKeys);

  function flash(ok: boolean, text: string) {
    setMessage({ ok, text });
    setTimeout(() => setMessage(null), 3500);
  }

  function bulkFlagDisavow() {
    const domains = Array.from(sel.selected);
    if (domains.length === 0) return;
    const reason = prompt(
      `Reason for flagging ${domains.length} domain${domains.length === 1 ? "" : "s"}?`,
      "spam",
    );
    if (reason === null) return;
    startTransition(async () => {
      const res = await flagAsDisavowCandidate(propertySlug, domains, reason);
      if (!res.ok) {
        flash(false, res.error);
        return;
      }
      flash(true, `Flagged ${domains.length} for disavow.`);
      sel.clear();
      window.location.reload();
    });
  }

  function bulkStatus(status: string) {
    const domains = Array.from(sel.selected);
    if (domains.length === 0) return;
    if (
      !confirm(
        `Set status to "${status}" on ${domains.length} referring domain${domains.length === 1 ? "" : "s"}?`,
      )
    )
      return;
    startTransition(async () => {
      const res = await setReferringDomainStatus(
        propertySlug,
        domains,
        status as RdStatus,
      );
      if (!res.ok) {
        flash(false, res.error);
        return;
      }
      flash(true, `Set status on ${domains.length}.`);
      sel.clear();
      window.location.reload();
    });
  }

  function bulkTactic(tactic: string) {
    const domains = Array.from(sel.selected);
    if (domains.length === 0) return;
    if (
      !confirm(
        `Set tactic to "${tactic}" on ${domains.length} referring domain${domains.length === 1 ? "" : "s"}?`,
      )
    )
      return;
    startTransition(async () => {
      const res = await setReferringDomainTactic(propertySlug, domains, tactic);
      if (!res.ok) {
        flash(false, res.error);
        return;
      }
      flash(true, `Set tactic on ${domains.length}.`);
      sel.clear();
      window.location.reload();
    });
  }

  if (refDomains.length === 0) {
    return (
      <EmptyTab message="No referring domains tracked yet. Run the ingest script or refresh data from the Overview tab." />
    );
  }

  return (
    <section>
      <TabHeader
        title="Referring Domains"
        subtitle={
          <>
            Every root domain linking to this property. Bulk-flag spam for
            disavow, set tactics, and update lifecycle status.
          </>
        }
        count={filtered.length}
        total={refDomains.length}
      />

      <AuthorityBulkActionBar
        count={sel.count}
        onClear={sel.clear}
        pending={pending}
        message={message}
        actions={[
          {
            label: "Flag for disavow",
            onPick: bulkFlagDisavow,
            title:
              "Marks selected RDs as disavow_pending + creates disavow_entry rows with status=pending",
          },
          { label: "Set status", options: STATUSES, onPick: bulkStatus },
          { label: "Set tactic", options: TACTIC_OPTIONS, onPick: bulkTactic },
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
            <th className="text-right px-2 py-2 font-medium">
              <HeaderTip
                label="DR"
                tip="Domain Rating (0-100) of the referring domain."
              />
            </th>
            <th className="text-right px-2 py-2 font-medium">
              <HeaderTip
                label="Links"
                tip="Count of distinct backlinks from this referring domain."
              />
            </th>
            <th className="text-left px-2 py-2 font-medium">
              <HeaderTip
                label="Tactic"
                tip="Classification of how the link was earned (editorial, directory, guest post, spam, etc.)."
              />
            </th>
            <th className="text-left px-2 py-2 font-medium">
              <HeaderTip
                label="Spam signal"
                tip="If non-null, why the domain is suspect. ahrefs_spam from Ahrefs, tld_spam from TLD heuristic, attack_pattern from clustered fake-testimonial pattern, manual operator flag."
              />
            </th>
            <th className="text-left px-2 py-2 font-medium">
              <HeaderTip
                label="Primary target"
                tip="Most-linked target URL on your property for this RD."
              />
            </th>
            <th className="text-left px-2 py-2 font-medium">Status</th>
            <th className="text-left px-2 py-2 font-medium min-w-[160px]">Notes</th>
          </tr>
          <tr className="bg-muted/60 border-t">
            <th />
            <th className="px-3 py-1.5 font-normal">
              <TextFilter
                value={filters.domain}
                onChange={(v) => {
                  setF("domain", v);
                  setPage(0);
                }}
                placeholder="search…"
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
              <SelectFilter
                value={filters.tactic}
                onChange={(v) => {
                  setF("tactic", v);
                  setPage(0);
                }}
                options={TACTIC_OPTIONS}
              />
            </th>
            <th className="px-2 py-1.5 font-normal">
              <SelectFilter
                value={filters.spam}
                onChange={(v) => {
                  setF("spam", v as "" | SpamSignal);
                  setPage(0);
                }}
                options={SPAM_SIGNALS}
              />
            </th>
            <th />
            <th className="px-2 py-1.5 font-normal">
              <SelectFilter
                value={filters.status}
                onChange={(v) => {
                  setF("status", v as "" | RdStatus);
                  setPage(0);
                }}
                options={STATUSES}
              />
            </th>
            <th />
          </tr>
        </thead>
        <tbody>
          {pageRows.map((r) => {
            const checked = sel.selected.has(r.domain);
            const notesPreview = r.notes
              ? r.notes.length > 60
                ? `${r.notes.slice(0, 60)}…`
                : r.notes
              : "";
            return (
              <tr key={r.id} className="border-t hover:bg-muted/40">
                <td className="px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => sel.toggle(r.domain)}
                    aria-label={`Select ${r.domain}`}
                  />
                </td>
                <td className="px-3 py-1.5 font-mono text-[11.5px] truncate max-w-0" title={r.domain}>
                  {r.domain}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <DrPill value={r.domain_rating} />
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-[11px]">
                  {r.backlink_count?.toLocaleString() ?? "—"}
                </td>
                <td className="px-2 py-1.5">
                  <TacticChip value={r.tactic} />
                </td>
                <td className="px-2 py-1.5 text-[11px] font-mono">
                  {r.spam_signal ?? <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-2 py-1.5 text-[11px] font-mono truncate max-w-0" title={r.primary_target ?? ""}>
                  {r.primary_target ?? "—"}
                </td>
                <td className="px-2 py-1.5">
                  <StatusChip value={r.status} />
                </td>
                <td className="px-2 py-1.5 text-[11px] text-muted-foreground truncate max-w-0" title={r.notes ?? ""}>
                  {notesPreview}
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
