"use client";

// Read-only viewer for skyward-seo-pipeline's wqa_output aggregate.
// Sourced from /api/wqa/pages → BigQuery (SEOPipelineDev.wqa_output in dev).
// Shown as a sibling view on the Pages tab via the PagesView wrapper; the
// existing triage UI stays untouched.
//
// Phase B scope: pure viewer. Sorting + sticky header + URL search. No
// audit-chip integration — that lands in Phase C when WQA drives triage.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { WqaRow, WqaSiteSummary } from "@/lib/wqa";
import {
  ACTION_TINT,
  TRIAGE_ACTIONS,
  triageRow,
  type TriageAction,
} from "@/lib/wqa-triage";
import {
  ACTION_COLOR,
  LOGIC_CODE_LABELS,
  toAction7,
  type Action7,
  type DecisionRow,
  type LogicCode,
  type WqaStatus,
} from "@/lib/wqa-decisions";
import { WqaActionChip } from "@/components/wqa/WqaActionChip";
import { WqaStatusChip } from "@/components/wqa/WqaStatusChip";
import { WqaLogicCell } from "@/components/wqa/WqaLogicCell";

const ACTION7_VALUES: Action7[] = [
  "Optimize",
  "Restore",
  "Redirect",
  "Consolidate",
  "Remove",
  "Keep",
  "Investigate",
];

// ─── Column config ────────────────────────────────────────────────────────
// All 18 columns rendered by the All URLs table. `url` is always on (it
// is the row identity). Everything else is toggleable via the Columns
// picker; visibility persists per-property in localStorage.

type ColumnId =
  | "zone"
  | "action"
  | "status"
  | "logic"
  | "url"
  | "http"
  | "indexable"
  | "sessions"
  | "conversions"
  | "impressions"
  | "ctr"
  | "bestKeyword"
  | "rank"
  | "backlinks"
  | "refdomains"
  | "inlinks"
  | "words"
  | "depth";

type ColumnDef = {
  id: ColumnId;
  label: string;
  /** When true the column cannot be hidden via the picker. */
  alwaysOn?: boolean;
};

const COLUMNS: ColumnDef[] = [
  { id: "zone", label: "Health zone" },
  { id: "action", label: "Action" },
  { id: "status", label: "Status" },
  { id: "logic", label: "Logic code" },
  { id: "url", label: "URL / title", alwaysOn: true },
  { id: "http", label: "HTTP status" },
  { id: "indexable", label: "Indexable" },
  { id: "sessions", label: "Sessions" },
  { id: "conversions", label: "Conversions" },
  { id: "impressions", label: "Impressions" },
  { id: "ctr", label: "CTR %" },
  { id: "bestKeyword", label: "Best keyword" },
  { id: "rank", label: "Rank" },
  { id: "backlinks", label: "Backlinks" },
  { id: "refdomains", label: "Refdomains" },
  { id: "inlinks", label: "Inlinks" },
  { id: "words", label: "Word count" },
  { id: "depth", label: "Page depth" },
];

const STATUS_VALUES: WqaStatus[] = ["Open", "In Progress", "Done", "Drifted"];

const LOGIC_CODE_VALUES = Object.keys(LOGIC_CODE_LABELS) as LogicCode[];

type OverrideFilter = "pipeline" | "operator";

// Tailwind class fragments per action color token. Mirrors the same
// palette as WqaActionChip but split into idle / active variants for the
// chip strip's toggle states.
const ACTION_CHIP_CLS: Record<
  Action7,
  { idle: string; active: string; dot: string }
> = {
  Optimize: {
    idle: "bg-sky-50 text-sky-700 border-sky-200",
    active: "bg-sky-600 text-white border-sky-600",
    dot: "bg-sky-500",
  },
  Restore: {
    idle: "bg-emerald-50 text-emerald-700 border-emerald-200",
    active: "bg-emerald-600 text-white border-emerald-600",
    dot: "bg-emerald-500",
  },
  Redirect: {
    idle: "bg-amber-50 text-amber-800 border-amber-200",
    active: "bg-amber-600 text-white border-amber-600",
    dot: "bg-amber-500",
  },
  Consolidate: {
    idle: "bg-violet-50 text-violet-700 border-violet-200",
    active: "bg-violet-600 text-white border-violet-600",
    dot: "bg-violet-500",
  },
  Remove: {
    idle: "bg-rose-50 text-rose-700 border-rose-200",
    active: "bg-rose-600 text-white border-rose-600",
    dot: "bg-rose-500",
  },
  Keep: {
    idle: "bg-slate-50 text-slate-700 border-slate-200",
    active: "bg-slate-700 text-white border-slate-700",
    dot: "bg-slate-400",
  },
  Investigate: {
    idle: "bg-zinc-50 text-zinc-700 border-zinc-200",
    active: "bg-zinc-700 text-white border-zinc-700",
    dot: "bg-zinc-500",
  },
};

