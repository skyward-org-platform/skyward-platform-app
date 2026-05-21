// Brand Terms — v2 screen 14. Two tables: Branded Terms + Exceptions.
//
// Data shape:
//   brand_dna_section.content.branded_terms = [{pattern, match, brand_type}, …]
//   brand_dna_section.content.exceptions    = [{pattern, match, reason}, …]
//
// Existing phil-lasry data uses a different shape (always_use/never_use/
// variants from the inference module). For V1.1 we render only the v2
// schema; legacy data sits in content unchanged and surfaces empty here
// until manually migrated.

import { supabase } from "@/lib/supabase";
import { getSectionHistory } from "@/lib/section-history";
import { SectionHistoryPanel } from "@/components/SectionHistoryPanel";
import {
  TableSectionEditor,
  type Column,
  type Row,
} from "@/components/TableSectionEditor";

const BRANDED_COLUMNS: Column[] = [
  { key: "pattern", label: "Pattern", kind: "text", placeholder: "philippe lasry" },
  {
    key: "match",
    label: "Match",
    kind: "select",
    options: ["word", "contains"],
    width: "120px",
  },
  {
    key: "brand_type",
    label: "Brand Type",
    kind: "select",
    options: ["own_brand", "competitor_brand", "partner_brand"],
    width: "180px",
  },
];

const BRANDED_NEW: Row = {
  pattern: "",
  match: "word",
  brand_type: "own_brand",
};

const EXCEPTION_COLUMNS: Column[] = [
  { key: "pattern", label: "Pattern", kind: "text", placeholder: "lasry chess" },
  {
    key: "match",
    label: "Match",
    kind: "select",
    options: ["word", "contains"],
    width: "120px",
  },
  { key: "reason", label: "Reason", kind: "text", placeholder: "Different person — chess GM" },
];

const EXCEPTION_NEW: Row = { pattern: "", match: "word", reason: "" };

type Section = { id: string; content: Record<string, unknown> | null };

function rowsAt(content: Record<string, unknown> | null, key: string): Row[] {
  if (!content) return [];
  const v = content[key];
  if (!Array.isArray(v)) return [];
  return (v as unknown[]).filter(
    (x): x is Row => typeof x === "object" && x !== null,
  );
}

async function getBrandTerms(slug: string): Promise<{
  section: Section | null;
  branded: Row[];
  exceptions: Row[];
}> {
  const { data: prop } = await supabase
    .from("property")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!prop) return { section: null, branded: [], exceptions: [] };
  const { data } = await supabase
    .from("brand_dna_section")
    .select("id, content")
    .eq("property_id", prop.id)
    .eq("section", "brand_terms")
    .maybeSingle();
  const section = (data as Section | null) ?? null;
  return {
    section,
    branded: rowsAt(section?.content ?? null, "branded_terms"),
    exceptions: rowsAt(section?.content ?? null, "exceptions"),
  };
}

export default async function BrandTermsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const history = await getSectionHistory(slug, "brand_terms");
  const { section, branded, exceptions } = await getBrandTerms(slug);

  return (
    <div className="p-4 sm:p-8 max-w-5xl space-y-7">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Brand Terms</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Patterns that auto-tag keywords as branded in the Keyword Universe +
          GSC performance. Exceptions override individual matches.
        </p>
      </header>

      <section>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-[13px] font-semibold">Branded Terms</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Match these and the keyword is tagged as branded.
            </p>
          </div>
        </div>
        <TableSectionEditor
          sectionKey="brand_terms"
          contentKey="branded_terms"
          initialRows={branded}
          columns={BRANDED_COLUMNS}
          propertySlug={slug}
          addLabel="+ Add branded term"
          newRowTemplate={BRANDED_NEW}
        />
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-[13px] font-semibold">Exceptions</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Patterns NEVER tagged as branded even when a rule above matches.
            </p>
          </div>
        </div>
        <TableSectionEditor
          sectionKey="brand_terms"
          contentKey="exceptions"
          initialRows={exceptions}
          columns={EXCEPTION_COLUMNS}
          propertySlug={slug}
          addLabel="+ Add exception"
          newRowTemplate={EXCEPTION_NEW}
        />
      </section>
      <SectionHistoryPanel snapshots={history} />
    </div>
  );
}
