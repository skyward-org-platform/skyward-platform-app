"use client";

// Pages tab — unified WQA view. No Triage/WQA Data toggle anymore; the
// WQA aggregate from BQ is the canonical source and the per-action tabs
// (Overview / Optimize / Redirect / Restore / Remove / Evaluate /
// Investigate / All URLs) live below the header.

import { WqaTabs } from "@/components/wqa/WqaTabs";
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
      )}
    </div>
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
