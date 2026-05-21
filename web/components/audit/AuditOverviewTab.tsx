"use client";

// Issue Summary — one row per CHECK across the audit scope. Mirrors the
// Python workbook `write_issue_summary` (build_phase2_technical.py:666):
// for every check in the catalog, count how many scope URLs fail it,
// then render Status / URLs Affected / Action / KW Dependency / Severity
// / Detail.
//
// Click any row → drill into AuditCheckDetailView via
// ?mode=audit&view=checklist&check=<id>.
//
// Performance: we walk scopeRows once and run evaluateChecks per row;
// the results bubble into a Map<check_id, count>. The full catalog is
// then rendered from CHECKS, looking up the count.

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  TabHeader,
  TableShell,
  ThinHeaderRow,
  TD,
} from "@/components/wqa/helpers";
import {
  CHECKS,
  evaluateChecks,
  type CheckDef,
  type Ctx,
} from "@/lib/wqa-checks";
import type { WqaRow } from "@/lib/wqa";

type CheckStatus = "Fail" | "Pass" | "Blocked";

type Severity = "High" | "Medium" | "Low" | "—";

const STATUS_PILL: Record<CheckStatus, string> = {
  Fail: "bg-rose-50 text-rose-700",
  Pass: "bg-emerald-50 text-emerald-700",
  Blocked: "bg-indigo-50 text-indigo-700",
};

const SEVERITY_PILL: Record<Severity, string> = {
  High: "bg-amber-50 text-amber-800",
  Medium: "bg-slate-50 text-slate-700",
  Low: "bg-muted text-muted-foreground",
  "—": "bg-transparent text-muted-foreground/60",
};

const DEP_PILL: Record<string, string> = {
  "Fix Now": "bg-emerald-50 text-emerald-700",
  "Fix Now, Revisit": "bg-amber-50 text-amber-800",
  "Phase 3 Dependent": "bg-orange-50 text-orange-700",
};

function severityFor(count: number, status: CheckStatus): Severity {
  if (status !== "Fail") return "—";
  if (count >= 20) return "High";
  if (count >= 5) return "Medium";
  if (count > 0) return "Low";
  return "—";
}

type RowVm = {
  def: CheckDef;
  status: CheckStatus;
  count: number;
  detail: string;
};

export function AuditOverviewTab({
  scopeRows,
  ctx,
}: {
  scopeRows: WqaRow[];
  ctx: Ctx;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  // Build fail-count map in one pass over scopeRows. evaluateChecks
  // returns every failing check per URL, so we just bump the counter.
  // Blocked + sitewide checks are skipped inside evaluateChecks and
  // therefore never appear here.
  const failCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of scopeRows) {
      const results = evaluateChecks(r, r.type ?? "Other", ctx);
      for (const res of results) {
        m.set(res.id, (m.get(res.id) ?? 0) + 1);
      }
    }
    return m;
  }, [scopeRows, ctx]);

  const vms: RowVm[] = useMemo(() => {
    const out: RowVm[] = [];
    for (const def of CHECKS) {
      if (def.kind === "blocked") {
        out.push({
          def,
          status: "Blocked",
          count: 0,
          detail: def.blockedReason ?? "Blocked — upstream data required",
        });
        continue;
      }
      // S-checks are active but evaluateChecks intentionally skips them;
      // mark Blocked here so the Issue Summary reflects reality (the live
      // sitewide runner that hits robots.txt / sitemap.xml is Chunk 4b+).
      if (def.category === "S") {
        out.push({
          def,
          status: "Blocked",
          count: 0,
          detail: "Sitewide check — pending live runner",
        });
        continue;
      }
      const count = failCounts.get(def.id) ?? 0;
      if (count > 0) {
        out.push({
          def,
          status: "Fail",
          count,
          detail: `${count} URL${count === 1 ? "" : "s"} affected`,
        });
      } else {
        out.push({ def, status: "Pass", count: 0, detail: "All scope URLs pass" });
      }
    }
    // Sort: Fail (by count desc) → Blocked → Pass. Within Fail, ties
    // broken by id for stability.
    return out.sort((a, b) => {
      const rank = (s: CheckStatus) =>
        s === "Fail" ? 0 : s === "Blocked" ? 1 : 2;
      const r = rank(a.status) - rank(b.status);
      if (r !== 0) return r;
      if (a.status === "Fail") {
        const d = b.count - a.count;
        if (d !== 0) return d;
      }
      return a.def.id.localeCompare(b.def.id);
    });
  }, [failCounts]);

  function openCheck(id: string) {
    const params = new URLSearchParams(sp.toString());
    params.set("mode", "audit");
    params.set("view", "checklist");
    params.set("check", id);
    router.push(`?${params.toString()}`, { scroll: false });
  }

  const failTotal = vms.filter((v) => v.status === "Fail").length;
  const blockedTotal = vms.filter((v) => v.status === "Blocked").length;

  return (
    <div>
      <TabHeader
        title="Issue Summary"
        count={CHECKS.length}
        subtitle={
          <>
            Every Phase 2 check (T1–T20, C1–C20, S1–S12) against the
            Optimize + Restore scope.{" "}
            <span className="font-medium text-foreground">{failTotal}</span>{" "}
            failing ·{" "}
            <span className="font-medium text-foreground">{blockedTotal}</span>{" "}
            blocked. Click any row to drill into the affected URLs.
          </>
        }
      />

      <TableShell>
        <ThinHeaderRow
          cells={[
            { label: "#" },
            { label: "Check" },
            { label: "Status" },
            { label: "URLs", right: true },
            { label: "Action" },
            { label: "KW Dependency" },
            { label: "Severity" },
            { label: "Detail" },
          ]}
        />
        <tbody>
          {vms.map((v) => {
            const sev = severityFor(v.count, v.status);
            return (
              <tr
                key={v.def.id}
                onClick={() => openCheck(v.def.id)}
                className="border-t hover:bg-muted/40 cursor-pointer"
              >
                <td className={`${TD} font-mono text-[11px] text-muted-foreground`}>
                  {v.def.id}
                </td>
                <td className={`${TD} font-medium`}>{v.def.name}</td>
                <td className={TD}>
                  <span
                    className={`text-[10.5px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${STATUS_PILL[v.status]}`}
                  >
                    {v.status}
                  </span>
                </td>
                <td className={`${TD} text-right tabular-nums`}>
                  {v.status === "Blocked" ? (
                    <span className="text-muted-foreground/60">—</span>
                  ) : (
                    v.count.toLocaleString()
                  )}
                </td>
                <td className={`${TD} text-[11px] text-muted-foreground`}>
                  {v.def.action}
                </td>
                <td className={TD}>
                  <span
                    className={`text-[10.5px] font-medium px-1.5 py-0.5 rounded ${DEP_PILL[v.def.kwDependency] ?? "bg-muted text-muted-foreground"}`}
                  >
                    {v.def.kwDependency}
                  </span>
                </td>
                <td className={TD}>
                  <span
                    className={`text-[10.5px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${SEVERITY_PILL[sev]}`}
                  >
                    {sev}
                  </span>
                </td>
                <td className={`${TD} text-[11px] text-muted-foreground`}>
                  {v.detail}
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableShell>
    </div>
  );
}
