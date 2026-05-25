"use client";

// Generic row-selection hook used by every WQA table that supports
// bulk operations. Tracks a Set of "row keys" (we use URLs since they're
// the natural unique key for WQA rows) plus a few derived state pieces
// so the BulkActionBar can render counts + clear / select-all.
//
// Selection is scoped to the visible rows on the current tab. We
// deliberately don't persist across navigation - bulk operations are
// short-lived (open table -> select -> apply -> done).

import { useCallback, useMemo, useState } from "react";

export function useBulkSelection(visibleKeys: string[]) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  // Selection can become stale when filters narrow the visible set.
  // visibleSelected is the intersection of selected with current visible
  // keys - all bulk operations should act on that, not the raw selection.
  const visibleSelected = useMemo(() => {
    const next = new Set<string>();
    for (const k of visibleKeys) {
      if (selected.has(k)) next.add(k);
    }
    return next;
  }, [selected, visibleKeys]);

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleAll = useCallback(
    (keys: string[]) => {
      // If every visible key is currently selected, deselect them. Else
      // select all visible keys.
      const allSelected = keys.every((k) => selected.has(k));
      setSelected((prev) => {
        const next = new Set(prev);
        if (allSelected) {
          for (const k of keys) next.delete(k);
        } else {
          for (const k of keys) next.add(k);
        }
        return next;
      });
    },
    [selected],
  );

  const clear = useCallback(() => setSelected(new Set()), []);

  const allVisibleSelected =
    visibleKeys.length > 0 &&
    visibleKeys.every((k) => visibleSelected.has(k));
  const someVisibleSelected =
    !allVisibleSelected && visibleSelected.size > 0;

  return {
    selected: visibleSelected,
    rawSelected: selected,
    toggle,
    toggleAll,
    clear,
    allVisibleSelected,
    someVisibleSelected,
    count: visibleSelected.size,
  };
}
