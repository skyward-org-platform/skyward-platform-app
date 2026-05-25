import { NextRequest, NextResponse } from "next/server";

// GET /api/verify-url?target=https://example.com/some-page
// Follows redirect chain up to 10 hops; returns status of each hop.
//
// Used by the Pages drawer's "Verify" button (and the Redirect / Consolidate
// tab rows in Chunk 4) to confirm whether the configured target URL is live
// + reachable. Read-only against an external URL — no auth gate.

const MAX_HOPS = 10;

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("target");
  if (!url) {
    return NextResponse.json({ ok: false, error: "missing ?target=" }, { status: 400 });
  }

  const chain: { url: string; status: number }[] = [];
  let current = url;

  for (let i = 0; i < MAX_HOPS; i++) {
    let resp: Response;
    try {
      resp = await fetch(current, {
        method: "HEAD",
        redirect: "manual",
        headers: { "User-Agent": "Skyward-Platform-Verify/1.0" },
      });
    } catch (e) {
      return NextResponse.json({
        ok: false,
        error: `fetch failed: ${e instanceof Error ? e.message : String(e)}`,
        chain,
      });
    }

    chain.push({ url: current, status: resp.status });

    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get("location");
      if (!loc) {
        return NextResponse.json({
          ok: false,
          error: `redirect without Location header at hop ${i}`,
          chain,
        });
      }
      current = new URL(loc, current).toString();
      continue;
    }

    // 2xx or 4xx/5xx — terminal
    return NextResponse.json({
      ok: true,
      finalUrl: current,
      finalStatus: resp.status,
      chain,
    });
  }

  return NextResponse.json({
    ok: false,
    error: `redirect chain too long (${MAX_HOPS}+ hops)`,
    chain,
  });
}
