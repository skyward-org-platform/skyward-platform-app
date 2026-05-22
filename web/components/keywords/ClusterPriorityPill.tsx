"use client";

// Inline status pill for cluster priority. Four values:
//   - High  (indigo)  — top investment band
//   - Watch (amber)   — monitor; may promote
//   - Low   (slate)   — long tail / future
//   - Unset (neutral) — not yet curated
//
// Status pill style (WITH dot), matches the Cluster Map table look so the
// same chip works inline and inside the drawer. On change →
// setClusterPriority server action with optimistic UI.

import { useState, useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setClusterPriority } from "@/app/properties/[slug]/keywords/actions";
import type { ClusterPriority } from "@/lib/clusters";

const PRIORITIES: ClusterPriority[] = ["High", "Watch", "Low", "Unset"];

const TINT: Record<ClusterPriority, { band: string; dot: string }> = {
  High: { band: "bg-indigo-50 text-indigo-800", dot: "bg-indigo-500" },
  Watch: { band: "bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  Low: { band: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  Unset: { band: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/40" },
};

export function ClusterPriorityPill({
  propertySlug,
  clusterId,
  initialPriority,
}: {
  propertySlug: string;
  clusterId: string;
  initialPriority: ClusterPriority;
}) {
  const [value, setValue] = useState<ClusterPriority>(initialPriority);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onChange(next: string | null) {
    if (!next) return;
    if (!PRIORITIES.includes(next as ClusterPriority)) return;
    const nextPriority = next as ClusterPriority;
    const previous = value;
    setValue(nextPriority);
    setError(null);
    startTransition(async () => {
      const res = await setClusterPriority(propertySlug, clusterId, nextPriority);
      if (!res.ok) {
        setValue(previous);
        setError(res.error);
      }
    });
  }

  const tint = TINT[value];
  const cls = `inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${tint.band} h-[20px] border-0 shadow-none ${pending ? "opacity-60" : ""}`;

  return (
    <div
      className="inline-flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      <Select value={value} onValueChange={onChange} disabled={pending}>
        <SelectTrigger className={cls}>
          <span className={`size-1.5 rounded-full ${tint.dot}`} aria-hidden />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRIORITIES.map((p) => (
            <SelectItem key={p} value={p} className="text-[11px]">
              {p}
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
