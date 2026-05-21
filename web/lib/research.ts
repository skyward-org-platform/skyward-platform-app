// Research & Fill — auto-populate brand_dna_section fields via Claude.
//
// Architecture: each section is a self-contained research call. The server
// fetches the property's homepage (+ /about as a cheap secondary), strips
// HTML to text, then asks Claude to extract that section's fields via
// structured tool use. Sequential per-section calls keep each invocation
// short enough to fit a Vercel function timeout.
//
// Cost ballpark: ~$0.02–$0.10 per section per fill (Sonnet pricing). The
// full 10-section run costs roughly $0.50–$1.00 of API spend.

export const MODEL = "claude-sonnet-4-6";
export const MAX_TOKENS = 2000;
export const HTML_MAX_CHARS = 40_000;

export type ResearchableSection =
  | "identity"
  | "voice_tone"
  | "future_audience"
  | "personas"
  | "offerings"
  | "proof"
  | "site_structure"
  | "goals"
  | "brand_terms"
  | "seed_keywords";

export const RESEARCHABLE_SECTIONS: ResearchableSection[] = [
  "identity",
  "voice_tone",
  "future_audience",
  "personas",
  "offerings",
  "proof",
  "site_structure",
  "goals",
  "brand_terms",
  "seed_keywords",
];

// ─── Site fetch ──────────────────────────────────────────────────────────

async function fetchUrlText(url: string, timeoutMs = 8000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SkywardResearchBot/1.0; +https://skyward-platform-app.vercel.app)",
        Accept: "text/html",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return "";
    const html = await res.text();
    return htmlToText(html);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function homeUrl(domain: string): string {
  const base = domain.startsWith("http") ? domain : `https://${domain}`;
  return base.replace(/\/$/, "");
}

/** Fetch the property's homepage. Exported so the streaming route handler
 *  can sequence fetches and emit progress between them. */
export async function fetchHomepage(domain: string): Promise<string> {
  return fetchUrlText(homeUrl(domain));
}

/** Fetch the property's /about page (best-effort secondary source). */
export async function fetchAboutPage(domain: string): Promise<string> {
  return fetchUrlText(`${homeUrl(domain)}/about`);
}


// ─── Per-section tool definitions ────────────────────────────────────────

type InputSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
};

type ToolDef = {
  name: string;
  description: string;
  input_schema: InputSchema;
};

const stringField = { type: "string" } as const;
const stringArrayField = {
  type: "array",
  items: { type: "string" },
} as const;

function obj(properties: Record<string, unknown>): InputSchema {
  return { type: "object", properties };
}

