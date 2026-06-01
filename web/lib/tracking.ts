// Phase 6 Tracking data layer. Reads metric_snapshot + change_annotation
// from Supabase. Aggregates daily rows into per-scope summaries the
// /properties/[slug]/tracking surface renders.
//
// Both tables are EMPTY in V1 — every getter must return [] gracefully
// when no rows exist. Once GA4 / GSC / Ahrefs ingest is wired the same
// aggregation logic applies (no schema change required).

import { supabase } from "./supabase";

export type AnnotationKind =
  | "publish"
  | "refresh"
  | "redirect"
  | "technical_fix"
  | "brand_change"
  | "algo_update"
  | "external_event"
  | "other";

export type Snapshot = {
  captured_date: string; // ISO date (YYYY-MM-DD)
  sessions: number | null;
  clicks: number | null;
  impressions: number | null;
  avg_position: number | null;
  conversions: number | null;
  revenue: number | null;
};

export type Annotation = {
  id: string;
  occurred_at: string;
  kind: AnnotationKind;
  title: string;
  body: string | null;
  applied_to_url: string | null;
  applied_to_keyword: string | null;
  source: string;
  created_by: string | null;
};

export type UrlSummary = {
  url: string;
  total_sessions: number;
  total_clicks: number;
  total_impressions: number;
  avg_position: number | null;
  daily: Snapshot[];
};

export type KeywordSummary = {
  keyword: string;
  total_clicks: number;
  total_impressions: number;
  avg_position: number | null;
  daily: Snapshot[];
};

// ── helpers ──────────────────────────────────────────────────────────────

