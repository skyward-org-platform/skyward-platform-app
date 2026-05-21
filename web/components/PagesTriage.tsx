"use client";

// V2 screen 6 — Pages triage with histogram-as-filter.
//
// The histogram at the top doubles as a filter: click a cell to scope the
// table; click again (or click "All") to clear. The "Review" cell (undecided
// action) is visually distinct (warm yellow) to draw the eye to outstanding
// decisions. Undecided rows get a warm-yellow row background for the same
// reason. Redirect / consolidate rows show their target inline.
//
// Edits via AuditActionChip flow through the existing server action; on
// success Next revalidates the path and the page re-renders with new counts.
// Filter selection resets on that re-render — acceptable for V1.1.

import { useMemo, useState } from "react";
import { AuditActionChip } from "@/components/AuditActionChip";
import { AuditTargetInput } from "@/components/AuditTargetInput";
import {
  AuditHistoryButton,
  type AuditHistoryRow,
} from "@/components/AuditHistoryButton";
import {
  ActionPill,
  type ActionVariant,
  actionLabel,
} from "@/components/ActionPill";

export type Page = {
  id: string;
  url: string;
  title: string | null;
  h1: string | null;
  page_type: string | null;
  status_code: number | null;
  audit_action: string | null;
  audit_target_url: string | null;
  audit_decided_at: string | null;
  word_count: number | null;
  history: AuditHistoryRow[];
};

const HISTOGRAM_ORDER: ActionVariant[] = [
  "optimize",
  "restore",
  "redirect",
  "consolidate",
  "remove",
  "keep",
  "undecided",
];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function actionOf(p: Page): ActionVariant {
  const a = p.audit_action ?? "undecided";
  return (HISTOGRAM_ORDER.includes(a as ActionVariant)
    ? a
    : "undecided") as ActionVariant;
}

export function PagesTriage({
  propertySlug,
  pages,
  lastAuditAt,
}: {
  propertySlug: string;
  pages: Page[];
  lastAuditAt: string | null;
}) {
  const [filter, setFilter] = useState<ActionVariant | "all">("all");

  // Counts per action variant — memoized so the histogram doesn't recompute
  // on every render.
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const variant of HISTOGRAM_ORDER) c[variant] = 0;
    for (const p of pages) c[actionOf(p)] += 1;
    return c;
  }, [pages]);

  const filtered = useMemo(() => {
    if (filter === "all") return pages;
    return pages.filter((p) => actionOf(p) === filter);
  }, [pages, filter]);

  const undecidedCount = counts.undecided ?? 0;

  return (
    <div>
      {/* Sub-header — PagesView owns the page-level h1/sub. */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <p className="text-[12px] text-muted-foreground tabular-nums">
          {pages.length.toLocaleString()} pages in triage
          {lastAuditAt && <> · last audit {fmtDate(lastAuditAt)}</>}
          {undecidedCount > 0 && <> · {undecidedCount.toLocaleString()} undecided</>}
        </p>
        <div className="flex gap-2 shrink-0">
          {/* Bulk action + Export — stubs in V1.1. */}
          <button
            type="button"
            disabled
            className="text-xs font-medium px-3 py-1.5 border rounded-md text-muted-foreground/60 cursor-not-allowed"
            title="Bulk edit — coming soon"
          >
            Bulk action
          </button>
          <button
            type="button"
            disabled
            className="text-xs font-medium px-3 py-1.5 border rounded-md text-muted-foreground/60 cursor-not-allowed"
            title="Export decisions — coming soon"
          >
            Export
          </button>
        </div>
      </div>

      {/* Histogram (click-to-filter) */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 mb-5">
        <HistoCell
          label="All"
          count={pages.length}
          selected={filter === "all"}
          onClick={() => setFilter("all")}
        />
        {HISTOGRAM_ORDER.map((variant) => (
          <HistoCell
            key={variant}
            variant={variant}
            count={counts[variant] ?? 0}
            selected={filter === variant}
            onClick={() => setFilter(filter === variant ? "all" : variant)}
            warm={variant === "undecided"}
          />
        ))}
      </div>

      {/* Table */}
      <div className="border rounded-lg bg-card overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-muted/50 text-[11px] text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium w-1/2">URL</th>
              <th className="text-left px-3 py-2.5 font-medium">Type</th>
              <th className="text-left px-3 py-2.5 font-medium">Status</th>
              <th className="text-left px-3 py-2.5 font-medium">Action</th>
              <th className="text-right px-3 py-2.5 font-medium">Words</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {filter === "all"
                    ? "No pages found for this property."
                    : `No pages with action "${actionLabel(filter)}".`}
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const action = actionOf(p);
                const subtitle = p.title || p.h1 || "(no title)";
                const isUndecided = action === "undecided";
                return (
                  <tr
                    key={p.id}
                    className={`border-t hover:bg-muted/30 ${
                      isUndecided ? "bg-amber-50/60" : ""
                    }`}
                  >
                    <td className="px-4 py-3 max-w-0">
                      <div
                        className="font-mono text-xs truncate text-foreground"
                        title={p.url}
                      >
                        {p.url}
                      </div>
                      <div
                        className={`text-xs truncate mt-0.5 ${
                          p.title || p.h1
                            ? "text-muted-foreground"
                            : "text-muted-foreground/60 italic"
                        }`}
                        title={subtitle}
                      >
                        {subtitle}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground text-xs">
                      {p.page_type ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground tabular-nums">
                      {p.status_code ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      <AuditActionChip
                        pageId={p.id}
                        initialAction={p.audit_action}
                        propertySlug={propertySlug}
                      />
                      {(action === "redirect" || action === "consolidate") && (
                        <AuditTargetInput
                          pageId={p.id}
                          initialTargetUrl={p.audit_target_url}
                          propertySlug={propertySlug}
                        />
                      )}
                      <AuditHistoryButton
                        pageUrl={p.url}
                        currentAction={p.audit_action}
                        currentTarget={p.audit_target_url}
                        history={p.history}
                      />
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted-foreground text-xs">
                      {p.word_count?.toLocaleString() ?? "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {filtered.length > 0 && (
          <div className="px-4 py-3 border-t text-[11px] text-muted-foreground tabular-nums">
            Showing {filtered.length.toLocaleString()} of{" "}
            {pages.length.toLocaleString()}
            {filter !== "all" && (
              <>
                {" · filtered to "}
                <ActionPill variant={filter} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function HistoCell({
  label,
  variant,
  count,
  selected,
  onClick,
  warm,
}: {
  label?: string;
  variant?: ActionVariant;
  count: number;
  selected: boolean;
  onClick: () => void;
  warm?: boolean;
}) {
  const baseCls =
    "border rounded-lg p-3 cursor-pointer text-left transition-colors";
  const stateCls = selected
    ? "bg-foreground text-background border-foreground"
    : warm
    ? "bg-amber-50 border-amber-200 hover:border-amber-300"
    : "bg-card hover:border-foreground/40";
  return (
    <button type="button" onClick={onClick} className={`${baseCls} ${stateCls}`}>
      <div className="mb-1">
        {variant ? (
          <ActionPill variant={variant} />
        ) : (
          <span
            className={`text-[10px] uppercase tracking-wider font-semibold ${
              selected ? "text-background/70" : "text-muted-foreground"
            }`}
          >
            {label}
          </span>
        )}
      </div>
      <div className="text-[20px] font-semibold tracking-tight tabular-nums">
        {count.toLocaleString()}
      </div>
    </button>
  );
}
