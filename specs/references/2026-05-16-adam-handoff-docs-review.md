---
date: 2026-05-16
source:
  - operations/process-library/Adam Files/Paul's Getting Started Guide.md
  - operations/process-library/Adam Files/Meta Hierarchy Diagram.md
purpose: Review Adam's pre-Iceland handoff docs and pull out what's load-bearing for the app.
---

# Adam's handoff docs — what they tell us

Adam shipped two things before leaving:
1. **Getting Started Guide** for `skyward-seo-pipeline v0.3.0` — how to install + run WQA / KGA + how to integrate into a UI.
2. **Meta Hierarchy Diagram** — the canonical Skyward data model (client → domain → project) as it lives in BQ Meta today.

Both are useful as separate documents but, read together, they answer the "how do we wire Adam's modules into our app" question with surprising specificity. Highlights below.

## 1. The skyward-seo-pipeline package is shipped — v0.3.0

Two modules ready: **WQA** (Website Quality Audit) and **KGA** (Keyword Gap Analysis). Each is exposed three ways:

- **CLI** — `uv run wqa` / `uv run kga` / `uv run seo-migrate` (thin wrapper)
- **Python functions** — `run_wqa(...)` and `plan_kga(...) → run_kga(...)` (same code path)
- **Driver-based UI integration** — both functions accept an `InteractionDriver` (next section)

Install line for the platform-app pyproject:

```bash
uv add "skyward-seo-pipeline @ git+https://github.com/skyward-org-platform/skyward-seo-pipeline.git@v0.3.0"
```

Pulls in `skyward-seo-pipeline v0.3.0` + transitive `skyward-common v1.4.2`. Note: skyward-common bumped from v1.4.1 → v1.4.2.

Output BigQuery table for WQA: `data-hub-468216.SEOPipelineDev.wqa_output` (when we use `SEO_PIPELINE_ENV=dev`).

## 2. The `InteractionDriver` Protocol — this is the UI integration spec

The key abstraction. Every user-decision point in the WQA / KGA flow goes through a `driver`. CLI ships with a stdin/stdout driver. **For our UI, we implement the same Protocol with widgets.**

Located at `skyward.seo_pipeline.infra.interaction.driver`. **9 methods total:**

| Method | Widget equivalent |
|---|---|
| `text(prompt)` | single-line `<input type="text">` |
| `integer(prompt)` | `<input type="number">` |
| `choice(prompt, options)` | `<select>` / radio group |
| `confirm(prompt)` | yes/no button pair |
| `pick_from_list(prompt, items)` | single-select list with search |
| `select_indices(prompt, items)` | multi-select with checkboxes |
| `repeated_text(prompt)` | multi-row text input ("add another") |
| `confirm_context(ctx)` | "this is what we're about to do" confirmation panel |
| `proceed_review(plan, cost)` | cost-gated proceed button (mainly for KGA `plan_kga → run_kga` flow) |

The WQA README enumerates exact firing order — i.e. which methods get called and in what sequence during a run. That's the spec for the widgets we build.

**This is the cleanest possible API for us.** We don't fork Adam's logic. We implement 9 small components and bind them to the driver.

## 3. The two-call cost gate for KGA (and any expensive pull)

`plan_kga(...)` returns a cost estimate + pull plan. The UI shows it. User confirms via `proceed_review(...)`. Then `run_kga(...)` actually executes.

This is **exactly the Research & Fill pattern** we already mocked on the Brand DNA Overview screen — sweeping progress bar, step-by-step status. Difference: instead of stubbed steps, the real plan + cost ($0.10–$0.50 per pull for ranked-keywords, similar for backlinks) appears mid-flow with a yes/no gate.

The pattern generalizes — anytime we wrap an expensive Adam module, the UX is plan → cost gate → run → results.

## 4. The minimal Python integration snippet (verbatim from Adam)

