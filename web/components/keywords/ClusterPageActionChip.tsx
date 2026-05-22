"use client";

// Inline action chip for cluster page_action. Four values + null:
//   - build_new          (sky)     — new page needed
//   - optimize_existing  (emerald) — existing page covers
//   - remove             (rose)    — kill this cluster
//   - skip               (slate)   — not now / not us
//   - null               (neutral) — not yet decided (renders as "—")
//
// Action chip style (no dot). On change → setClusterField server action
// with optimistic UI. Stops click propagation.

import { useState, useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setClusterField } from "@/app/properties/[slug]/keywords/actions";
import type { ClusterPageAction } from "@/lib/clusters";

// Internal sentinel for "no value" because shadcn's Select doesn't allow
// an empty string item value.
const UNSET = "__unset__";

const ACTION_VALUES: ClusterPageAction[] = [
  "build_new",
  "optimize_existing",
  "remove",
  "skip",
];

const LABEL: Record<ClusterPageAction, string> = {
  build_new: "Build new",
  optimize_existing: "Optimize existing",
  remove: "Remove",
  skip: "Skip",
};

const TINT: Record<ClusterPageAction, string> = {
  build_new: "bg-sky-50 text-sky-700",
  optimize_existing: "bg-emerald-50 text-emerald-800",
  remove: "bg-rose-50 text-rose-800",
  skip: "bg-slate-100 text-slate-700",
};

const UNSET_TINT = "bg-muted text-muted-foreground";

export function ClusterPageActionChip({
  propertySlug,
  clusterId,
  initialAction,
}: {
  propertySlug: string;
  clusterId: string;
  initialAction: ClusterPageAction | null;
}) {
  const [value, setValue] = useState<ClusterPageAction | null>(initialAction);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onChange(next: string | null) {
    if (!next) return;
    const nextAction: ClusterPageAction | null =
      next === UNSET ? null : (next as ClusterPageAction);
    if (nextAction !== null && !ACTION_VALUES.includes(nextAction)) return;
    const previous = value;
    setValue(nextAction);
    setError(null);
    startTransition(async () => {
      const res = await setClusterField(
        propertySlug,
        clusterId,
        "page_action",
        nextAction,
      );
      if (!res.ok) {
        setValue(previous);
        setError(res.error);
      }
    });
  }

  const tintCls = value ? TINT[value] : UNSET_TINT;
  const cls = `inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${tintCls} h-[20px] border-0 shadow-none ${pending ? "opacity-60" : ""}`;

  return (
    <div
      className="inline-flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      <Select
        value={value ?? UNSET}
        onValueChange={onChange}
        disabled={pending}
      >
        <SelectTrigger className={cls}>
          <SelectValue>{value ? LABEL[value] : "—"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNSET} className="text-[11px]">
            —
          </SelectItem>
          {ACTION_VALUES.map((a) => (
            <SelectItem key={a} value={a} className="text-[11px]">
              {LABEL[a]}
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
