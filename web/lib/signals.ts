// Signal detection — V1.1 surface for /signals (v2 screen 9).
//
// Detects signals from data we ALREADY have in Supabase. No new
// infrastructure. Skips what would need external integrations:
//   - Ranking deltas (would need GSC integration)
//   - Real-time external feeds
//   - Snooze state (would need a snoozed_signals table)
//
// Strategy: three batch queries cover every active property + its pages +
// its Brand DNA sections. Compute signals in memory.

import { supabase } from "./supabase";

export type SignalSeverity = "urgent" | "watch" | "info";

export type SignalType =
  | "no_brand_dna"
  | "thin_brand_dna"
  | "high_undecided"
  | "low_confidence"
  | "stale_audit";

export type Signal = {
  /** Stable id derived from (type · property.slug · optional discriminator). */
  id: string;
  severity: SignalSeverity;
  type: SignalType;
  title: string;
  detail: string;
  property: {
    id: string;
    slug: string;
    name: string;
    client: string | null;
  };
  source: string;
  action: { label: string; href: string };
};

const SEVERITY_ORDER: Record<SignalSeverity, number> = {
  urgent: 0,
  watch: 1,
  info: 2,
};

// Thresholds — all chosen so the V1.1 surface shows a useful amount of
// signal on phil-lasry / TNA / BusBank / etc. Tune in V1.2 once we have
// feedback from real usage.
const THIN_BRAND_DNA_MAX = 3;
const HIGH_UNDECIDED_PCT = 0.2;
const LOW_CONFIDENCE_THRESHOLD = 0.6;
const STALE_AUDIT_DAYS = 60;

type PropertyRow = {
  id: string;
  slug: string;
  name: string;
  client: { name: string } | null;
};

type PageRow = {
  property_id: string;
  audit_action: string | null;
  audit_decided_at: string | null;
};

type SectionRow = {
  property_id: string;
  section: string;
  content: Record<string, unknown> | null;
  body: string | null;
  confidence: number | null;
};

export type SignalSnapshot = {
  active: Signal[];
  snoozed: Signal[];
  snoozedAt: Map<string, string>;
};

/** Detect every signal and return active vs snoozed split. The two pages
 *  (dashboard card + /signals) consume this and filter accordingly. */
export async function detectSignals(): Promise<SignalSnapshot> {
  const all = await detectAllSignals();
  const snoozedRows = await getSnoozedRows();
  const snoozedIds = new Set(snoozedRows.map((r) => r.signal_id));
  const snoozedAt = new Map(
    snoozedRows.map((r) => [r.signal_id, r.snoozed_at]),
  );
  const active: Signal[] = [];
  const snoozed: Signal[] = [];
  for (const s of all) (snoozedIds.has(s.id) ? snoozed : active).push(s);
  return { active, snoozed, snoozedAt };
}

async function getSnoozedRows(): Promise<
  { signal_id: string; snoozed_at: string }[]
> {
  try {
    const { data, error } = await supabase
      .from("snoozed_signal")
      .select("signal_id, snoozed_at");
    if (error) return [];
    return (data ?? []) as { signal_id: string; snoozed_at: string }[];
  } catch {
    return [];
  }
}

