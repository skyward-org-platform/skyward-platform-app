"use client";

// Phase 6 Tracking · Ahrefs scorecard strip. Four sparkline tiles
// (DR / referring domains / organic keywords / organic traffic)
// driven by site-scope ahrefs-source metric_snapshot rows. Hosts the
// in-app "Run Ahrefs refresh" button which calls refreshAhrefsMetrics.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AhrefsMetricSnapshot } from "@/lib/tracking";
import { refreshAhrefsMetrics } from "@/app/properties/[slug]/tracking/actions";

type MetricKey =
  | "domain_rating"
  | "referring_domains"
  | "organic_keywords"
  | "organic_traffic";

const TILES: {
  key: MetricKey;
  label: string;
  format: "int" | "decimal1";
}[] = [
  { key: "domain_rating", label: "Domain Rating", format: "decimal1" },
  { key: "referring_domains", label: "Referring Domains", format: "int" },
  { key: "organic_keywords", label: "Organic Keywords", format: "int" },
  { key: "organic_traffic", label: "Organic Traffic", format: "int" },
];

export function AhrefsScorecards({
  propertySlug,
  snapshots,
}: {
  propertySlug: string;
  snapshots: AhrefsMetricSnapshot[];
}) {
  // Snapshots arrive captured_date DESC. For sparkline + delta we need
  // ascending order over the last 12 entries.
  const ordered = [...snapshots].sort((a, b) =>
    a.captured_date.localeCompare(b.captured_date),
  );

  if (ordered.length === 0) {
    return (
      <AhrefsEmptyState propertySlug={propertySlug} />
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Ahrefs · last {ordered.length} snapshots
        </div>
        <AhrefsRefreshButton propertySlug={propertySlug} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {TILES.map((t) => (
          <ScorecardTile
            key={t.key}
            label={t.label}
            ordered={ordered}
            metricKey={t.key}
            format={t.format}
          />
        ))}
      </div>
    </section>
  );
}

// ── individual tile ────────────────────────────────────────────────────

function ScorecardTile({
  label,
  ordered,
  metricKey,
  format,
}: {
  label: string;
  ordered: AhrefsMetricSnapshot[];
  metricKey: MetricKey;
  format: "int" | "decimal1";
}) {
  const series = ordered.map((s) => ({
    date: s.captured_date,
    value: s[metricKey] as number | null,
  }));
  const nonNull = series.filter((p) => typeof p.value === "number") as {
    date: string;
    value: number;
  }[];

  const current = nonNull.length > 0 ? nonNull[nonNull.length - 1].value : null;
  const earliest = nonNull.length > 0 ? nonNull[0].value : null;

  let delta = "—";
  let direction: "up" | "down" | "flat" = "flat";
  if (current !== null && earliest !== null && earliest !== 0) {
    const pct = ((current - earliest) / earliest) * 100;
    direction = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
    delta = `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`;
  } else if (current !== null && earliest !== null && earliest === 0 && current > 0) {
    direction = "up";
    delta = "+∞";
  }

  const valueText =
    current === null
      ? "—"
      : format === "decimal1"
        ? current.toFixed(1)
        : Math.round(current).toLocaleString();

  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </div>
      <div className="text-3xl font-semibold tabular-nums mt-1">{valueText}</div>
      <div className="mt-2">
        <ScorecardSparkline series={series} />
      </div>
      <div
        className={`text-xs mt-1 tabular-nums ${
          direction === "up"
            ? "text-emerald-600"
            : direction === "down"
              ? "text-rose-600"
              : "text-muted-foreground"
        }`}
      >
        {delta}
        <span className="text-muted-foreground/70 font-normal ml-1">
          vs {nonNull.length > 0 ? nonNull[0].date : "—"}
        </span>
      </div>
    </div>
  );
}

// ── sparkline (specialized for AhrefsMetricSnapshot, mirrors Sparkline.tsx) ──

function ScorecardSparkline({
  series,
}: {
  series: { date: string; value: number | null }[];
}) {
  const W = 120;
  const H = 28;
  const values = series
    .map((p) => p.value)
    .filter((v): v is number => typeof v === "number");
  if (values.length < 2) {
    return (
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} className="block">
        <line
          x1={2}
          y1={H / 2}
          x2={W - 2}
          y2={H / 2}
          stroke="#e2e8f0"
          strokeDasharray="2 2"
          strokeWidth={1}
        />
      </svg>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1e-6, max - min);
  // Index points across full series so date gaps still render at the right
  // x position (sparse months still look right).
  const xs = series.map(
    (_, i) => 2 + (i * (W - 4)) / Math.max(1, series.length - 1),
  );
  const points = series.map((p, i) =>
    typeof p.value === "number"
      ? { x: xs[i], y: 2 + (1 - (p.value - min) / range) * (H - 4) }
      : null,
  );

  // Build a path that breaks across null segments.
  let path = "";
  let pendingMove = true;
  for (const p of points) {
    if (p === null) {
      pendingMove = true;
      continue;
    }
    path += pendingMove ? `M ${p.x} ${p.y} ` : `L ${p.x} ${p.y} `;
    pendingMove = false;
  }

  // Final marker dot for the most recent non-null sample.
  let lastDot: { x: number; y: number } | null = null;
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    if (p) {
      lastDot = p;
      break;
    }
  }

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} className="block">
      <path d={path.trim()} fill="none" stroke="#18181b" strokeWidth={1.25} />
      {lastDot && (
        <circle
          cx={lastDot.x}
          cy={lastDot.y}
          r={2}
          fill="#18181b"
        />
      )}
    </svg>
  );
}

// ── refresh button ─────────────────────────────────────────────────────

function AhrefsRefreshButton({ propertySlug }: { propertySlug: string }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  function trigger() {
    if (!confirm("Pull a fresh Ahrefs snapshot (uses a few API units). Continue?")) {
      return;
    }
    setMsg(null);
    startTransition(async () => {
      const res = await refreshAhrefsMetrics(propertySlug);
      if (!res.ok) {
        setMsg(`Error: ${res.error}`);
        return;
      }
      setMsg(
        `Captured ${res.snapshotDate} · DR ${res.drCurrent ?? "—"} · ` +
          `RDs ${res.rdsCurrent ?? "—"} · kws ${res.kwsCurrent ?? "—"} · ` +
          `traffic ${res.trafficCurrent ?? "—"} (${res.units} units)`,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {msg && (
        <span
          className={`text-[10px] ${
            msg.startsWith("Error")
              ? "text-rose-600"
              : "text-muted-foreground"
          }`}
        >
          {msg}
        </span>
      )}
      <button
        type="button"
        onClick={trigger}
        disabled={pending}
        className="text-[11px] font-medium border border-foreground/80 text-foreground rounded px-2.5 py-1 hover:bg-foreground hover:text-background transition-colors disabled:opacity-50"
      >
        {pending ? "Refreshing…" : "Run Ahrefs refresh"}
      </button>
    </div>
  );
}

// ── empty state ────────────────────────────────────────────────────────

function AhrefsEmptyState({ propertySlug }: { propertySlug: string }) {
  return (
    <section className="border rounded-lg bg-card p-6 space-y-3 text-center">
      <div className="text-sm font-medium">No Ahrefs metrics ingested yet.</div>
      <div className="text-xs text-muted-foreground max-w-md mx-auto">
        Run the manual refresh to capture today&apos;s Domain Rating, referring
        domains, organic keywords, and organic traffic. Historical backfill
        runs from the Python ingest script.
      </div>
      <div className="flex items-center justify-center">
        <AhrefsRefreshButton propertySlug={propertySlug} />
      </div>
    </section>
  );
}
