"use client";

// Website Architecture — per-URL depth + inlinks + sitemap audit. Ports
// build_phase2_technical.py `write_architecture` (~line 800). For each
// scope URL we surface the depth, inlinks count, orphan/sitemap flags,
// and a built-up Action Items string that mirrors the T4/T5/T6/T12
// recommendations the workbook spits out.
//
// The category-median inlinks comes from `ctx.medianInlinksByCategory`
// — built once by AuditModeShell so we don't recompute per render.

import { useMemo, useState, useTransition } from "react";
import {
  TabHeader,
  TableShell,
  ThinHeaderRow,
  UrlCell,
  EmptyTab,
  TD,
} from "@/components/wqa/helpers";
import type { Ctx } from "@/lib/wqa-checks";
import {
  EXECUTION_STATUSES,
  type ExecutionStatus,
  type PageExecutionRow,
} from "@/lib/page-execution";
import type { WqaRow } from "@/lib/wqa";
import type { DecisionRow } from "@/lib/wqa-decisions";
import type { TriageAction } from "@/lib/wqa-triage";
import { triageRow } from "@/lib/wqa-triage";
import { setExecutionStatus } from "@/app/properties/[slug]/pages/wqa-actions";

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

function truthy(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === "string")
    return ["true", "yes", "1"].includes(v.toLowerCase());
  return false;
}

type RowVm = {
  row: WqaRow;
  tier: PriorityTier;
  category: string;
  depth: number;
  inlinks: number;
  orphan: boolean;
  inSitemap: boolean;
  actionItems: string;
  initialStatus: ExecutionStatus;
};