```python
from datetime import date
from skyward.seo_pipeline.infra.intake import resolve_project
from skyward.seo_pipeline.modules.website_quality_audit.run import run_wqa
from skyward.seo_pipeline.modules.website_quality_audit.windowing import RunWindow

driver = MyUIDriver()   # our InteractionDriver implementation

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

Mapping to a UI flow:

| Step | UI surface |
|---|---|
| `resolve_project(domain=...)` | When user clicks "Run WQA" on a property page, pass `property.primary_domain` as the domain |
| `driver` prompts during resolve | Render in a modal or side panel — "Pick the client / project" pickers |
| `RunWindow(end_date, period_length)` | Form: date picker + period selector (default 180d) |
| `pull_flags` | Three toggles: SF crawl, DFS keywords, DFS backlinks |
| `country_code` | Picker (2840=US, 2036=AU, etc.) — could default from property metadata |
| Driver prompts during run | Stream into the same modal — progress bar + current step + confirms |
| `rows` output | Land back into Pages tab |

The whole flow is a **single modal** that opens when the user clicks "Run WQA" and stays open through plan + cost gate + execution + completion.

## 5. Auth requirements — important for where this runs

The Getting Started Guide requires:

- `gh auth login` + `gh auth setup-git` — the repo is private; `uv` uses gh credential helper to clone
- `gcloud auth application-default login` — easiest BQ auth path (alternative: SA JSON)
- `GDRIVE_CREDENTIALS` — OAuth client-secret JSON for Google Sheets export (Adam will send)
- Optional: `SF_INVOKER_CREDENTIALS` SA JSON for Screaming Frog pulls

**Implication for Vercel:** Vercel functions can't have `gh` or `gcloud` configured. So WQA / KGA runs **cannot execute inside a Vercel function**. Options:

1. **Local development first** — Paul runs WQA/KGA from his machine via Python; the UI in Vercel just reads `SEOPipelineDev.wqa_output` results.
2. **Worker / long-running server** — eventually spin up a Cloud Run job or similar that has `gh` + ADC configured. Vercel function fires a request to the worker; worker executes.
3. **GitHub Packages publish** — if Adam publishes `skyward-seo-pipeline` to GitHub Packages, `uv add` could resolve without `gh` auth (just a PAT). Removes the gh dependency but not the gcloud one.

For the next ~weeks, option 1 is fine. Option 2 is the long-term answer.

## 6. The two environment vars are critical

```
ENV=DEV
SEO_PIPELINE_ENV=dev
```

Both. `ENV` controls skyward-common's config profile selector. `SEO_PIPELINE_ENV` picks the BQ dataset (`SEOPipelineDev`). Adam explicitly says don't touch `prod` or `playground`.

When we wire the UI: hard-code `dev` for now. The platform-app should NEVER trigger production runs (those are Adam's).

## 7. Adam's hierarchy — Client → Domain → Project, with three nuances

From the Meta Hierarchy Diagram:

```
Client
 ├── owns ──> Domain[]              (via client_domains)
 │            ├── is_competitor=false  → "their domain"
 │            └── is_competitor=true   → competitor domain
 │            └── priority: low | normal | high
 ├── owns ──> Data Source[]         (via client_datasets)
 └── owns ──> Project[]             (project.client_id FK)
              └── targets ──> Domain[]  (via project_domains)
                              ├── role
                              └── priority
```

Three things worth highlighting:

**(a) Domain is shared across clients.** One `domains` row can be Client A's owned domain AND Client B's competitor — distinguished by the join row. This matters when the BQ Meta migration happens; we don't dedupe domains, we maintain a single global pool.

**(b) Projects are many-to-many with domains via `project_domains`.** One project can target multiple domains. A project can also be "client-wide" with **zero** rows in `project_domains` — meaning it spans all of the client's work, not any specific site.

**(c) Project status is tri-valued: active / complete / deactivated.** We use `active` today but should plan for the other two.

## 8. No `property` concept in Adam's model — that's still our overlay

Adam's diagram is exactly: `client → domain → project`. The **property** concept we elevated in v2 (brand + website + state) does NOT exist on his side. It's a Skyward Platform App overlay over `client_domains` rows where status="active engagement."

This was confirmed in the May 15 call when Paul said property = elevated domain (with social profiles, GBP, etc. attached) and Adam said "we can figure that out later, it's not super important right now."

**Implication for our build:** when WQA runs against a property, we pass `property.primary_domain` as the `domain` argument to `resolve_project(...)`. Adam's `resolve_project` maps the domain to its `domain_id` in BQ Meta and resolves which `client_id` + `project_id` to use. We never pass our property UUIDs to Adam's code.

When migration happens later, the property concept becomes a `client_domains.is_active_property = true` flag (or similar) plus the supporting profile rows (GBP, social, etc.).

## 9. Concrete "Run WQA" UX — drawing from these docs

Mapping each piece together, the affordance on the property's Pages tab looks like:

```
┌─ button: "Run WQA" ────────────────────────────────────┐
│                                                         │
│  click → opens modal:                                  │
│                                                         │
│  ┌─ Run WQA on buscharter.com.au ────────────────────┐ │
│  │                                                    │ │
│  │ STEP 1 / 5: Resolve project context               │ │
│  │   ⏳ Mapping domain to client + project…           │ │
│  │   [driver.text / pick_from_list prompts]          │ │
│  │                                                    │ │
│  │ STEP 2 / 5: Configure run window                  │ │
│  │   End date:    [____________]                     │ │
│  │   Period:      [180 days ▾]                       │ │
│  │                                                    │ │
│  │ STEP 3 / 5: Pull plan                             │ │
│  │   ☑ Screaming Frog crawl                          │ │
│  │   ☑ DataForSEO ranked keywords                    │ │
│  │   ☑ DataForSEO backlinks                          │ │
│  │   Country code: [2840 (US) ▾]                     │ │
│  │   Max keywords: [10,000]                          │ │
│  │                                                    │ │
│  │ STEP 4 / 5: Cost review                           │ │
│  │   DFS balance: $42.18                             │ │
│  │   Estimated pull cost: ~$0.85                     │ │
│  │   [Cancel]              [Proceed →]               │ │
│  │                                                    │ │
│  │ STEP 5 / 5: Running                               │ │
│  │   ✓ Resolved project (ctx)                        │ │
│  │   ✓ Pulled SF crawl (3,201 URLs)                  │ │
│  │   ⋯ Pulling ranked keywords…                      │ │
│  │   · Pulling backlinks                             │ │
│  │   · Aggregating                                   │ │
│  │   · Writing to SEOPipelineDev.wqa_output          │ │
│  │   · Creating Google Sheet                         │ │
│  │                                                    │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

