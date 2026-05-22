"use client";

// Action Legend — static reference for the four taxonomies Phase 4 uses:
//   1. Action Types     (Optimize / Refresh / Rewrite / New / Remove)
//   2. Status meanings  (Not Started → Brief → Draft → Review → Published)
//   3. Priority Tiers   (1. Revenue-Critical → 5. Utility)
//   4. Page Types       (Homepage / Service / Fleet/Product / Location / …)
//
// Mirrors the structure of the /keywords Action Legend.

import { TabHeader } from "@/components/wqa/helpers";

type Entry = {
  label: string;
  band: string;
  dot: string;
  meaning: string;
};

const ACTION_TYPES: Entry[] = [
  {
    label: "Optimize",
    band: "bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
    meaning:
      "Page exists and ranks but underperforms. Tune title, headers, body coverage, internal links — keep the URL.",
  },
  {
    label: "Refresh",
    band: "bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
    meaning:
      "Page exists but content is stale or slipped. Update facts, add new sections, re-publish. Keep the URL.",
  },
  {
    label: "Rewrite",
    band: "bg-sky-50 text-sky-800",
    dot: "bg-sky-500",
    meaning:
      "Page exists but quality is too low to optimize. Tear down and rebuild against the target cluster.",
  },
  {
    label: "New",
    band: "bg-violet-50 text-violet-800",
    dot: "bg-violet-500",
    meaning:
      "No URL covers this cluster. Brief and author a new page from scratch.",
  },
  {
    label: "Remove",
    band: "bg-rose-50 text-rose-800",
    dot: "bg-rose-500",
    meaning:
      "Page should not exist. Redirect to a stronger URL or remove and let Phase 1 drive the cleanup.",
  },
];

const STATUSES: Entry[] = [
  {
    label: "Not Started",
    band: "bg-slate-100 text-slate-700",
    dot: "bg-slate-400",
    meaning:
      "Default state. The row is in the plan but no work has begun. Inline status changes move it forward.",
  },
  {
    label: "Brief",
    band: "bg-indigo-50 text-indigo-800",
    dot: "bg-indigo-500",
    meaning:
      "Brief is in progress — outlines, entities, FAQs, internal links being assembled before the writer picks it up.",
  },
  {
    label: "Draft",
    band: "bg-sky-50 text-sky-800",
    dot: "bg-sky-500",
    meaning:
      "Writer is producing the draft from the approved brief. Word count and draft link populate during this state.",
  },
  {
    label: "Review",
    band: "bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
    meaning:
      "Draft is complete and awaiting client (or editor) review. Feedback notes accumulate here.",
  },
  {
    label: "Published",
    band: "bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
    meaning:
      "Page is live at the published URL. Performance Tracker takes over from here — 30/60/90 day rank measurements.",
  },
];

const PRIORITIES: Entry[] = [
  {
    label: "1. Revenue-Critical",
    band: "bg-indigo-50 text-indigo-800",
    dot: "bg-indigo-500",
    meaning:
      "Top tier — pages that directly drive revenue. Hub services, top-of-funnel money keywords, fleet/product anchors.",
  },
  {
    label: "2. Page 1 Protect",
    band: "bg-sky-50 text-sky-800",
    dot: "bg-sky-500",
    meaning:
      "Pages already ranking on page one for valuable terms. Protect first, expand second.",
  },
  {
    label: "3. Striking Distance",
    band: "bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
    meaning:
      "Page-2 / position 11–20 — quick wins with the right optimization. High ROI per hour of work.",
  },
  {
    label: "4. Has Visibility",
    band: "bg-slate-100 text-slate-700",
    dot: "bg-slate-400",
    meaning:
      "Page is indexed and ranks somewhere but isn't a near-term priority. Maintain, don't invest.",
  },
  {
    label: "5. Utility",
    band: "bg-slate-100 text-slate-600",
    dot: "bg-slate-300",
    meaning:
      "Supporting pages — about, contact, policy. Not search-driven. Keep tidy; don't optimize for traffic.",
  },
];

const PAGE_TYPES: Entry[] = [
  {
    label: "Homepage",
    band: "bg-indigo-50 text-indigo-800",
    dot: "bg-indigo-500",
    meaning: "Root domain. One per property.",
  },
  {
    label: "Service Page",
    band: "bg-sky-50 text-sky-800",
    dot: "bg-sky-500",
    meaning:
      "The core money pages — one per primary service offering.",
  },
  {
    label: "Fleet/Product Page",
    band: "bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
    meaning:
      "Inventory / product detail pages — fleet vehicles, product SKUs, parts catalogs.",
  },
  {
    label: "Location Page",
    band: "bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
    meaning:
      "City / region / service-area landing pages, one per geo target.",
  },
  {
    label: "Blog Post",
    band: "bg-violet-50 text-violet-800",
    dot: "bg-violet-500",
    meaning:
      "Editorial article. Most informational + comparison content lives here.",
  },
  {
    label: "Blog Hub",
    band: "bg-sky-50 text-sky-700",
    dot: "bg-sky-400",
    meaning:
      "Top-level blog index. One per property.",
  },
  {
    label: "Blog Category",
    band: "bg-slate-100 text-slate-700",
    dot: "bg-slate-400",
    meaning:
      "Topic-grouped listing pages within the blog hub.",
  },
  {
    label: "Quote/Contact",
    band: "bg-rose-50 text-rose-800",
    dot: "bg-rose-500",
    meaning:
      "Conversion endpoints — quote forms, contact pages, lead capture.",
  },
  {
    label: "Utility",
    band: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/40",
    meaning:
      "About, policy, terms, careers — non-commercial supporting pages.",
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
            <div className="w-44 shrink-0 pt-0.5">
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
            Reference card for every label Phase 4 can assign — action types,
            statuses, priority tiers, and page types. Use this when a chip
            color needs context.
          </>
        }
        count={
          ACTION_TYPES.length +
          STATUSES.length +
          PRIORITIES.length +
          PAGE_TYPES.length
        }
      />

      <div className="space-y-5">
        <Section title="Action Types" entries={ACTION_TYPES} />
        <Section title="Status meanings" entries={STATUSES} />
        <Section title="Priority Tiers" entries={PRIORITIES} />
        <Section title="Page Types" entries={PAGE_TYPES} />
      </div>
    </section>
  );
}
