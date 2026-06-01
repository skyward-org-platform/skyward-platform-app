"use client";

// Client-side sortable table for the /tracking portfolio rollup. The
// page itself stays a server component; only the table needs interactive
// sort state. Default sort = Organic Traffic DESC.

import Link from "next/link";
import { useMemo, useState } from "react";
import type { TrackingPortfolioRow } from "@/lib/tracking";
import { HeaderTip } from "@/components/wqa/helpers";

type SortKey =
  | "name"
  | "dr_current"
  | "dr_delta_30d"
  | "kws_current"
  | "kws_delta_30d"
  | "traffic_current"
  | "traffic_delta_30d"
  | "rds_current"
  | "rds_delta_30d"
  | "last_snapshot_date"
  | "pipeline_phase";

type SortDir = "asc" | "desc";

const COLUMNS: {
  key: SortKey;
  label: string;
  tip: string;
  right?: boolean;
}[] = [
  {
    key: "name",
    label: "Property",
    tip: "Click through to the per-property Tracking surface.",
  },
  {
    key: "dr_current",
    label: "DR",
    tip: "Latest Ahrefs Domain Rating (site-scope, source=ahrefs).",
    right: true,
  },
  {
    key: "dr_delta_30d",
    label: "ΔDR",
    tip: "Change in DR vs the snapshot closest to 30 days ago.",
    right: true,
  },
  {
    key: "kws_current",
    label: "Org Keywords",
    tip: "Latest Ahrefs organic keyword count.",
    right: true,
  },
  {
    key: "kws_delta_30d",
    label: "ΔKws",
    tip: "Change in organic keywords vs the snapshot closest to 30 days ago.",
    right: true,
  },
  {
    key: "traffic_current",
    label: "Org Traffic",
    tip: "Latest Ahrefs estimated organic traffic.",
    right: true,
  },
  {
    key: "traffic_delta_30d",
    label: "ΔTraffic",
    tip: "Change in organic traffic vs the snapshot closest to 30 days ago.",
    right: true,
  },
  {
    key: "rds_current",
    label: "Ref Domains",
    tip: "Latest Ahrefs referring domain count.",
    right: true,
  },
  {
    key: "rds_delta_30d",
    label: "ΔRDs",
    tip: "Change in referring domains vs the snapshot closest to 30 days ago.",
    right: true,
  },
  {
    key: "last_snapshot_date",
    label: "Last Snapshot",
    tip: "Max(captured_date) for site-scope Ahrefs snapshots. Muted when >14 days old.",
    right: true,
  },
  {
    key: "pipeline_phase",
    label: "Phase",
    tip: "Current pipeline phase from the property table.",
    right: true,
  },
];

function fmtN(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toLocaleString();
}

function fmtDr(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return v.toFixed(1);
}

