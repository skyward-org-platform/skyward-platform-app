"use client";

// Inline edit chip for content_row.status. Five values:
//   - Not Started · Brief · Draft · Review · Published
//
// On change → setRowStatus server action. Optimistic UI: chip updates
// immediately and reverts on failure. Stops click/change propagation so
// row onClick handlers don't fire when the chip is in use.

import { useState, useTransition } from "react";
import { setRowStatus } from "@/app/properties/[slug]/content/actions";
import type { ContentStatus } from "@/lib/content-rows";

const STATES: ContentStatus[] = [
  "Not Started",
  "Brief",
  "Draft",
  "Review",
  "Published",
];

const TINT: Record<ContentStatus, string> = {
  "Not Started": "bg-slate-100 text-slate-700",
  Brief: "bg-indigo-100 text-indigo-800",
  Draft: "bg-sky-100 text-sky-800",
  Review: "bg-amber-100 text-amber-800",
  Published: "bg-emerald-100 text-emerald-800",
};

export function StatusChip({
  slug,
  rowId,
  value,
}: {
  slug: string;
  rowId: string;
  value: ContentStatus;
}) {
  const [current, setCurrent] = useState<ContentStatus>(value);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onChange(next: ContentStatus) {
    const previous = current;
    setCurrent(next);
    setError(null);
    start(async () => {
      const res = await setRowStatus(slug, rowId, next);
      if (!res.ok) {
        setCurrent(previous);
        setError(res.error);
      }
    });
  }

  return (
    <span
      className="inline-flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      <select
        value={current}
        disabled={pending}
        onChange={(e) => onChange(e.target.value as ContentStatus)}
        onClick={(e) => e.stopPropagation()}
        className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border-0 ${TINT[current]} ${pending ? "opacity-60" : ""}`}
      >
        {STATES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {error && (
        <span className="text-[10px] text-rose-700" title={error}>
          !
        </span>
      )}
    </span>
  );
}
