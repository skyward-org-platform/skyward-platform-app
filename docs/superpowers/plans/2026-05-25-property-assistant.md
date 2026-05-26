# Property Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a property-wide stateful chatbot that lets the operator make changes across every property surface (WQA / Brand DNA / Competitors / Seed Keywords / Project Brain / phase gates) via natural language with propose-then-apply on bulk operations.

**Architecture:** Anthropic Claude streaming endpoint per property, called from a floating-button drawer on every `/properties/[slug]/*` route. Coexists with the existing scope-limited BrandDnaAssistant. Read + single-row tools execute immediately; bulk + destructive tools emit proposal SSE events that render as inline Apply cards.

**Tech Stack:** Next.js 16 App Router (RSC + server actions), Anthropic SDK, Supabase Postgres + pgvector, BigQuery (read-only data), TypeScript, Tailwind.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `web/lib/property-mission.ts` | Read / write the per-property mission string from `property_mission` |
| `web/lib/property-assistant/types.ts` | Shared types (ToolCategory, ToolResult, Proposal payload) |
| `web/lib/property-assistant/tools.ts` | Anthropic tool definitions (name + description + schema + category) |
| `web/lib/property-assistant/dispatchers.ts` | Server-side execution for read + single-row write tools |
| `web/lib/property-assistant/system-prompt.ts` | Build the system prompt with mission + route context + Project Brain instruction |
| `web/app/api/property/ask/[slug]/route.ts` | Streaming Anthropic endpoint, the main loop |
| `web/app/properties/[slug]/property-assistant-actions.ts` | `updateMission` + `applyPropertyAssistantProposal` server actions |
| `web/components/PropertyAssistantButton.tsx` | Floating button (client) |
| `web/components/PropertyAssistantDrawer.tsx` | Drawer + chat UI shell (client) |
| `web/components/PropertyAssistantMission.tsx` | Collapsible editable mission box (client) |
| `web/components/PropertyAssistantProposalCard.tsx` | Inline Apply card for bulk proposals (client) |

### Modified files

| Path | Change |
|---|---|
| `web/app/properties/[slug]/layout.tsx` | Mount `<PropertyAssistantButton />` at the end of the layout (drawer renders as portal inside the button) |
| `db/supabase/migrations/<TIMESTAMP>_property_assistant.sql` | New migration: `chat_message.chatbot_kind` column + `property_mission` table |

---

## Phase A — Infrastructure + Read Tools

Phase goal: drawer is openable on every property page, model can fetch property data via read tools, no writes wired yet. End of Phase A: working build, operator can have a useful Q&A conversation.

### Task 1: Schema migration

**Files:**
- Create: `db/supabase/migrations/20260525_property_assistant.sql`

- [ ] **Step 1: Write the migration**

Create the migration file with both schema changes:

```sql
-- property_assistant: schema for the property-wide chatbot.
--
-- Two changes:
--   1. chat_message.chatbot_kind - lets the existing BrandDnaAssistant
--      and the new PropertyAssistant share the same table without
--      crosstalk. Default 'brand_dna' so existing rows keep their
--      current identity.
--   2. property_mission - one row per property holding the strategic
--      context loaded into every PropertyAssistant conversation.

ALTER TABLE chat_message
  ADD COLUMN IF NOT EXISTS chatbot_kind text NOT NULL DEFAULT 'brand_dna'
    CHECK (chatbot_kind IN ('brand_dna', 'property'));

CREATE INDEX IF NOT EXISTS idx_chat_message_chatbot_kind
  ON chat_message (property_id, chatbot_kind, created_at);

CREATE TABLE IF NOT EXISTS property_mission (
  property_id uuid PRIMARY KEY REFERENCES property(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Apply the SQL via the Supabase MCP `apply_migration` tool with name `property_assistant`. Verify success.

- [ ] **Step 3: Verify schema**

Run via `mcp__plugin_supabase_supabase__execute_sql`:

```sql
SELECT column_name FROM information_schema.columns WHERE table_name='chat_message' AND column_name='chatbot_kind';
SELECT table_name FROM information_schema.tables WHERE table_name='property_mission';
```

Expected: both rows returned.

- [ ] **Step 4: Commit**

```bash
git add db/supabase/migrations/20260525_property_assistant.sql
git commit -m "db(property-assistant): chat_message.chatbot_kind + property_mission table"
```

---

### Task 2: Mission lib helpers

**Files:**
- Create: `web/lib/property-mission.ts`

- [ ] **Step 1: Write the lib helpers**

```typescript
// Per-property strategic context loaded into every PropertyAssistant
// conversation. One row per property in property_mission.

import { supabase } from "@/lib/supabase";

export type PropertyMission = {
  property_id: string;
  body: string;
  updated_by: string | null;
  updated_at: string;
};

export async function getMission(propertyId: string): Promise<PropertyMission | null> {
  const { data, error } = await supabase
    .from("property_mission")
    .select("*")
    .eq("property_id", propertyId)
    .maybeSingle();
  if (error) {
    console.error("getMission failed", error);
    return null;
  }
  return (data as PropertyMission) ?? null;
}

export async function upsertMission(
  propertyId: string,
  body: string,
  updatedBy: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("property_mission")
    .upsert(
      {
        property_id: propertyId,
        body,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "property_id" },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
```

- [ ] **Step 2: Verify by building**

Run: `cd web && npm run build 2>&1 | grep -A3 -iE "error|fail" | head -10`
Expected: no output (build clean)

- [ ] **Step 3: Commit**

```bash
git add web/lib/property-mission.ts
git commit -m "lib(property-mission): get + upsert helpers"
```

---

### Task 3: Shared types + tool definitions (read-only set)

**Files:**
- Create: `web/lib/property-assistant/types.ts`
- Create: `web/lib/property-assistant/tools.ts`

- [ ] **Step 1: Write types**

`web/lib/property-assistant/types.ts`:

```typescript
// Shared types for the Property Assistant. The Anthropic SDK doesn't
// export a clean Tool type we can extend, so we keep our own that
// adapts at the route boundary.

export type ToolCategory = "read" | "single-write" | "bulk-write";

export type ToolDef = {
  name: string;
  description: string;
  /** JSON schema for input. Anthropic uses { type: 'object', properties, required }. */
  input_schema: Record<string, unknown>;
  /** Routing category - the route handler uses this to decide whether
   *  to execute immediately + return a tool_result, or to emit a
   *  proposal SSE event and stop the turn. */
  category: ToolCategory;
};

export type RouteContext = {
  /** Current operator location, e.g. '/properties/buscharter/pages?action=redirect' */
  pathname: string;
  search: string;
  /** Optional - the URL set the operator has selected (from bulk
   *  selection on the WQA tables). Lets the model say
   *  'I see you have 12 URLs selected; do you want me to do X with them?' */
  selectedUrls?: string[];
};

export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export type ProposalPayload = {
  /** The tool name that generated this proposal - the dispatcher
   *  uses it to route the Apply click to the right server action. */
  tool: string;
  /** Original tool_use input the model emitted - the dispatcher
   *  feeds this back into the matching server action. */
  input: Record<string, unknown>;
  /** Human-readable summary the Apply card renders above the button.
   *  Built by the route handler when it intercepts a bulk tool call. */
  summary: string;
  /** Count of affected rows so the Apply button shows 'Apply (50)'. */
  count: number;
};
```

- [ ] **Step 2: Write tool defs - read-only set first**

`web/lib/property-assistant/tools.ts`:

```typescript
import type { ToolDef } from "./types";

// Read tools - execute immediately, return JSON to the model so it
// can continue the turn with the data in context. None of these mutate.

export const READ_TOOLS: ToolDef[] = [
  {
    name: "read_property_meta",
    description:
      "Return property metadata: name, primary_domain, status, pipeline_phase, phase gate approvals, page counts (total, by action). Always call this once early in a conversation to ground subsequent decisions.",
    input_schema: { type: "object", properties: {} },
    category: "read",
  },
  {
    name: "read_wqa_urls",
    description:
      "Query the WQA pipeline output for URLs matching filter criteria. Filters: action ('Optimize'|'Restore'|'Redirect'|'Consolidate'|'Remove'|'Keep'|'Investigate'), status_code_min/max, min_sessions, min_impressions, min_backlinks, min_refdomains, has_backlinks (bool), is_indexable (bool), limit (default 100, max 500). Returns each URL with status_code, title, sessions, impressions, refdomains, backlinks, indexability.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string" },
        status_code_min: { type: "number" },
        status_code_max: { type: "number" },
        min_sessions: { type: "number" },
        min_impressions: { type: "number" },
        min_backlinks: { type: "number" },
        min_refdomains: { type: "number" },
        has_backlinks: { type: "boolean" },
        is_indexable: { type: "boolean" },
        limit: { type: "number" },
      },
    },
    category: "read",
  },
  {
    name: "read_wqa_decisions",
    description:
      "Operator overrides on wqa_decision. Filters: status ('Open'|'In Progress'|'Done'|'Drifted'), action.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string" },
        action: { type: "string" },
      },
    },
    category: "read",
  },
  {
    name: "read_brand_dna",
    description:
      "Brand DNA section content. If 'section' provided, returns that one section's content jsonb. If omitted, returns all sections with content lengths so the model can decide what to fetch in detail.",
    input_schema: {
      type: "object",
      properties: { section: { type: "string" } },
    },
    category: "read",
  },
  {
    name: "read_competitors",
    description: "All property_competitor rows for the property.",
    input_schema: { type: "object", properties: {} },
    category: "read",
  },
  {
    name: "read_seed_keywords",
    description:
      "All property_seed_keyword rows for the property. Optionally filtered by intent or priority.",
    input_schema: {
      type: "object",
      properties: {
        intent: { type: "string" },
        priority: { type: "string" },
      },
    },
    category: "read",
  },
  {
    name: "read_keyword_clusters",
    description:
      "Keyword cluster summary - cluster names + keyword counts per cluster.",
    input_schema: { type: "object", properties: {} },
    category: "read",
  },
  {
    name: "read_audit_docs",
    description: "audit_doc rows (link audits etc) for the property.",
    input_schema: { type: "object", properties: {} },
    category: "read",
  },
  {
    name: "read_page_embedding_match",
    description:
      "Cosine-similarity search for a source URL. Returns top-3 most semantically similar URLs in page_embedding for this property, with similarity scores. Used to suggest redirect destinations.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
    category: "read",
  },
  {
    name: "read_recent_activity",
    description:
      "Most recent N edits across brand_dna_section, wqa_decision, property_competitor, property_seed_keyword. Default limit 20.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number" } },
    },
    category: "read",
  },
];

