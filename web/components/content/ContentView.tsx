"use client";

import { useSearchParams, useRouter } from "next/navigation";
import type { ContentRow } from "@/lib/content-rows";
import type { ClusterRow } from "@/lib/clusters";
import { OverviewTab } from "./OverviewTab";
import { MasterPlanTab } from "./MasterPlanTab";
import { SprintCalendarTab } from "./SprintCalendarTab";
import { PerformanceTrackerTab } from "./PerformanceTrackerTab";
import { ActionLegendTab } from "./ActionLegendTab";

const TABS = [
  ["overview", "Overview"],
  ["plan", "Master Plan"],
  ["calendar", "Sprint Calendar"],
  ["tracker", "Performance Tracker"],
  ["legend", "Action Legend"],
] as const;

export type ContentViewProps = {
  propertySlug: string;
  propertyId: string;
  propertyName: string;
  primaryDomain: string | null;
  rows: ContentRow[];
  clusters: ClusterRow[];
};

export function ContentView(props: ContentViewProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const view = sp.get("view") || "overview";

  function setView(next: string) {
    const params = new URLSearchParams(sp.toString());
    params.set("view", next);
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Phase 4 master content plan for{" "}
          <span className="font-mono">{props.primaryDomain}</span>.{" "}
          {props.rows.length.toLocaleString()} rows.
        </p>
      </header>

      <nav className="flex gap-1 border-b mb-4 overflow-x-auto">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setView(k)}
            className={
              "px-3 py-1.5 text-sm border-b-2 -mb-px whitespace-nowrap " +
              (view === k
                ? "border-foreground font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            {label}
          </button>
        ))}
      </nav>

      {view === "overview" && <OverviewTab {...props} />}
      {view === "plan" && <MasterPlanTab {...props} />}
      {view === "calendar" && <SprintCalendarTab {...props} />}
      {view === "tracker" && <PerformanceTrackerTab {...props} />}
      {view === "legend" && <ActionLegendTab />}
    </div>
  );
}
