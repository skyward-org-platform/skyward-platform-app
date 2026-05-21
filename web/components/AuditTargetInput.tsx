"use client";

// Inline editor for `audit_target_url` — only rendered for pages whose current
// audit_action is "redirect" or "consolidate". Click the row to open an input;
// blur or Enter saves; Escape cancels. Optimistic UI with revert on error.
//
// Empty submit clears the target. Validation lives server-side in
// updateAuditTarget; this component surfaces returned errors inline.

import { useState, useTransition, useRef, useEffect } from "react";
import { updateAuditTarget } from "@/app/properties/[slug]/pages/actions";

export function AuditTargetInput({
  pageId,
  initialTargetUrl,
  propertySlug,
}: {
  pageId: string;
  initialTargetUrl: string | null;
  propertySlug: string;
}) {
  const [current, setCurrent] = useState<string | null>(initialTargetUrl);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialTargetUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function save() {
    const previous = current;
    const next = draft.trim();
    if (next === (previous ?? "")) {
      setEditing(false);
      return;
    }
    setCurrent(next === "" ? null : next); // optimistic
    setEditing(false);
    setError(null);
    startTransition(async () => {
      const res = await updateAuditTarget(pageId, next, propertySlug);
      if (!res.ok) {
        setCurrent(previous); // revert
        setError(res.error);
      }
    });
  }

  function cancel() {
    setDraft(current ?? "");
    setEditing(false);
    setError(null);
  }

  if (editing) {
    return (
      <div className="mt-1 flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground shrink-0">→</span>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") cancel();
          }}
          placeholder="/target-path or https://…"
          className="flex-1 min-w-0 max-w-[220px] bg-card border rounded px-2 py-0.5 text-[10px] font-mono outline-none focus:border-foreground/40"
        />
      </div>
    );
  }

  if (!current) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={pending}
        className="mt-1 block text-[10px] text-amber-700 hover:text-amber-900 underline decoration-dotted underline-offset-2"
      >
        Set target →
      </button>
    );
  }

  return (
    <div className="mt-1 flex items-center gap-1 max-w-[220px]">
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={pending}
        className={`text-[10px] text-muted-foreground truncate text-left hover:text-foreground underline decoration-dotted underline-offset-2 ${
          pending ? "opacity-60" : ""
        }`}
        title={current}
      >
        → {current}
      </button>
      {error && (
        <span className="text-[10px] text-rose-700 shrink-0" title={error}>
          !
        </span>
      )}
    </div>
  );
}
