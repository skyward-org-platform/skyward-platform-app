"use client";

// Client-side sortable table for the /authority portfolio rollup. The
// page itself stays a server component; only the table needs interactive
// sort state. Default sort = Live RDs DESC.

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AuthorityPortfolioRow } from "@/lib/authority";
import { HeaderTip } from "@/components/wqa/helpers";

type SortKey =
  | "property_name"
  | "domain_rating"
  | "dr_delta_30d"
  | "live_rds"
  | "rds_delta_30d"
  | "organic_keywords"
  | "toxic_pct"
  | "spam_rds_count"
  | "disavow_pending_count"
  | "last_audit_at";

type SortDir = "asc" | "desc";

const COLUMNS: {
  key: SortKey;
  label: string;
  tip: string;
  right?: boolean;
}[] = [
  {
    key: "property_name",
    label: "Property",
    tip: "Click through to the per-property Authority surface.",
  },
  {
    key: "domain_rating",
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
    key: "live_rds",
    label: "Live RDs",
    tip: "Live referring domains from the latest Ahrefs site snapshot.",
    right: true,
  },
  {
    key: "rds_delta_30d",
    label: "ΔRDs",
    tip: "Change in live RDs vs the snapshot closest to 30 days ago.",
    right: true,
  },
  {
    key: "organic_keywords",
    label: "Org Keywords",
    tip: "Latest Ahrefs organic keyword count.",
    right: true,
  },
  {
    key: "toxic_pct",
    label: "Toxic %",
    tip: "Spam RDs divided by live RDs. Green <10%, amber 10 to 50%, rose >50%.",
    right: true,
  },
  {
    key: "spam_rds_count",
    label: "Spam RDs",
    tip: "Referring domains with a non-null spam_signal value.",
    right: true,
  },
  {
    key: "disavow_pending_count",
    label: "Disavow Pending",
    tip: "Disavow entries with status='pending'. Muted=0, amber 1 to 50, rose >50.",
    right: true,
  },
  {
    key: "last_audit_at",
    label: "Last Audit",
    tip: "Most recent link_audit row for the property.",
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

function fmtPct(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(1)}%`;
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

function toxicColor(v: number | null): string {
  if (v === null) return "text-muted-foreground";
  if (v < 10) return "text-emerald-700";
  if (v <= 50) return "text-amber-700";
  return "text-rose-700";
}

function disavowColor(v: number): string {
  if (v === 0) return "text-muted-foreground";
  if (v <= 50) return "text-amber-700";
  return "text-rose-700";
}

function fmtAudit(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1mo ago" : `${months}mo ago`;
}

export function AuthorityPortfolioTable({
  rows,
}: {
  rows: AuthorityPortfolioRow[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("live_rds");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      // Property name sort is alphabetical.
      if (sortKey === "property_name") {
        const sa = (va as string | null) ?? "";
        const sb = (vb as string | null) ?? "";
        return sortDir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
      }
      // Last audit sort treats nulls as oldest possible.
      if (sortKey === "last_audit_at") {
        const ta = va ? Date.parse(va as string) : -Infinity;
        const tb = vb ? Date.parse(vb as string) : -Infinity;
        return sortDir === "asc" ? ta - tb : tb - ta;
      }
      const na = typeof va === "number" && Number.isFinite(va) ? va : null;
      const nb = typeof vb === "number" && Number.isFinite(vb) ? vb : null;
      // Nulls always sink to the bottom regardless of direction so empty
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
      setSortDir(key === "property_name" ? "asc" : "desc");
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
            const inactive = r.property_status !== "active";
            return (
              <tr
                key={r.property_id}
                className={`border-t hover:bg-muted/30 ${
                  inactive ? "opacity-60" : ""
                }`}
              >
                <td className="px-3 py-2.5">
                  <Link
                    href={`/properties/${r.property_slug}/authority`}
                    className="font-medium hover:underline"
                  >
                    {r.property_name}
                  </Link>
                  {r.client_name && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {r.client_name}
                      {inactive && (
                        <span className="ml-1.5 text-[9px] uppercase tracking-wider text-muted-foreground/70">
                          · {r.property_status ?? "inactive"}
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {fmtDr(r.domain_rating)}
                </td>
                <td
                  className={`px-3 py-2.5 text-right tabular-nums ${deltaColor(
                    r.dr_delta_30d,
                  )}`}
                >
                  {fmtDelta(r.dr_delta_30d, { decimals: 1 })}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {fmtN(r.live_rds)}
                </td>
                <td
                  className={`px-3 py-2.5 text-right tabular-nums ${deltaColor(
                    r.rds_delta_30d,
                  )}`}
                >
                  {fmtDelta(r.rds_delta_30d)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {fmtN(r.organic_keywords)}
                </td>
                <td
                  className={`px-3 py-2.5 text-right tabular-nums font-medium ${toxicColor(
                    r.toxic_pct,
                  )}`}
                >
                  {fmtPct(r.toxic_pct)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {fmtN(r.spam_rds_count)}
                </td>
                <td
                  className={`px-3 py-2.5 text-right tabular-nums ${disavowColor(
                    r.disavow_pending_count,
                  )}`}
                >
                  {r.disavow_pending_count.toLocaleString()}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  {fmtAudit(r.last_audit_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
