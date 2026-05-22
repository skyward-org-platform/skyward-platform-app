"use client";

// Inline numeric editor for content_row.sprint. Commits on blur or Enter.
// Empty string clears the value (null). Stops click propagation so row
// onClick handlers don't fire while in use.

import { useState, useTransition } from "react";
import { setRowSprint } from "@/app/properties/[slug]/content/actions";

export function SprintCell({
  slug,
  rowId,
  value,
}: {
  slug: string;
  rowId: string;
  value: number | null;
}) {
  const [local, setLocal] = useState(value?.toString() ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function commit() {
    const trimmed = local.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (next !== null && Number.isNaN(next)) {
      setLocal(value?.toString() ?? "");
      return;
    }
    if (next === (value ?? null)) return;
    setError(null);
    start(async () => {
      const res = await setRowSprint(slug, rowId, next);
      if (!res.ok) {
        setLocal(value?.toString() ?? "");
        setError(res.error);
      }
    });
  }

  return (
    <span
      className="inline-flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="number"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        onClick={(e) => e.stopPropagation()}
        disabled={pending}
        className={`text-[11px] px-1.5 py-0.5 rounded border bg-transparent w-14 tabular-nums text-right ${pending ? "opacity-60" : ""}`}
      />
      {error && (
        <span className="text-[10px] text-rose-700" title={error}>
          !
        </span>
      )}
    </span>
  );
}