function fmtDelta(v: number | null, opts?: { decimals?: number }): string {
  if (v === null || !Number.isFinite(v)) return "no data";
  if (v === 0) return "0";
  const d = opts?.decimals ?? 0;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d })}`;
}

function deltaColor(v: number | null): string {
  if (v === null || v === 0) return "text-muted-foreground";
  return v > 0 ? "text-emerald-700" : "text-rose-700";
}

function fmtSnapshot(iso: string | null): {
  text: string;
  stale: boolean;
} {
  if (!iso) return { text: "never", stale: true };
  const d = Date.parse(iso);
  if (!Number.isFinite(d)) return { text: "never", stale: true };
  const days = Math.floor((Date.now() - d) / 86_400_000);
  const stale = days > 14;
  if (days <= 0) return { text: "today", stale };
  if (days === 1) return { text: "1d ago", stale };
  if (days < 30) return { text: `${days}d ago`, stale };
  const months = Math.floor(days / 30);
  return {
    text: months === 1 ? "1mo ago" : `${months}mo ago`,
    stale,
  };
}

export function TrackingPortfolioTable({
  rows,
}: {
  rows: TrackingPortfolioRow[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("traffic_current");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      // Property name sort is alphabetical.
      if (sortKey === "name") {
        const sa = (va as string | null) ?? "";
        const sb = (vb as string | null) ?? "";
        return sortDir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
      }
      // Last snapshot date sort treats nulls as oldest possible.
      if (sortKey === "last_snapshot_date") {
        const ta = va ? Date.parse(va as string) : -Infinity;
        const tb = vb ? Date.parse(vb as string) : -Infinity;
        return sortDir === "asc" ? ta - tb : tb - ta;
      }
      const na = typeof va === "number" && Number.isFinite(va) ? va : null;
      const nb = typeof vb === "number" && Number.isFinite(vb) ? vb : null;
      // Nulls sink to the bottom regardless of direction so empty
      // properties don't push real numbers off the leading edge.
      if (na === null && nb === null) return 0;
      if (na === null) return 1;
      if (nb === null) return -1;
      return sortDir === "asc" ? na - nb : nb - na;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function onHeaderClick(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Property name defaults ascending; everything else defaults descending.
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  return (
    <div className="border rounded-lg bg-card overflow-x-auto">
      <table className="w-full text-[12px] min-w-[1100px]">
        <thead className="bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            {COLUMNS.map((c) => {
              const active = c.key === sortKey;
              const arrow = active ? (sortDir === "asc" ? " ↑" : " ↓") : "";
              return (
                <th
                  key={c.key}
                  className={`${
                    c.right ? "text-right" : "text-left"
                  } px-3 py-2.5 font-medium select-none`}
                >
                  <button
                    type="button"
                    onClick={() => onHeaderClick(c.key)}
                    className={`inline-flex items-center gap-1 hover:text-foreground ${
                      active ? "text-foreground" : ""
                    }`}
                  >
                    <HeaderTip label={c.label} tip={c.tip} />
                    <span className="tabular-nums">{arrow}</span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const inactive = r.status !== "active";
            const snap = fmtSnapshot(r.last_snapshot_date);
            return (
              <tr
                key={r.property_id}
                className={`border-t hover:bg-muted/30 ${
                  inactive ? "opacity-60" : ""
                }`}
              >
                <td className="px-3 py-2.5">
                  <Link
                    href={`/properties/${r.slug}/tracking`}
                    className="font-medium hover:underline"
                  >
                    {r.name}
                  </Link>
                  {r.client_name && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {r.client_name}
                      {inactive && (
                        <span className="ml-1.5 text-[9px] uppercase tracking-wider text-muted-foreground/70">
                          · {r.status ?? "inactive"}
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {fmtDr(r.dr_current)}
                </td>
                <td
                  className={`px-3 py-2.5 text-right tabular-nums ${deltaColor(
                    r.dr_delta_30d,
                  )}`}
                >
                  {fmtDelta(r.dr_delta_30d, { decimals: 1 })}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {fmtN(r.kws_current)}
                </td>
                <td
                  className={`px-3 py-2.5 text-right tabular-nums ${deltaColor(
                    r.kws_delta_30d,
                  )}`}
                >
                  {fmtDelta(r.kws_delta_30d)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {fmtN(r.traffic_current)}
                </td>
                <td
                  className={`px-3 py-2.5 text-right tabular-nums ${deltaColor(
                    r.traffic_delta_30d,
                  )}`}
                >
                  {fmtDelta(r.traffic_delta_30d)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {fmtN(r.rds_current)}
                </td>
                <td
                  className={`px-3 py-2.5 text-right tabular-nums ${deltaColor(
                    r.rds_delta_30d,
                  )}`}
                >
                  {fmtDelta(r.rds_delta_30d)}
                </td>
                <td
                  className={`px-3 py-2.5 text-right tabular-nums ${
                    snap.stale ? "text-muted-foreground" : ""
                  }`}
                >
                  {snap.text}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  {r.pipeline_phase !== null ? `P${r.pipeline_phase}` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
