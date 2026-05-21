// Personas — card-based editor (replaces the earlier table editor). Schema
// drawn from the SEO keyword research intake template:
//   operations/process-library/1. seo-pipeline/templates/
//   keyword_research_intake_template.xlsx (Personas sheet)
//
// 11 fields per persona — too wide for a table, so each persona renders as
// a card with stacked fields. Journey keywords nested behind a disclosure.

import { supabase } from "@/lib/supabase";
import { PersonasGrid, type Persona } from "@/components/PersonasGrid";
import { getSectionHistory } from "@/lib/section-history";
import { SectionHistoryPanel } from "@/components/SectionHistoryPanel";

type Section = { id: string; content: Record<string, unknown> | null };

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

function readPersonas(content: Record<string, unknown> | null): Persona[] {
  if (!content) return [];
  const items = content["items"];
  if (!Array.isArray(items)) return [];
  return (items as unknown[])
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    .map((p) => ({
      persona_name: str(p.persona_name) || str(p.name),
      role_title: str(p.role_title) || str(p.role),
      company_type: str(p.company_type),
      company_size: str(p.company_size) || "11-50",
      icp_fit: str(p.icp_fit) || "high",
      bio: str(p.bio),
      jtbd: str(p.jtbd) || str(p.motivations),
      pain_points: str(p.pain_points),
      awareness_kw: str(p.awareness_kw),
      consideration_kw: str(p.consideration_kw),
      decision_kw: str(p.decision_kw),
    }));
}

async function getPersonas(slug: string): Promise<{
  section: Section | null;
  personas: Persona[];
}> {
  const { data: prop } = await supabase
    .from("property")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!prop) return { section: null, personas: [] };
  const { data } = await supabase
    .from("brand_dna_section")
    .select("id, content")
    .eq("property_id", prop.id)
    .eq("section", "personas")
    .maybeSingle();
  const section = (data as Section | null) ?? null;
  return { section, personas: readPersonas(section?.content ?? null) };
}

export default async function PersonasPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const history = await getSectionHistory(slug, "personas");
  const { personas } = await getPersonas(slug);

  return (
    <div className="p-4 sm:p-8 max-w-3xl">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Personas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Buyer archetypes the Brand DNA Assistant uses when drafting. Schema
          mirrors the keyword research intake template — journey keywords
          drive intent classification downstream. ×{personas.length} persona
          {personas.length === 1 ? "" : "s"}.
        </p>
      </header>

      <PersonasGrid propertySlug={slug} initialPersonas={personas} />
      <SectionHistoryPanel snapshots={history} />
    </div>
  );
}
