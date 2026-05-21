"use client";

// Page Speed — BLOCKED placeholder. Ports the workbook's `write_page_speed`
// tab (build_phase2_technical.py ~line 781): the audit can't surface real
// CWV / LCP / CLS metrics without a Screaming Frog PageSpeed integration
// export. We still render the full URL list so the practitioner can see
// the scope and the dependency callout.
//
// When the SF integration ships, this view becomes the live one — same
// shape, just with real values in place of "Blocked".

import { useMemo } from "react";
import {
  TabHeader,
  TableShell,
  ThinHeaderRow,
  UrlCell,
  EmptyTab,
  TD,
} from "@/components/wqa/helpers";
import type { WqaRow } from "@/lib/wqa";
import { triageRow, type TriageAction } from "@/lib/wqa-triage";

type PriorityTier = { sortKey: number; label: string };

const OTHER_TIER: PriorityTier = { sortKey: 6, label: "6. Other" };

function priorityTierFor(
  action: TriageAction,
  tier: string | undefined,
): PriorityTier {
  if (action === "Optimize") {
    switch (tier) {
      case "Revenue-Critical":
        return { sortKey: 1, label: "1. Revenue-Critical" };
      case "Page 1":
        return { sortKey: 2, label: "2. Page 1 Protect" };
      case "Striking Distance":
        return { sortKey: 3, label: "3. Striking Distance" };
      case "Has Visibility":
        return { sortKey: 4, label: "4. Has Visibility" };
      case "Core Page":
      case "Has Authority":
      case "Utility":
        return { sortKey: 5, label: "5. Utility" };
      default:
        return OTHER_TIER;
    }
  }
  if (action === "Restore") {
    return { sortKey: 1, label: "1. Restore (high value)" };
  }
  return OTHER_TIER;
}

const TIER_BAND: Record<string, string> = {
  "1. Revenue-Critical": "bg-emerald-100 text-emerald-800",
  "1. Restore (high value)": "bg-violet-100 text-violet-800",
  "2. Page 1 Protect": "bg-emerald-50 text-emerald-700",
  "3. Striking Distance": "bg-amber-50 text-amber-800",
  "4. Has Visibility": "bg-slate-50 text-slate-700",
  "5. Utility": "bg-muted text-muted-foreground",
  "6. Other": "bg-muted text-muted-foreground/70",
};

type RowVm = {
  row: WqaRow;
  tier: PriorityTier;
  category: string;
};

export function AuditPageSpeedTab({
  rows,
  onOpenDrawer,
}: {
  rows: WqaRow[];
  onOpenDrawer: (url: string) => void;
}) {
  const vms: RowVm[] = useMemo(() => {
    const out: RowVm[] = rows.map((r) => {
      const sop = triageRow(r);
      return {
        row: r,
        tier: priorityTierFor(sop.action, sop.tier),
        category: r.type ?? "Other",
      };
    });
    out.sort((a, b) => {
      const t = a.tier.sortKey - b.tier.sortKey;
      if (t !== 0) return t;
      return (b.row.sessions ?? 0) - (a.row.sessions ?? 0);
    });
    return out;
  }, [rows]);

  return (
    <div>
      <TabHeader
        title="Page Speed"
        count={vms.length}
        subtitle={
          <>
            Requires Screaming Frog PageSpeed integration export
            (pagespeed_all.csv + opportunities). Run SF with PageSpeed
            enabled, export to{" "}
            <code className="font-mono text-[10.5px]">
              delivery/tna/&#123;site&#125;/phase-2-technical-seo/raw/
            </code>
            , then re-run the pipeline.
          </>
        }
      />

      <div className="mb-4 inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-700">
        <span className="inline-block h-2 w-2 rounded-full bg-slate-500" />
        BLOCKED — requires SF PageSpeed export
      </div>

      {vms.length === 0 ? (
        <EmptyTab message="No scope URLs to evaluate." />
      ) : (
        <TableShell>
          <ThinHeaderRow
            cells={[
              { label: "URL" },
              { label: "Priority Tier" },
              { label: "Category" },
              { label: "Performance Score" },
              { label: "LCP" },
              { label: "CLS" },
              { label: "TBT" },
              { label: "Action Items" },
            ]}
          />
          <tbody>
            {vms.map((v) => (
              <tr
                key={v.row.url}
                onClick={() => onOpenDrawer(v.row.url)}
                className="border-t hover:bg-muted/40 cursor-pointer align-top"
              >
                <td className={`${TD} max-w-0`}>
                  <UrlCell url={v.row.url} title={v.row.current_title} />
                </td>
                <td className={TD}>
                  <span
                    className={`text-[10.5px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded whitespace-nowrap ${TIER_BAND[v.tier.label] ?? "bg-muted text-muted-foreground"}`}
                  >
                    {v.tier.label}
                  </span>
                </td>
                <td className={`${TD} text-[11px] text-muted-foreground whitespace-nowrap`}>
                  {v.category}
                </td>
                <td className={TD}>
                  <BlockedPill />
                </td>
                <td className={TD}>
                  <BlockedPill />
                </td>
                <td className={TD}>
                  <BlockedPill />
                </td>
                <td className={TD}>
                  <BlockedPill />
                </td>
                <td className={`${TD} text-[11px] text-muted-foreground`}>
                  Pull SF PageSpeed report
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}

function BlockedPill() {
  return (
    <span className="text-[10.5px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
      Blocked
    </span>
  );
}
