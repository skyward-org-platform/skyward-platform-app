"use client";

// Triggers the runAuthorityRefresh server action, which fans out to the
// Python /api/authority/refresh endpoint. Disables while pending and
// alert()s on error — same pattern used elsewhere for write-token guarded
// actions.

import { useTransition } from "react";
import { runAuthorityRefresh } from "@/app/properties/[slug]/authority/actions";

export function RefreshButton({ slug }: { slug: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() =>
        start(async () => {
          const r = await runAuthorityRefresh(slug);
          if (!r.ok) alert(`Refresh failed: ${r.error}`);
        })
      }
      disabled={pending}
      className="text-xs px-3 py-1.5 rounded border bg-foreground text-background disabled:opacity-50"
    >
      {pending ? "Refreshing…" : "Refresh data"}
    </button>
  );
}
