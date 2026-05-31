"use client";

// AuditsHistoryTab — history of link_audit rows. Each row captures an
// ingest / audit run with topline findings rendered from the jsonb column.
// Most recent first. "Run audit" opens the same confirm modal the Overview
// tab uses.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LinkAuditRow } from "@/lib/authority";
import { EmptyTab, TabHeader } from "@/components/wqa/helpers";
import { runLinkAudit } from "@/app/properties/[slug]/authority/actions";
import { RunAuditModal } from "./RunAuditModal";

type Flash =
  | { kind: "ok"; message: string }
  | { kind: "err"; message: string }
  | null;

export function AuditsHistoryTab({
  audits,
  propertySlug,
  primaryDomain,
}: {
  audits: LinkAuditRow[];
  propertySlug: string;
  primaryDomain?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(t);
  }, [flash]);

  function handleRun(mode: "quick" | "full") {
    setModalOpen(false);
    startTransition(async () => {
      const res = await runLinkAudit(propertySlug, {
        mode,
        capUnits: mode === "full" ? 10000 : 3000,
      });
      if (!res.ok) {
        setFlash({ kind: "err", message: res.error });
        return;
      }
      const usd = (res.costUnits / 10000).toFixed(2);
      const toxicPct =
        res.liveRds > 0
          ? `${((res.spamRds / res.liveRds) * 100).toFixed(0)}%`
          : "—";
      const partialNote = res.partial ? " (partial — cap hit)" : "";
      setFlash({
        kind: "ok",
        message: `Audit complete${partialNote}: ${res.liveRds} RDs, ${toxicPct} toxic, ${res.disavowAutoFlagged} disavow flagged. Cost: ${res.costUnits.toLocaleString()} units (~$${usd}).`,
      });
      router.refresh();
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
            onClick={() => setModalOpen(true)}
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded border bg-foreground text-background disabled:opacity-50"
          >
            {pending ? "Running…" : "Run audit"}
          </button>
        }
      />

      {flash && (
        <div
          role="status"
          className={
            "text-xs border rounded-md px-3 py-2 mb-3 " +
            (flash.kind === "ok"
              ? "bg-emerald-50 border-emerald-300 text-emerald-900"
              : "bg-rose-50 border-rose-300 text-rose-900")
          }
        >
          {flash.message}
        </div>
      )}

      {audits.length === 0 ? (
        <EmptyTab message="No audit runs recorded yet. Click Run audit to pull from Ahrefs." />
      ) : (
        <div className="space-y-3">
          {audits.map((a) => (
            <AuditCard key={a.id} audit={a} />
          ))}
        </div>
      )}

      {modalOpen && (
        <RunAuditModal
          domain={primaryDomain ?? "(no primary_domain set)"}
          onCancel={() => setModalOpen(false)}
          onRun={handleRun}
          pending={pending}
        />
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
