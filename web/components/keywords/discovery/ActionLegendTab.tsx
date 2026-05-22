"use client";

// Action Legend — static reference for the three taxonomies Phase 3 uses:
//   1. Keyword status     (Retained / Excluded / Candidate)
//   2. Cluster priority   (High / Watch / Low / Unset)
//   3. Page action        (Build new / Optimize existing / Remove / Skip)
//
// Mirrors the structure of /pages ActionLegendTab so analysts get the same
// "what does this label mean?" reference card in both surfaces.

import { TabHeader } from "@/components/wqa/helpers";

type Entry = {
  label: string;
  band: string;
  dot: string;
  meaning: string;
};

const KEYWORD_STATUSES: Entry[] = [
  {
    label: "Retained",
    band: "bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
    meaning:
      "In scope. Client has at least one signal of intent — ranks for it, ingested it as a seed, or an analyst has confirmed it belongs.",
  },
  {
    label: "Candidate",
    band: "bg-slate-100 text-slate-700",
    dot: "bg-slate-400",
    meaning:
      "Auto-ingested from a source (Ahrefs / GSC / DFS / scraped) but not yet reviewed. Default state for new keywords.",
  },
  {
    label: "Excluded",
    band: "bg-rose-50 text-rose-800",
    dot: "bg-rose-500",
    meaning:
      "Out of scope. Wrong intent, brand mismatch, or otherwise not worth pursuing. Stays in the universe so it isn't re-ingested.",
  },
];

const CLUSTER_PRIORITIES: Entry[] = [
  {
    label: "High",
    band: "bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
    meaning:
      "Top-priority cluster — pursue immediately. High traffic ceiling and/or strategic fit.",
  },
  {
    label: "Watch",
    band: "bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
    meaning:
      "On the radar but not actioned yet. Monitor; re-evaluate next cycle.",
  },
  {
    label: "Low",
    band: "bg-slate-100 text-slate-700",
    dot: "bg-slate-400",
    meaning:
      "Real cluster but de-prioritized — thin volume, wrong intent, or already well-served.",
  },
  {
    label: "Unset",
    band: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/40",
    meaning: "Default state — not yet triaged.",
  },
];

const PAGE_ACTIONS: Entry[] = [
  {
    label: "Build new",
    band: "bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
    meaning:
      "Cluster has demand but no URL covers it. Brief + author a new page for the head term.",
  },
  {
    label: "Optimize existing",
    band: "bg-sky-50 text-sky-700",
    dot: "bg-sky-500",
    meaning:
      "A URL already serves this cluster. Tune title, body, and internal links to consolidate ranking.",
  },
  {
    label: "Remove",
    band: "bg-rose-50 text-rose-800",
    dot: "bg-rose-500",
    meaning:
      "Cluster is off-strategy. Don't build, and consider removing any thin URL competing for it.",
  },
  {
    label: "Skip",
    band: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/40",
    meaning:
      "Not actionable this cycle. Revisit next pass — no work generated downstream.",
  },
];

function Section({ title, entries }: { title: string; entries: Entry[] }) {
  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      <div className="border-b px-4 py-2.5 bg-muted/30">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
          {title}
        </div>
      </div>
      <ul className="divide-y">
        {entries.map((e) => (
          <li key={e.label} className="flex gap-4 px-5 py-3 items-start">
            <div className="w-32 shrink-0 pt-0.5">
              <span
                className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${e.band}`}
              >
                <span className={`size-1.5 rounded-full ${e.dot}`} />
                {e.label}
              </span>
            </div>
            <div className="flex-1 min-w-0 text-[12px] leading-relaxed">
              {e.meaning}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ActionLegendTab() {
  return (
    <section>
      <TabHeader
        title="Action Legend"
        subtitle={
          <>
            Reference card for every label Phase 3 can assign — keyword
            statuses, cluster priorities, and page actions. Use this when a
            chip color needs context.
          </>
        }
        count={
          KEYWORD_STATUSES.length + CLUSTER_PRIORITIES.length + PAGE_ACTIONS.length
        }
      />

      <div className="space-y-5">
        <Section title="Keyword statuses" entries={KEYWORD_STATUSES} />
        <Section title="Cluster priorities" entries={CLUSTER_PRIORITIES} />
        <Section title="Page actions" entries={PAGE_ACTIONS} />
      </div>
    </section>
  );
}
