// Server-side port of the WQA SOP v5 triage decision tree (sections 5.1 +
// 5.2). Walks each wqa_output row top-to-bottom; returns the action + a
// Logic citation per the SOP Section 5.3 ("Logic Column Requirements").
//
// Source: operations/process-library/1. seo-pipeline/sop/phase-1-wqa/
//         website-quality-audit-sop-v5.md
//
// Page-Category classification (section 4.1) is not yet implemented — that
// requires URL-pattern + LLM-driven category assignment. Branches that
// depend on category (Suburb/template → Consolidate, Blog post + thin →
// Remove) currently fall through to Evaluate / Remove via the no-signals
// path. Tag with a TODO and add when category lands.

import type { WqaRow } from "./wqa";

export type TriageAction =
  | "Optimize"
  | "Restore"
  | "Redirect"
  | "Consolidate"
  | "Remove"
  | "Evaluate"
  | "Leave as 404"
  | "Non-addressable"
  | "Non-indexable"
  | "Investigate";

export type TriageResult = {
  action: TriageAction;
  logic: string;
  /** For Optimize rows: the priority tier (SOP section 5.2 step 7a). */
  tier?:
    | "Revenue-Critical"
    | "Page 1"
    | "Striking Distance"
    | "Has Visibility"
    | "Has Authority"
    | "Core Page"
    | "Utility";
  /** When true, a human override is being shown instead of the SOP result.
   *  `sopAction` carries the original auto-derived action so the chip can
   *  display a "(SOP)" hint and the revert path stays available. */
  isOverridden?: boolean;
  sopAction?: TriageAction;
};

const NON_ANALYZABLE_PATTERNS = [
  /\/wp-content\//i,
  /\/wp-admin\//i,
  /\/wp-includes\//i,
  /\/wp-json\//i,
  /\/feed\//i,
  /\.xml$/i,
  /\.css(\?|$)/i,
  /\.js(\?|$)/i,
  /\/cdn-cgi\//i,
  /\.(jpe?g|png|gif|webp|svg|ico|woff2?|ttf|eot|otf|pdf|mp4|webm)(\?|$)/i,
  /\.json(\?|$)/i,
  /\.txt$/i,
];

const PARAM_VARIANT_PATTERNS = [
  /\?utm_/i,
  /\?_gl=/i,
  /[?&]gclid=/i,
  /[?&]fbclid=/i,
  /[?&]msclkid=/i,
];

function isNonAnalyzable(url: string): boolean {
  return NON_ANALYZABLE_PATTERNS.some((p) => p.test(url));
}

function isParamVariant(url: string): boolean {
  return PARAM_VARIANT_PATTERNS.some((p) => p.test(url));
}

function isHomepage(row: WqaRow): boolean {
  const path = (row.page_path || "").toLowerCase();
  if (path === "" || path === "/") return true;
  try {
    const u = new URL(row.url);
    return u.pathname === "/" || u.pathname === "";
  } catch {
    return false;
  }
}

function isContactOrQuote(path: string): boolean {
  const p = path.toLowerCase();
  return p.includes("/contact") || p.includes("/quote") || p.includes("/get-in-touch");
}

function isBlog(path: string): boolean {
  const p = path.toLowerCase();
  return p.includes("/blog/") || p.includes("/journal/") || p.includes("/news/");
}

