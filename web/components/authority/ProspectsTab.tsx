"use client";

// Prospects tab — link prospect roster with bulk status / priority / tactic
// edits plus an Add Prospect modal that calls createProspectsBulk.

import { useMemo, useState, useTransition } from "react";
import {
  EmptyTab,
  HeaderTip,
  TabHeader,
  TableShell,
} from "@/components/wqa/helpers";
import {
  SelectFilter,
  TextFilter,
} from "@/components/keywords/filters";
import type {
  LinkProspectRow,
  ProspectPriority,
  ProspectStatus,
} from "@/lib/authority";
import { useBulkSelection } from "@/components/wqa/useBulkSelection";
import { AuthorityBulkActionBar } from "./AuthorityBulkActionBar";
import { StatusChip } from "./StatusChip";
import { TacticChip } from "./TacticChip";
import { DrPill } from "./DrPill";
import {
  createProspectsBulk,
  setProspectPriority,
  setProspectStatus,
  setProspectTactic,
  type ProspectInput,
} from "@/app/properties/[slug]/authority/actions";

const PAGE_SIZE = 30;
const STATUSES: ProspectStatus[] = [
  "pending",
  "contacted",
  "placed",
  "declined",
  "abandoned",
];
const PRIORITIES: ProspectPriority[] = ["high", "medium", "low"];
const TACTIC_OPTIONS = [
  "editorial_earned",
  "guest_post",
  "directory_citation",
  "resource_page",
  "broken_link",
  "haro",
  "partnership",
  "press_release",
  "other",
];

