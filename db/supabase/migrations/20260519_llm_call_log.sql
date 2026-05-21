-- Per-call usage telemetry for every LLM invocation in the platform.
-- Token counts come from the Anthropic SDK response; cost is computed by
-- the Python /api/llm/calculate-cost endpoint via skyward-common's
-- skyward.llm.costs.calculate_cost (single source of truth for pricing).
--
-- Indexed by property_id so the Brand DNA Overview can surface "$X spent
-- researching this property" inline.

create table if not exists llm_call_log (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid references property(id) on delete set null,
  agent           text not null,        -- "assistant" | "research-fill" | "research-handoff"
  model           text not null,
  input_tokens    integer not null,
  output_tokens   integer not null,
  cost_usd        numeric(10, 6) not null,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists idx_llm_call_log_property_created
  on llm_call_log (property_id, created_at desc);

create index if not exists idx_llm_call_log_created
  on llm_call_log (created_at desc);
