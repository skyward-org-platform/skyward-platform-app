"use client";

// Read-only viewer for skyward-seo-pipeline's wqa_output aggregate.
// Sourced from /api/wqa/pages → BigQuery (SEOPipelineDev.wqa_output in dev).
// Shown as a sibling view on the Pages tab via the PagesView wrapper; the
// existing triage UI stays untouched.
//
// Phase B scope: pure viewer. Sorting + sticky header + URL search. No
// audit-chip integration — that lands in Phase C when WQA drives triage.

import { useMemo, useState } from "react";
import type { WqaRow, WqaSiteSummary } from "@/lib/wqa";
import {
  ACTION_TINT,
  TRIAGE_ACTIONS,
  triageRow,
  type TriageAction,
} from "@/lib/wqa-triage";

type SortKey =
  | "sessions"
  | "average_impressions"
  | "best_tv_kw_rank"
  | "best_sv_kw_rank"
  | "backlinks"
  | "referring_domains"
  | "inlinks"
  | "word_count"
  | "page_depth";

const SORT_LABEL: Record<SortKey, string> = {
  sessions: "Sessions",
  average_impressions: "Impressions",
  best_tv_kw_rank: "Best TV rank",
  best_sv_kw_rank: "Best SV rank",
  backlinks: "Backlinks",
  referring_domains: "Refdomains",
  inlinks: "Inlinks",
  word_count: "Words",
  page_depth: "Depth",
};

const HEALTH_TINT = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  red: "bg-rose-50 text-rose-700 border-rose-200",
  gray: "bg-slate-50 text-slate-700 border-slate-200",
  neutral: "bg-muted text-muted-foreground border",
} as const;

type HealthZone = keyof typeof HEALTH_TINT;

/** Health-zone derivation from the WQA SOP section 2.2 / agentic-workflow
 *  step ②. Green = indexed + has impressions + has inlinks ≥ 2; Red =
 *  indexable but zero impressions AND zero sessions; Gray = some
 *  impressions but inlinks < 2. */
function healthZoneOf(r: WqaRow): HealthZone {
  const indexable =
    (r.indexability ?? "").toLowerCase().includes("indexable") &&
    !(r.indexability ?? "").toLowerCase().includes("non");
  const impressions = r.average_impressions ?? 0;
  const sessions = r.sessions ?? 0;
  const inlinks = r.inlinks ?? 0;
  if (indexable && impressions > 0 && inlinks >= 2) return "green";
  if (indexable && impressions === 0 && sessions === 0) return "red";
  if (impressions > 0 && inlinks < 2) return "gray";
  return "neutral";
}

