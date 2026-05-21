"use client";

// Top-level sub-tab shell for the WQA Data view. Routes between
// Overview / per-action tabs / All URLs. Active sub-tab persists in the
// URL search param `?action=` so deep-linking works.
//
// Per WQA SOP workbook structure (§ 7.1): each tab focuses on the data
// the next-step practitioner needs — Redirect lists destinations, Restore
// lists rebuild specs, Optimize lists tech + content actions, etc.

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { WqaDataView } from "@/components/WqaDataView";
import { OverviewTab } from "@/components/wqa/OverviewTab";
import { OptimizeTab } from "@/components/wqa/OptimizeTab";
import { RedirectTab } from "@/components/wqa/RedirectTab";
import { RestoreTab } from "@/components/wqa/RestoreTab";
import { RemoveTab } from "@/components/wqa/RemoveTab";
import {
  EvaluateTab,
  InvestigateTab,
} from "@/components/wqa/HumanReviewTabs";
import { CanonicalAuditTab } from "@/components/wqa/CanonicalAuditTab";
import { ActionLegendTab } from "@/components/wqa/ActionLegendTab";
import { UrlDrawer } from "@/components/UrlDrawer";
import { ACTION_TINT, triageRow, type TriageAction } from "@/lib/wqa-triage";
import { buildCtx } from "@/lib/wqa-checks";
import type { WqaRow, WqaSiteSummary } from "@/lib/wqa";
import type { TriagedRow } from "@/components/wqa/types";
import type { DecisionRow } from "@/lib/wqa-decisions";
import type { PageExecutionRow } from "@/lib/page-execution";
import {
  checkStateKey,
  type PageCheckStateRow,
} from "@/lib/page-check-state";

type SubTab =
  | "overview"
  | "all"
  | "optimize"
  | "restore"
  | "redirect"
  | "consolidate"
  | "remove"
  | "evaluate"
  | "investigate"
  | "canonical-audit"
  | "action-legend";

const TAB_TO_ACTION: Partial<Record<SubTab, TriageAction>> = {
  optimize: "Optimize",
  restore: "Restore",
  redirect: "Redirect",
  consolidate: "Consolidate",
  remove: "Remove",
  evaluate: "Evaluate",
  investigate: "Investigate",
};

