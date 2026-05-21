/**
 * Server-side base URL for the app's own API.
 *
 * Resolution order:
 *   1. Preview / dev VERCEL_ENV: VERCEL_URL — the per-deployment URL.
 *      Stays in the same environment as the calling render so env-scoped
 *      secrets (APP_WRITE_TOKEN, GCP creds) match. Vercel SSO Protection
 *      must be disabled for previews — otherwise this URL is auth-gated
 *      for server-to-server fetches and 401s.
 *   2. Production: VERCEL_PROJECT_PRODUCTION_URL — canonical alias.
 *   3. Local dev: http://localhost:3000.
 *
 * Why not always prefer VERCEL_PROJECT_PRODUCTION_URL: previews carry
 * their own env-var scope (different APP_WRITE_TOKEN, different
 * credentials). Routing the API call to the production URL crosses env
 * boundaries and 401s when production requires a token the preview
 * doesn't know.
 */
export function apiBase(): string {
  const env = process.env.VERCEL_ENV;
  if (env === "preview" || env === "development") {
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}