export const ALL_TOOLS: ToolDef[] = [...READ_TOOLS];
```

- [ ] **Step 3: Verify build**

Run: `cd web && npm run build 2>&1 | grep -A3 -iE "error|fail" | head -10`
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add web/lib/property-assistant/types.ts web/lib/property-assistant/tools.ts
git commit -m "lib(property-assistant): types + read-tool defs"
```

---

### Task 4: Read-tool dispatchers

**Files:**
- Create: `web/lib/property-assistant/dispatchers.ts`

- [ ] **Step 1: Implement read dispatcher**

`web/lib/property-assistant/dispatchers.ts`:

```typescript
// Server-side execution of read + single-write Property Assistant
// tools. The route handler calls dispatchToolCall(name, input,
// propertyId, propertySlug) and gets back a ToolResult.

import { supabase } from "@/lib/supabase";
import { getWqaForDomain } from "@/lib/wqa";
import { getWqaDecisions } from "@/lib/wqa-decisions";
import { getMission } from "@/lib/property-mission";
import type { ToolResult } from "./types";

type DispatchCtx = {
  propertyId: string;
  propertySlug: string;
  primaryDomain: string | null;
};

export async function dispatchToolCall(
  name: string,
  input: Record<string, unknown>,
  ctx: DispatchCtx,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "read_property_meta":
        return await readPropertyMeta(ctx);
      case "read_wqa_urls":
        return await readWqaUrls(input, ctx);
      case "read_wqa_decisions":
        return await readWqaDecisions(input, ctx);
      case "read_brand_dna":
        return await readBrandDna(input, ctx);
      case "read_competitors":
        return await readCompetitors(ctx);
      case "read_seed_keywords":
        return await readSeedKeywords(input, ctx);
      case "read_keyword_clusters":
        return await readKeywordClusters(ctx);
      case "read_audit_docs":
        return await readAuditDocs(ctx);
      case "read_page_embedding_match":
        return await readPageEmbeddingMatch(input, ctx);
      case "read_recent_activity":
        return await readRecentActivity(input, ctx);
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function readPropertyMeta(ctx: DispatchCtx): Promise<ToolResult> {
  const { data: prop } = await supabase
    .from("property")
    .select(
      "id, slug, name, primary_domain, status, pipeline_phase, " +
        "phase_0_approved_at, phase_1_approved_at, phase_2_approved_at, " +
        "phase_3_approved_at, phase_4_approved_at, phase_5_approved_at, " +
        "phase_6_approved_at",
    )
    .eq("id", ctx.propertyId)
    .single();
  if (!prop) return { ok: false, error: "Property not found" };
  const mission = await getMission(ctx.propertyId);
  const [pageCount, optimizeCount] = await Promise.all([
    supabase
      .from("page")
      .select("id", { count: "exact", head: true })
      .eq("property_id", ctx.propertyId),
    supabase
      .from("page")
      .select("id", { count: "exact", head: true })
      .eq("property_id", ctx.propertyId)
      .eq("audit_action", "optimize"),
  ]);
  return {
    ok: true,
    data: {
      ...prop,
      mission: mission?.body ?? null,
      page_count: pageCount.count ?? 0,
      optimize_count: optimizeCount.count ?? 0,
    },
  };
}

async function readWqaUrls(
  input: Record<string, unknown>,
  ctx: DispatchCtx,
): Promise<ToolResult> {
  if (!ctx.primaryDomain) return { ok: true, data: [] };
  const wqa = await getWqaForDomain(ctx.primaryDomain, "dev");
  if (!wqa || !("ok" in wqa) || !wqa.ok) {
    return { ok: true, data: [] };
  }
  const limit = Math.min(Number(input.limit ?? 100), 500);
  const filter = input as {
    action?: string;
    status_code_min?: number;
    status_code_max?: number;
    min_sessions?: number;
    min_impressions?: number;
    min_backlinks?: number;
    min_refdomains?: number;
    has_backlinks?: boolean;
    is_indexable?: boolean;
  };
  const matches = wqa.rows.filter((r) => {
    if (filter.status_code_min != null && (r.status_code ?? 0) < filter.status_code_min) return false;
    if (filter.status_code_max != null && (r.status_code ?? 0) > filter.status_code_max) return false;
    if (filter.min_sessions != null && (r.sessions ?? 0) < filter.min_sessions) return false;
    if (filter.min_impressions != null && (r.average_impressions ?? 0) < filter.min_impressions) return false;
    if (filter.min_backlinks != null && (r.backlinks ?? 0) < filter.min_backlinks) return false;
    if (filter.min_refdomains != null && (r.referring_domains ?? 0) < filter.min_refdomains) return false;
    if (filter.has_backlinks === true && (r.backlinks ?? 0) === 0) return false;
    if (filter.has_backlinks === false && (r.backlinks ?? 0) > 0) return false;
    if (filter.is_indexable === true && !(r.indexability ?? "").toLowerCase().includes("indexable")) return false;
    return true;
  }).slice(0, limit);
  return {
    ok: true,
    data: matches.map((r) => ({
      url: r.url,
      status_code: r.status_code,
      title: r.current_title,
      sessions: r.sessions,
      impressions: r.average_impressions,
      refdomains: r.referring_domains,
      backlinks: r.backlinks,
      indexability: r.indexability,
    })),
  };
}

async function readWqaDecisions(
  input: Record<string, unknown>,
  ctx: DispatchCtx,
): Promise<ToolResult> {
  const decisions = await getWqaDecisions(ctx.propertySlug);
  let filtered = decisions ?? [];
  const f = input as { status?: string; action?: string };
  if (f.status) filtered = filtered.filter((d) => d.status === f.status);
  if (f.action) filtered = filtered.filter((d) => d.action === f.action);
  return { ok: true, data: filtered };
}

async function readBrandDna(
  input: Record<string, unknown>,
  ctx: DispatchCtx,
): Promise<ToolResult> {
  const section = input.section as string | undefined;
  if (section) {
    const { data } = await supabase
      .from("brand_dna_section")
      .select("section, content, body, updated_at")
      .eq("property_id", ctx.propertyId)
      .eq("section", section)
      .maybeSingle();
    return { ok: true, data: data ?? null };
  }
  const { data } = await supabase
    .from("brand_dna_section")
    .select("section, content, body, updated_at")
    .eq("property_id", ctx.propertyId);
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      section: r.section,
      content_size: r.content ? Object.keys(r.content).length : 0,
      body_len: (r.body ?? "").length,
      updated_at: r.updated_at,
    })),
  };
}

async function readCompetitors(ctx: DispatchCtx): Promise<ToolResult> {
  const { data } = await supabase
    .from("property_competitor")
    .select("id, domain, priority, notes, source")
    .eq("property_id", ctx.propertyId)
    .order("priority", { ascending: true });
  return { ok: true, data: data ?? [] };
}

async function readSeedKeywords(
  input: Record<string, unknown>,
  ctx: DispatchCtx,
): Promise<ToolResult> {
  let q = supabase
    .from("property_seed_keyword")
    .select("id, keyword, category, seed_category, intent, priority, source")
    .eq("property_id", ctx.propertyId);
  if (input.intent) q = q.eq("intent", input.intent as string);
  if (input.priority) q = q.eq("priority", input.priority as string);
  const { data } = await q;
  return { ok: true, data: data ?? [] };
}

async function readKeywordClusters(ctx: DispatchCtx): Promise<ToolResult> {
  const { data } = await supabase
    .from("keyword_cluster")
    .select("id, name, keyword_count:keyword_cluster_member(count)")
    .eq("property_id", ctx.propertyId);
  return { ok: true, data: data ?? [] };
}

async function readAuditDocs(ctx: DispatchCtx): Promise<ToolResult> {
  const { data } = await supabase
    .from("audit_doc")
    .select("id, title, notes, generated_at")
    .eq("property_id", ctx.propertyId)
    .order("generated_at", { ascending: false });
  return { ok: true, data: data ?? [] };
}

async function readPageEmbeddingMatch(
  input: Record<string, unknown>,
  ctx: DispatchCtx,
): Promise<ToolResult> {
  // Reuse the existing suggestDestinationsForUrl helper to avoid
  // duplicating the embedding + RPC plumbing.
  const url = String(input.url ?? "");
  if (!url) return { ok: false, error: "url required" };
  const { suggestDestinationsForUrl } = await import("@/lib/redirect-suggester");
  const res = await suggestDestinationsForUrl(ctx.propertySlug, url, 3);
  return { ok: true, data: res };
}

async function readRecentActivity(
  input: Record<string, unknown>,
  ctx: DispatchCtx,
): Promise<ToolResult> {
  const limit = Math.min(Number(input.limit ?? 20), 50);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [dna, decisions, comps, seeds] = await Promise.all([
    supabase
      .from("brand_dna_section")
      .select("section, updated_at, updated_by")
      .eq("property_id", ctx.propertyId)
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(limit),
    supabase
      .from("wqa_decision")
      .select("url, action, status, updated_at, decided_by")
      .eq("property_id", ctx.propertyId)
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(limit),
    supabase
      .from("property_competitor")
      .select("domain, updated_at, updated_by")
      .eq("property_id", ctx.propertyId)
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(limit),
    supabase
      .from("property_seed_keyword")
      .select("keyword, updated_at, updated_by")
      .eq("property_id", ctx.propertyId)
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(limit),
  ]);
  return {
    ok: true,
    data: {
      brand_dna_edits: dna.data ?? [],
      wqa_decisions: decisions.data ?? [],
      competitor_edits: comps.data ?? [],
      seed_keyword_edits: seeds.data ?? [],
    },
  };
}
```

