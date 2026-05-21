"use client";

// Snooze / Unsnooze affordance for a single signal row. Optimistic UI.
//
// On success, the parent revalidates the page (action calls revalidatePath)
// so counts and bucketing reflect the new state on the next render.

import { useState, useTransition } from "react";
import {
  snoozeSignal,
  unsnoozeSignal,
} from "@/app/signals/actions";

export function SnoozeButton({
  signalId,
  variant = "snooze",
  compact,
}: {
  signalId: string;
  variant?: "snooze" | "unsnooze";
  compact?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function go() {
    setError(null);
    startTransition(async () => {
      const res =
        variant === "snooze"
          ? await snoozeSignal(signalId)
          : await unsnoozeSignal(signalId);
      if (!res.ok) setError(res.error);
    });
  }

  const cls = compact
    ? "text-xs font-medium px-2.5 py-1 border rounded-md text-foreground hover:bg-muted whitespace-nowrap shrink-0 disabled:opacity-60"
    : "text-sm font-medium px-3 py-1.5 border rounded-md text-foreground hover:bg-muted whitespace-nowrap shrink-0 disabled:opacity-60";

  return (
    <div className="inline-flex items-center gap-2">
      <button type="button" onClick={go} disabled={pending} className={cls}>
        {pending
          ? variant === "snooze"
            ? "Snoozing…"
            : "Unsnoozing…"
          : variant === "snooze"
          ? "Snooze"
          : "Unsnooze"}
      </button>
      {error && (
        <span className="text-[10px] text-rose-700" title={error}>
          !
        </span>
      )}
    </div>
  );
}
