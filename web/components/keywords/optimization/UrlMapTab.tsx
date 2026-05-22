"use client";

// URL Map — every URL that touches at least one cluster, joined to its
// primary cluster for context. Score is the SERP-overlap pipeline's match
// confidence (higher = stronger primary). The cluster cell is editable
// via ClusterPicker; on change → setUrlClusterAssignment server action.
//
// Per-column filters: URL (text), cluster (text), score (numeric ≥).

import { useMemo, useState, useTransition } from "react";
import {
  EmptyTab,
  TabHeader,
  TableShell,
  UrlCell,
  fmtN,
} from "@/components/wqa/helpers";
import { ClusterPicker } from "../ClusterPicker";
import { setUrlClusterAssignment } from "@/app/properties/[slug]/keywords/actions";
import { TextFilter, NumericFilter, parseNumeric } from "../filters";
import type { KeywordsViewProps } from "../KeywordsView";
import type { ClusterRow } from "@/lib/clusters";

export function UrlMapTab(props: KeywordsViewProps) {
  const { urlAssignments, clusters, propertySlug } = props;

  const clusterById = useMemo(
    () => new Map(clusters.map((c) => [c.id, c])),
    [clusters],
  );

  const rows = useMemo(() => {
    return [...urlAssignments].sort((a, b) => b.score - a.score);
  }, [urlAssignments]);

  const [colFilters, setColFilters] = useState({
    url: "",
    cluster: "",
    score: "",
  });
  const setColFilter = <K extends keyof typeof colFilters>(
    k: K,
    v: (typeof colFilters)[K],
  ) => setColFilters((prev) => ({ ...prev, [k]: v }));

  const filtered = useMemo(() => {
    const u = colFilters.url.trim().toLowerCase();
    const c = colFilters.cluster.trim().toLowerCase();
    const s = parseNumeric(colFilters.score);
    return rows.filter((a) => {
      if (u && !a.url.toLowerCase().includes(u)) return false;
      if (c) {
        const cluster = clusterById.get(a.primary_cluster_id);
        const name = (cluster?.name_override || cluster?.head_term || "").toLowerCase();
        if (!name.includes(c)) return false;
      }
      if (s) {
        if (s.op === ">=" && !(a.score >= s.n)) return false;
        if (s.op === "<=" && !(a.score <= s.n)) return false;
        if (s.op === "=" && a.score !== s.n) return false;
      }
      return true;
    });
  }, [rows, colFilters, clusterById]);

  if (urlAssignments.length === 0) {
    return <EmptyTab message="No URL-to-cluster assignments yet." />;
  }

  return (
    <section>
      <TabHeader
        title="Mapping"
        subtitle={
          <>
            Every URL with a primary cluster assignment. Score is the
            SERP-overlap pipeline&rsquo;s match confidence. Pick a different
            cluster inline to override the algorithm.
          </>
        }
        count={filtered.length}
        total={urlAssignments.length}
      />

      <TableShell>
        <thead className="sticky top-0 bg-muted/80 backdrop-blur text-[10px] uppercase tracking-wider text-muted-foreground z-10">
          <tr>
            <th className="text-left px-3 py-2 font-medium min-w-[260px]">URL</th>
            <th className="text-left px-2 py-2 font-medium min-w-[220px]">
              Primary cluster
            </th>
            <th className="text-right px-2 py-2 font-medium">Score</th>
            <th className="text-right px-2 py-2 font-medium">Cluster size</th>
            <th className="text-right px-2 py-2 font-medium"># clusters</th>
          </tr>
          <tr className="bg-muted/60 border-t">
            <th className="px-3 py-1.5">
              <TextFilter
                value={colFilters.url}
                onChange={(v) => setColFilter("url", v)}
                placeholder="search URL…"
              />
            </th>
            <th className="px-2 py-1.5">
              <TextFilter
                value={colFilters.cluster}
                onChange={(v) => setColFilter("cluster", v)}
                placeholder="search cluster…"
              />
            </th>
            <th className="px-2 py-1.5">
              <NumericFilter
                value={colFilters.score}
                onChange={(v) => setColFilter("score", v)}
                placeholder="≥"
              />
            </th>
            <th />
            <th />
          </tr>
        </thead>
        <tbody>
          {filtered.map((a) => {
            const cluster = clusterById.get(a.primary_cluster_id);
            return (
              <UrlAssignmentRow
                key={a.id}
                url={a.url}
                score={a.score}
                cluster={cluster ?? null}
                clusters={clusters}
                propertySlug={propertySlug}
              />
            );
          })}
        </tbody>
      </TableShell>
    </section>
  );
}

function UrlAssignmentRow({
  url,
  score,
  cluster,
  clusters,
  propertySlug,
}: {
  url: string;
  score: number;
  cluster: ClusterRow | null;
  clusters: ClusterRow[];
  propertySlug: string;
}) {
  const [pending, startTransition] = useTransition();

  function onPickCluster(nextId: string) {
    startTransition(async () => {
      await setUrlClusterAssignment(propertySlug, url, nextId);
    });
  }

  return (
    <tr className="border-t hover:bg-muted/40">
      <td className="px-3 py-1.5 max-w-0">
        <UrlCell url={url} />
      </td>
      <td className="px-2 py-1.5">
        <ClusterPicker
          clusters={clusters}
          currentClusterId={cluster?.id ?? null}
          onChange={onPickCluster}
          disabled={pending}
        />
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {score.toFixed(2)}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
        {cluster ? fmtN(cluster.member_count) : "—"}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
        —
      </td>
    </tr>
  );
}