export function WqaDataView({
  rows,
  summary,
  projectId,
  version,
  dataset,
  message,
  onOpenDrawer,
}: {
  rows: WqaRow[];
  summary: WqaSiteSummary | null;
  projectId: number | null;
  version: number | null;
  dataset: string;
  message?: string;
  /** Optional — when provided, clicking a URL row opens the URL drawer
   *  at the WqaTabs level. Wired through Body in WqaTabs. */
  onOpenDrawer?: (url: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("sessions");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [query, setQuery] = useState("");
  const [healthFilter, setHealthFilter] = useState<HealthZone | "all">("all");
  const [actionFilter, setActionFilter] = useState<TriageAction | "all">("all");

  // Compute triage once + cache against the row object.
  const triaged = useMemo(
    () => rows.map((r) => ({ row: r, triage: triageRow(r) })),
    [rows],
  );

  // Aggregate health-zone counts once.
  const healthCounts = useMemo(() => {
    const counts: Record<HealthZone, number> = {
      green: 0,
      red: 0,
      gray: 0,
      neutral: 0,
    };
    for (const r of rows) counts[healthZoneOf(r)] += 1;
    return counts;
  }, [rows]);

  // Aggregate action counts.
  const actionCounts = useMemo(() => {
    const counts: Record<TriageAction, number> = {
      Optimize: 0,
      Restore: 0,
      Redirect: 0,
      Consolidate: 0,
      Remove: 0,
      Evaluate: 0,
      "Leave as 404": 0,
      "Non-addressable": 0,
      "Non-indexable": 0,
      Investigate: 0,
    };
    for (const { triage } of triaged) counts[triage.action] += 1;
    return counts;
  }, [triaged]);

  // Filter + sort.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = triaged.filter(({ row: r, triage }) => {
      if (actionFilter !== "all" && triage.action !== actionFilter) return false;
      if (healthFilter !== "all" && healthZoneOf(r) !== healthFilter) return false;
      if (!q) return true;
      return (
        (r.url ?? "").toLowerCase().includes(q) ||
        (r.current_title ?? "").toLowerCase().includes(q) ||
        (r.best_tv_keyword ?? "").toLowerCase().includes(q) ||
        (r.best_sv_keyword ?? "").toLowerCase().includes(q) ||
        triage.logic.toLowerCase().includes(q)
      );
    });
    return filtered.slice().sort((a, b) => {
      const av = (a.row[sortKey] as number | null) ?? null;
      const bv = (b.row[sortKey] as number | null) ?? null;
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [triaged, sortKey, sortDir, query, healthFilter, actionFilter]);

  if (rows.length === 0) {
    return <EmptyState dataset={dataset} message={message} />;
  }

  return (
    <div>
      {/* Site summary band */}
      {summary && (
        <SummaryBand
          summary={summary}
          health={healthCounts}
          activeHealth={healthFilter}
          onPickHealth={(h) =>
            setHealthFilter((curr) => (curr === h ? "all" : h))
          }
          projectId={projectId}
          version={version}
          dataset={dataset}
          shown={visible.length}
        />
      )}

      {/* Action funnel from SOP v5 decision tree. Click-to-filter. */}
      <ActionFunnel
        counts={actionCounts}
        active={actionFilter}
        onPick={(a) => setActionFilter((curr) => (curr === a ? "all" : a))}
      />

      {/* Sort + search controls */}
      <div className="border rounded-lg bg-card mt-4 overflow-hidden">
        <header className="px-4 py-2.5 border-b flex items-center gap-3 flex-wrap text-[11px]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search URL, title, keyword…"
            className="flex-1 min-w-[200px] text-[12px] px-2.5 py-1 border rounded-md bg-card outline-none focus:border-foreground/40 placeholder:text-muted-foreground"
          />
          <span className="text-muted-foreground">Sort by:</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="text-[11px] px-2 py-1 border rounded-md bg-card outline-none cursor-pointer"
          >
            {Object.entries(SORT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() =>
              setSortDir((d) => (d === "desc" ? "asc" : "desc"))
            }
            className="text-[11px] px-2 py-1 border rounded-md hover:bg-muted"
            title="Toggle sort direction"
          >
            {sortDir === "desc" ? "↓ desc" : "↑ asc"}
          </button>
          <span className="ml-auto text-muted-foreground tabular-nums">
            {visible.length} of {rows.length} rows
          </span>
        </header>

        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full text-[11.5px]">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur text-[10px] uppercase tracking-wider text-muted-foreground z-10">
              <tr>
                <th className="text-left px-3 py-2 font-medium w-[36px]">Zone</th>
                <th className="text-left px-2 py-2 font-medium min-w-[110px]">
                  Action
                </th>
                <th className="text-left px-3 py-2 font-medium min-w-[280px]">
                  URL
                </th>
                <th className="text-right px-2 py-2 font-medium">Status</th>
                <th className="text-left px-2 py-2 font-medium">Indexable</th>
                <th className="text-right px-2 py-2 font-medium">Sessions</th>
                <th className="text-right px-2 py-2 font-medium">Conv</th>
                <th className="text-right px-2 py-2 font-medium">Impr</th>
                <th className="text-right px-2 py-2 font-medium">CTR%</th>
                <th className="text-left px-2 py-2 font-medium min-w-[180px]">
                  Best keyword
                </th>
                <th className="text-right px-2 py-2 font-medium">Rank</th>
                <th className="text-right px-2 py-2 font-medium">BLs</th>
                <th className="text-right px-2 py-2 font-medium">RD</th>
                <th className="text-right px-2 py-2 font-medium">Inl</th>
                <th className="text-right px-2 py-2 font-medium">Words</th>
                <th className="text-right px-2 py-2 font-medium">Depth</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ row: r, triage }) => {
                const zone = healthZoneOf(r);
                const tint = ACTION_TINT[triage.action];
                return (
                  <tr
                    key={r.url}
                    className={`border-t hover:bg-muted/40 tabular-nums ${onOpenDrawer ? "cursor-pointer" : ""}`}
                    onClick={() => onOpenDrawer?.(r.url)}
                  >
                    <td className="px-3 py-1.5">
                      <span
                        className={`inline-block size-2 rounded-full ${
                          zone === "green"
                            ? "bg-emerald-500"
                            : zone === "red"
                              ? "bg-rose-500"
                              : zone === "gray"
                                ? "bg-slate-400"
                                : "bg-muted-foreground/30"
                        }`}
                        title={zoneLabel(zone)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${tint.band}`}
                        title={triage.logic}
                      >
                        <span
                          className={`size-1.5 rounded-full ${tint.dot}`}
                          aria-hidden
                        />
                        {triage.action}
                      </span>
                      {triage.tier && (
                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground/80 mt-0.5">
                          {triage.tier}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-1.5 max-w-0">
                      <div
                        className="font-mono text-[11px] truncate text-foreground"
                        title={r.url}
                      >
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {r.url}
                        </a>
                      </div>
                      {r.current_title && (
                        <div
                          className="text-[10.5px] text-muted-foreground truncate mt-0.5"
                          title={r.current_title}
                        >
                          {r.current_title}
                        </div>
                      )}
                      <div
                        className="text-[10px] text-muted-foreground/80 italic truncate mt-0.5"
                        title={triage.logic}
                      >
                        {triage.logic}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right text-muted-foreground">
                      {r.status_code ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground text-[10.5px]">
                      {abbreviateIndexability(r.indexability)}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {fmtN(r.sessions)}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {fmtN(r.conversions)}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {fmtN(r.average_impressions)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-muted-foreground">
                      {fmtPct(r.average_ctr)}
                    </td>
                    <td className="px-2 py-1.5 truncate max-w-0">
                      <div
                        className="truncate text-[11px]"
                        title={r.best_tv_keyword ?? ""}
                      >
                        {r.best_tv_keyword || r.best_sv_keyword || "—"}
                      </div>
                      {(r.best_tv_kw_sv || r.best_sv_kw_sv) && (
                        <div className="text-[10px] text-muted-foreground">
                          SV {fmtN(r.best_tv_kw_sv ?? r.best_sv_kw_sv)}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {fmtN(r.best_tv_kw_rank ?? r.best_sv_kw_rank)}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {fmtN(r.backlinks)}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {fmtN(r.referring_domains)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-muted-foreground">
                      {fmtN(r.inlinks)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-muted-foreground">
                      {fmtN(r.word_count)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-muted-foreground">
                      {fmtN(r.page_depth)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ActionFunnel({
  counts,
  active,
  onPick,
}: {
  counts: Record<TriageAction, number>;
  active: TriageAction | "all";
  onPick: (a: TriageAction) => void;
}) {
  const total = TRIAGE_ACTIONS.reduce((s, a) => s + counts[a], 0);
  if (total === 0) return null;
  return (
    <section className="border rounded-lg bg-card overflow-hidden mt-4">
      <header className="px-5 py-2 border-b text-[11px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-2">
        WQA triage funnel
        <span className="text-muted-foreground/70 normal-case tracking-normal">
          · auto-applied from SOP v5 § 5.2
        </span>
      </header>
      <div className="px-5 py-2.5 grid grid-cols-2 sm:grid-cols-5 gap-2">
        {TRIAGE_ACTIONS.filter((a) => counts[a] > 0).map((a) => {
          const tint = ACTION_TINT[a];
          const isActive = active === a;
          return (
            <button
              key={a}
              type="button"
              onClick={() => onPick(a)}
              className={`text-left border rounded-md px-2.5 py-1.5 transition-colors ${
                isActive
                  ? "bg-foreground text-background border-foreground"
                  : `${tint.band} border-transparent hover:border-foreground/30`
              }`}
            >
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold">
                <span className={`size-1.5 rounded-full ${tint.dot}`} />
                {a}
              </div>
              <div className="text-[18px] font-semibold tracking-tight tabular-nums leading-none mt-1">
                {counts[a].toLocaleString()}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SummaryBand({
  summary,
  health,
  activeHealth,
  onPickHealth,
  projectId,
  version,
  dataset,
  shown,
}: {
  summary: WqaSiteSummary;
  health: Record<HealthZone, number>;
  activeHealth: HealthZone | "all";
  onPickHealth: (h: HealthZone) => void;
  projectId: number | null;
  version: number | null;
  dataset: string;
  shown: number;
}) {
  return (
    <section className="border rounded-lg bg-card overflow-hidden">
      <header className="px-5 py-3 border-b flex items-baseline gap-4 flex-wrap">
        <h2 className="text-[13px] font-semibold tracking-tight">
          WQA aggregate
        </h2>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          project {projectId} · v{version} · {dataset}
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          From{" "}
          <code className="bg-muted px-1 rounded text-[10px]">
            skyward-seo-pipeline
          </code>{" "}
          / wqa_output
        </span>
      </header>
      <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-5 gap-3 text-[12px] tabular-nums">
        <Stat label="Total URLs" value={summary.total_urls} />
        <Stat label="Primary" value={summary.primary_urls} />
        <Stat label="In sitemap" value={summary.in_sitemap_urls} />
        <Stat
          label="200 OK"
          value={summary.status_code_distribution["200"] ?? 0}
        />
        <Stat label="Visible now" value={shown} />
      </div>
      <div className="px-5 py-2 border-t bg-muted/30 flex items-center gap-2 flex-wrap text-[11px]">
        <span className="uppercase tracking-wider text-muted-foreground font-semibold">
          Health zone
        </span>
        <HealthChip
          zone="green"
          count={health.green}
          active={activeHealth === "green"}
          onClick={() => onPickHealth("green")}
          label="Healthy"
        />
        <HealthChip
          zone="red"
          count={health.red}
          active={activeHealth === "red"}
          onClick={() => onPickHealth("red")}
          label="Indexable · no signals"
        />
        <HealthChip
          zone="gray"
          count={health.gray}
          active={activeHealth === "gray"}
          onClick={() => onPickHealth("gray")}
          label="Orphan-ish (low inlinks)"
        />
        <HealthChip
          zone="neutral"
          count={health.neutral}
          active={activeHealth === "neutral"}
          onClick={() => onPickHealth("neutral")}
          label="Other"
        />
      </div>
    </section>
  );
}

function HealthChip({
  zone,
  count,
  active,
  onClick,
  label,
}: {
  zone: HealthZone;
  count: number;
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-medium tabular-nums transition-colors ${
        active
          ? "bg-foreground text-background border-foreground"
          : HEALTH_TINT[zone]
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${
          zone === "green"
            ? "bg-emerald-500"
            : zone === "red"
              ? "bg-rose-500"
              : zone === "gray"
                ? "bg-slate-400"
                : "bg-muted-foreground/30"
        }`}
      />
      {label} · {count.toLocaleString()}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </div>
      <div className="text-[18px] font-semibold tracking-tight tabular-nums leading-none mt-0.5">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function EmptyState({
  dataset,
  message,
}: {
  dataset: string;
  message?: string;
}) {
  return (
    <div className="border border-dashed rounded-lg bg-muted/30 p-8 text-center">
      <p className="text-sm font-medium text-foreground">
        No WQA run for this property yet.
      </p>
      <p className="text-[12px] text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">
        {message ??
          `Nothing in ${dataset}.wqa_output for this domain. Run a WQA from the CLI:`}
      </p>
      <pre className="mt-3 text-[11px] font-mono bg-card border rounded p-2 inline-block">
        uv run wqa --domain &lt;this property&apos;s primary_domain&gt;
      </pre>
      <p className="text-[11px] text-muted-foreground mt-3">
        Output lands in BigQuery; this view will populate on next page load.
      </p>
    </div>
  );
}

function fmtN(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number" && Number.isFinite(v)) {
    return v.toLocaleString();
  }
  return "—";
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function abbreviateIndexability(idx: string | null): string {
  if (!idx) return "—";
  const lower = idx.toLowerCase();
  if (lower.includes("non-indexable") || lower.includes("not indexable"))
    return "no";
  if (lower.includes("indexable")) return "yes";
  return idx;
}

function zoneLabel(z: HealthZone): string {
  return z === "green"
    ? "Healthy (indexed + impressions + inlinks)"
    : z === "red"
      ? "Indexable but no signals"
      : z === "gray"
        ? "Has impressions but low inlinks"
        : "Other";
}
