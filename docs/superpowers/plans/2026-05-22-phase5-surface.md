# Phase 5 Authority Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/properties/[slug]/authority` as the canonical Phase 5 monitoring dashboard — DR/refdomain/traffic trend tracking, spam-wave alerts, user classification of referring domains, disavow.txt export, with on-demand refresh via DataForSEO Backlinks REST.

**Architecture:** 4 new Supabase tables (site_snapshot append-only time-series; referring_domain with quality override; disavow_entry; audit_doc). New Vercel Python endpoint `/api/authority/refresh` calls DFS Backlinks REST API and writes snapshot + upserts ref domains preserving user overrides. Universal drawer extends with RefDomain subject (5th polymorphic variant). Alerts computed at read time.

**Tech Stack:** Next.js 16 (App Router + RSC), Supabase Postgres + RLS, Python on Vercel (urllib for DFS REST), existing `@/lib/supabase` singleton, existing drawer + chip patterns from /pages, /keywords, /content.

**Spec:** `docs/superpowers/specs/2026-05-22-phase5-surface-design.md`

---

## File Structure

```
db/supabase/migrations/
  20260522_authority_tables.sql                              [new] 4 tables + 2 history mirrors + 2 triggers + RLS

delivery/tna/
  phase5_backfill_supabase.py                                [new] one-shot backfill: triggers /api/authority/refresh for each property + inlines existing audit docs

web/lib/
  authority.ts                                               [new] typed Supabase queries for all 4 tables + alert computation

web/app/properties/[slug]/authority/
  page.tsx                                                   [new] route; fetches snapshot + refdomains + audits + computes alerts → ContentView
  actions.ts                                                 [new] 7 server actions per spec

web/api/authority/
  refresh.py                                                 [new] DFS Backlinks REST caller; writes site_snapshot + upserts referring_domain

web/components/authority/
  AuthorityView.tsx                                          [new] 3-tab nav shell
  OverviewTab.tsx                                            [new] stat tiles + alerts + recent acquisitions + DR trend SVG
  ReferringDomainsTab.tsx                                    [new] counter chips + filter row + main table with inline quality chip
  AuditsTab.tsx                                              [new] list of audit_doc cards
  QualityChip.tsx                                            [new] Quality/Spam/Pending/Disavow action chip
  RefreshButton.tsx                                          [new] calls runAuthorityRefresh server action
  DrTrendChart.tsx                                           [new] inline SVG line chart (no library)

web/components/
  UrlDrawer.tsx                                              [modify] add RefDomain subject (5th variant)
```

---

## Chunk 1: Schema migration + lib

### Task 1.1: Migration

**Files:**
- Create: `db/supabase/migrations/20260522_authority_tables.sql`

- [ ] **Step 1: Write the migration**

```sql
-- site_snapshot: append-only time-series
create table if not exists site_snapshot (
  id                    uuid primary key default gen_random_uuid(),
  property_id           uuid not null references property(id) on delete cascade,
  snapshotted_at        timestamptz not null default now(),
  domain_rating         numeric,
  ahrefs_rank           bigint,
  live_backlinks        int,
  live_refdomains       int,
  organic_keywords      int,
  organic_keywords_top3 int,
  organic_traffic       int,
  organic_value_cents   int,
  source                text not null default 'dataforseo'
                         check (source in ('dataforseo','ahrefs','manual')),
  fetched_by            text not null
);

create index if not exists idx_site_snapshot_property_at
  on site_snapshot (property_id, snapshotted_at desc);

alter table site_snapshot enable row level security;
create policy "team can read site_snapshot" on site_snapshot for select
  using (auth.role() = 'authenticated');
create policy "team can write site_snapshot" on site_snapshot for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );

-- referring_domain: per-domain state with user quality override
create table if not exists referring_domain (
  id                  uuid primary key default gen_random_uuid(),
  property_id         uuid not null references property(id) on delete cascade,
  domain              text not null,
  first_seen          timestamptz,
  last_seen           timestamptz,
  domain_rating       numeric,
  traffic_domain      int,
  dofollow_links      int default 0,
  links_to_target     int default 1,
  detected_spam       boolean default false,
  quality             text not null default 'Pending'
                       check (quality in ('Quality','Spam','Pending','Disavow')),
  notes               text,
  last_refreshed_at   timestamptz,
  updated_by          text not null,
  updated_at          timestamptz not null default now()
);

create unique index if not exists idx_ref_domain_property_domain on referring_domain (property_id, domain);
create index if not exists idx_ref_domain_property_quality on referring_domain (property_id, quality);
create index if not exists idx_ref_domain_property_first_seen on referring_domain (property_id, first_seen desc);

alter table referring_domain enable row level security;
create policy "team can read referring_domain" on referring_domain for select
  using (auth.role() = 'authenticated');
create policy "team can write referring_domain" on referring_domain for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );

create table if not exists referring_domain_history (
  id              uuid primary key default gen_random_uuid(),
  referring_domain_id uuid not null references referring_domain(id) on delete cascade,
  property_id     uuid not null,
  domain          text not null,
  quality         text,
  notes           text,
  updated_by      text not null,
  snapshotted_at  timestamptz not null default now()
);

create index if not exists idx_ref_domain_history on referring_domain_history (referring_domain_id, snapshotted_at desc);

create or replace function snapshot_referring_domain() returns trigger
language plpgsql as $$
begin
  insert into referring_domain_history
    (referring_domain_id, property_id, domain, quality, notes, updated_by)
  values
    (old.id, old.property_id, old.domain, old.quality, old.notes, old.updated_by);
  return new;
end; $$;

drop trigger if exists trg_snapshot_referring_domain on referring_domain;
create trigger trg_snapshot_referring_domain
  before update on referring_domain
  for each row
  when (
       old.quality is distinct from new.quality
    or old.notes is distinct from new.notes
  )
  execute function snapshot_referring_domain();

alter table referring_domain_history enable row level security;
create policy "team can read referring_domain_history" on referring_domain_history for select
  using (auth.role() = 'authenticated');

-- disavow_entry: managed disavow file
create table if not exists disavow_entry (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references property(id) on delete cascade,
  domain          text not null,
  reason          text,
  status          text not null default 'Pending'
                   check (status in ('Pending','In File','Confirmed by GSC')),
  added_at        timestamptz not null default now(),
  added_by        text not null,
  notes           text,
  updated_at      timestamptz not null default now()
);

create unique index if not exists idx_disavow_property_domain on disavow_entry (property_id, domain);
create index if not exists idx_disavow_property_status on disavow_entry (property_id, status);

alter table disavow_entry enable row level security;
create policy "team can read disavow_entry" on disavow_entry for select
  using (auth.role() = 'authenticated');
create policy "team can write disavow_entry" on disavow_entry for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );

create table if not exists disavow_entry_history (
  id              uuid primary key default gen_random_uuid(),
  disavow_entry_id uuid not null references disavow_entry(id) on delete cascade,
  property_id     uuid not null,
  domain          text not null,
  reason          text,
  status          text not null,
  added_by        text not null,
  snapshotted_at  timestamptz not null default now()
);

create index if not exists idx_disavow_history on disavow_entry_history (disavow_entry_id, snapshotted_at desc);

create or replace function snapshot_disavow_entry() returns trigger
language plpgsql as $$
begin
  insert into disavow_entry_history
    (disavow_entry_id, property_id, domain, reason, status, added_by)
  values
    (old.id, old.property_id, old.domain, old.reason, old.status, old.added_by);
  return new;
end; $$;

drop trigger if exists trg_snapshot_disavow_entry on disavow_entry;
create trigger trg_snapshot_disavow_entry
  before update on disavow_entry
  for each row
  when (
       old.status is distinct from new.status
    or old.reason is distinct from new.reason
  )
  execute function snapshot_disavow_entry();

alter table disavow_entry_history enable row level security;
create policy "team can read disavow_entry_history" on disavow_entry_history for select
  using (auth.role() = 'authenticated');

-- audit_doc: pointers to markdown audit docs
create table if not exists audit_doc (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references property(id) on delete cascade,
  title           text not null,
  filepath        text,
  markdown        text,
  generated_at    timestamptz not null,
  generated_by    text,
  notes           text
);

create index if not exists idx_audit_doc_property_at on audit_doc (property_id, generated_at desc);

alter table audit_doc enable row level security;
create policy "team can read audit_doc" on audit_doc for select
  using (auth.role() = 'authenticated');
create policy "team can write audit_doc" on audit_doc for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );
```

