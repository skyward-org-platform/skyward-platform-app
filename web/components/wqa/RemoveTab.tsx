"use client";

// Per WQA SOP Tab 9 "Removal List" — URLs with no value signals. Each
// gets noindex or delete. Includes a Pending column for the "Review"
// edge cases (client confirmation needed).

import { useState, useTransition } from "react";
import { EmptyTab, TabHeader, TableShell, UrlCell, fmtN } from "@/components/wqa/helpers";
import { WqaActionChip } from "@/components/wqa/WqaActionChip";
import type { ActionTabProps } from "@/components/wqa/types";
import { setExecutionField } from "@/app/properties/[slug]/pages/wqa-actions";

const RECOMMENDED_OPTIONS = [
  "Noindex + remove from nav",
  "Delete",
  "Leave as 404",
  "Investigate",
] as const;

type RecommendedAction = (typeof RECOMMENDED_OPTIONS)[number];

const RECOMMENDED_PREFIX = "[recommended_action] ";

/** Default suggestion from the live status code. Mirrors
 *  build_phase1_wqa.py::write_removal_list — 200 means "still live, hide
 *  it"; 404 means "leave"; anything else (5xx, 3xx) is suspicious enough
 *  to flag for investigation. */
function defaultRecommended(statusCode: number | null | undefined): RecommendedAction {
  if (statusCode === 200) return "Noindex + remove from nav";
  if (statusCode === 404) return "Leave as 404";
  return "Investigate";
}

/** Parse the recommended_action from page_execution.notes. We encode the
 *  override as a single-line prefix so notes can still hold free-form
 *  commentary on subsequent lines; this avoids a schema migration to add
 *  a dedicated column. */
function parseNotes(notes: string | null | undefined): {
  recommended: RecommendedAction | null;
  rest: string;
} {
  if (!notes) return { recommended: null, rest: "" };
  const firstNewline = notes.indexOf("\n");
  const first = firstNewline === -1 ? notes : notes.slice(0, firstNewline);
  const rest = firstNewline === -1 ? "" : notes.slice(firstNewline + 1);
  if (!first.startsWith(RECOMMENDED_PREFIX)) {
    return { recommended: null, rest: notes };
  }
  const value = first.slice(RECOMMENDED_PREFIX.length).trim();
  if ((RECOMMENDED_OPTIONS as readonly string[]).includes(value)) {
    return { recommended: value as RecommendedAction, rest };
  }
  return { recommended: null, rest: notes };
}

function encodeNotes(recommended: RecommendedAction, rest: string): string {
  const trimmed = rest.trim();
  return trimmed
    ? `${RECOMMENDED_PREFIX}${recommended}\n${rest}`
    : `${RECOMMENDED_PREFIX}${recommended}`;
}

export function RemoveTab({ rows, propertySlug, onOpenDrawer, execByUrl }: ActionTabProps) {
  if (rows.length === 0) {
    return (
      <EmptyTab message="No URLs are tagged Remove. Live pages with zero traffic, impressions, refs, and rank would land here." />
    );
  }

  return (
    <section>
      <TabHeader
        title="Remove"
        subtitle={
          <>
            URLs that should be noindexed or deleted. No traffic, no impressions,
            no refs, no rank — nothing of value to preserve. Confirm with client
            before deleting if the page describes a real service that&rsquo;s
            ambiguously absent from the rest of the site.
          </>
        }
        count={rows.length}
      />

      <TableShell>
        <thead className="sticky top-0 bg-muted/80 backdrop-blur text-[10px] uppercase tracking-wider text-muted-foreground z-10">
          <tr>
            <th className="text-left px-3 py-2 font-medium min-w-[260px]">URL</th>
            <th className="text-left px-2 py-2 font-medium">Action</th>
            <th className="text-right px-2 py-2 font-medium">Status</th>
            <th className="text-right px-2 py-2 font-medium">Words</th>
            <th className="text-right px-2 py-2 font-medium">Inlinks</th>
            <th className="text-left px-2 py-2 font-medium min-w-[260px]">Reason</th>
            <th className="text-left px-2 py-2 font-medium">Recommended</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const exec = execByUrl?.get(r.row.url);
            const parsed = parseNotes(exec?.notes ?? null);
            const initial =
              parsed.recommended ?? defaultRecommended(r.row.status_code);
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
                    sopAction={r.triage.sopAction ?? r.triage.action}
                    initialAction={r.triage.action}
                    isOverridden={!!r.triage.isOverridden}
                  />
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {r.row.status_code ?? "—"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {fmtN(r.row.word_count)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {fmtN(r.row.inlinks)}
                </td>
                <td className="px-2 py-1.5 text-[11px] text-muted-foreground italic">
                  {r.triage.logic}
                </td>
                <td className="px-2 py-1.5">
                  <RecommendedSelect
                    propertySlug={propertySlug}
                    url={r.row.url}
                    initial={initial}
                    notesRest={parsed.rest}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableShell>
    </section>
  );
}

/** Override select for the recommended dev action. There's no dedicated
 *  column on page_execution for this, so we encode it as a single-line
 *  prefix on the existing notes field: `[recommended_action] <value>\n…`.
 *  parseNotes() / encodeNotes() round-trip cleanly so any free-form notes
 *  the operator wrote in the drawer are preserved on subsequent lines. */
function RecommendedSelect({
  propertySlug,
  url,
  initial,
  notesRest,
}: {
  propertySlug: string;
  url: string;
  initial: RecommendedAction;
  notesRest: string;
}) {
  const [value, setValue] = useState<RecommendedAction>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div
      className="inline-flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      <select
        value={value}
        disabled={pending}
        className={`text-[11px] px-2 py-1 rounded border border-input bg-background ${pending ? "opacity-60" : ""}`}
        onChange={(e) => {
          const next = e.currentTarget.value as RecommendedAction;
          const prev = value;
          setValue(next);
          setError(null);
          startTransition(async () => {
            const encoded = encodeNotes(next, notesRest);
            const res = await setExecutionField(
              propertySlug,
              url,
              "notes",
              encoded,
            );
            if (!res.ok) {
              setValue(prev);
              setError(res.error);
            }
          });
        }}
      >
        {RECOMMENDED_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      {error && (
        <span className="text-[10px] text-rose-700" title={error}>
          !
        </span>
      )}
    </div>
  );
}