/** Per SOP section 5.2 — top-to-bottom decision tree. First match wins. */
export function triageRow(row: WqaRow): TriageResult {
  const url = row.url ?? "";
  const sc = row.status_code;
  const primary = row.is_primary_url;
  const sessions = row.sessions ?? 0;
  const conv = row.conversions ?? 0;
  const rev = row.total_revenue ?? 0;
  const impr = row.average_impressions ?? 0;
  const refd = row.referring_domains ?? 0;
  const bls = row.backlinks ?? 0;
  const tvRank = row.best_tv_kw_rank;
  const tvSv = row.best_tv_kw_sv ?? 0;
  const svRank = row.best_sv_kw_rank;
  const svSv = row.best_sv_kw_sv ?? 0;
  const inl = row.inlinks ?? 0;
  const wc = row.word_count ?? 0;
  const idxa = (row.indexability ?? "").toLowerCase();
  const pagePath = (row.page_path ?? "").toLowerCase();
  const hp = isHomepage(row);
  const contact = isContactOrQuote(pagePath);
  const blog = isBlog(pagePath);
  const isHttp = url.toLowerCase().startsWith("http://");

  // 1. Fragment
  if (url.includes("#") && !url.endsWith("#")) {
    return { action: "Non-addressable", logic: "Fragment URL — no separate page" };
  }

  // 2. Non-analyzable (system / assets)
  if (isNonAnalyzable(url)) {
    return {
      action: "Non-addressable",
      logic: "System URL (wp-content / feed / asset)",
    };
  }

  // 3. Parameter variant
  if (isParamVariant(url)) {
    return {
      action: "Non-addressable",
      logic: "Parameter variant (UTM / _gl / gclid / fbclid)",
    };
  }

  // 4. Non-primary variant
  if (primary === false) {
    if (sc === 200) {
      return {
        action: "Redirect",
        logic: "Duplicate variant (200) — canonicalize to primary | SF: is_primary_url=false, 200 OK",
      };
    }
    if (sc && sc >= 300 && sc < 400) {
      return {
        action: "Redirect",
        logic: `Non-primary variant already redirecting (${sc}) | SF: status_code=${sc}`,
      };
    }
    if (sc === 404) {
      const hasValue =
        sessions > 0 ||
        refd > 0 ||
        (tvRank !== null && tvRank !== undefined && tvRank <= 20);
      return {
        action: "Redirect",
        logic: `Broken variant ${hasValue ? "with" : "no"} value | SF: 404`,
      };
    }
    return {
      action: "Redirect",
      logic: `Non-primary variant (status=${sc})`,
    };
  }

  // SOP 6.1 — HTTP→HTTPS canonicalization (not in 5.2 explicitly but called
  // out as a site-level signal that becomes a Redirect action).
  if (isHttp && sc === 200) {
    return {
      action: "Redirect",
      logic: `HTTP URL with sessions=${sessions}, refs=${refd} — should redirect to HTTPS | site policy`,
    };
  }

  // 5. Primary URL, status 404
  if (sc === 404) {
    if (tvRank !== null && tvRank !== undefined && tvRank <= 20) {
      return {
        action: "Restore",
        logic: `404 but ranks #${tvRank} for "${row.best_tv_keyword}" | DFS rank<=20`,
      };
    }
    if (sessions > 20) {
      return {
        action: "Restore",
        logic: `404 but ${sessions} sessions in window | GA4 sessions>20`,
      };
    }
    if (refd >= 3) {
      return {
        action: "Redirect",
        logic: `404 with ${refd} refdomains (${bls} backlinks) — link equity at risk | Ahrefs refs>=3`,
      };
    }
    if (
      sessions > 0 ||
      refd > 0 ||
      (tvRank !== null && tvRank !== undefined)
    ) {
      return {
        action: "Redirect",
        logic: `404 with some value (sessions=${sessions}, refs=${refd}, rank=${tvRank ?? "—"}) | mixed`,
      };
    }
    if (inl > 0) {
      return {
        action: "Redirect",
        logic: `404 with ${inl} internal links | SF: inlinks>0`,
      };
    }
    return {
      action: "Leave as 404",
      logic: "404 with no value signals | GA4=0, GSC=0, Ahrefs=0, no rank",
    };
  }

  // 6. Primary 301/302 — data conflict
  if (sc !== null && sc !== undefined && sc >= 300 && sc < 400) {
    return {
      action: "Investigate",
      logic: `Primary URL is redirecting (${sc}) — data conflict | SF: status_code=${sc}`,
    };
  }

  // 7. Primary 200
  if (sc === 200) {
    const staySignals: string[] = [];
    if (sessions > 0) staySignals.push(`GA4 sessions=${sessions}`);
    if (impr > 0) staySignals.push(`GSC impressions=${Math.round(impr)}`);
    if (refd > 0) staySignals.push(`Ahrefs refs=${refd}`);
    if (tvRank !== null && tvRank !== undefined && tvSv > 0) {
      staySignals.push(`DFS rank=${tvRank} (sv=${tvSv})`);
    }
    if (svRank !== null && svRank !== undefined && svSv > 0) {
      staySignals.push(`DFS sv-rank=${svRank}`);
    }
    if (conv > 0) staySignals.push(`GA4 conv=${conv}`);
    if (rev > 0) staySignals.push(`GA4 revenue=$${rev}`);
    if (hp) staySignals.push("Homepage (core page)");
    if (contact) staySignals.push("Contact/Quote (core page)");

    if (staySignals.length > 0) {
      let tier: TriageResult["tier"] = "Utility";
      if (conv > 0 || rev > 0) tier = "Revenue-Critical";
      else if (tvRank !== null && tvRank !== undefined && tvRank >= 1 && tvRank <= 10) tier = "Page 1";
      else if (tvRank !== null && tvRank !== undefined && tvRank >= 11 && tvRank <= 20) tier = "Striking Distance";
      else if (hp || contact) tier = "Core Page";
      else if (sessions > 0 || impr > 0) tier = "Has Visibility";
      else if (refd > 0) tier = "Has Authority";
      return {
        action: "Optimize",
        tier,
        logic: `[${tier}] ${staySignals.join(" | ")}`,
      };
    }

    // 7b — no stay signals
    if (idxa.includes("non-indexable") || idxa.includes("not indexable")) {
      return {
        action: "Non-indexable",
        logic: `200 + non-indexable — already excluded | SF: indexability=${row.indexability}`,
      };
    }
    if (blog && wc < 300) {
      return {
        action: "Remove",
        logic: `Thin blog post (${wc} words) | SF + GA4: no signals`,
      };
    }
    if (inl >= 5) {
      return {
        action: "Evaluate",
        logic: `No external signals but ${inl} internal links | SF inlinks>=5`,
      };
    }
    if (inl >= 2) {
      return {
        action: "Evaluate",
        logic: `Some internal links (${inl}) | SF inlinks>=2`,
      };
    }
    return {
      action: "Remove",
      logic: `No signals (sessions=0, impr=0, refs=0, no rank, inlinks=${inl})`,
    };
  }

  // 8. Other status codes
  return {
    action: "Investigate",
    logic: `Unexpected status code: ${sc ?? "null"}`,
  };
}

export const TRIAGE_ACTIONS: TriageAction[] = [
  "Optimize",
  "Restore",
  "Redirect",
  "Consolidate",
  "Remove",
  "Evaluate",
  "Leave as 404",
  "Non-addressable",
  "Non-indexable",
  "Investigate",
];

export const ACTION_TINT: Record<TriageAction, { band: string; dot: string }> = {
  Optimize: { band: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  Restore: { band: "bg-violet-50 text-violet-700", dot: "bg-violet-500" },
  Redirect: { band: "bg-sky-50 text-sky-700", dot: "bg-sky-500" },
  Consolidate: { band: "bg-indigo-50 text-indigo-700", dot: "bg-indigo-500" },
  Remove: { band: "bg-rose-50 text-rose-700", dot: "bg-rose-500" },
  Evaluate: { band: "bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  "Leave as 404": { band: "bg-slate-50 text-slate-700", dot: "bg-slate-400" },
  "Non-addressable": { band: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/40" },
  "Non-indexable": { band: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/40" },
  Investigate: { band: "bg-orange-50 text-orange-700", dot: "bg-orange-500" },
};
