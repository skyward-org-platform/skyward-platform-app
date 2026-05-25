// Competitors - Brand DNA Phase 0 Tab 4.
// Source of truth is the Supabase property_competitor table (operator
// owns this data going forward). BQ Meta is a one-time seed via the
// 'Import from BQ Meta' action when the table is empty for a property.
//
// Columns mirror the P0 intake Excel: domain / priority / notes.

import { getPropertyBySlug } from "@/lib/property";
import {
  getCompetitorsForProperty,
  type Competitor,
} from "@/lib/competitors";
import { apiBase } from "@/lib/api-base";
import { CompetitorsEditor } from "@/components/CompetitorsEditor";

type BqProbeResult = { count: number };

async function probeBqMetaCount(slug: string): Promise<number> {
  try {
    const r = await fetch(`${apiBase()}/api/properties/${slug}/competitors`, {
      next: { revalidate: 300 },
    });
    if (!r.ok) return 0;
    const j = (await r.json()) as BqProbeResult;
    return j.count ?? 0;
  } catch {
    return 0;
  }
}

export default async function CompetitorsPage({
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
  const [competitors, bqMetaCount] = await Promise.all([
    getCompetitorsForProperty(property.id),
    probeBqMetaCount(slug),
  ]);
  // If Supabase already has any competitors for this property, the
  // import button is hidden - the operator already owns this list.
  const showImportButton = competitors.length === 0 && bqMetaCount > 0;

  return (
    <div className="px-8 py-6 max-w-5xl">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-lg font-semibold tracking-tight">Competitors</h2>
          <p className="text-[12px] text-muted-foreground mt-1 leading-snug">
            Competitor list for this property per the Phase 0 intake. Add,
            remove, or update entries below; this list feeds keyword gap
            analysis (Phase 3) and authority benchmarking (Phase 5).
          </p>
        </div>
      </header>

      <CompetitorsEditor
        propertySlug={slug}
        initialCompetitors={competitors as Competitor[]}
        bqMetaCount={bqMetaCount}
        showImportButton={showImportButton}
      />

      <aside className="mt-6 text-[10.5px] text-muted-foreground leading-relaxed">
        <strong className="text-foreground">Source of truth:</strong> Supabase{" "}
        <span className="font-mono">property_competitor</span>. BigQuery{" "}
        <span className="font-mono">Meta.client_domains</span> is the legacy
        seed; rows can be imported via the button above (one-shot) when this
        list is empty.
      </aside>
    </div>
  );
}