- [ ] **Step 2: Verify build**

Run: `cd web && npm run build 2>&1 | grep -A3 -iE "error|fail" | head -10`
Expected: no output. If TypeScript fails because `keyword_cluster_member(count)` syntax is wrong, simplify: replace with `keyword_count:keywords(count)` joined via the actual relationship (consult schema first via `mcp__plugin_supabase_supabase__execute_sql`).

- [ ] **Step 3: Commit**

```bash
git add web/lib/property-assistant/dispatchers.ts
git commit -m "lib(property-assistant): read tool dispatchers"
```

---

### Task 5: System prompt builder

**Files:**
- Create: `web/lib/property-assistant/system-prompt.ts`

- [ ] **Step 1: Write the builder**

`web/lib/property-assistant/system-prompt.ts`:

```typescript
import type { RouteContext } from "./types";

type PromptInput = {
  propertyName: string;
  propertyDomain: string | null;
  clientName: string | null;
  mission: string | null;
  route: RouteContext;
};

export function buildSystemPrompt(p: PromptInput): string {
  const sections: string[] = [];

  sections.push(
    `You are the Property Assistant for Skyward's SEO platform - a stateful, ` +
      `strategic chatbot scoped to a single property. You help the operator ` +
      `make changes across every surface of the property: WQA decisions, ` +
      `Brand DNA, competitors, seed keywords, project brain entries, ` +
      `keyword clusters, and phase gates.`,
  );

  sections.push(
    `Property: ${p.propertyName}` +
      (p.propertyDomain ? ` (${p.propertyDomain})` : "") +
      (p.clientName ? ` - client: ${p.clientName}` : ""),
  );

  if (p.mission && p.mission.trim().length > 0) {
    sections.push(`Mission for this property:\n${p.mission.trim()}`);
  } else {
    sections.push(
      `Mission for this property: (not set - if the operator describes their goal, ` +
        `offer to record it via update_mission)`,
    );
  }

  const ctxLines = [`Current route: ${p.route.pathname}`];
  if (p.route.search) ctxLines.push(`Query string: ${p.route.search}`);
  if (p.route.selectedUrls && p.route.selectedUrls.length > 0) {
    ctxLines.push(
      `Operator has ${p.route.selectedUrls.length} URLs selected: ${p.route.selectedUrls.slice(0, 5).join(", ")}` +
        (p.route.selectedUrls.length > 5 ? ", ..." : ""),
    );
  }
  sections.push(`Context:\n${ctxLines.join("\n")}`);

  sections.push(
    `Tool behavior:\n` +
      `- read_* tools fetch data immediately - call them aggressively. Always ` +
      `read_property_meta near the start of a conversation if you don't have ` +
      `that context yet.\n` +
      `- set_*/update_*/add_*/remove_* (single-row write) tools execute ` +
      `immediately when you call them. The next message you'll see is the ` +
      `result so you can confirm to the operator.\n` +
      `- bulk_* / approve_phase / import_* tools generate an Apply card the ` +
      `operator must click to confirm. Don't loop after emitting one of these - ` +
      `stop the turn and let the operator review.`,
  );

  sections.push(
    `Project Brain side-effect:\n` +
      `As the operator describes goals, problems, preferences, strategies, ` +
      `or new insights, opportunistically capture them via add_brain_entry with ` +
      `type in {issue, working, research, preference, strategy, insight} and ` +
      `confidence 0.0-1.0. This builds the property's institutional memory for ` +
      `future conversations. Don't ask permission - just file it.`,
  );

  sections.push(
    `Style: terse, decisive, no preamble. Lead with what changed or what you ` +
      `found. When proposing bulk changes show the count and a one-line ` +
      `justification before the proposal card appears.`,
  );

  return sections.join("\n\n");
}
```

- [ ] **Step 2: Verify build**

Run: `cd web && npm run build 2>&1 | grep -A3 -iE "error|fail" | head -10`
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add web/lib/property-assistant/system-prompt.ts
git commit -m "lib(property-assistant): system prompt builder"
```

---

### Task 6: Streaming Anthropic route handler (read-only loop)

**Files:**
- Create: `web/app/api/property/ask/[slug]/route.ts`

- [ ] **Step 1: Write the route handler**

