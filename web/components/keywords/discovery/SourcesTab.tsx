"use client";

// Sources — derived breakdown of the universe by ingestion source. One row
// per source with totals + retained count. Top-5 keywords per source by SV
// is deferred until BQ join lands (kga_output SV not in keyword table yet).

import { useMemo } from "react";
import {
  EmptyTab,
  TabHeader,
  TableShell,
} from "@/components/wqa/helpers";
import type { KeywordsViewProps } from "../KeywordsView";

type SourceKey = string; // KeywordSource | "(unknown)"

type SourceRow = {
  source: SourceKey;
  count: number;
  retained: number;
  excluded: number;
  candidate: number;
};

export function SourcesTab(props: KeywordsViewProps) {
  const { keywords } = props;

  const rows = useMemo<SourceRow[]>(() => {
    const buckets = new Map<SourceKey, SourceRow>();
    for (const k of keywords) {
      const key = (k.source ?? "(unknown)") as SourceKey;
      const r = buckets.get(key) ?? {
        source: key,
        count: 0,
        retained: 0,
        excluded: 0,
        candidate: 0,
      };
      r.count++;
      if (k.status === "Retained") r.retained++;
      else if (k.status === "Excluded") r.excluded++;
      else if (k.status === "Candidate") r.candidate++;
      buckets.set(key, r);
    }
    return Array.from(buckets.values()).sort((a, b) => b.count - a.count);
  }, [keywords]);

  if (keywords.length === 0) {
    return <EmptyTab message="No keywords ingested yet." />;
  }

  return (
    <section>
      <TabHeader
        title="Sources"
        subtitle={
          <>
            Where the universe came from. Each row counts the keywords
            ingested from that source and how curation has shaken out so far.
            Top-N by search volume per source is deferred to the BigQuery
            pass-through follow-up.
          </>
        }
        count={rows.length}
      />

      <TableShell>
        <thead className="sticky top-0 bg-muted/80 backdrop-blur text-[10px] uppercase tracking-wider text-muted-foreground z-10">
          <tr>
            <th className="text-left px-3 py-2 font-medium min-w-[160px]">
              Source
            </th>
            <th className="text-right px-2 py-2 font-medium">Total</th>
            <th className="text-right px-2 py-2 font-medium">Retained</th>
            <th className="text-right px-2 py-2 font-medium">Candidate</th>
            <th className="text-right px-2 py-2 font-medium">Excluded</th>
            <th className="text-right px-2 py-2 font-medium">Retained %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pct = r.count > 0 ? (r.retained / r.count) * 100 : 0;
            return (
              <tr key={r.source} className="border-t hover:bg-muted/40">
                <td className="px-3 py-1.5 text-[11.5px] font-medium">
                  {r.source}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {r.count.toLocaleString()}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700">
                  {r.retained.toLocaleString()}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {r.candidate.toLocaleString()}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-rose-700">
                  {r.excluded.toLocaleString()}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {pct.toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableShell>
    </section>
  );
}