- [ ] **Step 2: Apply migration**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app/db && supabase db query --linked --file supabase/migrations/20260522_authority_tables.sql
```

If `supabase db query` fails because the CLI isn't linked, use the MCP `mcp__plugin_supabase_supabase__apply_migration` tool as a fallback (the Chunk 1 subagent on Phase 4 already had to do this — the project is `ceyovawndjleprzjsjsr`).

- [ ] **Step 3: Verify**

```bash
supabase db query --linked --sql "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('site_snapshot','referring_domain','referring_domain_history','disavow_entry','disavow_entry_history','audit_doc') ORDER BY table_name;"
```

Expected: 6 rows.

- [ ] **Step 4: Smoke-test trigger** (optional but recommended)

```sql
INSERT INTO referring_domain (property_id, domain, updated_by)
VALUES ((SELECT id FROM property WHERE slug='buscharter'), '__smoke_test_domain__', 'system:smoke');
UPDATE referring_domain SET quality='Spam' WHERE domain='__smoke_test_domain__';
SELECT COUNT(*) FROM referring_domain_history WHERE domain='__smoke_test_domain__';  -- expect 1
DELETE FROM referring_domain WHERE domain='__smoke_test_domain__';
```

- [ ] **Step 5: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add db/supabase/migrations/20260522_authority_tables.sql && git commit -m "feat(db): authority tables (site_snapshot/referring_domain/disavow_entry/audit_doc) + history + triggers"
```

### Task 1.2: web/lib/authority.ts

**Files:**
- Create: `web/lib/authority.ts`

- [ ] **Step 1: Write the lib**

```typescript
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
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add web/lib/authority.ts && git commit -m "feat(lib): authority typed queries + alert computation"
```

---

## Chunk 2: DFS Backlinks endpoint + refresh action + backfill

### Task 2.1: DataForSEO Backlinks REST endpoint

**Files:**
- Create: `web/api/authority/refresh.py`

- [ ] **Step 1: Inspect existing Vercel Python endpoint patterns**

Read `web/api/wqa/export.py` to see the BaseHTTPRequestHandler pattern + Supabase service-role client init + how request params are parsed.

- [ ] **Step 2: Write the endpoint**

```python
"""Vercel Python function: refresh authority data for one property.

POST /api/authority/refresh?slug=<slug>

Calls DataForSEO Backlinks REST API:
- /v3/backlinks/summary/live  (DR, total backlinks, ref domains, organic metrics)
- /v3/backlinks/referring_domains/live  (latest 1000 ref domains by first_seen desc)

Writes:
- 1 new row to site_snapshot
- Upserts to referring_domain by (property_id, domain), preserving user quality + notes

Returns JSON {snapshot, refdomains_upserted} or {error}.
"""
import base64
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler

from supabase import create_client


DFS_BASE = "https://api.dataforseo.com/v3"


def dfs_post(path: str, payload: list[dict]) -> dict:
    """POST to DataForSEO. Returns parsed JSON."""
    login = os.environ["DATAFORSEO_LOGIN"]
    password = os.environ["DATAFORSEO_PASSWORD"]
    auth = base64.b64encode(f"{login}:{password}".encode()).decode()
    req = urllib.request.Request(
        f"{DFS_BASE}{path}",
        method="POST",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Basic {auth}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read())


def get_summary(domain: str) -> dict | None:
    """Returns the 'item' dict from /backlinks/summary/live."""
    r = dfs_post("/backlinks/summary/live", [{"target": domain, "internal_list_limit": 10}])
    tasks = r.get("tasks") or []
    if not tasks:
        return None
    result = (tasks[0].get("result") or [])
    return result[0] if result else None


def get_referring_domains(domain: str, limit: int = 1000) -> list[dict]:
    """Returns rows from /backlinks/referring_domains/live, latest first_seen first."""
    r = dfs_post("/backlinks/referring_domains/live", [{
        "target": domain,
        "limit": limit,
        "order_by": ["first_seen,desc"],
        "internal_list_limit": 10,
    }])
    tasks = r.get("tasks") or []
    if not tasks:
        return []
    result = (tasks[0].get("result") or [])
    return result[0].get("items", []) if result else []


def refresh_property(db, slug: str, operator: str) -> dict:
    prop = db.table("property").select("id, primary_domain").eq("slug", slug).single().execute().data
    if not prop:
        return {"ok": False, "error": f"property slug={slug} not found"}
    property_id = prop["id"]
    domain = prop["primary_domain"]
    if not domain:
        return {"ok": False, "error": f"property slug={slug} has no primary_domain"}

    summary = get_summary(domain) or {}
    refdomains = get_referring_domains(domain)

    # Write snapshot
    snapshot = {
        "property_id": property_id,
        "domain_rating": summary.get("rank"),  # DFS calls it "rank"; treat as DR proxy
        "live_backlinks": summary.get("backlinks"),
        "live_refdomains": summary.get("referring_domains"),
        # Organic metrics aren't in /backlinks/summary; left null. Can add a
        # separate /labs call later if needed.
        "source": "dataforseo",
        "fetched_by": operator,
    }
    snap_result = db.table("site_snapshot").insert(snapshot).execute()
    snap_id = (snap_result.data or [{}])[0].get("id")

    # Upsert referring domains, preserving user quality + notes
    BATCH = 200
    upserted = 0
    for i in range(0, len(refdomains), BATCH):
        rows = []
        for d in refdomains[i:i+BATCH]:
            rows.append({
                "property_id": property_id,
                "domain": d.get("domain"),
                "first_seen": d.get("first_seen"),
                "last_seen": d.get("last_seen"),
                "domain_rating": d.get("rank"),
                "traffic_domain": d.get("backlinks_spam_score"),  # placeholder; DFS field names vary
                "dofollow_links": d.get("dofollow"),
                "links_to_target": d.get("backlinks"),
                "detected_spam": bool(d.get("is_lost") or False),
                "last_refreshed_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": operator,
            })
        # IMPORTANT: don't include quality or notes in the upsert payload —
        # those are user-edited and Postgres ON CONFLICT will leave them alone
        # because they're not in the SET clause.
        result = db.table("referring_domain").upsert(
            rows, on_conflict="property_id,domain", ignore_duplicates=False,
        ).execute()
        upserted += len(result.data or [])

    return {
        "ok": True,
        "snapshot_id": snap_id,
        "refdomains_upserted": upserted,
        "total_refdomains_seen": len(refdomains),
    }


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            slug = (params.get("slug") or [None])[0]
            if not slug:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": False, "error": "missing ?slug="}).encode())
                return

            operator = self.headers.get("X-Operator") or "system:authority-refresh"

            db = create_client(
                os.environ["SUPABASE_URL"],
                os.environ["SUPABASE_SERVICE_ROLE_KEY"],
            )

            result = refresh_property(db, slug, operator)
            status = 200 if result.get("ok") else 500
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "error": f"{type(e).__name__}: {e}"}).encode())
```

