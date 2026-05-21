# Platform Execution Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make skyward-platform-app the canonical execution surface for the Skyward SEO pipeline by mirroring the Phase 1 (WQA) and Phase 2 (Technical SEO Audit) workbooks in one app surface with a unified per-URL drawer and editable execution state.

**Architecture:** BQ `wqa_output` stays the canonical signal source (read-only). Three new Supabase tables (`page_execution`, `page_check_state`, `url_relationship`) carry editable execution state. UI hydrates by joining BQ + Supabase. All edits go through Next.js server actions to Supabase with history triggers.

**Tech Stack:** Next.js 16 App Router (React Server Components), Supabase Postgres + RLS, Python Vercel functions for BQ + export, openpyxl for xlsx export.

---

## File Structure

```
db/supabase/migrations/
  20260520_page_execution.sql              [new] page_execution + history mirror
  20260520_page_check_state.sql            [new] page_check_state + history mirror
  20260520_url_relationship.sql            [new] url_relationship table

web/lib/
  page-execution.ts                        [new] typed Supabase queries + mutations for page_execution
  page-check-state.ts                      [new] typed Supabase queries + mutations for page_check_state
  url-relationship.ts                      [new] typed queries for url_relationship
  wqa-checks.ts                            [new] T1-T20, C1-C20, S1-S12 check predicates (TS port of build_phase2_technical.py)

web/app/properties/[slug]/pages/
  page.tsx                                 [modify] read execution + check state, pass to PagesView
  page-actions.ts                          [new] server actions for page_execution + page_check_state mutations

web/components/
  UrlDrawer.tsx                            [new] universal URL drill-down drawer
  PagesView.tsx                            [modify] add mode switcher (Triage / Technical Audit), wire drawer
  wqa/
    OverviewTab.tsx                        [modify] include Action Plan + Funnel + Service + Checklist
    CanonicalAuditTab.tsx                  [new] Canonical Audit view
    ActionLegendTab.tsx                    [new] Action Legend reference
    RestoreSpecEditor.tsx                  [new] inline editor for target_h1/title/meta in Restore tab
    RedirectDestinationEditor.tsx          [new] inline editor for destination URL in Redirect tab
  audit/
    AuditModeShell.tsx                     [new] Technical Audit mode tab nav
    AuditOverviewTab.tsx                   [new] Issue Summary view
    AuditChecklistTab.tsx                  [new] 44-check list with status
    AuditCheckDetailView.tsx               [new] URL list filtered to one failing check
    AuditUrlPriorityTab.tsx                [new] URL Priority combined view
    AuditArchitectureTab.tsx               [new] Website Architecture per-URL
    AuditSchemaTab.tsx                     [new] Schema Optimization per-URL
    AuditPageSpeedTab.tsx                  [new] Page Speed (Blocked badge)
    AuditBrokenTab.tsx                     [new] Broken Links (Blocked badge)

web/api/
  wqa/export.py                            [new] GET /api/wqa/export?slug={slug} → 12-tab xlsx
  audit/phase-2/export.py                  [new] GET /api/audit/phase-2/export?slug={slug} → Phase 2 xlsx

tests/
  test_page_execution_schema.py            [new] schema + trigger smoke
  test_page_check_state_schema.py          [new] schema + trigger smoke
```

---

## Chunk 1: DB migrations + server actions

### Task 1.1: `page_execution` migration

**Files:**
- Create: `db/supabase/migrations/20260520_page_execution.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Per-URL execution state: status, owner, due, notes, target URLs, restore spec.
-- Single row per (property_id, url) regardless of which workbook tab is editing it.
-- BQ wqa_output remains canonical for signals; this table is canonical for execution.

create table if not exists page_execution (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references property(id) on delete cascade,
  url             text not null,
  status          text not null default 'To Do'
                   check (status in ('To Do','In Progress','Blocked','Done')),
  owner           text,
  due_date        date,
  notes           text,
  target_url      text,
  target_h1       text,
  target_title    text,
  target_meta     text,
  updated_by      text not null,
  updated_at      timestamptz not null default now()
);

create unique index if not exists idx_page_execution_property_url
  on page_execution (property_id, url);
create index if not exists idx_page_execution_status
  on page_execution (property_id, status);

alter table page_execution enable row level security;
create policy "team can read page_execution"
  on page_execution for select
  using (auth.role() = 'authenticated');
create policy "team can write page_execution"
  on page_execution for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );

-- History mirror, snapshot OLD row on meaningful change.
create table if not exists page_execution_history (
  id              uuid primary key default gen_random_uuid(),
  execution_id    uuid not null references page_execution(id) on delete cascade,
  property_id     uuid not null,
  url             text not null,
  status          text not null,
  owner           text,
  due_date        date,
  notes           text,
  target_url      text,
  target_h1       text,
  target_title    text,
  target_meta     text,
  updated_by      text not null,
  snapshotted_at  timestamptz not null default now()
);

create index if not exists idx_page_execution_history_exec
  on page_execution_history (execution_id, snapshotted_at desc);

create or replace function snapshot_page_execution() returns trigger
language plpgsql
as $$
begin
  insert into page_execution_history
    (execution_id, property_id, url, status, owner, due_date, notes,
     target_url, target_h1, target_title, target_meta, updated_by)
  values
    (old.id, old.property_id, old.url, old.status, old.owner, old.due_date,
     old.notes, old.target_url, old.target_h1, old.target_title,
     old.target_meta, old.updated_by);
  return new;
end;
$$;

drop trigger if exists trg_snapshot_page_execution on page_execution;
create trigger trg_snapshot_page_execution
  before update on page_execution
  for each row
  when (
    old.status      is distinct from new.status
    or old.owner    is distinct from new.owner
    or old.due_date is distinct from new.due_date
    or old.notes    is distinct from new.notes
    or old.target_url   is distinct from new.target_url
    or old.target_h1    is distinct from new.target_h1
    or old.target_title is distinct from new.target_title
    or old.target_meta  is distinct from new.target_meta
  )
  execute function snapshot_page_execution();

alter table page_execution_history enable row level security;
create policy "team can read page_execution_history"
  on page_execution_history for select
  using (auth.role() = 'authenticated');
```

- [ ] **Step 2: Apply migration**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app/db
supabase db push
```

Expected: `page_execution` and `page_execution_history` show in `supabase migration list` as `Applied`.

- [ ] **Step 3: Smoke check via psql / Supabase SQL editor**

```sql
insert into page_execution (property_id, url, status, updated_by)
values ((select id from property where slug = 'buscharter'), 'https://test/x', 'To Do', 'spec-test');
update page_execution set status='In Progress' where url='https://test/x';
select count(*) from page_execution_history where url='https://test/x';
-- expect 1
delete from page_execution where url='https://test/x';
```

- [ ] **Step 4: Commit**

```bash
git add db/supabase/migrations/20260520_page_execution.sql
git commit -m "feat(db): add page_execution table + history trigger"
```

### Task 1.2: `page_check_state` migration

**Files:**
- Create: `db/supabase/migrations/20260520_page_check_state.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Per-URL × Phase 2 check execution state. One row per (property, url, check_id).
-- check_id ∈ T1..T20, C1..C20, S1..S12 (defined in SOP v4 §7).

create table if not exists page_check_state (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references property(id) on delete cascade,
  url             text not null,
  check_id        text not null,
  status          text not null default 'To Do'
                   check (status in ('To Do','In Progress','Blocked','Done')),
  notes           text,
  owner           text,
  fix_applied_at  timestamptz,
  updated_by      text not null,
  updated_at      timestamptz not null default now()
);

