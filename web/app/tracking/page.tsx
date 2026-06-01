// /tracking — portfolio rollup across every property in the property
// table. Same data source as /properties/[slug]/tracking (metric_snapshot
// source='ahrefs', scope='site', scope_id IS NULL), oriented for
// side-by-side comparison instead of single-property drill-down.
//
// Server component. The one client island is the sortable table below.

import {
  getTrackingPortfolioSummary,
  type TrackingPortfolioRow,
} from "@/lib/tracking";
import { TrackingPortfolioTable } from "@/components/tracking/TrackingPortfolioTable";

function fmtN(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return v.toLocaleString();
}

function fmtDr(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return v.toFixed(1);
}

function computeRollups(rows: TrackingPortfolioRow[]) {
  let totalTraffic = 0;
  let totalTrafficHas = false;
  let totalKws = 0;
  let totalKwsHas = false;
  let drSum = 0;
  let drDen = 0;
  let refreshedThisWeek = 0;
  const weekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const r of rows) {
    if (typeof r.traffic_current === "number") {
      totalTraffic += r.traffic_current;
      totalTrafficHas = true;
    }
    if (typeof r.kws_current === "number") {
      totalKws += r.kws_current;
      totalKwsHas = true;
    }
    if (typeof r.dr_current === "number") {
      drSum += r.dr_current;
      drDen += 1;
    }
    if (
      r.last_snapshot_date &&
      Date.parse(r.last_snapshot_date) >= weekAgoMs
    ) {
      refreshedThisWeek += 1;
    }
  }

  return {
    totalTraffic: totalTrafficHas ? totalTraffic : null,
    totalKws: totalKwsHas ? totalKws : null,
    avgDr: drDen > 0 ? drSum / drDen : null,
    refreshedThisWeek,
    propertiesTotal: rows.length,
  };
}

export default async function TrackingPortfolioPage() {
  const rows = await getTrackingPortfolioSummary();
  const rollups = computeRollups(rows);

  return (
    <div className="p-4 sm:p-8 max-w-[1400px]">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Tracking · Portfolio
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Side-by-side Phase 6 tracking snapshot across every property.
          Pulls the latest Ahrefs site-scope metric snapshot per site plus
          the 30-day delta. Click any property to open its full Tracking
          surface.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <RollupTile
          label="Total organic traffic"
          value={fmtN(rollups.totalTraffic)}
          sub={`${rollups.propertiesTotal} ${
            rollups.propertiesTotal === 1 ? "property" : "properties"
          }`}
        />
        <RollupTile
          label="Total organic keywords"
          value={fmtN(rollups.totalKws)}
          sub="sum of latest snapshots"
        />
        <RollupTile
          label="Average DR"
          value={fmtDr(rollups.avgDr)}
          sub="across properties with snapshots"
        />
        <RollupTile
          label="Refreshed this week"
          value={rollups.refreshedThisWeek.toLocaleString()}
          sub={`of ${rollups.propertiesTotal}`}
          accent={
            rollups.refreshedThisWeek === 0
              ? "muted"
              : rollups.refreshedThisWeek < rollups.propertiesTotal
                ? "amber"
                : "emerald"
          }
        />
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed rounded-lg bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          No properties in the property table yet.
        </div>
      ) : (
        <TrackingPortfolioTable rows={rows} />
      )}
    </div>
  );
}

function RollupTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "emerald" | "amber" | "rose" | "muted";
}) {
  const accentCls =
    accent === "emerald"
      ? "text-emerald-700"
      : accent === "amber"
        ? "text-amber-700"
        : accent === "rose"
          ? "text-rose-700"
          : accent === "muted"
            ? "text-muted-foreground"
            : "";
  return (
    <div className="border rounded-lg bg-card p-4">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {label}
      </div>
      <div
        className={`text-2xl font-semibold tabular-nums mt-1 ${accentCls}`}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
          {sub}
        </div>
      )}
    </div>
  );
}
