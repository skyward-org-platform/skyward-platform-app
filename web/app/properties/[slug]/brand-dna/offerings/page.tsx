// Offerings — v2 screen 13. Bespoke table editor; overrides the dynamic
// [section] route for /offerings.
//
// Data shape: brand_dna_section.content.items = [{name, type, brand_relation,
// status, url}, …]. The key 'items' is canonical for this section; existing
// data with a different shape renders empty (the user adds new rows
// conforming to the v2 schema).

import { supabase } from "@/lib/supabase";
import { getSectionHistory } from "@/lib/section-history";
import { SectionHistoryPanel } from "@/components/SectionHistoryPanel";
import {
  TableSectionEditor,
  type Column,
  type Row,
} from "@/components/TableSectionEditor";

const COLUMNS: Column[] = [
  { key: "name", label: "Name", kind: "text", placeholder: "e.g. Architectural photography" },
  {
    key: "type",
    label: "Type",
    kind: "select",
    options: ["service", "solution"],
    width: "120px",
  },
  {
    key: "brand_relation",
    label: "Brand Relation",
    kind: "select",
    options: ["owner", "partner", "reseller"],
    width: "140px",
  },
  {
    key: "status",
    label: "Status",
    kind: "select",
    options: ["current", "retired", "draft"],
    width: "120px",
  },
  { key: "url", label: "URL", kind: "url", placeholder: "/services/example" },
];

const NEW_ROW: Row = {
  name: "",
  type: "service",
  brand_relation: "owner",
  status: "current",
  url: "",
};

type Section = {
  id: string;
  content: Record<string, unknown> | null;
};

async function getOfferings(slug: string): Promise<{
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
    .eq("section", "offerings")
    .maybeSingle();
  const section = (data as Section | null) ?? null;
  const candidates = ["items", "offerings"];
  let rows: Row[] = [];
  if (section?.content) {
    for (const key of candidates) {
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

export default async function OfferingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const history = await getSectionHistory(slug, "offerings");
  const { section, rows } = await getOfferings(slug);

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Offerings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Services and solutions this property sells. Feeds SEO clustering,
          content roadmap, and paid landing pages. ×{rows.length} row
          {rows.length === 1 ? "" : "s"}.
        </p>
      </header>

      <TableSectionEditor
        sectionKey="offerings"
        contentKey="items"
        initialRows={rows}
        columns={COLUMNS}
        propertySlug={slug}
        addLabel="+ Add offering"
        newRowTemplate={NEW_ROW}
      />
      <SectionHistoryPanel snapshots={history} />
    </div>
  );
}