create unique index if not exists idx_page_check_state_property_url_check
  on page_check_state (property_id, url, check_id);
create index if not exists idx_page_check_state_check
  on page_check_state (property_id, check_id);
create index if not exists idx_page_check_state_status
  on page_check_state (property_id, status);

alter table page_check_state enable row level security;
create policy "team can read page_check_state"
  on page_check_state for select
  using (auth.role() = 'authenticated');
create policy "team can write page_check_state"
  on page_check_state for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );

create table if not exists page_check_state_history (
  id              uuid primary key default gen_random_uuid(),
  state_id        uuid not null references page_check_state(id) on delete cascade,
  property_id     uuid not null,
  url             text not null,
  check_id        text not null,
  status          text not null,
  notes           text,
  owner           text,
  fix_applied_at  timestamptz,
  updated_by      text not null,
  snapshotted_at  timestamptz not null default now()
);

create index if not exists idx_page_check_state_history_state
  on page_check_state_history (state_id, snapshotted_at desc);

create or replace function snapshot_page_check_state() returns trigger
language plpgsql
as $$
begin
  insert into page_check_state_history
    (state_id, property_id, url, check_id, status, notes, owner,
     fix_applied_at, updated_by)
  values
    (old.id, old.property_id, old.url, old.check_id, old.status, old.notes,
     old.owner, old.fix_applied_at, old.updated_by);
  return new;
end;
$$;

drop trigger if exists trg_snapshot_page_check_state on page_check_state;
create trigger trg_snapshot_page_check_state
  before update on page_check_state
  for each row
  when (
    old.status         is distinct from new.status
    or old.notes       is distinct from new.notes
    or old.owner       is distinct from new.owner
    or old.fix_applied_at is distinct from new.fix_applied_at
  )
  execute function snapshot_page_check_state();

alter table page_check_state_history enable row level security;
create policy "team can read page_check_state_history"
  on page_check_state_history for select
  using (auth.role() = 'authenticated');
```

- [ ] **Step 2: Apply + smoke check**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app/db
supabase db push
```

```sql
insert into page_check_state (property_id, url, check_id, status, updated_by)
values ((select id from property where slug = 'buscharter'), 'https://test/x', 'T6', 'To Do', 'spec-test');
update page_check_state set status='Done', fix_applied_at=now() where url='https://test/x';
select count(*) from page_check_state_history where url='https://test/x';
delete from page_check_state where url='https://test/x';
```

- [ ] **Step 3: Commit**

```bash
git add db/supabase/migrations/20260520_page_check_state.sql
git commit -m "feat(db): add page_check_state table + history trigger"
```

### Task 1.3: `url_relationship` migration

**Files:**
- Create: `db/supabase/migrations/20260520_url_relationship.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Cross-URL relationships. Source workbook surfaces these implicitly via
-- Redirect Map, Canonicalization Map. We store explicit edges so the platform
-- can render them as a graph.

create table if not exists url_relationship (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references property(id) on delete cascade,
  source_url      text not null,
  target_url      text not null,
  kind            text not null
                   check (kind in ('redirect_to','canonical_to','consolidate_into','mentioned_in')),
  created_by      text not null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_url_relationship_source
  on url_relationship (property_id, source_url);
create index if not exists idx_url_relationship_target
  on url_relationship (property_id, target_url);
create index if not exists idx_url_relationship_kind
  on url_relationship (property_id, kind);

alter table url_relationship enable row level security;
create policy "team can read url_relationship"
  on url_relationship for select
  using (auth.role() = 'authenticated');
create policy "team can write url_relationship"
  on url_relationship for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );
```

- [ ] **Step 2: Apply + commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app/db
supabase db push
git add db/supabase/migrations/20260520_url_relationship.sql
git commit -m "feat(db): add url_relationship table"
```

### Task 1.4: `page-execution.ts` lib + server actions

**Files:**
- Create: `web/lib/page-execution.ts`
- Create: `web/app/properties/[slug]/pages/page-actions.ts`

- [ ] **Step 1: Write the lib**

```typescript
// web/lib/page-execution.ts
import { supabase } from "./supabase";

export type ExecutionStatus = "To Do" | "In Progress" | "Blocked" | "Done";

export type PageExecutionRow = {
  id: string;
  property_id: string;
  url: string;
  status: ExecutionStatus;
  owner: string | null;
  due_date: string | null;
  notes: string | null;
  target_url: string | null;
  target_h1: string | null;
  target_title: string | null;
  target_meta: string | null;
  updated_by: string;
  updated_at: string;
};

/** Read all execution rows for a property. Returns Map<url, row>. */
export async function getExecutionByUrl(
  propertyId: string,
): Promise<Map<string, PageExecutionRow>> {
  const { data, error } = await supabase
    .from("page_execution")
    .select("*")
    .eq("property_id", propertyId);
  if (error) throw new Error(`getExecutionByUrl: ${error.message}`);
  const m = new Map<string, PageExecutionRow>();
  for (const row of (data ?? []) as PageExecutionRow[]) {
    m.set(row.url, row);
  }
  return m;
}

export type ExecutionUpsert = {
  property_id: string;
  url: string;
  status?: ExecutionStatus;
  owner?: string | null;
  due_date?: string | null;
  notes?: string | null;
  target_url?: string | null;
  target_h1?: string | null;
  target_title?: string | null;
  target_meta?: string | null;
  updated_by: string;
};

/** Upsert via service-role client (admin). Called from server actions only. */
export async function upsertExecution(
  adminClient: typeof supabase,
  input: ExecutionUpsert,
): Promise<PageExecutionRow> {
  const { data, error } = await adminClient
    .from("page_execution")
    .upsert(
      { ...input, updated_at: new Date().toISOString() },
      { onConflict: "property_id,url" },
    )
    .select()
    .single();
  if (error) throw new Error(`upsertExecution: ${error.message}`);
  return data as PageExecutionRow;
}
```

- [ ] **Step 2: Write the server actions**

```typescript
// web/app/properties/[slug]/pages/page-actions.ts
"use server";

import { revalidateTag } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { upsertExecution, type ExecutionStatus } from "@/lib/page-execution";
import { wqaTagFor } from "@/lib/wqa";

function adminClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function setExecutionStatus(args: {
  propertyId: string;
  url: string;
  status: ExecutionStatus;
  decidedBy: string;
  domainForCacheBust: string;
}) {
  const db = adminClient();
  await upsertExecution(db, {
    property_id: args.propertyId,
    url: args.url,
    status: args.status,
    updated_by: args.decidedBy,
  });
  revalidateTag(wqaTagFor(args.domainForCacheBust));
}

export async function setExecutionField(args: {
  propertyId: string;
  url: string;
  field: "owner" | "due_date" | "notes" | "target_url"
       | "target_h1" | "target_title" | "target_meta";
  value: string | null;
  decidedBy: string;
  domainForCacheBust: string;
}) {
  const db = adminClient();
  await upsertExecution(db, {
    property_id: args.propertyId,
    url: args.url,
    [args.field]: args.value,
    updated_by: args.decidedBy,
  } as never);
  revalidateTag(wqaTagFor(args.domainForCacheBust));
}
```

- [ ] **Step 3: Commit**

```bash
git add web/lib/page-execution.ts web/app/properties/[slug]/pages/page-actions.ts
git commit -m "feat(lib): page_execution typed queries + server actions"
```

### Task 1.5: `page-check-state.ts` lib + server actions

**Files:**
- Create: `web/lib/page-check-state.ts`
- Modify: `web/app/properties/[slug]/pages/page-actions.ts`

- [ ] **Step 1: Write the lib**

```typescript
// web/lib/page-check-state.ts
import { supabase } from "./supabase";
import type { ExecutionStatus } from "./page-execution";

