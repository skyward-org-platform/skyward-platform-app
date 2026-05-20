// TypeScript port of the T/C check predicates from
// /Users/paulskirbe/agency/delivery/tna/build_phase2_technical.py
// (functions t_check + c_check, plus CHECKS metadata and kw_dependency).
//
// Same shape as the Python: each row -> list of {failing check id, name,
// SOP action, human-readable detail}. The drill-down panel renders one
// row per failing check; the operator works each one via the
// page_check_state surface (see setCheckStatus / setCheckNotes server
// actions).
//
// S-checks (S1..S12) are sitewide, not per-URL — they're defined here
// for completeness so the Pages UI can render the full check catalog,
// but `evaluateChecks` does not run them. Sitewide evaluation belongs
// in a separate runner that hits robots.txt / sitemap.xml live.

import type { WqaRow } from "@/lib/wqa";

export type CheckCategory = "T" | "C" | "S";
export type CheckKind = "active" | "blocked";
export type KwDependency = "Fix Now" | "Fix Now, Revisit" | "Phase 3 Dependent";

export type CheckDef = {
  id: string; // T1..T20, C1..C20, S1..S12
  category: CheckCategory;
  name: string;
  action: string;
  kind: CheckKind;
  blockedReason: string | null;
  kwDependency: KwDependency;
};

export type CheckResult = {
  id: string;
  name: string;
  action: string;
  detail: string;
  kwDependency: KwDependency;
};

export type Ctx = {
  /** category -> median Inlinks across rows in that category (Inlinks > 0). */
  medianInlinksByCategory: Map<string, number>;
  /** Best TV Keyword -> count of URLs targeting it. */
  kwToUrls: Map<string, number>;
  /** Meta description -> count of URLs sharing it. */
  metaToUrls: Map<string, number>;
  /** Current Title -> count of URLs sharing it. */
  titleToUrls: Map<string, number>;
};

// ─── kw_dependency (SOP) ───────────────────────────────────────────────────
export function kwDependency(checkId: string): KwDependency {
  if (["C2", "C4", "C5", "C7", "C13"].includes(checkId)) {
    return "Phase 3 Dependent";
  }
  if (
    ["C8", "C9", "C10", "C11", "C15", "C16", "C17", "C18", "C20"].includes(
      checkId,
    )
  ) {
    return "Fix Now, Revisit";
  }
  return "Fix Now";
}

// ─── CHECKS catalog ────────────────────────────────────────────────────────
const T_DEFS: Array<
  [string, string, string, CheckKind, string | null]
> = [
  ["T1", "Schema errors", "Fix Schema", "blocked", "Requires SF structured data report (contains_structured_data + validation_errors)"],
  ["T2", "Missing schema", "Add Schema", "blocked", "Requires SF structured data report"],
  ["T3", "Review star opportunity", "Add Product+AggregateRating", "blocked", "Requires SF structured data report to confirm absence"],
  ["T4", "Orphan with value", "Add Internal Links", "active", null],
  ["T5", "Under-linked", "Add Internal Links", "active", null],
  ["T6", "Buried page (depth>=4)", "Improve Architecture", "active", null],
  ["T7", "Over-linked underperformer", "Remove Internal Links", "active", null],
  ["T8", "Indexable but not indexed", "Fix Indexation", "blocked", "Requires SF + GSC URL Inspection integration (indexed-in-Google column)"],
  ["T9", "Noindex on valuable page", "Fix Indexation", "active", null],
  ["T10", "Multiple canonicals", "Fix Multiple Canonicals", "blocked", "Requires SF canonical-tags multi-value field"],
  ["T11", "Canonical mismatch", "Canonicalize", "active", null],
  ["T12", "Not in sitemap", "Add to Sitemap", "active", null],
  ["T13", "Blocked resources (JS/CSS)", "Fix Blocked Resources", "blocked", "Requires robots.txt + SF resources report"],
  ["T14", "JS rendering required", "Verify JS Rendering", "active", null],
  ["T15", "No issues found", "Leave As Is", "active", null],
  ["T16", "Pages linking to broken pages", "Update Internal Links", "blocked", "Requires SF inlinks export to broken-URL set"],
  ["T17", "HTTPS page linking to HTTP", "Fix Internal Links", "blocked", "Requires SF inlinks raw URL inspection"],
  ["T18", "Missing social tags (OG/Twitter)", "Add Social Tags", "blocked", "Requires SF social-tags extract"],
  ["T19", "IndexNow candidates", "Submit to IndexNow", "active", null],
  ["T20", "Duplicate without canonical", "Add Canonical", "blocked", "Requires SF duplicate content report"],
];

