---
author: Adam
audience: Paul
type: handoff-guide
repo: skyward-seo-pipeline
version: v0.3.0
tags:
  - seo-pipeline
  - handoff
  - paul
---
# Paul's Getting Started Guide — `skyward-seo-pipeline`

Hey Paul — this is your starter doc for the new SEO pipeline package. It walks through adding it to your existing project as a dependency, configuring it, and doing a smoke-test run. After this, the per-module READMEs (linked at the bottom) carry the deep reference.

The package gives you two workflow modules — **WQA** (Website Quality Audit) and **KGA** (Keyword Gap Analysis) — exposed as CLIs and as importable Python functions you can call from your UI app. Same code path either way; the CLI is just a thin wrapper.

Pinned release as of this writing: **`v0.3.0`**.

---

## Prerequisites

Make sure you have:

- **`gh` CLI authenticated** — the repo is private (`github.com/skyward-org-platform/skyward-seo-pipeline`), and `skyward-common` is too. `uv` fetches them over HTTPS via `gh`'s credential helper.

  ```bash
  gh auth login
  gh auth setup-git
  ```

- **`uv`** installed (you're already using it). If not: `curl -LsSf https://astral.sh/uv/install.sh | sh`.

- **`gcloud` authenticated for Application Default Credentials** (easiest path — alternative is a service-account JSON):

  ```bash
  gcloud auth application-default login
  ```

- An `SF_INVOKER_CREDENTIALS` service-account JSON if you want to run `--pull-sf` (Screaming Frog crawls). The default DataHub SA does **not** have `cloudfunctions.invoker` on `sf-crawl-api` and will return 403 without this. Ask me for the JSON or skip SF for now via `--no-pull-sf`.

---

## Step 1 — Add the package to your project

From the root of your existing project (the one that has your `pyproject.toml`):

```bash
uv add "skyward-seo-pipeline @ git+https://github.com/skyward-org-platform/skyward-seo-pipeline.git@v0.3.0"
```

This pulls in `skyward-seo-pipeline==0.3.0` AND its transitive `skyward-common==1.4.2`. Verify:

```bash
uv pip list | grep skyward
# skyward-common      1.4.2
# skyward-seo-pipeline 0.3.0
```

After install, three console scripts are available in your venv:

```bash
uv run wqa --help
uv run kga --help
uv run seo-migrate --help
```

---

## Step 2 — Set up `.env`

The package reads config via `skyward-common`'s `load_config()`, which walks up from the cwd looking for a `.env` file. If your project already has a `.env`, you'll merge the seo-pipeline vars in. If not, grab the template from the repo as a starting point:

```bash
curl -sL https://raw.githubusercontent.com/skyward-org-platform/skyward-seo-pipeline/main/.env.example -o .env
```

(Or copy `.env.example` from a local clone if you have one.)

> [!important] Use the **dev** environment
> Two env vars control which environment you're talking to. Set **both** to dev for now:
>
> - `ENV=DEV` — skyward-common's config profile selector (uppercase).
> - `SEO_PIPELINE_ENV=dev` — selects the BigQuery dataset `SEOPipelineDev` for this repo's output tables (lowercase; one of `dev` / `prod` / `playground`).
>
> Both should be `dev` / `DEV`. Don't touch `prod` or `playground` — those are mine and the production runs.

The other vars you'll need to fill in:

| Var | What to put |
|---|---|
| `GCP_DATAHUB_PROJECT_ID` | `data-hub-468216` (leave as-is) |
| `GCP_DATAHUB_CREDENTIALS` | **Leave empty** to use Application Default Credentials (`gcloud auth application-default login` from prereqs). Or set to a service-account JSON path if you have one. |
| `GDRIVE_CREDENTIALS` | Path to an OAuth client-secret JSON. I'll send you one. First run will open a browser for OAuth consent. |
| `GDRIVE_OAUTH_TOKEN` | Path where the persisted OAuth token gets saved. Default in `.env.example` is fine (`secrets/google_drive_oauth.json`). |
| `WQA_SHARED_DRIVE_FOLDER_ID` | Drive folder ID where WQA Sheets land. I'll send you one. If you leave it empty, sheet export is skipped and the run still succeeds — the BQ table is the canonical output. |
| `KGA_DRIVE_FOLDER_ID` | Same idea, for KGA Sheets. |
| `SF_INVOKER_CREDENTIALS` | Path to the SF service-account JSON. If you skip SF pulls, this can stay empty. |

Plus DataForSEO credentials (loaded via `skyward-common` — the keys are documented in skyward-common's own `.env.example`).

If you don't already have one, create a `secrets/` directory in your project root for the JSON files:

```bash
mkdir -p secrets
# drop the OAuth client-secret JSON and the SF invoker JSON here
```

Make sure `secrets/` is in your `.gitignore`.

---

## Step 3 — Smoke test

Two zero-cost checks before you spend any DataForSEO credit or wait on an SF crawl:

```bash
# 1. Help text should render — confirms the CLI install + entry-point wiring.
uv run wqa --help
uv run kga --help

# 2. Schema check — confirms BQ auth + dataset access.
uv run seo-migrate --env dev --dry-run
```

The migrate dry-run will report any planned schema changes against `SEOPipelineDev`. On a fresh dev environment with my recent runs, it should report **no changes needed**. If it does report changes, ping me before applying — that probably means something's drifted.

---

## Step 4 — First real WQA run

Cheapest possible run — no new pulls, just aggregates whatever's already in BigQuery:

```bash
uv run wqa --domain <one of our existing client domains> \
  --no-pull-sf --no-pull-dfs-keywords --no-pull-dfs-backlinks
```

This:
1. Resolves the project context (you'll see interactive prompts for client/domain/project picking + a final confirm).
2. Asks you which GA4 events count as conversions / ecom conversions.
3. Aggregates the existing data into a single per-URL table.
4. Writes to `data-hub-468216.SEOPipelineDev.wqa_output`.
5. (Optionally) creates a Google Sheet in `WQA_SHARED_DRIVE_FOLDER_ID`.

Once that works, you can try a real pull:

```bash
uv run wqa --domain <domain>
# defaults pull SF + DFS keywords + DFS backlinks
# --country-code 2840 (US) by default; use 2036 (AU), 2826 (UK), etc. for non-US clients
```

> [!warning] DataForSEO costs money
> Each ranked-keywords pull is ~$0.10–$0.50 depending on volume; backlinks similar. The CLI shows you the pull plan + your current DFS balance before it executes — you get to say yes/no at that gate. Watch the balance.

KGA flow is similar — see its README for the two-call `plan_kga` → gate → `run_kga` shape.

---

## Step 5 — When you're ready to build the UI app

You don't need to use the CLI at all — both modules are importable. The CLI is just a thin wrapper around `run_wqa(...)` / `run_kga(...)`. The same functions accept an `InteractionDriver` parameter that controls every user-decision point in the flow. The default driver renders to stdin/stdout (that's what the CLI uses). For your UI, you implement the driver Protocol with widgets/components instead.

Minimal WQA snippet:

```python
from datetime import date
from skyward.seo_pipeline.infra.intake import resolve_project
from skyward.seo_pipeline.modules.website_quality_audit.run import run_wqa
from skyward.seo_pipeline.modules.website_quality_audit.windowing import RunWindow

driver = MyUIDriver()   # your InteractionDriver implementation

ctx = resolve_project(domain="skyward.com", allow_create=True, driver=driver)

rows = run_wqa(
    ctx=ctx,
    window=RunWindow(end_date=date.today(), period_length=180),
    pull_flags={"pull_sf": True, "pull_dfs_keywords": True, "pull_dfs_backlinks": True},
    force_pull=False,
    max_dfs_keywords_per_domain=10_000,
    country_code=2840,
    driver=driver,
)
```

The `InteractionDriver` Protocol lives at `skyward.seo_pipeline.infra.interaction.driver`. There are 9 methods total (text, integer, choice, confirm, pick_from_list, select_indices, repeated_text, confirm_context, proceed_review). The WQA README enumerates exactly which methods get called during a run and in what order — that's your spec for the widgets.

---

## Where to read more

The deep reference lives in two READMEs inside the package:

- **WQA**: `src/skyward/seo_pipeline/modules/website_quality_audit/README.md`
  - Entry-point signatures
  - Every CLI flag + every kwarg
  - Every `InteractionDriver` prompt **in firing order** with what triggers it
  - `wqa_output` BigQuery table column list
  - `runs.outputs` JSON shape
  - Google Sheet tab structure
  - Failure modes / error semantics
  - `InteractionDriver` implementation guide
  - Internals: acquisition steps, loaders, aggregator

- **KGA**: `src/skyward/seo_pipeline/modules/keyword_gap_analysis/README.md`
  - Same shape, plus the `plan_kga(...)` → your UI's proceed-gate → `run_kga(...)` two-call flow your UI will need.

You can read them on GitHub:

- [WQA README](https://github.com/skyward-org-platform/skyward-seo-pipeline/blob/v0.3.0/src/skyward/seo_pipeline/modules/website_quality_audit/README.md)
- [KGA README](https://github.com/skyward-org-platform/skyward-seo-pipeline/blob/v0.3.0/src/skyward/seo_pipeline/modules/keyword_gap_analysis/README.md)

The repo's root [`README.md`](https://github.com/skyward-org-platform/skyward-seo-pipeline/blob/v0.3.0/README.md) has install instructions, env-var table, and a high-level overview — same shape as steps 1–2 here, but more compact.

---

## When you hit something weird

The repo's `CLAUDE.md` carries deeper notes on architecture, gotchas, and conventions. It's written for Claude Code sessions but it's perfectly readable for any contributor and is the most up-to-date "how this actually works" reference. Worth skimming when you're confused about something — search for the relevant module / function name and you'll usually find the explanation there.

Otherwise, ping me.

— Adam