const TOOLS: Record<ResearchableSection, ToolDef> = {
  identity: {
    name: "publish_identity",
    description:
      "Publish researched brand identity fields. Return empty strings for fields you can't determine from the website content.",
    input_schema: obj({
      brand_name: stringField,
      tagline: stringField,
      legal_name: stringField,
      brand_personality: stringField,
      brand_story: stringField,
      target_audience: stringField,
      positioning: stringField,
      what_we_sell: stringField,
      trust_signals: stringField,
      proof_themes: stringField,
      founded: stringField,
      hq_location: stringField,
      operating_locations: stringArrayField,
    }),
  },
  voice_tone: {
    name: "publish_voice_tone",
    description:
      "Publish a voice & tone profile derived from how the brand actually writes on its website.",
    input_schema: obj({
      voice_one_sentence: stringField,
      voice_traits: stringArrayField,
      voice_avoid: stringArrayField,
      writing_style: stringField,
      voice_dos: stringField,
      voice_donts: stringField,
    }),
  },
  future_audience: {
    name: "publish_audiences",
    description:
      "Publish the brand's current audience plus any signaled future shift. Best-effort — if no shift is signaled, leave the shift fields empty.",
    input_schema: obj({
      current_audience: stringField,
      future_shift: stringField,
      why_shift: stringField,
      horizon_months: stringField,
      status: stringField,
    }),
  },
  personas: {
    name: "publish_personas",
    description:
      "Publish 2–4 buyer personas inferred from the website's audience signals. Include journey keywords (problem-aware → comparison → purchase-intent) where they can be reasonably inferred.",
    input_schema: obj({
      items: {
        type: "array",
        items: obj({
          persona_name: stringField,
          role_title: stringField,
          company_type: stringField,
          company_size: stringField,
          icp_fit: stringField,
          bio: stringField,
          jtbd: stringField,
          pain_points: stringField,
          awareness_kw: stringField,
          consideration_kw: stringField,
          decision_kw: stringField,
        }),
      },
    }),
  },
  offerings: {
    name: "publish_offerings",
    description:
      "Publish the services / solutions the brand sells, one row per offering.",
    input_schema: obj({
      items: {
        type: "array",
        items: obj({
          name: stringField,
          type: stringField, // service | solution
          brand_relation: stringField, // owner | partner | reseller
          status: stringField, // current | retired | draft
          url: stringField,
        }),
      },
    }),
  },
  proof: {
    name: "publish_proof",
    description:
      "Publish trust evidence — stats, case studies, testimonials, awards — found on the website.",
    input_schema: obj({
      assets: {
        type: "array",
        items: obj({
          title: stringField,
          type: stringField, // stat | case_study | testimonial | award
          active: { type: "boolean" },
        }),
      },
    }),
  },
  site_structure: {
    name: "publish_site_structure",
    description:
      "Publish the site's information architecture as observed — CMS hints, top-level nav, URL patterns. Leave blank what can't be inferred from one homepage.",
    input_schema: obj({
      cms: stringField,
      top_level_sections: stringArrayField,
      url_conventions: stringField,
      hub_spoke_pattern: stringField,
      service_area_strategy: stringField,
      blog_strategy: stringField,
      internal_linking_rules: stringField,
      subdomain_policy: stringField,
      technical_constraints: stringField,
      crawl_notes: stringField,
    }),
  },
  goals: {
    name: "publish_commercial_policy",
    description:
      "Publish the brand's commercial policy — how they sell. Pricing visibility, sales motion, qualification, service area.",
    input_schema: obj({
      business_model: stringField,
      geographic_focus: stringField,
      service_area: stringField,
      pricing_visibility: stringField,
      price_range: stringField,
      sales_motion: stringField,
      primary_cta: stringField,
      hours_of_operation: stringField,
      qualification_criteria: stringField,
      disqualifiers: stringField,
      contract_types: stringArrayField,
      payment_terms: stringField,
      what_we_dont_do: stringField,
    }),
  },
  brand_terms: {
    name: "publish_brand_terms",
    description:
      "Publish branded-term tagging rules. The brand's own name + obvious variants go under branded_terms with brand_type='own_brand'. Exceptions are common phrases NEVER to tag as branded (e.g. when the brand name is also a common word).",
    input_schema: obj({
      branded_terms: {
        type: "array",
        items: obj({
          pattern: stringField,
          match: stringField,
          brand_type: stringField,
        }),
      },
      exceptions: {
        type: "array",
        items: obj({
          pattern: stringField,
          match: stringField,
          reason: stringField,
        }),
      },
    }),
  },
  seed_keywords: {
    name: "publish_seed_keywords",
    description:
      "Publish 8–15 seed keywords that the SEO research pipeline can expand. Cover head terms (informational), comparison terms (commercial), and purchase-intent terms (transactional). Categorize by service.",
    input_schema: obj({
      items: {
        type: "array",
        items: obj({
          keyword: stringField,
          category: stringField,
          seed_category: stringField, // persona | client | competitor | manual
          intent: stringField,
          priority: stringField,
        }),
      },
    }),
  },
};

// ─── Per-section user prompts ────────────────────────────────────────────

