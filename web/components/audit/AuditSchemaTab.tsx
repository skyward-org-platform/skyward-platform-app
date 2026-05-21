"use client";

// Schema Optimization — per-URL required schema lookup. Ports
// build_phase2_technical.py `write_schema_optimization` (~line 822) and
// the SCHEMA_TARGETS_BY_CATEGORY transport mapping. Current Schema +
// Issue Type are Blocked (need SF structured data report) — the column
// stays so the workbook shape lines up and the practitioner sees what's
// pending.

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

// Transport-industry schema targets. Source:
// operations/process-library/1. seo-pipeline/sop/industry/transport-requirements.md
// Kept identical to SCHEMA_TARGETS_BY_CATEGORY in build_phase2_technical.py
// so the workbook + UI agree.
const SCHEMA_TARGETS_BY_CATEGORY: Record<string, string> = {
  Homepage:
    "LocalBusiness + FAQ + WebSite + Organization (+ Review if applicable)",
  "Service Page": "Service + FAQ + Vehicle (if relevant) + Breadcrumb",
  "Fleet/Product Page":
    "Vehicle/Product per vehicle (Product+AggregateRating for review stars) + Breadcrumb",
  "Location Page":
    "LocalBusiness (reference only) + Service (if highlighted) + FAQ + Breadcrumb",
  "Blog Post": "Article + Breadcrumb",
  "Blog Hub": "Breadcrumb",
  "Blog Category": "Breadcrumb",
  "Quote/Contact": "ContactPoint or LocalBusiness (reference) + Breadcrumb",
  Utility: "Breadcrumb",
};

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

type RowVm = {
  row: WqaRow;
  tierSortKey: number;
  category: string;
  required: string;
  plan: string;
  initialStatus: ExecutionStatus;
};

export function AuditSchemaTab({
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
  // ctx is accepted for prop-parity with sibling tabs even though Schema
  // doesn't read from it today — keeps the call sites in AuditModeShell
  // uniform.
  void ctx;
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
      const required =
        SCHEMA_TARGETS_BY_CATEGORY[category] ?? "Breadcrumb (minimum)";
      let plan = `Implement ${required}; validate via Rich Results Test`;
      if (category === "Service Page") {
        plan +=
          " · consider Product+AggregateRating on highest-value service for review stars";
      }

      const exec = execByUrl.get(r.url);
      const initialStatus: ExecutionStatus = exec?.status ?? "To Do";

      out.push({
        row: r,
        tierSortKey: tier.sortKey,
        category,
        required,
        plan,
        initialStatus,
      });
    }
    out.sort((a, b) => {
      const t = a.tierSortKey - b.tierSortKey;
      if (t !== 0) return t;
      return (b.row.sessions ?? 0) - (a.row.sessions ?? 0);
    });
    return out;
  }, [rows, decisionByUrl, execByUrl]);

  return (
    <div>
      <TabHeader
        title="Schema Optimization"
        count={vms.length}
        subtitle={
          <>
            Required schema per page category (transport SOP). Current
            Schema + Issue Type are{" "}
            <span className="font-medium text-foreground">Blocked</span> —
            requires Screaming Frog structured data report.
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
              { label: "Category" },
              { label: "Required Schema" },
              { label: "Current Schema" },
              { label: "Issue Type" },
              { label: "JSON-LD Plan" },
              { label: "Status" },
            ]}
          />
          <tbody>
            {vms.map((v) => (
              <SchemaRow
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

function SchemaRow({
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
      <td className={`${TD} text-[11px] text-muted-foreground whitespace-nowrap`}>
        {vm.category}
      </td>
      <td className={`${TD} text-[11px] max-w-[280px]`}>{vm.required}</td>
      <td className={TD}>
        <span className="text-[10.5px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 whitespace-nowrap">
          Blocked
        </span>
        <span className="ml-2 text-[10.5px] text-muted-foreground">
          (need SF)
        </span>
      </td>
      <td className={TD}>
        <span className="text-[10.5px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
          Blocked
        </span>
      </td>
      <td className={`${TD} text-[11px] text-muted-foreground max-w-[400px]`}>
        {vm.plan}
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
