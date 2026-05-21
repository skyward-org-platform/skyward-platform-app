"use client";

// Broken Links — BLOCKED placeholder. Ports `write_broken_list` from
// build_phase2_technical.py (~line 845). The audit needs the SF inlinks
// export joined to the SF 4xx response codes export; until that pipeline
// step lands, this view is empty with an explanation row.
//
// Once unblocked, the columns stay: Source URL · Source Type · Broken
// Target · Status Code · Repair Method · Acceptance Criteria.

import {
  TabHeader,
  TableShell,
  ThinHeaderRow,
  TD,
} from "@/components/wqa/helpers";
import type { WqaRow } from "@/lib/wqa";

export function AuditBrokenTab({
  rows,
  onOpenDrawer,
}: {
  rows: WqaRow[];
  onOpenDrawer: (url: string) => void;
}) {
  // Props kept for prop-parity / future wiring; not used yet.
  void rows;
  void onOpenDrawer;

  return (
    <div>
      <TabHeader
        title="Broken Links"
        count={0}
        subtitle={
          <>
            Broken-link audit requires Screaming Frog inlinks export joined
            to the broken-target set
            (response_codes_client_error_(4xx).csv + inlinks). Currently{" "}
            <span className="font-medium text-foreground">BLOCKED</span>.
          </>
        }
      />

      <div className="mb-4 inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-700">
        <span className="inline-block h-2 w-2 rounded-full bg-slate-500" />
        BLOCKED — requires SF inlinks + 4xx export
      </div>

      <TableShell>
        <ThinHeaderRow
          cells={[
            { label: "Source URL" },
            { label: "Source Type" },
            { label: "Broken Target" },
            { label: "Status Code" },
            { label: "Repair Method" },
            { label: "Acceptance Criteria" },
          ]}
        />
        <tbody>
          <tr className="border-t">
            <td
              className={`${TD} text-[11px] text-muted-foreground italic`}
              colSpan={6}
            >
              (BLOCKED — pull SF reports listed above)
            </td>
          </tr>
        </tbody>
      </TableShell>
    </div>
  );
}
