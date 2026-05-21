"use client";

// WQA Overview — landing page for the WQA Data view. Mirrors the workbook
// tabs the practitioner skims first:
//   - Action Plan         (workbook Tab 2)
//   - Funnel Summary      (workbook Tab 4)
//   - Service Summary     (workbook Tab 5)
//   - Implementation Checklist (workbook Tab 10)
// Action Legend lives in its own sub-tab now (ActionLegendTab) so this
// surface stays focused on what-to-do-next rather than reference material.
//
// Owner overrides on the Action Plan, and "done" toggles on the
// Implementation Checklist, persist via page_execution writes against
// SYNTHETIC URLs (`synthetic://action-plan/N`, `synthetic://implementation-checklist/N`).
// Synthetic URLs let us reuse the existing (property_id, url) unique key
// without a schema change — they're filtered out of any real-URL views by
// the leading `synthetic://` prefix.

import { useMemo, useState, useTransition } from "react";
import { TabHeader } from "@/components/wqa/helpers";
import { ACTION_TINT, type TriageAction } from "@/lib/wqa-triage";
import type { ActionTabProps, TriagedRow } from "@/components/wqa/types";
import type { PageExecutionRow } from "@/lib/page-execution";
import {
  setExecutionField,
  setExecutionStatus,
} from "@/app/properties/[slug]/pages/wqa-actions";

type Severity = "High" | "Medium" | "Low";

const SEVERITY_BAND: Record<Severity, string> = {
  High: "bg-amber-50 text-amber-800",
  Medium: "bg-slate-50 text-slate-700",
  Low: "bg-muted text-muted-foreground",
};

const FUNNEL_GROUPS: TriageAction[] = [
  "Optimize",
  "Redirect",
  "Restore",
  "Consolidate",
  "Remove",
  "Evaluate",
  "Investigate",
  "Leave as 404",
  "Non-indexable",
  "Non-addressable",
];

function severityFor(count: number): Severity {
  if (count >= 20) return "High";
  if (count >= 5) return "Medium";
  return "Low";
}

type ChecklistItem = {
  n: number;
  title: string;
  urls: number;
  dependsOn: string;
};

function buildChecklist(counts: Map<TriageAction, number>): ChecklistItem[] {
  const c = (a: TriageAction) => counts.get(a) ?? 0;
  return [
    {
      n: 1,
      title: "Execute Redirect Map",
      urls: c("Redirect"),
      dependsOn: "-",
    },
    {
      n: 2,
      title: "Restore broken pages with material value",
      urls: c("Restore"),
      dependsOn: "-",
    },
    {
      n: 3,
      title: "Apply noindex / delete on zero-value URLs",
      urls: c("Remove"),
      dependsOn: "Redirects done",
    },
    {
      n: 4,
      title: "Consolidate duplicate template pages",
      urls: c("Consolidate"),
      dependsOn: "-",
    },
    {
      n: 5,
      title: "Resolve Review + Evaluate items",
      urls: c("Evaluate") + c("Investigate"),
      dependsOn: "-",
    },
    {
      n: 6,
      title: "Audit canonicals on Optimize URLs",
      urls: c("Optimize"),
      dependsOn: "Optimize set finalized",
    },
    {
      n: 7,
      title: "Re-crawl with Screaming Frog after fixes",
      urls: 0,
      dependsOn: "Steps 1-6 complete",
    },
    {
      n: 8,
      title: "Hand Optimize + Restore URLs to Phase 2 + 3",
      urls: c("Optimize") + c("Restore"),
      dependsOn: "Triage signed off",
    },
  ];
}

function actionPlanUrl(n: number): string {
  return `synthetic://action-plan/${n}`;
}

function checklistUrl(n: number): string {
  return `synthetic://implementation-checklist/${n}`;
}

