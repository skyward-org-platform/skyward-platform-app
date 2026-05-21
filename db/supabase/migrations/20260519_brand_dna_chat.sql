-- Persistent chat history for the Brand DNA Assistant. One row per turn;
-- assistant turns carry the full blocks array (text + tool_use) so proposal
-- status (pending/applied/discarded/error) survives page reloads.
--
--   role = 'user'      → content = { text: "..." }
--   role = 'assistant' → content = { blocks: [{type, ...}, ...] }
--
-- Conversation ordering is by created_at (NOT NULL DEFAULT now()).

create table if not exists brand_dna_chat_message (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references property(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_brand_dna_chat_property_created
  on brand_dna_chat_message (property_id, created_at);
