// Shared subnav config for /properties/[slug]/brand-dna/*.
// Used by the sub-layout (to render the subnav strip) AND the dynamic
// [section]/page.tsx (to resolve a URL slug → DB section enum).
//
// Per v2-screens.md screen 5: the subnav has 10 items ordered by editing
// journey. We add Proof as the 11th (screen 15 defines it). Each item maps
// onto an existing brand_dna_section enum value where possible. Items
// without a clean schema mapping show a "coming soon" placeholder for V1.1.

export type SubnavItem = {
  /** URL slug under /brand-dna/. Empty string = the Overview default. */
  slug: string;
  /** UI label. */
  label: string;
  /** brand_dna_section.section enum value, or null if no DB mapping. */
  section: string | null;
  /** Show a count chip on the subnav item. */
  countable?: boolean;
};

export const BRAND_DNA_SUBNAV: SubnavItem[] = [
  { slug: "",                  label: "Overview",          section: null },
  { slug: "identity",          label: "Identity",          section: "identity" },
  { slug: "voice-tone",        label: "Voice & Tone",      section: "voice_tone" },
  { slug: "offerings",         label: "Offerings",         section: "offerings",       countable: true },
  { slug: "brand-terms",       label: "Brand Terms",       section: "brand_terms",     countable: true },
  { slug: "proof",             label: "Proof",             section: "proof",           countable: true },
  { slug: "site-structure",    label: "Site Structure",    section: "site_structure" },
  { slug: "competitors",       label: "Competitors",       section: "competitors" },
  { slug: "commercial-policy", label: "Commercial Policy", section: "goals" },
  { slug: "audiences",         label: "Audiences",         section: "future_audience", countable: true },
  { slug: "personas",          label: "Personas",          section: "personas",        countable: true },
  { slug: "seed-keywords",     label: "Seed Keywords",     section: "seed_keywords",   countable: true },
];

/** Find the subnav config for a given URL slug. */
export function findSubnav(slug: string): SubnavItem | undefined {
  return BRAND_DNA_SUBNAV.find((i) => i.slug === slug);
}

/** Sections rendered as the Completeness checklist on the Brand DNA
 *  Overview. Aligned with BRAND_DNA_SUBNAV so the denominator only
 *  counts sections that actually have a UI tab to fill in.
 *
 *  Previous incorrect entries dropped:
 *   - 'brand_story' and 'positioning' are sub-fields inside the Identity
 *     section, not standalone sections (per identity/page.tsx). Including
 *     them as separate completeness items made 100% unreachable.
 *
 *  Two entries map to Supabase tables (not brand_dna_section):
 *   - 'competitors' lives in property_competitor
 *   - 'seed_keywords' lives in property_seed_keyword
 *  The Overview's computeFilled handles those two special-case lookups. */
export const COMPLETENESS_SECTIONS: { key: string; label: string }[] = [
  { key: "identity",        label: "Identity" },
  { key: "voice_tone",      label: "Voice & Tone" },
  { key: "offerings",       label: "Offerings" },
  { key: "brand_terms",     label: "Brand Terms" },
  { key: "proof",           label: "Proof" },
  { key: "site_structure",  label: "Site Structure" },
  { key: "competitors",     label: "Competitors" },
  { key: "goals",           label: "Commercial Policy" },
  { key: "future_audience", label: "Audiences" },
  { key: "personas",        label: "Personas" },
  { key: "seed_keywords",   label: "Seed Keywords" },
];

/** Map a section key to the subnav URL slug if the section is navigable. */
export function subnavSlugForSection(section: string): string | null {
  const item = BRAND_DNA_SUBNAV.find((i) => i.section === section);
  return item ? item.slug : null;
}

/** Count entries in a section's content for the subnav badge.
 *  Heuristic: top-level arrays' lengths summed, or 1 if the content is a
 *  non-empty object. Returns null if unknown. */
export function countItemsInContent(
  content: Record<string, unknown> | null | undefined,
): number | null {
  if (!content) return null;
  const arrayLengths = Object.values(content).filter((v): v is unknown[] =>
    Array.isArray(v),
  );
  if (arrayLengths.length > 0) {
    return arrayLengths.reduce((sum, arr) => sum + arr.length, 0);
  }
  const filled = Object.values(content).some(
    (v) => v !== null && v !== undefined && v !== "",
  );
  return filled ? 1 : 0;
}
