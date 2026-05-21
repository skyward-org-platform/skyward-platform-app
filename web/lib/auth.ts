import { cookies } from "next/headers";

const COOKIE_NAME = "skw_write";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export async function requireWriteToken(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const expected = process.env.APP_WRITE_TOKEN;
  // Fail-open when APP_WRITE_TOKEN is unset (preview / dev). Matches the
  // proxy middleware's behavior — if the server is misconfigured, the
  // app stays usable. Production sets the env var, so writes are gated
  // there. Supabase RLS (team_member check) is the real backstop.
  if (!expected) return { ok: true };
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (token !== expected) {
    return { ok: false, error: "Unauthorized — sign in at /auth" };
  }
  return { ok: true };
}

export async function setWriteToken(
  token: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const expected = process.env.APP_WRITE_TOKEN;
  if (!expected) {
    return { ok: false, error: "Server misconfigured: APP_WRITE_TOKEN unset" };
  }
  if (token !== expected) {
    return { ok: false, error: "Invalid token" };
  }
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return { ok: true };
}

export async function clearWriteToken(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

export async function hasWriteToken(): Promise<boolean> {
  const expected = process.env.APP_WRITE_TOKEN;
  if (!expected) return false;
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return token === expected;
}
