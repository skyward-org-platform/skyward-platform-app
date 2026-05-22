"use client";

// Forecasting — projected traffic / value lift per cluster from realistic
// rank gains. Requires a BigQuery read against kga_output for current rank
// + search volume, which isn't surfaced through Supabase yet. Wiring is
// deferred to a follow-up that adds a BQ pass-through endpoint mirroring
// /api/wqa/pages.

import { TabHeader } from "@/components/wqa/helpers";

export function ForecastingTab() {
  return (
    <section>
      <TabHeader
        title="Forecasting"
        subtitle={
          <>
            Projected traffic and revenue lift per cluster from realistic rank
            improvements.
          </>
        }
        count={0}
      />

      <div className="border border-dashed rounded-lg bg-muted/30 p-8 text-center text-[12px] text-muted-foreground max-w-2xl">
        <div className="font-medium text-foreground mb-1">
          Forecasting requires BigQuery access
        </div>
        <p className="leading-relaxed">
          The forecast view reads current rank + search volume from{" "}
          <code className="bg-card border rounded px-1 text-[11px]">
            kga_output
          </code>
          , which isn&rsquo;t mirrored into Supabase yet. Wiring is deferred to
          a follow-up — see the plan&rsquo;s &ldquo;Out of scope&rdquo;
          section.
        </p>
      </div>
    </section>
  );
}
