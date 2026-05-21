// /properties/[slug]/brand-dna/[section] — per-section editor.
//
// Dynamic catch-all for every subnav item that maps to a DB section. Uses
// the existing BrandDnaBodyEditor / BrandDnaContentEditor components — same
// editing UX as before V1.1 Phase 6, just scoped to one section per route.
//
// V1.1 scope: generic editor for every section. The bespoke table UIs the
// v2 mockup designs for Offerings (screen 13), Brand Terms (screen 14), and
// Proof (screen 15) are deferred — they get the same generic editor for now,
// flagged with a note in the page.

import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { BrandDnaBodyEditor } from "@/components/BrandDnaBodyEditor";
import { BrandDnaContentEditor } from "@/components/BrandDnaContentEditor";
import { findSubnav } from "@/lib/brand-dna-subnav";

type BrandDnaSection = {
  id: string;
  section: string;
  content: Record<string, unknown> | null;
  body: string | null;
  source: string | null;
  confidence: number | null;
};

async function getSection(
  propertySlug: string,
  sectionKey: string,
): Promise<BrandDnaSection | null> {
  const { data: prop } = await supabase
    .from("property")
    .select("id")
    .eq("slug", propertySlug)
    .single();
  if (!prop) return null;
  const { data } = await supabase
    .from("brand_dna_section")
    .select("id, section, content, body, source, confidence")
    .eq("property_id", prop.id)
    .eq("section", sectionKey)
    .maybeSingle();
  return (data as BrandDnaSection | null) ?? null;
}

// Offerings / Brand Terms / Proof have bespoke pages at sibling routes that
// override this dynamic catch-all (Next.js prefers specific over dynamic).
// Empty set kept for future use if other section types want a banner.
const BESPOKE_PENDING = new Set<string>();

export default async function SectionPage({
  params,
}: {
  params: Promise<{ slug: string; section: string }>;
}) {
  const { slug: propertySlug, section: routeSlug } = await params;
  const config = findSubnav(routeSlug);
  if (!config) notFound();

  // Subnav items without a DB section mapping (currently: seed-keywords).
  if (!config.section) {
    return (
      <div className="p-4 sm:p-8 max-w-3xl">
        <h1 className="text-xl font-semibold tracking-tight mb-1">
          {config.label}
        </h1>
        <p className="text-sm text-muted-foreground mb-5">
          New surface — schema lands in V1.2.
        </p>
        <div className="border rounded-lg bg-card p-6 text-sm text-muted-foreground leading-relaxed">
          <p>
            <strong className="text-foreground">{config.label}</strong> is a new
            subnav target without a corresponding schema yet. When the V1.2
            schema migration adds storage for it, this page wires up the editor.
          </p>
          <p className="mt-3 text-xs">
            Spec:{" "}
            <code className="bg-muted px-1 rounded">
              handoff/design/v2-screens.md
            </code>{" "}
            → screen 5 (subnav rationale).
          </p>
        </div>
      </div>
    );
  }

  const sectionRow = await getSection(propertySlug, config.section);
  const useBodyEditor =
    !sectionRow ||
    (sectionRow.body !== null && sectionRow.body !== undefined) ||
    sectionRow.content === null ||
    Object.keys(sectionRow.content).length === 0;

  return (
    <div className="p-4 sm:p-8 max-w-3xl">
      <header className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {config.label}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {sectionRow ? (
              <>
                {sectionRow.source && (
                  <>
                    <span>{sectionRow.source}</span>
                    {sectionRow.confidence != null && (
                      <>
                        {" · "}
                        <span className="tabular-nums">
                          confidence {sectionRow.confidence.toFixed(2)}
                        </span>
                      </>
                    )}
                  </>
                )}
                {!sectionRow.source && <>Section ready to edit.</>}
              </>
            ) : (
              <>Empty section — click any field to begin filling.</>
            )}
          </p>
        </div>
      </header>

      {BESPOKE_PENDING.has(config.section) && (
        <div className="mb-4 rounded-lg border border-dashed border-violet-200 bg-violet-50 px-3 py-2 text-[12px] text-violet-700 leading-relaxed">
          <strong className="font-semibold">Note:</strong> the v2 mockup designs
          a bespoke table UI for {config.label} (screen{" "}
          {config.section === "offerings"
            ? "13"
            : config.section === "brand_terms"
            ? "14"
            : "15"}
          ). For V1.1 the generic editor below renders the same data — bespoke
          layout lands in a follow-up.
        </div>
      )}

      {!sectionRow ? (
        <EmptyEditor propertySlug={propertySlug} />
      ) : (
        <div className="border rounded-lg bg-card p-5">
          {useBodyEditor ? (
            <BrandDnaBodyEditor
              sectionId={sectionRow.id}
              initialBody={sectionRow.body ?? ""}
              propertySlug={propertySlug}
            />
          ) : (
            <BrandDnaContentEditor
              sectionId={sectionRow.id}
              initialContent={sectionRow.content}
              propertySlug={propertySlug}
            />
          )}
        </div>
      )}
    </div>
  );
}

function EmptyEditor({ propertySlug }: { propertySlug: string }) {
  return (
    <div className="border border-dashed rounded-lg bg-muted/30 p-6 text-sm text-muted-foreground leading-relaxed">
      <p>
        This section has no row in <code className="bg-muted px-1 rounded">brand_dna_section</code>{" "}
        yet. The Research &amp; Fill pipeline (V2) creates these from inferred
        page content; for V1.1, run the backfill script from the agency env:
      </p>
      <pre className="mt-3 bg-card border rounded p-3 text-[11px] font-mono overflow-x-auto">
        cd ~/agency && uv run python ~/skyward-platform-app/scripts/backfill_brand_dna.py {propertySlug}
      </pre>
    </div>
  );
}