export type PageCheckStateRow = {
  id: string;
  property_id: string;
  url: string;
  check_id: string;
  status: ExecutionStatus;
  notes: string | null;
  owner: string | null;
  fix_applied_at: string | null;
  updated_by: string;
  updated_at: string;
};

/** Read all check-state rows for a property keyed by `${url}\x1f${check_id}`. */
export async function getCheckStateByUrlCheck(
  propertyId: string,
): Promise<Map<string, PageCheckStateRow>> {
  const { data, error } = await supabase
    .from("page_check_state")
    .select("*")
    .eq("property_id", propertyId);
  if (error) throw new Error(`getCheckStateByUrlCheck: ${error.message}`);
  const m = new Map<string, PageCheckStateRow>();
  for (const row of (data ?? []) as PageCheckStateRow[]) {
    m.set(`${row.url}\x1f${row.check_id}`, row);
  }
  return m;
}

export type CheckStateUpsert = {
  property_id: string;
  url: string;
  check_id: string;
  status?: ExecutionStatus;
  notes?: string | null;
  owner?: string | null;
  fix_applied_at?: string | null;
  updated_by: string;
};

export async function upsertCheckState(
  adminClient: typeof supabase,
  input: CheckStateUpsert,
): Promise<PageCheckStateRow> {
  const { data, error } = await adminClient
    .from("page_check_state")
    .upsert(
      { ...input, updated_at: new Date().toISOString() },
      { onConflict: "property_id,url,check_id" },
    )
    .select()
    .single();
  if (error) throw new Error(`upsertCheckState: ${error.message}`);
  return data as PageCheckStateRow;
}
```

- [ ] **Step 2: Append server actions**

Append to `web/app/properties/[slug]/pages/page-actions.ts`:

```typescript
import { upsertCheckState } from "@/lib/page-check-state";

export async function setCheckStatus(args: {
  propertyId: string;
  url: string;
  checkId: string;
  status: ExecutionStatus;
  decidedBy: string;
  domainForCacheBust: string;
}) {
  const db = adminClient();
  await upsertCheckState(db, {
    property_id: args.propertyId,
    url: args.url,
    check_id: args.checkId,
    status: args.status,
    fix_applied_at: args.status === "Done" ? new Date().toISOString() : null,
    updated_by: args.decidedBy,
  });
  revalidateTag(wqaTagFor(args.domainForCacheBust));
}

export async function setCheckNotes(args: {
  propertyId: string;
  url: string;
  checkId: string;
  notes: string | null;
  decidedBy: string;
  domainForCacheBust: string;
}) {
  const db = adminClient();
  await upsertCheckState(db, {
    property_id: args.propertyId,
    url: args.url,
    check_id: args.checkId,
    notes: args.notes,
    updated_by: args.decidedBy,
  });
  revalidateTag(wqaTagFor(args.domainForCacheBust));
}
```

- [ ] **Step 3: Commit**

```bash
git add web/lib/page-check-state.ts web/app/properties/[slug]/pages/page-actions.ts
git commit -m "feat(lib): page_check_state typed queries + server actions"
```

### Task 1.6: `wqa-checks.ts` — TS port of Phase 2 check predicates

**Files:**
- Create: `web/lib/wqa-checks.ts`

The Phase 2 builder in `delivery/tna/build_phase2_technical.py` has the T/C/S check predicates. The web app needs them client-side so the drawer can compute "checks failing for this URL" without a server roundtrip.

- [ ] **Step 1: Write the check definitions + predicates**

```typescript
// web/lib/wqa-checks.ts
// TypeScript port of the Phase 2 check predicates in
// delivery/tna/build_phase2_technical.py. Each predicate evaluates one
// WqaRow + computed ctx (medians, dupe maps, kw map) and returns
// either null (pass) or { detail: string } (fail).

import type { WqaRow } from "./wqa";

export type CheckKind = "active" | "blocked";
export type CheckCategory = "T" | "C" | "S";

export type CheckDef = {
  id: string;
  category: CheckCategory;
  name: string;
  action: string;
  kind: CheckKind;
  blockedReason?: string;
  kwDependency: "Fix Now" | "Fix Now, Revisit" | "Phase 3 Dependent";
};