export function AuditArchitectureTab({
  rows,
  decisions,
  executions,
  ctx,
  propertySlug,
  onOpenDrawer,
}: {
  rows: WqaRow[];
  decisions: DecisionRow[];
  executions: PageExecutionRow[];
  ctx: Ctx;
  propertySlug: string;
  onOpenDrawer: (url: string) => void;
}) {
  const decisionByUrl = useMemo(() => {
    const m = new Map<string, DecisionRow>();
    for (const d of decisions) m.set(d.url, d);
    return m;
  }, [decisions]);

  const execByUrl = useMemo(() => {
    const m = new Map<string, PageExecutionRow>();
    for (const e of executions) m.set(e.url, e);
    return m;
  }, [executions]);

  const vms: RowVm[] = useMemo(() => {
    const out: RowVm[] = [];
    for (const r of rows) {
      const sop = triageRow(r);
      const override = decisionByUrl.get(r.url);
      const effectiveAction = (override?.action ?? sop.action) as TriageAction;
      const tier = priorityTierFor(effectiveAction, sop.tier);

      const category = r.type ?? "Other";
      const depth = Math.trunc(r.page_depth ?? 0);
      const inlinks = Math.trunc(r.inlinks ?? 0);
      const orphan = inlinks === 0;
      const inSitemap = truthy(r.in_sitemap);

      const actions: string[] = [];
      if (depth >= 4) {
        actions.push(`T6: Reduce depth from ${depth} to <=3`);
      }
      const med = ctx.medianInlinksByCategory.get(category) ?? 0;
      if (orphan) {
        actions.push("T4/S8: Add internal links (orphan)");
      } else if (med > 0 && inlinks < med * 0.5) {
        actions.push(
          `T5: Inlinks=${inlinks} < 50% of ${category} median (${med.toFixed(1)}); add links`,
        );
      }
      if (!inSitemap) {
        actions.push("T12: Add to sitemap.xml");
      }
      const actionItems = actions.length ? actions.join("; ") : "OK";

      const exec = execByUrl.get(r.url);
      const initialStatus: ExecutionStatus = exec?.status ?? "To Do";

      out.push({
        row: r,
        tier,
        category,
        depth,
        inlinks,
        orphan,
        inSitemap,
        actionItems,
        initialStatus,
      });
    }
    out.sort((a, b) => {
      const t = a.tier.sortKey - b.tier.sortKey;
      if (t !== 0) return t;
      return (b.row.sessions ?? 0) - (a.row.sessions ?? 0);
    });
    return out;
  }, [rows, decisionByUrl, execByUrl, ctx]);

  return (
    <div>
      <TabHeader
        title="Website Architecture"
        count={vms.length}
        subtitle={
          <>
            Per-URL depth, inlinks, orphan + sitemap. Action items derived
            from T4 / T5 / T6 / T12 predicates against the category-median
            inlinks baseline.
          </>
        }
      />

      {vms.length === 0 ? (
        <EmptyTab message="No scope URLs to evaluate." />
      ) : (
        <TableShell>
          <ThinHeaderRow
            cells={[
              { label: "URL" },
              { label: "Priority Tier" },
              { label: "Category" },
              { label: "Depth", right: true },
              { label: "Inlinks", right: true },
              { label: "Orphan?" },
              { label: "In Sitemap?" },
              { label: "Action Items" },
              { label: "Status" },
            ]}
          />
          <tbody>
            {vms.map((v) => (
              <ArchitectureRow
                key={v.row.url}
                vm={v}
                propertySlug={propertySlug}
                onOpenDrawer={onOpenDrawer}
              />
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}

function ArchitectureRow({
  vm,
  propertySlug,
  onOpenDrawer,
}: {
  vm: RowVm;
  propertySlug: string;
  onOpenDrawer: (url: string) => void;
}) {
  const [status, setStatus] = useState<ExecutionStatus>(vm.initialStatus);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleStatus(next: ExecutionStatus) {
    const prev = status;
    setStatus(next);
    setError(null);
    startTransition(async () => {
      const res = await setExecutionStatus(propertySlug, vm.row.url, next);
      if (!res.ok) {
        setStatus(prev);
        setError(res.error);
      }
    });
  }

  return (
    <tr
      onClick={() => onOpenDrawer(vm.row.url)}
      className="border-t hover:bg-muted/40 cursor-pointer align-top"
    >
      <td className={`${TD} max-w-0`}>
        <UrlCell url={vm.row.url} title={vm.row.current_title} />
      </td>
      <td className={TD}>
        <span
          className={`text-[10.5px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded whitespace-nowrap ${TIER_BAND[vm.tier.label] ?? "bg-muted text-muted-foreground"}`}
        >
          {vm.tier.label}
        </span>
      </td>
      <td className={`${TD} text-[11px] text-muted-foreground whitespace-nowrap`}>
        {vm.category}
      </td>
      <td className={`${TD} text-right tabular-nums text-[11px]`}>{vm.depth}</td>
      <td className={`${TD} text-right tabular-nums text-[11px]`}>
        {vm.inlinks.toLocaleString()}
      </td>
      <td className={`${TD} text-[11px]`}>
        {vm.orphan ? (
          <span className="text-rose-700 font-medium">Yes</span>
        ) : (
          <span className="text-muted-foreground">No</span>
        )}
      </td>
      <td className={`${TD} text-[11px]`}>
        {vm.inSitemap ? (
          <span className="text-muted-foreground">Yes</span>
        ) : (
          <span className="text-amber-700 font-medium">No</span>
        )}
      </td>
      <td className={`${TD} text-[11px] text-muted-foreground max-w-[420px]`}>
        {vm.actionItems === "OK" ? (
          <span className="text-emerald-700 font-medium">OK</span>
        ) : (
          vm.actionItems
        )}
      </td>
      <td className={TD} onClick={(e) => e.stopPropagation()}>
        <select
          value={status}
          disabled={pending}
          onChange={(e) => handleStatus(e.target.value as ExecutionStatus)}
          className="text-[11px] border rounded px-1.5 py-0.5 bg-card"
        >
          {EXECUTION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {error && (
          <div className="text-[10px] text-rose-600 mt-1 max-w-[120px]">
            {error}
          </div>
        )}
      </td>
    </tr>
  );
}
