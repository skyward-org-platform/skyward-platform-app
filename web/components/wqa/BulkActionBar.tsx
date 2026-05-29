"use client";

// Sticky bulk-action toolbar that appears at the top of any WQA table
// when one or more rows are selected. Lets the operator change Action,
// Status, or clear the operator override on every selected URL with
// one click. Renders nothing when count === 0.

import { useState, useTransition } from "react";
import type { Action7, WqaStatus } from "@/lib/wqa-decisions";
import {
  bulkCheckIndexStatus,
  bulkClearActionOverride,
  bulkSetAction,
  bulkSetStatus,
  bulkVerifyTargetUrls,
} from "@/app/properties/[slug]/pages/wqa-actions";

const ACTION7_VALUES: Action7[] = [
  "Optimize",
  "Restore",
  "Redirect",
  "Consolidate",
  "Remove",
  "Keep",
  "Investigate",
];

const STATUS_VALUES: WqaStatus[] = ["Open", "In Progress", "Done", "Drifted"];

type Result =
  | { ok: true; message: string }
  | { ok: false; message: string };

export function BulkActionBar({
  propertySlug,
  urls,
  onClear,
  showIndexCheck = false,
}: {
  propertySlug: string;
  /** Set of selected row keys (URLs). */
  urls: Set<string>;
  /** Called after a successful bulk apply so the parent can reset
   *  selection. Also called when the operator hits "Clear". */
  onClear: () => void;
  /** Surface the "Check Index" button. Off by default; the Redirect tab
   *  flips it on because index-state is meaningful for redirected URLs. */
  showIndexCheck?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);

  const count = urls.size;
  if (count === 0) return null;

  function flash(r: Result) {
    setResult(r);
    setTimeout(() => setResult(null), 4000);
  }

  const handleAction = (action: Action7) => {
    if (!confirm(`Set action to "${action}" on ${count} URL${count === 1 ? "" : "s"}?`)) return;
    startTransition(async () => {
      const res = await bulkSetAction(propertySlug, Array.from(urls), action);
      if (res.ok) {
        flash({ ok: true, message: `Set ${res.updated} URL${res.updated === 1 ? "" : "s"} to ${action}.` });
        onClear();
        // soft reload so the affected rows re-render
        window.location.reload();
      } else {
        flash({ ok: false, message: res.error });
      }
    });
  };

  const handleStatus = (status: WqaStatus) => {
    if (!confirm(`Set status to "${status}" on ${count} URL${count === 1 ? "" : "s"}?`)) return;
    startTransition(async () => {
      const res = await bulkSetStatus(propertySlug, Array.from(urls), status);
      if (res.ok) {
        flash({ ok: true, message: `Set ${res.updated} URL${res.updated === 1 ? "" : "s"} status to ${status}.` });
        onClear();
        window.location.reload();
      } else {
        flash({ ok: false, message: res.error });
      }
    });
  };

  const handleVerify = () => {
    if (!confirm(`Verify ${count} URL${count === 1 ? "" : "s"}? Each row's SOURCE URL is fetched; if it actually lands on the configured target_url, status flips to Done.`)) return;
    startTransition(async () => {
      const res = await bulkVerifyTargetUrls(propertySlug, Array.from(urls));
      if (!res.ok) {
        flash({ ok: false, message: res.error });
        return;
      }
      const parts: string[] = [`${res.matched}/${res.total} matched`];
      if (res.mismatched > 0) parts.push(`${res.mismatched} mismatch`);
      if (res.failed > 0) parts.push(`${res.failed} failed`);
      if (res.skipped > 0) parts.push(`${res.skipped} skipped (no target)`);
      flash({
        ok: res.mismatched === 0 && res.failed === 0,
        message: parts.join(", "),
      });
      if (res.mismatches.length > 0) {
        // Print mismatches to the console so operator can copy/paste
        // without losing the toolbar flash.
        // eslint-disable-next-line no-console
        console.warn("Verify mismatches (source actually redirects elsewhere):", res.mismatches);
      }
      onClear();
      window.location.reload();
    });
  };

  const handleCheckIndex = () => {
    if (!confirm(`Run Google site:URL check on ${count} URL${count === 1 ? "" : "s"}? Costs ~$0.001 per URL via DataForSEO.`)) return;
    startTransition(async () => {
      const res = await bulkCheckIndexStatus(propertySlug, Array.from(urls));
      if (!res.ok) {
        flash({ ok: false, message: res.error });
        return;
      }
      const parts: string[] = [`${res.indexed}/${res.total} indexed`];
      parts.push(`${res.notIndexed} not in index`);
      if (res.errors.length > 0) parts.push(`${res.errors.length} errors`);
      flash({
        ok: res.errors.length === 0,
        message: parts.join(", "),
      });
      if (res.errors.length > 0) {
        // eslint-disable-next-line no-console
        console.warn("Index check errors:", res.errors);
      }
      onClear();
      window.location.reload();
    });
  };

  const handleClearOverride = () => {
    if (!confirm(`Revert ${count} URL${count === 1 ? "" : "s"} back to the pipeline-derived action?`)) return;
    startTransition(async () => {
      const res = await bulkClearActionOverride(propertySlug, Array.from(urls));
      if (res.ok) {
        flash({ ok: true, message: `Cleared overrides on ${res.updated} URL${res.updated === 1 ? "" : "s"}.` });
        onClear();
        window.location.reload();
      } else {
        flash({ ok: false, message: res.error });
      }
    });
  };

  return (
    <div className="sticky top-0 z-30 -mx-3 px-3 mb-2">
      <div className="flex items-center gap-2 px-3 py-2 bg-foreground text-background rounded-lg shadow-md text-[12px] flex-wrap">
        <span className="font-semibold tabular-nums">
          {count} selected
        </span>
        <span className="w-px h-4 bg-background/20 mx-1" aria-hidden />

        <BulkDropdown
          label="Set action"
          options={ACTION7_VALUES}
          disabled={pending}
          onPick={(v) => handleAction(v as Action7)}
        />
        <BulkDropdown
          label="Set status"
          options={STATUS_VALUES}
          disabled={pending}
          onPick={(v) => handleStatus(v as WqaStatus)}
        />
        <button
          type="button"
          onClick={handleVerify}
          disabled={pending}
          className="px-2 py-0.5 rounded border border-background/30 hover:bg-background/10 disabled:opacity-40 text-[11px]"
          title="Follow each row's redirect chain and stamp last verified"
        >
          Verify
        </button>
        {showIndexCheck && (
          <button
            type="button"
            onClick={handleCheckIndex}
            disabled={pending}
            className="px-2 py-0.5 rounded border border-background/30 hover:bg-background/10 disabled:opacity-40 text-[11px]"
            title="Run site:URL on Google via DataForSEO to see whether each URL is still indexed"
          >
            Check Index
          </button>
        )}
        <button
          type="button"
          onClick={handleClearOverride}
          disabled={pending}
          className="px-2 py-0.5 rounded border border-background/30 hover:bg-background/10 disabled:opacity-40 text-[11px]"
          title="Revert these URLs to their pipeline-derived action"
        >
          Clear override
        </button>

        <span className="ml-auto flex items-center gap-2">
          {pending && <span className="text-[11px] opacity-70">Applying…</span>}
          {result && (
            <span
              className={
                "text-[11px] px-1.5 py-0.5 rounded " +
                (result.ok
                  ? "bg-emerald-500/20 text-emerald-100"
                  : "bg-rose-500/20 text-rose-100")
              }
            >
              {result.message}
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
}: {
  label: string;
  options: readonly string[];
  disabled: boolean;
  onPick: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
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
