// Seed Keywords — starting keywords for the SEO research pipeline. Field
// set drawn from operations/process-library/.../keyword_research_intake_
// template.xlsx (keyword · category · seed_category) plus intent for the
// classification step. Stored under brand_dna_section.section =
// 'seed_keywords' for V1.2; long term these flow through BigQuery for
// expansion.

import { supabase } from "@/lib/supabase";
import { getSectionHistory } from "@/lib/section-history";
import { SectionHistoryPanel } from "@/components/SectionHistoryPanel";
import {
  TableSectionEditor,
  type Column,
  type Row,
} from "@/components/TableSectionEditor";

const COLUMNS: Column[] = [
  { key: "keyword", label: "Keyword", kind: "text", placeholder: "e.g. hood cleaning utah county" },
  {
    key: "category",
    label: "Category",
    kind: "text",
    placeholder: "Service/product grouping",
    width: "180px",
  },
  {
    key: "seed_category",
    label: "Source",
    kind: "select",
    options: ["persona", "client", "competitor", "manual"],
    width: "130px",
  },
  {
    key: "intent",
    label: "Intent",
    kind: "select",
    options: ["informational", "commercial", "transactional", "navigational"],
    width: "150px",
  },
  {
    key: "priority",
    label: "Priority",
    kind: "select",
    options: ["high", "medium", "low"],
    width: "110px",
  },
];

const NEW_ROW: Row = {
  keyword: "",
  category: "",
  seed_category: "manual",
  intent: "commercial",
  priority: "medium",
};

type Section = { id: string; content: Record<string, unknown> | null };

async function getSeedKeywords(slug: string): Promise<{
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
    .eq("section", "seed_keywords")
    .maybeSingle();
  const section = (data as Section | null) ?? null;
  let rows: Row[] = [];
  if (section?.content) {
    const v = section.content["items"];
    if (Array.isArray(v)) {
      rows = (v as unknown[]).filter(
        (x): x is Row => typeof x === "object" && x !== null,
      );
    }
  }
  return { section, rows };
}

export default async function SeedKeywordsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const history = await getSectionHistory(slug, "seed_keywords");
  const { rows } = await getSeedKeywords(slug);

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Seed Keywords</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Starting keywords for the research pipeline — feeds suggestions /
          related / ideas expansion. Aim for 5–15 seeds per category, sourced
          from personas, the existing site, and competitors. ×{rows.length} row
          {rows.length === 1 ? "" : "s"}.
        </p>
      </header>

      <TableSectionEditor
        sectionKey="seed_keywords"
        contentKey="items"
        initialRows={rows}
        columns={COLUMNS}
        propertySlug={slug}
        addLabel="+ Add seed keyword"
        newRowTemplate={NEW_ROW}
      />
      <SectionHistoryPanel snapshots={history} />
    </div>
  );
}