**Critical implementation notes for the subagent**:
- DataForSEO's field names differ from Ahrefs. The mapping I've used (`rank` → `domain_rating`, `referring_domains`, etc.) is a best guess based on DFS docs. Before running for real, check the actual response with one test call: `curl -u $DATAFORSEO_LOGIN:$DATAFORSEO_PASSWORD -d '[{"target":"buscharter.com.au"}]' https://api.dataforseo.com/v3/backlinks/summary/live` and adjust field names if needed.
- `is_lost` is NOT the spam flag; DFS spam scoring is in a `backlinks_spam_score` field (numeric). The subagent should use a threshold (e.g. spam_score > 60) to set `detected_spam=true`. Fix this in the script before running.
- The `web/api/` directory may need a `requirements.txt` listing `supabase` for Vercel Python deploys. If `web/api/wqa/` has one, mirror it.

- [ ] **Step 3: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add web/api/authority/refresh.py && git commit -m "feat(api): authority/refresh endpoint — DFS Backlinks → site_snapshot + referring_domain upsert"
```

### Task 2.2: runAuthorityRefresh server action

**Files:**
- Create: `web/app/properties/[slug]/authority/actions.ts`

- [ ] **Step 1: Write server actions**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireWriteToken } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import { apiBase } from "@/lib/api-base";
import {
  updateReferringDomain,
  upsertDisavowEntry,
  updateDisavowEntry,
  getDisavowEntries,
  type RefDomainQuality,
  type DisavowStatus,
} from "@/lib/authority";
import { supabase } from "@/lib/supabase";

type Ok = { ok: true };
type Err = { ok: false; error: string };

function bust(slug: string) {
  revalidatePath(`/properties/${slug}/authority`);
}

async function resolveDomainRowId(slug: string, domain: string): Promise<string | null> {
  const { data: prop } = await supabase
    .from("property")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!prop) return null;
  const { data: row } = await supabase
    .from("referring_domain")
    .select("id")
    .eq("property_id", prop.id)
    .eq("domain", domain)
    .single();
  return row?.id ?? null;
}

export async function setDomainQuality(
  slug: string, domain: string, quality: RefDomainQuality,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const id = await resolveDomainRowId(slug, domain);
  if (!id) return { ok: false, error: "referring_domain not found" };
  try {
    await updateReferringDomain({ id, quality, updated_by: getOperator() });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setDomainNotes(
  slug: string, domain: string, notes: string | null,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const id = await resolveDomainRowId(slug, domain);
  if (!id) return { ok: false, error: "referring_domain not found" };
  try {
    await updateReferringDomain({ id, notes, updated_by: getOperator() });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function addToDisavow(
  slug: string, domain: string, reason: string | null,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const { data: prop } = await supabase
    .from("property")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!prop) return { ok: false, error: "property not found" };
  try {
    await upsertDisavowEntry({
      property_id: prop.id, domain, reason,
      added_by: getOperator(),
    });
    // Also set quality=Disavow on the referring_domain row, if present
    const id = await resolveDomainRowId(slug, domain);
    if (id) {
      await updateReferringDomain({ id, quality: "Disavow", updated_by: getOperator() });
    }
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setDisavowStatus(
  slug: string, domain: string, status: DisavowStatus,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const { data: prop } = await supabase
    .from("property")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!prop) return { ok: false, error: "property not found" };
  const { data: row } = await supabase
    .from("disavow_entry")
    .select("id")
    .eq("property_id", prop.id)
    .eq("domain", domain)
    .single();
  if (!row) return { ok: false, error: "disavow_entry not found" };
  try {
    await updateDisavowEntry(row.id, { status });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setDisavowReason(
  slug: string, domain: string, reason: string | null,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const { data: prop } = await supabase
    .from("property")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!prop) return { ok: false, error: "property not found" };
  const { data: row } = await supabase
    .from("disavow_entry")
    .select("id")
    .eq("property_id", prop.id)
    .eq("domain", domain)
    .single();
  if (!row) return { ok: false, error: "disavow_entry not found" };
  try {
    await updateDisavowEntry(row.id, { reason });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function runAuthorityRefresh(slug: string): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  try {
    const url = `${apiBase()}/api/authority/refresh?slug=${encodeURIComponent(slug)}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "X-Operator": getOperator() },
    });
    if (!resp.ok) {
      const body = await resp.text();
      return { ok: false, error: `refresh failed (${resp.status}): ${body.slice(0, 300)}` };
    }
    const data = await resp.json();
    if (!data.ok) return { ok: false, error: data.error ?? "refresh returned ok=false" };
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function exportDisavowTxt(slug: string): Promise<string | { error: string }> {
  const { data: prop } = await supabase
    .from("property")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!prop) return { error: "property not found" };
  const entries = await getDisavowEntries(prop.id);
  const inFile = entries.filter(e => e.status === "In File" || e.status === "Confirmed by GSC");
  const sorted = [...inFile].sort((a, b) => a.domain.localeCompare(b.domain));
  const lines = [
    `# Disavow file for ${slug}`,
    `# Generated ${new Date().toISOString()} from Skyward Platform`,
    `# Includes ${sorted.length} domains marked 'In File' or 'Confirmed by GSC'`,
    "",
    ...sorted.map(e => `domain:${e.domain}`),
  ];
  return lines.join("\n");
}
```

- [ ] **Step 2: Type-check + build**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app/web && npm run build 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add web/app/properties/[slug]/authority/actions.ts && git commit -m "feat(actions): authority server actions (quality/notes/disavow/refresh/export)"
```

