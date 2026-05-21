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
  { slug: "commercial-policy", label: "Commercial Policy", section: "goals" },
  { slug: "audiences",         label: "Audiences",         section: "future_audience", countable: true },
  { slug: "personas",          label: "Personas",          section: "personas",        countable: true },
  { slug: "seed-keywords",     label: "Seed Keywords",     section: "seed_keywords",   countable: true },
];

/** Find the subnav config for a given URL slug. */
export function findSubnav(slug: string): SubnavItem | undefined {
  return BRAND_DNA_SUBNAV.find((i) => i.slug === slug);
}

/** The 12 schema-level sections rendered as the Completeness checklist on
 *  the Brand DNA Overview. Distinct from the subnav (which is 11 items,
 *  some of which don't map to schema sections). */
export const COMPLETENESS_SECTIONS: { key: string; label: string }[] = [
  { key: "identity",        label: "Identity" },
  { key: "brand_story",     label: "Brand Story" },
  { key: "voice_tone",      label: "Voice & Tone" },
  { key: "brand_terms",     label: "Brand Terms" },
  { key: "proof",           label: "Proof" },
  { key: "future_audience", label: "Audiences" },
  { key: "personas",        label: "Personas" },
  { key: "offerings",       label: "Offerings" },
  { key: "site_structure",  label: "Site Structure" },
  { key: "goals",           label: "Commercial Policy" },
  { key: "positioning",     label: "Positioning" },
  { key: "competitors",     label: "Competitors" },
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
