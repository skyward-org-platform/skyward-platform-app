"use client";

// Audit Checklist — same data as Issue Summary but grouped into three
// sections (T1-T20 / C1-C20 / S1-S12) per the workbook tab in
// build_phase2_technical.py `write_audit_checklist`. Practitioners use
// this when they want to walk every check in order, not just the
// failing ones.
//
// Each check row is a click → AuditCheckDetailView via
// ?check=<id>.

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
  type CheckCategory,
  type Ctx,
} from "@/lib/wqa-checks";
import type { WqaRow } from "@/lib/wqa";

type CheckStatus = "Fail" | "Pass" | "Blocked" | "Manual";

const STATUS_PILL: Record<CheckStatus, string> = {
  Fail: "bg-rose-50 text-rose-700",
  Pass: "bg-emerald-50 text-emerald-700",
  Blocked: "bg-indigo-50 text-indigo-700",
  Manual: "bg-slate-50 text-slate-700",
};

const SECTION_META: Array<{
  key: CheckCategory;
  label: string;
  range: string;
}> = [
  { key: "T", label: "Technical", range: "T1-T20" },
  { key: "C", label: "Content", range: "C1-C20" },
  { key: "S", label: "Sitewide", range: "S1-S12" },
];

type ChecklistRow = {
  def: CheckDef;
  status: CheckStatus;
  count: number;
  detail: string;
};

function vmFor(
  def: CheckDef,
  failCounts: Map<string, number>,
): ChecklistRow {
  if (def.kind === "blocked") {
    return {
      def,
      status: "Blocked",
      count: 0,
      detail: def.blockedReason ?? "Blocked",
    };
  }
  if (def.category === "S") {
    // S-checks need live sitewide HTTP fetches (robots.txt, sitemap.xml,
    // etc.). Until that runner ships, show Manual so the practitioner
    // sees they have to verify it themselves.
    return {
      def,
      status: "Manual",
      count: 0,
      detail: "Manual sitewide verification — see SOP §7",
    };
  }
  const count = failCounts.get(def.id) ?? 0;
  if (count > 0) {
    return {
      def,
      status: "Fail",
      count,
      detail: `${count} URL${count === 1 ? "" : "s"} affected · ${def.action}`,
    };
  }
  return {
    def,
    status: "Pass",
    count: 0,
    detail: `All scope URLs pass · ${def.action}`,
  };
}

export function AuditChecklistTab({
  scopeRows,
  ctx,
}: {
  scopeRows: WqaRow[];
  ctx: Ctx;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  // One walk over scopeRows produces the fail count for every active
  // T/C check at once — same approach as the Issue Summary.
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

  const sections = useMemo(() => {
    return SECTION_META.map(({ key, label, range }) => {
      const defs = CHECKS.filter((c) => c.category === key);
      const vms = defs.map((d) => vmFor(d, failCounts));
      return { key, label, range, vms };
    });
  }, [failCounts]);

  function openCheck(id: string) {
    const params = new URLSearchParams(sp.toString());
    params.set("mode", "audit");
    params.set("view", "checklist");
    params.set("check", id);
    router.push(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-6">
      <TabHeader
        title="Audit Checklist"
        count={CHECKS.length}
        subtitle="All 52 Phase 2 checks grouped by category. Pass / Fail / Blocked / Manual per check. Click a row to drill into affected URLs."
      />

      {sections.map((section) => (
        <section key={section.key}>
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {section.label}{" "}
            <span className="font-mono text-[10.5px] font-normal">
              ({section.range})
            </span>
          </h3>
          <TableShell>
            <ThinHeaderRow
              cells={[
                { label: "#" },
                { label: "Check" },
                { label: "Status" },
                { label: "URLs", right: true },
                { label: "Detail / Action" },
              ]}
            />
            <tbody>
              {section.vms.map((v) => (
                <tr
                  key={v.def.id}
                  onClick={() => openCheck(v.def.id)}
                  className="border-t hover:bg-muted/40 cursor-pointer"
                >
                  <td className={`${TD} font-mono text-[11px] text-muted-foreground w-12`}>
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
                    {v.status === "Fail" ? (
                      v.count.toLocaleString()
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </td>
                  <td className={`${TD} text-[11px] text-muted-foreground`}>
                    {v.detail}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </section>
      ))}
    </div>
  );
}
