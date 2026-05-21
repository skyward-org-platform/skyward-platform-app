"use client";

// Per WQA SOP Tab 12 "Restore URLs" — pages that 404 but should exist.
// Each row needs the spec for rebuilding: target keyword + SV + H1 +
// Title Tag + Meta Description + Schema Types. We pre-populate what we
// can from WQA data; the spec scaffolding (Title/Meta/Schema) is the
// follow-up enrichment pass.

import { EmptyTab, TabHeader, TableShell, UrlCell, fmtN } from "@/components/wqa/helpers";
import { WqaActionChip } from "@/components/wqa/WqaActionChip";
import type { ActionTabProps } from "@/components/wqa/types";

export function RestoreTab({ rows, propertySlug, onOpenDrawer }: ActionTabProps) {
  if (rows.length === 0) {
    return (
      <EmptyTab message="No URLs are tagged Restore. Pages 404 with rank ≤ 20 or sessions > 20 would land here." />
    );
  }

  return (
    <section>
      <TabHeader
        title="Restore"
        subtitle={
          <>
            Broken (404) pages that should be recreated. Per SOP § 5.2 rule 5
            — rank ≤ 20 or sessions &gt; 20 triggers a Restore. Each row is
            the spec brief: target keyword, SV, and the page-rebuild fields
            from the industry template.
          </>
        }
        count={rows.length}
      />

      <TableShell>
        <thead className="sticky top-0 bg-muted/80 backdrop-blur text-[10px] uppercase tracking-wider text-muted-foreground z-10">
          <tr>
            <th className="text-left px-3 py-2 font-medium min-w-[260px]">URL</th>
            <th className="text-left px-2 py-2 font-medium">Action</th>
            <th className="text-right px-2 py-2 font-medium">Status</th>
            <th className="text-left px-2 py-2 font-medium min-w-[180px]">Target keyword</th>
            <th className="text-right px-2 py-2 font-medium">SV</th>
            <th className="text-right px-2 py-2 font-medium">Rank</th>
            <th className="text-right px-2 py-2 font-medium">Sessions</th>
            <th className="text-right px-2 py-2 font-medium">Refs</th>
            <th className="text-left px-2 py-2 font-medium min-w-[260px]">Why restore (triage logic)</th>
            <th className="text-left px-2 py-2 font-medium">Spec</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const kw = r.row.best_tv_keyword || r.row.best_sv_keyword;
            const sv = r.row.best_tv_kw_sv ?? r.row.best_sv_kw_sv;
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
                <td className="px-2 py-1.5 text-right tabular-nums text-rose-700">
                  {r.row.status_code ?? "—"}
                </td>
                <td className="px-2 py-1.5 text-[11px]">
                  {kw ? <span title={kw}>{kw}</span> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtN(sv)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtN(rank)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtN(r.row.sessions)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtN(r.row.referring_domains)}</td>
                <td className="px-2 py-1.5 text-[11px] text-muted-foreground italic">
                  {r.triage.logic}
                </td>
                <td className="px-2 py-1.5">
                  <span className="text-[10px] text-muted-foreground italic">
                    (next pass)
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableShell>
    </section>
  );
}
