# Pages — Action Semantics Overhaul (P2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 10-value action enum on the Pages surface with a clean 7-action noun-decision model + separate status workflow + logic_code + override-preservation. Foundational sub-project for the Pages overhaul (P1, P3, P5, P6 all depend on this landing first).

**Architecture:** The existing `wqa_decision` table is sparse-by-design (only stores rows a human has overridden; canonical row source is BQ `wqa_output`). Extend it with the new columns (status, logic_notes, last_implementation_check_at, drift_reason) and tighten the action check constraint to the new 7-value enum. Pipeline-side: `build_phase1_wqa.py` emits the new action enum + logic_code into the BQ pipeline output. UI side: new chips + filter strip + drawer additions.

**Tech Stack:** Next.js 16 (App Router, RSC), Supabase Postgres + RLS, Python (`build_phase1_wqa.py`), Next.js route handler for live URL verification, existing `@/lib/supabase` singleton.

**Spec:** `docs/superpowers/specs/2026-05-25-action-semantics-design.md`

---

## File Structure

```
db/supabase/migrations/
  20260525_wqa_decision_v2.sql                    [new] tighten action constraint; add new columns + extend trigger; backfill old values

delivery/tna/  (agency repo)
  build_phase1_wqa.py                              [modify] emit new 7-action enum + logic_code into wqa_output

web/lib/
  wqa-decisions.ts                                 [modify] new types (Action7, Status, LogicCode); updated query helpers

web/app/properties/[slug]/pages/
  wqa-actions.ts                                   [modify] 8 new server actions (setAction, setStatus, clearDrift, setLogicNotes, setTargetUrl, verifyTargetUrl, clearActionOverride, clearTargetUrlOverride)

web/api/verify-url/
  route.ts                                         [new] Next.js route handler — live HTTP HEAD with redirect-following, returns status + chain

web/components/wqa/
  WqaActionChip.tsx                                [modify] 7-value dropdown + override indicator
  WqaStatusChip.tsx                                [new] 4-state status chip (Open/In Progress/Done/Drifted)
  WqaLogicCell.tsx                                 [new] logic_code monospace pill + tooltip
  AllUrlsTab.tsx                                   [modify] add Status + Logic columns + Logic filter chips
  HumanReviewTabs.tsx                              [modify] merges Evaluate/Review into single Investigate tab
  RedirectTab.tsx                                  [modify] add Verify button on rows (Tier-1 here; deeper Redirect UX is P5)
  ConsolidateTab.tsx                               [modify] add Verify button (same as Redirect)

web/components/
  UrlDrawer.tsx                                    [modify] new "Triage logic" section + Verify + drift banner
```

---

## Chunk 1: Schema migration + lib

### Task 1.1: Migration — extend wqa_decision

**Files:**
- Create: `db/supabase/migrations/20260525_wqa_decision_v2.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Pages action semantics overhaul (P2)
-- Spec: docs/superpowers/specs/2026-05-25-action-semantics-design.md

-- 1. Backfill: remap old action values BEFORE tightening the check.
--    Existing rows use the 10-value enum; we collapse to 7 + add logic_notes
--    captured from the existing `note` column where present.

update wqa_decision
   set action = case action
     when 'Evaluate'         then 'Investigate'
     when 'Leave as 404'     then 'Keep'
     when 'Non-addressable'  then 'Keep'
     when 'Non-indexable'    then 'Keep'
     else action  -- Optimize/Restore/Redirect/Consolidate/Remove/Investigate unchanged
   end
 where action in ('Evaluate','Leave as 404','Non-addressable','Non-indexable');

-- 2. Drop the old check constraint + install the new 7-value one.
alter table wqa_decision drop constraint if exists wqa_decision_action_check;
alter table wqa_decision
  add constraint wqa_decision_action_check
  check (action in (
    'Optimize','Restore','Redirect','Consolidate',
    'Remove','Keep','Investigate'
  ));

-- 3. Add new columns: status workflow + logic_notes + drift fields.
alter table wqa_decision
  add column if not exists status text not null default 'Open'
    check (status in ('Open','In Progress','Done','Drifted'));

alter table wqa_decision
  add column if not exists logic_notes text;

alter table wqa_decision
  add column if not exists last_implementation_check_at timestamptz;

alter table wqa_decision
  add column if not exists drift_reason text;

-- 4. Copy existing `note` into `logic_notes` where logic_notes is null.
update wqa_decision
   set logic_notes = note
 where logic_notes is null and note is not null;

-- 5. Indexes for the new query patterns.
create index if not exists idx_wqa_decision_property_status
  on wqa_decision (property_id, status);
create index if not exists idx_wqa_decision_drifted
  on wqa_decision (property_id) where status = 'Drifted';

-- 6. Extend the history trigger condition + extend the history table shape.
alter table wqa_decision_history
  add column if not exists status text,
  add column if not exists logic_notes text,
  add column if not exists drift_reason text;

create or replace function snapshot_wqa_decision() returns trigger
language plpgsql
as $$
begin
  insert into wqa_decision_history
    (decision_id, property_id, url, action, target_url, note,
     status, logic_notes, drift_reason, decided_by)
  values
    (old.id, old.property_id, old.url, old.action, old.target_url, old.note,
     old.status, old.logic_notes, old.drift_reason, old.decided_by);
  return new;
end;
$$;

drop trigger if exists trg_snapshot_wqa_decision on wqa_decision;
create trigger trg_snapshot_wqa_decision
  before update on wqa_decision
  for each row
  when (
       old.action       is distinct from new.action
    or old.target_url   is distinct from new.target_url
    or old.note         is distinct from new.note
    or old.status       is distinct from new.status
    or old.logic_notes  is distinct from new.logic_notes
    or old.drift_reason is distinct from new.drift_reason
  )
  execute function snapshot_wqa_decision();
```

- [ ] **Step 2: Apply migration**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app/db && \
  supabase db query --linked --file supabase/migrations/20260525_wqa_decision_v2.sql
```

If `supabase db query --linked` fails (CLI not logged in), apply via MCP `mcp__plugin_supabase_supabase__apply_migration` against project `ceyovawndjleprzjsjsr` — same fallback used in prior chunks (Phase 4, Phase 5).

- [ ] **Step 3: Verify migration**

```sql
-- Confirm new check constraint
SELECT con.consrc
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE rel.relname = 'wqa_decision' AND con.conname = 'wqa_decision_action_check';

-- Confirm new columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'wqa_decision'
ORDER BY ordinal_position;

-- Confirm row counts not lost
SELECT action, COUNT(*) FROM wqa_decision GROUP BY action ORDER BY action;
```

Expected: 7-value check constraint; new columns `status`, `logic_notes`, `last_implementation_check_at`, `drift_reason` present; no rows lost.

- [ ] **Step 4: Smoke-test the trigger**

```sql
-- Pick any existing row, update its status, check history captures it
WITH sample AS (
  SELECT id, status FROM wqa_decision LIMIT 1
)
UPDATE wqa_decision
   SET status = 'In Progress'
  FROM sample
 WHERE wqa_decision.id = sample.id;

