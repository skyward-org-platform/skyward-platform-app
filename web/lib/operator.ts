// Operator identity for write actions. Single-user platform during V1 — the
// `APP_OPERATOR` env var (set in Vercel) is the canonical label written to
// every `updated_by` / `audit_decided_by` / `snoozed_by` column. Default
// keeps local dev working without env setup.

export function getOperator(): string {
  return process.env.APP_OPERATOR ?? "paul-skirbe";
}
