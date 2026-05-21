// Vercel cron target. Runs every 5 minutes per vercel.json. Pings the
// heavy Python serverless routes so they stay warm — eliminates the
// 3-8 second cold-start hit when a user navigates after idle.
//
// What gets pinged:
//   • /api/wqa/pages?domain=… for each active property
//   • /api/clients (cheap warmer for the clients list)
//
// Auth: Vercel cron requests carry `Authorization: Bearer ${CRON_SECRET}`.
// If CRON_SECRET isn't set, we accept any caller — fine for dev.

import { supabase } from "@/lib/supabase";
import { apiBase } from "@/lib/api-base";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  // Auth: accept either CRON_SECRET bearer (for future cron use) OR the
  // skw_write cookie (authenticated browser session firing prewarm on app
  // boot). Open if neither secret is set — dev only.
  const secret = process.env.CRON_SECRET;
  const expectedToken = process.env.APP_WRITE_TOKEN;
  if (secret || expectedToken) {
    const header = req.headers.get("authorization") ?? "";
    const isBearer = !!secret && header === `Bearer ${secret}`;
    const cookieToken = req.headers
      .get("cookie")
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("skw_write="))
      ?.slice("skw_write=".length);
    const isCookie = !!expectedToken && cookieToken === expectedToken;
    if (!isBearer && !isCookie) {
      return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const token = process.env.APP_WRITE_TOKEN;
  const authHeader: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  // 1. Hit /api/clients to keep the Python clients route warm.
  const clientsPromise = fetch(`${apiBase()}/api/clients`, {
    headers: authHeader,
    cache: "no-store",
  }).then((r) => ({ url: "/api/clients", ok: r.ok, status: r.status }))
    .catch((e) => ({ url: "/api/clients", ok: false, status: 0, error: String(e) }));

  // 2. Pull every property with a primary_domain and ping WQA for each.
  const { data: props } = await supabase
    .from("property")
    .select("slug, primary_domain")
    .not("primary_domain", "is", null);

  const wqaPromises = ((props ?? []) as { slug: string; primary_domain: string | null }[])
    .filter((p) => p.primary_domain)
    .map(async (p) => {
      const url = `${apiBase()}/api/wqa/pages?domain=${encodeURIComponent(p.primary_domain!)}&env=dev`;
      try {
        const r = await fetch(url, {
          headers: authHeader,
          cache: "no-store",
        });
        return { property: p.slug, url, ok: r.ok, status: r.status };
      } catch (e) {
        return {
          property: p.slug,
          url,
          ok: false,
          status: 0,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    });

  const results = await Promise.all([clientsPromise, ...wqaPromises]);

  return Response.json({
    ok: true,
    warmed: results.length,
    results,
    timestamp: new Date().toISOString(),
  });
}
