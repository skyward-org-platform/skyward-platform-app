"use client";

// Top-level shell for the TECHNICAL AUDIT mode. Sibling to WqaTabs in
// terms of role: it owns the audit-mode sub-tab nav, scopes the row set
// to Optimize+Restore (per Phase 2 SOP — the audit only runs on URLs
// that survive Phase 1 triage), and wires the universal URL drawer the
// same way WqaTabs does.
//
// Sub-tabs (in nav order):
//   - overview          → AuditOverviewTab (Issue Summary)
//   - checklist         → AuditChecklistTab OR AuditCheckDetailView
//                         (when ?check= is set, deep-link into per-check
//                          filtered URL list)
//   - url-priority      → AuditUrlPriorityTab (consolidated per-URL view)
//   - architecture      → AuditArchitectureTab (depth + inlinks + sitemap)
//   - schema            → AuditSchemaTab (required schema per category)
//   - pagespeed         → AuditPageSpeedTab (BLOCKED placeholder)
//   - broken            → AuditBrokenTab (BLOCKED placeholder)

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UrlDrawer } from "@/components/UrlDrawer";
import { AuditOverviewTab } from "@/components/audit/AuditOverviewTab";
import { AuditChecklistTab } from "@/components/audit/AuditChecklistTab";
import { AuditCheckDetailView } from "@/components/audit/AuditCheckDetailView";
import { AuditUrlPriorityTab } from "@/components/audit/AuditUrlPriorityTab";
import { AuditArchitectureTab } from "@/components/audit/AuditArchitectureTab";
import { AuditSchemaTab } from "@/components/audit/AuditSchemaTab";
import { AuditPageSpeedTab } from "@/components/audit/AuditPageSpeedTab";
import { AuditBrokenTab } from "@/components/audit/AuditBrokenTab";
import { triageRow, type TriageAction } from "@/lib/wqa-triage";
import { buildCtx } from "@/lib/wqa-checks";
import type { WqaRow, WqaSiteSummary } from "@/lib/wqa";
import type { TriagedRow } from "@/components/wqa/types";
import type { DecisionRow } from "@/lib/wqa-decisions";
import type { PageExecutionRow } from "@/lib/page-execution";
import {
  checkStateKey,
  type PageCheckStateRow,
} from "@/lib/page-check-state";

type SubView =
  | "overview"
  | "checklist"
  | "url-priority"
  | "architecture"
  | "schema"
  | "pagespeed"
  | "broken";