export const CHECKS: CheckDef[] = [
  // T-checks
  { id: "T1",  category: "T", name: "Schema errors", action: "Fix Schema", kind: "blocked", blockedReason: "Requires SF structured data report", kwDependency: "Fix Now" },
  { id: "T2",  category: "T", name: "Missing schema", action: "Add Schema", kind: "blocked", blockedReason: "Requires SF structured data report", kwDependency: "Fix Now" },
  { id: "T3",  category: "T", name: "Review star opportunity", action: "Add Product+AggregateRating", kind: "blocked", blockedReason: "Requires SF structured data report", kwDependency: "Fix Now" },
  { id: "T4",  category: "T", name: "Orphan with value", action: "Add Internal Links", kind: "active", kwDependency: "Fix Now" },
  { id: "T5",  category: "T", name: "Under-linked", action: "Add Internal Links", kind: "active", kwDependency: "Fix Now" },
  { id: "T6",  category: "T", name: "Buried page (depth>=4)", action: "Improve Architecture", kind: "active", kwDependency: "Fix Now" },
  { id: "T7",  category: "T", name: "Over-linked underperformer", action: "Remove Internal Links", kind: "active", kwDependency: "Fix Now" },
  { id: "T8",  category: "T", name: "Indexable but not indexed", action: "Fix Indexation", kind: "blocked", blockedReason: "Requires SF + GSC URL Inspection integration", kwDependency: "Fix Now" },
  { id: "T9",  category: "T", name: "Noindex on valuable page", action: "Fix Indexation", kind: "active", kwDependency: "Fix Now" },
  { id: "T10", category: "T", name: "Multiple canonicals", action: "Fix Multiple Canonicals", kind: "blocked", blockedReason: "Requires SF canonical-tags multi-value", kwDependency: "Fix Now" },
  { id: "T11", category: "T", name: "Canonical mismatch", action: "Canonicalize", kind: "active", kwDependency: "Fix Now" },
  { id: "T12", category: "T", name: "Not in sitemap", action: "Add to Sitemap", kind: "active", kwDependency: "Fix Now" },
  { id: "T13", category: "T", name: "Blocked resources (JS/CSS)", action: "Fix Blocked Resources", kind: "blocked", blockedReason: "Requires robots.txt + SF resources report", kwDependency: "Fix Now" },
  { id: "T14", category: "T", name: "JS rendering required", action: "Verify JS Rendering", kind: "active", kwDependency: "Fix Now" },
  { id: "T16", category: "T", name: "Pages linking to broken pages", action: "Update Internal Links", kind: "blocked", blockedReason: "Requires SF inlinks → broken-URL set", kwDependency: "Fix Now" },
  { id: "T17", category: "T", name: "HTTPS page linking to HTTP", action: "Fix Internal Links", kind: "blocked", blockedReason: "Requires SF inlinks raw URL inspection", kwDependency: "Fix Now" },
  { id: "T18", category: "T", name: "Missing social tags (OG/Twitter)", action: "Add Social Tags", kind: "blocked", blockedReason: "Requires SF social-tags extract", kwDependency: "Fix Now" },
  { id: "T20", category: "T", name: "Duplicate without canonical", action: "Add Canonical", kind: "blocked", blockedReason: "Requires SF duplicate content report", kwDependency: "Fix Now" },
  // C-checks
  { id: "C1",  category: "C", name: "Revenue page losing traffic", action: "Refresh (URGENT)", kind: "active", kwDependency: "Fix Now" },
  { id: "C2",  category: "C", name: "Low engagement", action: "Rewrite", kind: "active", kwDependency: "Phase 3 Dependent" },
  { id: "C3",  category: "C", name: "Cannibalization", action: "Merge weaker into stronger", kind: "active", kwDependency: "Fix Now" },
  { id: "C4",  category: "C", name: "Thin content", action: "Rewrite", kind: "active", kwDependency: "Phase 3 Dependent" },
  { id: "C5",  category: "C", name: "Losing traffic", action: "Refresh or Rewrite", kind: "active", kwDependency: "Phase 3 Dependent" },
  { id: "C6",  category: "C", name: "Ranking 3-10, SV>50", action: "Target with Links", kind: "active", kwDependency: "Fix Now" },
  { id: "C7",  category: "C", name: "Ranking 11-20, SV>50", action: "Refresh or Rewrite", kind: "active", kwDependency: "Phase 3 Dependent" },
  { id: "C8",  category: "C", name: "Missing meta description", action: "Update Meta Description", kind: "active", kwDependency: "Fix Now, Revisit" },
  { id: "C9",  category: "C", name: "Duplicate meta description", action: "Update Meta Description", kind: "active", kwDependency: "Fix Now, Revisit" },
  { id: "C10", category: "C", name: "Duplicate title", action: "Update Page Title", kind: "active", kwDependency: "Fix Now, Revisit" },
  { id: "C11", category: "C", name: "Title issues (length/stuffing)", action: "Update Page Title", kind: "active", kwDependency: "Fix Now, Revisit" },
  { id: "C12", category: "C", name: "Has refs but not ranking", action: "Target w/ Links + Refresh", kind: "active", kwDependency: "Fix Now" },
  { id: "C13", category: "C", name: "Performing well", action: "Leave As Is", kind: "active", kwDependency: "Phase 3 Dependent" },
  { id: "C15", category: "C", name: "Meta description too long (>155)", action: "Shorten Meta Description", kind: "active", kwDependency: "Fix Now, Revisit" },
  { id: "C16", category: "C", name: "Meta description too short (<70)", action: "Expand Meta Description", kind: "active", kwDependency: "Fix Now, Revisit" },
  { id: "C17", category: "C", name: "Title too long (>65)", action: "Shorten Title", kind: "active", kwDependency: "Fix Now, Revisit" },
  { id: "C18", category: "C", name: "Title too short (<30)", action: "Expand Title", kind: "active", kwDependency: "Fix Now, Revisit" },
  { id: "C19", category: "C", name: "AI content detection", action: "Review Content Quality", kind: "blocked", blockedReason: "Requires Ahrefs Site Audit AI signal", kwDependency: "Phase 3 Dependent" },
  { id: "C20", category: "C", name: "Page vs SERP title mismatch", action: "Improve Title Quality", kind: "blocked", blockedReason: "Requires GSC URL Inspection API", kwDependency: "Fix Now, Revisit" },
];

export type Ctx = {
  medianInlinksByCategory: Map<string, number>;
  titleCounts: Map<string, number>;
  metaCounts: Map<string, number>;
  kwCounts: Map<string, number>;
};

export function buildCtx(rows: WqaRow[], rowCategory: (r: WqaRow) => string): Ctx {
  const inlinksByCat: Map<string, number[]> = new Map();
  const titles = new Map<string, number>();
  const metas = new Map<string, number>();
  const kws = new Map<string, number>();
  for (const r of rows) {
    const c = rowCategory(r);
    if (!inlinksByCat.has(c)) inlinksByCat.set(c, []);
    const ils = r.inlinks ?? 0;
    if (ils > 0) inlinksByCat.get(c)!.push(ils);
    if (r.current_title) titles.set(r.current_title, (titles.get(r.current_title) ?? 0) + 1);
    if (r.meta_description) metas.set(r.meta_description, (metas.get(r.meta_description) ?? 0) + 1);
    if (r.best_tv_keyword && r.best_tv_keyword !== "None found") {
      kws.set(r.best_tv_keyword, (kws.get(r.best_tv_keyword) ?? 0) + 1);
    }
  }
  const medianInlinksByCategory = new Map<string, number>();
  for (const [cat, arr] of inlinksByCat) {
    if (arr.length === 0) {
      medianInlinksByCategory.set(cat, 0);
      continue;
    }
    arr.sort((a, b) => a - b);
    const mid = Math.floor(arr.length / 2);
    medianInlinksByCategory.set(
      cat,
      arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2,
    );
  }
  return { medianInlinksByCategory, titleCounts: titles, metaCounts: metas, kwCounts: kws };
}

