"use client";

// Flat single-row tab nav for the Phase 3 keyword surface. No more
// Discovery/Optimization mode switcher — every analytical surface is one
// click away. URL state via `?view=<tab>` only (the legacy `?mode=` param
// is stripped on switch).
//
// Tabs (in order):
//   Overview · Clusters · All Keywords · Mapping · Sources · Review Queue · Action Legend
//
// The mode-shell file has been deleted; the nav is inlined below.

import { useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { KeywordRow } from "@/lib/keywords";
import type {
  ClusterRow,
  ClusterMemberRow,
  UrlClusterAssignmentRow,
} from "@/lib/clusters";
import {
  UrlDrawer,
  type DrawerSubject,
  type KeywordDrawerSubject,
  type ClusterDrawerSubject,
} from "@/components/UrlDrawer";
import { OverviewTab } from "./OverviewTab";
import { UniverseTab } from "./discovery/UniverseTab";
import { SourcesTab } from "./discovery/SourcesTab";
import { ClusterMapTab } from "./discovery/ClusterMapTab";
import { ActionLegendTab } from "./discovery/ActionLegendTab";
import { ReviewQueueTab } from "./discovery/ReviewQueueTab";
import { UrlMapTab } from "./optimization/UrlMapTab";

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

export type RowClickHandler = (subject: DrawerSubject) => void;

const TABS = [
  ["overview", "Overview"],
  ["clusters", "Clusters"],
  ["universe", "All Keywords"],
  ["mapping", "Mapping"],
  ["sources", "Sources"],
  ["review-queue", "Review Queue"],
  ["legend", "Action Legend"],
] as const;

type TabKey = (typeof TABS)[number][0];

export function KeywordsView(props: KeywordsViewProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const rawView = sp.get("view") || "overview";
  const view: TabKey = (TABS.find(([k]) => k === rawView)?.[0] ?? "overview") as TabKey;

  const [drawerSubject, setDrawerSubject] = useState<DrawerSubject | null>(null);

  function setView(next: TabKey) {
    const params = new URLSearchParams(sp.toString());
    params.set("view", next);
    params.delete("mode"); // strip legacy mode param if present
    router.push(`?${params.toString()}`);
  }

  // ─── Cross-navigation hydrators (drawer ↔ drawer) ────────────────
  const clusterById = useMemo(
    () => new Map(props.clusters.map((c) => [c.id, c])),
    [props.clusters],
  );
  const keywordByText = useMemo(
    () => new Map(props.keywords.map((k) => [k.keyword, k])),
    [props.keywords],
  );
  const membersByCluster = useMemo(() => {
    const m = new Map<string, ClusterMemberRow[]>();
    for (const cm of props.clusterMembers) {
      const list = m.get(cm.cluster_id) ?? [];
      list.push(cm);
      m.set(cm.cluster_id, list);
    }
    return m;
  }, [props.clusterMembers]);
  const urlsByCluster = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const a of props.urlAssignments) {
      const list = m.get(a.primary_cluster_id) ?? [];
      list.push(a.url);
      m.set(a.primary_cluster_id, list);
    }
    return m;
  }, [props.urlAssignments]);
  const clusterIdByKeyword = useMemo(() => {
    const m = new Map<string, string>();
    for (const cm of props.clusterMembers) m.set(cm.keyword, cm.cluster_id);
    return m;
  }, [props.clusterMembers]);

  function hydrate(subject: DrawerSubject): DrawerSubject | null {
    if (subject.kind === "url") return subject;
    if (subject.kind === "keyword") {
      const stub = subject as KeywordDrawerSubject;
      const real = keywordByText.get(stub.keyword.keyword);
      if (!real) return null;
      const clusterId = clusterIdByKeyword.get(real.keyword) ?? null;
      const cluster = clusterId ? clusterById.get(clusterId) ?? null : null;
      const clusterName = cluster
        ? cluster.name_override || cluster.head_term
        : null;
      return {
        kind: "keyword",
        keyword: real,
        clusterName,
        clusterId,
      };
    }
    const stub = subject as ClusterDrawerSubject;
    const real = clusterById.get(stub.cluster.id);
    if (!real) return null;
    return {
      kind: "cluster",
      cluster: real,
      members: membersByCluster.get(real.id) ?? [],
      urlsInCluster: urlsByCluster.get(real.id) ?? [],
    };
  }

  const onRowClick: RowClickHandler = (subject) => {
    setDrawerSubject(hydrate(subject));
  };

  // Inline cluster-cell click handler (from UniverseTab / ReviewQueueTab).
  const onClusterClick = (cluster: ClusterRow) => {
    setDrawerSubject(
      hydrate({
        kind: "cluster",
        cluster,
        members: [],
        urlsInCluster: [],
      }),
    );
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Keywords</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Phase 3 keyword universe + SERP-overlap clusters + URL map for{" "}
          <span className="font-mono">{props.primaryDomain}</span>.
        </p>
      </header>

      <nav className="flex gap-1 border-b mb-5 overflow-x-auto">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setView(k as TabKey)}
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

      {view === "overview" && (
        <OverviewTab {...props} onRowClick={onRowClick} />
      )}
      {view === "clusters" && <ClusterMapTab {...props} onRowClick={onRowClick} />}
      {view === "universe" && (
        <UniverseTab
          {...props}
          onRowClick={onRowClick}
          onClusterClick={onClusterClick}
        />
      )}
      {view === "mapping" && <UrlMapTab {...props} />}
      {view === "sources" && <SourcesTab {...props} />}
      {view === "review-queue" && (
        <ReviewQueueTab
          {...props}
          onRowClick={onRowClick}
          onClusterClick={onClusterClick}
        />
      )}
      {view === "legend" && <ActionLegendTab />}

      <UrlDrawer
        subject={drawerSubject}
        onClose={() => setDrawerSubject(null)}
        propertySlug={props.propertySlug}
        propertyId={props.propertyId}
        primaryDomain={props.primaryDomain}
        onNavigate={(next) => setDrawerSubject(hydrate(next))}
      />
    </div>
  );
}
