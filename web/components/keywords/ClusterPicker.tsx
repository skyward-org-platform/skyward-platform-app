"use client";

// Searchable cluster picker. Button shows the current cluster's head_term
// (or name_override). Clicking opens a filterable list of all clusters.
// Selecting one fires onChange with the new cluster_id.
//
// Implementation note: shadcn Command isn't installed in this repo so we
// ship a lightweight popover with a native input filter. It's a controlled
// component — the caller owns the chosen id.

import { useEffect, useMemo, useRef, useState } from "react";
import type { ClusterRow } from "@/lib/clusters";

export function ClusterPicker({
  clusters,
  currentClusterId,
  onChange,
  disabled,
}: {
  clusters: ClusterRow[];
  currentClusterId: string | null;
  onChange: (clusterId: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const current = useMemo(
    () => clusters.find((c) => c.id === currentClusterId) ?? null,
    [clusters, currentClusterId],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clusters;
    return clusters.filter((c) => {
      const name = (c.name_override || c.head_term).toLowerCase();
      return name.includes(q) || c.head_term.toLowerCase().includes(q);
    });
  }, [clusters, search]);

  // Click-outside close.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative inline-block"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="text-[11.5px] px-2 py-1 border rounded bg-card hover:bg-muted/60 disabled:opacity-50 text-left truncate max-w-[260px]"
        title={current ? current.name_override || current.head_term : "Select cluster"}
      >
        {current ? (
          <>
            <span className="truncate">
              {current.name_override || current.head_term}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">Select cluster…</span>
        )}
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-[320px] border rounded-md bg-popover shadow-lg">
          <div className="p-2 border-b">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clusters…"
              className="w-full text-[12px] px-2 py-1 border rounded bg-background"
            />
          </div>
          <ul className="max-h-[280px] overflow-y-auto">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-[11.5px] text-muted-foreground italic">
                No matches.
              </li>
            )}
            {filtered.slice(0, 200).map((c) => {
              const name = c.name_override || c.head_term;
              const isCurrent = c.id === currentClusterId;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(c.id);
                      setOpen(false);
                      setSearch("");
                    }}
                    className={
                      "w-full text-left px-3 py-1.5 text-[11.5px] hover:bg-muted/60 truncate flex items-center justify-between gap-2 " +
                      (isCurrent ? "bg-muted/40 font-semibold" : "")
                    }
                    title={name}
                  >
                    <span className="truncate">{name}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                      #{c.cluster_number} · {c.total_sv.toLocaleString()} SV
                    </span>
                  </button>
                </li>
              );
            })}
            {filtered.length > 200 && (
              <li className="px-3 py-1.5 text-[10.5px] text-muted-foreground italic border-t">
                Showing first 200 of {filtered.length.toLocaleString()}. Refine search.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