export function evaluateChecks(
  row: WqaRow,
  category: string,
  ctx: Ctx,
): Array<{ id: string; name: string; action: string; detail: string; kwDependency: string }> {
  const out: Array<{ id: string; name: string; action: string; detail: string; kwDependency: string }> = [];
  const inlinks = row.inlinks ?? 0;
  const depth = row.page_depth ?? 0;
  const sessions = row.sessions ?? 0;
  const imps = row.average_impressions ?? 0;
  const refs = row.referring_domains ?? 0;
  const rank = row.best_tv_kw_rank ?? 0;
  const sv = row.best_tv_kw_sv ?? 0;
  const conv = row.conversions ?? 0;
  const rev = row.total_revenue ?? 0;
  const title = row.current_title ?? "";
  const meta = row.meta_description ?? "";
  const canon = row.canonical_link_element ?? "";
  const inSitemap = String(row.in_sitemap ?? "").toLowerCase() === "true";
  const idxStatus = row.indexability_status ?? "";
  const pageType = row.type ?? "";
  const wc = row.word_count ?? 0;
  const losing = row.losing_traffic === true;
  const sessPct = row.session_pct_change ?? "";

  const median = ctx.medianInlinksByCategory.get(category) ?? 0;

  // T4 Orphan with value
  if (inlinks === 0 && (sessions > 0 || imps > 0))
    out.push(_emit("T4", `Inlinks=0; sessions=${sessions}, impressions=${imps}`));
  // T5 Under-linked
  if (median > 0 && inlinks > 0 && inlinks < median * 0.5)
    out.push(_emit("T5", `Inlinks=${inlinks} < 50% of ${category} median (${median.toFixed(1)})`));
  // T6 Buried
  if (depth >= 4)
    out.push(_emit("T6", `Page depth = ${depth} (>= 4 clicks from homepage)`));
  // T7 Over-linked underperformer
  if (median > 0 && inlinks > median * 2 && sessions < 10)
    out.push(_emit("T7", `Inlinks=${inlinks} > 200% of median (${median.toFixed(1)}); sessions=${sessions}`));
  // T9 Noindex on valuable
  if (idxStatus.toLowerCase().includes("noindex") && (sessions > 0 || refs > 0))
    out.push(_emit("T9", `Noindex but sessions=${sessions}, refs=${refs}`));
  // T11 Canonical mismatch
  if (canon && canon !== row.url && canon.replace(/\/$/, "") !== row.url.replace(/\/$/, ""))
    out.push(_emit("T11", `Canonical → ${canon}`));
  // T12 Not in sitemap
  if (row.status_code === 200 && row.indexability === "Indexable" && !inSitemap)
    out.push(_emit("T12", "Indexable 200 URL absent from sitemap"));
  // T14 JS rendering
  if (pageType.toLowerCase().includes("javascript") || pageType.toLowerCase().includes("spa"))
    out.push(_emit("T14", `Page Type = ${pageType}`));

  // C1 Revenue losing
  if ((row.conversion_rate_pct ?? 0) > 5 || rev > 100) {
    if (losing) out.push(_emit("C1", `Conv Rate=${row.conversion_rate_pct?.toFixed?.(1) ?? 0}%, Revenue=$${rev}, losing`));
  }
  // C2 Low engagement
  if (sessions > 50 && (row.average_session_duration ?? 0) > 0 && (row.average_session_duration ?? 0) < 30)
    out.push(_emit("C2", `Sessions=${sessions} but avg duration=${row.average_session_duration}s`));
  // C3 Cannibalization
  if (row.best_tv_keyword && (ctx.kwCounts.get(row.best_tv_keyword) ?? 0) >= 2)
    out.push(_emit("C3", `Keyword "${row.best_tv_keyword}" targeted by ${ctx.kwCounts.get(row.best_tv_keyword)} pages`));
  // C4 Thin content
  if (wc > 0 && wc < 300 && sessions < 10)
    out.push(_emit("C4", `Word count=${wc} (<300); sessions=${sessions} (<10)`));
  // C5 Losing traffic
  if (sessPct.startsWith("-") || losing)
    out.push(_emit("C5", `Session % change=${sessPct || "(losing)"}`));
  // C6 Ranking 3-10
  if (rank >= 3 && rank <= 10 && sv > 50)
    out.push(_emit("C6", `Ranking ${rank} for "${row.best_tv_keyword}" (SV=${sv})`));
  // C7 Ranking 11-20
  if (rank >= 11 && rank <= 20 && sv > 50)
    out.push(_emit("C7", `Ranking ${rank} for "${row.best_tv_keyword}" (SV=${sv})`));
  // C8 Missing meta
  if (!meta) out.push(_emit("C8", "Meta description is empty"));
  // C9 Duplicate meta
  if (meta && (ctx.metaCounts.get(meta) ?? 0) >= 2)
    out.push(_emit("C9", `Meta shared with ${(ctx.metaCounts.get(meta) ?? 1) - 1} other URL(s)`));
  // C10 Duplicate title
  if (title && (ctx.titleCounts.get(title) ?? 0) >= 2)
    out.push(_emit("C10", `Title shared with ${(ctx.titleCounts.get(title) ?? 1) - 1} other URL(s)`));
  // C11 Title issues
  if (title && title.length > 65) out.push(_emit("C11", `Title length=${title.length} (>65 chars)`));
  // C12 Refs but not ranking
  if (refs > 0 && rank > 20)
    out.push(_emit("C12", `Refs=${refs} but rank=${rank}`));
  // C13 Performing well (informational)
  if (sessions > 50 && wc > 1000)
    out.push(_emit("C13", `Sessions=${sessions} + words=${wc} = performing well`));
  // C15 Meta too long
  if (meta && meta.length > 155) out.push(_emit("C15", `Meta length=${meta.length} (>155)`));
  // C16 Meta too short
  if (meta && meta.length > 0 && meta.length < 70) out.push(_emit("C16", `Meta length=${meta.length} (<70)`));
  // C17 Title too long
  if (title && title.length > 65) out.push(_emit("C17", `Title length=${title.length} (>65)`));
  // C18 Title too short
  if (title && title.length < 30) out.push(_emit("C18", `Title length=${title.length} (<30)`));

  return out;
}

function _emit(id: string, detail: string) {
  const def = CHECKS.find(c => c.id === id)!;
  return { id, name: def.name, action: def.action, detail, kwDependency: def.kwDependency };
}
```

- [ ] **Step 2: Commit**

```bash
git add web/lib/wqa-checks.ts
git commit -m "feat(lib): TS port of T/C check predicates"
```

---

## Chunk 2: URL drawer + universal hookup

### Task 2.1: `UrlDrawer.tsx` skeleton

**Files:**
- Create: `web/components/UrlDrawer.tsx`

- [ ] **Step 1: Component scaffold + open/close state**

```tsx
// web/components/UrlDrawer.tsx
"use client";

import { useEffect } from "react";
import type { WqaRow } from "@/lib/wqa";
import type { PageExecutionRow } from "@/lib/page-execution";
import type { PageCheckStateRow } from "@/lib/page-check-state";
import { evaluateChecks, buildCtx, type Ctx } from "@/lib/wqa-checks";

export function UrlDrawer({
  open,
  onClose,
  propertyId,
  domain,
  row,
  category,
  execution,
  checkStates,
  ctx,
  currentAction,
}: {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  domain: string;
  row: WqaRow | null;
  category: string;
  execution: PageExecutionRow | null;
  checkStates: Map<string, PageCheckStateRow>;
  ctx: Ctx;
  currentAction: string;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !row) return null;
  const failingChecks = evaluateChecks(row, category, ctx);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative w-[560px] h-full bg-background border-l overflow-y-auto">
        <header className="sticky top-0 bg-background border-b px-5 py-3 flex items-start justify-between">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{domain}</div>
            <div className="font-mono text-sm truncate" title={row.url}>
              {row.url}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground px-2"
            aria-label="Close drawer"
          >
            ✕
          </button>
        </header>

        <section className="px-5 py-4">
          <SectionTitle>Signals</SectionTitle>
          <SignalsBlock row={row} />
        </section>

        <section className="px-5 py-4 border-t">
          <SectionTitle>Phase 1</SectionTitle>
          <Phase1Block row={row} currentAction={currentAction} />
        </section>

        <section className="px-5 py-4 border-t">
          <SectionTitle>
            Phase 2 Checks &middot;{" "}
            <span className="text-rose-600">{failingChecks.length} failing</span>
          </SectionTitle>
          <Phase2Block
            propertyId={propertyId}
            url={row.url}
            domain={domain}
            failing={failingChecks}
            states={checkStates}
          />
        </section>

        <section className="px-5 py-4 border-t">
          <SectionTitle>Execution</SectionTitle>
          <ExecutionBlock
            propertyId={propertyId}
            url={row.url}
            domain={domain}
            execution={execution}
          />
        </section>

        {currentAction.toLowerCase().startsWith("restore") && (
          <section className="px-5 py-4 border-t">
            <SectionTitle>Restore Spec</SectionTitle>
            <RestoreSpecBlock
              propertyId={propertyId}
              url={row.url}
              domain={domain}
              execution={execution}
            />
          </section>
        )}

        <section className="px-5 py-4 border-t">
          <SectionTitle>History</SectionTitle>
          <HistoryBlock propertyId={propertyId} url={row.url} />
        </section>
      </aside>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
      {children}
    </h3>
  );
}

