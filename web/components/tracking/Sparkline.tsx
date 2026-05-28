// Inline-SVG sparkline. Reads a metric off each daily snapshot, normalizes,
// draws a single path. Zero data -> empty placeholder.

import type { Snapshot } from "@/lib/tracking";

const W = 80;
const H = 24;

export function Sparkline({
  daily,
  metric,
  invert = false,
  stroke = "#18181b",
}: {
  daily: Snapshot[];
  metric: keyof Pick<
    Snapshot,
    "sessions" | "clicks" | "impressions" | "avg_position" | "conversions" | "revenue"
  >;
  invert?: boolean; // for position: lower is better, draw flipped
  stroke?: string;
}) {
  const series = daily
    .map((s) => s[metric])
    .map((v) => (typeof v === "number" ? v : null))
    .filter((v): v is number => v !== null);

  if (series.length < 2) {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block">
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
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = Math.max(1e-6, max - min);
  const xs = series.map(
    (_, i) => 2 + (i * (W - 4)) / (series.length - 1),
  );
  const ys = series.map((v) => {
    const norm = (v - min) / range;
    const flipped = invert ? norm : 1 - norm;
    return 2 + flipped * (H - 4);
  });
  const path = xs
    .map((x, i) => (i === 0 ? `M ${x} ${ys[i]}` : `L ${x} ${ys[i]}`))
    .join(" ");

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block">
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.25} />
    </svg>
  );
}
