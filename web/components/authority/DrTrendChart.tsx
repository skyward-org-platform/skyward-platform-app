"use client";

// Inline SVG line chart of DFS Rank over snapshot history. No library —
// the data shape is small (≤100 points) and we only need a single
// path + dots. Snapshots arrive newest-first; we reverse for a
// left-to-right time axis.

import type { SiteSnapshot } from "@/lib/authority";

export function DrTrendChart({ snapshots }: { snapshots: SiteSnapshot[] }) {
  const series = [...snapshots]
    .reverse()
    .filter((s) => s.domain_rating != null);
  if (series.length < 2) {
    return (
      <div className="text-xs text-muted-foreground border rounded p-3 bg-muted/30">
        Need at least 2 snapshots for a trend chart.
      </div>
    );
  }
  const W = 600;
  const H = 120;
  const P = 20;
  const xs = series.map(
    (_, i) => P + (i * (W - 2 * P)) / (series.length - 1),
  );
  const drs = series.map((s) => s.domain_rating as number);
  const minDR = Math.min(...drs);
  const maxDR = Math.max(...drs);
  const range = Math.max(1, maxDR - minDR);
  const ys = drs.map(
    (dr) => H - P - ((dr - minDR) * (H - 2 * P)) / range,
  );
  const path = xs
    .map((x, i) => (i === 0 ? `M ${x} ${ys[i]}` : `L ${x} ${ys[i]}`))
    .join(" ");

  return (
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="border rounded bg-card"
    >
      <path d={path} fill="none" stroke="#18181b" strokeWidth={1.5} />
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r={2} fill="#18181b" />
      ))}
      <text x={P} y={P - 4} fontSize={10} fill="#64748b">
        DFS Rank {minDR.toFixed(0)} – {maxDR.toFixed(0)}
      </text>
      <text x={W - P - 80} y={P - 4} fontSize={10} fill="#64748b">
        {series.length} snapshots
      </text>
    </svg>
  );
}
