"use client";

// SearchTrigger + SearchModal — ⌘K command palette for V1.1.
//
// Basic V1.1 implementation per the brief:
//   "⌘K opens a search modal (basic implementation — exact-match on
//   client/property name is fine for V1.1)."
//
// Behaviour:
//   - SearchTrigger renders the sidebar pill ("🔍 Search clients, properties… ⌘K").
//     Clicking it (or pressing ⌘K from anywhere) opens the modal.
//   - The modal filters items by case-insensitive substring match.
//   - ↑/↓ navigate, Enter selects, Esc closes.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type SearchItem = {
  kind: "client" | "property";
  label: string;
  href: string;
  meta?: string;
};

export function SearchTrigger({ items }: { items: SearchItem[] }) {
  const [open, setOpen] = useState(false);

  // Global ⌘K / ctrl+K listener.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((s) => !s);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full bg-card border border-border rounded-md px-2.5 py-1.5 text-xs text-muted-foreground flex items-center gap-2 hover:border-border/80 transition-colors"
      >
        <span>🔍</span>
        <span className="flex-1 text-left">Search clients, properties…</span>
        <kbd className="bg-muted border border-border rounded px-1.5 py-px text-[10px] text-muted-foreground font-mono">
          ⌘K
        </kbd>
      </button>
      {open && <SearchModal items={items} onClose={() => setOpen(false)} />}
    </>
  );
}

function SearchModal({
  items,
  onClose,
}: {
  items: SearchItem[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  // Focus the input on open.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Esc / arrows / Enter handling.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter((it) => it.label.toLowerCase().includes(q))
    : items;
  const results = filtered.slice(0, 12);

  // Clamp the active index to current results.
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  function pick(it: SearchItem) {
    router.push(it.href);
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Search"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center pt-[15vh]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-card border border-border rounded-lg shadow-xl overflow-hidden"
      >
        <div className="border-b border-border flex items-center px-4">
          <span className="text-muted-foreground mr-2">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIdx((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIdx((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const it = results[activeIdx];
                if (it) pick(it);
              }
            }}
            placeholder="Search clients, properties…"
            className="flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="bg-muted border border-border rounded px-1.5 py-px text-[10px] text-muted-foreground font-mono">
            Esc
          </kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-1">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground text-center">
              No matches.
            </div>
          ) : (
            results.map((it, i) => (
              <button
                key={`${it.kind}-${it.href}`}
                type="button"
                onClick={() => pick(it)}
                onMouseEnter={() => setActiveIdx(i)}
                className={`w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm ${
                  i === activeIdx ? "bg-sidebar-accent" : ""
                }`}
              >
                <span className="text-muted-foreground text-xs w-4">
                  {it.kind === "client" ? "◉" : "•"}
                </span>
                <span className="flex-1 min-w-0 truncate">{it.label}</span>
                {it.meta && (
                  <span className="text-[10px] text-muted-foreground">
                    {it.meta}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
