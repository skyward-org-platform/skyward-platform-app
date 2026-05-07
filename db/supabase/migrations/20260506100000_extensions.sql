-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "vector";
create extension if not exists "pg_trgm";
create extension if not exists "pg_cron" with schema extensions;

-- Helper function used by smoke tests to confirm an extension is installed
create or replace function pg_ext_check(ext_name text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from pg_extension where extname = ext_name
  );
$$;
