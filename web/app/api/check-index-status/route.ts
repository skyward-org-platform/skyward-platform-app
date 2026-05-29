// POST /api/check-index-status
//
// Body: { propertyId: string, urls: string[] }
//
// For each URL, queries DataForSEO SERP organic live advanced with
// `keyword="site:<url>"` and parses whether Google has the URL indexed.
// Upserts the result into page_index_state keyed by (property_id, url).
//
// Concurrency is bounded at 3 (DataForSEO rate-limits aggressively).
//
// Used by the Redirect tab "Check Index" bulk action via the
// bulkCheckIndexStatus server action.

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const DFS_ENDPOINT =
  "https://api.dataforseo.com/v3/serp/google/organic/live/advanced";
const CONCURRENCY = 3;
const LOCATION_CODE = 2036; // Australia — matches TNA + buscharter pipelines
const LANGUAGE_CODE = "en";
const DEPTH = 10;

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ResultRow =
  | { url: string; in_index: boolean; raw_result: unknown }
  | { url: string; error: string };

function normalizeForCompare(u: string): string {
  try {
    const parsed = new URL(u);
    parsed.hash = "";
    let path = parsed.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}`.toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}

async function checkOne(
  url: string,
  authHeader: string,
): Promise<ResultRow> {
  try {
    const resp = await fetch(DFS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        {
          keyword: `site:${url}`,
          location_code: LOCATION_CODE,
          language_code: LANGUAGE_CODE,
          depth: DEPTH,
        },
      ]),
    });
    if (!resp.ok) {
      return { url, error: `DFS HTTP ${resp.status}` };
    }
    const body = await resp.json();
    const tasks = body?.tasks ?? [];
    if (tasks.length === 0) {
      return { url, error: "no tasks in DFS response" };
    }
    const task = tasks[0];
    const statusCode: number = task?.status_code ?? 20000;
    // DFS task status 40102 "No Search Results" is the actual signal —
    // Google returned no organic results for site:URL, meaning the page
    // is not indexed. Treat it as in_index=false rather than an error.
    if (statusCode === 40102) {
      return { url, in_index: false, raw_result: [] };
    }
    if (statusCode >= 40000) {
      return { url, error: `DFS task error ${statusCode} ${task.status_message ?? ""}` };
    }
    const result = task?.result ?? [];
    if (result.length === 0) {
      // No SERP returned at all — treat as not indexed.
      return { url, in_index: false, raw_result: [] };
    }
    const items: Array<{ type?: string; url?: string }> =
      result[0]?.items ?? [];
    // Match if any organic result URL equals or is prefixed by our queried
    // URL (after light normalization). This matches DFS site: behavior:
    // a hit on the canonical URL counts as indexed.
    const target = normalizeForCompare(url);
    const inIndex = items.some((item) => {
      if (!item || item.type !== "organic" || !item.url) return false;
      const got = normalizeForCompare(item.url);
      return got === target || got.startsWith(target);
    });
    return {
      url,
      in_index: inIndex,
      raw_result: items.filter((i) => i?.type === "organic"),
    };
  } catch (e) {
    return { url, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function POST(req: NextRequest) {
  let payload: { propertyId?: string; urls?: string[] };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad JSON body" }, { status: 400 });
  }
  const propertyId = payload.propertyId;
  const urls = payload.urls ?? [];
  if (!propertyId) {
    return NextResponse.json({ ok: false, error: "missing propertyId" }, { status: 400 });
  }
  if (urls.length === 0) {
    return NextResponse.json({ ok: true, total: 0, indexed: 0, notIndexed: 0, errors: [] });
  }

  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    return NextResponse.json(
      {
        ok: false,
        error: "Server misconfigured: DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD env vars missing",
      },
      { status: 500 },
    );
  }
  const authHeader =
    "Basic " + Buffer.from(`${login}:${password}`).toString("base64");

  const queue = [...urls];
  const results: ResultRow[] = [];
  async function worker() {
    while (queue.length > 0) {
      const next = queue.shift();
      if (next === undefined) break;
      const r = await checkOne(next, authHeader);
      results.push(r);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker),
  );

  const checkedAt = new Date().toISOString();
  const upsertRows = results
    .filter((r): r is { url: string; in_index: boolean; raw_result: unknown } => "in_index" in r)
    .map((r) => ({
      property_id: propertyId,
      url: r.url,
      in_index: r.in_index,
      checked_at: checkedAt,
      source: "dataforseo",
      raw_result: r.raw_result,
    }));
  if (upsertRows.length > 0) {
    const { error } = await supabase
      .from("page_index_state")
      .upsert(upsertRows, { onConflict: "property_id,url" });
    if (error) {
      return NextResponse.json(
        { ok: false, error: `supabase upsert: ${error.message}` },
        { status: 500 },
      );
    }
  }

  const indexed = upsertRows.filter((r) => r.in_index).length;
  const notIndexed = upsertRows.filter((r) => !r.in_index).length;
  const errors = results
    .filter((r): r is { url: string; error: string } => "error" in r)
    .map((r) => ({ url: r.url, error: r.error }));

  return NextResponse.json({
    ok: true,
    total: urls.length,
    indexed,
    notIndexed,
    errors,
  });
}
