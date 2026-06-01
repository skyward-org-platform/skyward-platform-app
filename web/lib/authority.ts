import { supabase } from "./supabase";

export type RefDomainQuality = "Quality" | "Spam" | "Pending" | "Disavow";
export type DisavowStatus = "Pending" | "In File" | "Confirmed by GSC";
// New v2 lifecycle values (lowercase) live alongside the legacy union; rows
// in disavow_entry can carry either spelling depending on which surface
// wrote them. Components that filter by these new values use the raw
// string literal, since the column is plain text in the DB.
export type SnapshotSource = "dataforseo" | "ahrefs" | "manual";

// ─── New Phase 5 v2 typed values ───────────────────────────────────────────
export type RdStatus = "active" | "disavow_pending" | "disavowed";
export type SpamSignal =
  | "ahrefs_spam"
  | "tld_spam"
  | "attack_pattern"
  | "manual";
export type ProspectStatus =
  | "pending"
  | "contacted"
  | "placed"
  | "declined"
  | "abandoned";
export type ProspectPriority = "high" | "medium" | "low";
export type LinkType = "followed" | "nofollow" | "sponsored" | "ugc" | "text";

export type SiteSnapshot = {
  id: string;
  property_id: string;
  snapshotted_at: string;
  domain_rating: number | null;
  ahrefs_rank: number | null;
  live_backlinks: number | null;
  live_refdomains: number | null;
  organic_keywords: number | null;
  organic_keywords_top3: number | null;
  organic_traffic: number | null;
  organic_value_cents: number | null;
  source: SnapshotSource;
  fetched_by: string;
};

export type ReferringDomainRow = {
  id: string;
  property_id: string;
  domain: string;
  first_seen: string | null;
  last_seen: string | null;
  domain_rating: number | null;
  traffic_domain: number | null;
  dofollow_links: number;
  links_to_target: number;
  detected_spam: boolean;
  quality: RefDomainQuality;
  notes: string | null;
  last_refreshed_at: string | null;
  updated_by: string;
  updated_at: string;
  // New columns added for Phase 5 v2.
  status: RdStatus;
  spam_signal: SpamSignal | null;
  tactic: string | null;
  primary_target: string | null;
  primary_anchor: string | null;
  backlink_count: number;
};

export type BacklinkRow = {
  id: string;
  property_id: string;
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
  ingested_at: string;
};

