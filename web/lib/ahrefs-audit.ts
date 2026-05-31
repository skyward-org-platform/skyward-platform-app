// Server-only Ahrefs API v3 client used by the Authority "Run audit" flow.
//
// Goals (per Phase 5 v2 requirements):
//  1. Pull the same data the offline Python audit pulls (metrics +
//     backlinks-stats + referring-domains, plus all-backlinks + anchors in
//     full mode), but server-side so the UI's "Run audit" button is the
//     entry point.
//  2. Track unit cost on every response via `apiUsageCosts` and HARD-ABORT
//     the run mid-flight if cumulative cost crosses the cap. The offline
//     tnabushire audit blew the cap ~8x because it never re-checked.
//  3. Classify referring domains for tactic and disavow signal so the
//     ingest can write disavow_entry rows automatically.
//
// This module is server-only. Importing it from a client component will
// throw at build time (no "use client" companion); the only safe caller
// is a server action.
//
// Reference (algorithm port, not surface):
//   /Users/paulskirbe/agency/operations/process-library/3. outreach-pipeline/link-building/audit_backlinks.py

import "server-only";

// ─── Public types ──────────────────────────────────────────────────────────

export type AuditMode = "quick" | "full";

export type SpamSignal = "ahrefs_spam" | "tld_spam" | "attack_pattern";

export type DrDistribution = {
  "0-20": number;
  "21-40": number;
  "41-60": number;
  "61-80": number;
  "81-100": number;
};

export type AuditMetrics = {
  domain_rating: number | null;
  ahrefs_rank: number | null;
  live_backlinks: number;
  live_rds: number;
  total_backlinks: number;
  total_rds: number;
  dr_distribution: DrDistribution;
};

export type BacklinkPayload = {
  source_url: string;
  source_domain: string;
  source_dr: number | null;
  source_traffic: number | null;
  target_url: string;
  anchor: string | null;
  link_type: string | null;
  first_seen: string | null;
  last_seen: string | null;
  is_lost: boolean;
  ahrefs_id: string | null;
};

export type RdPayload = {
  domain: string;
  first_seen: string | null;
  last_seen: string | null;
  domain_rating: number | null;
  traffic_domain: number | null;
  dofollow_links: number;
  links_to_target: number;
  detected_spam: boolean;
  spam_signal: SpamSignal | null;
  tactic: string;
  backlink_count: number;
};

export type SpamRd = { domain: string; signal: SpamSignal };

export type AuditOkResult = {
  ok: true;
  backlinks: BacklinkPayload[];
  referringDomains: RdPayload[];
  metrics: AuditMetrics;
  spamRds: SpamRd[];
  costUnits: number;
  durationMs: number;
  partial?: false;
};

export type AuditErrResult = {
  ok: false;
  error: string;
  partial?: {
    backlinks?: BacklinkPayload[];
    referringDomains?: RdPayload[];
    metrics?: AuditMetrics;
    spamRds?: SpamRd[];
    costUnits: number;
    durationMs: number;
  };
};

export type AuditResult = AuditOkResult | AuditErrResult;

export type RunAuditOpts = {
  domain: string;
  mode?: AuditMode;
  capUnits?: number;
  country?: string;
};

// ─── Classification helpers (ported from audit_backlinks.py) ───────────────

const DIRECTORY_PATTERNS = [
  "yelp.com", "bbb.org", "yellowpages.com", "manta.com", "hotfrog.com",
  "chamberofcommerce.com", "angi.com", "houzz.com", "clutch.co", "avvo.com",
  "thumbtack.com", "homeadvisor.com", "expertise.com", "bark.com",
];

const SOCIAL_PATTERNS = [
  "facebook.com", "twitter.com", "linkedin.com", "instagram.com",
  "youtube.com", "pinterest.com", "tiktok.com", "reddit.com",
];

const LEGACY_SPAM_SIGNALS = [
  "blogspot.", "wordpress.com", "weebly.com", "wixsite.com",
  "tumblr.com", "livejournal.com",
];

const NEWS_SIGNALS = [
  "news", "journal", "times", "post", "herald", "gazette", "tribune", "press",
];