SELECT COUNT(*) FROM wqa_decision_history
 WHERE snapshotted_at > now() - interval '1 minute';
-- Expect: at least 1
```

- [ ] **Step 5: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && \
  git add db/supabase/migrations/20260525_wqa_decision_v2.sql && \
  git commit -m "feat(db): wqa_decision action semantics v2 (7-action enum + status + logic_notes + drift)"
```

### Task 1.2: Lib — types + queries

**Files:**
- Modify: `web/lib/wqa-decisions.ts`

- [ ] **Step 1: Read the current file**

Open `web/lib/wqa-decisions.ts`. Confirm it exports an `Action` type with the 10-value enum + a `WqaDecisionRow` type + functions `getWqaDecisions`, `upsertWqaDecision`.

- [ ] **Step 2: Update types**

Replace the action enum + extend the row type:

```typescript
// At top of file
export type Action7 =
  | "Optimize" | "Restore" | "Redirect" | "Consolidate"
  | "Remove" | "Keep" | "Investigate";

export type WqaStatus = "Open" | "In Progress" | "Done" | "Drifted";

// Closed enum of logic codes (per spec)
export type LogicCode =
  | "revenue_critical" | "page_1_protect" | "striking_distance"
  | "has_visibility" | "utility_light_touch"
  | "404_with_inbound_traffic" | "404_no_value" | "5xx_server_error"
  | "redirect_to_relevant"
  | "non_primary_variant" | "duplicate_content"
  | "internal_links_no_external_signals" | "data_conflict" | "human_judgment"
  | "system_url" | "legitimate_keep";

export const LOGIC_CODE_LABELS: Record<LogicCode, string> = {
  revenue_critical: "Revenue-critical traffic + conversion value",
  page_1_protect: "Currently ranks position 1-10",
  striking_distance: "Currently ranks position 11-20",
  has_visibility: "Some impressions / clicks; lower priority",
  utility_light_touch: "Low-priority page, kept in working set",
  "404_with_inbound_traffic": "4xx response; historical traffic justifies restore",
  "404_no_value": "4xx response; no historical signal",
  "5xx_server_error": "Server error (5xx); not a content issue",
  redirect_to_relevant: "3xx response with relevant destination",
  non_primary_variant: "Canonical points elsewhere; this is a variant",
  duplicate_content: "Near-duplicate; merge into primary",
  internal_links_no_external_signals: "Linked internally; no GSC/GA/Ahrefs signal",
  data_conflict: "Data sources disagree",
  human_judgment: "Pipeline flagged for explicit operator review",
  system_url: "Fragment / param / utility URL; leave as is",
  legitimate_keep: "Strategic decision to leave alone",
};

// Mapping action → which logic_codes commonly apply
export const TYPICAL_LOGIC_FOR_ACTION: Record<Action7, LogicCode[]> = {
  Optimize: ["revenue_critical", "page_1_protect", "striking_distance", "has_visibility", "utility_light_touch"],
  Restore: ["404_with_inbound_traffic", "5xx_server_error"],
  Redirect: ["redirect_to_relevant"],
  Consolidate: ["non_primary_variant", "duplicate_content"],
  Remove: ["404_no_value"],
  Keep: ["system_url", "legitimate_keep"],
  Investigate: ["internal_links_no_external_signals", "data_conflict", "human_judgment"],
};

// Action color tokens (v2 design system)
export const ACTION_COLOR: Record<Action7, string> = {
  Optimize: "sky",
  Restore: "emerald",
  Redirect: "amber",
  Consolidate: "violet",
  Remove: "rose",
  Keep: "slate",
  Investigate: "neutral",
};

// Status color tokens
export const STATUS_COLOR: Record<WqaStatus, string> = {
  Open: "slate",
  "In Progress": "indigo",
  Done: "emerald",
  Drifted: "rose",
};
```

Then update `WqaDecisionRow` to include the new columns:

```typescript
export type WqaDecisionRow = {
  id: string;
  property_id: string;
  url: string;
  action: Action7;
  target_url: string | null;
  note: string | null;            // legacy; kept for back-compat
  status: WqaStatus;              // new
  logic_notes: string | null;     // new
  last_implementation_check_at: string | null;  // new
  drift_reason: string | null;    // new
  decided_by: string;
  decided_at: string;
  updated_at: string;
};
```

- [ ] **Step 3: Update upsert helper**

Find the existing `upsertWqaDecision` signature. Extend it to accept the new fields:

```typescript
export type WqaDecisionUpsert = {
  property_id: string;
  url: string;
  action?: Action7;
  target_url?: string | null;
  status?: WqaStatus;
  logic_notes?: string | null;
  drift_reason?: string | null;
  last_implementation_check_at?: string | null;
  decided_by: string;
};

export async function upsertWqaDecision(input: WqaDecisionUpsert): Promise<WqaDecisionRow> {
  const { property_id, url, decided_by, ...changes } = input;
  const { data, error } = await supabase
    .from("wqa_decision")
    .upsert(
      {
        property_id, url, decided_by,
        ...changes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "property_id,url" }
    )
    .select()
    .single();
  if (error) throw new Error(`upsertWqaDecision: ${error.message}`);
  return data as WqaDecisionRow;
}
```

- [ ] **Step 4: Verify type-check**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app/web && npx tsc --noEmit 2>&1 | tail -20
```

Expect: no errors related to `wqa-decisions.ts`. There may be cascading errors in consumers that still reference the old `Action` 10-value enum — those get fixed in the chip refactor (Task 3.1). For this task, the lib type-checks in isolation; consumer breakage is expected + tracked.

- [ ] **Step 5: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && \
  git add web/lib/wqa-decisions.ts && \
  git commit -m "feat(lib): wqa-decisions types — Action7 + WqaStatus + LogicCode + label maps"
```

---

## Chunk 2: Server actions + verify endpoint

### Task 2.1: Server actions

**Files:**
- Modify: `web/app/properties/[slug]/pages/wqa-actions.ts`

- [ ] **Step 1: Read existing file**

Open `web/app/properties/[slug]/pages/wqa-actions.ts`. Note the existing `setWqaAction` and any sibling actions; note the `requireWriteToken` + `getOperator` + `Ok | Err` pattern.

- [ ] **Step 2: Replace the file contents**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireWriteToken } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import { apiBase } from "@/lib/api-base";
import { supabase } from "@/lib/supabase";
import {
  upsertWqaDecision,
  type Action7,
  type WqaStatus,
} from "@/lib/wqa-decisions";

type Ok = { ok: true };
type Err = { ok: false; error: string };

async function resolveProperty(slug: string): Promise<{ id: string } | Err> {
  const { data, error } = await supabase
    .from("property")
    .select("id")
    .eq("slug", slug)
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Property not found" };
  return { id: data.id };
}

function bust(slug: string) {
  revalidatePath(`/properties/${slug}/pages`);
}

