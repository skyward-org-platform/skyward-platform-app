-- Client affinity field (2026-05-14 framework v1).
-- related_clients is a soft list of other client IDs that have a real-world
-- relationship — franchisor↔franchisee, holding↔subsidiary, agency↔white-label.
-- Deliberately NOT a foreign-key column so it sidesteps cycle/cascade pain
-- and matches the "no parent-child" framing.
--
-- See session-notes/2026-05-14-hierarchy-framework-v1.md.

alter table client
  add column if not exists related_clients uuid[] not null default '{}';

create index if not exists idx_client_related_clients
  on client using gin (related_clients);