const ASSOC_SIGNALS = [
  "chamber", "association", "society", "institute", "council", "board",
];

// TLD farm pattern (from tnabushire audit findings). Suffix-only match.
const SPAM_TLDS = [
  ".shop", ".store", ".top", ".icu", ".xyz", ".cyou", ".click", ".work",
];

// Slug tokens that indicate paid-link networks. Match against backlink
// source URLs (case-insensitive substring).
const SPAM_URL_TOKENS = [
  "seoexpress", "buyseolink", "rankva", "seokey", "backlink-",
];

export function classifyTactic(referringDomain: string): string {
  const d = referringDomain.toLowerCase();

  for (const p of DIRECTORY_PATTERNS) if (d.includes(p)) return "directory";
  for (const p of SOCIAL_PATTERNS) if (d.includes(p)) return "social";
  if (d.endsWith(".gov") || d.includes(".gov.")) return "government";
  if (d.endsWith(".edu") || d.includes(".edu.")) return "education";
  for (const p of LEGACY_SPAM_SIGNALS) if (d.includes(p)) return "spam_suspect";
  if (NEWS_SIGNALS.some((s) => d.includes(s))) return "journalist_outreach";
  if (ASSOC_SIGNALS.some((s) => d.includes(s))) return "industry_site";

  return "organic_or_unknown";
}

// Returns the highest-confidence spam signal for a RD, or null if clean.
//
// Inputs:
//   ahrefsSpam: raw `is_spam` flag from Ahrefs (when present)
//   spamScore:  raw `spam_score` from Ahrefs (0-100 scale)
//   domain:     the referring domain
//   sampleUrls: any sample backlink source URLs for this RD (used for the
//               tld_spam compound check)
export function classifySpamSignal(
  ahrefsSpam: boolean | null | undefined,
  spamScore: number | null | undefined,
  domain: string,
  sampleUrls: string[],
): SpamSignal | null {
  if (ahrefsSpam === true) return "ahrefs_spam";
  if (typeof spamScore === "number" && spamScore >= 80) return "ahrefs_spam";

  const d = domain.toLowerCase();
  const tldMatch = SPAM_TLDS.some((tld) => d.endsWith(tld));
  if (tldMatch) {
    const urlMatch = sampleUrls.some((u) => {
      const lu = u.toLowerCase();
      return SPAM_URL_TOKENS.some((tok) => lu.includes(tok));
    });
    if (urlMatch) return "tld_spam";
  }

  // attack_pattern reserved for future use (fake testimonial detection).
  return null;
}

// ─── Cost accounting ───────────────────────────────────────────────────────

// Ahrefs v3 returns cost info in `apiUsageCosts` on every response. The
// "actual" units (after rate-limit / cache discount) live in
// `units-cost-total-actual`; the headline cap lives in `units-cost-total`.
// We use actual when present, fall back to total.
function extractCostUnits(body: unknown): number {
  if (!body || typeof body !== "object") return 0;
  const root = body as Record<string, unknown>;
  const costs = root["apiUsageCosts"];
  if (!costs || typeof costs !== "object") return 0;
  const c = costs as Record<string, unknown>;
  const actual = c["units-cost-total-actual"];
  if (typeof actual === "number") return actual;
  const total = c["units-cost-total"];
  if (typeof total === "number") return total;
  return 0;
}

// ─── Low-level Ahrefs fetch ────────────────────────────────────────────────

const AHREFS_BASE = "https://api.ahrefs.com/v3";