const PROMPTS: Record<ResearchableSection, string> = {
  identity:
    "Extract the brand's identity. Lean on direct evidence from the website. For brand_story keep it under 100 words; for target_audience under 80; for positioning under 80; for what_we_sell summarize at the service-line level rather than enumerating SKUs.",
  voice_tone:
    "Derive a voice & tone profile from how the brand actually writes on its website. voice_one_sentence should be a single descriptive sentence (max 30 words). voice_traits / voice_avoid should be 5–8 short chip-style descriptors each. writing_style / voice_dos / voice_donts should be specific, drafting-actionable guidance under 80 words each.",
  future_audience:
    "Describe the brand's current audience and any signaled audience pivot. If the homepage doesn't suggest a future shift, only fill current_audience and leave future_shift / why_shift empty.",
  personas:
    "Generate 2–4 representative buyer personas. Use realistic role titles, not fictional first names unless useful (e.g. 'Event Planner Emma' over 'Sarah Smith'). For company_size use one of: 1-10, 11-50, 51-200, 201-500, 500+. For icp_fit use one of: high, medium, low. Journey keywords are comma-separated lists.",
  offerings:
    "List the brand's services / solutions, one row per offering. Use the brand's own naming. Type is service or solution. Brand relation defaults to 'owner' unless the offering is clearly resold/partnered. Status defaults to 'current'.",
  proof:
    "Extract trust evidence visible on the website: statistics ('5,000 jobs'), case studies, named testimonials, certifications/awards. Each row's type is one of: stat, case_study, testimonial, award. Active defaults to true.",
  site_structure:
    "Infer the site's IA from the homepage. top_level_sections are the nav items. url_conventions is one short line (e.g. 'lowercase hyphen-separated, max depth 3'). Other fields: leave blank if not inferable from just the homepage.",
  goals:
    "Extract the brand's commercial policy: business model, geographic focus, pricing visibility (public / tiered / gated / quote_only), sales motion (self_serve / sales_assisted / sales_led / hybrid), primary CTA, hours, who qualifies, what they don't do. Use the website's own language where possible.",
  brand_terms:
    "Build branded-term rules. Always include the brand's primary name and 1–2 obvious variants as 'word' match, brand_type 'own_brand'. Add exceptions only if the brand name is also a common English word.",
  seed_keywords:
    "Generate 8–15 seed keywords for the SEO research pipeline. Mix informational head terms, commercial comparison terms, and transactional purchase-intent terms. Categorize by the brand's primary services. seed_category should default to 'manual'. priority: high for clear commercial intent, medium for awareness, low for tangential.",
};

// ─── Public API ──────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are a research analyst preparing a brand profile from a company's website.

Rules:
- Use only the website content you're given (and your general knowledge of the industry/category to interpret it).
- If a field can't be determined confidently, leave it empty (empty string, empty array). Do NOT hallucinate or guess.
- Be specific and concrete. Avoid generic marketing language unless that's exactly what the website itself uses.
- Quote sparingly; mostly summarize in plain prose.
- Always call the provided tool exactly once to publish your findings. No prose response.`;

export function isResearchable(s: string): s is ResearchableSection {
  return (RESEARCHABLE_SECTIONS as readonly string[]).includes(s);
}

export function getTool(sectionKey: ResearchableSection): ToolDef {
  return TOOLS[sectionKey];
}

/** Build the per-section user prompt. Used by the streaming route handler so
 *  it can hand-roll the Anthropic call between progress events. */
export function buildResearchPrompt(
  propertyName: string,
  domain: string,
  siteContent: string,
  sectionKey: ResearchableSection,
): string {
  const tool = TOOLS[sectionKey];
  return `Property name: ${propertyName}
Primary domain: ${domain}

Website content:
"""
${siteContent}
"""

Task: ${PROMPTS[sectionKey]}

Call \`${tool.name}\` with the extracted fields.`;
}

