"use client";

// Inline action chip for keyword curation status. Three values:
//   - Retained  (emerald) — in scope, actively tracked
//   - Excluded  (rose)    — out of scope, do not surface in opportunities
//   - Candidate (neutral) — not yet reviewed
//
// On change → setKeywordStatus server action. Optimistic UI: chip
// updates immediately and reverts on failure. Stops click/select event
// propagation so row onClick handlers don't fire when the chip is in use.

import { useState, useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setKeywordStatus } from "@/app/properties/[slug]/keywords/actions";
import type { KeywordStatus } from "@/lib/keywords";

const STATUSES: KeywordStatus[] = ["Candidate", "Retained", "Excluded"];

const TINT: Record<KeywordStatus, string> = {
  Retained: "bg-emerald-50 text-emerald-800",
  Excluded: "bg-rose-50 text-rose-800",
  Candidate: "bg-slate-100 text-slate-700",
};

export function KeywordStatusChip({
  propertySlug,
  keyword,
  initialStatus,
}: {
  propertySlug: string;
  keyword: string;
  initialStatus: KeywordStatus;
}) {
  const [value, setValue] = useState<KeywordStatus>(initialStatus);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onChange(next: string | null) {
    if (!next) return;
    if (!STATUSES.includes(next as KeywordStatus)) return;
    const nextStatus = next as KeywordStatus;
    const previous = value;
    setValue(nextStatus);
    setError(null);
    startTransition(async () => {
      const res = await setKeywordStatus(propertySlug, keyword, nextStatus);
      if (!res.ok) {
        setValue(previous);
        setError(res.error);
      }
    });
  }

  const cls = `inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${TINT[value]} h-[20px] border-0 shadow-none ${pending ? "opacity-60" : ""}`;

  return (
    <div
      className="inline-flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      <Select value={value} onValueChange={onChange} disabled={pending}>
        <SelectTrigger className={cls}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s} className="text-[11px]">
              {s}
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