```typescript
// Property Assistant streaming endpoint. Loops the Anthropic call up to
// MAX_TURNS times handling tool_use events:
//   - read_* tools: execute immediately, feed result back to the model
//   - single/bulk-write tools: not handled in Phase A
//
// Each text delta is streamed as an SSE 'delta' event. Tool calls are
// surfaced as 'tool_use' events so the client can show 'Searching...'.
// On completion the conversation history is persisted to chat_message
// with chatbot_kind='property'.

import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";
import { requireWriteToken } from "@/lib/auth";
import { recordLlmCall } from "@/lib/llm-usage";
import { ALL_TOOLS } from "@/lib/property-assistant/tools";
import { dispatchToolCall } from "@/lib/property-assistant/dispatchers";
import { buildSystemPrompt } from "@/lib/property-assistant/system-prompt";
import type { RouteContext } from "@/lib/property-assistant/types";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 3000;
const MAX_TURNS = 5;
export const maxDuration = 120;

function encode(payload: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

type RequestBody = {
  message: string;
  history: Array<{ role: "user" | "assistant"; content: unknown }>;
  route: RouteContext;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const authed = await requireWriteToken();
  if (!authed.ok) {
    return new Response(JSON.stringify(authed), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  const { slug } = await params;
  const body = (await req.json()) as RequestBody;

  const { data: prop } = await supabase
    .from("property")
    .select("id, name, primary_domain, client:client_id(name)")
    .eq("slug", slug)
    .single();
  if (!prop) {
    return new Response(JSON.stringify({ error: "Property not found" }), {
      status: 404,
    });
  }

  const propertyId = (prop as { id: string }).id;
  const primaryDomain = (prop as { primary_domain: string | null }).primary_domain;
  const propertyName = (prop as { name: string }).name;
  const clientName =
    ((prop as { client?: { name: string } | null }).client?.name) ?? null;

  // Load mission from property_mission
  const { data: missionRow } = await supabase
    .from("property_mission")
    .select("body")
    .eq("property_id", propertyId)
    .maybeSingle();
  const mission = (missionRow as { body: string } | null)?.body ?? null;

  const systemPrompt = buildSystemPrompt({
    propertyName,
    propertyDomain: primaryDomain,
    clientName,
    mission,
    route: body.route,
  });

  const anthropicTools = ALL_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool.InputSchema,
  }));

  const messages: Anthropic.MessageParam[] = [
    ...(body.history as Anthropic.MessageParam[]),
    { role: "user", content: body.message },
  ];

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const resp = await client.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: systemPrompt,
            tools: anthropicTools,
            messages,
          });

          await recordLlmCall({
            propertyId,
            model: MODEL,
            input_tokens: resp.usage.input_tokens,
            output_tokens: resp.usage.output_tokens,
            purpose: "property-assistant",
          }).catch(() => {});

          // Emit text content as delta event
          for (const block of resp.content) {
            if (block.type === "text") {
              controller.enqueue(encode({ event: "delta", text: block.text }));
            } else if (block.type === "tool_use") {
              controller.enqueue(
                encode({
                  event: "tool_use",
                  id: block.id,
                  name: block.name,
                  input: block.input,
                }),
              );
            }
          }

          // Append assistant turn to messages for the next loop
          messages.push({ role: "assistant", content: resp.content });

          if (resp.stop_reason !== "tool_use") break;

          // Execute every tool_use block in this turn
          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of resp.content) {
            if (block.type !== "tool_use") continue;
            const result = await dispatchToolCall(
              block.name,
              block.input as Record<string, unknown>,
              { propertyId, propertySlug: slug, primaryDomain },
            );
            controller.enqueue(
              encode({ event: "tool_result", id: block.id, result }),
            );
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          }
          messages.push({ role: "user", content: toolResults });
        }

        controller.enqueue(encode({ event: "done" }));

        // Persist the new turn (user message + final assistant content)
        // to chat_message. History is the client's source of truth so we
        // only store this single exchange.
        await supabase.from("chat_message").insert([
          {
            property_id: propertyId,
            chatbot_kind: "property",
            role: "user",
            content: body.message,
          },
          {
            property_id: propertyId,
            chatbot_kind: "property",
            role: "assistant",
            content: JSON.stringify(messages.slice(-1)[0].content),
          },
        ]);
      } catch (e) {
        controller.enqueue(
          encode({
            event: "error",
            message: e instanceof Error ? e.message : String(e),
          }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
    },
  });
}
```

- [ ] **Step 2: Verify build**

Run: `cd web && npm run build 2>&1 | grep -A5 -iE "error|fail" | head -20`
Expected: no output. If TypeScript complains about `Anthropic.Tool.InputSchema` shape, replace the cast with `as never` and let the SDK validate at runtime - Anthropic accepts plain JSONSchema objects.

- [ ] **Step 3: Commit**

```bash
git add web/app/api/property/ask/\[slug\]/route.ts
git commit -m "feat(property-assistant): streaming Anthropic route with read tools"
```

---

### Task 7: Drawer client component (UI shell only)

**Files:**
- Create: `web/components/PropertyAssistantDrawer.tsx`

- [ ] **Step 1: Write drawer component**