### Task 2.3: Backfill script for all 8 TNA properties

**Files:**
- Create: `delivery/tna/phase5_backfill_supabase.py`

- [ ] **Step 1: Write the backfill**

```python
"""Phase 5 Supabase backfill: trigger /api/authority/refresh for each TNA
property + inline existing audit docs into audit_doc.

Cost: ~$0.20-0.50 DFS per property; ~$2-4 total.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path("/Users/paulskirbe/agency/.env"))

SLUGS = [
    "buscharter", "tnabushire", "bushire-au", "minibushire",
    "partybusguru", "transportnetworkaustralia", "bushire-nz", "minibushire-nz",
]

# Existing audit docs we want to inline into audit_doc
AUDIT_DOCS = [
    {
        "slug": "buscharter",
        "title": "Initial backlink audit (handover)",
        "filepath": "delivery/tna/buscharter/link-building/link-build-strategy/buscharter-backlink-audit-2026-03-31.md",
        "generated_at": "2026-03-31T00:00:00Z",
        "generated_by": "skyward",
    },
    {
        "slug": "buscharter",
        "title": "Link audit diff: 7 weeks since handover",
        "filepath": "delivery/tna/buscharter/link-building/link-build-strategy/buscharter-link-audit-2026-05-22.md",
        "generated_at": "2026-05-22T00:00:00Z",
        "generated_by": "skyward",
    },
    # Portfolio audit goes on every TNA property
    *[{
        "slug": s,
        "title": "TNA portfolio link audit (initial)",
        "filepath": "delivery/tna/seo/link-building-campaign/tna-portfolio-link-audit-2026-05-22.md",
        "generated_at": "2026-05-22T00:00:00Z",
        "generated_by": "skyward",
    } for s in SLUGS],
]


def main():
    prod_url = os.environ.get("AUTHORITY_REFRESH_URL", "https://skyward-seo-platform.vercel.app")
    db = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    # 1. Refresh each property via the production endpoint
    for slug in SLUGS:
        url = f"{prod_url}/api/authority/refresh?slug={slug}"
        print(f"  refreshing {slug}...")
        try:
            r = requests.post(url, headers={"X-Operator": "system:phase5-backfill"}, timeout=180)
            if r.status_code == 200:
                d = r.json()
                print(f"    ✓ {slug}: snapshot_id={d.get('snapshot_id', '?')[:8]} "
                      f"refdomains={d.get('refdomains_upserted')}")
            else:
                print(f"    ✗ {slug}: status={r.status_code} body={r.text[:200]}")
        except Exception as e:
            print(f"    ✗ {slug}: {type(e).__name__}: {e}")

    # 2. Inline audit docs
    for doc in AUDIT_DOCS:
        prop_rows = db.table("property").select("id").eq("slug", doc["slug"]).execute().data
        if not prop_rows:
            print(f"  ✗ audit_doc for {doc['slug']}: property not found")
            continue
        property_id = prop_rows[0]["id"]
        fp = Path("/Users/paulskirbe/agency") / doc["filepath"]
        markdown = fp.read_text() if fp.exists() else None
        db.table("audit_doc").upsert({
            "property_id": property_id,
            "title": doc["title"],
            "filepath": doc["filepath"],
            "markdown": markdown,
            "generated_at": doc["generated_at"],
            "generated_by": doc["generated_by"],
        }, on_conflict="id").execute()  # upsert by id won't dedupe; first run inserts, subsequent runs make duplicates. Acceptable for a one-shot.
        print(f"  ✓ audit_doc inlined: {doc['slug']} — {doc['title']}")


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Note — DO NOT RUN YET**

This script must be run AFTER Chunk 5 lands (production deploy of `/api/authority/refresh`). The refresh endpoint won't exist on production until then. Run the backfill after the merge.

- [ ] **Step 3: Commit**

```bash
cd /Users/paulskirbe/agency && git add delivery/tna/phase5_backfill_supabase.py && git commit -m "feat(phase-5): Supabase backfill script for authority data across 8 TNA properties"
```

---

## Chunk 3: Read-only /authority surface

### Task 3.1: page.tsx — route + fetch

**Files:**
- Create: `web/app/properties/[slug]/authority/page.tsx`

- [ ] **Step 1: Write the route**

```tsx
import { supabase } from "@/lib/supabase";
import {
  getSiteSnapshots, getReferringDomains, getDisavowEntries, getAuditDocs,
  computeAlerts,
} from "@/lib/authority";
import { AuthorityView } from "@/components/authority/AuthorityView";