function dateNDaysAgoISO(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

type RawSnapshotRow = {
  captured_date: string;
  scope: string;
  scope_id: string | null;
  sessions: number | null;
  clicks: number | null;
  impressions: number | null;
  avg_position: number | string | null;
  conversions: number | string | null;
  revenue: number | string | null;
};

function toNum(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function sumNullable(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

// Aggregate multiple daily rows for the same (scope, scope_id, date) by
// summing additive counters and impression-weighting avg_position so a
// late ingest doesn't double-count when two sources land on the same day.
function mergeDaily(rows: RawSnapshotRow[]): Snapshot[] {
  const byDate = new Map<string, Snapshot & { _posNumerator: number; _posDenominator: number }>();
  for (const r of rows) {
    const date = r.captured_date;
    const sessions = toNum(r.sessions);
    const clicks = toNum(r.clicks);
    const impressions = toNum(r.impressions);
    const avgPos = toNum(r.avg_position);
    const conv = toNum(r.conversions);
    const rev = toNum(r.revenue);

    const existing = byDate.get(date);
    if (!existing) {
      byDate.set(date, {
        captured_date: date,
        sessions,
        clicks,
        impressions,
        avg_position: avgPos,
        conversions: conv,
        revenue: rev,
        _posNumerator: avgPos !== null && impressions !== null ? avgPos * impressions : 0,
        _posDenominator: avgPos !== null && impressions !== null ? impressions : 0,
      });
    } else {
      existing.sessions = sumNullable(existing.sessions, sessions);
      existing.clicks = sumNullable(existing.clicks, clicks);
      existing.impressions = sumNullable(existing.impressions, impressions);
      existing.conversions = sumNullable(existing.conversions, conv);
      existing.revenue = sumNullable(existing.revenue, rev);
      if (avgPos !== null && impressions !== null) {
        existing._posNumerator += avgPos * impressions;
        existing._posDenominator += impressions;
        existing.avg_position =
          existing._posDenominator > 0
            ? existing._posNumerator / existing._posDenominator
            : avgPos;
      } else if (avgPos !== null && existing.avg_position === null) {
        existing.avg_position = avgPos;
      }
    }
  }
  return Array.from(byDate.values())
    .sort((a, b) => a.captured_date.localeCompare(b.captured_date))
    .map(({ _posNumerator: _n, _posDenominator: _d, ...s }) => s);
}

// ── site-scope ──────────────────────────────────────────────────────────

/** Daily snapshots for scope='site'. Ascending by date. */
export async function getSiteSnapshots(
  propertyId: string,
  daysBack: number,
): Promise<Snapshot[]> {
  const since = dateNDaysAgoISO(daysBack);
  const { data, error } = await supabase
    .from("metric_snapshot")
    .select(
      "captured_date, scope, scope_id, sessions, clicks, impressions, avg_position, conversions, revenue",
    )
    .eq("property_id", propertyId)
    .eq("scope", "site")
    .gte("captured_date", since)
    .order("captured_date", { ascending: true });
  if (error || !data) return [];
  return mergeDaily(data as RawSnapshotRow[]);
}

// ── url-scope ───────────────────────────────────────────────────────────

/** Top-N URLs ordered by recent sessions desc. Each entry carries a
 *  daily array so the UI can sparkline without a second roundtrip. */
export async function getUrlSummaries(
  propertyId: string,
  daysBack: number,
  topN: number,
): Promise<UrlSummary[]> {
  const since = dateNDaysAgoISO(daysBack);
  const { data, error } = await supabase
    .from("metric_snapshot")
    .select(
      "captured_date, scope, scope_id, sessions, clicks, impressions, avg_position, conversions, revenue",
    )
    .eq("property_id", propertyId)
    .eq("scope", "url")
    .gte("captured_date", since)
    .order("captured_date", { ascending: true });
  if (error || !data) return [];

  const byUrl = new Map<string, RawSnapshotRow[]>();
  for (const r of data as RawSnapshotRow[]) {
    if (!r.scope_id) continue;
    const list = byUrl.get(r.scope_id) ?? [];
    list.push(r);
    byUrl.set(r.scope_id, list);
  }

  const summaries: UrlSummary[] = [];
  for (const [url, rows] of byUrl) {
    const daily = mergeDaily(rows);
    let sessions = 0;
    let clicks = 0;
    let impressions = 0;
    let posNum = 0;
    let posDen = 0;
    for (const d of daily) {
      sessions += d.sessions ?? 0;
      clicks += d.clicks ?? 0;
      impressions += d.impressions ?? 0;
      if (d.avg_position !== null && d.impressions !== null && d.impressions > 0) {
        posNum += d.avg_position * d.impressions;
        posDen += d.impressions;
      }
    }
    summaries.push({
      url,
      total_sessions: sessions,
      total_clicks: clicks,
      total_impressions: impressions,
      avg_position: posDen > 0 ? posNum / posDen : null,
      daily,
    });
  }
  summaries.sort((a, b) => b.total_sessions - a.total_sessions);
  return summaries.slice(0, topN);
}

// ── keyword-scope ──────────────────────────────────────────────────────

/** Top-N keywords ordered by total clicks desc. */
export async function getKeywordSummaries(
  propertyId: string,
  daysBack: number,
  topN: number,
): Promise<KeywordSummary[]> {
  const since = dateNDaysAgoISO(daysBack);
  const { data, error } = await supabase
    .from("metric_snapshot")
    .select(
      "captured_date, scope, scope_id, sessions, clicks, impressions, avg_position, conversions, revenue",
    )
    .eq("property_id", propertyId)
    .eq("scope", "keyword")
    .gte("captured_date", since)
    .order("captured_date", { ascending: true });
  if (error || !data) return [];

  const byKw = new Map<string, RawSnapshotRow[]>();
  for (const r of data as RawSnapshotRow[]) {
    if (!r.scope_id) continue;
    const list = byKw.get(r.scope_id) ?? [];
    list.push(r);
    byKw.set(r.scope_id, list);
  }

  const summaries: KeywordSummary[] = [];
  for (const [keyword, rows] of byKw) {
    const daily = mergeDaily(rows);
    let clicks = 0;
    let impressions = 0;
    let posNum = 0;
    let posDen = 0;
    for (const d of daily) {
      clicks += d.clicks ?? 0;
      impressions += d.impressions ?? 0;
      if (d.avg_position !== null && d.impressions !== null && d.impressions > 0) {
        posNum += d.avg_position * d.impressions;
        posDen += d.impressions;
      }
    }
    summaries.push({
      keyword,
      total_clicks: clicks,
      total_impressions: impressions,
      avg_position: posDen > 0 ? posNum / posDen : null,
      daily,
    });
  }
  summaries.sort((a, b) => b.total_clicks - a.total_clicks);
  return summaries.slice(0, topN);
}

// ── ahrefs site snapshots ──────────────────────────────────────────────

export type AhrefsMetricSnapshot = {
  captured_date: string; // ISO date (YYYY-MM-DD)
  domain_rating: number | null;
  referring_domains: number | null;
  organic_keywords: number | null;
  organic_traffic: number | null;
  organic_traffic_value_cents: number | null;
  backlinks_total: number | null;
};

type RawAhrefsRow = {
  captured_date: string;
  domain_rating: number | string | null;
  referring_domains: number | null;
  organic_keywords: number | null;
  organic_traffic: number | null;
  organic_traffic_value_cents: number | null;
  backlinks_total: number | null;
};

/** Latest N site-scope Ahrefs snapshots ordered captured_date DESC.
 *  Returns [] when no rows exist so the UI can short-circuit to empty state. */
export async function getAhrefsSiteSnapshots(
  propertyId: string,
  limit = 12,
): Promise<AhrefsMetricSnapshot[]> {
  const { data, error } = await supabase
    .from("metric_snapshot")
    .select(
      "captured_date, domain_rating, referring_domains, organic_keywords, organic_traffic, organic_traffic_value_cents, backlinks_total",
    )
    .eq("property_id", propertyId)
    .eq("scope", "site")
    .eq("source", "ahrefs")
    .is("scope_id", null)
    .order("captured_date", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as RawAhrefsRow[]).map((r) => ({
    captured_date: r.captured_date,
    domain_rating: toNum(r.domain_rating),
    referring_domains: r.referring_domains,
    organic_keywords: r.organic_keywords,
    organic_traffic: r.organic_traffic,
    organic_traffic_value_cents: r.organic_traffic_value_cents,
    backlinks_total: r.backlinks_total,
  }));
}

// ── annotations ────────────────────────────────────────────────────────

export async function getAnnotations(
  propertyId: string,
  daysBack: number,
  filterUrl?: string,
): Promise<Annotation[]> {
  const since = dateNDaysAgoISO(daysBack);
  let q = supabase
    .from("change_annotation")
    .select(
      "id, occurred_at, kind, title, body, applied_to_url, applied_to_keyword, source, created_by",
    )
    .eq("property_id", propertyId)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false });
  if (filterUrl) {
    // Site-level annotations (no URL) + URL-scoped matches.
    q = q.or(`applied_to_url.is.null,applied_to_url.eq.${filterUrl}`);
  }
  const { data, error } = await q;
  if (error || !data) return [];
  return data as Annotation[];
}

// ── aggregations for headline tiles ────────────────────────────────────

export type Headline = {
  current: number | null;
  prior: number | null;
};

/** Sum a metric over a window. Returns {current: last `windowDays`,
 *  prior: the `windowDays` immediately before that}. Snapshots arrive
 *  ascending by date. */
export function windowDeltas(
  snapshots: Snapshot[],
  windowDays: number,
  metric: keyof Pick<
    Snapshot,
    "sessions" | "clicks" | "impressions" | "conversions" | "revenue"
  >,
): Headline {
  if (snapshots.length === 0) return { current: null, prior: null };
  const today = new Date();
  const currentStart = new Date(today);
  currentStart.setUTCDate(currentStart.getUTCDate() - windowDays);
  const priorStart = new Date(today);
  priorStart.setUTCDate(priorStart.getUTCDate() - windowDays * 2);

  let current = 0;
  let prior = 0;
  let currentHas = false;
  let priorHas = false;
  for (const s of snapshots) {
    const t = Date.parse(s.captured_date);
    const v = s[metric];
    if (v === null) continue;
    if (t >= currentStart.getTime()) {
      current += v;
      currentHas = true;
    } else if (t >= priorStart.getTime()) {
      prior += v;
      priorHas = true;
    }
  }
  return {
    current: currentHas ? current : null,
    prior: priorHas ? prior : null,
  };
}

// ─── Portfolio rollup (all properties) ─────────────────────────────────────

export type TrackingPortfolioRow = {
  property_id: string;
  slug: string;
  name: string;
  status: string | null;
  pipeline_phase: number | null;
  client_name: string | null;
  // Latest Ahrefs snapshot values (site-scope, source='ahrefs', scope_id IS NULL).
  dr_current: number | null;
  kws_current: number | null;
  traffic_current: number | null;
  rds_current: number | null;
  // 30-day deltas (latest minus baseline closest to 30d ago).
  dr_delta_30d: number | null;
  kws_delta_30d: number | null;
  traffic_delta_30d: number | null;
  rds_delta_30d: number | null;
  // Max(captured_date) for the latest snapshot.
  last_snapshot_date: string | null;
};

type RawPortfolioSnapshotRow = {
  property_id: string;
  captured_date: string;
  domain_rating: number | string | null;
  referring_domains: number | null;
  organic_keywords: number | null;
  organic_traffic: number | null;
};

type RawPortfolioPropertyRow = {
  id: string;
  slug: string;
  name: string;
  status: string | null;
  pipeline_phase: number | null;
  client: { name: string | null } | null;
};

function toNumLoose(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** One-trip portfolio fetch. Pulls every property + every site-scope
 *  Ahrefs snapshot in parallel, then derives a single row per property.
 *  Empty rows (no snapshots) render with "—" placeholders. Delta logic
 *  mirrors getAuthorityPortfolioSummary: pick the snapshot whose
 *  captured_date is closest to (latest - 30d). Fall back to the oldest
 *  historical row when only one prior exists. */
export async function getTrackingPortfolioSummary(): Promise<
  TrackingPortfolioRow[]
> {
  const [propsRes, snapsRes] = await Promise.all([
    supabase
      .from("property")
      .select("id, slug, name, status, pipeline_phase, client:client_id(name)")
      .order("name"),
    supabase
      .from("metric_snapshot")
      .select(
        "property_id, captured_date, domain_rating, referring_domains, organic_keywords, organic_traffic",
      )
      .eq("scope", "site")
      .eq("source", "ahrefs")
      .is("scope_id", null)
      .order("captured_date", { ascending: false }),
  ]);

  const properties = (propsRes.data ?? []) as unknown as RawPortfolioPropertyRow[];
  const snapshots = (snapsRes.data ?? []) as RawPortfolioSnapshotRow[];

  // Group snapshots by property, already sorted DESC by captured_date.
  const snapsByProperty = new Map<string, RawPortfolioSnapshotRow[]>();
  for (const s of snapshots) {
    const arr = snapsByProperty.get(s.property_id) ?? [];
    arr.push(s);
    snapsByProperty.set(s.property_id, arr);
  }

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  return properties.map((p): TrackingPortfolioRow => {
    const propSnaps = snapsByProperty.get(p.id) ?? [];
    const latest = propSnaps[0] ?? null;

    // Baseline: snapshot closest to (latest - 30d), strictly older than latest.
    // If none qualify but a prior exists, fall back to the oldest historical row.
    let baseline: RawPortfolioSnapshotRow | null = null;
    if (latest && propSnaps.length >= 2) {
      const latestMs = Date.parse(latest.captured_date);
      const target = latestMs - THIRTY_DAYS_MS;
      let bestGap = Infinity;
      for (let i = 1; i < propSnaps.length; i++) {
        const cand = propSnaps[i];
        const candMs = Date.parse(cand.captured_date);
        if (!Number.isFinite(candMs)) continue;
        const gap = Math.abs(candMs - target);
        if (gap < bestGap) {
          bestGap = gap;
          baseline = cand;
        }
      }
      if (baseline && baseline.captured_date === latest.captured_date) {
        baseline = propSnaps[propSnaps.length - 1];
        if (baseline.captured_date === latest.captured_date) baseline = null;
      }
    }

    const dr = latest ? toNumLoose(latest.domain_rating) : null;
    const kws = latest ? latest.organic_keywords : null;
    const traffic = latest ? latest.organic_traffic : null;
    const rds = latest ? latest.referring_domains : null;
    const baseDr = baseline ? toNumLoose(baseline.domain_rating) : null;
    const baseKws = baseline ? baseline.organic_keywords : null;
    const baseTraffic = baseline ? baseline.organic_traffic : null;
    const baseRds = baseline ? baseline.referring_domains : null;

    return {
      property_id: p.id,
      slug: p.slug,
      name: p.name,
      status: p.status,
      pipeline_phase: p.pipeline_phase,
      client_name: p.client?.name ?? null,
      dr_current: dr,
      kws_current: kws,
      traffic_current: traffic,
      rds_current: rds,
      dr_delta_30d:
        dr !== null && baseDr !== null
          ? Number((dr - baseDr).toFixed(1))
          : null,
      kws_delta_30d:
        kws !== null && baseKws !== null ? kws - baseKws : null,
      traffic_delta_30d:
        traffic !== null && baseTraffic !== null
          ? traffic - baseTraffic
          : null,
      rds_delta_30d:
        rds !== null && baseRds !== null ? rds - baseRds : null,
      last_snapshot_date: latest ? latest.captured_date : null,
    };
  });
}

/** Impression-weighted avg position over the last windowDays + prior. */
export function avgPositionDeltas(snapshots: Snapshot[], windowDays: number): Headline {
  if (snapshots.length === 0) return { current: null, prior: null };
  const today = new Date();
  const currentStart = new Date(today);
  currentStart.setUTCDate(currentStart.getUTCDate() - windowDays);
  const priorStart = new Date(today);
  priorStart.setUTCDate(priorStart.getUTCDate() - windowDays * 2);

  let cn = 0;
  let cd = 0;
  let pn = 0;
  let pd = 0;
  for (const s of snapshots) {
    const t = Date.parse(s.captured_date);
    if (s.avg_position === null) continue;
    const w = s.impressions ?? 1;
    if (t >= currentStart.getTime()) {
      cn += s.avg_position * w;
      cd += w;
    } else if (t >= priorStart.getTime()) {
      pn += s.avg_position * w;
      pd += w;
    }
  }
  return {
    current: cd > 0 ? cn / cd : null,
    prior: pd > 0 ? pn / pd : null,
  };
}
