// Site-scope tracking view. 4 headline tiles + 90-day sessions trend
// (inline SVG) with annotation markers + annotation log.
//
// All-empty handling: when no metric_snapshot rows exist, tiles render
// dashes and the chart panel becomes an explainer card. Annotations are
// still surfaced + creatable so operators can record events before
// ingestion is wired.

import {
  windowDeltas,
  avgPositionDeltas,
  type Snapshot,
  type Annotation,
} from "@/lib/tracking";
import { AnnotationBadge, annotationDotClass } from "./AnnotationBadge";
import { AddAnnotationForm } from "./AddAnnotationForm";
import { DeleteAnnotationButton } from "./DeleteAnnotationButton";

const DAYS = 90;
const TILE_WINDOW = 30;

export function SitewideView({
  propertySlug,
  snapshots,
  annotations,
}: {
  propertySlug: string;
  snapshots: Snapshot[];
  annotations: Annotation[];
}) {
  const hasData = snapshots.length > 0;

  return (
    <div className="space-y-6">
      {/* Headline tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <HeadlineTile
          label="Sessions"
          headline={windowDeltas(snapshots, TILE_WINDOW, "sessions")}
          format="int"
        />
        <HeadlineTile
          label="Clicks"
          headline={windowDeltas(snapshots, TILE_WINDOW, "clicks")}
          format="int"
        />
        <HeadlineTile
          label="Impressions"
          headline={windowDeltas(snapshots, TILE_WINDOW, "impressions")}
          format="int"
        />
        <HeadlineTile
          label="Avg position"
          headline={avgPositionDeltas(snapshots, TILE_WINDOW)}
          format="position"
        />
      </div>

      {/* 90-day chart */}
      <div className="border rounded-lg bg-card overflow-hidden">
        <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold bg-muted flex items-center justify-between">
          <span>Sessions · last {DAYS} days</span>
          <span className="text-muted-foreground/70 normal-case tracking-normal text-[10px] font-normal">
            {snapshots.length > 0
              ? `${snapshots.length} daily snapshots`
              : "No snapshots yet"}
          </span>
        </div>
        {hasData ? (
          <SessionsTrendChart snapshots={snapshots} annotations={annotations} />
        ) : (
          <EmptyChartState />
        )}
      </div>

      {/* Annotations */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Change annotations</h2>
          <AddAnnotationForm propertySlug={propertySlug} />
        </div>
        <AnnotationsTable propertySlug={propertySlug} annotations={annotations} />
      </div>
    </div>
  );
}

// ── headline tile ──────────────────────────────────────────────────────

function HeadlineTile({
  label,
  headline,
  format,
}: {
  label: string;
  headline: { current: number | null; prior: number | null };
  format: "int" | "position";
}) {
  const value =
    headline.current === null
      ? "—"
      : format === "position"
        ? headline.current.toFixed(1)
        : Math.round(headline.current).toLocaleString();

  let delta = "—";
  let direction: "up" | "down" | "flat" = "flat";
  if (headline.current !== null && headline.prior !== null && headline.prior !== 0) {
    if (format === "position") {
      // Position: lower is better, invert the visual delta direction.
      const diff = headline.current - headline.prior;
      direction = diff < 0 ? "up" : diff > 0 ? "down" : "flat";
      delta = `${diff > 0 ? "+" : ""}${diff.toFixed(1)}`;
    } else {
      const pct = ((headline.current - headline.prior) / headline.prior) * 100;
      direction = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
      delta = `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`;
    }
  }

  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </div>
      <div className="text-3xl font-semibold tabular-nums mt-1">{value}</div>
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
          vs prior {TILE_WINDOW}d
        </span>
      </div>
    </div>
  );
}

// ── trend chart ────────────────────────────────────────────────────────