export function WqaTabs({
  propertySlug,
  propertyId,
  primaryDomain,
  rows,
  summary,
  projectId,
  version,
  dataset,
  message,
  decisions,
  executions,
  checkStates,
}: {
  propertySlug: string;
  propertyId: string | null;
  primaryDomain: string | null;
  rows: WqaRow[];
  summary: WqaSiteSummary | null;
  projectId: number | null;
  version: number | null;
  dataset: string;
  message?: string;
  decisions: DecisionRow[];
  executions: PageExecutionRow[];
  checkStates: PageCheckStateRow[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const view = (sp.get("action") || "overview") as SubTab;
  const [drawerUrl, setDrawerUrl] = useState<string | null>(null);

  // Build url → override map so triage can layer overrides on top of the
  // SOP result without re-querying.
  const decisionByUrl = useMemo(() => {
    const m = new Map<string, DecisionRow>();
    for (const d of decisions) m.set(d.url, d);
    return m;
  }, [decisions]);

  const triaged: TriagedRow[] = useMemo(
    () =>
      rows.map((r) => {
        const sop = triageRow(r);
        const override = decisionByUrl.get(r.url);
        if (override) {
          return {
            row: r,
            triage: {
              action: override.action as TriageAction,
              logic: `Override by ${override.decided_by} · was ${sop.action} (${sop.logic})`,
              tier: undefined,
              isOverridden: true,
              sopAction: sop.action,
            },
          };
        }
        return { row: r, triage: { ...sop, sopAction: sop.action } };
      }),
    [rows, decisionByUrl],
  );

  const counts = useMemo(() => {
    const c = new Map<TriageAction, number>();
    for (const r of triaged)
      c.set(r.triage.action, (c.get(r.triage.action) ?? 0) + 1);
    return c;
  }, [triaged]);

  // Per-URL lookups for the drawer. execByUrl is direct; check states are
  // collapsed from the global "url\x1fcheck_id" key into a nested map so
  // the drawer can read a single URL's failing checks in one go.
  const execByUrl = useMemo(() => {
    const m = new Map<string, PageExecutionRow>();
    for (const e of executions) m.set(e.url, e);
    return m;
  }, [executions]);

  const checkStatesByUrl = useMemo(() => {
    const m = new Map<string, Map<string, PageCheckStateRow>>();
    for (const s of checkStates) {
      // Key already encodes url+check_id; we re-bucket by url here for the
      // drawer. checkStateKey() composition is reused for clarity.
      void checkStateKey; // referenced for documentation; not used at runtime
      let inner = m.get(s.url);
      if (!inner) {
        inner = new Map();
        m.set(s.url, inner);
      }
      inner.set(s.check_id, s);
    }
    return m;
  }, [checkStates]);

  // Triage category proxy: most reliable signal we have today is the SF
  // page "type" field. T5/T7 medians don't need a precise category — just
  // a stable bucket per URL. Falls back to "Other" so the median map
  // always finds a key.
  const ctx = useMemo(
    () => buildCtx(rows, (r) => r.type ?? "Other"),
    [rows],
  );

  const drawerTriaged =
    drawerUrl !== null
      ? triaged.find((t) => t.row.url === drawerUrl) ?? null
      : null;

  function setView(next: SubTab) {
    const params = new URLSearchParams(sp.toString());
    if (next === "overview") params.delete("action");
    else params.set("action", next);
    router.push(`?${params.toString()}`, { scroll: false });
  }

  if (rows.length === 0) {
    return (
      <WqaDataView
        rows={rows}
        summary={summary}
        projectId={projectId}
        version={version}
        dataset={dataset}
        message={message}
      />
    );
  }

  return (
    <div>
      {/* Provenance header */}
      <header className="mb-4 flex items-baseline justify-between gap-4 flex-wrap">
        <div className="text-[11px] text-muted-foreground tabular-nums">
          project {projectId} · v{version} · {dataset} ·{" "}
          <span className="text-muted-foreground/70">
            From <code className="bg-muted px-1 rounded text-[10px]">skyward-seo-pipeline</code>
          </span>
        </div>
      </header>

      {/* Sub-tab strip */}
      <nav className="border-b mb-5 flex items-center gap-1 overflow-x-auto">
        <TabButton active={view === "overview"} onClick={() => setView("overview")}>
          Overview
        </TabButton>
        {(["optimize", "restore", "redirect", "consolidate", "remove", "evaluate", "investigate"] as SubTab[]).map(
          (key) => {
            const action = TAB_TO_ACTION[key];
            const count = action ? counts.get(action) ?? 0 : 0;
            if (count === 0) return null;
            const tint = action ? ACTION_TINT[action] : undefined;
            return (
              <TabButton
                key={key}
                active={view === key}
                onClick={() => setView(key)}
                accent={tint?.dot}
                count={count}
              >
                {action}
              </TabButton>
            );
          },
        )}
        <TabButton
          active={view === "canonical-audit"}
          onClick={() => setView("canonical-audit")}
        >
          Canonical Audit
        </TabButton>
        <TabButton
          active={view === "action-legend"}
          onClick={() => setView("action-legend")}
          subdued
        >
          Action Legend
        </TabButton>
        <span className="flex-1" />
        <TabButton
          active={view === "all"}
          onClick={() => setView("all")}
          subdued
        >
          All URLs · {rows.length}
        </TabButton>
      </nav>

      {/* Active tab body */}
      <Body
        view={view}
        propertySlug={propertySlug}
        triaged={triaged}
        rowsRaw={rows}
        summary={summary}
        projectId={projectId}
        version={version}
        dataset={dataset}
        message={message}
        execByUrl={execByUrl}
        onOpenDrawer={(url) => setDrawerUrl(url)}
      />

      <UrlDrawer
        open={drawerUrl !== null}
        onClose={() => setDrawerUrl(null)}
        propertySlug={propertySlug}
        propertyId={propertyId}
        primaryDomain={primaryDomain}
        row={drawerTriaged?.row ?? null}
        currentAction={drawerTriaged?.triage.action ?? ""}
        category={drawerTriaged?.row.type ?? "Other"}
        execution={drawerUrl ? execByUrl.get(drawerUrl) ?? null : null}
        checkStatesForUrl={
          drawerUrl ? checkStatesByUrl.get(drawerUrl) ?? new Map() : new Map()
        }
        ctx={ctx}
      />
    </div>
  );
}

function Body({
  view,
  propertySlug,
  triaged,
  rowsRaw,
  summary,
  projectId,
  version,
  dataset,
  message,
  execByUrl,
  onOpenDrawer,
}: {
  view: SubTab;
  propertySlug: string;
  triaged: TriagedRow[];
  rowsRaw: WqaRow[];
  summary: WqaSiteSummary | null;
  projectId: number | null;
  version: number | null;
  dataset: string;
  message?: string;
  execByUrl: Map<string, PageExecutionRow>;
  onOpenDrawer: (url: string) => void;
}) {
  if (view === "overview") {
    // synthetic://* rows in page_execution belong to the action-plan /
    // implementation-checklist editors. Pre-filter so OverviewTab doesn't
    // walk the full execution map for every cell read.
    const synthetic = new Map<string, PageExecutionRow>();
    for (const [url, row] of execByUrl) {
      if (url.startsWith("synthetic://")) synthetic.set(url, row);
    }
    return (
      <OverviewTab
        rows={triaged}
        all={triaged}
        propertySlug={propertySlug}
        syntheticExecutions={synthetic}
      />
    );
  }
  if (view === "canonical-audit") {
    return (
      <CanonicalAuditTab
        rows={triaged}
        all={triaged}
        propertySlug={propertySlug}
        onOpenDrawer={onOpenDrawer}
      />
    );
  }
  if (view === "action-legend") {
    return <ActionLegendTab />;
  }
  if (view === "all") {
    return (
      <WqaDataView
        rows={rowsRaw}
        summary={summary}
        projectId={projectId}
        version={version}
        dataset={dataset}
        message={message}
        onOpenDrawer={onOpenDrawer}
      />
    );
  }
  const action = TAB_TO_ACTION[view];
  if (!action) return null;
  const rows = triaged.filter((r) => r.triage.action === action);
  const props = { rows, all: triaged, propertySlug, onOpenDrawer, execByUrl };
  switch (action) {
    case "Optimize":
      return <OptimizeTab {...props} />;
    case "Redirect":
      return <RedirectTab {...props} />;
    case "Restore":
      return <RestoreTab {...props} />;
    case "Remove":
      return <RemoveTab {...props} />;
    case "Evaluate":
      return <EvaluateTab {...props} />;
    case "Investigate":
      return <InvestigateTab {...props} />;
    default:
      return null;
  }
}

function TabButton({
  active,
  onClick,
  children,
  count,
  accent,
  subdued,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
  accent?: string;
  subdued?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[12px] font-medium px-3 py-2 border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
        active
          ? "border-foreground text-foreground"
          : subdued
            ? "border-transparent text-muted-foreground/70 hover:text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {accent && <span className={`size-1.5 rounded-full ${accent}`} />}
      {children}
      {count !== undefined && (
        <span
          className={`text-[10.5px] tabular-nums font-semibold px-1.5 py-0.5 rounded ${
            active ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}
