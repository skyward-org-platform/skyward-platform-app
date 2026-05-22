"use client";

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

export type RowClickHandler = (subject: DrawerSubject) => void;

export function KeywordsView(props: KeywordsViewProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const mode = (sp.get("mode") || "discovery") as Mode;

  const [drawerSubject, setDrawerSubject] = useState<DrawerSubject | null>(null);

  function setMode(next: Mode) {
    const params = new URLSearchParams(sp.toString());
    params.set("mode", next);
    params.delete("view");
    router.push(`?${params.toString()}`);
  }

  // When the drawer cross-navigates (cluster member → keyword drawer,
  // keyword → cluster drawer) we need to hydrate the stub subject from
  // local props since the stub only carries an id / keyword string.
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
      // Hydrate stub keyword drawer (from cluster → member crosslink).
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
    // cluster — hydrate from id, attach members + urls.
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

      <KeywordsModeShell mode={mode} {...props} onRowClick={onRowClick} />

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