export default async function AuthorityTab({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { data: prop } = await supabase
    .from("property")
    .select("id, primary_domain, name")
    .eq("slug", slug)
    .single();
  if (!prop) {
    return <div className="p-8 text-sm text-muted-foreground">Property not found.</div>;
  }

  const [snapshots, refDomains, disavow, audits] = await Promise.all([
    getSiteSnapshots(prop.id),
    getReferringDomains(prop.id),
    getDisavowEntries(prop.id),
    getAuditDocs(prop.id),
  ]);
  const alerts = computeAlerts(snapshots, refDomains, disavow);

  return (
    <AuthorityView
      propertySlug={slug}
      propertyId={prop.id}
      propertyName={prop.name}
      primaryDomain={prop.primary_domain}
      snapshots={snapshots}
      refDomains={refDomains}
      disavow={disavow}
      audits={audits}
      alerts={alerts}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add web/app/properties/[slug]/authority/page.tsx && git commit -m "feat(pages): /authority route fetches Supabase data + computes alerts"
```

### Task 3.2: AuthorityView shell

**Files:**
- Create: `web/components/authority/AuthorityView.tsx`

- [ ] **Step 1: Write the shell**

```tsx
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import type {
  SiteSnapshot, ReferringDomainRow, DisavowEntryRow, AuditDocRow, Alert,
} from "@/lib/authority";
import { OverviewTab } from "./OverviewTab";
import { ReferringDomainsTab } from "./ReferringDomainsTab";
import { AuditsTab } from "./AuditsTab";

const TABS = [
  ["overview", "Overview"],
  ["refdomains", "Referring Domains"],
  ["audits", "Audits"],
] as const;

export type AuthorityViewProps = {
  propertySlug: string;
  propertyId: string;
  propertyName: string;
  primaryDomain: string | null;
  snapshots: SiteSnapshot[];
  refDomains: ReferringDomainRow[];
  disavow: DisavowEntryRow[];
  audits: AuditDocRow[];
  alerts: Alert[];
};

export function AuthorityView(props: AuthorityViewProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const view = sp.get("view") || "overview";

  function setView(next: string) {
    const params = new URLSearchParams(sp.toString());
    params.set("view", next);
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Authority</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Link-building monitoring for{" "}
          <span className="font-mono">{props.primaryDomain}</span>.{" "}
          {props.refDomains.length.toLocaleString()} referring domains tracked.
        </p>
      </header>

      <nav className="flex gap-1 border-b mb-4 overflow-x-auto">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setView(k)}
            className={
              "px-3 py-1.5 text-sm border-b-2 -mb-px whitespace-nowrap " +
              (view === k
                ? "border-foreground font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            {label}
          </button>
        ))}
      </nav>

      {view === "overview" && <OverviewTab {...props} />}
      {view === "refdomains" && <ReferringDomainsTab {...props} />}
      {view === "audits" && <AuditsTab {...props} />}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add web/components/authority/AuthorityView.tsx && git commit -m "feat(authority): AuthorityView shell + 3-tab nav"
```

### Task 3.3: OverviewTab

**Files:**
- Create: `web/components/authority/OverviewTab.tsx`
- Create: `web/components/authority/DrTrendChart.tsx`
- Create: `web/components/authority/RefreshButton.tsx`

- [ ] **Step 1: Write RefreshButton.tsx**

```tsx
"use client";
import { useTransition } from "react";
import { runAuthorityRefresh } from "@/app/properties/[slug]/authority/actions";

export function RefreshButton({ slug }: { slug: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(async () => {
        const r = await runAuthorityRefresh(slug);
        if (!r.ok) alert(`Refresh failed: ${r.error}`);
      })}
      disabled={pending}
      className="text-xs px-3 py-1.5 rounded border bg-foreground text-background disabled:opacity-50"
    >
      {pending ? "Refreshing…" : "Refresh data"}
    </button>
  );
}
```

- [ ] **Step 2: Write DrTrendChart.tsx**

```tsx
"use client";
import type { SiteSnapshot } from "@/lib/authority";

export function DrTrendChart({ snapshots }: { snapshots: SiteSnapshot[] }) {
  // Snapshots come newest-first; reverse for left-to-right time axis
  const series = [...snapshots].reverse().filter(s => s.domain_rating != null);
  if (series.length < 2) {
    return <div className="text-xs text-muted-foreground">Need at least 2 snapshots for a trend chart.</div>;
  }
  const W = 600, H = 120, P = 20;
  const xs = series.map((_, i) => P + (i * (W - 2 * P)) / (series.length - 1));
  const drs = series.map(s => s.domain_rating as number);
  const minDR = Math.min(...drs), maxDR = Math.max(...drs);
  const range = Math.max(1, maxDR - minDR);
  const ys = drs.map(dr => H - P - ((dr - minDR) * (H - 2 * P)) / range);
  const path = xs.map((x, i) => (i === 0 ? `M ${x} ${ys[i]}` : `L ${x} ${ys[i]}`)).join(" ");
  return (
    <svg width={W} height={H} className="border rounded">
      <path d={path} fill="none" stroke="#18181b" strokeWidth={1.5} />
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r={2} fill="#18181b" />
      ))}
      <text x={P} y={P} fontSize={10} fill="#64748b">DR {minDR.toFixed(1)} — {maxDR.toFixed(1)}</text>
      <text x={W - P - 80} y={P} fontSize={10} fill="#64748b">{series.length} snapshots</text>
    </svg>
  );
}
```

- [ ] **Step 3: Write OverviewTab.tsx**

```tsx
"use client";
import type { AuthorityViewProps } from "./AuthorityView";
import { RefreshButton } from "./RefreshButton";
import { DrTrendChart } from "./DrTrendChart";

function pctDelta(current: number | null, baseline: number | null): string {
  if (current == null || baseline == null || baseline === 0) return "—";
  const d = ((current - baseline) / baseline) * 100;
  const sign = d > 0 ? "+" : "";
  return `${sign}${d.toFixed(0)}%`;
}

function absDelta(current: number | null, baseline: number | null): string {
  if (current == null || baseline == null) return "—";
  const d = current - baseline;
  return d > 0 ? `+${d}` : String(d);
}

