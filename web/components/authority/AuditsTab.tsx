"use client";

// AuditsTab — list of audit_doc cards. Opens the inlined markdown in a
// modal overlay (no markdown rendering this chunk; raw text in a <pre>).

import { useState } from "react";
import type { AuthorityViewProps } from "./AuthorityView";
import type { AuditDocRow } from "@/lib/authority";

export function AuditsTab({ audits }: AuthorityViewProps) {
  const [open, setOpen] = useState<AuditDocRow | null>(null);

  if (audits.length === 0) {
    return (
      <div className="text-xs text-muted-foreground p-4 border border-dashed rounded-lg bg-muted/30 text-center">
        No audits yet.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {audits.map((a) => (
          <div key={a.id} className="border rounded-lg p-4 bg-card">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{a.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {new Date(a.generated_at).toLocaleDateString()} ·{" "}
                  {a.generated_by || "unknown"}
                </div>
              </div>
              <div className="flex gap-2">
                {a.markdown && (
                  <button
                    onClick={() => setOpen(a)}
                    className="text-xs px-2 py-1 rounded border hover:bg-muted"
                  >
                    Open
                  </button>
                )}
                {a.filepath && (
                  <button
                    onClick={() => navigator.clipboard.writeText(a.filepath!)}
                    className="text-xs px-2 py-1 rounded border hover:bg-muted"
                  >
                    Copy path
                  </button>
                )}
              </div>
            </div>
            {a.notes && (
              <div className="text-xs mt-2 text-muted-foreground">{a.notes}</div>
            )}
          </div>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-center items-start pt-12">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(null)}
          />
          <div className="relative bg-background border rounded-lg max-w-3xl w-full max-h-[80vh] overflow-y-auto p-6 mx-4">
            <div className="flex items-baseline justify-between mb-4">
              <h3 className="text-lg font-semibold">{open.title}</h3>
              <button
                onClick={() => setOpen(null)}
                className="text-sm text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <pre className="whitespace-pre-wrap text-xs font-mono">
              {open.markdown}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}
