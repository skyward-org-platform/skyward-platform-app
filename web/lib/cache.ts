// Tag constants + helpers for Next.js data cache. Centralizing here so
// the busting paths (revalidateTag after a write action) and the
// reading paths (next: { tags } on a fetch / unstable_cache wrapper)
// stay in sync.

export const CACHE_TAGS = {
  /** Sidebar's clients + properties list. Bust when a property or
   *  client is added/renamed. */
  sidebar: "sidebar",
  /** Workspace signals count (active, non-snoozed signals). Bust on
   *  signal snooze/unsnooze, brand_dna_section edits, page audit decisions. */
  signals: "signals",
  /** Per-property hero metrics + project types. Bust on brand_dna_section,
   *  page audit, or project changes for that property. */
  property: (slug: string) => `property:${slug}`,
  /** WQA aggregate per domain. Bust on WQA re-run (next run pulls
   *  via the same domain key). */
  wqa: (domain: string) => `wqa:${domain.toLowerCase()}`,
  /** Brand DNA section data per property. Bust on any section save. */
  brandDna: (slug: string) => `brand-dna:${slug}`,
  /** LLM usage rollup per property. Bust after any LLM call lands. */
  llmUsage: (slug: string) => `llm-usage:${slug}`,
} as const;

/** Default TTL for "rarely changes" data — sidebar, property metadata.
 *  After a user action busts the relevant tag, the next render is fresh. */
export const DEFAULT_TTL = 60;
/** Shorter TTL for live-edited data (hero metrics, signals). */
export const HOT_TTL = 30;
