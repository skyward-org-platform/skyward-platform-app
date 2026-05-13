import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { BrandDnaBodyEditor } from "@/components/BrandDnaBodyEditor";
import { BrandDnaContentEditor } from "@/components/BrandDnaContentEditor";

type BrandDnaSection = {
  id: string;
  section: string;
  content: Record<string, unknown> | null;
  body: string | null;
  source: string | null;
  confidence: number | null;
};

async function getBrandDna(slug: string): Promise<BrandDnaSection[]> {
  const { data: prop } = await supabase
    .from("property")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!prop) return [];
  const { data } = await supabase
    .from("brand_dna_section")
    .select("id, section, content, body, source, confidence")
    .eq("property_id", prop.id);
  return (data ?? []) as BrandDnaSection[];
}

const SECTION_ORDER = [
  "identity",
  "brand_story",
  "voice_tone",
  "brand_terms",
  "proof",
  "future_audience",
  "competitors",
  "personas",
  "offerings",
  "site_structure",
  "goals",
  "positioning",
];

export default async function BrandDnaTab({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const sections = await getBrandDna(slug);
  const ordered = [...sections].sort(
    (a, b) =>
      SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section)
  );

  if (ordered.length === 0) {
    return (
      <div className="p-8 text-slate-500">
        No Brand DNA sections yet for this property.
      </div>
    );
  }

  const useBodyEditor = (s: BrandDnaSection) =>
    s.body !== null || s.content === null || Object.keys(s.content).length === 0;

  return (
    <div className="p-8 grid gap-4 max-w-4xl">
      {ordered.map((s) => (
        <Card key={s.id}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="capitalize text-base">
              {s.section.replace(/_/g, " ")}
            </CardTitle>
            <div className="text-[10px] text-slate-500 flex gap-2">
              {s.source && <span>{s.source}</span>}
              {s.confidence != null && <span>· conf {s.confidence}</span>}
            </div>
          </CardHeader>
          <CardContent>
            {useBodyEditor(s) ? (
              <BrandDnaBodyEditor
                sectionId={s.id}
                initialBody={s.body ?? ""}
                propertySlug={slug}
              />
            ) : (
              <BrandDnaContentEditor
                sectionId={s.id}
                initialContent={s.content}
                propertySlug={slug}
              />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