const C_DEFS: Array<
  [string, string, string, CheckKind, string | null]
> = [
  ["C1", "Revenue page losing traffic", "Refresh (URGENT)", "active", null],
  ["C2", "Low engagement (sessions>50, dur<30s)", "Rewrite", "active", null],
  ["C3", "Cannibalization (2+ pages same KW)", "Merge weaker into stronger", "active", null],
  ["C4", "Thin content (<300 words, <10 sessions)", "Rewrite", "active", null],
  ["C5", "Losing traffic (negative session %)", "Refresh or Rewrite", "active", null],
  ["C6", "Ranking 3-10, SV>50", "Target with Links", "active", null],
  ["C7", "Ranking 11-20, SV>50", "Refresh or Rewrite", "active", null],
  ["C8", "Missing meta description", "Update Meta Description", "active", null],
  ["C9", "Duplicate meta description", "Update Meta Description", "active", null],
  ["C10", "Duplicate title", "Update Page Title", "active", null],
  ["C11", "Title issues (length/stuffing)", "Update Page Title", "active", null],
  ["C12", "Has refs but not ranking (rank>20)", "Target w/ Links + Refresh", "active", null],
  ["C13", "Performing well (sess>50, words>1000)", "Leave As Is", "active", null],
  ["C14", "No issues found", "Leave As Is", "active", null],
  ["C15", "Meta description too long (>155)", "Shorten Meta Description", "active", null],
  ["C16", "Meta description too short (<70)", "Expand Meta Description", "active", null],
  ["C17", "Title too long (>65)", "Shorten Title", "active", null],
  ["C18", "Title too short (<30)", "Expand Title", "active", null],
  ["C19", "AI content detection (Ahrefs)", "Review Content Quality", "blocked", "Requires Ahrefs Site Audit AI-content signal"],
  ["C20", "Page vs SERP title mismatch", "Improve Title Quality", "blocked", "Requires GSC URL Inspection API + SERP title comparison"],
];

const S_DEFS: Array<
  [string, string, string, CheckKind, string | null]
> = [
  ["S1", "Robots.txt", "Fix robots.txt", "active", null],
  ["S2", "Navigation (3-click reach, crawlable, mobile parity)", "Fix Navigation", "active", null],
  ["S3", "XML Sitemap", "Fix Sitemap", "active", null],
  ["S4", "HTTPS enforcement", "Fix HTTPS", "active", null],
  ["S5", "Core Web Vitals", "Fix CWV (dev)", "blocked", "Requires PageSpeed / CWV integration"],
  ["S6", "Schema sitewide", "Fix Schema", "blocked", "Requires SF structured data report"],
  ["S7", "Duplicate content (SF reports)", "Resolve Duplicates", "blocked", "Requires SF duplicate content report"],
  ["S8", "Orphan pages", "Add Links or Remove", "active", null],
  ["S9", "Hreflang", "Fix Hreflang", "active", null],
  ["S10", "Social tags (OG/Twitter)", "Add Social Tags", "blocked", "Requires SF social-tags extract"],
  ["S11", "Pagination", "Fix Pagination", "active", null],
  ["S12", "Platform Performance Ceiling", "Document Ceiling", "blocked", "Requires platform-level perf analysis"],
];

