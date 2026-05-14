-- Property hierarchy extensions (2026-05-14 framework v1).
-- Adds:
--   url_prefix          — subpath when two properties share a domain
--                         (e.g. kitchenguard.com root vs. kitchenguard.com/provo)
--   parent_property_id  — Brand DNA inheritance link; may cross clients
--   status += 'inactive' — monitored but not actively worked
--   (primary_domain, url_prefix) — uniqueness with NULLS NOT DISTINCT
--
-- See session-notes/2026-05-14-hierarchy-framework-v1.md.

alter table property
  add column if not exists url_prefix text;

alter table property
  add column if not exists parent_property_id uuid references property(id) on delete set null;

create index if not exists idx_property_parent on property (parent_property_id);

-- Extend status to include 'inactive'.
-- Original migration named the constraint `property_status_check` by Postgres convention.
alter table property
  drop constraint if exists property_status_check;

alter table property
  add constraint property_status_check
  check (status in ('active','paused','offboarded','prospect','inactive'));

-- (primary_domain, url_prefix) must be unique. NULLS NOT DISTINCT so that
-- two properties with the same domain and both NULL prefixes collide.
alter table property
  add constraint property_domain_prefix_unique
  unique nulls not distinct (primary_domain, url_prefix);
