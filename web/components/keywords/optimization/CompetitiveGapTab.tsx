"use client";

// Competitive Gap — clusters where competitors rank but the client
// doesn't, sized by demand. Requires the same BQ kga_output read as
// Forecasting + a competitor-rank join, both deferred.

import { TabHeader } from "@/components/wqa/helpers";

export function CompetitiveGapTab() {
  return (
    <section>
      <TabHeader
        title="Competitive Gap"
        subtitle={
          <>
            Clusters where competitors rank but the client doesn&rsquo;t,
            sized by demand.
          </>
        }
        count={0}
      />

      <div className="border border-dashed rounded-lg bg-muted/30 p-8 text-center text-[12px] text-muted-foreground max-w-2xl">
        <div className="font-medium text-foreground mb-1">
          Competitive Gap requires BigQuery access
        </div>
        <p className="leading-relaxed">
          The gap view joins client rank against the competitor SERP set in{" "}
          <code className="bg-card border rounded px-1 text-[11px]">
            kga_output
          </code>
          , which isn&rsquo;t mirrored into Supabase yet. Wiring is deferred
          to a follow-up — see the plan&rsquo;s &ldquo;Out of scope&rdquo;
          section.
        </p>
      </div>
    </section>
  );
}