const STATUS_CHIP_CLS: Record<
  WqaStatus,
  { idle: string; active: string }
> = {
  Open: {
    idle: "bg-slate-50 text-slate-700 border-slate-200",
    active: "bg-slate-700 text-white border-slate-700",
  },
  "In Progress": {
    idle: "bg-indigo-50 text-indigo-800 border-indigo-200",
    active: "bg-indigo-600 text-white border-indigo-600",
  },
  Done: {
    idle: "bg-emerald-50 text-emerald-700 border-emerald-200",
    active: "bg-emerald-600 text-white border-emerald-600",
  },
  Drifted: {
    idle: "bg-rose-50 text-rose-700 border-rose-200",
    active: "bg-rose-600 text-white border-rose-600",
  },
};

// Suppress unused-import warning while ACTION_COLOR is referenced only
// indirectly through the per-token Tailwind tables above.
void ACTION_COLOR;

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
  propertySlug,
  decisions,
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
  /** Required for the inline action / status chips. When omitted the
   *  table falls back to read-only badges (legacy /api/wqa caller). */
  propertySlug?: string;
  decisions?: DecisionRow[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("sessions");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [query, setQuery] = useState("");
  const [healthFilter, setHealthFilter] = useState<HealthZone | "all">("all");
  const [pageSize, setPageSize] = useState<50 | 100 | 250>(100);
  const [page, setPage] = useState(0);

  // Column visibility - persisted to localStorage per property so the
  // user's "show me only what I care about" layout survives navigation.
  // URL is alwaysOn and cannot be hidden.
  const colsStorageKey = propertySlug
    ? `wqa-cols:${propertySlug}`
    : "wqa-cols:default";
  const [hiddenColumns, setHiddenColumns] = useState<Set<ColumnId>>(
    () => new Set(),
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(colsStorageKey);
      if (!raw) return;
      const ids = JSON.parse(raw) as ColumnId[];
      setHiddenColumns(new Set(ids.filter((id) => !COLUMNS.find((c) => c.id === id)?.alwaysOn)));
    } catch {
      // ignore malformed storage
    }
  }, [colsStorageKey]);
  const toggleColumn = useCallback(
    (id: ColumnId) => {
      setHiddenColumns((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(
              colsStorageKey,
              JSON.stringify(Array.from(next)),
            );
          } catch {
            // ignore quota / private-mode errors
          }
        }
        return next;
      });
    },
    [colsStorageKey],
  );
  const resetColumns = useCallback(() => {
    setHiddenColumns(new Set());
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(colsStorageKey);
      } catch {
        // ignore
      }
    }
  }, [colsStorageKey]);
  const vis = useCallback(
    (id: ColumnId) => !hiddenColumns.has(id),
    [hiddenColumns],
  );

  // Multi-select filter state lives in local React state. Previously these
  // were URL search params, but router.push("?...") in Next.js 16 App Router
  // is treated as navigation - which kicks loading.tsx in and visually
  // blanks the page on every chip click. Local state keeps interaction
  // instant; deep-linking can be re-added later via history.replaceState
  // (no nav side-effects).
  const [selectedActions, setSelectedActions] = useState<Set<Action7>>(
    () => new Set(),
  );
  const [selectedStatuses, setSelectedStatuses] = useState<Set<WqaStatus>>(
    () => new Set(),
  );
  const [selectedLogic, setSelectedLogicState] = useState<Set<LogicCode>>(
    () => new Set(),
  );
  const [selectedOverride, setSelectedOverride] = useState<Set<OverrideFilter>>(
    () => new Set(),
  );

  const toggleAction = useCallback((a: Action7) => {
    setSelectedActions((prev) => {
      const next = new Set(prev);
      if (next.has(a)) next.delete(a);
      else next.add(a);
      return next;
    });
  }, []);

  const toggleStatus = useCallback((s: WqaStatus) => {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }, []);

  const toggleOverride = useCallback((v: OverrideFilter) => {
    setSelectedOverride((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }, []);

  const setLogic = useCallback((values: LogicCode[]) => {
    setSelectedLogicState(new Set(values));
  }, []);

  const clearAllFilters = useCallback(() => {
    setSelectedActions(new Set());
    setSelectedStatuses(new Set());
    setSelectedLogicState(new Set());
    setSelectedOverride(new Set());
    setHealthFilter("all");
  }, []);

  // URL deep-linking - hydrate filter state from search params on mount,
  // then mirror state to URL on change via history.replaceState (which
  // does NOT trigger Next.js router navigation, so the page does not blank).
  // Format mirrors the original URL pattern: ?action=Optimize,Restore
  // &status=Open&logic=four_xx_with_value,redirect_chain&override=operator.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const seed = <T extends string>(
      key: string,
      allow: readonly T[],
    ): Set<T> => {
      const raw = params.get(key);
      if (!raw) return new Set();
      return new Set(
        raw
          .split(",")
          .map((s) => s.trim())
          .filter((s): s is T => (allow as readonly string[]).includes(s)),
      );
    };
    const a = seed<Action7>("action", ACTION7_VALUES);
    const s = seed<WqaStatus>("status", STATUS_VALUES);
    const l = seed<LogicCode>("logic", LOGIC_CODE_VALUES);
    const o = seed<OverrideFilter>("override", ["pipeline", "operator"]);
    if (a.size) setSelectedActions(a);
    if (s.size) setSelectedStatuses(s);
    if (l.size) setSelectedLogicState(l);
    if (o.size) setSelectedOverride(o);
    // mount-only hydration; subsequent URL changes are driven by state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const write = (key: string, vals: Iterable<string>) => {
      const arr = Array.from(vals);
      if (arr.length === 0) params.delete(key);
      else params.set(key, arr.join(","));
    };
    write("action", selectedActions);
    write("status", selectedStatuses);
    write("logic", selectedLogic);
    write("override", selectedOverride);
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", next);
  }, [selectedActions, selectedStatuses, selectedLogic, selectedOverride]);

  // Build url → wqa_decision map so the chips can render override action
  // / status / drift without a second round-trip.
  const decisionByUrl = useMemo(() => {
    const m = new Map<string, DecisionRow>();
    for (const d of decisions ?? []) m.set(d.url, d);
    return m;
  }, [decisions]);

  // Compute triage once + cache against the row object. We also derive
  // the displayed Action7 (operator override if present, otherwise the
  // SOP-derived action mapped to Action7).
  const triaged = useMemo(
    () =>
      rows.map((r) => {
        const sop = triageRow(r);
        const override = decisionByUrl.get(r.url);
        const pipelineA7: Action7 = toAction7(sop.action);
        const overrideA7: Action7 | null = override
          ? toAction7(override.action)
          : null;
        const displayedA7: Action7 = overrideA7 ?? pipelineA7;
        const status: WqaStatus = override?.status ?? "Open";
        const driftReason = override?.drift_reason ?? null;
        // logic_code lives in BQ wqa_output; the Python pipeline (Chunk 5)
        // populates it. Until then every row reports null and the column
        // renders "—". When BQ adds the column, read it from r as
        // (r as WqaRow & { logic_code?: LogicCode | null }).logic_code.
        const logicCode: LogicCode | null = null;
        return {
          row: r,
          triage: sop,
          pipelineAction: pipelineA7,
          overrideAction: overrideA7,
          displayedAction: displayedA7,
          status,
          driftReason,
          logicCode,
        };
      }),
    [rows, decisionByUrl],
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

  // Aggregate legacy (10-value) action counts — used by the existing
  // Triage Funnel band which still groups by SOP-derived TriageAction.
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

  // Action7 counts for the filter chip strip. These count the displayed
  // action (override-aware) so the strip reflects what the table shows.
  const action7Counts = useMemo(() => {
    const c: Record<Action7, number> = {
      Optimize: 0,
      Restore: 0,
      Redirect: 0,
      Consolidate: 0,
      Remove: 0,
      Keep: 0,
      Investigate: 0,
    };
    for (const row of triaged) c[row.displayedAction] += 1;
    return c;
  }, [triaged]);

  const statusCounts = useMemo(() => {
    const c: Record<WqaStatus, number> = {
      Open: 0,
      "In Progress": 0,
      Done: 0,
      Drifted: 0,
    };
    for (const row of triaged) c[row.status] += 1;
    return c;
  }, [triaged]);

  const overrideCounts = useMemo(() => {
    let pipeline = 0;
    let operator = 0;
    for (const row of triaged) {
      if (row.overrideAction === null) pipeline += 1;
      else operator += 1;
    }
    return { pipeline, operator };
  }, [triaged]);

  // Filter + sort.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = triaged.filter((row) => {
      const r = row.row;
      const triage = row.triage;
      if (
        selectedActions.size > 0 &&
        !selectedActions.has(row.displayedAction)
      )
        return false;
      if (selectedStatuses.size > 0 && !selectedStatuses.has(row.status))
        return false;
      if (
        selectedLogic.size > 0 &&
        (row.logicCode === null || !selectedLogic.has(row.logicCode))
      )
        return false;
      if (selectedOverride.size > 0) {
        const bucket: OverrideFilter =
          row.overrideAction === null ? "pipeline" : "operator";
        if (!selectedOverride.has(bucket)) return false;
      }
      if (healthFilter !== "all" && healthZoneOf(r) !== healthFilter)
        return false;
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
  }, [
    triaged,
    sortKey,
    sortDir,
    query,
    healthFilter,
    selectedActions,
    selectedStatuses,
    selectedLogic,
    selectedOverride,
  ]);

  // Reset to first page whenever the filter or sort changes so the user
  // isn't stranded on an out-of-range page after narrowing the set.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setPage(0), [
    query,
    sortKey,
    sortDir,
    healthFilter,
    pageSize,
    selectedActions,
    selectedStatuses,
    selectedLogic,
    selectedOverride,
  ]);

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, visible.length);
  const paged = useMemo(
    () => visible.slice(pageStart, pageEnd),
    [visible, pageStart, pageEnd],
  );

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

      {/* Unified compact toolbar — replaces the legacy 4-row FilterChipStrip
       *  + separate sort/search header. Mirrors the image #38 reference:
       *  search + per-axis filter dropdowns + sort + Add filters + Columns
       *  buttons + count indicator, all on one row (wraps on narrow). The
       *  ActiveFilterStrip below shows current selections with × buttons. */}
      <div className="border rounded-lg bg-card mt-4 overflow-hidden">
        <header className="px-4 py-2.5 border-b flex items-center gap-2 flex-wrap text-[11px]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search URL, title, keyword…"
            className="flex-1 min-w-[180px] text-[12px] px-2.5 py-1 border rounded-md bg-card outline-none focus:border-foreground/40 placeholder:text-muted-foreground"
          />
          <FilterDropdown
            label="Action"
            options={ACTION7_VALUES.map((a) => ({
              value: a,
              label: a,
              count: action7Counts[a],
              dotClass: ACTION_CHIP_CLS[a].dot,
            }))}
            selected={selectedActions as Set<string>}
            onToggle={(v) => toggleAction(v as Action7)}
            onClear={() => setSelectedActions(new Set())}
          />
          <FilterDropdown
            label="Status"
            options={STATUS_VALUES.map((s) => ({
              value: s,
              label: s,
              count: statusCounts[s],
            }))}
            selected={selectedStatuses as Set<string>}
            onToggle={(v) => toggleStatus(v as WqaStatus)}
            onClear={() => setSelectedStatuses(new Set())}
          />
          <FilterDropdown
            label="Logic"
            options={LOGIC_CODE_VALUES.map((c) => ({
              value: c,
              label: c,
              sublabel: LOGIC_CODE_LABELS[c],
              mono: true,
            }))}
            selected={selectedLogic as Set<string>}
            onToggle={(v) => {
              const next = new Set(selectedLogic);
              const code = v as LogicCode;
              if (next.has(code)) next.delete(code);
              else next.add(code);
              setSelectedLogicState(next);
            }}
            onClear={() => setSelectedLogicState(new Set())}
          />
          <FilterDropdown
            label="Override"
            options={[
              {
                value: "pipeline",
                label: "Pipeline only",
                count: overrideCounts.pipeline,
              },
              {
                value: "operator",
                label: "Operator overrode",
                count: overrideCounts.operator,
              },
            ]}
            selected={selectedOverride as Set<string>}
            onToggle={(v) => toggleOverride(v as OverrideFilter)}
            onClear={() => setSelectedOverride(new Set())}
          />

          {/* Visual separator */}
          <span className="w-px h-5 bg-border mx-0.5" aria-hidden />

          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="text-[11px] px-2 py-1 border rounded-md bg-card outline-none cursor-pointer"
            title="Sort by"
          >
            {Object.entries(SORT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                Sort: {v}
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
            {sortDir === "desc" ? "↓" : "↑"}
          </button>

          <span className="ml-auto flex items-center gap-2">
            <AddFiltersStub />
            <ColumnsPicker
              hidden={hiddenColumns}
              onToggle={toggleColumn}
              onReset={resetColumns}
            />
            <span className="text-muted-foreground tabular-nums">
              {visible.length.toLocaleString()} URLs
            </span>
          </span>
        </header>

        <ActiveFilterStrip
          selectedActions={selectedActions}
          selectedStatuses={selectedStatuses}
          selectedLogic={selectedLogic}
          selectedOverride={selectedOverride}
          healthFilter={healthFilter}
          onRemoveAction={(a) => toggleAction(a)}
          onRemoveStatus={(s) => toggleStatus(s)}
          onRemoveLogic={(c) => {
            const next = new Set(selectedLogic);
            next.delete(c);
            setSelectedLogicState(next);
          }}
          onRemoveOverride={(v) => toggleOverride(v)}
          onRemoveHealth={() => setHealthFilter("all")}
          onClearAll={clearAllFilters}
        />

        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full text-[11.5px]">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur text-[10px] uppercase tracking-wider text-muted-foreground z-10">
              <tr>
                {vis("zone") && (
                  <th className="text-left px-3 py-2 font-medium w-[36px]">
                    Zone
                  </th>
                )}
                {vis("action") && (
                  <th className="text-left px-2 py-2 font-medium min-w-[110px]">
                    Action
                  </th>
                )}
                {vis("status") && (
                  <th className="text-left px-2 py-2 font-medium min-w-[110px]">
                    Status
                  </th>
                )}
                {vis("logic") && (
                  <th className="text-left px-2 py-2 font-medium min-w-[160px]">
                    Logic
                  </th>
                )}
                {vis("url") && (
                  <th className="text-left px-3 py-2 font-medium min-w-[280px]">
                    URL
                  </th>
                )}
                {vis("http") && (
                  <th className="text-right px-2 py-2 font-medium">HTTP</th>
                )}
                {vis("indexable") && (
                  <th className="text-left px-2 py-2 font-medium">Indexable</th>
                )}
                {vis("sessions") && (
                  <th className="text-right px-2 py-2 font-medium">Sessions</th>
                )}
                {vis("conversions") && (
                  <th className="text-right px-2 py-2 font-medium">Conv</th>
                )}
                {vis("impressions") && (
                  <th className="text-right px-2 py-2 font-medium">Impr</th>
                )}
                {vis("ctr") && (
                  <th className="text-right px-2 py-2 font-medium">CTR%</th>
                )}
                {vis("bestKeyword") && (
                  <th className="text-left px-2 py-2 font-medium min-w-[180px]">
                    Best keyword
                  </th>
                )}
                {vis("rank") && (
                  <th className="text-right px-2 py-2 font-medium">Rank</th>
                )}
                {vis("backlinks") && (
                  <th className="text-right px-2 py-2 font-medium">BLs</th>
                )}
                {vis("refdomains") && (
                  <th className="text-right px-2 py-2 font-medium">RD</th>
                )}
                {vis("inlinks") && (
                  <th className="text-right px-2 py-2 font-medium">Inl</th>
                )}
                {vis("words") && (
                  <th className="text-right px-2 py-2 font-medium">Words</th>
                )}
                {vis("depth") && (
                  <th className="text-right px-2 py-2 font-medium">Depth</th>
                )}
              </tr>
            </thead>
            <tbody>
              {paged.map((row) => {
                const r = row.row;
                const triage = row.triage;
                const zone = healthZoneOf(r);
                const tint = ACTION_TINT[triage.action];
                return (
                  <tr
                    key={r.url}
                    className={`border-t hover:bg-muted/40 tabular-nums ${onOpenDrawer ? "cursor-pointer" : ""}`}
                    onClick={() => onOpenDrawer?.(r.url)}
                  >
                    {vis("zone") && (
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
                    )}
                    {vis("action") && (
                      <td
                        className="px-2 py-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {propertySlug ? (
                          <WqaActionChip
                            propertySlug={propertySlug}
                            url={r.url}
                            pipelineAction={row.pipelineAction}
                            overrideAction={row.overrideAction}
                          />
                        ) : (
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
                        )}
                        {triage.tier && (
                          <div className="text-[9px] uppercase tracking-wider text-muted-foreground/80 mt-0.5">
                            {triage.tier}
                          </div>
                        )}
                      </td>
                    )}
                    {vis("status") && (
                      <td className="px-2 py-1.5">
                        {propertySlug ? (
                          <WqaStatusChip
                            propertySlug={propertySlug}
                            url={r.url}
                            value={row.status}
                            action={row.displayedAction}
                            driftReason={row.driftReason}
                          />
                        ) : (
                          <span className="text-[10px] text-muted-foreground">
                            —
                          </span>
                        )}
                      </td>
                    )}
                    {vis("logic") && (
                      <td className="px-2 py-1.5">
                        <WqaLogicCell code={row.logicCode} />
                      </td>
                    )}
                    {vis("url") && (
                    <td className="px-3 py-1.5 max-w-0">
                      {r.current_title ? (
                        <>
                          <div
                            className="text-[12px] font-semibold truncate text-foreground"
                            title={r.current_title}
                          >
                            {r.current_title}
                          </div>
                          <div
                            className="font-mono text-[10.5px] truncate text-muted-foreground mt-0.5"
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
                        </>
                      ) : (
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
                      )}
                      <div
                        className="text-[10px] text-muted-foreground/80 italic truncate mt-0.5"
                        title={triage.logic}
                      >
                        {triage.logic}
                      </div>
                    </td>
                    )}
                    {vis("http") && (
                      <td className="px-2 py-1.5 text-right text-muted-foreground">
                        {r.status_code ?? "—"}
                      </td>
                    )}
                    {vis("indexable") && (
                      <td className="px-2 py-1.5 text-muted-foreground text-[10.5px]">
                        {abbreviateIndexability(r.indexability)}
                      </td>
                    )}
                    {vis("sessions") && (
                      <td className="px-2 py-1.5 text-right">
                        {fmtN(r.sessions)}
                      </td>
                    )}
                    {vis("conversions") && (
                      <td className="px-2 py-1.5 text-right">
                        {fmtN(r.conversions)}
                      </td>
                    )}
                    {vis("impressions") && (
                      <td className="px-2 py-1.5 text-right">
                        {fmtN(r.average_impressions)}
                      </td>
                    )}
                    {vis("ctr") && (
                      <td className="px-2 py-1.5 text-right text-muted-foreground">
                        {fmtPct(r.average_ctr)}
                      </td>
                    )}
                    {vis("bestKeyword") && (
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
                    )}
                    {vis("rank") && (
                      <td className="px-2 py-1.5 text-right">
                        {fmtN(r.best_tv_kw_rank ?? r.best_sv_kw_rank)}
                      </td>
                    )}
                    {vis("backlinks") && (
                      <td className="px-2 py-1.5 text-right">
                        {fmtN(r.backlinks)}
                      </td>
                    )}
                    {vis("refdomains") && (
                      <td className="px-2 py-1.5 text-right">
                        {fmtN(r.referring_domains)}
                      </td>
                    )}
                    {vis("inlinks") && (
                      <td className="px-2 py-1.5 text-right text-muted-foreground">
                        {fmtN(r.inlinks)}
                      </td>
                    )}
                    {vis("words") && (
                      <td className="px-2 py-1.5 text-right text-muted-foreground">
                        {fmtN(r.word_count)}
                      </td>
                    )}
                    {vis("depth") && (
                      <td className="px-2 py-1.5 text-right text-muted-foreground">
                        {fmtN(r.page_depth)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination footer — per image #38 reference. Left: "Showing
         *  X to Y of Z URLs". Right: per-page selector (50 / 100 / 250)
         *  + prev / next page arrows. */}
        <footer className="px-4 py-2.5 border-t flex items-center justify-between gap-3 text-[11px] text-muted-foreground bg-muted/20">
          <div className="tabular-nums">
            {visible.length === 0
              ? "No URLs match the current filters"
              : `Showing ${(pageStart + 1).toLocaleString()} to ${pageEnd.toLocaleString()} of ${visible.length.toLocaleString()} URLs`}
            {visible.length !== rows.length && (
              <span className="text-muted-foreground/60">
                {" "}
                · {rows.length.toLocaleString()} total
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground/80">Show</span>
              {([50, 100, 250] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPageSize(n)}
                  className={
                    "px-2 py-0.5 rounded border text-[11px] tabular-nums transition-colors " +
                    (pageSize === n
                      ? "bg-foreground text-background border-foreground"
                      : "bg-card hover:border-foreground/30")
                  }
                >
                  {n}
                </button>
              ))}
              <span className="text-muted-foreground/80">per page</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="px-2 py-0.5 rounded border bg-card hover:border-foreground/30 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Previous page"
              >
                ‹
              </button>
              <span className="tabular-nums px-1">
                {safePage + 1} / {pageCount}
              </span>
              <button
                type="button"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                className="px-2 py-0.5 rounded border bg-card hover:border-foreground/30 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Next page"
              >
                ›
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ─── Compact toolbar primitives (image #38 pattern) ───────────────────────

type FilterOption = {
  value: string;
  label: string;
  sublabel?: string;
  count?: number;
  dotClass?: string;
  mono?: boolean;
};

/** Generic multi-select dropdown used for Action / Status / Logic / Override
 *  in the compact toolbar. Trigger button shows the axis label + selection
 *  count; opens a popover with checkboxes. */
function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  options: FilterOption[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const active = selected.size > 0;
  const summary = active
    ? selected.size === 1
      ? `${label}: ${Array.from(selected)[0]}`
      : `${label}: ${selected.size}`
    : label;
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={
          "inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded border transition-colors " +
          (active
            ? "bg-foreground text-background border-foreground"
            : "bg-card text-foreground border-border hover:border-foreground/30")
        }
      >
        <span>{summary}</span>
        <span className="opacity-70" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <>
          {/* Backdrop catches outside clicks to close the popover */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute z-50 mt-1 max-h-[360px] overflow-y-auto bg-card border rounded-md shadow-lg p-1 min-w-[220px]">
            {active && (
              <button
                type="button"
                onClick={() => {
                  onClear();
                  setOpen(false);
                }}
                className="w-full text-left text-[10.5px] text-muted-foreground hover:text-foreground px-2 py-1 border-b mb-1"
              >
                Clear {label.toLowerCase()}
              </button>
            )}
            {options.map((opt) => {
              const checked = selected.has(opt.value);
              return (
                <label
                  key={opt.value}
                  className="flex items-start gap-2 text-[11px] px-2 py-1 rounded hover:bg-muted/50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(opt.value)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      className={
                        "flex items-center gap-1.5 " +
                        (opt.mono ? "font-mono text-[10.5px]" : "")
                      }
                    >
                      {opt.dotClass && (
                        <span
                          className={`size-1.5 rounded-full ${opt.dotClass}`}
                        />
                      )}
                      <span>{opt.label}</span>
                      {opt.count !== undefined && (
                        <span className="ml-auto text-muted-foreground tabular-nums text-[10px]">
                          {opt.count.toLocaleString()}
                        </span>
                      )}
                    </div>
                    {opt.sublabel && (
                      <div className="text-[10px] text-muted-foreground leading-snug mt-0.5">
                        {opt.sublabel}
                      </div>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** Stub for "Add more filters" — placeholder button surfacing the future
 *  filter-builder (range filters on Sessions, Impressions, etc.). The
 *  popover currently shows a coming-soon message; the four canonical
 *  filters are already exposed as primary toolbar dropdowns. */
function AddFiltersStub() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded border border-dashed border-border bg-card hover:border-foreground/30 text-muted-foreground"
        title="Build column-level filters (coming soon)"
      >
        <span aria-hidden>+</span>
        <span>Add filters</span>
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 z-50 mt-1 bg-card border rounded-md shadow-lg p-3 min-w-[260px] text-[11px]">
            <div className="font-semibold mb-1">Column filters</div>
            <p className="text-muted-foreground leading-snug">
              Coming soon: numeric range filters on Sessions, Impressions, CTR,
              Backlinks, Refdomains, Inlinks, Words, and Depth. The four
              primary axes (Action, Status, Logic, Override) are already in
              the toolbar above.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/** Real Columns picker. Lists every COLUMNS entry with a checkbox; the
 *  URL row stays alwaysOn so it cannot be hidden. Selections persist to
 *  localStorage per property via the parent's toggleColumn callback. */
function ColumnsPicker({
  hidden,
  onToggle,
  onReset,
}: {
  hidden: Set<ColumnId>;
  onToggle: (id: ColumnId) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hiddenCount = hidden.size;
  const visibleCount = COLUMNS.length - hiddenCount;
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={
          "inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded border bg-card hover:border-foreground/30 " +
          (hiddenCount > 0
            ? "border-foreground/30 text-foreground"
            : "border-border text-muted-foreground")
        }
        title="Hide / show columns"
      >
        <span aria-hidden>⊞</span>
        <span>
          Columns
          {hiddenCount > 0 && (
            <span className="ml-1 tabular-nums opacity-80">
              {visibleCount}/{COLUMNS.length}
            </span>
          )}
        </span>
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 z-50 mt-1 bg-card border rounded-md shadow-lg p-1 min-w-[220px] max-h-[380px] overflow-y-auto text-[11px]">
            <div className="flex items-center justify-between px-2 py-1 border-b mb-1">
              <span className="font-semibold">Columns</span>
              {hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => onReset()}
                  className="text-[10.5px] text-muted-foreground hover:text-foreground underline"
                >
                  Show all
                </button>
              )}
            </div>
            {COLUMNS.map((col) => {
              const visible = !hidden.has(col.id);
              const locked = col.alwaysOn === true;
              return (
                <label
                  key={col.id}
                  className={
                    "flex items-center gap-2 px-2 py-1 rounded " +
                    (locked
                      ? "opacity-60 cursor-not-allowed"
                      : "hover:bg-muted/50 cursor-pointer")
                  }
                >
                  <input
                    type="checkbox"
                    checked={visible}
                    disabled={locked}
                    onChange={() => !locked && onToggle(col.id)}
                  />
                  <span>{col.label}</span>
                  {locked && (
                    <span className="ml-auto text-[9.5px] text-muted-foreground uppercase tracking-wider">
                      always on
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** Active-filter chip strip below the toolbar. Renders one removable pill
 *  per current selection (Action / Status / Logic / Override / Health).
 *  Hidden entirely when nothing is selected so the toolbar reads clean. */
function ActiveFilterStrip({
  selectedActions,
  selectedStatuses,
  selectedLogic,
  selectedOverride,
  healthFilter,
  onRemoveAction,
  onRemoveStatus,
  onRemoveLogic,
  onRemoveOverride,
  onRemoveHealth,
  onClearAll,
}: {
  selectedActions: Set<Action7>;
  selectedStatuses: Set<WqaStatus>;
  selectedLogic: Set<LogicCode>;
  selectedOverride: Set<OverrideFilter>;
  healthFilter: HealthZone | "all";
  onRemoveAction: (a: Action7) => void;
  onRemoveStatus: (s: WqaStatus) => void;
  onRemoveLogic: (c: LogicCode) => void;
  onRemoveOverride: (v: OverrideFilter) => void;
  onRemoveHealth: () => void;
  onClearAll: () => void;
}) {
  const total =
    selectedActions.size +
    selectedStatuses.size +
    selectedLogic.size +
    selectedOverride.size +
    (healthFilter !== "all" ? 1 : 0);
  if (total === 0) return null;
  return (
    <div className="px-4 py-2 border-b bg-muted/20 flex items-center gap-1.5 flex-wrap text-[11px]">
      <span className="text-muted-foreground text-[10px] uppercase tracking-wider font-semibold mr-1">
        Active
      </span>
      {Array.from(selectedActions).map((a) => (
        <ActivePill
          key={`a:${a}`}
          label={`Action: ${a}`}
          dotClass={ACTION_CHIP_CLS[a].dot}
          onRemove={() => onRemoveAction(a)}
        />
      ))}
      {Array.from(selectedStatuses).map((s) => (
        <ActivePill
          key={`s:${s}`}
          label={`Status: ${s}`}
          onRemove={() => onRemoveStatus(s)}
        />
      ))}
      {Array.from(selectedLogic).map((c) => (
        <ActivePill
          key={`l:${c}`}
          label={c}
          mono
          onRemove={() => onRemoveLogic(c)}
        />
      ))}
      {Array.from(selectedOverride).map((v) => (
        <ActivePill
          key={`o:${v}`}
          label={v === "pipeline" ? "Pipeline only" : "Operator overrode"}
          onRemove={() => onRemoveOverride(v)}
        />
      ))}
      {healthFilter !== "all" && (
        <ActivePill
          label={`Health: ${healthFilter}`}
          onRemove={onRemoveHealth}
        />
      )}
      <button
        type="button"
        onClick={onClearAll}
        className="ml-auto text-[10.5px] text-muted-foreground hover:text-foreground underline"
      >
        Clear all
      </button>
    </div>
  );
}

function ActivePill({
  label,
  dotClass,
  mono,
  onRemove,
}: {
  label: string;
  dotClass?: string;
  mono?: boolean;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 bg-card border rounded-full pl-2 pr-1 py-0.5 text-[10.5px]">
      {dotClass && <span className={`size-1.5 rounded-full ${dotClass}`} />}
      <span className={mono ? "font-mono" : ""}>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 size-4 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground inline-flex items-center justify-center"
        title="Remove filter"
      >
        ×
      </button>
    </span>
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
