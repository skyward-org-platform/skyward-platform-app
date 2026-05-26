# Property Assistant — Design Spec

> Stateful, property-wide chatbot that helps the operator make changes
> across every surface of a property (WQA decisions, Brand DNA,
> Competitors, Seed Keywords, Project Brain, phase gates). Models
> Tryggvi's "stateful brain agent" pattern: one chatbot per property
> with persistent mission + memory + Project Brain side-effects, in
> contrast to the existing scope-limited Brand DNA Assistant which
> remains in place for Brand DNA editing.

**Date:** 2026-05-25
**Owner:** Paul Skirbe
**Status:** spec — pending plan + implementation

## Goal

A single conversational entry point on every property page that lets the
operator describe what they want to change in natural language and have
the system execute (with proposal-then-apply for bulk / destructive
operations). Replaces the current need to click into 6+ different tabs
and tables to manage WQA actions, status, Brand DNA fields, competitor
lists, seed keywords, phase approvals, and Project Brain entries.

## Out of scope (V1)

- Cross-property chat / strategic queries spanning multiple properties
- Voice input
- Image input
- Background agents that act without operator prompting (Tryggvi's
  "stateless pipeline agents" — those are a separate Phase-N project)
- Auto-rollback / undo log of recent operations
- Inline diff rendering for proposed bulk changes (defer to V1.5)

## Coexistence with the existing Brand DNA Assistant

Both chatbots ship side-by-side. Operator-visible differences:

| | Brand DNA Assistant (existing) | Property Assistant (new) |
|---|---|---|
| **Scope** | Brand DNA section editing only | Every property surface |
| **Tools** | 4 (update_brand_field, update_brand_items, add_brain_entry, research_brand_topic) | ~25, see Tool Catalog below |
| **Mount points** | Drawer on `/brand-dna/<section>` pages + prominent hero on `/brand-dna` overview | Floating button bottom-right on every `/properties/[slug]/*` route |
| **Chat history table** | `chat_message` (existing) | `chat_message` (existing) with new `chatbot_kind` column |
| **Tone** | Tactical brand DNA fill-in assistant | Strategic property brain |

The Brand DNA Assistant keeps doing exactly what it does today.
Operators discover the new Property Assistant via the persistent
floating button on every page. No data migration; the existing chat
history stays in place.

## Architecture

### Surface

- **Component:** `PropertyAssistantButton` mounted in the property
  layout at `web/app/properties/[slug]/layout.tsx`. Renders a circular
  floating button bottom-right with a subtle Skyward gradient + the
  Open Claude icon mark. Persistent across every sub-route.
- **Drawer:** click → 480px-wide drawer slides in from the right.
  Drawer contains:
  - Header strip: property name + "Property Assistant" label + a
    pill showing the current property's pipeline phase + a close ×
  - Mission box (collapsible, top): the current mission / strategic
    context the operator can edit (see Mission below)
  - Conversation history (scrolling)
  - Inline proposal cards rendered between messages
  - Input field with send + a tiny tool-trace expander
- **Persistence:** drawer stays open across in-property navigation;
  state held in a top-level client context so navigating between tabs
  doesn't drop the conversation. Closes only on explicit close.

### LLM

- **Model:** Anthropic Claude (same provider as Brand DNA Assistant —
  shared infrastructure, prompt caching, no provider migration).
- **Streaming:** standard streamed token response, same pattern as
  `/api/brand-dna/ask/[slug]/route.ts`.
- **Endpoint:** new `web/app/api/property/ask/[slug]/route.ts`. Reads
  conversation history, builds system prompt + tool defs, calls Claude,
  streams response.

### Mission

Beyond chat history, every conversation includes a persistent
**Mission** for the property — a short strategic statement loaded into
every system prompt. Example:

> Mission for buscharter: drive Phase 2 Tech SEO completion, then
> Phase 3 keyword strategy approval, before EOY 2026. Current focus is
> resolving the 449 Redirect URLs and pruning low-value content.

- **Storage:** new table `property_mission(property_id PK, body text,
  updated_by, updated_at)`. One row per property; updates overwrite.
- **UI:** collapsible box at the top of the drawer. Operator edits
  inline; saves on blur.
- **Default:** empty / placeholder text inviting the operator to set
  the mission.

### Project Brain side-effects

Per Tryggvi's pattern: as the operator converses, the model is
instructed (via system prompt) to opportunistically capture knowledge
into Project Brain when it would be useful for future conversations.
Categories per the existing `brain_entry.type` enum:

