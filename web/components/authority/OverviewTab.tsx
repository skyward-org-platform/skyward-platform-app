"use client";

// Overview tab: refresh control + stat tiles + alerts + recent
// quality acquisitions + DFS Rank trend SVG.
//
// IMPORTANT — DFS Rank vs Ahrefs DR:
//   The `domain_rating` column stores DataForSEO's `rank` field (0-1000
//   scale). It is NOT the 0-100 Ahrefs DR. Tile + chart labels show
//   "DFS Rank" with a "DataForSEO, 0-1000" hint to avoid misreading.
//   The dr_drop alert keeps "DFS Rank dropped" in its title.

import type { AuthorityViewProps } from "./AuthorityView";
import type { Alert } from "@/lib/authority";
import { RefreshButton } from "./RefreshButton";
import { DrTrendChart } from "./DrTrendChart";

function pctDelta(current: number | null, baseline: number | null): string {
  if (current == null || baseline == null || baseline === 0) return "—";
  const d = ((current - baseline) / baseline) * 100;
  const sign = d > 0 ? "+" : "";
  return `${sign}${d.toFixed(0)}%`;
}

function absDelta(current: number | null, baseline: number | null): string {
  if (current == null || baseline == null) return "—";
  const d = current - baseline;
  return d > 0 ? `+${d}` : String(d);
}

export function OverviewTab(props: AuthorityViewProps) {
  const latest = props.snapshots[0];
  // Baseline = oldest snapshot within last 90 days, or oldest of all.
  const baselineCutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const baseline =
    props.snapshots
      .slice()
      .reverse()
      .find((s) => Date.parse(s.snapshotted_at) >= baselineCutoff) ??
    props.snapshots[props.snapshots.length - 1];

  const lastRefreshLabel = latest
    ? new Date(latest.snapshotted_at).toLocaleString()
    : "never";

  const recentQuality = props.refDomains
    .filter((r) => r.quality === "Quality" && r.first_seen)
    .sort(
      (a, b) => Date.parse(b.first_seen!) - Date.parse(a.first_seen!),
    )
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <RefreshButton slug={props.propertySlug} />
        <span className="text-xs text-muted-foreground">
          Last refresh: {lastRefreshLabel}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile
          label="DFS Rank"
          hint="DataForSEO, 0-1000"
          value={latest?.domain_rating?.toFixed(0) ?? "—"}
          delta={absDelta(
            latest?.domain_rating ?? null,
            baseline?.domain_rating ?? null,
          )}
        />
        <Tile
          label="Ref Domains"
          value={latest?.live_refdomains?.toLocaleString() ?? "—"}
          delta={absDelta(
            latest?.live_refdomains ?? null,
            baseline?.live_refdomains ?? null,
          )}
        />
        <Tile
          label="Org Traffic (mo)"
          value={latest?.organic_traffic?.toLocaleString() ?? "—"}
          delta={pctDelta(
            latest?.organic_traffic ?? null,
            baseline?.organic_traffic ?? null,
          )}
        />
        <Tile
          label="Org Value (USD/mo)"
          value={
            latest?.organic_value_cents != null
              ? `$${(latest.organic_value_cents / 100).toFixed(0)}`
              : "—"
          }
          delta={pctDelta(
            latest?.organic_value_cents ?? null,
            baseline?.organic_value_cents ?? null,
          )}
        />
      </div>

      {props.alerts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {props.alerts.map((a, i) => (
            <AlertCard key={i} alert={a} />
          ))}
        </div>
      )}

      <div className="border rounded-lg overflow-hidden bg-card">
        <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold bg-muted">
          Recent quality acquisitions
        </div>
        {recentQuality.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground">
            No quality-classified ref domains yet.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-1.5 font-semibold">Domain</th>
                <th className="text-left px-3 py-1.5 font-semibold">DFS Rank</th>
                <th className="text-left px-3 py-1.5 font-semibold">Traffic</th>
                <th className="text-left px-3 py-1.5 font-semibold">First seen</th>
              </tr>
            </thead>
            <tbody>
              {recentQuality.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-1.5 font-mono">{r.domain}</td>
                  <td className="px-3 py-1.5 tabular-nums">
                    {r.domain_rating?.toFixed(0) ?? "—"}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">
                    {r.traffic_domain?.toLocaleString() ?? "—"}
                  </td>
                  <td className="px-3 py-1.5">
                    {r.first_seen
                      ? new Date(r.first_seen).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
          DFS Rank trend (last 90 days)
        </div>
        <DrTrendChart snapshots={props.snapshots} />
      </div>
    </div>
  );
}

function Tile({
  label,
  hint,
  value,
  delta,
}: {
  label: string;
  hint?: string;
  value: string;
  delta: string;
}) {
  const up = delta.startsWith("+");
  const down = delta.startsWith("-");
  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </div>
      <div className="text-3xl font-semibold tabular-nums mt-1">{value}</div>
      <div
        className={`text-xs mt-1 tabular-nums ${
          up
            ? "text-emerald-600"
            : down
              ? "text-rose-600"
              : "text-muted-foreground"
        }`}
      >
        {delta}
      </div>
      {hint && (
        <div className="text-[10px] text-muted-foreground mt-1">{hint}</div>
      )}
    </div>
  );
}

function AlertCard({ alert }: { alert: Alert }) {
  const bgClass = {
    rose: "bg-rose-50 border-rose-200 text-rose-900",
    amber: "bg-amber-50 border-amber-200 text-amber-900",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-900",
  }[alert.severity];

  let title = "";
  let body = "";
  if (alert.kind === "spam_wave") {
    title = "Spam wave detected";
    body = `${alert.count} new spam refdomains in last 14 days${
      alert.sample_pattern ? `. Pattern: ${alert.sample_pattern}` : ""
    }.`;
  } else if (alert.kind === "stale_disavow") {
    title = "Disavow file is stale";
    body = `${alert.pending_count} pending disavow entries${
      alert.last_in_file_days
        ? ` (oldest pending ${alert.last_in_file_days}d)`
        : ""
    }. Update the .txt file.`;
  } else if (alert.kind === "dr_drop") {
    title = "DFS Rank dropped";
    body = `From ${alert.from.toFixed(0)} to ${alert.to.toFixed(0)} over ${alert.days} days.`;
  } else if (alert.kind === "quality_acquisitions") {
    title = "New quality acquisitions";
    body = `${alert.count} new in last 30 days. Top: ${alert.top_examples.join(", ")}.`;
  }
  return (
    <div className={`border rounded-lg p-3 text-xs ${bgClass}`}>
      <div className="font-semibold">{title}</div>
      <div className="mt-1">{body}</div>
    </div>
  );
}