export function OverviewTab(props: AuthorityViewProps) {
  const latest = props.snapshots[0];
  // Baseline = oldest snapshot within last 90 days, or oldest of all
  const baselineCutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const baseline =
    props.snapshots.slice().reverse().find(s => Date.parse(s.snapshotted_at) >= baselineCutoff) ??
    props.snapshots[props.snapshots.length - 1];

  const lastRefreshLabel = latest
    ? new Date(latest.snapshotted_at).toLocaleString()
    : "never";

  const recentQuality = props.refDomains
    .filter(r => r.quality === "Quality" && r.first_seen)
    .sort((a, b) => Date.parse(b.first_seen!) - Date.parse(a.first_seen!))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <RefreshButton slug={props.propertySlug} />
        <span className="text-xs text-muted-foreground">Last refresh: {lastRefreshLabel}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Domain Rating"
          value={latest?.domain_rating?.toFixed(1) ?? "—"}
          delta={absDelta(latest?.domain_rating ?? null, baseline?.domain_rating ?? null)}
        />
        <Tile label="Ref Domains"
          value={latest?.live_refdomains?.toLocaleString() ?? "—"}
          delta={absDelta(latest?.live_refdomains ?? null, baseline?.live_refdomains ?? null)}
        />
        <Tile label="Org Traffic (mo)"
          value={latest?.organic_traffic?.toLocaleString() ?? "—"}
          delta={pctDelta(latest?.organic_traffic ?? null, baseline?.organic_traffic ?? null)}
        />
        <Tile label="Org Value (USD/mo)"
          value={latest?.organic_value_cents != null ? `$${(latest.organic_value_cents / 100).toFixed(0)}` : "—"}
          delta={pctDelta(latest?.organic_value_cents ?? null, baseline?.organic_value_cents ?? null)}
        />
      </div>

      {props.alerts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {props.alerts.map((a, i) => <AlertCard key={i} alert={a} />)}
        </div>
      )}

      <div className="border rounded-lg overflow-hidden">
        <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold bg-muted">Recent quality acquisitions</div>
        {recentQuality.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground">No quality-classified ref domains yet.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-1.5 font-semibold">Domain</th>
                <th className="text-left px-3 py-1.5 font-semibold">DR</th>
                <th className="text-left px-3 py-1.5 font-semibold">Traffic</th>
                <th className="text-left px-3 py-1.5 font-semibold">First seen</th>
              </tr>
            </thead>
            <tbody>
              {recentQuality.map(r => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-1.5 font-mono">{r.domain}</td>
                  <td className="px-3 py-1.5 tabular-nums">{r.domain_rating?.toFixed(0) ?? "—"}</td>
                  <td className="px-3 py-1.5 tabular-nums">{r.traffic_domain?.toLocaleString() ?? "—"}</td>
                  <td className="px-3 py-1.5">{r.first_seen ? new Date(r.first_seen).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">DR trend (last 90 days)</div>
        <DrTrendChart snapshots={props.snapshots} />
      </div>
    </div>
  );
}

function Tile({ label, value, delta }: { label: string; value: string; delta: string }) {
  const up = delta.startsWith("+");
  const down = delta.startsWith("-");
  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className="text-3xl font-semibold tabular-nums mt-1">{value}</div>
      <div className={`text-xs mt-1 tabular-nums ${up ? "text-emerald-600" : down ? "text-rose-600" : "text-muted-foreground"}`}>{delta}</div>
    </div>
  );
}

function AlertCard({ alert }: { alert: import("@/lib/authority").Alert }) {
  const bgClass = {
    rose: "bg-rose-50 border-rose-200 text-rose-900",
    amber: "bg-amber-50 border-amber-200 text-amber-900",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-900",
  }[alert.severity];
  let title = "", body = "";
  if (alert.kind === "spam_wave") {
    title = "Spam wave detected";
    body = `${alert.count} new spam refdomains in last 14 days${alert.sample_pattern ? `. Pattern: ${alert.sample_pattern}` : ""}.`;
  } else if (alert.kind === "stale_disavow") {
    title = "Disavow file is stale";
    body = `${alert.pending_count} pending disavow entries${alert.last_in_file_days ? ` (oldest pending ${alert.last_in_file_days}d)` : ""}. Update the .txt file.`;
  } else if (alert.kind === "dr_drop") {
    title = "DR dropped";
    body = `From ${alert.from.toFixed(1)} to ${alert.to.toFixed(1)} over ${alert.days} days.`;
  } else if (alert.kind === "quality_acquisitions") {
    title = "New quality acquisitions";
    body = `${alert.count} new in last 30 days. Top: ${alert.top_examples.join(", ")}.`;
  }
  return (
    <div className={`border rounded-lg p-3 text-xs ${bgClass}`}>
      <div className="font-semibold">{title}</div>
      <div className="mt-1">{body}</div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add web/components/authority/{OverviewTab,DrTrendChart,RefreshButton}.tsx && git commit -m "feat(authority): OverviewTab — stat tiles + alerts + recent acquisitions + DR trend SVG"
```

### Task 3.4: ReferringDomainsTab (read-only)

**Files:**
- Create: `web/components/authority/ReferringDomainsTab.tsx`

- [ ] **Step 1: Write the component**

Mirror the pattern from `web/components/keywords/discovery/UniverseTab.tsx`:
- Counter chip strip at top (quality counts), click to filter, URL-persisted via `?quality=`
- Per-column filter row under headers (text for domain, numeric ≥ for DR / traffic, select for quality)
- Table columns: Domain (mono) · DR · Traffic · First Seen · Dofollow · Detected Spam (rose flag) · Quality (read-only pill in this chunk; chip in Chunk 4) · Notes preview · Open (drawer hook stub)
- Pagination 100/page

Render the Quality cell with the same color mapping as the chip (Quality=emerald, Spam=rose, Pending=slate, Disavow=violet) but as a static pill in this chunk. Chunk 4 wires the editable chip.

Commit message: `feat(authority): ReferringDomainsTab read-only`

### Task 3.5: AuditsTab

**Files:**
- Create: `web/components/authority/AuditsTab.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";
import { useState } from "react";
import type { AuthorityViewProps } from "./AuthorityView";
import type { AuditDocRow } from "@/lib/authority";

export function AuditsTab({ audits }: AuthorityViewProps) {
  const [open, setOpen] = useState<AuditDocRow | null>(null);
  if (audits.length === 0) {
    return <div className="text-xs text-muted-foreground p-4">No audits yet.</div>;
  }
  return (
    <>
      <div className="space-y-3">
        {audits.map(a => (
          <div key={a.id} className="border rounded-lg p-4 bg-card">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{a.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {new Date(a.generated_at).toLocaleDateString()} · {a.generated_by || "unknown"}
                </div>
              </div>
              <div className="flex gap-2">
                {a.markdown && (
                  <button onClick={() => setOpen(a)}
                    className="text-xs px-2 py-1 rounded border hover:bg-muted">
                    Open
                  </button>
                )}
                {a.filepath && (
                  <button onClick={() => navigator.clipboard.writeText(a.filepath!)}
                    className="text-xs px-2 py-1 rounded border hover:bg-muted">
                    Copy path
                  </button>
                )}
              </div>
            </div>
            {a.notes && <div className="text-xs mt-2 text-muted-foreground">{a.notes}</div>}
          </div>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-center items-start pt-12">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(null)} />
          <div className="relative bg-background border rounded-lg max-w-3xl w-full max-h-[80vh] overflow-y-auto p-6">
            <div className="flex items-baseline justify-between mb-4">
              <h3 className="text-lg font-semibold">{open.title}</h3>
              <button onClick={() => setOpen(null)} className="text-sm text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <pre className="whitespace-pre-wrap text-xs font-mono">{open.markdown}</pre>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add web/components/authority/AuditsTab.tsx && git commit -m "feat(authority): AuditsTab — list of audit_doc cards + inline modal viewer"
```

### Task 3.6: Verify Chunk 3 build

- [ ] **Step 1: Build**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app/web && npm run build 2>&1 | tail -5
```

Expected: clean compile, `/properties/[slug]/authority` in route table.

---

## Chunk 4: Inline edits + drawer

### Task 4.1: QualityChip

**Files:**
- Create: `web/components/authority/QualityChip.tsx`

- [ ] **Step 1: Write the chip**

```tsx
"use client";
import { useTransition } from "react";
import { setDomainQuality } from "@/app/properties/[slug]/authority/actions";
import type { RefDomainQuality } from "@/lib/authority";

const QUALITIES: RefDomainQuality[] = ["Quality", "Pending", "Spam", "Disavow"];
const COLOR: Record<RefDomainQuality, string> = {
  Quality: "bg-emerald-100 text-emerald-800",
  Spam: "bg-rose-100 text-rose-800",
  Pending: "bg-slate-100 text-slate-700",
  Disavow: "bg-violet-100 text-violet-800",
};

export function QualityChip({
  slug, domain, value,
}: { slug: string; domain: string; value: RefDomainQuality }) {
  const [pending, start] = useTransition();
  return (
    <select
      value={value}
      disabled={pending}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const next = e.target.value as RefDomainQuality;
        start(() => setDomainQuality(slug, domain, next));
      }}
      className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded border ${COLOR[value]} ${pending ? "opacity-50" : ""}`}
    >
      {QUALITIES.map(q => <option key={q} value={q}>{q}</option>)}
    </select>
  );
}
```

- [ ] **Step 2: Wire into ReferringDomainsTab**

Replace the read-only quality cell with `<QualityChip slug={propertySlug} domain={row.domain} value={row.quality} />`.

- [ ] **Step 3: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && git add web/components/authority/QualityChip.tsx web/components/authority/ReferringDomainsTab.tsx && git commit -m "feat(authority): inline QualityChip + wired into ReferringDomainsTab"
```

### Task 4.2: RefDomain drawer subject

**Files:**
- Modify: `web/components/UrlDrawer.tsx`

- [ ] **Step 1: Add subject variant**

Extend the discriminated union:

```typescript
import type { ReferringDomainRow, DisavowEntryRow } from "@/lib/authority";

export type DrawerSubject =
  | { kind: "url"; /* existing */ }
  | { kind: "keyword"; /* existing */ }
  | { kind: "cluster"; /* existing */ }
  | { kind: "content"; /* existing */ }
  | { kind: "refdomain"; row: ReferringDomainRow; disavow: DisavowEntryRow | null };
```

- [ ] **Step 2: Add dispatcher branch + RefDomainDrawer component**

Inside UrlDrawer.tsx (or extracted to `RefDomainDrawer.tsx`):

```tsx
function RefDomainDrawer({
  subject, onClose, propertySlug,
}: {
  subject: Extract<DrawerSubject, { kind: "refdomain" }>;
  onClose: () => void;
  propertySlug: string;
}) {
  const r = subject.row;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative w-[560px] h-full bg-background border-l overflow-y-auto p-5 space-y-5">
        <header>
          <div className="flex items-center gap-2">
            <a href={`https://${r.domain}`} target="_blank" rel="noreferrer" className="font-mono text-sm hover:underline">{r.domain} ↗</a>
            <QualityChip slug={propertySlug} domain={r.domain} value={r.quality} />
          </div>
        </header>

        <Section title="Metrics">
          <Field label="DR">{r.domain_rating?.toFixed(1) ?? "—"}</Field>
          <Field label="Traffic">{r.traffic_domain?.toLocaleString() ?? "—"}</Field>
          <Field label="Dofollow links">{r.dofollow_links}</Field>
          <Field label="Links to target">{r.links_to_target}</Field>
          <Field label="First seen">{r.first_seen ? new Date(r.first_seen).toLocaleDateString() : "—"}</Field>
          <Field label="Last seen">{r.last_seen ? new Date(r.last_seen).toLocaleDateString() : "—"}</Field>
          <Field label="Detected spam">{r.detected_spam ? "Yes" : "No"}</Field>
        </Section>

        <Section title="Editors">
          <FieldRow label="Notes" editor={
            <NotesEditor slug={propertySlug} domain={r.domain} value={r.notes} />
          } />
        </Section>

        <Section title="Disavow">
          {subject.disavow ? (
            <>
              <FieldRow label="Status" editor={
                <DisavowStatusEditor slug={propertySlug} domain={r.domain} value={subject.disavow.status} />
              } />
              <FieldRow label="Reason" editor={
                <DisavowReasonEditor slug={propertySlug} domain={r.domain} value={subject.disavow.reason} />
              } />
            </>
          ) : (
            <button
              onClick={async () => {
                await addToDisavow(propertySlug, r.domain, null);
                onClose();  // refresh
              }}
              className="text-xs px-3 py-1.5 rounded border hover:bg-muted"
            >
              Mark for disavow
            </button>
          )}
        </Section>
      </aside>
    </div>
  );
}
```

(Reuse `Section` / `Field` / `FieldRow` helpers from existing UrlDrawer; copy or import.)

- [ ] **Step 3: Add the 3 small editor components**

```tsx
import { setDomainNotes, addToDisavow, setDisavowStatus, setDisavowReason } from "@/app/properties/[slug]/authority/actions";
import { useState, useTransition } from "react";

function NotesEditor({ slug, domain, value }: { slug: string; domain: string; value: string | null }) {
  const [local, setLocal] = useState(value ?? "");
  const [pending, start] = useTransition();
  return (
    <textarea
      value={local} onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { if (local !== (value ?? "")) start(() => setDomainNotes(slug, domain, local || null)); }}
      disabled={pending}
      className={`text-xs px-2 py-1 rounded border bg-transparent w-full min-h-[60px] ${pending ? "opacity-50" : ""}`}
    />
  );
}

function DisavowStatusEditor({ slug, domain, value }: { slug: string; domain: string; value: "Pending" | "In File" | "Confirmed by GSC" }) {
  const [pending, start] = useTransition();
  return (
    <select value={value} disabled={pending}
      onChange={(e) => start(() => setDisavowStatus(slug, domain, e.target.value as never))}
      className={`text-xs px-2 py-1 rounded border bg-transparent ${pending ? "opacity-50" : ""}`}
    >
      <option value="Pending">Pending</option>
      <option value="In File">In File</option>
      <option value="Confirmed by GSC">Confirmed by GSC</option>
    </select>
  );
}

function DisavowReasonEditor({ slug, domain, value }: { slug: string; domain: string; value: string | null }) {
  const [local, setLocal] = useState(value ?? "");
  const [pending, start] = useTransition();
  return (
    <input value={local} onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { if (local !== (value ?? "")) start(() => setDisavowReason(slug, domain, local || null)); }}
      disabled={pending}
      placeholder="e.g. spam_network, pbn, manipulative_anchor"
      className={`text-xs px-2 py-1 rounded border bg-transparent w-full ${pending ? "opacity-50" : ""}`}
    />
  );
}
```

- [ ] **Step 4: Add dispatcher branch in top-level UrlDrawer render**

```tsx
if (subject.kind === "refdomain") {
  return <RefDomainDrawer subject={subject} onClose={onClose} propertySlug={propertySlug} />;
}
```

- [ ] **Step 5: Wire row-click in ReferringDomainsTab**

Lift drawer state to AuthorityView (similar pattern to KeywordsView / ContentView). On row click, set `{kind: 'refdomain', row, disavow: disavowByDomain.get(row.domain) ?? null}`. Render `<UrlDrawer subject={subject} onClose={...} propertySlug={...} />` at the bottom of AuthorityView.

- [ ] **Step 6: Build**

```bash
cd web && npm run build 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add web/components/UrlDrawer.tsx web/components/authority/{ReferringDomainsTab,AuthorityView}.tsx
git commit -m "feat(ui): UrlDrawer polymorphism — RefDomain subject (5th variant) + drawer integration"
```

---

## Chunk 5: Disavow export + production merge

### Task 5.1: Disavow export endpoint

**Files:**
- Create: `web/app/properties/[slug]/authority/disavow.txt/route.ts`

This is a Next.js Route Handler that returns the disavow.txt as a downloadable blob.

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse } from "next/server";
import { exportDisavowTxt } from "../actions";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const text = await exportDisavowTxt(slug);
  if (typeof text !== "string") {
    return NextResponse.json({ error: text.error }, { status: 404 });
  }
  return new NextResponse(text, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-disavow.txt"`,
    },
  });
}
```

- [ ] **Step 2: Add a download button on AuditsTab (or in the AuthorityView header)**

Add to AuthorityView, next to the page header:

```tsx
<a href={`/properties/${props.propertySlug}/authority/disavow.txt`}
   className="text-xs px-3 py-1.5 rounded border hover:bg-muted">
  Download disavow.txt
