"use client";

// Per-table column width state + persistence. Widths are stored in
// localStorage keyed by (propertySlug, tableId) so each property keeps
// its own per-table layout. Operator drags the resize handle on a th
// → width updates live, then persists on mouseup.

import { useCallback, useEffect, useRef, useState } from "react";

const MIN_WIDTH = 40;
const MAX_WIDTH = 1200;

function storageKey(propertySlug: string | undefined, tableId: string): string {
  return `wqa-cols-w:${propertySlug ?? "default"}:${tableId}`;
}

export function useColumnWidths(
  propertySlug: string | undefined,
  tableId: string,
  defaults: Record<string, number>,
) {
  const key = storageKey(propertySlug, tableId);
  const [widths, setWidths] = useState<Record<string, number>>(defaults);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, number>;
      // Merge with defaults so newly-added columns get sensible widths
      // without losing the user's overrides on existing ones.
      setWidths({ ...defaults, ...parsed });
    } catch {
      // ignore malformed storage
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const persist = useCallback(
    (next: Record<string, number>) => {
      if (typeof window === "undefined") return;
      try {
        // Only persist non-default values to keep storage small + let
        // default changes propagate to users who never resized a col.
        const diff: Record<string, number> = {};
        for (const [id, w] of Object.entries(next)) {
          if (defaults[id] !== w) diff[id] = w;
        }
        if (Object.keys(diff).length === 0) {
          window.localStorage.removeItem(key);
        } else {
          window.localStorage.setItem(key, JSON.stringify(diff));
        }
      } catch {
        // ignore quota / private-mode errors
      }
    },
    [key, defaults],
  );

  const dragRef = useRef<{
    columnId: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  // Document-level handlers attach on mousedown, detach on mouseup.
  // Using a ref to avoid re-binding listeners when widths change.
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = dragRef.current;
      if (!d) return;
      const delta = e.clientX - d.startX;
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, d.startWidth + delta));
      setWidths((prev) => ({ ...prev, [d.columnId]: next }));
    }
    function onUp() {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // Persist whatever ended up in state after the move loop. We
      // read from the closure-captured setWidths via a functional
      // updater to grab the latest.
      setWidths((prev) => {
        persist(prev);
        return prev;
      });
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [persist]);

  const startResize = useCallback(
    (columnId: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const currentWidth =
        widths[columnId] ?? defaults[columnId] ?? 100;
      dragRef.current = {
        columnId,
        startX: e.clientX,
        startWidth: currentWidth,
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [widths, defaults],
  );

  const reset = useCallback(() => {
    setWidths(defaults);
    persist(defaults);
  }, [defaults, persist]);

  return { widths, startResize, reset };
}

/** Invisible drag handle to attach to the right edge of any <th>. Parent
 *  th must be `position: relative` for the absolute positioning to
 *  anchor correctly. */
export function ColumnResizer({
  columnId,
  startResize,
}: {
  columnId: string;
  startResize: (columnId: string, e: React.MouseEvent) => void;
}) {
  return (
    <div
      onMouseDown={(e) => startResize(columnId, e)}
      onClick={(e) => e.stopPropagation()}
      className="absolute top-0 right-0 h-full w-[5px] cursor-col-resize hover:bg-blue-500/40 active:bg-blue-600/60 z-10 select-none"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize column"
    />
  );
}
