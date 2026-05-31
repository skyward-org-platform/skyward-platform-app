"use client";

// Confirm modal for the Authority "Run audit" affordance. Lets the operator
// pick quick (3K unit cap, metrics + top 100 RDs) vs full (10K unit cap,
// + 200 backlinks + 100 anchors) before kicking off runLinkAudit.
//
// We surface UNIT caps only, not dollar estimates. Ahrefs unit pricing is
// subscription-tier dependent and we don't have that wired in — operator
// reads the Ahrefs dashboard for their per-unit cost and remaining
// allowance. The actual units consumed is reported back in the success
// flash from the server.

import { useState } from "react";

type Mode = "quick" | "full";

export function RunAuditModal({
  domain,
  onCancel,
  onRun,
  pending,
}: {
  domain: string;
  onCancel: () => void;
  onRun: (mode: Mode) => void;
  pending: boolean;
}) {
  const [mode, setMode] = useState<Mode>("quick");

  return (
    <div className="fixed inset-0 z-50 flex justify-center items-start pt-24">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => !pending && onCancel()}
      />
      <div className="relative bg-background border rounded-lg max-w-md w-full mx-4 p-5 shadow-xl">
        <div className="text-sm font-semibold mb-1">Run Ahrefs audit</div>
        <p className="text-xs text-muted-foreground mb-4">
          Pull live metrics, referring domains, and (in full mode) sample
          backlinks for{" "}
          <span className="font-mono">{domain}</span>. Results write to
          backlink, referring_domain, disavow_entry, and link_audit tables.
        </p>

        <div className="space-y-2 mb-4">
          <ModeOption
            value="quick"
            current={mode}
            onChange={setMode}
            title="Quick"
            sub="Metrics + top 100 RDs by DR. Hard cap 3,000 units."
          />
          <ModeOption
            value="full"
            current={mode}
            onChange={setMode}
            title="Full"
            sub="Quick + 200 backlinks + 100 anchors. Hard cap 10,000 units."
          />
        </div>

        <div className="text-[11px] text-muted-foreground mb-4 border-l-2 border-amber-300 pl-2 bg-amber-50/40 py-1">
          Cap aborts the run mid-flight if exceeded; no override. Check your
          Ahrefs dashboard for per-unit cost on your subscription tier and
          remaining unit allowance. Actual units consumed report after the
          run.
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded border hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onRun(mode)}
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded border bg-foreground text-background disabled:opacity-50"
          >
            {pending ? "Running…" : `Run ${mode} audit`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeOption({
  value,
  current,
  onChange,
  title,
  sub,
}: {
  value: Mode;
  current: Mode;
  onChange: (m: Mode) => void;
  title: string;
  sub: string;
}) {
  const active = current === value;
  return (
    <label
      className={
        "flex gap-2 items-start border rounded-md p-3 cursor-pointer " +
        (active
          ? "border-foreground bg-muted/40"
          : "border-border hover:bg-muted/20")
      }
    >
      <input
        type="radio"
        name="audit-mode"
        value={value}
        checked={active}
        onChange={() => onChange(value)}
        className="mt-0.5"
      />
      <div className="text-xs">
        <div className="font-semibold">{title}</div>
        <div className="text-muted-foreground mt-0.5">{sub}</div>
      </div>
    </label>
  );
}
