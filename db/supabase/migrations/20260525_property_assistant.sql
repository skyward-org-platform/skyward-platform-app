-- property_assistant: schema for the property-wide chatbot.
--
-- Sibling tables to the existing brand_dna_chat_message (which stays
-- as-is for the BrandDnaAssistant). The PropertyAssistant is its own
-- conversation thread per property, distinct from Brand DNA chats:
--
--   property_chat_message - one row per turn (user or assistant)
--   property_mission      - one row per property holding strategic
--                           context loaded into every conversation

CREATE TABLE IF NOT EXISTS property_chat_message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES property(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  -- jsonb so we can store tool_use + tool_result blocks alongside text
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_chat_message_property_id_created
  ON property_chat_message (property_id, created_at);

CREATE TABLE IF NOT EXISTS property_mission (
  property_id uuid PRIMARY KEY REFERENCES property(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
