---
title: Setting up BigQuery credentials for Vercel Python functions
date: 2026-05-14
audience: Paul
---

# BigQuery credentials setup for `/api/clients`

The new `web/api/clients.py` function reads `data-hub-468216.Meta.clients` via skyward-common. Vercel doesn't have `gcloud` installed, so it can't use Application Default Credentials. You need to put a **service account JSON** in Vercel env vars.

## One-time setup

### 1. Create a service account in GCP

In Cloud Console → IAM & Admin → Service Accounts (project `data-hub-468216`):

- **Name:** `vercel-platform-app-reader`
- **ID:** `vercel-platform-app-reader@data-hub-468216.iam.gserviceaccount.com`
- **Role:** `BigQuery Data Viewer` (scoped to the `Meta` dataset is best; project-wide is fine for now)
- Also grant: `BigQuery Job User` (needed to run queries) — project level

After create → Keys → Add Key → Create new key → **JSON** → downloads to your machine.

### 2. Set env vars in Vercel

In Vercel dashboard → `skyward-platform-app` project → Settings → Environment Variables. Add for **Production + Preview + Development**:

| Name | Value |
|---|---|
| `GCP_DATAHUB_PROJECT_ID` | `data-hub-468216` |
| `GCP_SERVICE_ACCOUNT_JSON` | (paste the full JSON contents on one line, or keep newlines — both work) |

Save.

### 3. Trigger a redeploy

Push any commit, or in Vercel dashboard → Deployments → ⋯ → Redeploy. The new function picks up the env vars on next cold start.

## Local development

For `vercel dev` and `npm run dev` against `/api/clients`:

```bash
cd web
cat > .env.local <<'EOF'
GCP_DATAHUB_PROJECT_ID=data-hub-468216
EOF
```

`.env.local` is gitignored. Locally you can leave `GCP_SERVICE_ACCOUNT_JSON` unset — the Python function falls back to **Application Default Credentials** (your existing `gcloud auth application-default login` session at `~/.config/gcloud/application_default_credentials.json`).

Run:

```bash
cd web && vercel dev      # serves Next.js + Python functions together on :3000
```

First request to `/api/clients` will be slow — Vercel pip-installs skyward-common + deps into a venv. Subsequent requests are fast.

## Verify it works

After Vercel env vars are set + a fresh deploy:

```bash
curl https://skyward-seo-platform.vercel.app/api/clients?include_counts=true | jq '.count'
```

Should return the number of clients in BQ Meta. Then visit https://skyward-seo-platform.vercel.app/clients in a browser.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| 500 `missing env var: GCP_DATAHUB_PROJECT_ID` | Env var not set in Vercel | Add it in dashboard, redeploy |
| 500 `KeyError` re creds | JSON paste corrupted | Re-paste; make sure quotes aren't escaped |
| 403 `BigQuery: Permission denied` | SA lacks roles | Grant Data Viewer + Job User on `data-hub-468216` |
| Function exceeds 500 MB bundle | skyward-common deps too heavy | Check `vercel.json` `excludeFiles`; possibly slim deps |
| Cold start > 5s | Python function spins up + BQ client | Acceptable for prototype; Fluid Compute keeps it warm under traffic |

## Why this exists

The "no duplication" rule (2026-05-14) keeps the BQ Meta → Supabase migration on Adam's timeline. Until then, our app reads BQ Meta on demand instead of mirroring it. Adam's admin portal remains the write surface.

When Adam migrates Meta to Supabase + updates skyward-common:
1. We replace `web/api/clients.py` with a Supabase Server Component query (drop the Python function).
2. Vercel env vars `GCP_DATAHUB_*` can be removed.
3. The service account stays — it's still useful for other BQ reads (DataForSEO data, GSC, etc.) if we ever do server-side analytical lookups.