async function detectAllSignals(): Promise<Signal[]> {
  const [propsRes, pagesRes, sectionsRes] = await Promise.all([
    supabase
      .from("property")
      .select("id, slug, name, client:client_id(name)")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("page")
      .select("property_id, audit_action, audit_decided_at"),
    supabase
      .from("brand_dna_section")
      .select("property_id, section, content, body, confidence"),
  ]);

  const properties = (propsRes.data ?? []) as unknown as PropertyRow[];
  const pages = (pagesRes.data ?? []) as PageRow[];
  const sections = (sectionsRes.data ?? []) as SectionRow[];

  // Bucket per property.
  const pagesByProp = new Map<string, PageRow[]>();
  for (const p of pages) {
    const arr = pagesByProp.get(p.property_id) ?? [];
    arr.push(p);
    pagesByProp.set(p.property_id, arr);
  }
  const sectionsByProp = new Map<string, SectionRow[]>();
  for (const s of sections) {
    const arr = sectionsByProp.get(s.property_id) ?? [];
    arr.push(s);
    sectionsByProp.set(s.property_id, arr);
  }

  const signals: Signal[] = [];

  for (const prop of properties) {
    const propInfo = {
      id: prop.id,
      slug: prop.slug,
      name: prop.name,
      client: prop.client?.name ?? null,
    };
    const propSections = sectionsByProp.get(prop.id) ?? [];
    const filledSections = propSections.filter((s) => isSectionFilled(s));
    const propPages = pagesByProp.get(prop.id) ?? [];

    // ── Brand DNA coverage ─────────────────────────────────────────────
    if (filledSections.length === 0) {
      signals.push({
        id: `no_brand_dna:${prop.slug}`,
        severity: "urgent",
        type: "no_brand_dna",
        title: "No Brand DNA on active property",
        detail: `${prop.name} is active but has no Brand DNA sections filled. Strategy work depends on this — populate before Phase 3.`,
        property: propInfo,
        source: "Brand DNA coverage check",
        action: {
          label: "Open Brand DNA",
          href: `/properties/${prop.slug}/brand-dna`,
        },
      });
    } else if (filledSections.length < THIN_BRAND_DNA_MAX) {
      signals.push({
        id: `thin_brand_dna:${prop.slug}`,
        severity: "watch",
        type: "thin_brand_dna",
        title: `Thin Brand DNA · ${filledSections.length} of 12 sections`,
        detail: `${prop.name} only has ${filledSections.length} Brand DNA sections filled. Aim for 6+ before content production.`,
        property: propInfo,
        source: "Brand DNA coverage check",
        action: {
          label: "Open Brand DNA",
          href: `/properties/${prop.slug}/brand-dna`,
        },
      });
    }

    // Low-confidence individual sections (top 1 per property to keep the
    // surface scannable — multiple under one property would clutter).
    const lowestConfidence = propSections
      .filter(
        (s) =>
          s.confidence !== null && s.confidence < LOW_CONFIDENCE_THRESHOLD,
      )
      .sort((a, b) => (a.confidence ?? 1) - (b.confidence ?? 1))[0];
    if (lowestConfidence) {
      signals.push({
        id: `low_confidence:${prop.slug}:${lowestConfidence.section}`,
        severity: "info",
        type: "low_confidence",
        title: `Low-confidence Brand DNA · ${humanSection(lowestConfidence.section)}`,
        detail: `${prop.name} · ${humanSection(lowestConfidence.section)} (confidence ${lowestConfidence.confidence?.toFixed(2)}). Review and lock or rerun inference.`,
        property: propInfo,
        source: "Confidence threshold scan",
        action: {
          label: "Open section",
          href: `/properties/${prop.slug}/brand-dna/${sectionToSlug(lowestConfidence.section)}`,
        },
      });
    }

    // ── Pages triage backlog ───────────────────────────────────────────
    if (propPages.length > 0) {
      const undecided = propPages.filter(
        (p) => (p.audit_action ?? "undecided") === "undecided",
      ).length;
      const pct = undecided / propPages.length;
      if (pct >= HIGH_UNDECIDED_PCT && undecided >= 5) {
        signals.push({
          id: `high_undecided:${prop.slug}`,
          severity: "watch",
          type: "high_undecided",
          title: `${undecided} undecided pages · ${prop.name}`,
          detail: `${(pct * 100).toFixed(0)}% of ${propPages.length.toLocaleString()} pages are still marked undecided. Triage before Phase 3.`,
          property: propInfo,
          source: "Triage backlog scan",
          action: {
            label: "Open Pages",
            href: `/properties/${prop.slug}/pages`,
          },
        });
      }

      // Stale audit: most recent decision is older than STALE_AUDIT_DAYS,
      // and there's at least one decided page.
      const latestDecision = propPages.reduce<string | null>((acc, p) => {
        if (!p.audit_decided_at) return acc;
        if (!acc || p.audit_decided_at > acc) return p.audit_decided_at;
        return acc;
      }, null);
      if (latestDecision) {
        const daysSince = Math.floor(
          (Date.now() - +new Date(latestDecision)) / (24 * 60 * 60 * 1000),
        );
        if (daysSince >= STALE_AUDIT_DAYS) {
          signals.push({
            id: `stale_audit:${prop.slug}`,
            severity: "info",
            type: "stale_audit",
            title: `Stale audit · ${prop.name}`,
            detail: `Last audit decision was ${daysSince} days ago. Crawl + re-triage before kicking off content work.`,
            property: propInfo,
            source: "Crawl freshness check",
            action: {
              label: "Open Pages",
              href: `/properties/${prop.slug}/pages`,
            },
          });
        }
      }
    }
  }

  // Sort: severity first, then property name.
  signals.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.property.name.localeCompare(b.property.name),
  );

  return signals;
}

function isSectionFilled(s: SectionRow): boolean {
  if (s.body && s.body.trim().length > 0) return true;
  if (s.content) {
    return Object.values(s.content).some(
      (v) =>
        v !== null &&
        v !== undefined &&
        v !== "" &&
        !(Array.isArray(v) && v.length === 0),
    );
  }
  return false;
}

function humanSection(section: string): string {
  return section.replace(/_/g, " ");
}

function sectionToSlug(section: string): string {
  // Mirrors the mapping in lib/brand-dna-subnav.ts. Keeping this local
  // because importing the array there would create a cycle for code paths
  // that import signals on the server.
  switch (section) {
    case "identity":
      return "identity";
    case "voice_tone":
      return "voice-tone";
    case "offerings":
      return "offerings";
    case "brand_terms":
      return "brand-terms";
    case "proof":
      return "proof";
    case "site_structure":
      return "site-structure";
    case "goals":
      return "commercial-policy";
    case "future_audience":
      return "audiences";
    case "personas":
      return "personas";
    default:
      return "";
  }
}

/** Cheap count of ACTIVE (non-snoozed) signals — used by the Sidebar to
 *  badge the workspace Signals link. Heavy (3 full-table scans) but runs
 *  uncached for now; cross-request caching to be re-added via "use cache"
 *  after the Next 16 deprecation pattern is sorted. */
export async function signalCount(): Promise<number> {
  const snapshot = await detectSignals();
  return snapshot.active.length;
}
