import { supabase } from "./supabase";

export type RefDomainQuality = "Quality" | "Spam" | "Pending" | "Disavow";
export type DisavowStatus = "Pending" | "In File" | "Confirmed by GSC";
export type SnapshotSource = "dataforseo" | "ahrefs" | "manual";

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
};

export type DisavowEntryRow = {
  id: string;
  property_id: string;
  domain: string;
  reason: string | null;
  status: DisavowStatus;
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

export type RefDomainUpdate = {
  id: string;
  updated_by: string;
} & Partial<Pick<ReferringDomainRow, "quality" | "notes">>;

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
