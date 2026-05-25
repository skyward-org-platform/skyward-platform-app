"use client";

// Per-row status chip for the Pages WQA surface (P2 action semantics v2).
// Renders the operator-managed workflow status (Open / In Progress / Done).
// Drifted is auto-set by drift detection and surfaces as a clickable
// Acknowledge button that calls clearDrift.
//
// Hidden ("—") for Keep + Investigate actions since neither has work to
// track — Keep is "leave alone" and Investigate is "decide later, no
// status yet". This matches the spec § "Status workflow".

import { useTransition } from "react";
import { setStatus, clearDrift } from "@/app/properties/[slug]/pages/wqa-actions";
import type { Action7, WqaStatus } from "@/lib/wqa-decisions";

const STATUSES_MANUAL: WqaStatus[] = ["Open", "In Progress", "Done"];

const COLOR_CLASS: Record<WqaStatus, string> = {
  Open: "bg-slate-100 text-slate-700",
  "In Progress": "bg-indigo-100 text-indigo-800",
  Done: "bg-emerald-100 text-emerald-800",
  Drifted: "bg-rose-100 text-rose-800",
};

const HIDE_FOR_ACTIONS: ReadonlyArray<Action7> = ["Keep", "Investigate"];

export function WqaStatusChip({
  propertySlug,
  url,
  value,
  action,
  driftReason,
}: {
  propertySlug: string;
  url: string;
  value: WqaStatus;
  action: Action7;
  driftReason: string | null;
}) {
  const [pending, start] = useTransition();

  // Status semantic hidden for Keep + Investigate (no work to track).
  if (HIDE_FOR_ACTIONS.includes(action)) {
    return <span className="text-[10px] text-muted-foreground">—</span>;
  }

  if (value === "Drifted") {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (
            confirm(
              `Acknowledge drift?\n\n${driftReason ?? "(no reason provided)"}`,
            )
          ) {
            start(() => {
              void clearDrift(propertySlug, url);
            });
          }
        }}
        disabled={pending}
        title={driftReason ?? "Drift detected"}
        className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded ${COLOR_CLASS.Drifted} ${pending ? "opacity-50" : ""}`}
      >
        Drifted
      </button>
    );
  }

  return (
    <select
      value={value}
      disabled={pending}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const next = e.target.value as WqaStatus;
        start(() => {
          void setStatus(propertySlug, url, next);
        });
      }}
      className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded border-0 ${COLOR_CLASS[value]} ${pending ? "opacity-50" : ""}`}
    >
      {STATUSES_MANUAL.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
