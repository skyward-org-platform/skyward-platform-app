"use client";

// Per-row WQA action chip with inline override. The default value is the
// SOP-computed action; clicking opens a select that writes a row to
// wqa_decision. Overridden rows show a small "·" marker so you can see at
// a glance which actions are human-set vs auto-derived.

import { useState, useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ACTION_TINT, TRIAGE_ACTIONS, type TriageAction } from "@/lib/wqa-triage";
import {
  clearWqaDecision,
  setWqaDecision,
} from "@/app/properties/[slug]/pages/wqa-actions";

export function WqaActionChip({
  propertySlug,
  url,
  sopAction,
  initialAction,
  isOverridden,
}: {
  propertySlug: string;
  url: string;
  /** The SOP-derived action; what the chip reverts to when an override is
   *  cleared. Stays constant unless WQA is re-run. */
  sopAction: TriageAction;
  /** Initial display value — override if present, otherwise the SOP. */
  initialAction: TriageAction;
  isOverridden: boolean;
}) {
  const [value, setValue] = useState<TriageAction>(initialAction);
  const [overridden, setOverridden] = useState(isOverridden);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onChange(next: string | null) {
    if (!next) return;
    if (!TRIAGE_ACTIONS.includes(next as TriageAction)) return;
    const nextAction = next as TriageAction;
    const previous = value;
    const wasOverridden = overridden;
    setValue(nextAction);
    setError(null);
    startTransition(async () => {
      // If the user picks the SOP value, treat as "clear override".
      if (nextAction === sopAction) {
        setOverridden(false);
        const res = await clearWqaDecision(propertySlug, url);
        if (!res.ok) {
          setValue(previous);
          setOverridden(wasOverridden);
          setError(res.error);
        }
        return;
      }
      setOverridden(true);
      const res = await setWqaDecision(propertySlug, url, nextAction);
      if (!res.ok) {
        setValue(previous);
        setOverridden(wasOverridden);
        setError(res.error);
      }
    });
  }

  const tint = ACTION_TINT[value];
  const cls = `inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${tint.band} h-[20px] border-0 shadow-none ${pending ? "opacity-60" : ""}`;

  return (
    <div className="inline-flex items-center gap-1">
      <Select value={value} onValueChange={onChange} disabled={pending}>
        <SelectTrigger className={cls}>
          <span className={`size-1.5 rounded-full ${tint.dot}`} aria-hidden />
          <SelectValue />
          {overridden && (
            <span
              className="text-[9px] text-foreground/60"
              title={`Override of SOP suggestion (${sopAction})`}
            >
              ●
            </span>
          )}
        </SelectTrigger>
        <SelectContent>
          {TRIAGE_ACTIONS.map((a) => (
            <SelectItem key={a} value={a} className="text-[11px]">
              {a}
              {a === sopAction && (
                <span className="ml-1 text-[9px] text-muted-foreground">(SOP)</span>
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
