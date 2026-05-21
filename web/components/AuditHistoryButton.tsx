"use client";

// Per-row "Decision history" popover for /pages. Renders only when a page
// has ≥1 prior decision (i.e. ≥1 row in page_audit_history). The trigger
// snapshots the OLD row before each UPDATE, so each history entry shows
// what the row WAS *before* a subsequent edit replaced it.

import { useEffect, useState } from "react";
import { ActionPill, type ActionVariant } from "@/components/ActionPill";

export type AuditHistoryRow = {
  audit_action: string | null;
  audit_target_url: string | null;
  audit_decided_by: string | null;
  snapshotted_at: string;
};

const ACTION_VARIANTS = new Set<ActionVariant>([
  "optimize",
  "restore",
  "redirect",
  "consolidate",
  "remove",
  "keep",
  "no_action",
  "undecided",
]);

function toVariant(action: string | null): ActionVariant {
  if (!action) return "undecided";
  return ACTION_VARIANTS.has(action as ActionVariant)
    ? (action as ActionVariant)
    : "undecided";
}

function fmtRel(iso: string): string {
  const ms = Date.now() - +new Date(iso);
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

export function AuditHistoryButton({
  pageUrl,
  currentAction,
  currentTarget,
  history,
}: {
  pageUrl: string;
  currentAction: string | null;
  currentTarget: string | null;
  history: AuditHistoryRow[];
}) {
  const [open, setOpen] = useState(false);

  if (history.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        title={`${history.length} prior decision${
          history.length === 1 ? "" : "s"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="size-3"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="tabular-nums">{history.length}</span>
      </button>
      {open && (
        <HistoryDialog
          pageUrl={pageUrl}
          currentAction={currentAction}
          currentTarget={currentTarget}
          history={history}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function HistoryDialog({
  pageUrl,
  currentAction,
  currentTarget,
  history,
  onClose,
}: {
  pageUrl: string;
  currentAction: string | null;
  currentTarget: string | null;
  history: AuditHistoryRow[];
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Decision history"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
      <div
        className="relative bg-card border rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b flex items-center gap-3 shrink-0">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold tracking-tight">
              Decision history
            </h3>
            <div
              className="text-[10px] font-mono text-muted-foreground truncate mt-0.5"
              title={pageUrl}
            >
              {pageUrl}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg leading-none shrink-0 px-1"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="px-4 py-4 overflow-y-auto">
          {/* Current state */}
          <section>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Now
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <ActionPill variant={toVariant(currentAction)} />
              {currentTarget && (
                <span
                  className="text-[11px] text-muted-foreground truncate font-mono max-w-[260px]"
                  title={currentTarget}
                >
                  → {currentTarget}
                </span>
              )}
            </div>
          </section>

          {/* Prior decisions */}
          <section className="mt-5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Was &middot; {history.length} prior
            </div>
            <ol className="space-y-3">
              {history.map((h, i) => (
                <li key={`${h.snapshotted_at}-${i}`} className="flex gap-3">
                  <div className="flex flex-col items-center pt-1.5 shrink-0">
                    <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                    {i < history.length - 1 && (
                      <span className="w-px flex-1 bg-border mt-1" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ActionPill variant={toVariant(h.audit_action)} />
                      {h.audit_target_url && (
                        <span
                          className="text-[11px] text-muted-foreground font-mono truncate max-w-[220px]"
                          title={h.audit_target_url}
                        >
                          → {h.audit_target_url}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground/80 mt-1 uppercase tracking-wider tabular-nums">
                      until {fmtRel(h.snapshotted_at)}
                      {h.audit_decided_by && (
                        <> · by {h.audit_decided_by}</>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