export function ProspectsTab({
  prospects,
  propertySlug,
}: {
  prospects: LinkProspectRow[];
  propertySlug: string;
}) {
  const [filters, setFilters] = useState({
    status: "" as "" | ProspectStatus,
    priority: "" as "" | ProspectPriority,
    source: "",
    tactic: "",
    domain: "",
  });
  const [page, setPage] = useState(0);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [showAdd, setShowAdd] = useState(false);

  const setF = <K extends keyof typeof filters>(
    k: K,
    v: (typeof filters)[K],
  ) => setFilters((p) => ({ ...p, [k]: v }));

  const filtered = useMemo(() => {
    const dom = filters.domain.trim().toLowerCase();
    return prospects.filter((p) => {
      if (filters.status && p.status !== filters.status) return false;
      if (filters.priority && p.priority !== filters.priority) return false;
      if (filters.source && (p.source ?? "") !== filters.source) return false;
      if (filters.tactic && (p.tactic ?? "") !== filters.tactic) return false;
      if (dom && !p.domain.toLowerCase().includes(dom)) return false;
      return true;
    });
  }, [prospects, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const visibleKeys = pageRows.map((r) => r.id);
  const sel = useBulkSelection(visibleKeys);

  const sourceOptions = useMemo(() => {
    const s = new Set<string>();
    for (const p of prospects) if (p.source) s.add(p.source);
    return Array.from(s).sort();
  }, [prospects]);

  function flash(ok: boolean, text: string) {
    setMessage({ ok, text });
    setTimeout(() => setMessage(null), 3500);
  }

  function bulk(label: string, value: string) {
    const ids = Array.from(sel.selected);
    if (ids.length === 0) return;
    startTransition(async () => {
      let res;
      if (label === "Set status") {
        res = await setProspectStatus(propertySlug, ids, value as ProspectStatus);
      } else if (label === "Set priority") {
        res = await setProspectPriority(propertySlug, ids, value as ProspectPriority);
      } else if (label === "Set tactic") {
        res = await setProspectTactic(propertySlug, ids, value);
      } else {
        return;
      }
      if (!res.ok) {
        flash(false, res.error);
        return;
      }
      flash(true, `Updated ${ids.length} prospect${ids.length === 1 ? "" : "s"}.`);
      sel.clear();
      window.location.reload();
    });
  }

  if (prospects.length === 0 && !showAdd) {
    return (
      <>
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight">Prospects</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              No prospects yet.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="text-xs px-3 py-1.5 rounded border bg-foreground text-background"
          >
            Add prospect
          </button>
        </header>
        <EmptyTab message="Add prospects manually or ingest from a competitor link gap report." />
      </>
    );
  }

  return (
    <section>
      <TabHeader
        title="Prospects"
        subtitle={
          <>
            Outreach targets and placement pipeline. Bulk-update status,
            priority, and tactic.
          </>
        }
        count={filtered.length}
        total={prospects.length}
        rightSlot={
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="text-xs px-3 py-1.5 rounded border bg-foreground text-background"
          >
            Add prospect
          </button>
        }
      />

      <AuthorityBulkActionBar
        count={sel.count}
        onClear={sel.clear}
        pending={pending}
        message={message}
        actions={[
          {
            label: "Set status",
            options: STATUSES,
            onPick: (v) => bulk("Set status", v),
          },
          {
            label: "Set priority",
            options: PRIORITIES,
            onPick: (v) => bulk("Set priority", v),
          },
          {
            label: "Set tactic",
            options: TACTIC_OPTIONS,
            onPick: (v) => bulk("Set tactic", v),
          },
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
            <th className="text-left px-3 py-2 font-medium min-w-[200px]">
              <HeaderTip label="Domain" tip="Prospect root domain." />
            </th>
            <th className="text-right px-2 py-2 font-medium">DR</th>
            <th className="text-left px-2 py-2 font-medium">
              <HeaderTip label="Tactic" tip="Acquisition tactic classification." />
            </th>
            <th className="text-left px-2 py-2 font-medium">Status</th>
            <th className="text-left px-2 py-2 font-medium">Priority</th>
            <th className="text-left px-2 py-2 font-medium">
              <HeaderTip
                label="Source"
                tip="How the prospect was discovered (competitor gap, manual, etc)."
              />
            </th>
            <th className="text-left px-2 py-2 font-medium">Last contact</th>
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
                value={filters.status}
                onChange={(v) => {
                  setF("status", v as "" | ProspectStatus);
                  setPage(0);
                }}
                options={STATUSES}
              />
            </th>
            <th className="px-2 py-1.5 font-normal">
              <SelectFilter
                value={filters.priority}
                onChange={(v) => {
                  setF("priority", v as "" | ProspectPriority);
                  setPage(0);
                }}
                options={PRIORITIES}
              />
            </th>
            <th className="px-2 py-1.5 font-normal">
              <SelectFilter
                value={filters.source}
                onChange={(v) => {
                  setF("source", v);
                  setPage(0);
                }}
                options={sourceOptions}
              />
            </th>
            <th />
          </tr>
        </thead>
        <tbody>
          {pageRows.map((p) => {
            const checked = sel.selected.has(p.id);
            return (
              <tr key={p.id} className="border-t hover:bg-muted/40">
                <td className="px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => sel.toggle(p.id)}
                    aria-label={`Select ${p.domain}`}
                  />
                </td>
                <td className="px-3 py-1.5 font-mono text-[11.5px] truncate max-w-0" title={p.domain}>
                  {p.url ? (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      {p.domain}
                    </a>
                  ) : (
                    p.domain
                  )}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <DrPill value={p.dr} />
                </td>
                <td className="px-2 py-1.5">
                  <TacticChip value={p.tactic} />
                </td>
                <td className="px-2 py-1.5">
                  <StatusChip value={p.status} />
                </td>
                <td className="px-2 py-1.5 text-[11px] capitalize">
                  {p.priority}
                </td>
                <td className="px-2 py-1.5 text-[11px] text-muted-foreground">
                  {p.source ?? "—"}
                </td>
                <td className="px-2 py-1.5 text-[11px] text-muted-foreground">
                  {p.last_contacted_at
                    ? new Date(p.last_contacted_at).toLocaleDateString()
                    : "—"}
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

      {showAdd && (
        <AddProspectModal
          slug={propertySlug}
          onClose={() => setShowAdd(false)}
          onSuccess={() => {
            setShowAdd(false);
            window.location.reload();
          }}
        />
      )}
    </section>
  );
}

function AddProspectModal({
  slug,
  onClose,
  onSuccess,
}: {
  slug: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [raw, setRaw] = useState("");
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    // Format: one prospect per line, "domain[, dr][, tactic][, priority][, url]"
    const items: ProspectInput[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(",").map((p) => p.trim());
      const [domain, dr, tactic, priority, url] = parts;
      if (!domain) continue;
      const it: ProspectInput = { domain };
      if (dr) {
        const n = Number(dr);
        if (Number.isFinite(n)) it.dr = n;
      }
      if (tactic) it.tactic = tactic;
      if (priority === "high" || priority === "medium" || priority === "low") {
        it.priority = priority;
      }
      if (url) it.url = url;
      it.source = "manual";
      items.push(it);
    }
    if (items.length === 0) {
      setError("Add at least one domain.");
      return;
    }
    startTransition(async () => {
      const res = await createProspectsBulk(slug, items);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSuccess();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-center items-start pt-12">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-background border rounded-lg max-w-2xl w-full p-6 mx-4">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-lg font-semibold">Add prospects</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          One prospect per line. Format:{" "}
          <code>domain, dr, tactic, priority, url</code>. Only domain is
          required.
        </p>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={8}
          placeholder="example.com, 45, guest_post, high, https://example.com/contributor"
          className="w-full text-xs font-mono border rounded p-2 bg-card"
        />
        {error && (
          <div className="text-xs text-rose-600 mt-2">{error}</div>
        )}
        <div className="flex justify-end gap-2 mt-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-xs px-3 py-1.5 rounded border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="text-xs px-3 py-1.5 rounded border bg-foreground text-background disabled:opacity-50"
          >
            {submitting ? "Adding…" : "Add prospects"}
          </button>
        </div>
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
