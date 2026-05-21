import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Lazy singleton. Module-top-level createClient evaluates before env vars
// are guaranteed populated in some Next.js 16 server-render contexts and
// throws "supabaseKey is required." Defer until first use.

let _client: SupabaseClient | null = null;

function get(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error(
      "Supabase misconfigured: NEXT_PUBLIC_SUPABASE_URL is not set in the runtime environment.",
    );
  }
  if (!key) {
    throw new Error(
      "Supabase misconfigured: SUPABASE_SERVICE_ROLE_KEY is not set in the runtime environment.",
    );
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

// Backwards-compatible export. The Proxy forwards every access to the
// lazily-instantiated client so existing `supabase.from(...).select(...)`
// call sites work unchanged.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const c = get();
    const value = Reflect.get(c as object, prop, receiver);
    return typeof value === "function" ? value.bind(c) : value;
  },
});
