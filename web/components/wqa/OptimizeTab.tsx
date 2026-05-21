"use client";

// Per the WQA SOP Tab 11 "URL Optimization" — every URL with Action =
// Optimize, columns oriented toward the Phase 2 handoff. Grouped by tier
// (Revenue-Critical → Page 1 → Striking Distance → Has Visibility → …)
// per SOP § 7.1 priority tiers.

import { useMemo } from "react";
import {
  EmptyTab,
  TabHeader,
  TableShell,
  UrlCell,
  fmtN,
} from "@/components/wqa/helpers";
import { WqaActionChip } from "@/components/wqa/WqaActionChip";
import type { ActionTabProps, TriagedRow } from "@/components/wqa/types";

const TIER_ORDER = [
  "Revenue-Critical",
  "Page 1",
  "Striking Distance",
  "Core Page",
  "Has Visibility",
  "Has Authority",
  "Utility",
] as const;

const TIER_BAND: Record<string, string> = {
  "Revenue-Critical": "bg-emerald-100 text-emerald-800",
  "Page 1": "bg-emerald-50 text-emerald-700",
  "Striking Distance": "bg-amber-50 text-amber-800",
  "Core Page": "bg-violet-50 text-violet-700",
  "Has Visibility": "bg-slate-50 text-slate-700",
  "Has Authority": "bg-sky-50 text-sky-700",
  Utility: "bg-muted text-muted-foreground",
};

/** First-pass technical actions derived from WQA signals. The xlsx
 *  reference has analyst-written entries here; pre-populating from
 *  detectable issues saves the per-row work and surfaces what's known. */
function techActionsFor({ row: r }: TriagedRow): string[] {
  const actions: string[] = [];
  if (r.url.toLowerCase().startsWith("http://")) {
    actions.push("Migrate to HTTPS");
  }
  if (!r.h1 || (r.h1 ?? "").toLowerCase() === "none found") {
    actions.push("Add H1");
  }
  if (!r.current_title || (r.current_title ?? "").toLowerCase() === "none found") {
    actions.push("Add title");
  } else if ((r.current_title ?? "").trim().length < 25) {
    actions.push("Expand title");
  }
  if (r.canonical_link_element) {
    const c = r.canonical_link_element.toLowerCase();
    if (c.startsWith("http://")) actions.push("Fix HTTP canonical");
  }
  return actions;
}

/** Content action heuristic from word count. SOP doesn't prescribe this
 *  but the xlsx pattern shows analysts using <300 = Rewrite, 300–600 =
 *  Refresh, 600+ = Light refresh. */
function contentActionFor({ row: r }: TriagedRow): string {
  const w = r.word_count ?? 0;
  if (w < 100) return "Rewrite (thin)";
  if (w < 400) return "Refresh + expand";
  if (w < 800) return "Refresh";
  return "Light refresh";
}

export function OptimizeTab({ rows, propertySlug, onOpenDrawer }: ActionTabProps) {
  if (rows.length === 0) {
    return <EmptyTab message="No URLs are tagged Optimize yet." />;
  }

  const grouped = useMemo(() => {
    const buckets = new Map<string, TriagedRow[]>();
    for (const r of rows) {
      const tier = r.triage.tier ?? "Utility";
      const arr = buckets.get(tier) ?? [];
      arr.push(r);
      buckets.set(tier, arr);
    }
    // Sort each bucket by sessions desc (revenue-critical pages get top
    // attention even within the tier).
    for (const arr of buckets.values()) {
      arr.sort((a, b) => (b.row.sessions ?? 0) - (a.row.sessions ?? 0));
    }
    return TIER_ORDER.map((t) => ({ tier: t, items: buckets.get(t) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [rows]);

  return (
    <section>
      <TabHeader
        title="Optimize"
        subtitle={
          <>
            URLs that stay and enter the optimization pipeline. Grouped by
            priority tier per WQA SOP § 7.1. Phase 2 picks up where these
            leave off — technical fixes per row, content actions from word
            count.
          </>
        }
        count={rows.length}
      />

      <div className="space-y-5">
        {grouped.map((g) => (
          <div key={g.tier}>
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${TIER_BAND[g.tier] ?? "bg-muted"}`}
              >
                {g.tier}
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {g.items.length} URL{g.items.length === 1 ? "" : "s"}
              </span>
            </div>
            <TableShell>
              <thead className="sticky top-0 bg-muted/80 backdrop-blur text-[10px] uppercase tracking-wider text-muted-foreground z-10">
                <tr>
                  <th className="text-left px-3 py-2 font-medium min-w-[260px]">URL</th>
                  <th className="text-left px-2 py-2 font-medium">Action</th>
                  <th className="text-right px-2 py-2 font-medium">Sessions</th>
                  <th className="text-right px-2 py-2 font-medium">Conv</th>
                  <th className="text-left px-2 py-2 font-medium min-w-[200px]">Best keyword (rank)</th>
                  <th className="text-right px-2 py-2 font-medium">Words</th>
                  <th className="text-right px-2 py-2 font-medium">Inl</th>
                  <th className="text-left px-2 py-2 font-medium min-w-[220px]">Technical actions</th>
                  <th className="text-left px-2 py-2 font-medium">Content</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((r) => {
                  const tech = techActionsFor(r);
                  const kw = r.row.best_tv_keyword || r.row.best_sv_keyword;
                  const rank = r.row.best_tv_kw_rank ?? r.row.best_sv_kw_rank;
                  return (
                    <tr
                      key={r.row.url}
                      className={`border-t hover:bg-muted/40 ${onOpenDrawer ? "cursor-pointer" : ""}`}
                      onClick={() => onOpenDrawer?.(r.row.url)}
                    >
                      <td className="px-3 py-1.5 max-w-0">
                        <UrlCell url={r.row.url} title={r.row.current_title} />
                      </td>
                      <td
                        className="px-2 py-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <WqaActionChip
                          propertySlug={propertySlug}
                          url={r.row.url}
                          sopAction={r.triage.sopAction ?? r.triage.action}
                          initialAction={r.triage.action}
                          isOverridden={!!r.triage.isOverridden}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtN(r.row.sessions)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtN(r.row.conversions)}</td>
                      <td className="px-2 py-1.5 text-[11px] truncate max-w-0">
                        {kw ? (
                          <>
                            <span className="truncate" title={kw}>{kw}</span>
                            {rank != null && (
                              <span className="text-muted-foreground"> · #{rank}</span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtN(r.row.word_count)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{fmtN(r.row.inlinks)}</td>
                      <td className="px-2 py-1.5">
                        {tech.length === 0 ? (
                          <span className="text-emerald-700 text-[10.5px]">✓ clean</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {tech.map((a) => (
                              <span
                                key={a}
                                className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200"
                              >
                                {a}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-[11px] text-muted-foreground">
                        {contentActionFor(r)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableShell>
          </div>
        ))}
      </div>
    </section>
  );
}
