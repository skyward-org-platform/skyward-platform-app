"use client";

// Investigate + Evaluate tabs — the human-review queues. SOP § 5.1
// defines Evaluate as "has internal links but no external signals" and
// Investigate as "data conflict (e.g., marked primary but redirecting)".
// Both surfaces are where humans most often need the action-chip override.

import { EmptyTab, TabHeader, TableShell, UrlCell, fmtN } from "@/components/wqa/helpers";
import { WqaActionChip } from "@/components/wqa/WqaActionChip";
import type { ActionTabProps } from "@/components/wqa/types";

export function InvestigateTab(props: ActionTabProps) {
  if (props.rows.length === 0) {
    return <EmptyTab message="No URLs need investigation. Data conflicts (primary URL redirecting, unexpected status codes) would land here." />;
  }
  return (
    <ReviewTable
      {...props}
      title="Investigate"
      subtitle={
        <>
          Data conflicts that need human judgment. Most common pattern:
          primary URL responding 301/302. Resolve the underlying confusion
          (which version IS primary?), then re-triage via the chip.
        </>
      }
      whyLabel="Conflict"
    />
  );
}

export function EvaluateTab(props: ActionTabProps) {
  if (props.rows.length === 0) {
    return <EmptyTab message="No URLs need evaluation. Pages with internal links but no external signals would land here." />;
  }
  return (
    <ReviewTable
      {...props}
      title="Evaluate"
      subtitle={
        <>
          Pages with internal links but no traffic, impressions, refs, or
          rank. Decide: promote (Optimize), redirect, or remove via the
          chip. Sort by inlinks — high internal-link counts often signal a
          page worth keeping.
        </>
      }
      whyLabel="Why flagged"
    />
  );
}

function ReviewTable({
  title,
  subtitle,
  rows,
  whyLabel,
  propertySlug,
  onOpenDrawer,
}: {
  title: string;
  subtitle: React.ReactNode;
  rows: ActionTabProps["rows"];
  whyLabel: string;
  propertySlug: string;
  onOpenDrawer?: (url: string) => void;
}) {
  return (
    <section>
      <TabHeader title={title} subtitle={subtitle} count={rows.length} />
      <TableShell>
        <thead className="sticky top-0 bg-muted/80 backdrop-blur text-[10px] uppercase tracking-wider text-muted-foreground z-10">
          <tr>
            <th className="text-left px-3 py-2 font-medium min-w-[260px]">URL</th>
            <th className="text-left px-2 py-2 font-medium">Action</th>
            <th className="text-right px-2 py-2 font-medium">Status</th>
            <th className="text-right px-2 py-2 font-medium">Sessions</th>
            <th className="text-right px-2 py-2 font-medium">Impr</th>
            <th className="text-right px-2 py-2 font-medium">Inlinks</th>
            <th className="text-right px-2 py-2 font-medium">Words</th>
            <th className="text-left px-2 py-2 font-medium min-w-[280px]">{whyLabel}</th>
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
              <td className="px-2 py-1.5 text-right tabular-nums">{fmtN(r.row.sessions)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                {fmtN(r.row.average_impressions)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{fmtN(r.row.inlinks)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                {fmtN(r.row.word_count)}
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