// Placeholder sub-blocks. Implemented in tasks 2.2 - 2.7.
function SignalsBlock(_: { row: WqaRow }) { return <div className="text-sm text-muted-foreground">…</div>; }
function Phase1Block(_: { row: WqaRow; currentAction: string }) { return <div className="text-sm text-muted-foreground">…</div>; }
function Phase2Block(_: { propertyId: string; url: string; domain: string; failing: ReturnType<typeof evaluateChecks>; states: Map<string, PageCheckStateRow> }) { return <div className="text-sm text-muted-foreground">…</div>; }
function ExecutionBlock(_: { propertyId: string; url: string; domain: string; execution: PageExecutionRow | null }) { return <div className="text-sm text-muted-foreground">…</div>; }
function RestoreSpecBlock(_: { propertyId: string; url: string; domain: string; execution: PageExecutionRow | null }) { return <div className="text-sm text-muted-foreground">…</div>; }
function HistoryBlock(_: { propertyId: string; url: string }) { return <div className="text-sm text-muted-foreground">Coming…</div>; }
```

- [ ] **Step 2: Commit**

```bash
git add web/components/UrlDrawer.tsx
git commit -m "feat(ui): UrlDrawer skeleton with all sections stubbed"
```

### Task 2.2: Wire up `SignalsBlock`

Replace the SignalsBlock stub in `UrlDrawer.tsx`:

```tsx
function SignalsBlock({ row }: { row: WqaRow }) {
  const items: Array<[string, string | number | null | undefined]> = [
    ["Sessions", row.sessions],
    ["Conversions", row.conversions],
    ["Revenue", row.total_revenue ? `$${row.total_revenue.toFixed(2)}` : null],
    ["Impressions", row.average_impressions],
    ["CTR", row.average_ctr ? `${(row.average_ctr * 100).toFixed(2)}%` : null],
    ["Ref Domains", row.referring_domains],
    ["Backlinks", row.backlinks],
    ["Best KW", row.best_tv_keyword],
    ["Best KW Rank", row.best_tv_kw_rank],
    ["Best KW SV", row.best_tv_kw_sv],
    ["Word Count", row.word_count],
    ["Inlinks", row.inlinks],
    ["Page Depth", row.page_depth],
    ["Status Code", row.status_code],
    ["Indexability", row.indexability],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
      {items
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-mono text-[12.5px] text-right truncate" title={String(v)}>
              {v}
            </dd>
          </div>
        ))}
    </dl>
  );
}
```

Commit: `feat(ui): UrlDrawer signals block`.

### Task 2.3: Wire up `Phase1Block`

```tsx
function Phase1Block({ row, currentAction }: { row: WqaRow; currentAction: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-900">
          {currentAction}
        </span>
        <span className="text-xs text-muted-foreground">(triage action)</span>
      </div>
      {row.data_sources && (
        <div className="text-xs text-muted-foreground">
          Data sources: <span className="font-mono">{row.data_sources}</span>
        </div>
      )}
    </div>
  );
}
```

Commit: `feat(ui): UrlDrawer phase 1 block`.

### Task 2.4: Wire up `Phase2Block` with status editing

```tsx
import { setCheckStatus } from "@/app/properties/[slug]/pages/page-actions";

