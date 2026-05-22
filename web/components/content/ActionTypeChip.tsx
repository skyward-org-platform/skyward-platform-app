"use client";

// Inline edit chip for content_row action type with override semantics:
//   - If override is null, current value falls back to auto-derived action_type
//     and chip renders normally.
//   - If override is set, current value is the override; chip gets a subtle
//     ring to indicate manual override.
//   - Selecting the same value as the auto-derived clears the override (null).
//   - Selecting a different value writes that as the override.
//
// On change → setRowField(slug, rowId, "action_type_override", next | null).
// Stops click/change propagation so row onClick handlers don't fire.

import { useState, useTransition } from "react";
import { setRowField } from "@/app/properties/[slug]/content/actions";
import type { ContentActionType } from "@/lib/content-rows";

const TYPES: ContentActionType[] = [
  "Optimize",
  "Refresh",
  "Rewrite",
  "New",
  "Remove",
];

const TINT: Record<ContentActionType, string> = {
  Optimize: "bg-emerald-100 text-emerald-800",
  Refresh: "bg-amber-100 text-amber-800",
  Rewrite: "bg-sky-100 text-sky-800",
  New: "bg-violet-100 text-violet-800",
  Remove: "bg-rose-100 text-rose-800",
};

export function ActionTypeChip({
  slug,
  rowId,
  value,
  override,
}: {
  slug: string;
  rowId: string;
  value: ContentActionType;
  override: ContentActionType | null;
}) {
  const [localOverride, setLocalOverride] = useState<ContentActionType | null>(
    override,
  );
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const current = localOverride ?? value;

  function onChange(next: ContentActionType) {
    const nextOverride: ContentActionType | null = next === value ? null : next;
    const previous = localOverride;
    setLocalOverride(nextOverride);
    setError(null);
    start(async () => {
      const res = await setRowField(
        slug,
        rowId,
        "action_type_override",
        nextOverride,
      );
      if (!res.ok) {
        setLocalOverride(previous);
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
        onChange={(e) => onChange(e.target.value as ContentActionType)}
        onClick={(e) => e.stopPropagation()}
        title={
          localOverride
            ? `Override of auto-derived ${value}`
            : "Auto-derived from Phase 1"
        }
        className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border-0 ${TINT[current]} ${pending ? "opacity-60" : ""} ${localOverride ? "ring-1 ring-foreground/20" : ""}`}
      >
        {TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
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
