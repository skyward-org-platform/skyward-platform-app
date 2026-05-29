"use client";

// Inline Verify button for Redirect + Consolidate targets. Calls the v2
// server action verifyTargetUrl which (1) reads the row's target_url from
// wqa_decision, (2) hits the /api/verify-url route handler that follows
// the redirect chain (HEAD, ≤10 hops), (3) stamps last_implementation_check_at,
// and (4) optionally flips status → Done when the chain terminates 2xx/3xx.
//
// Shared by the URL drawer (Triage logic / Target URL section) and the
// Redirect + Consolidate tab rows. Each call site passes the source URL —
// the target is looked up server-side so the operator can't accidentally
// verify a stale value.
//
// Display: "<final status> → Done (N hops)" on success, "✗ <error>" on
// failure. The result string sticks around until the next click so the
// operator can read it after the dropdown closes.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { verifyTargetUrl } from "@/app/properties/[slug]/pages/wqa-actions";

export function VerifyButton({
  propertySlug,
  url,
  disabled,
  flipStatusOnSuccess = true,
  size = "default",
}: {
  propertySlug: string;
  url: string;
  /** True when the row has no target_url set — button stays disabled with a
   *  hint so the operator knows to enter a destination first. */
  disabled?: boolean;
  /** Default true: on a 2xx/3xx terminal status, flip wqa_decision.status to
   *  "Done". Pass false from places where the operator should explicitly own
   *  the status transition. */
  flipStatusOnSuccess?: boolean;
  /** "compact" trims padding for use in dense table rows. */
  size?: "default" | "compact";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ text: string; tone: "ok" | "warn" | "err" } | null>(null);
  const [actualDest, setActualDest] = useState<string | null>(null);
  const padding = size === "compact" ? "px-1.5 py-0.5" : "px-2 py-1";
  const btnCls = `text-[11px] ${padding} rounded border bg-foreground text-background disabled:opacity-50`;
  return (
    <div
      className="inline-flex items-center gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => {
          setResult(null);
          setActualDest(null);
          start(async () => {
            const r = await verifyTargetUrl(
              propertySlug,
              url,
              flipStatusOnSuccess,
            );
            if (!r.ok) {
              setResult({ text: `✗ ${r.error}`, tone: "err" });
            } else {
              const hops = r.chain.length;
              if (r.matched) {
                const flipped = r.flippedStatusToDone ? " → Done" : "";
                setResult({
                  text: `✓ ${r.finalStatus}${flipped} (${hops} hop${hops === 1 ? "" : "s"})`,
                  tone: "ok",
                });
              } else {
                setResult({
                  text: `≠ goes to a different URL (${hops} hop${hops === 1 ? "" : "s"})`,
                  tone: "warn",
                });
                setActualDest(r.actualDestination);
              }
              // Refresh RSC so the parent table / drawer reflect the new
              // last_implementation_check_at + status without a manual reload.
              router.refresh();
            }
          });
        }}
        className={btnCls}
        title={
          disabled
            ? "Set a target URL first"
            : "Follow the redirect chain and stamp last verified"
        }
      >
        {pending ? "Verifying…" : "Verify"}
      </button>
      {result && (
        <span
          className={
            "text-[10.5px] font-mono " +
            (result.tone === "ok"
              ? "text-emerald-700"
              : result.tone === "warn"
                ? "text-amber-700"
                : "text-rose-700")
          }
          title={actualDest ? `actual: ${actualDest}` : result.text}
        >
          {result.text}
          {actualDest && (
            <>
              {" "}
              <a
                href={actualDest}
                target="_blank"
                rel="noreferrer"
                className="underline"
                onClick={(e) => e.stopPropagation()}
              >
                {actualDest.replace(/^https?:\/\//, "")}
              </a>
            </>
          )}
        </span>
      )}
    </div>
  );
}
