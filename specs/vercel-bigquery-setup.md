# Using the BigQuery service account with skyward-common on Vercel

You've been given a service account JSON key for the `data-hub-468216` GCP project. It has BigQuery read/write across the project. Below are two ways to wire it into your Vercel app alongside `skyward-common`.

**First step (both options):** In your Vercel project settings, add an environment variable holding the **entire contents** of the JSON file as a single string. Name it whatever you like — examples below use `GCP_SERVICE_ACCOUNT_JSON`. Do not commit the file to your repo.

## Option A — Pass credentials directly to `BigQueryClient` (recommended)

`BigQueryClient` accepts a credentials dict directly, so you can skip `skyward-common`'s file-path-based config loader entirely. This is the cleanest fit for Vercel because nothing has to touch the filesystem.

```python
import json
import os
from skyward.data.bigquery import BigQueryClient

creds = json.loads(os.environ["GCP_SERVICE_ACCOUNT_JSON"])
bq = BigQueryClient(
    project_id="data-hub-468216",
    credentials_info=creds,
)

# use bq normally
df = bq.query("SELECT 1 AS x").to_dataframe()
```

**Pros:** no temp files, no extra env vars, works on any serverless platform.
**Cons:** you have to construct `BigQueryClient` yourself instead of relying on `load_config()`.

## Option B — Write the JSON to `/tmp` and use `load_config()`

`skyward-common`'s `load_config()` reads the env var `GCP_DATAHUB_CREDENTIALS` and expects it to be a **file path** to a JSON key. Vercel's only writable directory is `/tmp`, so if you want to keep using `load_config()`, write the key out at cold start and point the env var at it.

```python
import os
from pathlib import Path
from skyward.config import load_config

_KEY_PATH = "/tmp/gcp-sa.json"
if not Path(_KEY_PATH).exists():
    Path(_KEY_PATH).write_text(os.environ["GCP_SERVICE_ACCOUNT_JSON"])
os.environ["GCP_DATAHUB_CREDENTIALS"] = _KEY_PATH

cfg = load_config()
# cfg.datahub_credentials is now the loaded dict, ready to use
```

Run that once at module import / cold start, before anything else from `skyward` is initialized.

**Pros:** keeps the standard `load_config()` flow if the rest of your code already uses it.
**Cons:** writes a secret to `/tmp` on each cold start, slightly more moving parts.

## Notes

- `/tmp` on Vercel is per-instance and ephemeral — the file is gone when the instance recycles. That's fine; the cold-start write recreates it.
- Don't log or echo the env var anywhere. Treat it like any other secret.
- If you ever need to rotate, ask for a new JSON — the old key can be revoked from the GCP Console's Keys tab on the service account.