```tsx
"use client";

// Property Assistant drawer. Streams from /api/property/ask/[slug] and
// renders the conversation. Read tools are auto-executed server-side
// (we just show 'searching X' indicators). Bulk write tools (Phase C)
// will render an inline Apply card.

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolUses?: ToolUseRecord[] };

type ToolUseRecord = {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: { ok: boolean; error?: string; data?: unknown };
};

export function PropertyAssistantDrawer({
  open,
  onClose,
  propertySlug,
}: {
  open: boolean;
  onClose: () => void;
  propertySlug: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setError(null);
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    const assistantIdx = -1;
    setMessages((m) => [...m, { role: "assistant", text: "", toolUses: [] }]);
    setStreaming(true);

    try {
      const res = await fetch(`/api/property/ask/${propertySlug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({
              role: m.role,
              content: m.text,
            })),
          route: {
            pathname,
            search: search?.toString() ?? "",
          },
        }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = JSON.parse(line.slice(6));
          if (payload.event === "delta") {
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length + assistantIdx];
              if (last.role === "assistant") last.text += payload.text;
              return copy;
            });
          } else if (payload.event === "tool_use") {
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length + assistantIdx];
              if (last.role === "assistant") {
                last.toolUses = [
                  ...(last.toolUses ?? []),
                  { id: payload.id, name: payload.name, input: payload.input },
                ];
              }
              return copy;
            });
          } else if (payload.event === "tool_result") {
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length + assistantIdx];
              if (last.role === "assistant" && last.toolUses) {
                const idx = last.toolUses.findIndex((t) => t.id === payload.id);
                if (idx >= 0) last.toolUses[idx].result = payload.result;
              }
              return copy;
            });
          } else if (payload.event === "error") {
            setError(payload.message);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStreaming(false);
    }
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={
          "fixed top-0 right-0 h-screen w-[480px] bg-card border-l z-50 shadow-2xl flex flex-col transition-transform " +
          (open ? "translate-x-0" : "translate-x-full")
        }
      >
        <header className="px-4 py-3 border-b flex items-center justify-between">
          <div>
            <div className="text-[12px] font-semibold">Property Assistant</div>
            <div className="text-[10px] text-muted-foreground">
              {propertySlug}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[18px] text-muted-foreground hover:text-foreground px-2"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-[12px]">
          {messages.length === 0 && (
            <div className="text-muted-foreground italic">
              Ask me anything about this property. Try: "What's the status of Phase 1?"
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : ""}>
              <div
                className={
                  "inline-block max-w-[90%] px-3 py-2 rounded-lg whitespace-pre-wrap " +
                  (m.role === "user"
                    ? "bg-foreground text-background"
                    : "bg-muted/40 text-foreground")
                }
              >
                {m.text || (m.role === "assistant" && streaming ? "…" : "")}
              </div>
              {m.role === "assistant" && m.toolUses && m.toolUses.length > 0 && (
                <div className="mt-1 space-y-1">
                  {m.toolUses.map((tu) => (
                    <div
                      key={tu.id}
                      className="text-[10px] text-muted-foreground font-mono px-2"
                    >
                      {tu.result === undefined
                        ? `→ ${tu.name}...`
                        : tu.result.ok
                          ? `✓ ${tu.name}`
                          : `✗ ${tu.name}: ${tu.result.error}`}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {error && (
            <div className="text-[11px] text-rose-700 px-2">{error}</div>
          )}
        </div>

        <footer className="border-t px-3 py-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={streaming ? "Streaming..." : "Ask the assistant..."}
              disabled={streaming}
              className="flex-1 text-[12px] px-2.5 py-1.5 border rounded-md bg-card outline-none focus:border-foreground/40"
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              className="px-3 py-1.5 bg-foreground text-background text-[11.5px] font-medium rounded hover:opacity-90 disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </footer>
      </aside>
    </>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd web && npm run build 2>&1 | grep -A3 -iE "error|fail" | head -10`
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add web/components/PropertyAssistantDrawer.tsx
git commit -m "feat(property-assistant): drawer + streaming client (Phase A)"
```

---

### Task 8: Floating button + layout mount

**Files:**
- Create: `web/components/PropertyAssistantButton.tsx`
- Modify: `web/app/properties/[slug]/layout.tsx` — add `<PropertyAssistantButton />` mount

- [ ] **Step 1: Write button component**

`web/components/PropertyAssistantButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { PropertyAssistantDrawer } from "./PropertyAssistantDrawer";

export function PropertyAssistantButton({ propertySlug }: { propertySlug: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-30 size-12 rounded-full bg-foreground text-background shadow-lg hover:opacity-90 inline-flex items-center justify-center text-[20px] font-semibold"
        title="Property Assistant"
        aria-label="Open Property Assistant"
      >
        ✦
      </button>
      <PropertyAssistantDrawer
        open={open}
        onClose={() => setOpen(false)}
        propertySlug={propertySlug}
      />
    </>
  );
}
```

- [ ] **Step 2: Mount in property layout**

Read `web/app/properties/[slug]/layout.tsx`, find the closing `</div>` of the main wrapper (just before the `BrandDnaAssistantDrawer` or equivalent end of the layout), and add:

```tsx
import { PropertyAssistantButton } from "@/components/PropertyAssistantButton";

// ...inside the return, after the tab strip + children, before the closing div:
<PropertyAssistantButton propertySlug={slug} />
```

- [ ] **Step 3: Verify build**

Run: `cd web && npm run build 2>&1 | grep -A3 -iE "error|fail" | head -10`
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add web/components/PropertyAssistantButton.tsx web/app/properties/\[slug\]/layout.tsx
git commit -m "feat(property-assistant): floating button mounted on property layout"
```

---

### Task 9: Phase A smoke test

**Files:** (no files modified - manual verification)

- [ ] **Step 1: Push + wait for deploy**

```bash
git push
```

Wait until `vercel ls --prod` shows the latest commit as Ready (~2 min).

- [ ] **Step 2: Manual smoke test in production**

Open `https://skyward-seo-platform.vercel.app/properties/buscharter` in a browser.

Verify:
1. Floating ✦ button visible bottom-right
2. Click → drawer slides in from right with "Property Assistant" header
3. Type "How many Optimize URLs do I have?" and send
4. Observe:
   - Streaming `…` indicator while waiting
   - Eventually a `→ read_property_meta...` tool indicator
   - Then a `→ read_wqa_urls...` tool indicator
   - Then a text response with the count (e.g. "You have 269 Optimize URLs")
5. Type "What sections of Brand DNA are populated?" → should call `read_brand_dna` and list the sections

- [ ] **Step 3: Verify chat history persisted**

Via Supabase MCP `execute_sql`:

```sql
SELECT role, LEFT(content::text, 100) AS preview, created_at
FROM chat_message
WHERE chatbot_kind = 'property'
ORDER BY created_at DESC LIMIT 4;
```

Expected: at least 4 rows (2 user / 2 assistant) for the recent property-kind conversation.

- [ ] **Step 4: Tag Phase A complete (no extra commit)**

If steps 2-3 pass, Phase A is complete and ready for Phase B.

---

## Phase B — Single-Row Write Tools

Phase goal: model can execute single-row writes via tool calls (set one URL's action, update one Brand DNA field, etc). Writes happen immediately, no Apply card.

### Task 10: Single-row write tool definitions + dispatchers

**Files:**
- Modify: `web/lib/property-assistant/tools.ts` — add WRITE_SINGLE tools to ALL_TOOLS
- Modify: `web/lib/property-assistant/dispatchers.ts` — add single-write case branches

- [ ] **Step 1: Add WRITE_SINGLE_TOOLS to tools.ts**

In `web/lib/property-assistant/tools.ts`, append a new exported const before `ALL_TOOLS` and update the export:

```typescript
export const WRITE_SINGLE_TOOLS: ToolDef[] = [
  {
    name: "set_wqa_action",
    description: "Set the operator-override action on ONE URL. Use Action7: Optimize, Restore, Redirect, Consolidate, Remove, Keep, Investigate.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string" },
        action: { type: "string" },
      },
      required: ["url", "action"],
    },
    category: "single-write",
  },
  {
    name: "set_wqa_status",
    description: "Set status on ONE URL. Values: Open, In Progress, Done.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string" },
        status: { type: "string" },
      },
      required: ["url", "status"],
    },
    category: "single-write",
  },
  {
    name: "set_wqa_target_url",
    description: "Set redirect destination URL on ONE source URL.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string" },
        target_url: { type: "string" },
      },
      required: ["url", "target_url"],
    },
    category: "single-write",
  },
  {
    name: "set_wqa_logic_notes",
    description: "Set free-text logic notes on ONE URL.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string" },
        notes: { type: "string" },
      },
      required: ["url", "notes"],
    },
    category: "single-write",
  },
  {
    name: "update_brand_field",
    description: "Update a single field on a Brand DNA section. section is the enum key, field is the JSON key inside content, value is the new value.",
    input_schema: {
      type: "object",
      properties: {
        section: { type: "string" },
        field: { type: "string" },
        value: {},
      },
      required: ["section", "field", "value"],
    },
    category: "single-write",
  },
  {
    name: "add_competitor",
    description: "Add a single competitor. priority: high|medium|low.",
    input_schema: {
      type: "object",
      properties: {
        domain: { type: "string" },
        priority: { type: "string" },
        notes: { type: "string" },
      },
      required: ["domain", "priority"],
    },
    category: "single-write",
  },
  {
    name: "remove_competitor",
    description: "Remove a competitor by domain.",
    input_schema: {
      type: "object",
      properties: { domain: { type: "string" } },
      required: ["domain"],
    },
    category: "single-write",
  },
  {
    name: "add_seed_keyword",
    description: "Add ONE seed keyword. priority: high|medium|low; intent: informational|commercial|transactional|navigational.",
    input_schema: {
      type: "object",
      properties: {
        keyword: { type: "string" },
        category: { type: "string" },
        seed_category: { type: "string" },
        intent: { type: "string" },
        priority: { type: "string" },
      },
      required: ["keyword"],
    },
    category: "single-write",
  },
  {
    name: "remove_seed_keyword",
    description: "Remove ONE seed keyword by its exact keyword string.",
    input_schema: {
      type: "object",
      properties: { keyword: { type: "string" } },
      required: ["keyword"],
    },
    category: "single-write",
  },
  {
    name: "add_brain_entry",
    description: "Add a Project Brain entry capturing knowledge from the conversation. type: issue|working|research|preference|strategy|insight. confidence: 0.0-1.0.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
        confidence: { type: "number" },
      },
      required: ["type", "title", "body"],
    },
    category: "single-write",
  },
  {
    name: "update_mission",
    description: "Overwrite the property's strategic mission body.",
    input_schema: {
      type: "object",
      properties: { body: { type: "string" } },
      required: ["body"],
    },
    category: "single-write",
  },
];

export const ALL_TOOLS: ToolDef[] = [...READ_TOOLS, ...WRITE_SINGLE_TOOLS];
```

(Replace the existing `ALL_TOOLS` line.)

- [ ] **Step 2: Add dispatch branches**

In `web/lib/property-assistant/dispatchers.ts`, add the new case branches inside the `switch (name)` block. Reuse the existing single-row server actions:

```typescript
// At top, add imports:
import { setAction, setStatus, setTargetUrl, setLogicNotes } from "@/app/properties/[slug]/pages/wqa-actions";
import { upsertBrandDnaField } from "@/app/properties/[slug]/brand-dna/actions";
import { addCompetitor, removeCompetitor, addSeedKeyword, removeSeedKeyword } from "@/app/properties/[slug]/brand-dna/actions";
import { upsertMission } from "@/lib/property-mission";
import { createBrainEntry } from "@/app/properties/[slug]/project-brain/actions";
import { getOperator } from "@/lib/operator";

// New case branches:
case "set_wqa_action": {
  const r = await setAction(ctx.propertySlug, String(input.url), input.action as never);
  return r.ok ? { ok: true, data: { url: input.url, action: input.action } } : { ok: false, error: r.error };
}
case "set_wqa_status": {
  const r = await setStatus(ctx.propertySlug, String(input.url), input.status as never);
  return r.ok ? { ok: true, data: { url: input.url, status: input.status } } : { ok: false, error: r.error };
}
case "set_wqa_target_url": {
  const r = await setTargetUrl(ctx.propertySlug, String(input.url), String(input.target_url));
  return r.ok ? { ok: true, data: { url: input.url, target_url: input.target_url } } : { ok: false, error: r.error };
}
case "set_wqa_logic_notes": {
  const r = await setLogicNotes(ctx.propertySlug, String(input.url), String(input.notes));
  return r.ok ? { ok: true, data: { url: input.url } } : { ok: false, error: r.error };
}
case "update_brand_field": {
  const r = await upsertBrandDnaField(
    ctx.propertySlug,
    String(input.section),
    String(input.field),
    input.value,
  );
  return r.ok ? { ok: true, data: { sectionId: r.sectionId } } : { ok: false, error: r.error };
}
case "add_competitor": {
  const r = await addCompetitor(
    ctx.propertySlug,
    String(input.domain),
    input.priority as never,
    (input.notes as string | undefined) ?? null,
  );
  return r.ok ? { ok: true, data: { domain: input.domain } } : { ok: false, error: r.error };
}
case "remove_competitor": {
  // Need to look up by domain since removeCompetitor takes an id.
  const { data: row } = await supabase
    .from("property_competitor")
    .select("id")
    .eq("property_id", ctx.propertyId)
    .eq("domain", String(input.domain).toLowerCase())
    .maybeSingle();
  if (!row) return { ok: false, error: "Competitor not found" };
  const r = await removeCompetitor(ctx.propertySlug, (row as { id: string }).id);
  return r.ok ? { ok: true, data: { domain: input.domain } } : { ok: false, error: r.error };
}
case "add_seed_keyword": {
  const r = await addSeedKeyword(
    ctx.propertySlug,
    String(input.keyword),
    {
      category: (input.category as string) ?? null,
      seedCategory: (input.seed_category as string) ?? null,
      intent: (input.intent as never) ?? null,
      priority: ((input.priority as never) ?? "medium"),
    },
  );
  return r.ok ? { ok: true, data: { keyword: input.keyword } } : { ok: false, error: r.error };
}
case "remove_seed_keyword": {
  const { data: row } = await supabase
    .from("property_seed_keyword")
    .select("id")
    .eq("property_id", ctx.propertyId)
    .eq("keyword", String(input.keyword).toLowerCase())
    .maybeSingle();
  if (!row) return { ok: false, error: "Seed keyword not found" };
  const r = await removeSeedKeyword(ctx.propertySlug, (row as { id: string }).id);
  return r.ok ? { ok: true, data: { keyword: input.keyword } } : { ok: false, error: r.error };
}
case "add_brain_entry": {
  const r = await createBrainEntry(ctx.propertySlug, {
    type: String(input.type),
    title: String(input.title),
    body: String(input.body),
    source: "ai:property-assistant",
    confidence: typeof input.confidence === "number" ? input.confidence : null,
  });
  return r.ok ? { ok: true, data: { type: input.type } } : { ok: false, error: r.error };
}
case "update_mission": {
  const r = await upsertMission(ctx.propertyId, String(input.body), getOperator());
  return r.ok ? { ok: true, data: { body: input.body } } : { ok: false, error: r.error };
}
```

- [ ] **Step 3: Verify build**

Run: `cd web && npm run build 2>&1 | grep -A3 -iE "error|fail" | head -10`
Expected: no output. If imports fail because action signatures differ from what I described, read the actual file at `web/app/properties/[slug]/pages/wqa-actions.ts` + `web/app/properties/[slug]/brand-dna/actions.ts` and adapt the arguments.

- [ ] **Step 4: Commit**

```bash
git add web/lib/property-assistant/tools.ts web/lib/property-assistant/dispatchers.ts
git commit -m "feat(property-assistant): single-row write tools (Phase B)"
```

---

### Task 11: Phase B smoke test

**Files:** (no files modified)

- [ ] **Step 1: Push + wait for deploy**

```bash
git push
```

Wait until `vercel ls --prod` shows the latest commit Ready.

- [ ] **Step 2: Manual smoke test**

Open `https://skyward-seo-platform.vercel.app/properties/buscharter` → click ✦.

Try:
1. "Set the action on `https://buscharter.com.au/about-us/` to Optimize"
   - Expect a `→ set_wqa_action...` indicator → `✓ set_wqa_action` → "Done, set /about-us/ to Optimize."
2. "Add competitor `testcompete.com.au` as low priority with note 'demo'"
   - Expect `→ add_competitor...` → `✓` → confirmation message
3. Open the Competitors tab in another browser tab; verify the new row exists.
4. "Update the mission to: drive Phase 2 Tech SEO completion before EOY 2026"
   - Expect `→ update_mission...` → `✓` → confirmation message
5. Verify via Supabase MCP that `property_mission.body` has the new text.

- [ ] **Step 3: Verify Project Brain side-effect**

Try: "I think we should pause new content for next month because we need to fix technical SEO first."

Expect the model to call `add_brain_entry` with type=preference or strategy as a side-effect (the system prompt instructs this).

Verify via Supabase MCP:

```sql
SELECT type, title, LEFT(body, 100) FROM brain_entry
WHERE source = 'ai:property-assistant'
ORDER BY created_at DESC LIMIT 3;
```

---

## Phase C — Bulk + Propose-Then-Apply

Phase goal: bulk tool calls emit proposal SSE events. The drawer renders an inline Apply card. Clicking Apply executes the bulk action via `applyPropertyAssistantProposal`. Critical for safety on operations like "set status to Done on 250 URLs".

### Task 12: Bulk tool definitions

**Files:**
- Modify: `web/lib/property-assistant/tools.ts` — add BULK_TOOLS + update ALL_TOOLS

- [ ] **Step 1: Add BULK_TOOLS**

In `web/lib/property-assistant/tools.ts`, append before the final `ALL_TOOLS` line:

```typescript
export const BULK_TOOLS: ToolDef[] = [
  {
    name: "bulk_set_wqa_action",
    description: "Set action on MULTIPLE URLs. Generates an Apply card the operator clicks to confirm. Use when the operator wants to change ≥2 URLs at once.",
    input_schema: {
      type: "object",
      properties: {
        urls: { type: "array", items: { type: "string" } },
        action: { type: "string" },
        reason: { type: "string", description: "One-line justification shown in the proposal card" },
      },
      required: ["urls", "action", "reason"],
    },
    category: "bulk-write",
  },
  {
    name: "bulk_set_wqa_status",
    description: "Set status on MULTIPLE URLs. Generates an Apply card.",
    input_schema: {
      type: "object",
      properties: {
        urls: { type: "array", items: { type: "string" } },
        status: { type: "string" },
        reason: { type: "string" },
      },
      required: ["urls", "status", "reason"],
    },
    category: "bulk-write",
  },
  {
    name: "bulk_clear_action_override",
    description: "Revert N URLs back to the pipeline-derived action by deleting their wqa_decision rows. Apply card required.",
    input_schema: {
      type: "object",
      properties: {
        urls: { type: "array", items: { type: "string" } },
        reason: { type: "string" },
      },
      required: ["urls", "reason"],
    },
    category: "bulk-write",
  },
  {
    name: "bulk_add_seed_keywords",
    description: "Add N seed keywords at once. items: array of {keyword, category?, seed_category?, intent?, priority?}.",
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              keyword: { type: "string" },
              category: { type: "string" },
              seed_category: { type: "string" },
              intent: { type: "string" },
              priority: { type: "string" },
            },
            required: ["keyword"],
          },
        },
        reason: { type: "string" },
      },
      required: ["items", "reason"],
    },
    category: "bulk-write",
  },
  {
    name: "bulk_add_competitors",
    description: "Add N competitors at once. items: array of {domain, priority, notes?}.",
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              domain: { type: "string" },
              priority: { type: "string" },
              notes: { type: "string" },
            },
            required: ["domain", "priority"],
          },
        },
        reason: { type: "string" },
      },
      required: ["items", "reason"],
    },
    category: "bulk-write",
  },
  {
    name: "approve_phase",
    description: "Approve a phase gate (0-6). Downstream phases will start consuming this phase's data. Generates an Apply card because the effect propagates.",
    input_schema: {
      type: "object",
      properties: {
        phase: { type: "number", description: "0-6" },
        reason: { type: "string" },
      },
      required: ["phase", "reason"],
    },
    category: "bulk-write",
  },
];

export const ALL_TOOLS: ToolDef[] = [...READ_TOOLS, ...WRITE_SINGLE_TOOLS, ...BULK_TOOLS];
```

(Replace the existing final ALL_TOOLS line.)

- [ ] **Step 2: Verify build**

Run: `cd web && npm run build 2>&1 | grep -A3 -iE "error|fail" | head -10`
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add web/lib/property-assistant/tools.ts
git commit -m "lib(property-assistant): bulk tool defs"
```

---

### Task 13: Route handler emits proposal events

**Files:**
- Modify: `web/app/api/property/ask/[slug]/route.ts`

- [ ] **Step 1: Build a proposal-summary helper**

At the top of `route.ts`, add:

```typescript
import { ALL_TOOLS } from "@/lib/property-assistant/tools";
import type { ProposalPayload } from "@/lib/property-assistant/types";

const TOOLS_BY_NAME = new Map(ALL_TOOLS.map((t) => [t.name, t]));

function summarizeProposal(name: string, input: Record<string, unknown>): { summary: string; count: number } {
  if (name === "bulk_set_wqa_action") {
    const urls = (input.urls as string[]) ?? [];
    return { summary: `Set action to "${input.action}" on ${urls.length} URL${urls.length === 1 ? "" : "s"}. Reason: ${input.reason}`, count: urls.length };
  }
  if (name === "bulk_set_wqa_status") {
    const urls = (input.urls as string[]) ?? [];
    return { summary: `Set status to "${input.status}" on ${urls.length} URL${urls.length === 1 ? "" : "s"}. Reason: ${input.reason}`, count: urls.length };
  }
  if (name === "bulk_clear_action_override") {
    const urls = (input.urls as string[]) ?? [];
    return { summary: `Revert ${urls.length} URL${urls.length === 1 ? "" : "s"} to pipeline-derived action. Reason: ${input.reason}`, count: urls.length };
  }
  if (name === "bulk_add_seed_keywords") {
    const items = (input.items as unknown[]) ?? [];
    return { summary: `Add ${items.length} seed keyword${items.length === 1 ? "" : "s"}. Reason: ${input.reason}`, count: items.length };
  }
  if (name === "bulk_add_competitors") {
    const items = (input.items as unknown[]) ?? [];
    return { summary: `Add ${items.length} competitor${items.length === 1 ? "" : "s"}. Reason: ${input.reason}`, count: items.length };
  }
  if (name === "approve_phase") {
    return { summary: `Approve Phase ${input.phase}. Reason: ${input.reason}`, count: 1 };
  }
  return { summary: `Apply ${name}`, count: 0 };
}
```

- [ ] **Step 2: Branch on tool category in the loop**

Inside the route handler's existing tool-execution loop, replace:

```typescript
// Execute every tool_use block in this turn
const toolResults: Anthropic.ToolResultBlockParam[] = [];
for (const block of resp.content) {
  if (block.type !== "tool_use") continue;
  const result = await dispatchToolCall(
    block.name,
    block.input as Record<string, unknown>,
    { propertyId, propertySlug: slug, primaryDomain },
  );
  controller.enqueue(
    encode({ event: "tool_result", id: block.id, result }),
  );
  toolResults.push({
    type: "tool_result",
    tool_use_id: block.id,
    content: JSON.stringify(result),
  });
}
messages.push({ role: "user", content: toolResults });
```

With:

```typescript
const toolResults: Anthropic.ToolResultBlockParam[] = [];
let emittedProposal = false;
for (const block of resp.content) {
  if (block.type !== "tool_use") continue;
  const def = TOOLS_BY_NAME.get(block.name);
  if (def?.category === "bulk-write") {
    const { summary, count } = summarizeProposal(
      block.name,
      block.input as Record<string, unknown>,
    );
    const proposal: ProposalPayload = {
      tool: block.name,
      input: block.input as Record<string, unknown>,
      summary,
      count,
    };
    controller.enqueue(
      encode({ event: "proposal", id: block.id, proposal }),
    );
    toolResults.push({
      type: "tool_result",
      tool_use_id: block.id,
      content: `Proposal "${block.name}" emitted to the operator for review. Wait for their decision before continuing.`,
    });
    emittedProposal = true;
  } else {
    const result = await dispatchToolCall(
      block.name,
      block.input as Record<string, unknown>,
      { propertyId, propertySlug: slug, primaryDomain },
    );
    controller.enqueue(
      encode({ event: "tool_result", id: block.id, result }),
    );
    toolResults.push({
      type: "tool_result",
      tool_use_id: block.id,
      content: JSON.stringify(result),
    });
  }
}
messages.push({ role: "user", content: toolResults });

// After emitting a proposal, stop the loop and let the operator review.
if (emittedProposal) break;
```

- [ ] **Step 3: Verify build**

Run: `cd web && npm run build 2>&1 | grep -A3 -iE "error|fail" | head -10`
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add web/app/api/property/ask/\[slug\]/route.ts
git commit -m "feat(property-assistant): emit proposal SSE events for bulk tools"
```

---

### Task 14: Apply server action

**Files:**
- Create: `web/app/properties/[slug]/property-assistant-actions.ts`

- [ ] **Step 1: Write the apply dispatcher**

```typescript
"use server";

// Server action that turns a PropertyAssistant proposal payload into
// the corresponding bulk server action call. Mirrors the existing
// applyBrandDnaProposal pattern in brand-dna/proposal-actions.ts.

import { revalidatePath } from "next/cache";
import { requireWriteToken } from "@/lib/auth";
import {
  bulkSetAction,
  bulkSetStatus,
  bulkClearActionOverride,
} from "@/app/properties/[slug]/pages/wqa-actions";
import {
  importSeedKeywordsFromBq,
  importCompetitorsFromBqMeta,
} from "@/app/properties/[slug]/brand-dna/actions";
import { approvePhase } from "@/app/properties/[slug]/actions";
import { supabase } from "@/lib/supabase";
import { getOperator } from "@/lib/operator";
import type { ProposalPayload } from "@/lib/property-assistant/types";

type Ok = { ok: true; summary: string };
type Err = { ok: false; error: string };

export async function applyPropertyAssistantProposal(
  propertySlug: string,
  proposal: ProposalPayload,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;

  try {
    switch (proposal.tool) {
      case "bulk_set_wqa_action": {
        const urls = (proposal.input.urls as string[]) ?? [];
        const action = proposal.input.action as never;
        const r = await bulkSetAction(propertySlug, urls, action);
        if (!r.ok) return { ok: false, error: r.error };
        return { ok: true, summary: `Set ${r.updated} URLs to ${proposal.input.action}.` };
      }
      case "bulk_set_wqa_status": {
        const urls = (proposal.input.urls as string[]) ?? [];
        const status = proposal.input.status as never;
        const r = await bulkSetStatus(propertySlug, urls, status);
        if (!r.ok) return { ok: false, error: r.error };
        return { ok: true, summary: `Set ${r.updated} URLs to status ${proposal.input.status}.` };
      }
      case "bulk_clear_action_override": {
        const urls = (proposal.input.urls as string[]) ?? [];
        const r = await bulkClearActionOverride(propertySlug, urls);
        if (!r.ok) return { ok: false, error: r.error };
        return { ok: true, summary: `Cleared overrides on ${r.updated} URLs.` };
      }
      case "bulk_add_seed_keywords": {
        const items = (proposal.input.items as Array<Record<string, string>>) ?? [];
        // resolve property_id once
        const { data: prop } = await supabase.from("property").select("id").eq("slug", propertySlug).single();
        if (!prop) return { ok: false, error: "Property not found" };
        const operator = getOperator();
        const rows = items.map((it) => ({
          property_id: (prop as { id: string }).id,
          keyword: it.keyword.trim().toLowerCase(),
          category: it.category ?? null,
          seed_category: it.seed_category ?? null,
          intent: (it.intent as never) ?? null,
          priority: (it.priority as never) ?? "medium",
          source: "operator" as const,
          created_by: operator,
          updated_by: operator,
        })).filter((r) => r.keyword.length > 0);
        // Dedup against existing
        const { data: existing } = await supabase
          .from("property_seed_keyword")
          .select("keyword")
          .eq("property_id", (prop as { id: string }).id);
        const existingSet = new Set((existing ?? []).map((r: { keyword: string }) => r.keyword));
        const newRows = rows.filter((r) => !existingSet.has(r.keyword));
        if (newRows.length === 0) {
          return { ok: true, summary: `All ${rows.length} keywords already present.` };
        }
        const { error } = await supabase.from("property_seed_keyword").insert(newRows);
        if (error) return { ok: false, error: error.message };
        revalidatePath(`/properties/${propertySlug}/brand-dna/seed-keywords`);
        revalidatePath(`/properties/${propertySlug}/brand-dna`);
        revalidatePath(`/properties/${propertySlug}`, "layout");
        return { ok: true, summary: `Added ${newRows.length} seed keywords (${rows.length - newRows.length} duplicates skipped).` };
      }
      case "bulk_add_competitors": {
        const items = (proposal.input.items as Array<Record<string, string>>) ?? [];
        const { data: prop } = await supabase.from("property").select("id").eq("slug", propertySlug).single();
        if (!prop) return { ok: false, error: "Property not found" };
        const operator = getOperator();
        const rows = items.map((it) => ({
          property_id: (prop as { id: string }).id,
          domain: it.domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""),
          priority: (it.priority as never) ?? "medium",
          notes: it.notes ?? null,
          source: "operator" as const,
          created_by: operator,
          updated_by: operator,
        })).filter((r) => r.domain.length > 0);
        const { data: existing } = await supabase
          .from("property_competitor")
          .select("domain")
          .eq("property_id", (prop as { id: string }).id);
        const existingSet = new Set((existing ?? []).map((r: { domain: string }) => r.domain));
        const newRows = rows.filter((r) => !existingSet.has(r.domain));
        if (newRows.length === 0) {
          return { ok: true, summary: `All ${rows.length} competitors already present.` };
        }
        const { error } = await supabase.from("property_competitor").insert(newRows);
        if (error) return { ok: false, error: error.message };
        revalidatePath(`/properties/${propertySlug}/brand-dna/competitors`);
        revalidatePath(`/properties/${propertySlug}/brand-dna`);
        revalidatePath(`/properties/${propertySlug}`, "layout");
        return { ok: true, summary: `Added ${newRows.length} competitors (${rows.length - newRows.length} duplicates skipped).` };
      }
      case "approve_phase": {
        const { data: prop } = await supabase.from("property").select("id").eq("slug", propertySlug).single();
        if (!prop) return { ok: false, error: "Property not found" };
        const phaseIndex = Number(proposal.input.phase);
        const r = await approvePhase((prop as { id: string }).id, phaseIndex, propertySlug);
        if (!r.ok) return { ok: false, error: r.error };
        return { ok: true, summary: `Phase ${phaseIndex} approved.` };
      }
      default:
        return { ok: false, error: `Unknown bulk tool: ${proposal.tool}` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
```

- [ ] **Step 2: Verify build**

Run: `cd web && npm run build 2>&1 | grep -A3 -iE "error|fail" | head -10`
Expected: no output. If import paths fail, read the actual files and adapt.

- [ ] **Step 3: Commit**

```bash
git add web/app/properties/\[slug\]/property-assistant-actions.ts
git commit -m "feat(property-assistant): applyPropertyAssistantProposal dispatcher"
```

---

### Task 15: Proposal card UI

**Files:**
- Modify: `web/components/PropertyAssistantDrawer.tsx` — render proposal cards inline, wire Apply

- [ ] **Step 1: Add proposal state + render**

In `PropertyAssistantDrawer.tsx`, update the Message type and rendering:

```typescript
import { applyPropertyAssistantProposal } from "@/app/properties/[slug]/property-assistant-actions";

// Update Message type:
type Message =
  | { role: "user"; text: string }
  | {
      role: "assistant";
      text: string;
      toolUses?: ToolUseRecord[];
      proposals?: ProposalRecord[];
    };

type ProposalRecord = {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  summary: string;
  count: number;
  state: "pending" | "applying" | "applied" | "error";
  result?: string;
};
```

Inside the SSE loop, add a new event branch:

```typescript
} else if (payload.event === "proposal") {
  setMessages((m) => {
    const copy = [...m];
    const last = copy[copy.length + assistantIdx];
    if (last.role === "assistant") {
      last.proposals = [
        ...(last.proposals ?? []),
        {
          id: payload.id,
          tool: payload.proposal.tool,
          input: payload.proposal.input,
          summary: payload.proposal.summary,
          count: payload.proposal.count,
          state: "pending",
        },
      ];
    }
    return copy;
  });
}
```

Inside the message render, after the `toolUses` map, add:

```tsx
{m.role === "assistant" && m.proposals && m.proposals.length > 0 && (
  <div className="mt-2 space-y-2">
    {m.proposals.map((p) => (
      <ProposalCard
        key={p.id}
        proposal={p}
        propertySlug={propertySlug}
        onUpdate={(state, result) => {
          setMessages((msgs) => {
            const copy = [...msgs];
            for (const msg of copy) {
              if (msg.role !== "assistant" || !msg.proposals) continue;
              const idx = msg.proposals.findIndex((x) => x.id === p.id);
              if (idx >= 0) {
                msg.proposals[idx] = { ...msg.proposals[idx], state, result };
              }
            }
            return copy;
          });
        }}
      />
    ))}
  </div>
)}
```

Add the ProposalCard component at the bottom of the file:

```tsx
function ProposalCard({
  proposal,
  propertySlug,
  onUpdate,
}: {
  proposal: ProposalRecord;
  propertySlug: string;
  onUpdate: (state: ProposalRecord["state"], result?: string) => void;
}) {
  const handleApply = async () => {
    onUpdate("applying");
    const res = await applyPropertyAssistantProposal(propertySlug, {
      tool: proposal.tool,
      input: proposal.input,
      summary: proposal.summary,
      count: proposal.count,
    });
    if (res.ok) {
      onUpdate("applied", res.summary);
    } else {
      onUpdate("error", res.error);
    }
  };
  const handleDiscard = () => onUpdate("error", "Discarded by operator.");

  return (
    <div className="border rounded-md px-3 py-2 bg-card text-[11px]">
      <div className="font-semibold mb-1 text-[11.5px]">
        Proposal: {proposal.tool}
      </div>
      <div className="text-muted-foreground leading-snug mb-2">
        {proposal.summary}
      </div>
      {proposal.state === "pending" && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleApply}
            className="px-2 py-1 bg-emerald-600 text-white rounded text-[11px] hover:bg-emerald-700"
          >
            Apply ({proposal.count})
          </button>
          <button
            type="button"
            onClick={handleDiscard}
            className="px-2 py-1 border rounded text-[11px] hover:bg-muted/50"
          >
            Discard
          </button>
        </div>
      )}
      {proposal.state === "applying" && (
        <div className="text-muted-foreground italic">Applying...</div>
      )}
      {proposal.state === "applied" && (
        <div className="text-emerald-700">✓ {proposal.result}</div>
      )}
      {proposal.state === "error" && (
        <div className="text-rose-700">✗ {proposal.result}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd web && npm run build 2>&1 | grep -A3 -iE "error|fail" | head -10`
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add web/components/PropertyAssistantDrawer.tsx
git commit -m "feat(property-assistant): proposal card UI + Apply dispatcher wiring"
```

---

### Task 16: Phase C smoke test

**Files:** (no files modified)

- [ ] **Step 1: Push + wait for deploy**

```bash
git push
```

Wait for the latest commit to be Ready in `vercel ls --prod`.

- [ ] **Step 2: Manual smoke test**

Open `https://skyward-seo-platform.vercel.app/properties/buscharter` → ✦.

Try:

1. **Bulk action change:**
   "Find all 4xx Optimize URLs with no backlinks and set their action to Remove."
   Expect:
   - `→ read_wqa_urls...` (reads with filters)
   - Model summarizes count
   - `bulk_set_wqa_action` proposal card appears with "Set action to Remove on N URLs. Reason: ..."
   - Click `Apply (N)` → "Applying..." → "✓ Set N URLs to Remove."
   - Open the Pages tab → verify those URLs are now Remove.

2. **Bulk status change:**
   "Mark all the Restore URLs as In Progress."
   - Similar flow.

3. **Phase approval:**
   "Approve Phase 1 WQA."
   - Expect an `approve_phase` proposal card with phase=1.
   - Click Apply → "Phase 1 approved."
   - Open the property hero → Phase 1 cell now green.

4. **Discard flow:**
   "Add 5 competitors: foo.com, bar.com, baz.com, qux.com, quux.com all high priority."
   - Expect a `bulk_add_competitors` proposal card.
   - Click Discard → "✗ Discarded by operator."
   - Verify nothing was added in the Competitors tab.

If all four flows work, Phase C is complete.

---

## Self-Review Checklist (do before declaring plan complete)

- [ ] **Spec coverage:**
  - Architecture (drawer + button + endpoint) → Tasks 6-8 ✓
  - Mission concept → Tasks 1, 2, 5, 6, 10 ✓
  - Project Brain side-effects → Task 5 (system prompt), Task 10 (`add_brain_entry` tool) ✓
  - Contextual awareness (route_context) → Task 5, 6, 7 ✓
  - Tool catalog (read/single/bulk) → Tasks 3, 10, 12 ✓
  - Tool routing rule → Task 13 ✓
  - Chat namespacing (chatbot_kind) → Task 1, 6 ✓
  - Apply dispatcher → Task 14, 15 ✓
  - Smoke tests covering all 5 spec examples → Tasks 9, 11, 16 ✓

- [ ] **Placeholder scan:** No "TBD" / "fill in details" / "similar to Task N" / vague error handling instructions. Every step has concrete code.

- [ ] **Type consistency:** `ProposalPayload`, `ToolDef`, `ToolResult`, `DispatchCtx`, `RouteContext` referenced consistently. Server actions (`setAction`, `setStatus`, `addCompetitor`, etc.) use the actual signatures from the existing wqa-actions.ts + brand-dna/actions.ts files. The plan flags that the engineer should read those files and adapt if signatures don't match (Tasks 10, 14).

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-25-property-assistant.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best fit since this plan has 16 tasks across 3 phases with clear boundaries.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Heavier on this session's context.

**Which approach?**
