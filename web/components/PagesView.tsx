"use client";

// Pages tab — unified WQA view with two top-level modes:
//   - TRIAGE          → <WqaTabs>          (Phase 1 — what to do per URL)
//   - TECHNICAL AUDIT → <AuditModeShell>   (Phase 2 — check catalog +
//                                            per-check URL drill)
//
// The mode toggle persists in the URL search param `?mode=`. Triage is
// the default (empty / "triage"). Both modes consume the same WQA data
// + overlays, so switching is a pure render swap — no extra fetch.

import { useRouter, useSearchParams } from "next/navigation";
import { WqaTabs } from "@/components/wqa/WqaTabs";
import { AuditModeShell } from "@/components/audit/AuditModeShell";
import type { WqaRow, WqaSiteSummary } from "@/lib/wqa";
import type { DecisionRow } from "@/lib/wqa-decisions";
import type { PageExecutionRow } from "@/lib/page-execution";
import type { PageCheckStateRow } from "@/lib/page-check-state";

type WqaPayload = {
  rows: WqaRow[];
  summary: WqaSiteSummary | null;
  projectId: number | null;
  version: number | null;
  dataset: string;
  message?: string;
};

type Mode = "triage" | "audit";

export function PagesView({
  propertySlug,
  propertyId,
  wqa,
  wqaError,
  primaryDomain,
  decisions,
  executions,
  checkStates,
}: {
  propertySlug: string;
  propertyId: string | null;
  wqa: WqaPayload | null;
  wqaError: string | null;
  primaryDomain: string | null;
  decisions: DecisionRow[];
  executions: PageExecutionRow[];
  checkStates: PageCheckStateRow[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const mode = ((sp.get("mode") || "triage") as Mode) === "audit"
    ? "audit"
    : "triage";

  function setMode(next: Mode) {
    const params = new URLSearchParams(sp.toString());
    if (next === "triage") {
      params.delete("mode");
      // Clear audit-mode-only params so we don't leak them into Triage.
      params.delete("view");
      params.delete("check");
    } else {
      params.set("mode", "audit");
      // Triage uses `action` for its sub-tabs; not meaningful in audit.
      params.delete("action");
    }
    router.push(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Pages</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every URL with its WQA triage action and the data behind it. SOP
          v5 § 5.2 decision tree runs automatically; click any chip to
          override. WQA aggregate from{" "}
          <code className="bg-muted px-1 rounded text-xs">
            skyward-seo-pipeline
          </code>{" "}
          / BQ <code className="bg-muted px-1 rounded text-xs">wqa_output</code>.
        </p>
      </header>

      {wqaError && (
        <div className="mb-4 p-3 border border-rose-200 bg-rose-50 text-rose-800 text-[12px] rounded">
          <div className="font-semibold mb-0.5">
            Couldn&rsquo;t load WQA aggregate.
          </div>
          <div className="font-mono text-[11px]">{wqaError}</div>
        </div>
      )}

      {!wqa || wqa.rows.length === 0 ? (
        <EmptyState primaryDomain={primaryDomain} />
      ) : (
        <>
          <ModeSwitcher mode={mode} onChange={setMode} />
          {mode === "triage" ? (
            <WqaTabs
              propertySlug={propertySlug}
              propertyId={propertyId}
              primaryDomain={primaryDomain}
              rows={wqa.rows}
              summary={wqa.summary}
              projectId={wqa.projectId}
              version={wqa.version}
              dataset={wqa.dataset}
              message={wqa.message}
              decisions={decisions}
              executions={executions}
              checkStates={checkStates}
            />
          ) : (
            <AuditModeShell
              propertySlug={propertySlug}
              propertyId={propertyId}
              primaryDomain={primaryDomain}
              rows={wqa.rows}
              summary={wqa.summary}
              decisions={decisions}
              executions={executions}
              checkStates={checkStates}
            />
          )}
        </>
      )}
    </div>
  );
}

function ModeSwitcher({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (next: Mode) => void;
}) {
  return (
    <div className="mb-5 inline-flex items-center gap-1 p-1 rounded-lg bg-muted/60 border">
      <ModePill active={mode === "triage"} onClick={() => onChange("triage")}>
        Triage
      </ModePill>
      <ModePill active={mode === "audit"} onClick={() => onChange("audit")}>
        Technical Audit
      </ModePill>
    </div>
  );
}

function ModePill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[12px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-md transition-colors ${
        active
          ? "bg-foreground text-background shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({ primaryDomain }: { primaryDomain: string | null }) {
  if (!primaryDomain) {
    return (
      <div className="border border-dashed rounded-lg bg-muted/30 p-8 text-center">
        <p className="text-sm font-medium text-foreground">
          No primary_domain set on this property.
        </p>
        <p className="text-[12px] text-muted-foreground mt-2">
          Add one in Supabase to enable the Pages view.
        </p>
      </div>
    );
  }
  return (
    <div className="border border-dashed rounded-lg bg-muted/30 p-8 text-center">
      <p className="text-sm font-medium text-foreground">
        No WQA run for this property yet.
      </p>
      <p className="text-[12px] text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">
        Run a WQA from the CLI:
      </p>
      <pre className="mt-3 text-[11px] font-mono bg-card border rounded p-2 inline-block">
        uv run wqa --domain {primaryDomain}
      </pre>
      <p className="text-[11px] text-muted-foreground mt-3">
        Output lands in BigQuery; this view populates on next page load.
      </p>
    </div>
  );
}