async function ahrefsGet(
  apiKey: string,
  path: string,
  params: Record<string, string | number | boolean | undefined>,
): Promise<{ body: unknown; costUnits: number }> {
  const url = new URL(`${AHREFS_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    url.searchParams.set(k, String(v));
  }
  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const text = await resp.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON response. Re-raise with status + first 300 chars to surface
    // in the operator's error message.
    throw new Error(
      `Ahrefs ${path} returned non-JSON ${resp.status}: ${text.slice(0, 300)}`,
    );
  }
  if (!resp.ok) {
    const errMsg =
      (body && typeof body === "object" && "error" in body
        ? String((body as Record<string, unknown>).error)
        : null) ?? `HTTP ${resp.status}`;
    throw new Error(`Ahrefs ${path} failed: ${errMsg}`);
  }
  return { body, costUnits: extractCostUnits(body) };
}

// ─── Response shape helpers ────────────────────────────────────────────────

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function bool(v: unknown): boolean {
  return v === true;
}

// Pulls the first array under a known key, since Ahrefs nests under
// `referring_domains`, `backlinks`, `anchors`, etc.
function firstArray(body: unknown, keys: string[]): unknown[] {
  if (!body || typeof body !== "object") return [];
  const root = body as Record<string, unknown>;
  for (const k of keys) {
    const v = root[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

function pickObj(body: unknown, key: string): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const v = root[key];
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

// ─── DR distribution from RD rows ──────────────────────────────────────────

function emptyDrDistribution(): DrDistribution {
  return { "0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0 };
}

function bucketDr(dr: number | null, dist: DrDistribution): void {
  if (dr == null) return;
  if (dr <= 20) dist["0-20"] += 1;
  else if (dr <= 40) dist["21-40"] += 1;
  else if (dr <= 60) dist["41-60"] += 1;
  else if (dr <= 80) dist["61-80"] += 1;
  else dist["81-100"] += 1;
}

// ─── Main entry ────────────────────────────────────────────────────────────

export async function runAhrefsAudit(opts: RunAuditOpts): Promise<AuditResult> {
  const mode: AuditMode = opts.mode ?? "quick";
  const capUnits = opts.capUnits ?? 3000;
  const country = opts.country ?? "au";
  const domain = opts.domain;

  const t0 = Date.now();

  const apiKey = process.env.AHREFS_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "AHREFS_API_KEY not configured in env",
    };
  }
  if (!domain) {
    return { ok: false, error: "domain is required" };
  }

  let costUnits = 0;
  const today = new Date().toISOString().slice(0, 10);

  // Partial accumulator. Mutated after each successful endpoint so a cap
  // hit returns whatever we have so far.
  const partial: NonNullable<AuditErrResult["partial"]> = {
    backlinks: [],
    referringDomains: [],
    spamRds: [],
    costUnits: 0,
    durationMs: 0,
  };

  function elapsed(): number {
    return Date.now() - t0;
  }

  function bail(error: string): AuditErrResult {
    partial.costUnits = costUnits;
    partial.durationMs = elapsed();
    return { ok: false, error, partial };
  }

  function checkCap(): AuditErrResult | null {
    if (costUnits >= capUnits) {
      return bail(
        `Ahrefs cost cap reached (${costUnits} / ${capUnits} units). Run aborted before completing all endpoints.`,
      );
    }
    return null;
  }

  // ── 1. /site-explorer/metrics ────────────────────────────────────────────
  let metricsBody: unknown;
  try {
    const r = await ahrefsGet(apiKey, "/site-explorer/metrics", {
      target: domain,
      mode: "domain",
      country,
      date: today,
      protocol: "both",
    });
    metricsBody = r.body;
    costUnits += r.costUnits;
  } catch (e) {
    return bail(e instanceof Error ? e.message : String(e));
  }
  const cap1 = checkCap();
  if (cap1) return cap1;

  // ── 2. /site-explorer/backlinks-stats ────────────────────────────────────
  let statsBody: unknown;
  try {
    const r = await ahrefsGet(apiKey, "/site-explorer/backlinks-stats", {
      target: domain,
      mode: "domain",
      date: today,
      protocol: "both",
    });
    statsBody = r.body;
    costUnits += r.costUnits;
  } catch (e) {
    return bail(e instanceof Error ? e.message : String(e));
  }
  const cap2 = checkCap();
  if (cap2) return cap2;

  // ── Compose metrics now (cheap; safe under cap) ─────────────────────────
  const metricsObj =
    pickObj(metricsBody, "metrics") ??
    (metricsBody && typeof metricsBody === "object"
      ? (metricsBody as Record<string, unknown>)
      : {});
  const statsObj =
    pickObj(statsBody, "stats") ??
    pickObj(statsBody, "metrics") ??
    (statsBody && typeof statsBody === "object"
      ? (statsBody as Record<string, unknown>)
      : {});

  const metrics: AuditMetrics = {
    domain_rating:
      num(metricsObj["domain_rating"]) ?? num(statsObj["domain_rating"]),
    ahrefs_rank:
      num(metricsObj["ahrefs_rank"]) ?? num(statsObj["ahrefs_rank"]),
    live_backlinks:
      num(statsObj["live"]) ??
      num(statsObj["live_backlinks"]) ??
      num(metricsObj["backlinks"]) ??
      0,
    live_rds:
      num(statsObj["live_refdomains"]) ??
      num(statsObj["refdomains_live"]) ??
      num(metricsObj["refdomains"]) ??
      0,
    total_backlinks:
      num(statsObj["all_time"]) ??
      num(statsObj["all_time_backlinks"]) ??
      num(metricsObj["backlinks"]) ??
      0,
    total_rds:
      num(statsObj["all_time_refdomains"]) ??
      num(statsObj["refdomains_all_time"]) ??
      num(metricsObj["refdomains"]) ??
      0,
    dr_distribution: emptyDrDistribution(),
  };
  partial.metrics = metrics;

  // ── 3. /site-explorer/referring-domains (top 100 by DR) ─────────────────
  let rdBody: unknown;
  try {
    const r = await ahrefsGet(apiKey, "/site-explorer/referring-domains", {
      target: domain,
      mode: "domain",
      date: today,
      protocol: "both",
      limit: 100,
      order_by: "domain_rating:desc",
    });
    rdBody = r.body;
    costUnits += r.costUnits;
  } catch (e) {
    return bail(e instanceof Error ? e.message : String(e));
  }

  // Build RD payloads. We don't have per-RD sample URLs yet (those come
  // from all-backlinks in full mode), so tld_spam classification gets a
  // second pass once we ingest backlinks.
  const rdRows = firstArray(rdBody, [
    "referring_domains",
    "refdomains",
    "domains",
  ]);
  const referringDomains: RdPayload[] = [];
  const spamRds: SpamRd[] = [];

  for (const raw of rdRows) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const dn =
      str(r["domain"]) ??
      str(r["refdomain"]) ??
      str(r["domain_from"]);
    if (!dn) continue;
    const dr = num(r["domain_rating"]);
    const ahrefsSpam = bool(r["is_spam"]);
    const spamScore = num(r["spam_score"]);
    const signal = classifySpamSignal(ahrefsSpam, spamScore, dn, []);
    const tactic = classifyTactic(dn);
    referringDomains.push({
      domain: dn,
      first_seen: str(r["first_seen"]),
      last_seen: str(r["last_seen"]),
      domain_rating: dr,
      traffic_domain: num(r["traffic"]) ?? num(r["traffic_domain"]),
      dofollow_links: num(r["dofollow_links"]) ?? 0,
      links_to_target:
        num(r["links_to_target"]) ?? num(r["backlinks"]) ?? 1,
      detected_spam: ahrefsSpam || (spamScore != null && spamScore >= 80),
      spam_signal: signal,
      tactic,
      backlink_count: num(r["backlinks"]) ?? num(r["dofollow_links"]) ?? 0,
    });
    bucketDr(dr, metrics.dr_distribution);
    if (signal) spamRds.push({ domain: dn, signal });
  }

  partial.referringDomains = referringDomains;
  partial.spamRds = spamRds;

  // If quick mode, we're done with paid endpoints. Cap-check and return.
  if (mode === "quick") {
    const cap3 = checkCap();
    if (cap3) return cap3;
    return {
      ok: true,
      backlinks: [],
      referringDomains,
      metrics,
      spamRds,
      costUnits,
      durationMs: elapsed(),
    };
  }

  // ── Full mode: also fetch all-backlinks + anchors ─────────────────────
  // Check cap before these expensive calls.
  const cap3 = checkCap();
  if (cap3) return cap3;

  // ── 4. /site-explorer/all-backlinks (limit 200) ─────────────────────────
  let blBody: unknown;
  try {
    const r = await ahrefsGet(apiKey, "/site-explorer/all-backlinks", {
      target: domain,
      mode: "domain",
      date: today,
      protocol: "both",
      limit: 200,
      order_by: "domain_rating:desc",
    });
    blBody = r.body;
    costUnits += r.costUnits;
  } catch (e) {
    return bail(e instanceof Error ? e.message : String(e));
  }

  const blRows = firstArray(blBody, ["backlinks"]);
  const backlinks: BacklinkPayload[] = [];
  const sampleUrlsByDomain = new Map<string, string[]>();
  for (const raw of blRows) {
    if (!raw || typeof raw !== "object") continue;
    const b = raw as Record<string, unknown>;
    const src = str(b["url_from"]) ?? str(b["source_url"]);
    const srcDomain =
      str(b["domain_from"]) ??
      str(b["referring_domain"]) ??
      (src ? safeHost(src) : null);
    const tgt = str(b["url_to"]) ?? str(b["target_url"]) ?? "";
    if (!src || !srcDomain) continue;
    backlinks.push({
      source_url: src,
      source_domain: srcDomain,
      source_dr: num(b["domain_rating"]),
      source_traffic: num(b["traffic_domain"]) ?? num(b["traffic"]),
      target_url: tgt,
      anchor: str(b["anchor"]),
      link_type: deriveLinkType(b),
      first_seen: str(b["first_seen"]),
      last_seen: str(b["last_seen"]),
      is_lost:
        bool(b["is_lost"]) ||
        bool(b["lost"]) ||
        str(b["link_status"]) === "lost",
      ahrefs_id: str(b["id"]) ?? str(b["backlink_id"]) ?? null,
    });
    if (srcDomain) {
      const list = sampleUrlsByDomain.get(srcDomain) ?? [];
      if (list.length < 5) list.push(src);
      sampleUrlsByDomain.set(srcDomain, list);
    }
  }
  partial.backlinks = backlinks;

  // Second-pass spam classification now that we have per-RD URLs.
  for (const rd of referringDomains) {
    if (rd.spam_signal) continue;
    const samples = sampleUrlsByDomain.get(rd.domain) ?? [];
    const reSignal = classifySpamSignal(
      // Already-known ahrefs_spam was already caught above.
      false,
      null,
      rd.domain,
      samples,
    );
    if (reSignal) {
      rd.spam_signal = reSignal;
      rd.detected_spam = true;
      spamRds.push({ domain: rd.domain, signal: reSignal });
    }
  }

  // ── 5. /site-explorer/anchors (limit 100) ───────────────────────────────
  // We collect anchors for cost completeness and future anchor distribution
  // analytics, but we don't store them this turn — anchor data is implicit
  // in the backlink rows.
  try {
    const r = await ahrefsGet(apiKey, "/site-explorer/anchors", {
      target: domain,
      mode: "domain",
      date: today,
      protocol: "both",
      limit: 100,
      order_by: "backlinks:desc",
    });
    costUnits += r.costUnits;
  } catch (e) {
    // Anchors failure is non-fatal. Record in partial via cost and continue.
    partial.costUnits = costUnits;
    partial.durationMs = elapsed();
    return {
      ok: false,
      error: `anchors fetch failed: ${e instanceof Error ? e.message : String(e)}`,
      partial: {
        ...partial,
        backlinks,
        referringDomains,
        metrics,
        spamRds,
      },
    };
  }

  const capFinal = checkCap();
  if (capFinal) return capFinal;

  return {
    ok: true,
    backlinks,
    referringDomains,
    metrics,
    spamRds,
    costUnits,
    durationMs: elapsed(),
  };
}

// ─── tiny helpers ──────────────────────────────────────────────────────────

function safeHost(u: string): string | null {
  try {
    return new URL(u).host.toLowerCase();
  } catch {
    return null;
  }
}

function deriveLinkType(b: Record<string, unknown>): string | null {
  // Ahrefs returns either an explicit `link_type` or boolean flags.
  const explicit = str(b["link_type"]);
  if (explicit) return explicit;
  if (bool(b["nofollow"])) return "nofollow";
  if (bool(b["sponsored"])) return "sponsored";
  if (bool(b["ugc"])) return "ugc";
  // Treat as followed by default if the row has no signal.
  return "followed";
}
