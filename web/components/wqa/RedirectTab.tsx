"use client";

// Per the WQA SOP Tab 6 "Redirect Map" — every URL with Action = Redirect,
// grouped by redirect Type (HTTP→HTTPS / non-primary variant / broken with
// value / chain fix). Each group collapses to one fix when it represents a
// single SSL toggle or systemic change.

import { useEffect, useMemo, useState, useTransition } from "react";
import { EmptyTab, HeaderTip, TabHeader, TableShell, UrlCell, fmtN } from "@/components/wqa/helpers";
import { WqaActionChip } from "@/components/wqa/WqaActionChip";
import { VerifyButton } from "@/components/wqa/VerifyButton";
import { BulkActionBar } from "@/components/wqa/BulkActionBar";
import { useBulkSelection } from "@/components/wqa/useBulkSelection";
import { toAction7 } from "@/lib/wqa-decisions";
import type { DecisionRow } from "@/lib/wqa-decisions";
import type { ActionTabProps, IndexStateEntry, TriagedRow } from "@/components/wqa/types";
import {
  setExecutionField,
  suggestRedirectDestination,
} from "@/app/properties/[slug]/pages/wqa-actions";

type RedirectType =
  | "HTTP → HTTPS"
  | "Non-primary variant"
  | "Broken with value"
  | "Broken (link equity)"
  | "Broken (no value)"
  | "302 → 301 conversion"
  | "Chain fix"
  | "Other";

const TYPE_NOTES: Record<RedirectType, string> = {
  "HTTP → HTTPS": "One SSL setting resolves all of these at once.",
  "Non-primary variant": "Duplicate URL serving 200 — canonicalize to primary.",
  "Broken with value": "404 with rank ≤ 20 or significant traffic — restoring may be better; review.",
  "Broken (link equity)": "404 with ≥ 3 refdomains — redirect to preserve backlink equity.",
  "Broken (no value)": "404 with at most internal links — redirect to best topical parent.",
  "302 → 301 conversion": "Temporary redirect should be permanent; data is conclusive.",
  "Chain fix": "Multi-hop chain — point source directly at final destination.",
  Other: "Redirect candidates not matching the standard types.",
};

const TYPE_ORDER: RedirectType[] = [
  "HTTP → HTTPS",
  "Non-primary variant",
  "302 → 301 conversion",
  "Chain fix",
  "Broken with value",
  "Broken (link equity)",
  "Broken (no value)",
  "Other",
];

function classify(r: TriagedRow): RedirectType {
  const logic = r.triage.logic.toLowerCase();
  if (logic.includes("http url") || logic.includes("http→https") || logic.includes("https policy")) {
    return "HTTP → HTTPS";
  }
  if (logic.includes("duplicate variant") || logic.includes("non-primary variant") || logic.includes("already redirecting")) {
    return "Non-primary variant";
  }
  if (logic.includes("broken variant")) return "Non-primary variant";
  if (r.row.status_code === 302) return "302 → 301 conversion";
  if (logic.includes("link equity") || logic.includes("refs>=3")) {
    return "Broken (link equity)";
  }
  if (logic.includes("some value") || logic.includes("internal links")) {
    return "Broken (no value)";
  }
  if (logic.includes("chain")) return "Chain fix";
  return "Other";
}

function priorityOf(t: RedirectType): "Critical" | "High" | "Medium" | "Low" {
  if (t === "HTTP → HTTPS" || t === "Chain fix") return "Critical";
  if (t === "Non-primary variant" || t === "Broken (link equity)") return "High";
  if (t === "302 → 301 conversion" || t === "Broken with value") return "Medium";
  return "Low";
}

const PRIORITY_BAND = {
  Critical: "bg-rose-50 text-rose-700",
  High: "bg-amber-50 text-amber-800",
  Medium: "bg-slate-50 text-slate-700",
  Low: "bg-muted text-muted-foreground",
} as const;