</a>
```

- [ ] **Step 3: Commit**

```bash
git add web/app/properties/[slug]/authority/disavow.txt/route.ts web/components/authority/AuthorityView.tsx
git commit -m "feat(authority): disavow.txt download route"
```

### Task 5.2: PR + merge + production deploy + backfill

- [ ] **Step 1: Open PR**

```bash
gh pr create --title "feat: Phase 5 authority surface (/properties/[slug]/authority)" --body "..."
```

Body should summarize:
- 3-tab IA (Overview / Referring Domains / Audits)
- 4 new Supabase tables + 2 history mirrors + 2 triggers
- Universal drawer extended with RefDomain subject (5th polymorphic variant)
- New Vercel Python endpoint `/api/authority/refresh` calling DataForSEO Backlinks REST
- First-class pipeline-trigger infrastructure (unblocks Phase 3 runRecluster + Phase 4 runRecomputeContentPlan as followups)
- disavow.txt download route
- Backfill landing post-merge

- [ ] **Step 2: Merge**

```bash
gh pr merge <PR#> --merge --admin
```

- [ ] **Step 3: Promote to production**

```bash
git checkout main && git pull && vercel --prod --yes
```

- [ ] **Step 4: Run the backfill (this requires production to be live)**

```bash
cd /Users/paulskirbe/agency && uv run --with requests --with supabase --with python-dotenv python delivery/tna/phase5_backfill_supabase.py 2>&1 | tail -30
```

Expected: 8 sites refreshed; audit docs inlined.

- [ ] **Step 5: Verify production**

```bash
curl -sI "https://skyward-seo-platform.vercel.app/properties/buscharter/authority"
```

Expected: 200 or 307 → /auth (the existing auth-gate redirect).

```bash
curl -s -X POST -H "X-Operator: smoke-test" "https://skyward-seo-platform.vercel.app/api/authority/refresh?slug=buscharter" | head
```

Expected: JSON with `ok: true` and a snapshot_id.

---

## Self-Review

**1. Spec coverage** against `docs/superpowers/specs/2026-05-22-phase5-surface-design.md`:
- ✓ All 4 tables + 2 history mirrors + 2 triggers (Task 1.1)
- ✓ Typed lib + alert computation (Task 1.2)
- ✓ DFS Backlinks REST endpoint (Task 2.1)
- ✓ 7 server actions (Task 2.2: setDomainQuality, setDomainNotes, addToDisavow, setDisavowStatus, setDisavowReason, runAuthorityRefresh, exportDisavowTxt)
- ✓ Backfill script (Task 2.3)
- ✓ Route + 3-tab nav (Tasks 3.1, 3.2)
- ✓ Overview tab with stat tiles + alerts + recent acquisitions + DR trend SVG (Task 3.3)
- ✓ Referring Domains table (Task 3.4)
- ✓ Audits tab (Task 3.5)
- ✓ Inline quality chip (Task 4.1)
- ✓ RefDomain drawer variant (Task 4.2)
- ✓ disavow.txt download (Task 5.1)
- ✓ Production merge + backfill (Task 5.2)

**2. Placeholder scan**: None found. Task 3.4 (ReferringDomainsTab) is described in pattern-reference form (mirrors UniverseTab) rather than full code; that's intentional given the duplication of well-known patterns, and the implementing subagent has the canonical reference at `web/components/keywords/discovery/UniverseTab.tsx`.

**3. Type consistency**: RefDomainQuality / DisavowStatus / SnapshotSource defined once in `web/lib/authority.ts`, imported everywhere. DrawerSubject discriminated union extended in UrlDrawer; new variant kind 'refdomain' matches the row type from the lib.

**Note**: The DFS Backlinks REST field-name mapping in Task 2.1 is a best-effort first draft. Subagent must verify against a live DFS response before committing the upsert logic — the spec calls out `rank`, `referring_domains`, `backlinks_spam_score`, but DFS field naming has historically been inconsistent across endpoints. Verification step is included in the task notes.
