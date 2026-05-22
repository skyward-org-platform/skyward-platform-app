"use client";

import { useSearchParams, useRouter } from "next/navigation";
import type { KeywordsViewProps } from "./KeywordsView";
import { UniverseTab } from "./discovery/UniverseTab";
import { SourcesTab } from "./discovery/SourcesTab";
import { ClusterMapTab } from "./discovery/ClusterMapTab";
import { ActionLegendTab } from "./discovery/ActionLegendTab";
import { UrlMapTab } from "./optimization/UrlMapTab";
import { OpportunitiesTab } from "./optimization/OpportunitiesTab";
import { ForecastingTab } from "./optimization/ForecastingTab";
import { CompetitiveGapTab } from "./optimization/CompetitiveGapTab";
import { CoverageTab } from "./optimization/CoverageTab";

const DISCOVERY_TABS = [
  ["universe", "Universe"],
  ["sources", "Sources"],
  ["clusters", "Cluster Map"],
  ["legend", "Action Legend"],
] as const;

const OPTIMIZATION_TABS = [
  ["url-map", "URL Map"],
  ["opportunities", "Opportunities"],
  ["forecasting", "Forecasting"],
  ["gap", "Competitive Gap"],
  ["coverage", "Coverage"],
] as const;

export function KeywordsModeShell(
  props: KeywordsViewProps & { mode: "discovery" | "optimization" },
) {
  const router = useRouter();
  const sp = useSearchParams();
  const tabs = props.mode === "discovery" ? DISCOVERY_TABS : OPTIMIZATION_TABS;
  const view = sp.get("view") || tabs[0][0];

  function setView(next: string) {
    const params = new URLSearchParams(sp.toString());
    params.set("view", next);
    router.push(`?${params.toString()}`);
  }

  return (
    <>
      <nav className="flex gap-1 border-b mb-4 overflow-x-auto">
        {tabs.map(([k, label]) => (
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

      {props.mode === "discovery" && (
        <>
          {view === "universe" && <UniverseTab {...props} />}
          {view === "sources" && <SourcesTab {...props} />}
          {view === "clusters" && <ClusterMapTab {...props} />}
          {view === "legend" && <ActionLegendTab />}
        </>
      )}
      {props.mode === "optimization" && (
        <>
          {view === "url-map" && <UrlMapTab {...props} />}
          {view === "opportunities" && <OpportunitiesTab {...props} />}
          {view === "forecasting" && <ForecastingTab />}
          {view === "gap" && <CompetitiveGapTab />}
          {view === "coverage" && <CoverageTab />}
        </>
      )}
    </>
  );
}
