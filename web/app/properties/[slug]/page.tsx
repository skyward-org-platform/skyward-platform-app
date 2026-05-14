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

type CompetitorRow = {
  domain_id: number;
  domain: string;
  domain_name: string | null;
  is_active: boolean;
  priority: string | null;
  notes: string | null;
};

type CompetitorsResponse = {
  bq_client_name: string | null;
  matched_on_domain: string;
  competitors: CompetitorRow[];
  count: number;
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

async function getCompetitors(slug: string): Promise<CompetitorsResponse | null> {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";
  try {
    const res = await fetch(`${base}/api/properties/${slug}/competitors`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as CompetitorsResponse;
  } catch {
    return null;
  }
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

function CompetitorsCard({ data }: { data: CompetitorsResponse | null }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="capitalize text-base">Competitors</CardTitle>
        <div className="text-[10px] text-slate-500 flex gap-2">
          <span className="font-semibold">BQ Meta</span>
          <span>· read-only</span>
        </div>
      </CardHeader>
      <CardContent>
        {!data ? (
          <div className="text-xs text-slate-500">
            Couldn&rsquo;t load competitors from BQ Meta.
          </div>
        ) : data.count === 0 ? (
          <div className="text-xs text-slate-500">
            No competitors for{" "}
            <code className="bg-slate-100 px-1 rounded text-[11px]">
              {data.matched_on_domain}
            </code>
            {data.bq_client_name && (
              <>
                {" "}(BQ Meta client:{" "}
                <strong>{data.bq_client_name}</strong>)
              </>
            )}
            .
          </div>
        ) : (
          <div>
            <div className="text-[11px] text-slate-500 mb-2">
              {data.count} competitor{data.count === 1 ? "" : "s"} of{" "}
              <strong>{data.bq_client_name}</strong> (matched on{" "}
              <code className="bg-slate-100 px-1 rounded text-[11px]">
                {data.matched_on_domain}
              </code>
              )
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 uppercase">
                <tr>
                  <th className="text-left py-1">Domain</th>
                  <th className="text-left py-1">Name</th>
                  <th className="text-left py-1">Priority</th>
                </tr>
              </thead>
              <tbody>
                {data.competitors.map((c) => (
                  <tr key={c.domain_id} className="border-t">
                    <td className="py-1.5">{c.domain}</td>
                    <td className="py-1.5 text-slate-600">{c.domain_name ?? "—"}</td>
                    <td className="py-1.5 text-slate-600 text-xs">
                      {c.priority ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default async function BrandDnaTab({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [sections, competitorsData] = await Promise.all([
    getBrandDna(slug),
    getCompetitors(slug),
  ]);

  // Drop any Supabase brand_dna_section with section='competitors' — BQ Meta is
  // canonical for competitors during this phase. Re-introduce when BQ Meta
  // migrates and competitors become editable in Supabase.
  const nonCompetitorSections = sections.filter((s) => s.section !== "competitors");
  const ordered = [...nonCompetitorSections].sort(
    (a, b) =>
      SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section)
  );

  const useBodyEditor = (s: BrandDnaSection) =>
    s.body !== null || s.content === null || Object.keys(s.content).length === 0;

  // Decide where to inject the Competitors card. Use the SECTION_ORDER index
  // of "competitors" relative to the surrounding sections that are present.
  const competitorsIdx = SECTION_ORDER.indexOf("competitors");
  const insertAt = ordered.findIndex(
    (s) => SECTION_ORDER.indexOf(s.section) > competitorsIdx,
  );
  const beforeCompetitors = insertAt === -1 ? ordered : ordered.slice(0, insertAt);
  const afterCompetitors = insertAt === -1 ? [] : ordered.slice(insertAt);

  if (
    ordered.length === 0 &&
    (!competitorsData || competitorsData.count === 0)
  ) {
    return (
      <div className="p-8 text-slate-500">
        No Brand DNA sections yet for this property.
      </div>
    );
  }

  const renderSection = (s: BrandDnaSection) => (
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
  );

  return (
    <div className="p-8 grid gap-4 max-w-4xl">
      {beforeCompetitors.map(renderSection)}
      <CompetitorsCard data={competitorsData} />
      {afterCompetitors.map(renderSection)}
    </div>
  );
}