export type LinkProspectRow = {
  id: string;
  property_id: string;
  domain: string;
  dr: number | null;
  url: string | null;
  tactic: string | null;
  status: ProspectStatus;
  priority: ProspectPriority;
  contact_name: string | null;
  contact_email: string | null;
  notes: string | null;
  source: string | null;
  competitor_referring: string | null;
  placed_url: string | null;
  last_contacted_at: string | null;
  placed_at: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type LinkAuditRow = {
  id: string;
  property_id: string;
  audited_at: string;
  audited_by: string | null;
  total_backlinks: number | null;
  live_backlinks: number | null;
  total_rds: number | null;
  live_rds: number | null;
  spam_rds: number | null;
  toxic_pct: number | null;
  topline_findings: Record<string, unknown> | null;
  ahrefs_cost_units: number | null;
  duration_ms: number | null;
};

export type DisavowEntryRow = {
  id: string;
  property_id: string;
  domain: string;
  reason: string | null;
  /** Free-form text column. Legacy values: "Pending" | "In File" |
   *  "Confirmed by GSC". v2 values: "pending" | "approved" | "rejected". */
  status: string;
  added_at: string;
  added_by: string;
  notes: string | null;
  updated_at: string;
};

export type AuditDocRow = {
  id: string;
  property_id: string;
  title: string;
  filepath: string | null;
  markdown: string | null;
  generated_at: string;
  generated_by: string | null;
  notes: string | null;
};

export async function getSiteSnapshots(propertyId: string, limit = 100): Promise<SiteSnapshot[]> {
  const { data, error } = await supabase
    .from("site_snapshot")
    .select("*")
    .eq("property_id", propertyId)
    .order("snapshotted_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getSiteSnapshots: ${error.message}`);
  return (data ?? []) as SiteSnapshot[];
}

export async function getReferringDomains(propertyId: string): Promise<ReferringDomainRow[]> {
  const { data, error } = await supabase
    .from("referring_domain")
    .select("*")
    .eq("property_id", propertyId);
  if (error) throw new Error(`getReferringDomains: ${error.message}`);
  return (data ?? []) as ReferringDomainRow[];
}

export async function getDisavowEntries(propertyId: string): Promise<DisavowEntryRow[]> {
  const { data, error } = await supabase
    .from("disavow_entry")
    .select("*")
    .eq("property_id", propertyId);
  if (error) throw new Error(`getDisavowEntries: ${error.message}`);
  return (data ?? []) as DisavowEntryRow[];
}

export async function getAuditDocs(propertyId: string): Promise<AuditDocRow[]> {
  const { data, error } = await supabase
    .from("audit_doc")
    .select("*")
    .eq("property_id", propertyId)
    .order("generated_at", { ascending: false });
  if (error) throw new Error(`getAuditDocs: ${error.message}`);
  return (data ?? []) as AuditDocRow[];
}

// ─── Phase 5 v2 readers ────────────────────────────────────────────────────

export async function getBacklinksByProperty(
  propertyId: string,
): Promise<BacklinkRow[]> {
  const { data, error } = await supabase
    .from("backlink")
    .select("*")
    .eq("property_id", propertyId)
    .order("source_dr", { ascending: false, nullsFirst: false });
  if (error) throw new Error(`getBacklinksByProperty: ${error.message}`);
  return (data ?? []) as BacklinkRow[];
}

export async function getReferringDomainsByProperty(
  propertyId: string,
): Promise<ReferringDomainRow[]> {
  return getReferringDomains(propertyId);
}

export async function getLinkProspectsByProperty(
  propertyId: string,
  status?: ProspectStatus,
): Promise<LinkProspectRow[]> {
  let q = supabase
    .from("link_prospect")
    .select("*")
    .eq("property_id", propertyId);
  if (status) q = q.eq("status", status);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw new Error(`getLinkProspectsByProperty: ${error.message}`);
  return (data ?? []) as LinkProspectRow[];
}

export async function getDisavowEntriesByProperty(
  propertyId: string,
  status?: string,
): Promise<DisavowEntryRow[]> {
  let q = supabase
    .from("disavow_entry")
    .select("*")
    .eq("property_id", propertyId);
  if (status) q = q.eq("status", status);
  const { data, error } = await q.order("added_at", { ascending: false });
  if (error) throw new Error(`getDisavowEntriesByProperty: ${error.message}`);
  return (data ?? []) as DisavowEntryRow[];
}

export async function getLatestLinkAudit(
  propertyId: string,
): Promise<LinkAuditRow | null> {
  const { data, error } = await supabase
    .from("link_audit")
    .select("*")
    .eq("property_id", propertyId)
    .order("audited_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getLatestLinkAudit: ${error.message}`);
  return (data ?? null) as LinkAuditRow | null;
}

export async function getLinkAuditHistory(
  propertyId: string,
  limit = 10,
): Promise<LinkAuditRow[]> {
  const { data, error } = await supabase
    .from("link_audit")
    .select("*")
    .eq("property_id", propertyId)
    .order("audited_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getLinkAuditHistory: ${error.message}`);
  return (data ?? []) as LinkAuditRow[];
}

export type RefDomainUpdate = {
  id: string;
  updated_by: string;
} & Partial<
  Pick<
    ReferringDomainRow,
    | "quality"
    | "notes"
    | "status"
    | "tactic"
    | "spam_signal"
    | "primary_target"
    | "primary_anchor"
  >
>;

export async function updateReferringDomain(input: RefDomainUpdate): Promise<ReferringDomainRow> {
  const { id, updated_by, ...changes } = input;
  const { data, error } = await supabase
    .from("referring_domain")
    .update({ ...changes, updated_by, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`updateReferringDomain: ${error.message}`);
  return data as ReferringDomainRow;
}

export async function upsertDisavowEntry(input: {
  property_id: string;
  domain: string;
  reason?: string | null;
  status?: DisavowStatus;
  added_by: string;
}): Promise<DisavowEntryRow> {
  const { data, error } = await supabase
    .from("disavow_entry")
    .upsert({ ...input, updated_at: new Date().toISOString() }, { onConflict: "property_id,domain" })
    .select()
    .single();
  if (error) throw new Error(`upsertDisavowEntry: ${error.message}`);
  return data as DisavowEntryRow;
}

export async function updateDisavowEntry(
  id: string, changes: Partial<Pick<DisavowEntryRow, "status" | "reason">>
): Promise<DisavowEntryRow> {
  const { data, error } = await supabase
    .from("disavow_entry")
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`updateDisavowEntry: ${error.message}`);
  return data as DisavowEntryRow;
}

// ─── Portfolio rollup (all properties) ──────────────────────────────────────

export type AuthorityPortfolioRow = {
  property_id: string;
  property_slug: string;
  property_name: string;
  property_status: string | null;
  client_name: string | null;
  // Latest Ahrefs snapshot values (site-scope, source='ahrefs').
  domain_rating: number | null;
  live_rds: number | null;
  organic_keywords: number | null;
  organic_traffic: number | null;
  // 30-day deltas (latest minus baseline closest to 30d ago).
  // null when fewer than 2 snapshots exist or baseline value missing.
  dr_delta_30d: number | null;
  rds_delta_30d: number | null;
  kw_delta_30d: number | null;
  traffic_delta_30d: number | null;
  // Counts derived from referring_domain + disavow_entry.
  spam_rds_count: number;
  toxic_pct: number | null; // null when live_rds is 0 / unknown
  disavow_pending_count: number;
  // Max(audited_at) from link_audit.
  last_audit_at: string | null;
};

type RawSnapshotForPortfolio = {
  property_id: string;
  captured_date: string;
  domain_rating: number | string | null;
  referring_domains: number | null;
  organic_keywords: number | null;
  organic_traffic: number | null;
};

type RawPropertyJoin = {
  id: string;
  slug: string;
  name: string;
  status: string | null;
  client: { name: string | null } | null;
};

type RawRefDomainForPortfolio = {
  property_id: string;
  spam_signal: string | null;
};

type RawDisavowForPortfolio = {
  property_id: string;
  status: string | null;
};

type RawLinkAuditForPortfolio = {
  property_id: string;
  audited_at: string;
};

function toNumLoose(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** One-trip portfolio fetch. Pulls every active+inactive property and
 *  the four data streams the Authority surface needs, then derives a
 *  single row per property. Empty rows render with "—" placeholders. */
export async function getAuthorityPortfolioSummary(): Promise<
  AuthorityPortfolioRow[]
> {
  const [propsRes, snapsRes, refRes, disRes, auditRes] = await Promise.all([
    supabase
      .from("property")
      .select("id, slug, name, status, client:client_id(name)")
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
    supabase
      .from("referring_domain")
      .select("property_id, spam_signal"),
    supabase
      .from("disavow_entry")
      .select("property_id, status"),
    supabase
      .from("link_audit")
      .select("property_id, audited_at")
      .order("audited_at", { ascending: false }),
  ]);

  const properties = (propsRes.data ?? []) as unknown as RawPropertyJoin[];
  const snapshots = (snapsRes.data ?? []) as RawSnapshotForPortfolio[];
  const refDomains = (refRes.data ?? []) as RawRefDomainForPortfolio[];
  const disavow = (disRes.data ?? []) as RawDisavowForPortfolio[];
  const audits = (auditRes.data ?? []) as RawLinkAuditForPortfolio[];

  // Group snapshots by property, already sorted DESC by captured_date.
  const snapsByProperty = new Map<string, RawSnapshotForPortfolio[]>();
  for (const s of snapshots) {
    const arr = snapsByProperty.get(s.property_id) ?? [];
    arr.push(s);
    snapsByProperty.set(s.property_id, arr);
  }

  // Spam RD counts per property (spam_signal IS NOT NULL).
  const spamCountByProperty = new Map<string, number>();
  const liveRdsByProperty = new Map<string, number>();
  for (const r of refDomains) {
    liveRdsByProperty.set(
      r.property_id,
      (liveRdsByProperty.get(r.property_id) ?? 0) + 1,
    );
    if (r.spam_signal !== null && r.spam_signal !== undefined) {
      spamCountByProperty.set(
        r.property_id,
        (spamCountByProperty.get(r.property_id) ?? 0) + 1,
      );
    }
  }

  // Pending disavow counts per property. Accept both legacy "Pending" and
  // v2 "pending" so the rollup matches whatever live data is present.
  const pendingByProperty = new Map<string, number>();
  for (const d of disavow) {
    const s = (d.status ?? "").toLowerCase();
    if (s === "pending") {
      pendingByProperty.set(
        d.property_id,
        (pendingByProperty.get(d.property_id) ?? 0) + 1,
      );
    }
  }

  // Latest audit per property (audits arrive DESC by audited_at).
  const lastAuditByProperty = new Map<string, string>();
  for (const a of audits) {
    if (!lastAuditByProperty.has(a.property_id)) {
      lastAuditByProperty.set(a.property_id, a.audited_at);
    }
  }

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  return properties.map((p): AuthorityPortfolioRow => {
    const propSnaps = snapsByProperty.get(p.id) ?? [];
    const latest = propSnaps[0] ?? null;
    // Baseline: pick the snapshot whose captured_date is closest to (latest - 30d)
    // but strictly older than the latest. If none qualify, fall back to the oldest
    // available historical record so we still surface a directional signal.
    let baseline: RawSnapshotForPortfolio | null = null;
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
      // Defensive: ensure baseline isn't the latest row itself.
      if (baseline && baseline.captured_date === latest.captured_date) {
        baseline = propSnaps[propSnaps.length - 1];
        if (baseline.captured_date === latest.captured_date) baseline = null;
      }
    }

    const dr = latest ? toNumLoose(latest.domain_rating) : null;
    const rds = latest ? latest.referring_domains : null;
    const kw = latest ? latest.organic_keywords : null;
    const traffic = latest ? latest.organic_traffic : null;
    const baseDr = baseline ? toNumLoose(baseline.domain_rating) : null;
    const baseRds = baseline ? baseline.referring_domains : null;
    const baseKw = baseline ? baseline.organic_keywords : null;
    const baseTraffic = baseline ? baseline.organic_traffic : null;

    // Prefer the link_audit-reported live RDs over the raw referring_domain
    // row count if a snapshot is available (more accurate; matches the
    // per-property authority surface). Otherwise fall back to the joined
    // referring_domain count.
    const liveRdsFromSnapshot = rds;
    const liveRdsFromTable = liveRdsByProperty.get(p.id) ?? 0;
    const liveRdsForToxic =
      liveRdsFromSnapshot && liveRdsFromSnapshot > 0
        ? liveRdsFromSnapshot
        : liveRdsFromTable;
    const spamCount = spamCountByProperty.get(p.id) ?? 0;
    const toxic_pct =
      liveRdsForToxic > 0 ? (spamCount / liveRdsForToxic) * 100 : null;

    return {
      property_id: p.id,
      property_slug: p.slug,
      property_name: p.name,
      property_status: p.status,
      client_name: p.client?.name ?? null,
      domain_rating: dr,
      live_rds: liveRdsFromSnapshot ?? liveRdsFromTable,
      organic_keywords: kw,
      organic_traffic: traffic,
      dr_delta_30d:
        dr !== null && baseDr !== null ? Number((dr - baseDr).toFixed(1)) : null,
      rds_delta_30d:
        rds !== null && baseRds !== null ? rds - baseRds : null,
      kw_delta_30d:
        kw !== null && baseKw !== null ? kw - baseKw : null,
      traffic_delta_30d:
        traffic !== null && baseTraffic !== null
          ? traffic - baseTraffic
          : null,
      spam_rds_count: spamCount,
      toxic_pct,
      disavow_pending_count: pendingByProperty.get(p.id) ?? 0,
      last_audit_at: lastAuditByProperty.get(p.id) ?? null,
    };
  });
}

// ─── Alerts (computed at read time) ────────────────────────────────────────
export type Alert =
  | { kind: "spam_wave"; severity: "rose"; count: number; sample_pattern: string | null }
  | { kind: "stale_disavow"; severity: "amber"; pending_count: number; last_in_file_days: number | null }
  | { kind: "dr_drop"; severity: "amber"; from: number; to: number; days: number }
  | { kind: "quality_acquisitions"; severity: "emerald"; count: number; top_examples: string[] };

export function computeAlerts(
  snapshots: SiteSnapshot[],
  refDomains: ReferringDomainRow[],
  disavow: DisavowEntryRow[],
): Alert[] {
  const alerts: Alert[] = [];
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  // Spam wave: ≥10 new is_spam in last 14 days
  const recent14Spam = refDomains.filter(r =>
    r.detected_spam && r.first_seen && (now - Date.parse(r.first_seen)) <= 14 * day
  );
  if (recent14Spam.length >= 10) {
    // Find a common prefix in the domain names (simple heuristic)
    const samples = recent14Spam.slice(0, 5).map(r => r.domain);
    let pattern: string | null = null;
    if (samples.length >= 3) {
      const first = samples[0];
      const matches = samples.every(s => s.includes(first.split('.')[0].split('-').pop() ?? ''));
      pattern = matches ? samples[0] : null;
    }
    alerts.push({
      kind: "spam_wave",
      severity: "rose",
      count: recent14Spam.length,
      sample_pattern: pattern,
    });
  }

  // Stale disavow
  const pending = disavow.filter(d => d.status === "Pending");
  if (pending.length > 0) {
    const oldestPending = Math.min(...pending.map(d => Date.parse(d.added_at)));
    const daysSince = Math.floor((now - oldestPending) / day);
    if (daysSince >= 14) {
      alerts.push({
        kind: "stale_disavow",
        severity: "amber",
        pending_count: pending.length,
        last_in_file_days: daysSince,
      });
    }
  }

  // DR drop
  if (snapshots.length >= 2) {
    const latest = snapshots[0];
    const baseline = snapshots.find(s =>
      (Date.parse(latest.snapshotted_at) - Date.parse(s.snapshotted_at)) >= 7 * day
    );
    if (latest.domain_rating != null && baseline?.domain_rating != null) {
      const drop = baseline.domain_rating - latest.domain_rating;
      if (drop >= 2) {
        alerts.push({
          kind: "dr_drop",
          severity: "amber",
          from: baseline.domain_rating,
          to: latest.domain_rating,
          days: Math.floor((Date.parse(latest.snapshotted_at) - Date.parse(baseline.snapshotted_at)) / day),
        });
      }
    }
  }

  // Quality acquisitions: ≥3 new Quality in last 30 days
  const recentQuality = refDomains.filter(r =>
    r.quality === "Quality" && r.first_seen && (now - Date.parse(r.first_seen)) <= 30 * day
  );
  if (recentQuality.length >= 3) {
    const top = recentQuality
      .sort((a, b) => (b.domain_rating ?? 0) - (a.domain_rating ?? 0))
      .slice(0, 3)
      .map(r => `${r.domain} (DR ${r.domain_rating ?? "—"})`);
    alerts.push({
      kind: "quality_acquisitions",
      severity: "emerald",
      count: recentQuality.length,
      top_examples: top,
    });
  }

  return alerts;
}
