"use client";

// Per WQA SOP Tab 9 "Removal List" — URLs with no value signals. Each
// gets noindex or delete. Includes a Pending column for the "Review"
// edge cases (client confirmation needed).

import { EmptyTab, TabHeader, TableShell, UrlCell, fmtN } from "@/components/wqa/helpers";
import { WqaActionChip } from "@/components/wqa/WqaActionChip";
import type { ActionTabProps } from "@/components/wqa/types";

export function RemoveTab({ rows, propertySlug, onOpenDrawer }: ActionTabProps) {
  if (rows.length === 0) {
    return (
      <EmptyTab message="No URLs are tagged Remove. Live pages with zero traffic, impressions, refs, and rank would land here." />
    );
  }

  return (
    <section>
      <TabHeader
        title="Remove"
        subtitle={
          <>
            URLs that should be noindexed or deleted. No traffic, no impressions,
            no refs, no rank — nothing of value to preserve. Confirm with client
            before deleting if the page describes a real service that&rsquo;s
            ambiguously absent from the rest of the site.
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
            <th className="text-right px-2 py-2 font-medium">Words</th>
            <th className="text-right px-2 py-2 font-medium">Inlinks</th>
            <th className="text-left px-2 py-2 font-medium min-w-[260px]">Reason</th>
            <th className="text-left px-2 py-2 font-medium">Recommended</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const recommended =
              (r.row.word_count ?? 0) > 0
                ? "Noindex (keep URL for now)"
                : "Delete URL";
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
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {r.row.status_code ?? "—"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {fmtN(r.row.word_count)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {fmtN(r.row.inlinks)}
                </td>
                <td className="px-2 py-1.5 text-[11px] text-muted-foreground italic">
                  {r.triage.logic}
                </td>
                <td className="px-2 py-1.5 text-[11px]">{recommended}</td>
              </tr>
            );
          })}
        </tbody>
      </TableShell>
    </section>
  );
}
