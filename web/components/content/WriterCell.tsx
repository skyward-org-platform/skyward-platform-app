"use client";

// Inline text editor for content_row.writer. Commits on blur or Enter.
// Stops click propagation so row onClick handlers don't fire while in use.

import { useState, useTransition } from "react";
import { setRowWriter } from "@/app/properties/[slug]/content/actions";

export function WriterCell({
  slug,
  rowId,
  value,
}: {
  slug: string;
  rowId: string;
  value: string | null;
}) {
  const [local, setLocal] = useState(value ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function commit() {
    const next = local.trim() || null;
    if (next === (value ?? null)) return;
    setError(null);
    start(async () => {
      const res = await setRowWriter(slug, rowId, next);
      if (!res.ok) {
        setLocal(value ?? "");
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
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        onClick={(e) => e.stopPropagation()}
        disabled={pending}
        placeholder="TBD"
        className={`text-[11px] px-1.5 py-0.5 rounded border bg-transparent w-24 ${pending ? "opacity-60" : ""}`}
      />
      {error && (
        <span className="text-[10px] text-rose-700" title={error}>
          !
        </span>
      )}
    </span>
  );
}
