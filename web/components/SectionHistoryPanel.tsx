"use client";

// Collapsible history panel for a Brand DNA section. Shows the last N
// snapshots from brand_dna_section_history — each row reads as "this is
// what the section looked like BEFORE the next edit at <snapshot time>."
//
// Closed by default to keep section editors clean. Per snapshot we show
// the actor, source, confidence, and a count of touched fields; the full
// pre-edit content is expandable on demand.

import { useState } from "react";
import type { SectionHistorySnapshot } from "@/lib/section-history";

export function SectionHistoryPanel({
  snapshots,
}: {
  snapshots: SectionHistorySnapshot[];
}) {
  const [open, setOpen] = useState(false);

  if (snapshots.length === 0) return null;

  return (
    <section className="mt-5 border rounded-lg bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="w-full px-4 py-2.5 text-left text-[12px] flex items-center gap-2 hover:bg-muted/30 transition-colors"
      >
        <span className="text-muted-foreground text-xs leading-none w-4 shrink-0">
          {open ? "▾" : "▸"}
        </span>
        <span className="font-semibold text-foreground">Edit history</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          · {snapshots.length} prior snapshot
          {snapshots.length === 1 ? "" : "s"}
        </span>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
          {open ? "hide" : "show"}
        </span>
      </button>
      {open && (
        <ol className="border-t divide-y">
          {snapshots.map((s, i) => (
            <SnapshotRow
              key={s.id}
              snapshot={s}
              nextLabel={
                i === 0
                  ? "before the most recent edit"
                  : `before edit ${i} more recent`
              }
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function SnapshotRow({
  snapshot,
  nextLabel,
}: {
  snapshot: SectionHistorySnapshot;
  nextLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const fieldKeys = snapshot.content
    ? Object.keys(snapshot.content).filter((k) => {
        const v = (snapshot.content as Record<string, unknown>)[k];
        return v !== null && v !== undefined && v !== "";
      })
    : [];

  return (
    <li className="px-4 py-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-foreground tabular-nums">
          {fmtRel(snapshot.snapshotted_at)}
        </span>
        <span className="text-[10px] text-muted-foreground/80">
          · {nextLabel}
        </span>
        {snapshot.updated_by && (
          <span className="text-[10px] text-muted-foreground">
            · by {snapshot.updated_by}
          </span>
        )}
        {snapshot.source && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded ${
              snapshot.source.startsWith("ai:")
                ? "bg-violet-50 text-violet-700"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {snapshot.source}
          </span>
        )}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          {expanded ? "hide content" : "view content"}
        </button>
      </div>
      <div className="mt-1 text-[10.5px] text-muted-foreground">
        {fieldKeys.length > 0 ? (
          <>
            <span className="uppercase tracking-wider">Had:</span>{" "}
            <span className="font-mono">{fieldKeys.join(" · ")}</span>
          </>
        ) : snapshot.body ? (
          <span className="italic">Body-style section</span>
        ) : (
          <span className="italic">Empty</span>
        )}
      </div>
      {expanded && (
        <pre className="mt-2 text-[11px] font-mono bg-muted/30 border rounded p-2 max-h-[200px] overflow-auto whitespace-pre-wrap">
          {snapshot.content
            ? JSON.stringify(snapshot.content, null, 2)
            : snapshot.body ?? "(empty)"}
        </pre>
      )}
    </li>
  );
}

function fmtRel(iso: string): string {
  const ms = Date.now() - +new Date(iso);
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}
