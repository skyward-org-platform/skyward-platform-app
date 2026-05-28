"use client";

// Sub-tab strip for the Tracking surface. Holds active state via the
// `?view=` search param so deep-linking + back-button keep working.
// The three view bodies are server-rendered children passed in as
// `site` / `urls` / `keywords` props.

import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

type View = "site" | "urls" | "keywords";

const VIEWS: { value: View; label: string }[] = [
  { value: "site", label: "Sitewide" },
  { value: "urls", label: "Top URLs" },
  { value: "keywords", label: "Keywords" },
];

export function TrackingTabs({
  site,
  urls,
  keywords,
}: {
  site: ReactNode;
  urls: ReactNode;
  keywords: ReactNode;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const raw = sp.get("view") || "site";
  const view = (VIEWS.find((v) => v.value === raw)?.value ?? "site") as View;

  function setView(next: View) {
    const params = new URLSearchParams(sp.toString());
    if (next === "site") params.delete("view");
    else params.set("view", next);
    const qs = params.toString();
    router.push(qs ? `?${qs}` : "?", { scroll: false });
  }

  return (
    <div>
      <nav className="border-b mb-6 flex items-center gap-1">
        {VIEWS.map((v) => {
          const active = view === v.value;
          return (
            <button
              key={v.value}
              type="button"
              onClick={() => setView(v.value)}
              className={`text-[12px] font-medium px-3 py-2 border-b-2 transition-colors whitespace-nowrap ${
                active
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {v.label}
            </button>
          );
        })}
      </nav>

      <div>
        {view === "site" && site}
        {view === "urls" && urls}
        {view === "keywords" && keywords}
      </div>
    </div>
  );
}