function SessionsTrendChart({
  snapshots,
  annotations,
}: {
  snapshots: Snapshot[];
  annotations: Annotation[];
}) {
  // Snapshots already arrive ascending by date. Build a continuous date
  // axis from earliest to today so annotations on days without snapshots
  // still land at the right x position.
  const W = 800;
  const H = 200;
  const P = 28;
  if (snapshots.length < 2) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Need at least 2 daily snapshots to render a trend.
      </div>
    );
  }
  const firstT = Date.parse(snapshots[0].captured_date);
  const lastT = Date.parse(snapshots[snapshots.length - 1].captured_date);
  const range = Math.max(1, lastT - firstT);
  const xFor = (iso: string): number => {
    const t = Date.parse(iso);
    return P + ((t - firstT) / range) * (W - 2 * P);
  };
  const sessions = snapshots.map((s) => s.sessions ?? 0);
  const maxY = Math.max(1, ...sessions);
  const yFor = (v: number): number => H - P - (v / maxY) * (H - 2 * P);

  // Build a line path.
  const points = snapshots.map((s) => ({
    x: xFor(s.captured_date),
    y: yFor(s.sessions ?? 0),
  }));
  const linePath = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(" ");
  // Area fill underneath.
  const areaPath =
    `M ${points[0].x} ${H - P} ` +
    points.map((p) => `L ${p.x} ${p.y}`).join(" ") +
    ` L ${points[points.length - 1].x} ${H - P} Z`;

  // Filter annotations to ones in chart range (and site-scoped — null URL).
  const chartAnnotations = annotations.filter((a) => {
    const t = Date.parse(a.occurred_at);
    return t >= firstT && t <= lastT;
  });

  return (
    <div className="p-3">
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block"
      >
        {/* y baseline */}
        <line
          x1={P}
          y1={H - P}
          x2={W - P}
          y2={H - P}
          stroke="#e2e8f0"
          strokeWidth={1}
        />
        {/* horizontal gridline at half */}
        <line
          x1={P}
          y1={yFor(maxY / 2)}
          x2={W - P}
          y2={yFor(maxY / 2)}
          stroke="#f1f5f9"
          strokeWidth={1}
          strokeDasharray="2 2"
        />
        <path d={areaPath} fill="#18181b" fillOpacity={0.05} />
        <path d={linePath} fill="none" stroke="#18181b" strokeWidth={1.5} />
        {/* annotation markers */}
        {chartAnnotations.map((a) => {
          const x = xFor(a.occurred_at);
          const dotClass = annotationDotClass(a.kind);
          return (
            <g key={a.id}>
              <line
                x1={x}
                y1={P}
                x2={x}
                y2={H - P}
                stroke="#94a3b8"
                strokeWidth={1}
                strokeDasharray="3 3"
                opacity={0.7}
              />
              <circle
                cx={x}
                cy={P + 6}
                r={5}
                className={dotClass}
                fill="currentColor"
                stroke="white"
                strokeWidth={1.5}
              >
                <title>{`${a.occurred_at} · ${a.kind}: ${a.title}`}</title>
              </circle>
            </g>
          );
        })}
        {/* axis labels */}
        <text x={P} y={H - 8} fontSize={10} fill="#64748b">
          {snapshots[0].captured_date}
        </text>
        <text x={W - P - 70} y={H - 8} fontSize={10} fill="#64748b">
          {snapshots[snapshots.length - 1].captured_date}
        </text>
        <text x={P} y={P - 10} fontSize={10} fill="#64748b">
          peak {maxY.toLocaleString()}
        </text>
      </svg>
    </div>
  );
}

function EmptyChartState() {
  return (
    <div className="p-8 text-center space-y-3">
      <div className="text-sm font-medium">No tracking data ingested yet.</div>
      <div className="text-xs text-muted-foreground max-w-md mx-auto">
        Once GA4, Search Console, and Ahrefs are wired up, daily sessions /
        clicks / impressions / avg position will appear here with annotations
        overlaid on the trend line. You can still record change annotations
        below so context is preserved for the day data lands.
      </div>
    </div>
  );
}

// ── annotation list ────────────────────────────────────────────────────

function AnnotationsTable({
  propertySlug,
  annotations,
}: {
  propertySlug: string;
  annotations: Annotation[];
}) {
  if (annotations.length === 0) {
    return (
      <div className="border rounded-lg p-6 text-center text-xs text-muted-foreground bg-card">
        No annotations recorded yet. Use the button above to log a publish,
        refresh, redirect, or other operator action that should be remembered
        when reviewing the trend.
      </div>
    );
  }
  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-3 py-2 font-semibold w-24">Date</th>
            <th className="text-left px-3 py-2 font-semibold w-32">Kind</th>
            <th className="text-left px-3 py-2 font-semibold">Title</th>
            <th className="text-left px-3 py-2 font-semibold">Applied to</th>
            <th className="text-left px-3 py-2 font-semibold w-24">By</th>
            <th className="text-right px-3 py-2 font-semibold w-20"></th>
          </tr>
        </thead>
        <tbody>
          {annotations.map((a) => (
            <tr key={a.id} className="border-t align-top">
              <td className="px-3 py-2 tabular-nums text-muted-foreground">
                {a.occurred_at}
              </td>
              <td className="px-3 py-2">
                <AnnotationBadge kind={a.kind} size="sm" />
              </td>
              <td className="px-3 py-2">
                <div className="font-medium">{a.title}</div>
                {a.body && (
                  <div className="text-muted-foreground mt-0.5 line-clamp-3">
                    {a.body}
                  </div>
                )}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {a.applied_to_url && (
                  <div className="font-mono truncate max-w-[220px]" title={a.applied_to_url}>
                    {a.applied_to_url}
                  </div>
                )}
                {a.applied_to_keyword && (
                  <div className="italic">{a.applied_to_keyword}</div>
                )}
                {!a.applied_to_url && !a.applied_to_keyword && (
                  <span className="text-muted-foreground/50">Site-wide</span>
                )}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {a.created_by ?? "—"}
              </td>
              <td className="px-3 py-2 text-right">
                <DeleteAnnotationButton
                  propertySlug={propertySlug}
                  annotationId={a.id}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
