// Cosine-match redirect destination suggestions for the WQA Redirect tab.
//
// Flow per source URL:
//   1. Derive query text — the URL's slug tokens (path words). Source URLs
//      typically have no content (4xx / 30x), so the slug is our best
//      available signal short of pulling anchor text from inlinks.
//   2. Embed via OpenAI text-embedding-3-large at 1536 dims to match the
//      vector(1536) column type on page_embedding.
//   3. Call the Supabase RPC match_page_embeddings which does the pgvector
//      cosine search server-side, excluding the source URL itself + a
//      small set of "utility" pages (contact-us, about-us, etc.) that
//      semantically overlap with everything because of CTA boilerplate.
//
// Threshold buckets the UI uses (returned alongside the matches):
//   >= 0.60   high confidence — pre-fill
//   0.40-0.60 medium — show as a picker
//   <  0.40   low — hide, operator picks manually

import { supabase } from "@/lib/supabase";

export type Suggestion = {
  url: string;
  similarity: number;
  confidence: "high" | "medium" | "low";
};

// Utility URLs that act as semantic vacuums - excluded from destination
// candidates because nearly every content page has CTAs to them.
const UTILITY_PATHS = [
  "/contact-us",
  "/contact-us/",
  "/about-us",
  "/about-us/",
  "/quote",
  "/quote/",
  "/privacy-policy",
  "/privacy-policy/",
  "/terms",
  "/terms/",
];

function utilityVariants(domain: string): string[] {
  const base = `https://${domain}`;
  return UTILITY_PATHS.map((p) => `${base}${p}`);
}

export function slugTextFromUrl(url: string): string {
  try {
    const u = new URL(url);
    let path = u.pathname;
    // Strip file extension
    const lastSeg = path.split("/").pop() ?? "";
    if (lastSeg.includes(".")) {
      path = path.slice(0, path.lastIndexOf("."));
    }
    const tokens: string[] = [];
    for (const seg of path.split("/")) {
      if (!seg) continue;
      for (const word of seg.replace(/_/g, "-").split("-")) {
        const w = word.trim().toLowerCase();
        if (w) tokens.push(w);
      }
    }
    return tokens.join(" ");
  } catch {
    return "";
  }
}

function bucketConfidence(s: number): "high" | "medium" | "low" {
  if (s >= 0.6) return "high";
  if (s >= 0.4) return "medium";
  return "low";
}

async function embedText(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set in the runtime environment.");
  }
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-large",
      input: text,
      dimensions: 1536,
    }),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`OpenAI embeddings ${r.status}: ${body.slice(0, 200)}`);
  }
  const j = (await r.json()) as { data: { embedding: number[] }[] };
  if (!j.data?.[0]?.embedding) {
    throw new Error("OpenAI returned no embedding.");
  }
  return j.data[0].embedding;
}

export async function suggestDestinationsForUrl(
  propertySlug: string,
  sourceUrl: string,
  topK = 3,
): Promise<{ slugText: string; suggestions: Suggestion[] }> {
  const slugText = slugTextFromUrl(sourceUrl);
  if (!slugText) {
    return { slugText: "", suggestions: [] };
  }
  // Build exclude list: the source URL itself + the utility variants on
  // the same hostname. Domain pulled from sourceUrl for the utility
  // exclusions; if sourceUrl is malformed we just skip utility filter.
  const exclude = [sourceUrl];
  try {
    const host = new URL(sourceUrl).host;
    exclude.push(...utilityVariants(host));
  } catch {
    // ignore - exclude still has the source url at minimum
  }
  const embedding = await embedText(slugText);
  const { data, error } = await supabase.rpc("match_page_embeddings", {
    property_slug: propertySlug,
    query_embedding: embedding,
    match_count: topK,
    exclude_urls: exclude,
  });
  if (error) {
    throw new Error(`Supabase match RPC: ${error.message}`);
  }
  const rows = (data ?? []) as { url: string; similarity: number }[];
  const suggestions: Suggestion[] = rows.map((r) => ({
    url: r.url,
    similarity: r.similarity,
    confidence: bucketConfidence(r.similarity),
  }));
  return { slugText, suggestions };
}