export function AuditModeShell({
  propertySlug,
  propertyId,
  primaryDomain,
  rows,
  decisions,
  executions,
  checkStates,
}: {
  propertySlug: string;
  propertyId: string | null;
  primaryDomain: string | null;
  rows: WqaRow[];
  summary: WqaSiteSummary | null;
  decisions: DecisionRow[];
  executions: PageExecutionRow[];
  checkStates: PageCheckStateRow[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const view = (sp.get("view") || "overview") as SubView;
  const checkParam = sp.get("check");
  const [drawerUrl, setDrawerUrl] = useState<string | null>(null);

  // Decision overlay map: identical pattern to WqaTabs so the effective
  // action is consistent across modes.
  const decisionByUrl = useMemo(() => {
    const m = new Map<string, DecisionRow>();
    for (const d of decisions) m.set(d.url, d);
    return m;
  }, [decisions]);

  // Triage every row (we'll filter to Optimize/Restore below). Mirror the
  // WqaTabs shape exactly so any TriagedRow constructed here is
  // interchangeable.
  const triagedAll: TriagedRow[] = useMemo(
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

  // Phase 2 scope: only URLs whose EFFECTIVE action is Optimize or
  // Restore. Per SOP §7 — audit checks only run against URLs that
  // survived triage as keep-and-improve candidates.
  const scopeTriaged = useMemo(
    () =>
      triagedAll.filter((t) => {
        const a = t.triage.action;
        return a === "Optimize" || a === "Restore";
      }),
    [triagedAll],
  );
  const scopeRows = useMemo(
    () => scopeTriaged.map((t) => t.row),
    [scopeTriaged],
  );

  // Build the cross-row context once (median inlinks per category +
  // duplicate kw/meta/title maps). T5/T7/C3/C9/C10 all depend on it.
  // Same proxy as WqaTabs (row.type for category).
  const ctx = useMemo(
    () => buildCtx(scopeRows, (r) => r.type ?? "Other"),
    [scopeRows],
  );

  // Per-URL lookups for the drawer + check-detail view.
  const execByUrl = useMemo(() => {
    const m = new Map<string, PageExecutionRow>();
    for (const e of executions) m.set(e.url, e);
    return m;
  }, [executions]);

  const checkStatesByUrl = useMemo(() => {
    const m = new Map<string, Map<string, PageCheckStateRow>>();
    for (const s of checkStates) {
      let inner = m.get(s.url);
      if (!inner) {
        inner = new Map();
        m.set(s.url, inner);
      }
      inner.set(s.check_id, s);
    }
    return m;
  }, [checkStates]);

  // The (url, check_id) keyed map is what the per-check detail view
  // needs — composed via checkStateKey so the encoding stays in one
  // place.
  const checkStatesByKey = useMemo(() => {
    const m = new Map<string, PageCheckStateRow>();
    for (const s of checkStates) {
      m.set(checkStateKey(s.url, s.check_id), s);
    }
    return m;
  }, [checkStates]);

  const drawerTriaged =
    drawerUrl !== null
      ? triagedAll.find((t) => t.row.url === drawerUrl) ?? null
      : null;

  function setView(next: SubView) {
    const params = new URLSearchParams(sp.toString());
    params.set("mode", "audit");
    params.delete("check"); // changing tab clears any deep-linked check
    if (next === "overview") params.delete("view");
    else params.set("view", next);
    router.push(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div>
      {/* Scope summary */}
      <header className="mb-4 flex items-baseline justify-between gap-4 flex-wrap">
        <div className="text-[11px] text-muted-foreground tabular-nums">
          Phase 2 scope: <span className="font-semibold text-foreground">{scopeRows.length.toLocaleString()}</span>{" "}
          URL{scopeRows.length === 1 ? "" : "s"} (Optimize + Restore) ·{" "}
          {triagedAll.length.toLocaleString()} total triaged
        </div>
      </header>

      {/* Sub-tab strip */}
      <nav className="border-b mb-5 flex items-center gap-1 overflow-x-auto">
        <SubTabButton active={view === "overview"} onClick={() => setView("overview")}>
          Issue Summary
        </SubTabButton>
        <SubTabButton active={view === "checklist"} onClick={() => setView("checklist")}>
          Audit Checklist
        </SubTabButton>
        <SubTabButton
          active={view === "url-priority"}
          onClick={() => setView("url-priority")}
        >
          URL Priority
        </SubTabButton>
        <SubTabButton
          active={view === "architecture"}
          onClick={() => setView("architecture")}
        >
          Architecture
        </SubTabButton>
        <SubTabButton
          active={view === "schema"}
          onClick={() => setView("schema")}
        >
          Schema
        </SubTabButton>
        <SubTabButton
          active={view === "pagespeed"}
          onClick={() => setView("pagespeed")}
          subdued
        >
          Page Speed
        </SubTabButton>
        <SubTabButton
          active={view === "broken"}
          onClick={() => setView("broken")}
          subdued
        >
          Broken Links
        </SubTabButton>
      </nav>

      {/* Body */}
      <Body
        view={view}
        checkParam={checkParam}
        propertySlug={propertySlug}
        scopeTriaged={scopeTriaged}
        scopeRows={scopeRows}
        decisions={decisions}
        executions={executions}
        ctx={ctx}
        checkStatesByKey={checkStatesByKey}
        onOpenDrawer={(url) => setDrawerUrl(url)}
      />

      {/* Universal drawer — shared with Triage mode. */}
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
  checkParam,
  propertySlug,
  scopeTriaged,
  scopeRows,
  decisions,
  executions,
  ctx,
  checkStatesByKey,
  onOpenDrawer,
}: {
  view: SubView;
  checkParam: string | null;
  propertySlug: string;
  scopeTriaged: TriagedRow[];
  scopeRows: WqaRow[];
  decisions: DecisionRow[];
  executions: PageExecutionRow[];
  ctx: ReturnType<typeof buildCtx>;
  checkStatesByKey: Map<string, PageCheckStateRow>;
  onOpenDrawer: (url: string) => void;
}) {
  if (view === "overview") {
    return (
      <AuditOverviewTab
        scopeRows={scopeRows}
        ctx={ctx}
      />
    );
  }
  if (view === "checklist") {
    if (checkParam) {
      return (
        <AuditCheckDetailView
          checkId={checkParam}
          propertySlug={propertySlug}
          scopeTriaged={scopeTriaged}
          ctx={ctx}
          checkStatesByKey={checkStatesByKey}
          onOpenDrawer={onOpenDrawer}
        />
      );
    }
    return <AuditChecklistTab scopeRows={scopeRows} ctx={ctx} />;
  }
  if (view === "url-priority") {
    return (
      <AuditUrlPriorityTab
        rows={scopeRows}
        decisions={decisions}
        executions={executions}
        ctx={ctx}
        propertySlug={propertySlug}
        onOpenDrawer={onOpenDrawer}
      />
    );
  }
  if (view === "architecture") {
    return (
      <AuditArchitectureTab
        rows={scopeRows}
        decisions={decisions}
        executions={executions}
        ctx={ctx}
        propertySlug={propertySlug}
        onOpenDrawer={onOpenDrawer}
      />
    );
  }
  if (view === "schema") {
    return (
      <AuditSchemaTab
        rows={scopeRows}
        decisions={decisions}
        executions={executions}
        ctx={ctx}
        propertySlug={propertySlug}
        onOpenDrawer={onOpenDrawer}
      />
    );
  }
  if (view === "pagespeed") {
    return <AuditPageSpeedTab rows={scopeRows} onOpenDrawer={onOpenDrawer} />;
  }
  if (view === "broken") {
    return <AuditBrokenTab rows={scopeRows} onOpenDrawer={onOpenDrawer} />;
  }
  return null;
}

function SubTabButton({
  active,
  onClick,
  children,
  subdued,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  subdued?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[12px] font-medium px-3 py-2 border-b-2 transition-colors whitespace-nowrap ${
        active
          ? "border-foreground text-foreground"
          : subdued
            ? "border-transparent text-muted-foreground/70 hover:text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