- `issue` — operator flagged a problem
- `working` — something that's confirmed to be working well
- `research` — finding from research / external source
- `preference` — operator stated strategic preference
- `strategy` — concrete plan / approach
- `insight` — observation or pattern noticed

Each entry includes a confidence score (0–1). The existing
`add_brain_entry` tool already accepts these fields — the Property
Assistant uses it the same way as the Brand DNA Assistant.

### Contextual awareness

Each turn includes a `route_context` block in the system prompt:

```
Operator is currently on: /properties/buscharter/pages?action=redirect
Currently selected: 12 URLs (bulk selection in progress)
Active filters: action=Redirect, status=Open
```

The model uses this to surface route-relevant tools first when
selecting tool calls. Implementation: client passes
`pathname + searchParams + selectedUrls` with each turn.

## Tool catalog

Three tiers — read / single-row write / bulk-or-destructive write.
Single-row writes execute immediately. Bulk + destructive writes
emit proposal payloads rendered as inline Apply cards (same pattern
as the existing Brand DNA Assistant's `update_brand_items`).

### Read tools (execute immediately)

| Tool | Description |
|---|---|
| `read_wqa_urls` | Query BQ wqa_output with filter criteria (action, status_code range, min_sessions, has_backlinks, has_refdomains, indexability, etc). Returns trimmed row dicts. |
| `read_wqa_decisions` | Operator overrides on `wqa_decision`, optionally filtered by status / action. |
| `read_brand_dna` | Current Brand DNA content per section. |
| `read_competitors` | property_competitor rows. |
| `read_seed_keywords` | property_seed_keyword rows. |
| `read_keyword_clusters` | Keyword cluster rows + counts. |
| `read_audit_docs` | audit_doc rows (link audits). |
| `read_property_meta` | Phase gate states, status, pipeline_phase, page counts. |
| `read_page_embedding_match` | Cosine match for a given URL — returns top-3 candidates with similarity scores. Same logic as the Redirect tab suggester. |
| `read_recent_activity` | Last N edits across brand_dna_section, wqa_decision, property_competitor, property_seed_keyword for the property. |

### Single-row write tools (execute immediately)

| Tool | Description |
|---|---|
| `set_wqa_action` | One URL, one action. Calls existing `setAction` server action. |
| `set_wqa_status` | One URL, one status. |
| `set_wqa_target_url` | One URL, one target URL. |
| `set_wqa_logic_notes` | One URL, free-text notes. |
| `update_brand_field` | (existing) One Brand DNA section, one field key, one value. |
| `add_competitor` | One competitor row. |
| `remove_competitor` | One competitor by ID. |
| `update_competitor` | One competitor by ID, partial patch. |
| `add_seed_keyword` | One seed keyword. |
| `remove_seed_keyword` | One by ID. |
| `update_seed_keyword` | One by ID, partial patch. |
| `add_brain_entry` | (existing) One Project Brain entry with type + confidence. |
| `update_mission` | Overwrite the property_mission body. |

### Bulk / destructive tools (propose-then-apply)

| Tool | Description |
|---|---|
| `bulk_set_wqa_action` | N URLs → one action. Renders an Apply card showing the URL count + action. Server action: existing `bulkSetAction`. |
| `bulk_set_wqa_status` | N URLs → one status. |
| `bulk_clear_action_override` | N URLs → revert to pipeline-derived. |
| `bulk_set_wqa_target_url` | N URLs → one canonicalized target (rare — mostly applies to HTTPS migration). |
| `bulk_add_competitors` | N competitor rows in one batch. |
| `bulk_add_seed_keywords` | N seed keyword rows in one batch. Existing `update_brand_items(section: "seed_keywords")` flow but renamed for clarity. |
| `approve_phase` | Single action but propagates downstream — proposed. |
| `import_seed_keywords_from_bq` | One-shot BQ → Supabase seed. Proposed because of irreversibility. |
| `import_competitors_from_bq_meta` | Same pattern as seed keywords. |

### Tool routing rule

The route handler categorizes each tool call by its `mutation_size`:

- `read` → execute, stream result back as a tool-result message.
- `single` → execute via the existing single-row server action, stream
  success/failure back inline (model continues the turn with the result).
- `bulk` → emit a `proposal` SSE event. The drawer renders an Apply card.
  Operator clicks Apply → server action dispatch (similar to
  `applyBrandDnaProposal`).

## Data flow

```
Operator types message
        ↓
PropertyAssistantDrawer (client component)
  • appends message to local state
  • POSTs to /api/property/ask/[slug] with the new message + history slice
        ↓
Route handler (server)
  • loads chat history from chat_message (filtered to chatbot_kind='property')
  • loads property_mission body
  • builds system prompt: mission + route_context + tool catalog +
    Tryggvi-style instruction to capture Project Brain entries
  • Anthropic streaming call with full tool catalog
        ↓
Stream chunks
  • text → display in conversation
  • tool_use{name: read_*} → execute immediately, append tool_result
    to the same Anthropic turn so the model can continue
  • tool_use{name: set_* | update_* | add_* | remove_*} → execute
    immediately, append tool_result, stream success/fail back inline
  • tool_use{name: bulk_* | approve_* | import_*} → emit a
    proposal SSE event; the model stops the turn (or continues with
    a 'proposal sent' confirmation message). Client renders Apply card.
        ↓
Operator clicks Apply on a proposal card
        ↓
applyPropertyAssistantProposal server action
  • dispatches to the existing bulk server actions (bulkSetAction, etc.)
  • revalidates affected paths
  • POSTs a follow-up message into the conversation: "Applied X."
        ↓
Conversation history persists every turn to chat_message
```

### Streaming protocol

Same Anthropic streaming format as the Brand DNA Assistant's route
handler. Proposal events use a custom SSE event name `proposal` so
the client can distinguish them from text deltas.

### Persistence

- **Chat history:** existing `chat_message` table, add column
  `chatbot_kind text not null default 'brand_dna'`. Migration backfills
  existing rows to `'brand_dna'`. Property Assistant inserts with
  `chatbot_kind='property'`. Queries filter accordingly.
- **Mission:** new table `property_mission(property_id PK, body text,
  updated_by, updated_at)`. RLS off (service-role same as other
  property-scoped tables).
- **Project Brain entries:** existing `brain_entry` table — no schema
  change. The model captures via the existing tool.

## Error handling

- **Tool failures:** any single-row write returning `{ok: false}` is
  surfaced inline as an error tool-result. The model can continue and
  try a different approach.
- **Apply failures on bulk:** the Apply card flips to an error state
  with the server-side message; the operator can dismiss + ask the
  model to retry with adjustments.
- **Hallucinated URLs:** the model can call `read_wqa_urls` with
  filters but cannot invoke a bulk write unless the URLs match real
  rows. The bulk action server-side validates URLs against the
  property's URL set and returns `{ok: false, error: "X unknown URLs"}`
  with the unknowns listed.
- **Tool list drift:** the model may attempt tools that don't exist in
  edge cases. The handler returns `{ok: false, error: "tool not
  available"}` and the model retries with an alternative.

## Testing

- **Unit:** each new server action (`bulkSetWqaAction` etc. already
  exist; new ones for cluster ops + phase gates need tests).
- **Integration:** route handler invoked with a canned conversation
  payload should produce the expected sequence of tool calls.
- **Smoke (manual):** buscharter as the test property. Walk through
  five canned operator asks:
  1. "How many Investigate URLs do I have?"
  2. "Set status to Done on the 5 lowest-traffic Investigate URLs"
  3. "Add competitor `wandersbus.com.au` as medium priority"
  4. "What's the mission?" + "Update the mission to: ..."
  5. "Approve Phase 1 WQA"

## Migration plan

This spec ships as **one logical project**, but the build proceeds in
three internal phases for incremental validation:

**Phase A — infrastructure** (one PR)

- Schema migrations: `chat_message.chatbot_kind`, new `property_mission`
- New route `/api/property/ask/[slug]`
- New components: `PropertyAssistantButton`, `PropertyAssistantDrawer`,
  `MissionBox`
- Wire into property layout
- Read tools only (no write tools yet)
- Smoke test: can have a conversation, model can fetch data, no writes
  yet land

**Phase B — single-row writes** (one PR)

- Single-row write tools wired
- Inline tool-result rendering
- Smoke test: model can update one URL's action, add one competitor

**Phase C — bulk + destructive** (one PR)

- Bulk write tools + proposal SSE event
- Apply card UI + `applyPropertyAssistantProposal` dispatcher
- Smoke test: model proposes a 50-URL bulk action, Apply executes it

## Open questions

None at spec time; everything above answered or marked deferred.

## References

- Tryggvi Raffin transcript on stateful brain agent:
  `operations/external-training/tryggvi-rafn/automated-seo-system-podcast-transcript.md`
- Existing Brand DNA Assistant: `web/components/BrandDnaAssistant.tsx`,
  `web/app/api/brand-dna/ask/[slug]/route.ts`,
  `web/app/properties/[slug]/brand-dna/proposal-actions.ts`
- Brand DNA Brain spec: `specs/brand-dna-brain-spec-v1.md`
- UI organization spec: `specs/ui-organization-spec-v1.md`
