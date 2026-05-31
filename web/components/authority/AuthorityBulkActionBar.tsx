"use client";

// Sticky bulk-action toolbar for Authority tabs. Mirrors the WQA
// BulkActionBar visual pattern but takes generic action callbacks so each
// tab can wire its own server-action surface (ref domains, disavow,
// prospects) without forking the toolbar UI.

import { useState, type ReactNode } from "react";

export type BulkActionDef = {
  /** Visible button label. */
  label: string;
  /** Dropdown options. If omitted, button is a single-shot action that fires
   *  onPick(label) on click. */
  options?: readonly string[];
  /** Callback when an option (or the button itself) is picked. */
  onPick: (value: string) => void;
  /** Optional title attribute for the trigger button. */
  title?: string;
};

export function AuthorityBulkActionBar({
  count,
  onClear,
  actions,
  message,
  pending = false,
  rightSlot,
}: {
  count: number;
  onClear: () => void;
  actions: BulkActionDef[];
  message?: { ok: boolean; text: string } | null;
  pending?: boolean;
  rightSlot?: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="sticky top-0 z-30 -mx-3 px-3 mb-2">
      <div className="flex items-center gap-2 px-3 py-2 bg-foreground text-background rounded-lg shadow-md text-[12px] flex-wrap">
        <span className="font-semibold tabular-nums">
          {count} selected
        </span>
        <span className="w-px h-4 bg-background/20 mx-1" aria-hidden />

        {actions.map((a) =>
          a.options ? (
            <BulkDropdown
              key={a.label}
              label={a.label}
              options={a.options}
              disabled={pending}
              onPick={a.onPick}
              title={a.title}
            />
          ) : (
            <button
              key={a.label}
              type="button"
              onClick={() => a.onPick(a.label)}
              disabled={pending}
              title={a.title}
              className="px-2 py-0.5 rounded border border-background/30 hover:bg-background/10 disabled:opacity-40 text-[11px]"
            >
              {a.label}
            </button>
          ),
        )}

        <span className="ml-auto flex items-center gap-2">
          {rightSlot}
          {pending && <span className="text-[11px] opacity-70">Applying…</span>}
          {message && (
            <span
              className={
                "text-[11px] px-1.5 py-0.5 rounded " +
                (message.ok
                  ? "bg-emerald-500/20 text-emerald-100"
                  : "bg-rose-500/20 text-rose-100")
              }
            >
              {message.text}
            </span>
          )}
          <button
            type="button"
            onClick={onClear}
            disabled={pending}
            className="px-2 py-0.5 rounded border border-background/30 hover:bg-background/10 disabled:opacity-40 text-[11px]"
          >
            Deselect all
          </button>
        </span>
      </div>
    </div>
  );
}

function BulkDropdown({
  label,
  options,
  disabled,
  onPick,
  title,
}: {
  label: string;
  options: readonly string[];
  disabled: boolean;
  onPick: (value: string) => void;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        title={title}
        className="px-2 py-0.5 rounded border border-background/30 hover:bg-background/10 disabled:opacity-40 text-[11px] inline-flex items-center gap-1"
      >
        {label}
        <span className="opacity-70" aria-hidden>▾</span>
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute z-50 top-full left-0 mt-1 bg-card text-foreground border rounded-md shadow-lg p-1 min-w-[160px]">
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onPick(opt);
                }}
                className="w-full text-left px-2 py-1 rounded text-[11px] hover:bg-muted/60"
              >
                {opt}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
