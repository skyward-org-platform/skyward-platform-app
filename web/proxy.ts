import { NextResponse, type NextRequest } from "next/server";

const COOKIE_NAME = "skw_write";

export function proxy(request: NextRequest) {
  const expected = process.env.APP_WRITE_TOKEN;

  // Fail-safe: if the server is misconfigured (env var missing), let traffic
  // through. The server-action auth check is the backstop for writes.
  if (!expected) return NextResponse.next();

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (token === expected) return NextResponse.next();

  const signInUrl = new URL("/auth", request.url);
  const here = request.nextUrl.pathname + request.nextUrl.search;
  if (here && here !== "/") signInUrl.searchParams.set("next", here);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  // Apply to everything EXCEPT:
  //   - /auth                — the sign-in page itself
  //   - /_next/static, /_next/image, /_next/data — framework assets
  //   - /favicon, /robots, /sitemap — public meta files
  //   - /api                  — Vercel Python serverless functions (already
  //                             return JSON; they aren't browser-discoverable
  //                             surface and need different auth if exposed)
  //
  // "/" is listed explicitly because path-to-regexp's (?!) lookahead matcher
  // skips the bare root in practice.
  matcher: [
    "/",
    "/((?!auth|_next/static|_next/image|_next/data|favicon|robots|sitemap|api).+)",
  ],
};
