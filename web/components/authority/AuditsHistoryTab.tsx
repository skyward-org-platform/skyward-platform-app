"use client";

// AuditsHistoryTab — history of link_audit rows. Each row captures an
// ingest / audit run with topline findings rendered from the jsonb column.
// Most recent first. Also surfaces a "Run audit" stub button.

import { useTransition } from "react";
import type { LinkAuditRow } from "@/lib/authority";
import { EmptyTab, TabHeader } from "@/components/wqa/helpers";
import { runLinkAudit } from "@/app/properties/[slug]/authority/actions";

export function AuditsHistoryTab({
  audits,
  propertySlug,
}: {
  audits: LinkAuditRow[];
  propertySlug: string;
}) {
  const [pending, startTransition] = useTransition();

  function onRun() {
    if (
      !confirm(
        "Record a link audit run? v1 is a stub (no Ahrefs ingest from server actions); use the Python ingest script for real data.",
      )
    )
      return;
    startTransition(async () => {
      const res = await runLinkAudit(propertySlug);
      if (!res.ok) {
        alert(`Audit run failed: ${res.error}`);
        return;
      }
      window.location.reload();
    });
  }

  return (
    <section>
      <TabHeader
        title="Audit history"
        subtitle={
          <>
            Each row is one link audit run (ingest, scheduled refresh, or
            manual capture). Topline findings render below the metrics.
          </>
        }
        count={audits.length}
        rightSlot={
          <button
            type="button"
            onClick={onRun}
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded border bg-foreground text-background disabled:opacity-50"
          >
            {pending ? "Running…" : "Run audit"}
          </button>
        }
      />

      {audits.length === 0 ? (
        <EmptyTab message="No audit runs recorded yet. Run the ingest script or click Run audit." />
      ) : (
        <div className="space-y-3">
          {audits.map((a) => (
            <AuditCard key={a.id} audit={a} />
          ))}
        </div>
      )}
    </section>
  );
}

function AuditCard({ audit }: { audit: LinkAuditRow }) {
  const toxicPct =
    audit.toxic_pct != null ? `${Number(audit.toxic_pct).toFixed(1)}%` : "—";
  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div>
          <div className="text-sm font-semibold">
            {new Date(audit.audited_at).toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            by {audit.audited_by ?? "unknown"} · cost{" "}
            {audit.ahrefs_cost_units ?? 0} units · {audit.duration_ms ?? 0} ms
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
        <Stat label="Live backlinks" value={audit.live_backlinks?.toLocaleString() ?? "—"} />
        <Stat label="Total RDs" value={audit.total_rds?.toLocaleString() ?? "—"} />
        <Stat label="Live RDs" value={audit.live_rds?.toLocaleString() ?? "—"} />
        <Stat label="Spam RDs" value={audit.spam_rds?.toLocaleString() ?? "—"} />
        <Stat label="Toxic %" value={toxicPct} />
      </div>

      {audit.topline_findings && (
        <div className="mt-3 border-t pt-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Topline findings
          </div>
          <ToplineFindings findings={audit.topline_findings} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </div>
      <div className="text-base font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function ToplineFindings({
  findings,
}: {
  findings: Record<string, unknown>;
}) {
  const keys = Object.keys(findings);
  if (keys.length === 0) {
    return <div className="text-xs text-muted-foreground">No findings recorded.</div>;
  }
  return (
    <dl className="text-xs grid grid-cols-1 sm:grid-cols-[minmax(140px,200px)_1fr] gap-x-3 gap-y-1.5">
      {keys.map((k) => {
        const v = findings[k];
        const rendered =
          typeof v === "string"
            ? v
            : typeof v === "number" || typeof v === "boolean"
              ? String(v)
              : JSON.stringify(v);
        return (
          <FindingsRow key={k} label={k} value={rendered} />
        );
      })}
    </dl>
  );
}

function FindingsRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="font-mono text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-[11.5px] whitespace-pre-wrap break-words">{value}</dd>
    </>
  );
}
