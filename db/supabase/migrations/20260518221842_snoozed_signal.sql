-- Signal snooze state. Keyed on the deterministic signal_id produced by
-- web/lib/signals.ts (e.g. "no_brand_dna:phil-lasry"). Snoozed rows are
-- excluded from the active signal list on the dashboard card, the sidebar
-- count, and the /signals page's severity groups — they surface separately
-- in the "Snoozed" section with an Unsnooze affordance.

create table if not exists snoozed_signal (
  signal_id     text primary key,
  snoozed_at    timestamptz not null default now(),
  snoozed_by    text
);

create index if not exists idx_snoozed_signal_snoozed_at
  on snoozed_signal (snoozed_at desc);

alter table snoozed_signal enable row level security;

drop policy if exists "team can read snoozed_signal" on snoozed_signal;
create policy "team can read snoozed_signal"
  on snoozed_signal for select
  using (auth.role() = 'authenticated');

drop policy if exists "team can write snoozed_signal" on snoozed_signal;
create policy "team can write snoozed_signal"
  on snoozed_signal for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );
