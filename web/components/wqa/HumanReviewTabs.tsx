"use client";

// Investigate — the single human-review queue (P2 action semantics v2).
// Consolidates the old Evaluate + Investigate sub-tabs into one. Every
// row whose displayed Action7 is "Investigate" lands here: data conflicts
// (primary URL redirecting, unexpected status codes), pages with internal
// links but no external signals, and pipeline-flagged human-judgment cases.
//
// Secondary axis is logic_code — rendered as a click-to-filter counter
// strip at the top. The legacy Evaluate sub-tab is gone; the file is
// preserved (renamed semantically) so WqaTabs only registers a single
// human-review entry.

import { useMemo, useState } from "react";
import { EmptyTab, TabHeader, TableShell, UrlCell, fmtN } from "@/components/wqa/helpers";
import { WqaActionChip } from "@/components/wqa/WqaActionChip";
import { WqaLogicCell } from "@/components/wqa/WqaLogicCell";
import {
  LOGIC_CODE_LABELS,
  toAction7,
  type LogicCode,
} from "@/lib/wqa-decisions";
import type { ActionTabProps, TriagedRow } from "@/components/wqa/types";

export function InvestigateTab(props: ActionTabProps) {
  if (props.rows.length === 0) {
    return (
      <EmptyTab message="No URLs need investigation. Data conflicts (primary URL redirecting, unexpected status codes), pages with internal links but no external signals, and other human-judgment cases would land here." />
    );
  }
  return <InvestigateBody {...props} />;
}

// Legacy alias — kept exported so any stale import in WqaTabs / audit
// surfaces continues to compile during the migration window. Routes to
// the same InvestigateTab body; both Evaluate-class and Investigate-class
// rows collapse to displayedAction === "Investigate" via toAction7().
export const EvaluateTab = InvestigateTab;

function InvestigateBody({
  rows,
  propertySlug,
  onOpenDrawer,
}: ActionTabProps) {
  // Group by logic_code as the secondary axis. The chip is supplied by
  // BQ wqa_output once Chunk 5 lands; until then logic_code is null for
  // every row and we fall back to the legacy SOP-derived `triage.logic`
  // free-text bucketing so the counter strip still surfaces something
  // useful. Synthetic codes are prefixed `legacy:` so the migration is
  // visible.
  const buckets = useMemo(() => {
    const m = new Map<string, TriagedRow[]>();
    for (const r of rows) {
      // (r as unknown) bridge: TriagedRow doesn't carry logic_code yet
      // (added in Chunk 5). Read defensively so this works the day the
      // BQ field shows up.
      const code =
        ((r as unknown) as { logicCode?: LogicCode | null }).logicCode ??
        deriveBucket(r);
      const list = m.get(code) ?? [];
      list.push(r);
      m.set(code, list);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [rows]);

  const [activeBucket, setActiveBucket] = useState<string | null>(null);

  const visible = useMemo(() => {
    if (!activeBucket) return rows;
    return (
      buckets.find((b) => b[0] === activeBucket)?.[1] ?? rows
    );
  }, [activeBucket, buckets, rows]);

  return (
    <section>
      <TabHeader
        title="Investigate"
        subtitle={
          <>
            All URLs that need human judgment before they can move out of
            triage — data conflicts, internal-link-only pages with no
            external signals, and other human-judgment cases. Resolve the
            underlying ambiguity, then re-triage via the action chip.
          </>
        }
        count={rows.length}
      />

      {/* Logic-code counter strip — secondary axis */}
      {buckets.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveBucket(null)}
            className={
              "inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-2 py-1 rounded border transition-colors " +
              (activeBucket === null
                ? "bg-foreground text-background border-foreground"
                : "bg-muted/30 text-foreground border-muted hover:border-foreground/30")
            }
          >
            All
            <span className="tabular-nums opacity-80 font-normal normal-case tracking-normal">
              {rows.length.toLocaleString()}
            </span>
          </button>
          {buckets.map(([code, list]) => {
            const active = activeBucket === code;
            const label =
              LOGIC_CODE_LABELS[code as LogicCode] ?? code.replace(/^legacy:/, "");
            return (
              <button
                key={code}
                type="button"
                title={label}
                onClick={() =>
                  setActiveBucket((curr) => (curr === code ? null : code))
                }
                className={
                  "inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded border transition-colors " +
                  (active
                    ? "bg-foreground text-background border-foreground"
                    : "bg-card text-foreground border-muted hover:border-foreground/30")
                }
              >
                <span>{code}</span>
                <span className="tabular-nums opacity-80 font-normal">
                  {list.length.toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <TableShell>
        <thead className="sticky top-0 bg-muted/80 backdrop-blur text-[10px] uppercase tracking-wider text-muted-foreground z-10">
          <tr>
            <th className="text-left px-3 py-2 font-medium min-w-[260px]">URL</th>
            <th className="text-left px-2 py-2 font-medium">Action</th>
            <th className="text-left px-2 py-2 font-medium min-w-[160px]">Logic</th>
            <th className="text-right px-2 py-2 font-medium">HTTP</th>
            <th className="text-right px-2 py-2 font-medium">Sessions</th>
            <th className="text-right px-2 py-2 font-medium">Impr</th>
            <th className="text-right px-2 py-2 font-medium">Inlinks</th>
            <th className="text-right px-2 py-2 font-medium">Words</th>
            <th className="text-left px-2 py-2 font-medium min-w-[280px]">Triage logic</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => {
            const logicCode =
              ((r as unknown) as { logicCode?: LogicCode | null }).logicCode ??
              null;
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
                    pipelineAction={toAction7(
                      r.triage.sopAction ?? r.triage.action,
                    )}
                    overrideAction={
                      r.triage.isOverridden
                        ? toAction7(r.triage.action)
                        : null
                    }
                  />
                </td>
                <td className="px-2 py-1.5">
                  <WqaLogicCell code={logicCode} />
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
            );
          })}
        </tbody>
      </TableShell>
    </section>
  );
}

/** Until Chunk 5 emits logic_code into BQ wqa_output, we synthesize a
 *  bucket from the SOP-derived legacy triage action so the secondary
 *  counter strip still has useful axes. Pre-Chunk-5 rows in the
 *  Investigate tab are either legacy Evaluate (internal-links-only) or
 *  legacy Investigate (data conflict). Mapping into one of the three
 *  closed-set Investigate logic codes keeps the strip stable across the
 *  migration. */
function deriveBucket(r: TriagedRow): string {
  const action = r.triage.sopAction ?? r.triage.action;
  if (action === "Evaluate") {
    return "legacy:internal_links_no_external_signals";
  }
  if (action === "Investigate") {
    if (r.triage.logic.toLowerCase().includes("redirecting")) {
      return "legacy:data_conflict";
    }
    return "legacy:human_judgment";
  }
  return "legacy:human_judgment";
}