Reuses the Research & Fill pipeline pattern from the Brand DNA Overview almost exactly. Same sweeping bar + checkpoint list. Difference: real plan + cost + ID resolution mid-flow.

## 10. What I'd suggest doing next

### Pre-Adam-return (can happen now)
1. **Bump skyward-common pin** in `~/agency/pyproject.toml` from `v1.4.1` → `v1.4.2`. Tiny change.
2. **Mock the Run WQA modal** in the v2 HTML mockup using the structure above. Pure UI design — no real wiring. Adds Screen 17 or thereabouts.
3. **Mock a parallel Run KGA modal** showing the explicit `plan → cost gate → run` two-call pattern. Different from WQA in that the cost gate is more prominent.
4. **Make sure `gh auth` is set up** on Paul's local machine for when the package install needs to happen.

### When Adam's back (or you want to do it locally before)
5. **Install the package** in the platform-app pyproject and run `uv run wqa --help` to confirm.
6. **Smoke test** with a real domain (buscharter or phil-lasry) using `--no-pull-*` flags so it costs $0.
7. **Implement the `InteractionDriver` Protocol** in our app as a Python module (`web/api/wqa/_driver.py` if we go the Vercel-Python-function route, or in a separate worker if we go that direction).
8. **Wire the modal** to call `run_wqa(driver=our_driver, ...)` server-side. Stream driver events to the UI via SSE or WebSocket.

### Decisions to make
- **Where do the runs execute?** Local Python (Paul's laptop), Vercel function, or a Cloud Run worker? Each has trade-offs. Local works today, doesn't scale. Cloud Run is the right destination for the long term but requires setup.
- **GHCR vs git+https for the package install?** Adam's guide assumes private repo + gh auth. For Vercel-build-time install of a worker, GHCR with a PAT is easier than fighting with gh auth in CI. Worth raising with Adam.
- **How do we surface the run history on the property?** Each WQA run produces a row in `SEOPipelineDev.runs` (per the README references). We can show "last WQA run: 2 days ago, 3,201 pages" with a re-run button.

## Quick wins from these docs that aren't actions

- The `seo-migrate --dry-run` command gives us schema-drift detection for free — useful in CI eventually.
- Adam's `.env.example` defines all the vars including the optional ones — when we eventually set up a worker, this is the env-var contract.
- The fact that both modules are importable Python (not just CLIs) means **everything is wirable**. No JSON-API to write between Adam's code and ours; we just call functions.

## Bottom line

The handoff is unusually clean. The InteractionDriver Protocol means we don't have to fork or wrap anything — we implement 9 widgets and the modules work. The cost-gate pattern (`plan → confirm → run`) generalizes to any expensive Adam module we wrap in the future (next would probably be backlink analysis, content gap, fanout simulation — all already exist as notebooks per the process library walk).

The biggest open question is **where the Python actually runs** when called from our UI. Vercel functions can't have `gh` + `gcloud` configured cleanly. Most likely path: a Cloud Run worker that accepts UI requests, runs the modules, streams driver events back. But local-on-Paul's-machine works for the first few weeks and lets us validate the integration pattern without standing up new infrastructure.
