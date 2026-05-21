"use client";

// URL Priority — combined Phase 2 view from the workbook
// (build_phase2_technical.py `write_url_priority`). One row per scope URL
// (Optimize+Restore) that has at least one failing T/C check, with every
// failing action consolidated into a single Action Items string + an
// aggregated KW Dependency.
//
// Practitioner workflow: this is the "give me the list of pages to work
// on, ranked" tab. Status is editable inline (writes to page_execution
// via setExecutionStatus). Status select stopPropagation so editing
// doesn't open the drawer.

import { useMemo, useState, useTransition } from "react";
import {
  TabHeader,
  TableShell,
  ThinHeaderRow,
  UrlCell,
  EmptyTab,
  TD,
} from "@/components/wqa/helpers";
import {
  evaluateChecks,
  type Ctx,
  type CheckResult,
} from "@/lib/wqa-checks";
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

// Priority tier label + sort key. Derived from the EFFECTIVE triage
// action + tier. Matches the Python workbook's ranking convention.
type PriorityTier = {
  sortKey: number;
  label: string;
};

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

const DEP_PILL: Record<string, string> = {
  "Fix Now": "bg-emerald-50 text-emerald-700",
  "Fix Now, Revisit": "bg-amber-50 text-amber-800",
  "Phase 3 Dependent": "bg-orange-50 text-orange-700",
};

function aggregateKwDep(deps: string[]): string {
  if (deps.includes("Phase 3 Dependent")) return "Phase 3 Dependent";
  if (deps.includes("Fix Now, Revisit")) return "Fix Now, Revisit";
  return "Fix Now";
}

type RowVm = {
  row: WqaRow;
  tier: PriorityTier;
  category: string;
  bestKw: string;
  bestKwSv: number | null;
  bestKwRank: number | null;
  sessions: number | null;
  actionItems: string;
  kwDep: string;
  initialStatus: ExecutionStatus;
};

export function AuditUrlPriorityTab({
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
  // Decision overlay so the EFFECTIVE action drives tier derivation.
  // Same pattern as AuditModeShell — but we need the {action, tier} pair
  // here so we recompute the SOP tier rather than relying on the override
  // (which only carries the action string).
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
      // Effective action used for the tier; if override flips it to
      // something outside Optimize/Restore the URL is no longer in scope
      // (AuditModeShell already filtered) — keep the OTHER bucket as a
      // safety net.
      const effectiveAction = (override?.action ?? sop.action) as TriageAction;
      const tier = priorityTierFor(effectiveAction, sop.tier);

      const category = r.type ?? "Other";
      const results: CheckResult[] = evaluateChecks(r, category, ctx);
      if (results.length === 0) continue; // no Phase 2 work → skip

      const actionItems = results
        .map((res) => `${res.id}: ${res.action}`)
        .join("; ");
      const kwDep = aggregateKwDep(results.map((res) => res.kwDependency));

      const exec = execByUrl.get(r.url);
      const initialStatus: ExecutionStatus = exec?.status ?? "To Do";

      out.push({
        row: r,
        tier,
        category,
        bestKw: r.best_tv_keyword ?? "",
        bestKwSv: r.best_tv_kw_sv ?? null,
        bestKwRank: r.best_tv_kw_rank ?? null,
        sessions: r.sessions ?? null,
        actionItems,
        kwDep,
        initialStatus,
      });
    }
    // Sort by tier asc, then sessions desc (treat null as 0).
    out.sort((a, b) => {
      const t = a.tier.sortKey - b.tier.sortKey;
      if (t !== 0) return t;
      return (b.sessions ?? 0) - (a.sessions ?? 0);
    });
    return out;
  }, [rows, decisionByUrl, execByUrl, ctx]);

  return (
    <div>
      <TabHeader
        title="URL Priority"
        count={vms.length}
        subtitle={
          <>
            Every scope URL with at least one failing Phase 2 check —
            sorted by Priority Tier then Sessions. Status writes to{" "}
            <code className="font-mono text-[10.5px]">page_execution</code>{" "}
            so the URL drawer + per-check view stay in sync.
          </>
        }
      />

      {vms.length === 0 ? (
        <EmptyTab message="No scope URLs have failing Phase 2 checks." />
      ) : (
        <TableShell>
          <ThinHeaderRow
            cells={[
              { label: "URL" },
              { label: "Priority Tier" },
              { label: "Category" },
              { label: "Service" },
              { label: "Best KW" },
              { label: "SV", right: true },
              { label: "Rank", right: true },
              { label: "Sessions", right: true },
              { label: "Action Items" },
              { label: "KW Dep" },
              { label: "Status" },
            ]}
          />
          <tbody>
            {vms.map((v) => (
              <UrlPriorityRow
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

function UrlPriorityRow({
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
      <td className={`${TD} text-[11px] text-muted-foreground/60`}>—</td>
      <td className={`${TD} text-[11px]`} title={vm.bestKw}>
        <div className="truncate max-w-[180px]">{vm.bestKw || "—"}</div>
      </td>
      <td className={`${TD} text-right tabular-nums text-[11px]`}>
        {vm.bestKwSv != null ? vm.bestKwSv.toLocaleString() : "—"}
      </td>
      <td className={`${TD} text-right tabular-nums text-[11px]`}>
        {vm.bestKwRank != null ? Math.trunc(vm.bestKwRank).toLocaleString() : "—"}
      </td>
      <td className={`${TD} text-right tabular-nums text-[11px]`}>
        {vm.sessions != null ? vm.sessions.toLocaleString() : "—"}
      </td>
      <td className={`${TD} text-[11px] text-muted-foreground max-w-[360px]`}>
        {vm.actionItems}
      </td>
      <td className={TD}>
        <span
          className={`text-[10.5px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${DEP_PILL[vm.kwDep] ?? "bg-muted text-muted-foreground"}`}
        >
          {vm.kwDep}
        </span>
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
