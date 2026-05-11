"use client";

import { useState, useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateAuditAction } from "@/app/properties/[slug]/pages/actions";

const ACTION_COLORS: Record<string, string> = {
  optimize: "bg-blue-100 text-blue-700 hover:bg-blue-200",
  restore: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
  redirect: "bg-amber-100 text-amber-800 hover:bg-amber-200",
  consolidate: "bg-slate-200 text-slate-700 hover:bg-slate-300",
  remove: "bg-red-100 text-red-700 hover:bg-red-200",
  keep: "bg-slate-100 text-slate-600 hover:bg-slate-200",
  no_action: "bg-slate-100 text-slate-500 hover:bg-slate-200",
  undecided: "bg-yellow-100 text-yellow-800 hover:bg-yellow-200",
};

const ACTIONS = [
  "optimize",
  "restore",
  "redirect",
  "consolidate",
  "remove",
  "keep",
  "no_action",
  "undecided",
];

export function AuditActionChip({
  pageId,
  initialAction,
  propertySlug,
}: {
  pageId: string;
  initialAction: string | null;
  propertySlug: string;
}) {
  const [current, setCurrent] = useState(initialAction ?? "undecided");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(newAction: string | null) {
    if (!newAction) return;
    const previous = current;
    setCurrent(newAction); // optimistic
    setError(null);
    startTransition(async () => {
      const res = await updateAuditAction(pageId, newAction, propertySlug);
      if (!res.ok) {
        setCurrent(previous); // revert
        setError(res.error);
      }
    });
  }

  const color = ACTION_COLORS[current] ?? "bg-slate-100 text-slate-600 hover:bg-slate-200";

  return (
    <div className="inline-flex items-center gap-1">
      <Select value={current} onValueChange={handleChange} disabled={pending}>
        <SelectTrigger
          className={`h-6 px-2 text-[11px] font-semibold border-0 rounded shadow-none ${color} ${pending ? "opacity-60" : ""}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ACTIONS.map((a) => (
            <SelectItem key={a} value={a} className="text-xs">
              {a}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <span className="text-[10px] text-red-600" title={error}>
          !
        </span>
      )}
    </div>
  );
}
