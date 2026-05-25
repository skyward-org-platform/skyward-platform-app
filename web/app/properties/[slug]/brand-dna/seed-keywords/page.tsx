// Seed Keywords - Brand DNA Phase 0 Tab 6 (per intake SOP).
// Supabase property_seed_keyword is the source of truth (operator
// owns). BigQuery SEOPipeline.seed_keywords is the legacy intake-form
// upload from Adam's pipeline; one-shot import via the button.

import { getPropertyBySlug } from "@/lib/property";
import {
  getSeedKeywordsForProperty,
  type SeedKeyword,
} from "@/lib/seed-keywords";
import { apiBase } from "@/lib/api-base";
import { SeedKeywordsEditor } from "@/components/SeedKeywordsEditor";

type BqProbeResult = { count: number };

async function probeBqSourceCount(slug: string): Promise<number> {
  try {
    const r = await fetch(
      `${apiBase()}/api/properties/${slug}/seed-keywords/bq-source`,
      { next: { revalidate: 300 } },
    );
    if (!r.ok) return 0;
    const j = (await r.json()) as BqProbeResult;
    return j.count ?? 0;
  } catch {
    return 0;
  }
}

export default async function SeedKeywordsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const property = await getPropertyBySlug(slug);
  if (!property) {
    return (
      <div className="px-8 py-6 text-[12px] text-muted-foreground">
        Property not found.
      </div>
    );
  }
  const [seedKeywords, bqSourceCount] = await Promise.all([
    getSeedKeywordsForProperty(property.id),
    probeBqSourceCount(slug),
  ]);
  const showImportButton = seedKeywords.length === 0 && bqSourceCount > 0;

  return (
    <div className="px-8 py-6 max-w-6xl">
      <header className="mb-5">
        <h2 className="text-lg font-semibold tracking-tight">Seed Keywords</h2>
        <p className="text-[12px] text-muted-foreground mt-1 leading-snug max-w-3xl">
          Starting keywords for the SEO research pipeline. The Phase 3 cluster
          builder expands these into thousands of related keywords. Aim for
          20-100+ seeds across a mix of head terms, long-tail, locations, and
          intents. Add, remove, or update entries below.
        </p>
      </header>

      <SeedKeywordsEditor
        propertySlug={slug}
        initialSeedKeywords={seedKeywords as SeedKeyword[]}
        bqSourceCount={bqSourceCount}
        showImportButton={showImportButton}
      />

      <aside className="mt-6 text-[10.5px] text-muted-foreground leading-relaxed max-w-3xl">
        <strong className="text-foreground">Source of truth:</strong> Supabase{" "}
        <span className="font-mono">property_seed_keyword</span>. BigQuery{" "}
        <span className="font-mono">SEOPipeline.seed_keywords</span> is the
        legacy intake-form upload; rows can be imported via the button above
        (one-shot) when this list is empty.
      </aside>
    </div>
  );
}