// ─── setAction ────────────────────────────────────────────────────────────
export async function setAction(
  slug: string, url: string, action: Action7,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const prop = await resolveProperty(slug);
  if ("error" in prop) return { ok: false, error: prop.error };
  try {
    await upsertWqaDecision({
      property_id: prop.id, url, action,
      decided_by: getOperator(),
    });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── setStatus ────────────────────────────────────────────────────────────
// Operator can set Open / In Progress / Done; Drifted is auto-only.
export async function setStatus(
  slug: string, url: string, status: WqaStatus,
): Promise<Ok | Err> {
  if (status === "Drifted") {
    return { ok: false, error: "Drifted is auto-set only; cannot manually transition" };
  }
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const prop = await resolveProperty(slug);
  if ("error" in prop) return { ok: false, error: prop.error };
  try {
    await upsertWqaDecision({
      property_id: prop.id, url, status,
      decided_by: getOperator(),
    });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── clearDrift ───────────────────────────────────────────────────────────
// Drifted → Open + clear drift_reason. Operator acknowledgement.
export async function clearDrift(slug: string, url: string): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const prop = await resolveProperty(slug);
  if ("error" in prop) return { ok: false, error: prop.error };
  try {
    await upsertWqaDecision({
      property_id: prop.id, url,
      status: "Open",
      drift_reason: null,
      decided_by: getOperator(),
    });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── setLogicNotes ────────────────────────────────────────────────────────
export async function setLogicNotes(
  slug: string, url: string, notes: string | null,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const prop = await resolveProperty(slug);
  if ("error" in prop) return { ok: false, error: prop.error };
  try {
    await upsertWqaDecision({
      property_id: prop.id, url,
      logic_notes: notes,
      decided_by: getOperator(),
    });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── setTargetUrl ─────────────────────────────────────────────────────────
export async function setTargetUrl(
  slug: string, url: string, targetUrl: string | null,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const prop = await resolveProperty(slug);
  if ("error" in prop) return { ok: false, error: prop.error };
  try {
    await upsertWqaDecision({
      property_id: prop.id, url,
      target_url: targetUrl,
      decided_by: getOperator(),
    });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── verifyTargetUrl ──────────────────────────────────────────────────────
// Live HTTP check against the target. Returns the chain + final status.
// On success, optionally flips status → Done.
export type VerifyResult = {
  ok: true;
  finalUrl: string;
  finalStatus: number;
  chain: { url: string; status: number }[];
  flippedStatusToDone: boolean;
} | { ok: false; error: string; chain?: { url: string; status: number }[] };

export async function verifyTargetUrl(
  slug: string, url: string, flipStatusOnSuccess: boolean,
): Promise<VerifyResult> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const prop = await resolveProperty(slug);
  if ("error" in prop) return { ok: false, error: prop.error };

  // Read the current target_url for this row
  const { data: row } = await supabase
    .from("wqa_decision")
    .select("target_url")
    .eq("property_id", prop.id)
    .eq("url", url)
    .single();
  if (!row?.target_url) return { ok: false, error: "No target_url set on this row" };

  // Call the Next route handler that does the live HTTP check
  const verifyEndpoint = `${apiBase()}/api/verify-url?target=${encodeURIComponent(row.target_url)}`;
  let chain: { url: string; status: number }[] = [];
  let finalUrl = row.target_url;
  let finalStatus = 0;
  try {
    const resp = await fetch(verifyEndpoint);
    if (!resp.ok) return { ok: false, error: `verify endpoint returned ${resp.status}` };
    const body = await resp.json();
    chain = body.chain ?? [];
    finalUrl = body.finalUrl ?? row.target_url;
    finalStatus = body.finalStatus ?? 0;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  // Stamp last_implementation_check_at on the row + optionally flip status
  const success = finalStatus >= 200 && finalStatus < 400;
  try {
    await upsertWqaDecision({
      property_id: prop.id, url,
      last_implementation_check_at: new Date().toISOString(),
      ...(flipStatusOnSuccess && success ? { status: "Done" as WqaStatus } : {}),
      decided_by: getOperator(),
    });
    bust(slug);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), chain };
  }

  return {
    ok: true,
    finalUrl,
    finalStatus,
    chain,
    flippedStatusToDone: flipStatusOnSuccess && success,
  };
}

// ─── clearActionOverride ──────────────────────────────────────────────────
// Delete the wqa_decision row entirely (so the joined view falls back to
// the pipeline's wqa_output action). This is the "trust the pipeline again"
// affordance from the spec.
export async function clearActionOverride(slug: string, url: string): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const prop = await resolveProperty(slug);
  if ("error" in prop) return { ok: false, error: prop.error };
  try {
    const { error } = await supabase
      .from("wqa_decision")
      .delete()
      .eq("property_id", prop.id)
      .eq("url", url);
    if (error) return { ok: false, error: error.message };
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── clearTargetUrlOverride ───────────────────────────────────────────────
export async function clearTargetUrlOverride(slug: string, url: string): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const prop = await resolveProperty(slug);
  if ("error" in prop) return { ok: false, error: prop.error };
  try {
    await upsertWqaDecision({
      property_id: prop.id, url,
      target_url: null,
      decided_by: getOperator(),
    });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
```

- [ ] **Step 3: Type-check + build**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app/web && npm run build 2>&1 | tail -10
```

There WILL be errors in UI components that still call the old `setWqaAction(...)` shape — those get fixed in Chunk 3 (chip refactor). For this task, the new file type-checks against its own dependencies.

If `setWqaAction` is called from existing UI code: search-and-rename to `setAction` first so the symbol resolves. Use:

```bash
grep -rn "setWqaAction" web/ --include="*.ts" --include="*.tsx"
```

Then rename usages with sed or manual edits. This unblocks the build.

- [ ] **Step 4: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && \
  git add web/app/properties/[slug]/pages/wqa-actions.ts && \
  git commit -m "feat(actions): wqa-actions v2 — setAction/setStatus/clearDrift/setLogicNotes/setTargetUrl/verifyTargetUrl/clearActionOverride/clearTargetUrlOverride"
```

### Task 2.2: Verify URL endpoint

**Files:**
- Create: `web/api/verify-url/route.ts`

- [ ] **Step 1: Write the route handler**

```typescript
import { NextRequest, NextResponse } from "next/server";

// GET /api/verify-url?target=https://example.com/some-page
// Follows redirect chain up to 10 hops; returns status of each hop.
//
// Used by Pages drawer's "Verify" button for Redirect + Consolidate
// target URLs. Confirms whether the configured target is live + reachable.

const MAX_HOPS = 10;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("target");
  if (!url) {
    return NextResponse.json({ ok: false, error: "missing ?target=" }, { status: 400 });
  }

  const chain: { url: string; status: number }[] = [];
  let current = url;

  for (let i = 0; i < MAX_HOPS; i++) {
    let resp: Response;
    try {
      resp = await fetch(current, {
        method: "HEAD",
        redirect: "manual",
        headers: { "User-Agent": "Skyward-Platform-Verify/1.0" },
      });
    } catch (e) {
      return NextResponse.json({
        ok: false,
        error: `fetch failed: ${e instanceof Error ? e.message : String(e)}`,
        chain,
      });
    }

    chain.push({ url: current, status: resp.status });

    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get("location");
      if (!loc) {
        return NextResponse.json({
          ok: false,
          error: `redirect without Location header at hop ${i}`,
          chain,
        });
      }
      current = new URL(loc, current).toString();
      continue;
    }

    // 2xx or 4xx/5xx — terminal
    return NextResponse.json({
      ok: true,
      finalUrl: current,
      finalStatus: resp.status,
      chain,
    });
  }

  return NextResponse.json({
    ok: false,
    error: `redirect chain too long (${MAX_HOPS}+ hops)`,
    chain,
  });
}
```

- [ ] **Step 2: Smoke-test locally**

If `npm run dev` is available, test:

```bash
curl 'http://localhost:3000/api/verify-url?target=https://example.com/'
```

Expected: JSON with `ok: true`, `finalStatus: 200`, single-entry chain.

Test a known 404:

```bash
curl 'http://localhost:3000/api/verify-url?target=https://example.com/this-does-not-exist'
```

Expected: `ok: true`, `finalStatus: 404`.

If `npm run dev` isn't running, defer the smoke test to post-deploy.

- [ ] **Step 3: Build verify**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app/web && npm run build 2>&1 | tail -5
```

Expected: clean compile; new route appears in the route table.

- [ ] **Step 4: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && \
  git add web/api/verify-url/route.ts && \
  git commit -m "feat(api): /api/verify-url route — live HTTP chain check (HEAD, ≤10 hops)"
```

---

## Chunk 3: UI — chips, columns, filters

### Task 3.1: WqaActionChip — 7-value dropdown + override indicator

**Files:**
- Modify: `web/components/wqa/WqaActionChip.tsx`

- [ ] **Step 1: Replace the file**

```tsx
"use client";

import { useTransition } from "react";
import { setAction, clearActionOverride } from "@/app/properties/[slug]/pages/wqa-actions";
import { ACTION_COLOR, type Action7 } from "@/lib/wqa-decisions";

const ACTIONS: Action7[] = [
  "Optimize", "Restore", "Redirect", "Consolidate", "Remove", "Keep", "Investigate",
];

const COLOR_CLASS: Record<string, string> = {
  sky: "bg-sky-100 text-sky-800",
  emerald: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  violet: "bg-violet-100 text-violet-800",
  rose: "bg-rose-100 text-rose-800",
  slate: "bg-slate-100 text-slate-700",
  neutral: "bg-zinc-100 text-zinc-700",
};

export function WqaActionChip({
  slug, url, pipelineAction, overrideAction,
}: {
  slug: string;
  url: string;
  pipelineAction: Action7 | null;
  overrideAction: Action7 | null;
}) {
  const [pending, start] = useTransition();
  const displayed = overrideAction ?? pipelineAction ?? "Investigate";
  const colorClass = COLOR_CLASS[ACTION_COLOR[displayed]] ?? COLOR_CLASS.neutral;
  const isOverride = overrideAction !== null && overrideAction !== pipelineAction;

  function handleChange(next: Action7) {
    if (next === pipelineAction) {
      // User picked the pipeline value — clear the override
      start(() => clearActionOverride(slug, url));
    } else {
      start(() => setAction(slug, url, next));
    }
  }

  return (
    <div
      className="inline-flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
      title={isOverride ? `Override of pipeline's "${pipelineAction}"` : "Pipeline-derived"}
    >
      <select
        value={displayed}
        disabled={pending}
        onChange={(e) => handleChange(e.target.value as Action7)}
        className={
          `text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded ${colorClass} ` +
          (pending ? "opacity-50 " : "") +
          (isOverride ? "ring-1 ring-foreground/30" : "")
        }
      >
        {ACTIONS.map((a) => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>
      {isOverride && <span className="text-[9px] text-muted-foreground">override</span>}
    </div>
  );
}
```

- [ ] **Step 2: Find all callers**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app/web && \
  grep -rn "WqaActionChip" . --include="*.tsx" | grep -v node_modules
```

Each caller passes `action: Action` today. After this change, they need to pass `pipelineAction` (from wqa_output) + `overrideAction` (from wqa_decision). Update each caller in the same commit to keep the build green.

- [ ] **Step 3: Update caller in AllUrlsTab (and any other tab that uses the chip)**

Existing caller pattern:
```tsx
<WqaActionChip slug={slug} url={row.url} action={row.action} />
```

New pattern:
```tsx
<WqaActionChip
  slug={slug}
  url={row.url}
  pipelineAction={row.pipelineAction /* from wqa_output left-join */}
  overrideAction={row.overrideAction /* from wqa_decision; null if no override */}
/>
```

Where the row data is assembled (likely in the `page.tsx` data fetch), join `wqa_output` (BQ) + `wqa_decision` (Supabase) so each row has both fields. If the existing fetch only returns `action` (the COALESCE'd value), split it into the two source fields. This may require touching the `loadWqaRows` function or its equivalent.

- [ ] **Step 4: Build**

```bash
cd web && npm run build 2>&1 | tail -5
```

Expected: clean. If callers haven't been fully updated, type errors will surface; fix all callers in this commit.

- [ ] **Step 5: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && \
  git add web/components/wqa/WqaActionChip.tsx web/components/wqa/AllUrlsTab.tsx web/components/wqa/*.tsx web/app/properties/[slug]/pages/page.tsx && \
  git commit -m "feat(ui): WqaActionChip 7-value + override indicator + caller updates"
```

### Task 3.2: WqaStatusChip — new

**Files:**
- Create: `web/components/wqa/WqaStatusChip.tsx`

- [ ] **Step 1: Write the chip**

```tsx
"use client";

import { useTransition } from "react";
import { setStatus, clearDrift } from "@/app/properties/[slug]/pages/wqa-actions";
import type { WqaStatus, Action7 } from "@/lib/wqa-decisions";

const STATUSES_MANUAL: WqaStatus[] = ["Open", "In Progress", "Done"];

const COLOR_CLASS: Record<WqaStatus, string> = {
  Open: "bg-slate-100 text-slate-700",
  "In Progress": "bg-indigo-100 text-indigo-800",
  Done: "bg-emerald-100 text-emerald-800",
  Drifted: "bg-rose-100 text-rose-800",
};

const HIDE_FOR_ACTIONS: Action7[] = ["Keep", "Investigate"];

export function WqaStatusChip({
  slug, url, value, action, driftReason,
}: {
  slug: string;
  url: string;
  value: WqaStatus;
  action: Action7;
  driftReason: string | null;
}) {
  const [pending, start] = useTransition();

  // Status semantic hidden for Keep + Investigate (no work to track)
  if (HIDE_FOR_ACTIONS.includes(action)) {
    return <span className="text-[10px] text-muted-foreground">—</span>;
  }

  if (value === "Drifted") {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(`Acknowledge drift?\n\n${driftReason ?? ""}`)) {
            start(() => clearDrift(slug, url));
          }
        }}
        disabled={pending}
        title={driftReason ?? "Drift detected"}
        className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded ${COLOR_CLASS.Drifted} ${pending ? "opacity-50" : ""}`}
      >
        Drifted
      </button>
    );
  }

  return (
    <select
      value={value}
      disabled={pending}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const next = e.target.value as WqaStatus;
        start(() => setStatus(slug, url, next));
      }}
      className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded ${COLOR_CLASS[value]} ${pending ? "opacity-50" : ""}`}
    >
      {STATUSES_MANUAL.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: Wire into AllUrlsTab**

Find `web/components/wqa/AllUrlsTab.tsx`. Add a Status column to the table. Place it between the existing Action and any other column. Render `<WqaStatusChip>` with the row's status (default "Open" if no wqa_decision row exists) + action + drift_reason.

- [ ] **Step 3: Build**

```bash
cd web && npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add web/components/wqa/WqaStatusChip.tsx web/components/wqa/AllUrlsTab.tsx && \
  git commit -m "feat(ui): WqaStatusChip + Status column on AllUrlsTab"
```

### Task 3.3: WqaLogicCell — visible inline + tooltip

**Files:**
- Create: `web/components/wqa/WqaLogicCell.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { LOGIC_CODE_LABELS, type LogicCode } from "@/lib/wqa-decisions";

export function WqaLogicCell({ code }: { code: LogicCode | null }) {
  if (!code) return <span className="text-[10px] text-muted-foreground">—</span>;
  const label = LOGIC_CODE_LABELS[code] ?? code;
  return (
    <span
      className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-50 border border-zinc-200 text-zinc-700"
      title={label}
    >
      {code}
    </span>
  );
}
```

- [ ] **Step 2: Wire into AllUrlsTab**

Add a Logic column between Status and the URL detail. Render `<WqaLogicCell code={row.logic_code} />`.

The `logic_code` comes from the BQ `wqa_output` join in the page's data fetch. If the join doesn't already include it, extend `loadWqaRows` (or equivalent) to select that column too.

- [ ] **Step 3: Build + commit**

```bash
cd web && npm run build 2>&1 | tail -3
cd /Users/paulskirbe/agency/repos/skyward-platform-app && \
  git add web/components/wqa/WqaLogicCell.tsx web/components/wqa/AllUrlsTab.tsx web/app/properties/[slug]/pages/page.tsx && \
  git commit -m "feat(ui): WqaLogicCell + Logic column on AllUrlsTab"
```

### Task 3.4: Filter chip strip — Action / Status / Logic / Override

**Files:**
- Modify: `web/components/wqa/AllUrlsTab.tsx`

- [ ] **Step 1: Add the 4-row chip strip above the existing filters**

Just below the existing Triage Funnel cards (if present) and above the table, render:

```tsx
function FilterChipStrip({ /* ... */ }) {
  // Pull filter state from URL via useSearchParams; multi-select per row;
  // URL-persisted via ?action= ?status= ?logic= ?override=
  // Use comma-separated values: ?action=Optimize,Restore
  // Default state: no params → no filtering
  // Each chip toggles on click; "All" chip clears that filter row.
  return (
    <div className="space-y-1 mb-3 text-xs">
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-muted-foreground w-16">Action:</span>
        {ACTIONS.map(a => <ChipToggle key={a} group="action" value={a} count={counts.action[a] ?? 0} />)}
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-muted-foreground w-16">Status:</span>
        {STATUSES.map(s => <ChipToggle key={s} group="status" value={s} count={counts.status[s] ?? 0} />)}
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-muted-foreground w-16">Logic:</span>
        <LogicDropdown />
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-muted-foreground w-16">Override:</span>
        <ChipToggle group="override" value="pipeline" label="Pipeline-only" />
        <ChipToggle group="override" value="operator" label="Operator overrode" />
      </div>
    </div>
  );
}
```

The actual implementation should follow the pattern from `web/components/keywords/discovery/UniverseTab.tsx`'s counter strip — already battle-tested in this codebase, click-to-toggle + URL-persisted.

- [ ] **Step 2: Wire filter state to table rendering**

In the parent `AllUrlsTab`, read the `?action= ?status= ?logic= ?override=` params and filter the rows array before rendering. Use `useMemo` for the filtered slice.

- [ ] **Step 3: Build + commit**

```bash
cd web && npm run build 2>&1 | tail -3
cd /Users/paulskirbe/agency/repos/skyward-platform-app && \
  git add web/components/wqa/AllUrlsTab.tsx && \
  git commit -m "feat(ui): filter chip strip on AllUrlsTab — Action/Status/Logic/Override"
```

### Task 3.5: Tab consolidation — drop Evaluate/Review tabs

**Files:**
- Modify: `web/components/wqa/HumanReviewTabs.tsx`
- Modify: `web/components/wqa/WqaTabs.tsx`

- [ ] **Step 1: Inspect HumanReviewTabs**

```bash
grep -nE "Evaluate|Review" web/components/wqa/HumanReviewTabs.tsx
```

The current file likely renders sub-tabs for Evaluate / Review / Investigate. After migration, all those rows have action='Investigate'. Replace with a single InvestigateTab that filters `r.action === "Investigate"` + groups by `logic_code` as the secondary axis.

- [ ] **Step 2: Rewrite or rename**

If `HumanReviewTabs.tsx` is small (<200 lines), rewrite it as a single InvestigateTab. Otherwise, rename it to `InvestigateTab.tsx` and remove the sub-tab nav, keeping only the Investigate body. Logic_code becomes a counter strip at the top of THIS tab too:

```
[ data_conflict 12 ] [ human_judgment 8 ] [ internal_links_no_external_signals 4 ]
```

Click each to filter to that logic_code within Investigate.

- [ ] **Step 3: Update WqaTabs registration**

Find where tabs are registered in `WqaTabs.tsx`. Remove "Evaluate" + "Review" entries if present. Ensure "Investigate" is the only judgment-bucket tab.

- [ ] **Step 4: Build + commit**

```bash
cd web && npm run build 2>&1 | tail -3
cd /Users/paulskirbe/agency/repos/skyward-platform-app && \
  git add web/components/wqa/HumanReviewTabs.tsx web/components/wqa/WqaTabs.tsx && \
  git commit -m "refactor(wqa): consolidate Evaluate/Review tabs into single Investigate; logic_code as secondary axis"
```

---

## Chunk 4: Drawer + Redirect/Consolidate verify

### Task 4.1: Drawer — Triage logic section + Verify button + drift banner

**Files:**
- Modify: `web/components/UrlDrawer.tsx`

- [ ] **Step 1: Locate the URL subject's render section**

`UrlDrawer.tsx` is the polymorphic universal drawer (subjects: url / keyword / cluster / content / refdomain). Find the `kind === 'url'` branch (the original URL drawer body).

- [ ] **Step 2: Add the Triage logic section**

Insert below the existing Phase 1 section + above the Execution section:

```tsx
<Section title="Triage logic">
  <Field label="Logic code">
    <span className="font-mono text-[11px]" title={LOGIC_CODE_LABELS[r.logic_code] ?? r.logic_code}>
      {r.logic_code ?? "—"}
    </span>
  </Field>
  {r.pipelineAction && r.overrideAction && r.pipelineAction !== r.overrideAction && (
    <Field label="Pipeline said">
      <span className="text-muted-foreground" title="Operator overrode the pipeline's decision">
        {r.pipelineAction}
      </span>
    </Field>
  )}
  <FieldRow label="Notes" editor={
    <LogicNotesEditor slug={propertySlug} url={r.url} value={r.logic_notes} />
  } />
</Section>
```

- [ ] **Step 3: Add the LogicNotesEditor component (inline in UrlDrawer.tsx or in a sibling file)**

```tsx
function LogicNotesEditor({
  slug, url, value,
}: { slug: string; url: string; value: string | null }) {
  const [local, setLocal] = useState(value ?? "");
  const [pending, start] = useTransition();
  function commit() {
    if (local !== (value ?? "")) {
      start(() => setLogicNotes(slug, url, local || null));
    }
  }
  return (
    <textarea
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      disabled={pending}
      className={`text-xs px-2 py-1 rounded border bg-transparent w-full min-h-[60px] ${pending ? "opacity-50" : ""}`}
      placeholder="Why this action? Add context that helps another operator understand the decision."
    />
  );
}
```

Imports needed at top:
```tsx
import { setLogicNotes, setTargetUrl, verifyTargetUrl, clearDrift, clearTargetUrlOverride } from "@/app/properties/[slug]/pages/wqa-actions";
import { LOGIC_CODE_LABELS } from "@/lib/wqa-decisions";
import { useState, useTransition } from "react";
```

- [ ] **Step 4: Add Target URL section (Redirect + Consolidate only)**

Insert below Triage logic:

```tsx
{(displayedAction === "Redirect" || displayedAction === "Consolidate") && (
  <Section title={displayedAction === "Redirect" ? "Redirect target" : "Canonical primary"}>
    <FieldRow label="Target" editor={
      <TargetUrlEditor slug={propertySlug} url={r.url} value={r.target_url} pipelineTarget={r.pipelineTargetUrl} />
    } />
    <Field label="Last verified">{r.last_implementation_check_at ?? "never"}</Field>
    <VerifyButton slug={propertySlug} url={r.url} disabled={!r.target_url} />
  </Section>
)}
```

Then add the editor + button:

```tsx
function TargetUrlEditor({ slug, url, value, pipelineTarget }: {
  slug: string; url: string; value: string | null; pipelineTarget: string | null;
}) {
  const [local, setLocal] = useState(value ?? "");
  const [pending, start] = useTransition();
  const isOverride = value !== null && value !== pipelineTarget;
  function commit() {
    if (local !== (value ?? "")) {
      start(() => setTargetUrl(slug, url, local || null));
    }
  }
  return (
    <div className="flex flex-col gap-1 w-full">
      <input
        type="url"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        disabled={pending}
        placeholder="https://..."
        className={`text-xs px-2 py-1 rounded border bg-transparent w-full ${pending ? "opacity-50" : ""}`}
      />
      {pipelineTarget && pipelineTarget !== local && (
        <span className="text-[10px] text-muted-foreground">
          Pipeline suggested: <span className="font-mono">{pipelineTarget}</span>
          {isOverride && " · operator override"}
        </span>
      )}
    </div>
  );
}

function VerifyButton({ slug, url, disabled }: { slug: string; url: string; disabled: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  function run() {
    start(async () => {
      const r = await verifyTargetUrl(slug, url, /* flipStatusOnSuccess */ true);
      if (!r.ok) {
        setResult(`✗ ${r.error}`);
      } else {
        const chainHops = r.chain.length;
        setResult(`${r.finalStatus} ${r.flippedStatusToDone ? "→ Done" : ""} (${chainHops} hop${chainHops === 1 ? "" : "s"})`);
      }
    });
  }
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={run}
        disabled={disabled || pending}
        className="text-xs px-2 py-1 rounded border bg-foreground text-background disabled:opacity-50"
      >
        {pending ? "Verifying…" : "Verify"}
      </button>
      {result && <span className="text-[11px] font-mono">{result}</span>}
    </div>
  );
}
```

- [ ] **Step 5: Add drift banner at top of drawer when Drifted**

Insert at the top of the URL-subject render, above existing sections:

```tsx
{r.status === "Drifted" && (
  <div className="bg-rose-50 border border-rose-200 rounded p-3 mb-4 text-xs">
    <div className="flex items-baseline justify-between">
      <div>
        <strong className="text-rose-900">Drift detected</strong>
        {r.drift_reason && (
          <span className="text-rose-800 ml-2">— {r.drift_reason}</span>
        )}
      </div>
      <button
        onClick={() => clearDrift(propertySlug, r.url)}
        className="text-xs px-2 py-1 rounded border border-rose-300 text-rose-900 hover:bg-rose-100"
      >
        Acknowledge
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 6: Build**

```bash
cd web && npm run build 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && \
  git add web/components/UrlDrawer.tsx && \
  git commit -m "feat(ui): drawer Triage logic + Target URL + Verify button + drift banner"
```

### Task 4.2: Add Verify button to Redirect + Consolidate tab rows

**Files:**
- Modify: `web/components/wqa/RedirectTab.tsx`
- Modify: `web/components/wqa/ConsolidateTab.tsx`

- [ ] **Step 1: Inspect row layout**

Find the row component in `RedirectTab.tsx`. Identify where the target_url is rendered.

- [ ] **Step 2: Add a Verify button next to the target cell**

For both Redirect + Consolidate tabs, render a small `<VerifyButton>` (extract the component from UrlDrawer.tsx into a shared component at `web/components/wqa/VerifyButton.tsx` so both tabs + drawer can use it). The button uses the row's `url` to look up the wqa_decision's `target_url` server-side, then calls `verifyTargetUrl`.

- [ ] **Step 3: Build + commit**

```bash
cd web && npm run build 2>&1 | tail -3
cd /Users/paulskirbe/agency/repos/skyward-platform-app && \
  git add web/components/wqa/RedirectTab.tsx web/components/wqa/ConsolidateTab.tsx web/components/wqa/VerifyButton.tsx && \
  git commit -m "feat(ui): inline Verify button on Redirect + Consolidate tab rows"
```

---

## Chunk 5: Python pipeline updates

### Task 5.1: Update build_phase1_wqa.py — emit 7-action + logic_code

**Files:**
- Modify: `/Users/paulskirbe/agency/delivery/tna/build_phase1_wqa.py`

- [ ] **Step 1: Read the file's current action assignment logic**

```bash
grep -nE "Optimize|Restore|Redirect|Consolidate|Remove|Investigate|Evaluate|Review|Leave as 404|Non-addressable|Non-indexable" /Users/paulskirbe/agency/delivery/tna/build_phase1_wqa.py | head -40
```

Identify every place an action string is assigned. Typical pattern: a `decide_action(row)` function or a series of `if/elif` rules in the triage loop.

- [ ] **Step 2: Add the LOGIC_CODE enum + map at the top of the file**

```python
# Pages action semantics v2 — keep in sync with web/lib/wqa-decisions.ts
ACTION7 = (
    "Optimize", "Restore", "Redirect", "Consolidate",
    "Remove", "Keep", "Investigate",
)

LOGIC_CODES = (
    "revenue_critical", "page_1_protect", "striking_distance",
    "has_visibility", "utility_light_touch",
    "404_with_inbound_traffic", "404_no_value", "5xx_server_error",
    "redirect_to_relevant",
    "non_primary_variant", "duplicate_content",
    "internal_links_no_external_signals", "data_conflict", "human_judgment",
    "system_url", "legitimate_keep",
)
```

- [ ] **Step 3: Refactor decide_action to return (action, logic_code)**

Existing return type was a single string (likely `"Optimize (revenue-critical)"` flavor). New return type: `tuple[str, str]` = (action, logic_code).

Find the decision rules + remap:

| Existing rule | New (action, logic_code) |
|---|---|
| Status 4xx + sessions > 100 | `("Restore", "404_with_inbound_traffic")` |
| Status 4xx + sessions ≤ 100 | `("Remove", "404_no_value")` |
| Status 5xx | `("Restore", "5xx_server_error")` |
| Status 3xx | `("Redirect", "redirect_to_relevant")` |
| Canonical points elsewhere | `("Consolidate", "non_primary_variant")` |
| Duplicate content detected | `("Consolidate", "duplicate_content")` |
| Top-3 ranking | `("Optimize", "page_1_protect")` |
| Top-10 ranking | `("Optimize", "page_1_protect")` |
| Position 11-20 | `("Optimize", "striking_distance")` |
| Has impressions, no top-20 | `("Optimize", "has_visibility")` |
| High traffic + conversions | `("Optimize", "revenue_critical")` |
| Internal links only, no external signal | `("Investigate", "internal_links_no_external_signals")` |
| GA4 / GSC / Ahrefs disagree | `("Investigate", "data_conflict")` |
| Fragment / param / utility URL | `("Keep", "system_url")` |
| Nothing matched | `("Investigate", "human_judgment")` |

Update each decision branch in the script. Replace `Evaluate`, `Review`, `Leave as 404`, `Non-addressable`, `Non-indexable` references everywhere they appear.

- [ ] **Step 4: Update the row-write that emits the action**

Find where the action is written into the output dataframe / xlsx / CSV. Add a sibling column `logic_code`. Update the column headers if a 12-tab workbook is being written.

```python
row["Action"] = action
row["Logic Code"] = logic_code
```

- [ ] **Step 5: Update the triage CSV output**

Find the per-site triage CSV write (referenced by `delivery/tna/{site}/phase-1-wqa/{Site}-triage-2026-05-20.csv` in earlier work). Ensure the CSV includes both Action and Logic Code columns + the action values are the new 7-value enum.

- [ ] **Step 6: Smoke-test the script**

```bash
cd /Users/paulskirbe/agency && \
  uv run python delivery/tna/build_phase1_wqa.py 2>&1 | tail -30
```

Expected: regenerates the 8 TNA workbooks + triage CSVs. Verify the CSV format:

```bash
head -2 /Users/paulskirbe/agency/delivery/tna/buscharter/phase-1-wqa/BusCharter-triage-*.csv
```

Look for the Action column to contain only 7 values + a Logic Code column.

- [ ] **Step 7: Commit (agency repo)**

```bash
cd /Users/paulskirbe/agency && \
  git add delivery/tna/build_phase1_wqa.py && \
  git commit -m "feat(wqa): emit Action7 + logic_code (Pages action semantics v2)"
```

### Task 5.2: Sister-client builders

**Files:**
- Modify: `/Users/paulskirbe/agency/delivery/gcs/phase-1-wqa/v2-2026-05-06/build_wqa.py`
- Modify: any other `delivery/{client}/phase-1-wqa/build_wqa.py` siblings

- [ ] **Step 1: Find sibling builders**

```bash
find /Users/paulskirbe/agency/delivery -name "build_wqa*.py" 2>&1
```

- [ ] **Step 2: Apply the same refactor pattern to each sibling**

The decision rules + enum + output columns get the same treatment. Use the same LOGIC_CODES + ACTION7 constants. Consider extracting them into a shared module at `~/agency/delivery/_shared/action_taxonomy.py` if there are 3+ sibling builders that would benefit.

- [ ] **Step 3: Commit**

```bash
cd /Users/paulskirbe/agency && \
  git add delivery/gcs delivery/_shared && \
  git commit -m "feat(wqa): apply Action7 + logic_code refactor to sister builders"
```

---

## Chunk 6: Backfill, deploy, verify

### Task 6.1: Backfill BQ wqa_output (if needed)

**Files:**
- (none in repo)

- [ ] **Step 1: Determine if BQ wqa_output has stale action values**

```sql
SELECT action, COUNT(*) FROM `data-hub-468216.SEOPipelineDev.wqa_output`
GROUP BY action ORDER BY action;
```

If the table contains old flavored values ("Optimize (revenue-critical)", "Evaluate", "Leave as 404", etc.) — that's data emitted by the Python pipeline before this overhaul. Two options:

A. **Re-run the Python pipeline** for each property, which writes fresh wqa_output rows under a new job_id with the new action enum + logic_code. Old rows stay (different job_id), but the app reads the latest job_id only.

B. **Update wqa_output in-place** with a one-shot remap SQL. Faster but less reversible.

Recommended: A. Re-run `build_phase1_wqa.py` for the 8 TNA sites + any other clients with active pipelines. The script now emits the new format; the next run becomes the new latest job_id.

- [ ] **Step 2: Re-run pipeline for all active clients**

```bash
cd /Users/paulskirbe/agency && \
  uv run python delivery/tna/build_phase1_wqa.py 2>&1 | tail -10
# Repeat for any other active client builders
```

- [ ] **Step 3: Verify in BQ**

```sql
SELECT action, COUNT(*)
FROM `data-hub-468216.SEOPipelineDev.wqa_output`
WHERE job_id = (
  SELECT job_id FROM `data-hub-468216.SEOPipelineDev.wqa_output`
   WHERE domain_id = 1 -- buscharter
   ORDER BY ingest_timestamp DESC LIMIT 1
)
GROUP BY action;
```

Expected: only the 7 new action values present.

### Task 6.2: PR + merge + production deploy + smoke

- [ ] **Step 1: Open PR**

```bash
cd /Users/paulskirbe/agency/repos/skyward-platform-app && \
  gh pr create --title "feat: Pages action semantics overhaul (P2)" --body "$(cat <<'EOF'
## Summary

Replaces the 10-value action enum on the Pages surface with a clean 7-action noun-decision model + separate status workflow + closed-set logic_code + override-preservation.

### What landed

- **Schema**: tightened `wqa_decision.action` to 7-value enum; added `status` (Open/In Progress/Done/Drifted), `logic_notes`, `last_implementation_check_at`, `drift_reason`. Extended history trigger to fire on the new columns.
- **Lib types**: `Action7`, `WqaStatus`, `LogicCode` + label maps + color tokens.
- **Server actions**: 8 actions covering status transitions, logic notes, target URL override, verification, and clearing overrides.
- **Verify endpoint**: `/api/verify-url` follows redirect chain (≤10 hops), returns final status.
- **UI**: `WqaActionChip` v2 with 7 values + override indicator. New `WqaStatusChip`. New `WqaLogicCell`. Filter chip strip (Action / Status / Logic / Override) with URL persistence. Drawer additions: Triage logic section, Target URL editor with Verify, drift banner.
- **Tab consolidation**: Evaluate + Review → single Investigate tab; logic_code is the secondary axis.
- **Python pipeline**: `build_phase1_wqa.py` + sibling client builders emit the new 7-action enum + logic_code.

### Migration

Single Supabase migration (`20260525_wqa_decision_v2.sql`) extends `wqa_decision`, remaps existing override rows from the old enum to the new (Evaluate → Investigate, Leave as 404 / Non-addressable / Non-indexable → Keep), and extends the history trigger. Old data preserved as `wqa_decision_history` snapshots.

### Spec

`docs/superpowers/specs/2026-05-25-action-semantics-design.md`

## Test plan

- [ ] Pages tab loads, 7 action chips visible in the Action column
- [ ] Click an action chip → dropdown shows 7 options → select different → row's action updates
- [ ] Selecting the pipeline's action value clears the override (override badge disappears)
- [ ] Status chip cycles Open → In Progress → Done
- [ ] Drifted status (when set by future drift detection) shows the rose drift banner in the drawer with Acknowledge button
- [ ] Logic column shows monospace code with hover tooltip
- [ ] Filter chip strip: click Action chips → table filters; URL persists `?action=`
- [ ] Drawer: Triage logic section shows code + override-of indicator + editable notes
- [ ] Drawer: Redirect/Consolidate rows show Target URL editor + Verify button
- [ ] Verify button hits `/api/verify-url`, shows chain + final status, flips status → Done on success
- [ ] Existing /keywords, /content, /authority surfaces still load (no regressions from drawer extension)

## Known followups (not in this PR)

1. Bulk edit on the table (P1)
2. Audit log reader in drawer using the history trigger (P1)
3. Column visibility toggle + per-column sort + filter (P3)
4. WQA Triage Funnel vs top-tabs IA reshuffle (P4)
5. Redirect tab depth + implementation-status summary (P5)
6. Action Plan + Implementation Checklist consolidation (P6)
7. Drift detection cron (I1)
8. Per-URL time series (I2)
9. ClickUp task push (I3)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Merge (admin if needed, per session pattern)**

```bash
gh pr merge <PR#> --merge --admin
```

- [ ] **Step 3: Promote to production**

```bash
git checkout main && git pull && vercel --prod --yes
```

- [ ] **Step 4: Verify production**

```bash
curl -sI "https://skyward-seo-platform.vercel.app/properties/buscharter/pages"
```

Expected: 200 or 307 → /auth (the existing auth-gate behavior).

```bash
curl -s "https://skyward-seo-platform.vercel.app/api/verify-url?target=https://buscharter.com.au/" | head
```

Expected: JSON with finalStatus 200 + chain length 1 (or 2 if there's a www-redirect).

- [ ] **Step 5: Sign in to production + manual smoke**

Open https://skyward-seo-platform.vercel.app/properties/buscharter/pages. Sign in (token in `web/.env.local`). Confirm:
- All URLs tab loads
- Action chips show 7 values
- Logic codes visible
- Status chips work
- Filter chip strip filters the table
- Click a row → drawer opens with Triage logic + Target URL (if Redirect/Consolidate)
- Verify button on a Redirect row returns a status + chain

---

## Self-Review

**1. Spec coverage** against `docs/superpowers/specs/2026-05-25-action-semantics-design.md`:

- ✓ 7-action enum (Task 1.1 check constraint, Task 1.2 type, Task 3.1 dropdown)
- ✓ 4-state status (Task 1.1 column, Task 1.2 type, Task 3.2 chip)
- ✓ 16 logic codes (Task 1.2 type + label map, Task 3.3 cell, Task 5.1 pipeline emission)
- ✓ logic_notes operator-editable (Task 1.1 column, Task 2.1 setLogicNotes, Task 4.1 drawer editor)
- ✓ target_url operator override (Task 4.1 drawer editor, Task 5.1 pipeline default)
- ✓ status workflow with Drifted auto-only (Task 2.1 setStatus + clearDrift, Task 3.2 chip enforces, Task 4.1 drawer banner)
- ✓ verify endpoint (Task 2.2)
- ✓ filter chip strip (Task 3.4)
- ✓ tab consolidation (Task 3.5)
- ✓ migration from old action values (Task 1.1 SQL backfill)
- ✓ Python pipeline updates (Tasks 5.1, 5.2)
- ✓ BQ pipeline data re-emission (Task 6.1)
- ✓ history trigger extended for new columns (Task 1.1)
- ✓ override-preservation pattern (Task 2.1 setAction + clearActionOverride; UI shows divergence via Task 3.1 indicator + Task 4.1 drawer "Pipeline said")

**2. Placeholder scan**: searched plan for "TBD", "TODO", "implement later" — none found. Task 3.4 (filter chip strip) describes the pattern + references the canonical example from `web/components/keywords/discovery/UniverseTab.tsx` instead of duplicating ~100 lines of chip-toggle implementation; that's a deliberate reference to a known-good pattern, not a placeholder.

**3. Type consistency**: `Action7` defined in Task 1.2 + used in 2.1, 3.1, 3.2, 4.1, 4.2. `WqaStatus` defined in 1.2 + used in 2.1, 3.2, 3.4, 4.1. `LogicCode` + `LOGIC_CODE_LABELS` defined in 1.2 + used in 3.3, 3.5, 4.1. Server action signatures defined in 2.1 + called from 3.1, 3.2, 3.5, 4.1, 4.2 — names + arg shapes match.

**Note on Chunk 5**: the Python pipeline updates touch the agency repo (`/Users/paulskirbe/agency/`), not the platform-app repo. Commits land in the agency repo's git. Be careful to switch directories when committing — the platform-app repo doesn't see those changes.

**Note on Chunk 6 Task 6.1**: BQ data refresh requires re-running the Python pipeline OR a one-shot SQL remap. Picked the former because it's idempotent + the pipeline now emits the new format natively. If a sister client doesn't have an active builder, the BQ data stays in the old format until manually remapped — flag this if it surfaces.
