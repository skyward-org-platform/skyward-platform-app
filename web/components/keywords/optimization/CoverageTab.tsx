"use client";

// Coverage — how much of each cluster's demand the current site footprint
// captures. Requires BQ rank + SV data for the same reason as Forecasting
// and Competitive Gap.

import { TabHeader } from "@/components/wqa/helpers";

export function CoverageTab() {
  return (
    <section>
      <TabHeader
        title="Coverage"
        subtitle={
          <>
            How much of each cluster&rsquo;s demand the current site footprint
            captures.
          </>
        }
        count={0}
      />

      <div className="border border-dashed rounded-lg bg-muted/30 p-8 text-center text-[12px] text-muted-foreground max-w-2xl">
        <div className="font-medium text-foreground mb-1">
          Coverage requires BigQuery access
        </div>
        <p className="leading-relaxed">
          The coverage view needs current client rank + cluster search volume
          from{" "}
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
