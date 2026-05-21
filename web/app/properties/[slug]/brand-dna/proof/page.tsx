// Proof Assets — v2 screen 15. Bespoke table editor.
//
// Data shape: brand_dna_section.content.assets = [{title, type, active}, …]
// (canonical). We also accept content.items[] or a top-level array of
// asset-like objects for backwards compatibility with whatever the inference
// module wrote.

import { supabase } from "@/lib/supabase";
import { getSectionHistory } from "@/lib/section-history";
import { SectionHistoryPanel } from "@/components/SectionHistoryPanel";
import {
  TableSectionEditor,
  type Column,
  type Row,
} from "@/components/TableSectionEditor";

const COLUMNS: Column[] = [
  { key: "title", label: "Title", kind: "text", placeholder: "e.g. 200+ commercial shoots since 2003" },
  {
    key: "type",
    label: "Type",
    kind: "select",
    options: ["stat", "case_study", "testimonial", "award"],
    width: "140px",
  },
  { key: "active", label: "Active", kind: "boolean", width: "80px" },
];

const NEW_ROW: Row = { title: "", type: "stat", active: true };

type Section = { id: string; content: Record<string, unknown> | null };

async function getProof(slug: string): Promise<{
  section: Section | null;
  rows: Row[];
}> {
  const { data: prop } = await supabase
    .from("property")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!prop) return { section: null, rows: [] };
  const { data } = await supabase
    .from("brand_dna_section")
    .select("id, content")
    .eq("property_id", prop.id)
    .eq("section", "proof")
    .maybeSingle();
  const section = (data as Section | null) ?? null;
  let rows: Row[] = [];
  if (section?.content) {
    for (const key of ["assets", "items"]) {
      const v = section.content[key];
      if (Array.isArray(v)) {
        rows = (v as unknown[]).filter(
          (x): x is Row => typeof x === "object" && x !== null,
        );
        break;
      }
    }
  }
  return { section, rows };
}

export default async function ProofAssetsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const history = await getSectionHistory(slug, "proof");
  const { section, rows } = await getProof(slug);

  // Type breakdown for the footer.
  const breakdown = rows.reduce<Record<string, number>>((acc, r) => {
    const t = (r.type as string | undefined) ?? "stat";
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {});
  const breakdownEntries = Object.entries(breakdown).sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Proof Assets</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Structured catalogue of trust evidence — stats, case studies,
          testimonials, awards. Downstream pipelines (briefs, landing pages, ad
          copy) pull from this list.
        </p>
      </header>

      <TableSectionEditor
        sectionKey="proof"
        contentKey="assets"
        initialRows={rows}
        columns={COLUMNS}
        propertySlug={slug}
        addLabel="+ Add proof asset"
        newRowTemplate={NEW_ROW}
      />

      {breakdownEntries.length > 0 && (
        <div className="mt-4 text-[11px] text-muted-foreground flex items-center gap-3 flex-wrap">
          <span className="font-semibold uppercase tracking-wider">By type:</span>
          {breakdownEntries.map(([type, count]) => (
            <span key={type} className="tabular-nums">
              {type.replace(/_/g, " ")} {count}
            </span>
          ))}
        </div>
      )}
      <SectionHistoryPanel snapshots={history} />
    </div>
  );
}
