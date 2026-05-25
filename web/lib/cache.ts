// Cache tag constants for unstable_cache + updateTag/revalidateTag.
//
// unstable_cache only accepts a static tags array at definition time, so
// tags are coarse (per-data-type, not per-property). Mutating ANY
// property's brand DNA invalidates the cached reader for ALL properties.
// Acceptable for a single-tenant agency app — next read just re-fetches.

export const CACHE_TAGS = {
  /** brand_dna_section reads. Bust on any section save. */
  brandDna: "brand-dna",
  /** wqa_decision reads. Bust on any WQA decision write. */
  wqaDecisions: "wqa-decisions",
  /** Workspace signal count. Bust on snoozed_signal + page audit + brand_dna_section writes. */
  signals: "signals",
} as const;

/** Default cache lifetime for data reads (seconds). After a user action
 *  busts the relevant tag, the next render is fresh anyway. */
export const TTL = {
  /** brand_dna_section, wqa_decision — change occasionally. */
  data: 60,
  /** signalCount — sidebar badge should feel fresh. */
  fast: 30,
};