function toCheckDef(
  category: CheckCategory,
  defs: Array<[string, string, string, CheckKind, string | null]>,
): CheckDef[] {
  return defs.map(([id, name, action, kind, blockedReason]) => ({
    id,
    category,
    name,
    action,
    kind,
    blockedReason,
    kwDependency: kwDependency(id),
  }));
}

export const CHECKS: CheckDef[] = [
  ...toCheckDef("T", T_DEFS),
  ...toCheckDef("C", C_DEFS),
  ...toCheckDef("S", S_DEFS),
];

export const CHECKS_BY_ID: Map<string, CheckDef> = new Map(
  CHECKS.map((c) => [c.id, c]),
);

// ─── helpers ───────────────────────────────────────────────────────────────
function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function truthy(v: unknown): boolean {
  return ["true", "yes", "1"].includes(str(v).toLowerCase());
}

function median(vals: number[]): number {
  if (vals.length === 0) return 0;
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Build the cross-row context maps used by T5/T7 (median inlinks per
 *  category) and C3/C9/C10 (duplicate detection across the set). */
export function buildCtx(
  rows: WqaRow[],
  rowCategory: (r: WqaRow) => string,
): Ctx {
  const inlinksByCategory = new Map<string, number[]>();
  const kwToUrls = new Map<string, number>();
  const metaToUrls = new Map<string, number>();
  const titleToUrls = new Map<string, number>();

  for (const r of rows) {
    const cat = rowCategory(r);
    const inlinks = num(r.inlinks);
    if (inlinks > 0) {
      if (!inlinksByCategory.has(cat)) inlinksByCategory.set(cat, []);
      inlinksByCategory.get(cat)!.push(inlinks);
    }
    const kw = str(r.best_tv_keyword);
    if (kw) kwToUrls.set(kw, (kwToUrls.get(kw) ?? 0) + 1);
    const meta = str(r.meta_description);
    if (meta) metaToUrls.set(meta, (metaToUrls.get(meta) ?? 0) + 1);
    const title = str(r.current_title);
    if (title) titleToUrls.set(title, (titleToUrls.get(title) ?? 0) + 1);
  }

  const medianInlinksByCategory = new Map<string, number>();
  for (const [cat, vals] of inlinksByCategory.entries()) {
    medianInlinksByCategory.set(cat, median(vals));
  }
  return { medianInlinksByCategory, kwToUrls, metaToUrls, titleToUrls };
}

// ─── T-check predicates (port of t_check) ──────────────────────────────────
function tCheck(
  checkId: string,
  r: WqaRow,
  category: string,
  ctx: Ctx,
): { fail: boolean; detail: string } {
  const sessions = num(r.sessions);
  const imps = num(r.average_impressions);
  const inlinks = num(r.inlinks);
  const depth = num(r.page_depth);
  const canon = str(r.canonical_link_element);
  const inSitemap = truthy(r.in_sitemap);
  const indexability = str(r.indexability);
  const idxStatus = str(r.indexability_status);
  const sc = r.status_code;
  const scInt = sc == null ? null : Number.isFinite(Number(sc)) ? Math.trunc(Number(sc)) : null;
  const url = str(r.url);
  const pageType = str(r.type);
  // Referring domains (used by T9) — not on WqaRow as a single field; fall back to 0.
  const referringDomains = num(r.referring_domains);

  switch (checkId) {
    case "T4": // Orphan with value
      if (inlinks === 0 && (sessions > 0 || imps > 0)) {
        return {
          fail: true,
          detail: `Inlinks=0; sessions=${Math.trunc(sessions)}, impressions=${Math.trunc(imps)}`,
        };
      }
      break;
    case "T5": {
      // Under-linked vs category median
      const med = ctx.medianInlinksByCategory.get(category) ?? 0;
      if (med > 0 && inlinks > 0 && inlinks < med * 0.5) {
        return {
          fail: true,
          detail: `Inlinks=${Math.trunc(inlinks)} < 50% of category median (${med.toFixed(1)}) for ${category}`,
        };
      }
      break;
    }
    case "T6": // Buried
      if (depth >= 4) {
        return { fail: true, detail: `Page depth = ${Math.trunc(depth)} (>= 4 clicks from homepage)` };
      }
      break;
    case "T7": {
      const med = ctx.medianInlinksByCategory.get(category) ?? 0;
      if (med > 0 && inlinks > med * 2 && sessions < 10) {
        return {
          fail: true,
          detail: `Inlinks=${Math.trunc(inlinks)} > 200% of category median (${med.toFixed(1)}); sessions=${Math.trunc(sessions)} (bottom-quartile)`,
        };
      }
      break;
    }
    case "T9": // Noindex on valuable
      if (
        idxStatus.toLowerCase().includes("noindex") &&
        (sessions > 0 || referringDomains > 0)
      ) {
        return {
          fail: true,
          detail: `Noindex but sessions=${Math.trunc(sessions)}, refs=${Math.trunc(referringDomains)}`,
        };
      }
      break;
    case "T11": // Canonical mismatch
      if (
        canon &&
        canon !== url &&
        canon.replace(/\/+$/, "") !== url.replace(/\/+$/, "")
      ) {
        return { fail: true, detail: `Canonical -> ${canon}` };
      }
      break;
    case "T12": // Not in sitemap
      if (scInt === 200 && indexability === "Indexable" && !inSitemap) {
        return { fail: true, detail: "Indexable 200 URL absent from sitemap" };
      }
      break;
    case "T14": // JS rendering required
      if (
        pageType.toLowerCase().includes("javascript") ||
        pageType.toLowerCase().includes("spa")
      ) {
        return { fail: true, detail: `Page Type = ${pageType}` };
      }
      break;
    // T19: heuristic-only in Python — recommended sitewide. Skip per-URL.
    default:
      break;
  }
  return { fail: false, detail: "" };
}

// ─── C-check predicates (port of c_check) ──────────────────────────────────
function cCheck(
  checkId: string,
  r: WqaRow,
  ctx: Ctx,
): { fail: boolean; detail: string } {
  const sessions = num(r.sessions);
  const duration = num(r.average_session_duration);
  const convRate = num(r.conversion_rate_pct);
  const revenue = num(r.total_revenue);
  const losing = r.losing_traffic === true || truthy(r.losing_traffic as unknown);
  const sessPctRaw = str(r.session_pct_change);
  const sessPctNeg = sessPctRaw.startsWith("-");
  const wordCount = num(r.word_count);
  const rank = num(r.best_tv_kw_rank);
  const sv = num(r.best_tv_kw_sv);
  const rd = num(r.referring_domains);
  const title = str(r.current_title);
  const meta = str(r.meta_description);
  const kw = str(r.best_tv_keyword);

  switch (checkId) {
    case "C1":
      if ((convRate > 5 || revenue > 100) && losing) {
        return {
          fail: true,
          detail: `Conv Rate=${convRate.toFixed(1)}% Revenue=$${revenue.toFixed(2)} losing_traffic=true`,
        };
      }
      break;
    case "C2":
      if (sessions > 50 && duration > 0 && duration < 30) {
        return {
          fail: true,
          detail: `Sessions=${Math.trunc(sessions)} but avg duration=${Math.trunc(duration)}s (<30s)`,
        };
      }
      break;
    case "C3": {
      const count = kw ? (ctx.kwToUrls.get(kw) ?? 0) : 0;
      if (kw && count >= 2) {
        return { fail: true, detail: `Keyword "${kw}" targeted by ${count} pages` };
      }
      break;
    }
    case "C4":
      if (wordCount > 0 && wordCount < 300 && sessions < 10) {
        return {
          fail: true,
          detail: `Word count=${Math.trunc(wordCount)} (<300); sessions=${Math.trunc(sessions)} (<10)`,
        };
      }
      break;
    case "C5":
      if (sessPctNeg || losing) {
        return {
          fail: true,
          detail: `Session % change=${sessPctRaw || "(losing)"}`,
        };
      }
      break;
    case "C6":
      if (rank >= 3 && rank <= 10 && sv > 50) {
        return {
          fail: true,
          detail: `Ranking ${Math.trunc(rank)} for "${kw}" (SV=${Math.trunc(sv)})`,
        };
      }
      break;
    case "C7":
      if (rank >= 11 && rank <= 20 && sv > 50) {
        return {
          fail: true,
          detail: `Ranking ${Math.trunc(rank)} for "${kw}" (SV=${Math.trunc(sv)})`,
        };
      }
      break;
    case "C8":
      if (!meta) {
        return { fail: true, detail: "Meta description is empty" };
      }
      break;
    case "C9": {
      const count = meta ? (ctx.metaToUrls.get(meta) ?? 0) : 0;
      if (meta && count >= 2) {
        return { fail: true, detail: `Meta shared with ${count - 1} other URL(s)` };
      }
      break;
    }
    case "C10": {
      const count = title ? (ctx.titleToUrls.get(title) ?? 0) : 0;
      if (title && count >= 2) {
        return { fail: true, detail: `Title shared with ${count - 1} other URL(s)` };
      }
      break;
    }
    case "C11": {
      if (title) {
        if (title.length > 65) {
          return { fail: true, detail: `Title length=${title.length} (>65 chars)` };
        }
        const tokens = title.toLowerCase().match(/\b[a-z][a-z-]+\b/g) ?? [];
        const counts = new Map<string, number>();
        for (const w of tokens) counts.set(w, (counts.get(w) ?? 0) + 1);
        const stuffed: string[] = [];
        for (const [w, c] of counts.entries()) {
          if (c >= 3 && w.length > 3) stuffed.push(w);
        }
        if (stuffed.length) {
          return {
            fail: true,
            detail: `Keyword stuffing: ${stuffed.join(", ")} (3+ repeats)`,
          };
        }
      }
      break;
    }
    case "C12":
      if (rd > 0 && rank > 20) {
        return {
          fail: true,
          detail: `Refs=${Math.trunc(rd)} but rank=${Math.trunc(rank)} (page 3+)`,
        };
      }
      break;
    case "C13":
      if (sessions > 50 && wordCount > 1000) {
        return {
          fail: true,
          detail: `Sessions=${Math.trunc(sessions)} + words=${Math.trunc(wordCount)} = performing well`,
        };
      }
      break;
    case "C15":
      if (meta && meta.length > 155) {
        return { fail: true, detail: `Meta length=${meta.length} (>155)` };
      }
      break;
    case "C16":
      if (meta && meta.length > 0 && meta.length < 70) {
        return { fail: true, detail: `Meta length=${meta.length} (<70)` };
      }
      break;
    case "C17":
      if (title && title.length > 65) {
        return { fail: true, detail: `Title length=${title.length} (>65)` };
      }
      break;
    case "C18":
      if (title && title.length < 30) {
        return { fail: true, detail: `Title length=${title.length} (<30)` };
      }
      break;
    default:
      break;
  }
  return { fail: false, detail: "" };
}

// ─── Public evaluator ──────────────────────────────────────────────────────
/** Run every ACTIVE T/C predicate against a row. S-checks are sitewide
 *  and intentionally skipped here. Returns the list of failing checks
 *  with their SOP action and a human-readable detail string. */
export function evaluateChecks(
  row: WqaRow,
  category: string,
  ctx: Ctx,
): CheckResult[] {
  const out: CheckResult[] = [];
  for (const def of CHECKS) {
    if (def.category === "S") continue;
    if (def.kind !== "active") continue;
    const { fail, detail } =
      def.category === "T"
        ? tCheck(def.id, row, category, ctx)
        : cCheck(def.id, row, ctx);
    if (fail) {
      out.push({
        id: def.id,
        name: def.name,
        action: def.action,
        detail,
        kwDependency: def.kwDependency,
      });
    }
  }
  return out;
}