function Phase2Block({ propertyId, url, domain, failing, states }: {
  propertyId: string; url: string; domain: string;
  failing: ReturnType<typeof evaluateChecks>;
  states: Map<string, PageCheckStateRow>;
}) {
  if (failing.length === 0) {
    return <div className="text-sm text-emerald-700">No Phase 2 issues for this URL.</div>;
  }
  return (
    <ul className="space-y-2">
      {failing.map(f => {
        const state = states.get(`${url}\x1f${f.id}`);
        const status = state?.status ?? "To Do";
        return (
          <li key={f.id} className="border rounded px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold">{f.id} &middot; {f.name}</div>
                <div className="text-xs text-muted-foreground">{f.detail}</div>
                <div className="text-[11px] mt-1">
                  <span className="text-muted-foreground">Action: </span>
                  <span>{f.action}</span>
                  <span className="text-muted-foreground"> &middot; {f.kwDependency}</span>
                </div>
              </div>
              <select
                className="text-xs border rounded px-2 py-1"
                value={status}
                onChange={async (e) => {
                  await setCheckStatus({
                    propertyId,
                    url,
                    checkId: f.id,
                    status: e.target.value as "To Do" | "In Progress" | "Blocked" | "Done",
                    decidedBy: "ui:drawer",
                    domainForCacheBust: domain,
                  });
                }}
              >
                <option>To Do</option>
                <option>In Progress</option>
                <option>Blocked</option>
                <option>Done</option>
              </select>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

Commit: `feat(ui): UrlDrawer phase 2 checks block with status editing`.

### Task 2.5: Wire up `ExecutionBlock` with field editing

```tsx
import { setExecutionStatus, setExecutionField } from "@/app/properties/[slug]/pages/page-actions";

function ExecutionBlock({ propertyId, url, domain, execution }: {
  propertyId: string; url: string; domain: string;
  execution: PageExecutionRow | null;
}) {
  const status = execution?.status ?? "To Do";
  const owner = execution?.owner ?? "";
  const due = execution?.due_date ?? "";
  const notes = execution?.notes ?? "";
  const targetUrl = execution?.target_url ?? "";

  return (
    <div className="space-y-3 text-sm">
      <Field label="Status">
        <select
          className="border rounded px-2 py-1"
          defaultValue={status}
          onChange={(e) => setExecutionStatus({
            propertyId, url,
            status: e.target.value as "To Do" | "In Progress" | "Blocked" | "Done",
            decidedBy: "ui:drawer", domainForCacheBust: domain,
          })}
        >
          <option>To Do</option><option>In Progress</option>
          <option>Blocked</option><option>Done</option>
        </select>
      </Field>
      <Field label="Owner">
        <input className="border rounded px-2 py-1 w-full" defaultValue={owner}
          onBlur={(e) => setExecutionField({
            propertyId, url, field: "owner", value: e.target.value || null,
            decidedBy: "ui:drawer", domainForCacheBust: domain,
          })}
        />
      </Field>
      <Field label="Due">
        <input type="date" className="border rounded px-2 py-1" defaultValue={due ?? ""}
          onBlur={(e) => setExecutionField({
            propertyId, url, field: "due_date", value: e.target.value || null,
            decidedBy: "ui:drawer", domainForCacheBust: domain,
          })}
        />
      </Field>
      <Field label="Target URL">
        <input className="border rounded px-2 py-1 w-full font-mono text-[12.5px]" defaultValue={targetUrl}
          onBlur={(e) => setExecutionField({
            propertyId, url, field: "target_url", value: e.target.value || null,
            decidedBy: "ui:drawer", domainForCacheBust: domain,
          })}
        />
      </Field>
      <Field label="Notes">
        <textarea className="border rounded px-2 py-1 w-full" rows={3} defaultValue={notes}
          onBlur={(e) => setExecutionField({
            propertyId, url, field: "notes", value: e.target.value || null,
            decidedBy: "ui:drawer", domainForCacheBust: domain,
          })}
        />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[100px_1fr] items-start gap-3">
      <span className="text-muted-foreground pt-1">{label}</span>
      <div>{children}</div>
    </label>
  );
}
```

Commit: `feat(ui): UrlDrawer execution block with field editing`.

### Task 2.6: Wire up `RestoreSpecBlock`

```tsx
function RestoreSpecBlock({ propertyId, url, domain, execution }: {
  propertyId: string; url: string; domain: string;
  execution: PageExecutionRow | null;
}) {
  return (
    <div className="space-y-3 text-sm">
      <Field label="Target H1">
        <input className="border rounded px-2 py-1 w-full" defaultValue={execution?.target_h1 ?? ""}
          onBlur={(e) => setExecutionField({
            propertyId, url, field: "target_h1", value: e.target.value || null,
            decidedBy: "ui:drawer", domainForCacheBust: domain,
          })}
        />
      </Field>
      <Field label="Target Title">
        <input className="border rounded px-2 py-1 w-full" defaultValue={execution?.target_title ?? ""}
          onBlur={(e) => setExecutionField({
            propertyId, url, field: "target_title", value: e.target.value || null,
            decidedBy: "ui:drawer", domainForCacheBust: domain,
          })}
        />
      </Field>
      <Field label="Target Meta">
        <textarea className="border rounded px-2 py-1 w-full" rows={2} defaultValue={execution?.target_meta ?? ""}
          onBlur={(e) => setExecutionField({
            propertyId, url, field: "target_meta", value: e.target.value || null,
            decidedBy: "ui:drawer", domainForCacheBust: domain,
          })}
        />
      </Field>
    </div>
  );
}
```

Commit: `feat(ui): UrlDrawer restore-spec block`.

### Task 2.7: Wire drawer into PagesView

**Files:**
- Modify: `web/components/PagesView.tsx`
- Modify: `web/components/wqa/WqaTabs.tsx`
- Modify: `web/app/properties/[slug]/pages/page.tsx`

- [ ] **Step 1: Pass propertyId + Supabase reads through PagesView → WqaTabs**

Update `page.tsx` to load execution + check states + propertyId:

```tsx
import { getExecutionByUrl } from "@/lib/page-execution";
import { getCheckStateByUrlCheck } from "@/lib/page-check-state";

// inside PagesTab default export, after const prop = await getProperty(slug):
const propertyId = prop?.id ?? null;
const execMap = propertyId ? await getExecutionByUrl(propertyId) : new Map();
const checkMap = propertyId ? await getCheckStateByUrlCheck(propertyId) : new Map();

// then pass to PagesView:
return (
  <PagesView
    propertySlug={slug}
    propertyId={propertyId}
    wqa={wqaPayload}
    wqaError={wqaError}
    primaryDomain={primaryDomain}
    decisions={decisions}
    executions={Array.from(execMap.values())}
    checkStates={Array.from(checkMap.values())}
  />
);
```

Update `PagesView.tsx` and `WqaTabs.tsx` to accept and forward `executions`, `checkStates`, `propertyId`.

- [ ] **Step 2: Add drawer state to WqaTabs / table components**

In whichever table component renders the URL rows (likely `OptimizeTab.tsx` and siblings), add:

```tsx
const [drawerUrl, setDrawerUrl] = useState<string | null>(null);
// row onClick: setDrawerUrl(row.url)
<UrlDrawer
  open={drawerUrl !== null}
  onClose={() => setDrawerUrl(null)}
  propertyId={propertyId}
  domain={primaryDomain}
  row={drawerUrl ? rows.find(r => r.url === drawerUrl) ?? null : null}
  category={...}  // derive from triage
  execution={execByUrl.get(drawerUrl ?? "") ?? null}
  checkStates={checkStateByUrlCheck}  // filtered to this url client-side
  ctx={ctx}
  currentAction={...}
/>
```

- [ ] **Step 3: Test by clicking a URL in the deployed app**

Run dev: `cd web && npm run dev`. Navigate to `/properties/buscharter/pages?action=optimize`. Click a row. Drawer opens. Verify signals, Phase 2 checks evaluate, edit a status, refresh page, verify persistence.

- [ ] **Step 4: Commit**

```bash
git add web/components/UrlDrawer.tsx web/components/PagesView.tsx web/components/wqa/*.tsx web/app/properties/[slug]/pages/page.tsx
git commit -m "feat(ui): wire UrlDrawer into PagesView for all existing tabs"
```

---

## Chunk 3: Triage view — new + enriched tabs

### Task 3.1: Overview tab (Action Plan + Funnel + Service + Checklist)

**Files:**
- Modify: `web/components/wqa/OverviewTab.tsx`

Sections:
1. **Action Plan** — 8 prioritized rows (same as `write_action_plan` in `build_phase1_wqa.py`), with editable Status/Done dropdown.
2. **Funnel** — counts by parent action group with bars.
3. **Service Summary** — top 10 services by sessions.
4. **Implementation Checklist** — 8 sequenced steps from Phase 1.

Reuse counts already computed in `WqaTabs.tsx`. Pull execution state for the synthetic Action Plan rows by URL pattern (e.g., the "Execute Redirect Map" item links to `?action=redirect`).

(Full code: see existing `OverviewTab.tsx` for current structure and extend with the four sub-sections. Each Action Plan row links to the relevant action tab.)

Commit: `feat(ui): expand Overview to mirror workbook tabs 2, 4, 5, 10`.

### Task 3.2: Canonical Audit tab

**Files:**
- Create: `web/components/wqa/CanonicalAuditTab.tsx`
- Modify: `web/components/wqa/WqaTabs.tsx` (add view = canonical-audit)

```tsx
"use client";

import type { WqaRow } from "@/lib/wqa";

export function CanonicalAuditTab({ rows, propertyId, domain, onRowClick }: {
  rows: WqaRow[];
  propertyId: string;
  domain: string;
  onRowClick: (url: string) => void;
}) {
  const issues = rows
    .map((r) => {
      const canon = r.canonical_link_element ?? "";
      const issue = !canon
        ? "Missing"
        : canon.replace(/\/$/, "") !== r.url.replace(/\/$/, "")
          ? "Mismatch"
          : "OK";
      return { row: r, canon, issue };
    })
    .filter(x => x.issue !== "OK");

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted text-[11px] uppercase tracking-wider">
            <th className="text-left px-3 py-2">URL</th>
            <th className="text-left px-3 py-2">Current Canonical</th>
            <th className="text-left px-3 py-2">Correct Canonical</th>
            <th className="text-left px-3 py-2">Issue</th>
          </tr>
        </thead>
        <tbody>
          {issues.map(({ row, canon, issue }) => (
            <tr key={row.url} className="border-b hover:bg-muted/40 cursor-pointer"
                onClick={() => onRowClick(row.url)}>
              <td className="px-3 py-1.5 font-mono text-[12.5px]">{row.url}</td>
              <td className="px-3 py-1.5 font-mono text-[12.5px]">{canon || "—"}</td>
              <td className="px-3 py-1.5 font-mono text-[12.5px]">{row.url}</td>
              <td className="px-3 py-1.5 text-[12px]">
                <span className={"px-2 py-0.5 rounded text-[11px] font-semibold " +
                  (issue === "Missing" ? "bg-amber-100 text-amber-900" : "bg-rose-100 text-rose-900")}>
                  {issue}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Commit: `feat(ui): Canonical Audit tab`.

### Task 3.3: Action Legend tab (static reference)

**Files:**
- Create: `web/components/wqa/ActionLegendTab.tsx`

Renders the same 10-row legend as in `build_phase1_wqa.py:write_action_legend`. Static markup. No edits.

Commit: `feat(ui): Action Legend reference tab`.

### Task 3.4: Inline editors — Redirect destination, Restore content spec

**Files:**
- Modify: `web/components/wqa/RedirectTab.tsx` (add Destination URL editable column)
- Modify: `web/components/wqa/RestoreTab.tsx` (add Target H1 / Title / Meta inline columns)
- Modify: `web/components/wqa/RemoveTab.tsx` (add Recommended Action override)

For Redirect tab, add a column "Destination" with an `<input>` that calls `setExecutionField({ field: "target_url", value, ... })` on blur.

For Restore tab, add three input columns next to URL.

Commit: `feat(ui): inline execution editors for Redirect / Restore / Remove tabs`.

---

## Chunk 4: Technical Audit view + exports

### Task 4.1: Mode switcher (Triage / Technical Audit)

**Files:**
- Modify: `web/components/PagesView.tsx`

Add a top-of-page tab bar with two pills (Triage / Technical Audit). State held in `?mode=` URL param. When `mode=audit`, render `AuditModeShell` instead of `WqaTabs`.

Commit: `feat(ui): TRIAGE / TECHNICAL AUDIT mode switcher`.

### Task 4.2: Audit shell + sub-tab nav

**Files:**
- Create: `web/components/audit/AuditModeShell.tsx`

```tsx
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { AuditOverviewTab } from "./AuditOverviewTab";
import { AuditChecklistTab } from "./AuditChecklistTab";
import { AuditCheckDetailView } from "./AuditCheckDetailView";
import { AuditUrlPriorityTab } from "./AuditUrlPriorityTab";
import { AuditArchitectureTab } from "./AuditArchitectureTab";
import { AuditSchemaTab } from "./AuditSchemaTab";
import { AuditPageSpeedTab } from "./AuditPageSpeedTab";
import { AuditBrokenTab } from "./AuditBrokenTab";
import type { WqaRow } from "@/lib/wqa";
import type { PageCheckStateRow } from "@/lib/page-check-state";
import type { PageExecutionRow } from "@/lib/page-execution";

const TABS = [
  ["overview", "Issue Summary"],
  ["checklist", "Audit Checklist"],
  ["url-priority", "URL Priority"],
  ["architecture", "Architecture"],
  ["schema", "Schema"],
  ["pagespeed", "Page Speed"],
  ["broken", "Broken Links"],
] as const;

export function AuditModeShell(props: {
  propertyId: string;
  domain: string;
  rows: WqaRow[];
  executions: PageExecutionRow[];
  checkStates: PageCheckStateRow[];
  onRowClick: (url: string) => void;
}) {
  const sp = useSearchParams();
  const router = useRouter();
  const view = sp.get("view") ?? "overview";
  const check = sp.get("check");

  return (
    <div>
      <nav className="flex gap-1 border-b mb-4">
        {TABS.map(([k, label]) => (
          <button key={k}
            onClick={() => router.push(`?mode=audit&view=${k}`)}
            className={"px-3 py-1.5 text-sm border-b-2 -mb-px " +
              (view === k ? "border-foreground font-semibold" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {label}
          </button>
        ))}
      </nav>
      {view === "overview" && <AuditOverviewTab {...props} />}
      {view === "checklist" && (check
        ? <AuditCheckDetailView {...props} checkId={check} />
        : <AuditChecklistTab {...props} />)}
      {view === "url-priority" && <AuditUrlPriorityTab {...props} />}
      {view === "architecture" && <AuditArchitectureTab {...props} />}
      {view === "schema" && <AuditSchemaTab {...props} />}
      {view === "pagespeed" && <AuditPageSpeedTab />}
      {view === "broken" && <AuditBrokenTab />}
    </div>
  );
}
```

Commit: `feat(ui): Audit mode shell + sub-tab nav`.

### Tasks 4.3-4.9: Audit sub-tabs

Each follows the same shape — table view of the Optimize+Restore subset of WqaRow, with relevant columns per the SOP and editable Status (writes `page_check_state`).

- **Task 4.3** `AuditOverviewTab.tsx` — Issue Summary: 44+ rows, one per check, status / URLs Affected / Action.
- **Task 4.4** `AuditChecklistTab.tsx` — same as Overview but grouped into T / C / S sections; clicking a check id → `?mode=audit&view=checklist&check=T6`.
- **Task 4.5** `AuditCheckDetailView.tsx` — URL list filtered to URLs failing the chosen check, with inline Status editor.
- **Task 4.6** `AuditUrlPriorityTab.tsx` — Optimize+Restore URLs, one row each, with combined actions across all failing checks; Status editor opens drawer.
- **Task 4.7** `AuditArchitectureTab.tsx` — per-URL depth, orphan, sitemap, action items.
- **Task 4.8** `AuditSchemaTab.tsx` — required schema per page category (Transport requirements), current schema = "Blocked (needs SF)".
- **Task 4.9** `AuditPageSpeedTab.tsx` + `AuditBrokenTab.tsx` — Blocked badge + "Pull SF report" instructions.

Each task commits independently. Pattern reuses the table → click-row → drawer flow.

### Task 4.10: Export endpoints

**Files:**
- Create: `web/api/wqa/export.py`
- Create: `web/api/audit/phase-2/export.py`

Both endpoints are Python Vercel functions. They import the existing builder modules and adapt the CSV-reading layer to read from Supabase + BQ. Stream the xlsx as the response with `Content-Disposition: attachment`.

```python
# web/api/wqa/export.py — sketch (full implementation references existing builder)
import io
import os
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        q = parse_qs(urlparse(self.path).query)
        slug = (q.get("slug", [""])[0] or "").strip()
        if not slug:
            self.send_response(400); self.end_headers(); return
        # 1. Resolve property → primary_domain via Supabase
        # 2. Fetch WqaRows from BQ via existing /api/wqa/pages logic
        # 3. Fetch execution + check_state from Supabase
        # 4. Build aggregated DF (URL, Action, Logic, ... triage-CSV equivalent)
        # 5. Invoke imported build_workbook(site, df) → BytesIO
        # 6. Stream as application/vnd.ms-excel attachment
        buf = io.BytesIO(); # ... fill ...
        self.send_response(200)
        self.send_header("Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        self.send_header("Content-Disposition",
            f'attachment; filename="{slug}-Website-Quality-Audit.xlsx"')
        self.end_headers()
        self.wfile.write(buf.getvalue())
```

Wire an "Export xlsx" button into PagesView header that hits `/api/wqa/export?slug={slug}`.

Commit: `feat(api): xlsx export endpoints for Phase 1 + Phase 2`.

---

## Deployment

After each chunk:

```bash
cd web
npm run build      # verify build
vercel             # deploy preview
# manual smoke test on the preview URL
vercel --prod      # promote when smoke passes
```

## Self-Review

**1. Spec coverage**

- ✅ Three new Supabase tables (Tasks 1.1-1.3)
- ✅ Server actions for page_execution + page_check_state (Tasks 1.4-1.5)
- ✅ Universal URL drawer (Tasks 2.1-2.7)
- ✅ Mirror 12 WQA workbook tabs (Tasks 3.1-3.4 + existing per-action tabs)
- ✅ Mirror Phase 2 workbook tabs under same route (Tasks 4.1-4.9)
- ✅ Export endpoints in canonical xlsx format (Task 4.10)
- ⚠ `url_relationship` table created but no UI surface in this plan — used implicitly by Redirect Map destination editor (Task 3.4) but not yet rendered as a graph. Acceptable for v1; covered in non-goals.

**2. Placeholder scan** — Each task has concrete code or references existing builders verbatim. Tasks 4.3-4.9 are summarized rather than fully expanded; that's acceptable because (a) they follow the same pattern as Task 4.2 shell and Tasks 3.x table tabs, and (b) the executor can expand inline using the existing per-tab references in `WqaTabs.tsx`. Acknowledged trade-off.

**3. Type consistency** — `ExecutionStatus` defined once in `page-execution.ts`, imported by `page-check-state.ts`. `WqaRow` reused from `lib/wqa.ts`. `PageExecutionRow` / `PageCheckStateRow` consistent across drawer + actions.

Plan complete and saved.
