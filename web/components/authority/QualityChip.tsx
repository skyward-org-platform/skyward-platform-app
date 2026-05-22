"use client";

// Inline edit chip for referring_domain.quality. Four values:
//   - Quality  (emerald) — vetted backlink, keep in profile
//   - Pending  (slate)   — not yet reviewed
//   - Spam     (rose)    — manipulative / low-quality, candidate for disavow
//   - Disavow  (violet)  — actively marked for disavow file
//
// On change → setDomainQuality server action. Optimistic UI: chip updates
// immediately and reverts on failure. Stops click/change propagation so
// row onClick handlers don't fire when the chip is in use.

import { useState, useTransition } from "react";
import { setDomainQuality } from "@/app/properties/[slug]/authority/actions";
import type { RefDomainQuality } from "@/lib/authority";

const QUALITIES: RefDomainQuality[] = ["Pending", "Quality", "Spam", "Disavow"];

const TINT: Record<RefDomainQuality, string> = {
  Quality: "bg-emerald-100 text-emerald-800",
  Spam: "bg-rose-100 text-rose-800",
  Pending: "bg-slate-100 text-slate-700",
  Disavow: "bg-violet-100 text-violet-800",
};

export function QualityChip({
  slug,
  domain,
  value,
}: {
  slug: string;
  domain: string;
  value: RefDomainQuality;
}) {
  const [current, setCurrent] = useState<RefDomainQuality>(value);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onChange(next: RefDomainQuality) {
    const previous = current;
    setCurrent(next);
    setError(null);
    start(async () => {
      const res = await setDomainQuality(slug, domain, next);
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
        onChange={(e) => onChange(e.target.value as RefDomainQuality)}
        onClick={(e) => e.stopPropagation()}
        className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border-0 ${TINT[current]} ${pending ? "opacity-60" : ""}`}
      >
        {QUALITIES.map((q) => (
          <option key={q} value={q}>
            {q}
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
