"use client";

import { useSearchParams, useRouter } from "next/navigation";
import type { KeywordRow } from "@/lib/keywords";
import type {
  ClusterRow,
  ClusterMemberRow,
  UrlClusterAssignmentRow,
} from "@/lib/clusters";
import { KeywordsModeShell } from "./KeywordsModeShell";

type Mode = "discovery" | "optimization";

export type KeywordsViewProps = {
  propertySlug: string;
  propertyId: string;
  propertyName: string;
  primaryDomain: string | null;
  keywords: KeywordRow[];
  clusters: ClusterRow[];
  clusterMembers: ClusterMemberRow[];
  urlAssignments: UrlClusterAssignmentRow[];
};

export function KeywordsView(props: KeywordsViewProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const mode = (sp.get("mode") || "discovery") as Mode;

  function setMode(next: Mode) {
    const params = new URLSearchParams(sp.toString());
    params.set("mode", next);
    params.delete("view");
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Keywords</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Phase 3 keyword universe + SERP-overlap clusters + URL map for{" "}
          <span className="font-mono">{props.primaryDomain}</span>. Curate the
          universe in Discovery; act on it in Optimization.
        </p>
      </header>

      <div className="mb-5 inline-flex rounded-md border bg-muted p-0.5">
        {(["discovery", "optimization"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={
              "px-4 py-1.5 text-xs font-semibold uppercase tracking-wider rounded " +
              (mode === m
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {m}
          </button>
        ))}
      </div>

      <KeywordsModeShell mode={mode} {...props} />
    </div>
  );
}