export function OverviewTab({
  all,
  propertySlug,
  syntheticExecutions,
}: ActionTabProps & {
  syntheticExecutions?: Map<string, PageExecutionRow>;
}) {
  const total = all.length;
  const counts = useMemo(() => {
    const c = new Map<TriageAction, number>();
    for (const r of all)
      c.set(r.triage.action, (c.get(r.triage.action) ?? 0) + 1);
    return c;
  }, [all]);

  const checklist = useMemo(() => buildChecklist(counts), [counts]);

  // Service summary: group by row.type (SF page type; service column is the
  // next pass once page_category populates). Per-service action counts +
  // sessions; sorted by sessions desc, top 10.
  const serviceRows = useMemo(() => {
    type Row = {
      service: string;
      total: number;
      optimize: number;
      redirect: number;
      remove: number;
      sessions: number;
    };
    const m = new Map<string, Row>();
    for (const r of all) {
      const svc = (r.row.type ?? "Other") || "Other";
      let row = m.get(svc);
      if (!row) {
        row = {
          service: svc,
          total: 0,
          optimize: 0,
          redirect: 0,
          remove: 0,
          sessions: 0,
        };
        m.set(svc, row);
      }
      row.total += 1;
      row.sessions += r.row.sessions ?? 0;
      const a = r.triage.action;
      if (a === "Optimize") row.optimize += 1;
      else if (a === "Redirect") row.redirect += 1;
      else if (a === "Remove") row.remove += 1;
    }
    return Array.from(m.values())
      .sort((a, b) => b.sessions - a.sessions || b.total - a.total)
      .slice(0, 10);
  }, [all]);

  return (
    <section>
      <TabHeader
        title="Overview"
        subtitle={
          <>
            Action Plan + Funnel + Service Summary + Implementation Checklist.
            Per WQA SOP § 7.1 workbook tabs 2, 4, 5, and 10.
          </>
        }
        count={total}
      />

      {/* 1. Action Plan */}
      <ActionPlan
        counts={counts}
        propertySlug={propertySlug}
        syntheticExecutions={syntheticExecutions}
      />

      {/* 2. Funnel Summary */}
      <FunnelSummary counts={counts} total={total} />

      {/* 3. Service Summary */}
      <div className="border rounded-lg bg-card overflow-hidden mb-4">
        <header className="px-5 py-2 border-b text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
          Service summary
          <span className="text-muted-foreground/70 normal-case tracking-normal ml-1.5">
            · top 10 services by sessions (page-type proxy until page_category lands)
          </span>
        </header>
        {serviceRows.length === 0 ? (
          <div className="px-5 py-4 text-[12px] text-muted-foreground">
            No services to summarize.
          </div>
        ) : (
          <table className="w-full text-[11.5px]">
            <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-5 py-2 font-medium">Service</th>
                <th className="text-right px-3 py-2 font-medium">Total URLs</th>
                <th className="text-right px-3 py-2 font-medium">Optimize</th>
                <th className="text-right px-3 py-2 font-medium">Redirect</th>
                <th className="text-right px-3 py-2 font-medium">Remove</th>
                <th className="text-right px-3 py-2 font-medium">Sessions</th>
              </tr>
            </thead>
            <tbody>
              {serviceRows.map((row) => (
                <tr key={row.service} className="border-t">
                  <td className="px-5 py-1.5 text-[12px]">{row.service}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {row.total.toLocaleString()}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {row.optimize || ""}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {row.redirect || ""}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {row.remove || ""}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                    {row.sessions.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 4. Implementation Checklist */}
      <ImplementationChecklist
        checklist={checklist}
        propertySlug={propertySlug}
        syntheticExecutions={syntheticExecutions}
      />
    </section>
  );
}

// ─── Action Plan ───────────────────────────────────────────────────────────

function ActionPlan({
  counts,
  propertySlug,
  syntheticExecutions,
}: {
  counts: Map<TriageAction, number>;
  propertySlug: string;
  syntheticExecutions?: Map<string, PageExecutionRow>;
}) {
  const c = (a: TriageAction) => counts.get(a) ?? 0;
  const rows: { title: string; urls: number }[] = [
    { title: "Execute Redirect Map", urls: c("Redirect") },
    {
      title: "Restore broken pages with material value",
      urls: c("Restore"),
    },
    {
      title: "Apply noindex / delete on zero-value URLs",
      urls: c("Remove"),
    },
    { title: "Consolidate duplicate template pages", urls: c("Consolidate") },
    {
      title: "Resolve Review + Evaluate items",
      urls: c("Evaluate") + c("Investigate"),
    },
    { title: "Audit canonicals on Optimize URLs", urls: c("Optimize") },
    { title: "Re-crawl with Screaming Frog after fixes", urls: 0 },
    {
      title: "Hand Optimize + Restore URLs to Phase 2 + 3",
      urls: c("Optimize") + c("Restore"),
    },
  ];

  return (
    <div className="border rounded-lg bg-card overflow-hidden mb-4">
      <header className="px-5 py-2 border-b text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
        Action plan
        <span className="text-muted-foreground/70 normal-case tracking-normal ml-1.5">
          · 8 prioritized steps from triage signals
        </span>
      </header>
      <table className="w-full text-[12px]">
        <thead className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/30">
          <tr>
            <th className="text-left px-5 py-2 font-medium">#</th>
            <th className="text-left px-3 py-2 font-medium">Action item</th>
            <th className="text-right px-3 py-2 font-medium">URLs</th>
            <th className="text-left px-3 py-2 font-medium">Severity</th>
            <th className="text-left px-3 py-2 font-medium min-w-[180px]">Owner</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const n = i + 1;
            const sev = severityFor(p.urls);
            const exec = syntheticExecutions?.get(actionPlanUrl(n));
            return (
              <tr key={p.title} className="border-t">
                <td className="px-5 py-2 text-muted-foreground tabular-nums">
                  {n}
                </td>
                <td className="px-3 py-2">{p.title}</td>
                <td className="px-3 py-2 text-right tabular-nums">{p.urls}</td>
                <td className="px-3 py-2">
                  <span
                    className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${SEVERITY_BAND[sev]}`}
                  >
                    {sev}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  <OwnerInput
                    propertySlug={propertySlug}
                    syntheticUrl={actionPlanUrl(n)}
                    defaultValue={exec?.owner ?? ""}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OwnerInput({
  propertySlug,
  syntheticUrl,
  defaultValue,
}: {
  propertySlug: string;
  syntheticUrl: string;
  defaultValue: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        defaultValue={defaultValue}
        placeholder="Assign owner…"
        className={`w-full max-w-[180px] text-[11px] px-2 py-1 rounded border border-input bg-background ${pending ? "opacity-60" : ""}`}
        onClick={(e) => e.stopPropagation()}
        onBlur={(e) => {
          const next = e.currentTarget.value.trim() || null;
          if ((next ?? "") === (defaultValue ?? "")) return;
          setError(null);
          startTransition(async () => {
            const res = await setExecutionField(
              propertySlug,
              syntheticUrl,
              "owner",
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

// ─── Funnel Summary (stacked horizontal bars) ──────────────────────────────

function FunnelSummary({
  counts,
  total,
}: {
  counts: Map<TriageAction, number>;
  total: number;
}) {
  const present = FUNNEL_GROUPS.filter((a) => (counts.get(a) ?? 0) > 0);
  return (
    <div className="border rounded-lg bg-card overflow-hidden mb-4">
      <header className="px-5 py-2 border-b text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
        Funnel summary
        <span className="text-muted-foreground/70 normal-case tracking-normal ml-1.5">
          · action distribution across {total.toLocaleString()} URLs
        </span>
      </header>
      <div className="px-5 py-3 space-y-2">
        {present.map((action) => {
          const count = counts.get(action) ?? 0;
          const pct = total > 0 ? (count / total) * 100 : 0;
          const tint = ACTION_TINT[action];
          return (
            <div key={action} className="flex items-center gap-3 text-[11.5px]">
              <div className="w-32 flex items-center gap-1.5 shrink-0">
                <span className={`size-1.5 rounded-full ${tint.dot}`} />
                <span className="font-medium">{action}</span>
              </div>
              <div className="flex-1 h-4 bg-muted/40 rounded overflow-hidden relative">
                <div
                  className={`h-full ${tint.dot} opacity-80`}
                  style={{ width: `${Math.max(pct, 0.5)}%` }}
                />
              </div>
              <div className="w-32 text-right tabular-nums text-muted-foreground shrink-0">
                <span className="font-semibold text-foreground">
                  {count.toLocaleString()}
                </span>
                <span className="ml-1">· {pct.toFixed(1)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Implementation Checklist ──────────────────────────────────────────────

function ImplementationChecklist({
  checklist,
  propertySlug,
  syntheticExecutions,
}: {
  checklist: ChecklistItem[];
  propertySlug: string;
  syntheticExecutions?: Map<string, PageExecutionRow>;
}) {
  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      <header className="px-5 py-2 border-b text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
        Implementation checklist
        <span className="text-muted-foreground/70 normal-case tracking-normal ml-1.5">
          · sequence + per-step done state
        </span>
      </header>
      <table className="w-full text-[12px]">
        <thead className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/30">
          <tr>
            <th className="text-left px-5 py-2 font-medium">#</th>
            <th className="text-left px-3 py-2 font-medium">Step</th>
            <th className="text-left px-3 py-2 font-medium min-w-[160px]">Owner</th>
            <th className="text-right px-3 py-2 font-medium">URLs</th>
            <th className="text-left px-3 py-2 font-medium">Severity</th>
            <th className="text-left px-3 py-2 font-medium">Depends on</th>
            <th className="text-left px-3 py-2 font-medium">Done</th>
          </tr>
        </thead>
        <tbody>
          {checklist.map((item) => {
            const sev = severityFor(item.urls);
            const synUrl = checklistUrl(item.n);
            const exec = syntheticExecutions?.get(synUrl);
            return (
              <tr key={item.n} className="border-t">
                <td className="px-5 py-1.5 text-muted-foreground tabular-nums">
                  {item.n}
                </td>
                <td className="px-3 py-1.5">{item.title}</td>
                <td className="px-3 py-1.5">
                  <OwnerInput
                    propertySlug={propertySlug}
                    syntheticUrl={synUrl}
                    defaultValue={exec?.owner ?? ""}
                  />
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {item.urls.toLocaleString()}
                </td>
                <td className="px-3 py-1.5">
                  <span
                    className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${SEVERITY_BAND[sev]}`}
                  >
                    {sev}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-[11px] text-muted-foreground italic">
                  {item.dependsOn}
                </td>
                <td className="px-3 py-1.5">
                  <DoneCheckbox
                    propertySlug={propertySlug}
                    syntheticUrl={synUrl}
                    initialDone={exec?.status === "Done"}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DoneCheckbox({
  propertySlug,
  syntheticUrl,
  initialDone,
}: {
  propertySlug: string;
  syntheticUrl: string;
  initialDone: boolean;
}) {
  const [done, setDone] = useState(initialDone);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <label
      className={`inline-flex items-center gap-1 text-[11px] ${pending ? "opacity-60" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={done}
        onChange={(e) => {
          const next = e.currentTarget.checked;
          const prev = done;
          setDone(next);
          setError(null);
          startTransition(async () => {
            const res = await setExecutionStatus(
              propertySlug,
              syntheticUrl,
              next ? "Done" : "To Do",
            );
            if (!res.ok) {
              setDone(prev);
              setError(res.error);
            }
          });
        }}
      />
      <span className="text-muted-foreground">{done ? "Done" : "Open"}</span>
      {error && (
        <span className="text-[10px] text-rose-700" title={error}>
          !
        </span>
      )}
    </label>
  );
}

// Re-export the legend's content shape so ActionLegendTab can stay in sync
// with this file's understanding of the action set. The legend itself moved
// to its own tab — see web/components/wqa/ActionLegendTab.tsx.
export type _TriagedRowAlias = TriagedRow;
