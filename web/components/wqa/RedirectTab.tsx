"use client";

// Per the WQA SOP Tab 6 "Redirect Map" — every URL with Action = Redirect,
// grouped by redirect Type (HTTP→HTTPS / non-primary variant / broken with
// value / chain fix). Each group collapses to one fix when it represents a
// single SSL toggle or systemic change.

import { useMemo, useState, useTransition } from "react";
import { EmptyTab, TabHeader, TableShell, UrlCell, fmtN } from "@/components/wqa/helpers";
import { WqaActionChip } from "@/components/wqa/WqaActionChip";
import { VerifyButton } from "@/components/wqa/VerifyButton";
import { toAction7 } from "@/lib/wqa-decisions";
import type { ActionTabProps, TriagedRow } from "@/components/wqa/types";
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

export function RedirectTab({ rows, propertySlug, onOpenDrawer, execByUrl }: ActionTabProps) {
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
                    <th className="text-left px-3 py-2 font-medium min-w-[260px]">Source URL</th>
                    <th className="text-left px-2 py-2 font-medium">Action</th>
                    <th className="text-left px-2 py-2 font-medium min-w-[280px]">
                      Destination URL
                    </th>
                    <th className="text-left px-2 py-2 font-medium">Verify</th>
                    <th className="text-right px-2 py-2 font-medium">Status</th>
                    <th className="text-right px-2 py-2 font-medium">Sessions</th>
                    <th className="text-right px-2 py-2 font-medium">Refs</th>
                    <th className="text-right px-2 py-2 font-medium">BLs</th>
                    <th className="text-left px-2 py-2 font-medium min-w-[260px]">Suggested destination</th>
                    <th className="text-left px-2 py-2 font-medium min-w-[260px]">Triage logic</th>
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
                    return (
                      <tr
                        key={r.row.url}
                        className={`border-t hover:bg-muted/40 ${onOpenDrawer ? "cursor-pointer" : ""}`}
                        onClick={() => onOpenDrawer?.(r.row.url)}
                      >
                        <td className="px-3 py-1.5 max-w-0">
                          <UrlCell url={r.row.url} title={r.row.current_title} />
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
                            <SuggestDestinationButton
                              propertySlug={propertySlug}
                              sourceUrl={r.row.url}
                              onPick={(picked) => {
                                // Save and reload so the editor row re-renders
                                // with the new defaultValue. Lightweight UX —
                                // the user only clicks Suggest occasionally.
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

// ─── SuggestDestinationButton ─────────────────────────────────────────────
// Compact popover that calls suggestRedirectDestination on click,
// renders top-3 candidates with similarity bars + confidence labels.
// Clicking a row calls onPick(url) which the parent uses to persist
// the choice to page_execution.target_url.

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

function SuggestDestinationButton({
  propertySlug,
  sourceUrl,
  onPick,
}: {
  propertySlug: string;
  sourceUrl: string;
  onPick: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [slugText, setSlugText] = useState("");
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleOpen = () => {
    setOpen(true);
    if (loaded) return;
    startTransition(async () => {
      const res = await suggestRedirectDestination(propertySlug, sourceUrl);
      if (!res.ok) {
        setError(res.error);
        setLoaded(true);
        return;
      }
      setSlugText(res.slugText);
      setRows(res.suggestions);
      setLoaded(true);
    });
  };

  return (
    <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={handleOpen}
        className="text-[11px] text-foreground hover:text-blue-700 underline decoration-dotted"
        disabled={pending}
      >
        {pending ? "Matching…" : "Suggest destination"}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute z-50 top-full right-0 mt-1 w-[420px] bg-card border rounded-md shadow-lg p-2 text-[11px]">
            {!loaded || pending ? (
              <div className="px-2 py-3 text-muted-foreground italic">
                Embedding slug + cosine matching…
              </div>
            ) : error ? (
              <div className="px-2 py-2 text-rose-700">{error}</div>
            ) : rows.length === 0 ? (
              <div className="px-2 py-3 text-muted-foreground">
                No candidates. The slug text was too short or no page
                embeddings exist for this property yet.
              </div>
            ) : (
              <>
                <div className="px-2 py-1 border-b mb-1 text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <span>Top {rows.length} by cosine similarity</span>
                  <span className="ml-auto font-mono normal-case tracking-normal text-foreground/70">
                    “{slugText}”
                  </span>
                </div>
                {rows
                  .filter((r) => r.similarity >= 0.4)
                  .map((r) => {
                    const bar = Math.max(2, Math.round(r.similarity * 100));
                    return (
                      <button
                        key={r.url}
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          onPick(r.url);
                        }}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-muted/50 group"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={
                              "inline-flex items-center text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border " +
                              CONFIDENCE_TINT[r.confidence]
                            }
                          >
                            {r.confidence}
                          </span>
                          <span className="tabular-nums text-[10.5px] text-muted-foreground w-[42px]">
                            {r.similarity.toFixed(3)}
                          </span>
                          <div className="flex-1 h-1 bg-muted rounded overflow-hidden">
                            <div
                              className={
                                "h-full " +
                                (r.confidence === "high"
                                  ? "bg-emerald-500"
                                  : r.confidence === "medium"
                                    ? "bg-amber-500"
                                    : "bg-slate-300")
                              }
                              style={{ width: `${bar}%` }}
                            />
                          </div>
                        </div>
                        <div className="font-mono text-[11px] text-foreground/90 group-hover:text-blue-700 mt-1 truncate">
                          {r.url}
                        </div>
                      </button>
                    );
                  })}
                {rows.every((r) => r.similarity < 0.4) && (
                  <div className="px-2 py-2 text-muted-foreground text-[10.5px] italic">
                    All matches below 0.40 confidence — operator should pick
                    manually. Slug text was too thin for a reliable signal.
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
