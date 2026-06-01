// /authority — portfolio rollup across every property in the property
// table. Same data sources as /properties/[slug]/authority (referring_domain,
// link_audit, disavow_entry, metric_snapshot source='ahrefs'), oriented
// for side-by-side comparison instead of single-property drill-down.
//
// Server component. The one client island is the sortable table below.

import {
  getAuthorityPortfolioSummary,
  type AuthorityPortfolioRow,
} from "@/lib/authority";
import { AuthorityPortfolioTable } from "@/components/authority/AuthorityPortfolioTable";

function fmtN(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return v.toLocaleString();
}

function fmtPct(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(1)}%`;
}

function computeRollups(rows: AuthorityPortfolioRow[]) {
  let totalRds = 0;
  let toxicSum = 0;
  let toxicDen = 0;
  let pending = 0;
  let auditedThisWeek = 0;
  const weekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const r of rows) {
    if (typeof r.live_rds === "number") totalRds += r.live_rds;
    if (r.toxic_pct !== null) {
      toxicSum += r.toxic_pct;
      toxicDen += 1;
    }
    pending += r.disavow_pending_count;
    if (r.last_audit_at && Date.parse(r.last_audit_at) >= weekAgoMs) {
      auditedThisWeek += 1;
    }
  }

  return {
    totalRds,
    avgToxic: toxicDen > 0 ? toxicSum / toxicDen : null,
    pending,
    auditedThisWeek,
    propertiesTotal: rows.length,
  };
}

export default async function AuthorityPortfolioPage() {
  const rows = await getAuthorityPortfolioSummary();
  const rollups = computeRollups(rows);

  return (
    <div className="p-4 sm:p-8 max-w-[1400px]">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Authority · Portfolio
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Side-by-side authority snapshot across every property. Pulls live
          Ahrefs metrics, referring-domain spam signals, pending disavow
          entries, and the most recent link audit per site. Click any property
          to open its full Authority surface.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <RollupTile
          label="Total live RDs"
          value={fmtN(rollups.totalRds)}
          sub={`${rollups.propertiesTotal} ${
            rollups.propertiesTotal === 1 ? "property" : "properties"
          }`}
        />
        <RollupTile
          label="Average toxic %"
          value={fmtPct(rollups.avgToxic)}
          sub="across properties with live RDs"
          accent={
            rollups.avgToxic === null
              ? "muted"
              : rollups.avgToxic < 10
                ? "emerald"
                : rollups.avgToxic <= 50
                  ? "amber"
                  : "rose"
          }
        />
        <RollupTile
          label="Disavow pending"
          value={rollups.pending.toLocaleString()}
          sub="entries awaiting upload"
          accent={
            rollups.pending === 0
              ? "muted"
              : rollups.pending <= 50
                ? "amber"
                : "rose"
          }
        />
        <RollupTile
          label="Audited this week"
          value={rollups.auditedThisWeek.toLocaleString()}
          sub={`of ${rollups.propertiesTotal}`}
        />
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed rounded-lg bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          No properties in the property table yet.
        </div>
      ) : (
        <AuthorityPortfolioTable rows={rows} />
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
