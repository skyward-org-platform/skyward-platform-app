"use client";

// Per-row WQA action chip with inline override (P2 action semantics v2).
// Renders the 7-value Action7 dropdown. The "displayed" action is the
// operator override if present, otherwise the pipeline-derived action.
// Picking the pipeline's value clears the override (delete the
// wqa_decision row); picking anything else writes/upserts it.
//
// Both `pipelineAction` and `overrideAction` are passed in so the chip
// can render the "override of pipeline's X" indicator without re-fetching.
// Callers split the two source fields at the data-fetch layer (see
// WqaTabs / WqaDataView).

import { useState, useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ACTION_COLOR, type Action7 } from "@/lib/wqa-decisions";
import {
  clearActionOverride,
  setAction,
} from "@/app/properties/[slug]/pages/wqa-actions";

const ACTIONS: Action7[] = [
  "Optimize",
  "Restore",
  "Redirect",
  "Consolidate",
  "Remove",
  "Keep",
  "Investigate",
];

// Tailwind class fragments per color token. Keeping the lib token →
// class mapping here (not in lib/wqa-decisions.ts) keeps the lib
// framework-agnostic.
const COLOR_CLASS: Record<string, { band: string; dot: string }> = {
  sky: { band: "bg-sky-50 text-sky-700", dot: "bg-sky-500" },
  emerald: { band: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  amber: { band: "bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  violet: { band: "bg-violet-50 text-violet-700", dot: "bg-violet-500" },
  rose: { band: "bg-rose-50 text-rose-700", dot: "bg-rose-500" },
  slate: { band: "bg-slate-50 text-slate-700", dot: "bg-slate-400" },
  neutral: { band: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/40" },
};

export function WqaActionChip({
  propertySlug,
  url,
  pipelineAction,
  overrideAction,
}: {
  propertySlug: string;
  url: string;
  /** Pipeline-derived action (from BQ wqa_output or in-memory triageRow,
   *  mapped to Action7). Stays constant unless WQA is re-run. */
  pipelineAction: Action7 | null;
  /** Operator override from wqa_decision; null if no override exists. */
  overrideAction: Action7 | null;
}) {
  const displayed: Action7 =
    overrideAction ?? pipelineAction ?? "Investigate";

  const [value, setValue] = useState<Action7>(displayed);
  const [isOverride, setIsOverride] = useState<boolean>(
    overrideAction !== null && overrideAction !== pipelineAction,
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const tint = COLOR_CLASS[ACTION_COLOR[value]] ?? COLOR_CLASS.neutral;
  const cls = `inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${tint.band} h-[20px] border-0 shadow-none ${pending ? "opacity-60" : ""} ${isOverride ? "ring-1 ring-foreground/30" : ""}`;

  function onChange(next: string | null) {
    if (!next) return;
    if (!ACTIONS.includes(next as Action7)) return;
    const nextAction = next as Action7;
    const previousValue = value;
    const previousOverride = isOverride;
    setValue(nextAction);
    setError(null);
    startTransition(async () => {
      // If the user picks the pipeline value, treat as "clear override".
      if (nextAction === pipelineAction) {
        setIsOverride(false);
        const res = await clearActionOverride(propertySlug, url);
        if (!res.ok) {
          setValue(previousValue);
          setIsOverride(previousOverride);
          setError(res.error);
        }
        return;
      }
      setIsOverride(true);
      const res = await setAction(propertySlug, url, nextAction);
      if (!res.ok) {
        setValue(previousValue);
        setIsOverride(previousOverride);
        setError(res.error);
      }
    });
  }

  return (
    <div
      className="inline-flex items-center gap-1"
      title={
        isOverride
          ? `Override of pipeline's "${pipelineAction ?? "—"}"`
          : "Pipeline-derived"
      }
    >
      <Select value={value} onValueChange={onChange} disabled={pending}>
        <SelectTrigger className={cls}>
          <span className={`size-1.5 rounded-full ${tint.dot}`} aria-hidden />
          <SelectValue />
          {isOverride && (
            <span
              className="text-[9px] text-foreground/60"
              aria-label="overridden"
            >
              ●
            </span>
          )}
        </SelectTrigger>
        <SelectContent>
          {ACTIONS.map((a) => (
            <SelectItem key={a} value={a} className="text-[11px]">
              {a}
              {a === pipelineAction && (
                <span className="ml-1 text-[9px] text-muted-foreground">
                  (pipeline)
                </span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <span className="text-[10px] text-rose-700" title={error}>
          !
        </span>
      )}
    </div>
  );
}
