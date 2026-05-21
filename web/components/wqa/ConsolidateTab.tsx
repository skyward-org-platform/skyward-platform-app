"use client";

// Per the WQA SOP Tab 7 "Canonicalization Map" — every URL with Action =
// Consolidate. Each row represents a template page being merged into a
// canonical parent (the "keeper"). Canonical Keeper is editable per row
// and persists to page_execution.target_url.

import { useState, useTransition } from "react";
import { EmptyTab, TabHeader, TableShell, UrlCell, fmtN } from "@/components/wqa/helpers";
import { WqaActionChip } from "@/components/wqa/WqaActionChip";
import type { ActionTabProps } from "@/components/wqa/types";
import { setExecutionField } from "@/app/properties/[slug]/pages/wqa-actions";

export function ConsolidateTab({ rows, propertySlug, onOpenDrawer, execByUrl }: ActionTabProps) {
  if (rows.length === 0) {
    return <EmptyTab message="No URLs are tagged Consolidate." />;
  }

  return (
    <section>
      <TabHeader
        title="Consolidate"
        subtitle={
          <>
            Canonicalization map per SOP § 7.1 Tab 7. Each row is a duplicate
            page being merged into its canonical parent (the keeper). Edit the
            Canonical Keeper inline to assign a destination.
          </>
        }
        count={rows.length}
      />

      <TableShell>
        <thead className="sticky top-0 bg-muted/80 backdrop-blur text-[10px] uppercase tracking-wider text-muted-foreground z-10">
          <tr>
            <th className="text-left px-3 py-2 font-medium min-w-[260px]">Absorbed Duplicate</th>
            <th className="text-left px-2 py-2 font-medium">Action</th>
            <th className="text-left px-2 py-2 font-medium min-w-[280px]">Canonical Keeper</th>
            <th className="text-left px-2 py-2 font-medium">Category</th>
            <th className="text-right px-2 py-2 font-medium">Sessions</th>
            <th className="text-right px-2 py-2 font-medium">Inlinks</th>
            <th className="text-left px-2 py-2 font-medium min-w-[260px]">Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.row.url}
              className={`border-t hover:bg-muted/40 ${onOpenDrawer ? "cursor-pointer" : ""}`}
              onClick={() => onOpenDrawer?.(r.row.url)}
            >
              <td className="px-3 py-1.5 max-w-0">
                <UrlCell url={r.row.url} title={r.row.current_title} />
              </td>
              <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                <WqaActionChip
                  propertySlug={propertySlug}
                  url={r.row.url}
                  sopAction={r.triage.sopAction ?? r.triage.action}
                  initialAction={r.triage.action}
                  isOverridden={!!r.triage.isOverridden}
                />
              </td>
              <td className="px-2 py-1.5">
                <KeeperInput
                  propertySlug={propertySlug}
                  url={r.row.url}
                  defaultValue={execByUrl?.get(r.row.url)?.target_url ?? ""}
                />
              </td>
              <td className="px-2 py-1.5 text-[11px] text-muted-foreground">
                {r.row.type ?? "—"}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {fmtN(r.row.sessions)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {fmtN(r.row.inlinks)}
              </td>
              <td className="px-2 py-1.5 text-[11px] text-muted-foreground italic">
                {r.triage.logic}
              </td>
            </tr>
          ))}
        </tbody>
      </TableShell>
    </section>
  );
}

function KeeperInput({
  propertySlug,
  url,
  defaultValue,
}: {
  propertySlug: string;
  url: string;
  defaultValue: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div
      className="inline-flex items-center gap-1 w-full"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="url"
        defaultValue={defaultValue}
        placeholder="https://…"
        className={`font-mono text-[11px] w-[280px] px-2 py-1 rounded border border-input bg-background ${pending ? "opacity-60" : ""}`}
        onBlur={(e) => {
          const next = e.currentTarget.value.trim() || null;
          if ((next ?? "") === (defaultValue ?? "")) return;
          setError(null);
          startTransition(async () => {
            const res = await setExecutionField(
              propertySlug,
              url,
              "target_url",
              next,
            );
            if (!res.ok) setError(res.error);
          });
        }}
      />
      {error && (
        <span className="text-[10px] text-rose-700" title={error}>
          !
        </span>
      )}
    </div>
  );
}