export function RedirectTab({
  rows,
  propertySlug,
  onOpenDrawer,
  execByUrl,
  decisionByUrl,
  indexByUrl,
}: ActionTabProps) {
  if (rows.length === 0) {
    return <EmptyTab message="No URLs are tagged Redirect." />;
  }

  const grouped = useMemo(() => {
    const buckets = new Map<RedirectType, TriagedRow[]>();
    for (const r of rows) {
      const t = classify(r);
      const arr = buckets.get(t) ?? [];
      arr.push(r);
      buckets.set(t, arr);
    }
    return TYPE_ORDER.map((t) => ({ type: t, items: buckets.get(t) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [rows]);

  // Flatten every row across every group into a single URL list so the
  // bulk selection is unified — one BulkActionBar at the top operates on
  // selections from any/all groups.
  const visibleUrls = useMemo(
    () => grouped.flatMap((g) => g.items.map((r) => r.row.url)),
    [grouped],
  );
  const selection = useBulkSelection(visibleUrls);

  return (
    <section>
      <TabHeader
        title="Redirect"
        subtitle={
          <>
            Source-to-destination map per SOP § 7.1 Tab 6. Grouped by type —
            HTTP→HTTPS collapses to one SSL toggle; broken-with-equity rows
            need per-URL destinations.
          </>
        }
        count={rows.length}
      />

      {propertySlug && (
        <BulkActionBar
          propertySlug={propertySlug}
          urls={selection.selected}
          onClear={selection.clear}
          showIndexCheck
        />
      )}

      <div className="space-y-5">
        {grouped.map((g) => {
          const priority = priorityOf(g.type);
          return (
            <div key={g.type}>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-[13px] font-semibold tracking-tight">
                  {g.type}
                </span>
                <span
                  className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${PRIORITY_BAND[priority]}`}
                >
                  {priority}
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {g.items.length} URL{g.items.length === 1 ? "" : "s"}
                </span>
                <span className="text-[11px] text-muted-foreground italic ml-2">
                  {TYPE_NOTES[g.type]}
                </span>
              </div>
              <TableShell>
                <thead className="sticky top-0 bg-muted/80 backdrop-blur text-[10px] uppercase tracking-wider text-muted-foreground z-10">
                  <tr>
                    <th className="px-2 py-2 w-[28px]">
                      <input
                        type="checkbox"
                        checked={g.items.every((r) => selection.selected.has(r.row.url))}
                        ref={(el) => {
                          if (el) {
                            const some = g.items.some((r) => selection.selected.has(r.row.url));
                            const all = g.items.every((r) => selection.selected.has(r.row.url));
                            el.indeterminate = some && !all;
                          }
                        }}
                        onChange={() => selection.toggleAll(g.items.map((r) => r.row.url))}
                        aria-label={`Select all in ${g.type}`}
                        className="cursor-pointer"
                      />
                    </th>
                    <th className="text-left px-3 py-2 font-medium min-w-[440px]">
                      <HeaderTip label="Source URL" tip="The URL on this property that needs redirecting." />
                    </th>
                    <th className="text-left px-2 py-2 font-medium">
                      <HeaderTip label="Action" tip="SOP v5 Action7 decision (Optimize / Restore / Redirect / Consolidate / Remove / Keep / Investigate). Click to override." />
                    </th>
                    <th className="text-left px-2 py-2 font-medium min-w-[320px]">
                      <HeaderTip label="Destination URL" tip="Operator-configured redirect target. Editable inline; saves on blur." />
                    </th>
                    <th className="text-left px-2 py-2 font-medium">
                      <HeaderTip label="Verify" tip="Fetches the source URL, follows its redirect chain, and compares the actual final URL to the configured destination. Flips status to Done on match." />
                    </th>
                    <th className="text-left px-2 py-2 font-medium min-w-[200px]">
                      <HeaderTip label="Verified" tip="Latest verification result and timestamp. Hover the chip for the actual destination on mismatches." />
                    </th>
                    <th className="text-left px-2 py-2 font-medium min-w-[140px]">
                      <HeaderTip label="Indexed" tip="Google index status of the source URL. Red = still indexed (bad; redirected URLs should drop out). Green = not indexed. Grey = not checked yet." />
                    </th>
                    <th className="text-right px-2 py-2 font-medium">
                      <HeaderTip label="Status" tip="HTTP status code from the last Screaming Frog crawl of the source URL." />
                    </th>
                    <th className="text-right px-2 py-2 font-medium">
                      <HeaderTip label="Sessions" tip="GA4 sessions over the trailing 12 months for this source URL." />
                    </th>
                    <th className="text-right px-2 py-2 font-medium">
                      <HeaderTip label="Refs" tip="Referring domains — count of unique root domains backlinking the source URL (Ahrefs)." />
                    </th>
                    <th className="text-right px-2 py-2 font-medium">
                      <HeaderTip label="BLs" tip="Backlinks — total inbound link count to the source URL (Ahrefs)." />
                    </th>
                    <th className="text-left px-2 py-2 font-medium min-w-[420px]">
                      <HeaderTip label="Suggested destinations" tip="Cosine-similarity matches from page_embedding on this property. Click to populate Destination URL." />
                    </th>
                    <th className="text-left px-2 py-2 font-medium min-w-[220px]">
                      <HeaderTip label="Triage logic" tip="SOP v5 decision rationale + any operator override note." />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((r) => {
                    // For HTTP→HTTPS, the destination is just the HTTPS
                    // version of the same URL — pre-fill it.
                    let suggested: string | null = null;
                    if (g.type === "HTTP → HTTPS") {
                      suggested = r.row.url.replace(/^http:\/\//i, "https://");
                    }
                    const isSelected = selection.selected.has(r.row.url);
                    return (
                      <tr
                        key={r.row.url}
                        className={`border-t ${
                          isSelected ? "bg-blue-50/60" : "hover:bg-muted/40"
                        } ${onOpenDrawer ? "cursor-pointer" : ""}`}
                        onClick={() => onOpenDrawer?.(r.row.url)}
                      >
                        <td
                          className="px-2 py-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => selection.toggle(r.row.url)}
                            aria-label={`Select ${r.row.url}`}
                            className="cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="space-y-0.5 break-all">
                            <a
                              href={r.row.url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-[11px] text-foreground hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {r.row.url}
                            </a>
                            {r.row.current_title && (
                              <div
                                className="text-[10.5px] text-muted-foreground"
                                title={r.row.current_title}
                              >
                                {r.row.current_title}
                              </div>
                            )}
                          </div>
                        </td>
                        <td
                          className="px-2 py-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <WqaActionChip
                            propertySlug={propertySlug}
                            url={r.row.url}
                            pipelineAction={toAction7(
                              r.triage.sopAction ?? r.triage.action,
                            )}
                            overrideAction={
                              r.triage.isOverridden
                                ? toAction7(r.triage.action)
                                : null
                            }
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <DestinationUrlInput
                            propertySlug={propertySlug}
                            url={r.row.url}
                            defaultValue={
                              execByUrl?.get(r.row.url)?.target_url ?? ""
                            }
                            suggested={suggested}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <VerifyButton
                            propertySlug={propertySlug}
                            url={r.row.url}
                            size="compact"
                          />
                        </td>
                        <td
                          className="px-2 py-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <VerifiedCell
                            decision={decisionByUrl?.get(r.row.url) ?? null}
                          />
                        </td>
                        <td
                          className="px-2 py-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <IndexedCell
                            entry={indexByUrl?.get(r.row.url) ?? null}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          {r.row.status_code ?? "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {fmtN(r.row.sessions)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {fmtN(r.row.referring_domains)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          {fmtN(r.row.backlinks)}
                        </td>
                        <td className="px-2 py-1.5">
                          {suggested ? (
                            <a
                              href={suggested}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-[11px] text-emerald-700 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {suggested}
                            </a>
                          ) : (
                            <InlineSuggestions
                              propertySlug={propertySlug}
                              sourceUrl={r.row.url}
                              onPick={(picked) => {
                                void setExecutionField(
                                  propertySlug,
                                  r.row.url,
                                  "target_url",
                                  picked,
                                ).then(() => window.location.reload());
                              }}
                            />
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-[11px] text-muted-foreground italic">
                          {r.triage.logic}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableShell>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Inline editor for page_execution.target_url. defaultValue seeds from the
 *  saved override if present, otherwise stays blank — the operator can
 *  glance at the "Suggested destination" column to the right and type or
 *  paste the right URL. stopPropagation on the wrapper keeps the row's
 *  drawer-open click from firing while the input has focus. */
function DestinationUrlInput({
  propertySlug,
  url,
  defaultValue,
  suggested,
}: {
  propertySlug: string;
  url: string;
  defaultValue: string;
  suggested: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div
      className="inline-flex items-center gap-1 w-full"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="url"
        defaultValue={defaultValue}
        placeholder={suggested ?? "https://…"}
        className={`font-mono text-[11px] w-[280px] px-2 py-1 rounded border border-input bg-background ${pending ? "opacity-60" : ""}`}
        onBlur={(e) => {
          const next = e.currentTarget.value.trim() || null;
          if ((next ?? "") === (defaultValue ?? "")) return;
          setError(null);
          startTransition(async () => {
            const res = await setExecutionField(
              propertySlug,
              url,
              "target_url",
              next,
            );
            if (!res.ok) setError(res.error);
          });
        }}
      />
      {error && (
        <span className="text-[10px] text-rose-700" title={error}>
          !
        </span>
      )}
    </div>
  );
}

// ─── InlineSuggestions ────────────────────────────────────────────────────
// Replaces the click-to-reveal popover. Each row auto-fetches its top-3
// cosine matches on mount and renders them inline in the table cell so
// the operator scans them at a glance and clicks one to set the target
// URL. Tradeoff: each row fires its own OpenAI call (~$0.0001 / call),
// total for 449 rows is ~$0.05 / page render. Acceptable for now; cache
// table is the follow-up if Paul opens this tab frequently.

type SuggestionRow = {
  url: string;
  similarity: number;
  confidence: "high" | "medium" | "low";
};

const CONFIDENCE_TINT = {
  high: "bg-emerald-50 text-emerald-800 border-emerald-200",
  medium: "bg-amber-50 text-amber-800 border-amber-200",
  low: "bg-slate-50 text-slate-600 border-slate-200",
} as const;

function InlineSuggestions({
  propertySlug,
  sourceUrl,
  onPick,
}: {
  propertySlug: string;
  sourceUrl: string;
  onPick: (url: string) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(true);
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await suggestRedirectDestination(propertySlug, sourceUrl);
        if (cancelled) return;
        if (!res.ok) {
          setError(res.error);
        } else {
          setRows(res.suggestions);
        }
      } finally {
        if (!cancelled) {
          setPending(false);
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [propertySlug, sourceUrl]);

  if (pending && !loaded) {
    return (
      <span className="text-[10.5px] text-muted-foreground italic">
        Matching…
      </span>
    );
  }
  if (error) {
    return (
      <span className="text-[10.5px] text-rose-700" title={error}>
        Match failed
      </span>
    );
  }
  const renderable = rows.filter((r) => r.similarity >= 0.4);
  if (renderable.length === 0) {
    return (
      <span className="text-[10.5px] text-muted-foreground italic">
        No confident matches — pick manually
      </span>
    );
  }
  return (
    <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
      {renderable.map((r) => {
        const bar = Math.max(2, Math.round(r.similarity * 100));
        return (
          <button
            key={r.url}
            type="button"
            onClick={() => onPick(r.url)}
            className="w-full text-left px-1.5 py-1 rounded hover:bg-muted/40 group transition-colors"
            title={`Use ${r.url} as destination`}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={
                  "inline-flex items-center text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0 rounded border shrink-0 " +
                  CONFIDENCE_TINT[r.confidence]
                }
              >
                {r.confidence}
              </span>
              <span className="tabular-nums text-[10px] text-muted-foreground w-[36px] shrink-0">
                {r.similarity.toFixed(3)}
              </span>
              <div className="flex-1 h-1 bg-muted rounded overflow-hidden shrink min-w-0">
                <div
                  className={
                    "h-full " +
                    (r.confidence === "high"
                      ? "bg-emerald-500"
                      : r.confidence === "medium"
                        ? "bg-amber-500"
                        : "bg-slate-400")
                  }
                  style={{ width: `${bar}%` }}
                />
              </div>
            </div>
            <div className="font-mono text-[10.5px] text-foreground group-hover:text-blue-700 mt-0.5 break-all">
              {r.url}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── VerifiedCell ────────────────────────────────────────────────────────
// Renders the verification rollup chip for the main table. Reads
// last_verification_* and last_implementation_check_at from the wqa_decision
// row. Mirrors the per-kind palette the drawer history uses so the visual
// language stays consistent (emerald=matched, amber=mismatch, rose=failed).

function VerifiedCell({ decision }: { decision: DecisionRow | null }) {
  if (!decision || !decision.last_verification_kind) {
    return (
      <span className="text-[10.5px] text-muted-foreground italic">never</span>
    );
  }
  const kind = decision.last_verification_kind;
  const at = decision.last_implementation_check_at;
  const rel = at ? relativeTime(at) : "";

  if (kind === "matched") {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="inline-flex items-center w-fit text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
          ✓ matched
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {rel}
        </span>
      </div>
    );
  }
  if (kind === "mismatch") {
    const actual = decision.last_verification_actual ?? null;
    return (
      <div className="flex flex-col gap-0.5">
        <span className="inline-flex items-center w-fit text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
          ≠ mismatch
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {rel}
        </span>
        {actual && (
          <a
            href={actual}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[10px] text-amber-800 hover:underline break-all"
            title={`actual destination: ${actual}`}
          >
            {actual.replace(/^https?:\/\//, "")}
          </a>
        )}
      </div>
    );
  }
  // failed
  const status = decision.last_verification_final_status;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex items-center w-fit text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200">
        ✗ failed{status ? ` (${status})` : ""}
      </span>
      <span className="text-[10px] text-muted-foreground tabular-nums">
        {rel}
      </span>
    </div>
  );
}

// ─── IndexedCell ─────────────────────────────────────────────────────────
// Reads the page_index_state snapshot. Three states:
//   - in_index = true   → rose chip (bad for a redirected URL — should
//                          have dropped out of Google by now)
//   - in_index = false  → emerald chip (clean)
//   - null              → muted dash (never checked)

function IndexedCell({ entry }: { entry: IndexStateEntry | null }) {
  if (!entry || entry.in_index === null) {
    return (
      <span className="text-[10.5px] text-muted-foreground italic">—</span>
    );
  }
  const rel = relativeTime(entry.checked_at);
  if (entry.in_index) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="inline-flex items-center w-fit text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200">
          INDEXED
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {rel}
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex items-center w-fit text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
        NOT IN INDEX
      </span>
      <span className="text-[10px] text-muted-foreground tabular-nums">
        {rel}
      </span>
    </div>
  );
}

// ─── relativeTime ────────────────────────────────────────────────────────
// Tiny inline helper. Renders "just now" / "5m ago" / "2h ago" / "3d ago" /
// otherwise the ISO date. Keeps the bundle clean (no date-fns).

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}
