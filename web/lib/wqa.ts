// Server-side helper for fetching skyward-seo-pipeline's wqa_output for a
// property. Delegates to the Python /api/wqa/pages route which wraps
// skyward-common's BigQueryClient — Adam's pipeline writes WQA results to
// BQ on each CLI run; the platform reads from that single source of truth.

import { apiBase } from "./api-base";

export type WqaRow = {
  url: string;
  page_path: string | null;
  is_primary_url: boolean | null;
  data_sources: string | null;
  in_sitemap: string | null;
  best_tv_keyword: string | null;
  best_tv_kw_sv: number | null;
  best_tv_kw_rank: number | null;
  best_sv_keyword: string | null;
  best_sv_kw_sv: number | null;
  best_sv_kw_rank: number | null;
  type: string | null;
  current_title: string | null;
  meta_description: string | null;
  h1: string | null;
  word_count: number | null;
  link_score: number | null;
  inlinks: number | null;
  outlinks: number | null;
  canonical_link_element: string | null;
  status_code: number | null;
  status: string | null;
  indexability: string | null;
  indexability_status: string | null;
  page_depth: number | null;
  sessions: number | null;
  session_pct_change: string | null;
  losing_traffic: boolean | null;
  average_session_duration: number | null;
  conversions: number | null;
  conversion_rate_pct: number | null;
  ecom_conversion_rate_pct: number | null;
  total_revenue: number | null;
  average_ctr: number | null;
  average_impressions: number | null;
  backlinks: number | null;
  referring_domains: number | null;
  dofollow: number | null;
  nofollow: number | null;
};

export type WqaSiteSummary = {
  total_urls: number;
  primary_urls: number;
  in_sitemap_urls: number;
  status_code_distribution: Record<string, number>;
  indexability_distribution: Record<string, number>;
};

export type WqaFetchResult = {
  ok: true;
  project_id: number | null;
  version: number | null;
  row_count: number;
  rows: WqaRow[];
  site_summary: WqaSiteSummary | null;
  dataset: string;
  env: string;
  message?: string;
};

export type WqaError = { ok: false; error: string };

/** Cache tag for the WQA aggregate. Bust with `revalidateTag(wqaTagFor(slug))`
 *  after a re-run (or override write) so the next page load sees fresh data. */
export function wqaTagFor(domain: string): string {
  return `wqa:${domain.toLowerCase()}`;
}

/** Fetches the latest WQA run from skyward-seo-pipeline's wqa_output table.
 *  Defaults to the dev dataset (where Paul's runs land); pass env="prod" to
 *  read from production runs. Returns ok:true with an empty rows array
 *  when no run exists for the domain yet — the caller renders a
 *  "no WQA run found" empty state in that case.
 *
 *  Cached for 5 minutes via Next's data-cache. The underlying BQ query
 *  scans tens of thousands of rows and joins them with a window function;
 *  caching cuts navigation latency from 2-4s to ~50ms once warm. */
export async function getWqaForDomain(
  domain: string,
  env: "dev" | "prod" = "dev",
): Promise<WqaFetchResult | WqaError> {
  const token = process.env.APP_WRITE_TOKEN;
  try {
    const res = await fetch(
      `${apiBase()}/api/wqa/pages?domain=${encodeURIComponent(
        domain,
      )}&env=${env}`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        next: {
          revalidate: 300, // 5 minutes
          tags: [wqaTagFor(domain), "wqa"],
        },
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    }
    return (await res.json()) as WqaFetchResult;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
