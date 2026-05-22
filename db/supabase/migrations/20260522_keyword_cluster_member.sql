create table if not exists keyword_cluster_member (
  cluster_id  uuid not null references keyword_cluster(id) on delete cascade,
  keyword     text not null,
  assignment  text not null default 'algorithm'
               check (assignment in ('algorithm','manual')),
  moved_by    text,
  moved_at    timestamptz,
  primary key (cluster_id, keyword)
);

create index if not exists idx_keyword_cluster_member_keyword on keyword_cluster_member (keyword);
create index if not exists idx_keyword_cluster_member_assignment on keyword_cluster_member (assignment);

alter table keyword_cluster_member enable row level security;
create policy "team can read keyword_cluster_member" on keyword_cluster_member for select
  using (auth.role() = 'authenticated');
create policy "team can write keyword_cluster_member" on keyword_cluster_member for all
  using (
    auth.role() = 'authenticated'
    and exists (select 1 from team_member where user_id = auth.uid() and active)
  );
