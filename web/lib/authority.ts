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
