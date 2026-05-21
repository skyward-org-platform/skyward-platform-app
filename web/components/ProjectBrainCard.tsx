"use client";

// Single Project Brain entry card with accept / reject / delete actions.
// Used by ProjectBrainList. Optimistic UI; reverts on error.

import { useState, useTransition } from "react";
import {
  updateBrainEntryStatus,
  deleteBrainEntry,
} from "@/app/properties/[slug]/project-brain/actions";
import { Markdownish } from "@/components/Markdownish";

export type BrainEntry = {
  id: string;
  type: string;
  title: string;
  body: string;
  source: string | null;
  confidence: number | null;
  status: string;
  created_at: string;
  updated_at: string;
};

// v2 mockup label mapping. See handoff/design/v2-screens.md screen 16.
const CATEGORY_LABEL: Record<string, string> = {
  issue: "Known issue",
  research: "Research",
  strategy: "Decision",
  preference: "Preference",
  insight: "Insight",
  working: "Working",
};

const CATEGORY_TINT: Record<string, { bg: string; fg: string; dot: string }> = {
  issue:      { bg: "bg-rose-50",    fg: "text-rose-700",    dot: "bg-rose-500" },
  research:   { bg: "bg-sky-50",     fg: "text-sky-700",     dot: "bg-sky-500" },
  strategy:   { bg: "bg-indigo-50",  fg: "text-indigo-700",  dot: "bg-indigo-500" },
  preference: { bg: "bg-violet-50",  fg: "text-violet-700",  dot: "bg-violet-500" },
  insight:    { bg: "bg-amber-50",   fg: "text-amber-700",   dot: "bg-amber-500" },
  working:    { bg: "bg-emerald-50", fg: "text-emerald-700", dot: "bg-emerald-500" },
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  archived: "Locked",
  superseded: "Superseded",
};

const STATUS_TINT: Record<string, { bg: string; fg: string }> = {
  active:     { bg: "bg-emerald-50", fg: "text-emerald-700" },
  archived:   { bg: "bg-slate-100",  fg: "text-slate-600" },
  superseded: { bg: "bg-zinc-100",   fg: "text-zinc-500" },
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ProjectBrainCard({
  entry,
  propertySlug,
  onLocalDelete,
}: {
  entry: BrainEntry;
  propertySlug: string;
  onLocalDelete: (id: string) => void;
}) {
  const [status, setStatus] = useState(entry.status);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function setStatusOptimistic(newStatus: string) {
    const previous = status;
    setStatus(newStatus);
    setError(null);
    startTransition(async () => {
      const res = await updateBrainEntryStatus(entry.id, newStatus, propertySlug);
      if (!res.ok) {
        setStatus(previous);
        setError(res.error);
      }
    });
  }

  function handleDelete() {
    const ok = confirm("Delete this entry? This is permanent.");
    if (!ok) return;
    setError(null);
    onLocalDelete(entry.id); // optimistic removal from parent list
    startTransition(async () => {
      const res = await deleteBrainEntry(entry.id, propertySlug);
      if (!res.ok) {
        setError(res.error);
        // Parent would need to re-add the item to undo; for V1.1 we accept
        // the small UX gap and just surface the error inline.
      }
    });
  }

  const catTint = CATEGORY_TINT[entry.type] ?? CATEGORY_TINT.insight;
  const statTint = STATUS_TINT[status] ?? STATUS_TINT.active;

  return (
    <div className={`border rounded-lg bg-card ${pending ? "opacity-60" : ""}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold mb-1">{entry.title}</div>
            <Markdownish
              text={entry.body}
              className="text-[13px] text-foreground/85 leading-relaxed"
            />
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span
              className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${catTint.bg} ${catTint.fg}`}
            >
              <span
                className={`size-1.5 rounded-full ${catTint.dot}`}
                aria-hidden
              />
              {CATEGORY_LABEL[entry.type] ?? entry.type}
            </span>
            {entry.confidence !== null && (
              <ConfidencePill value={entry.confidence} />
            )}
            <span
              className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${statTint.bg} ${statTint.fg}`}
            >
              {STATUS_LABEL[status] ?? status}
            </span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-[10px] text-muted-foreground tabular-nums uppercase tracking-wider">
            {entry.source && <span>{entry.source}</span>}
            <span className="ml-2">{fmtDate(entry.updated_at)}</span>
          </div>
          <div className="flex items-center gap-1">
            <IconButton
              title="Accept · set Active"
              disabled={pending || status === "active"}
              onClick={() => setStatusOptimistic("active")}
            >
              ✓
            </IconButton>
            <IconButton
              title="Reject · Lock"
              disabled={pending || status === "archived"}
              onClick={() => setStatusOptimistic("archived")}
            >
              ✕
            </IconButton>
            <IconButton title="Delete permanently" onClick={handleDelete} danger>
              🗑
            </IconButton>
          </div>
        </div>

        {error && (
          <div className="mt-2 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function IconButton({
  children,
  title,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`size-6 rounded text-xs flex items-center justify-center transition-colors ${
        disabled
          ? "text-muted-foreground/40 cursor-not-allowed"
          : danger
          ? "text-rose-600 hover:bg-rose-50"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

// Confidence pill: a percentage with a color band that gets warmer as
// certainty drops. 90%+ = emerald (the brand stated it directly); 70–89% =
// slate (clear inference); below 70% = amber (model is reading between the
// lines — verify before trusting).
function ConfidencePill({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const band =
    value >= 0.9
      ? "bg-emerald-50 text-emerald-700"
      : value >= 0.7
      ? "bg-slate-50 text-slate-700"
      : "bg-amber-50 text-amber-700";
  return (
    <span
      className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded tabular-nums ${band}`}
      title={`Confidence ${pct}%`}
    >
      {pct}%
    </span>
  );
}
