---
title: Skyward Platform App — Project State
generated: 2026-05-16
generated_by: Claude inventory pass
scope: factual inventory only — no editorializing, no recommendations
---

# Project State

## 1. Stack

The Next.js app lives in `web/`. There is **no repo-root `package.json`** — `npm install && npm run dev` happens inside `web/`. Vercel is pointed at this subdir as the project root.

**Frontend (`web/`)**
- Next.js **16.2.6** (App Router, RSC by default)
- React **19.2.4** / React DOM 19.2.4
- TypeScript **5.x** (`strict: true`, `target: ES2017`, path alias `@/* → ./*`)
- Tailwind **v4** via `@tailwindcss/postcss` (no `tailwind.config.*`, CSS-vars driven)
- shadcn/ui — `components.json` style: `"base-nova"`, baseColor `neutral`, icon library `lucide`
- `@base-ui/react` 1.4.1 (primitives — the shadcn `select` component uses it)
- `lucide-react` 1.14.0
- `class-variance-authority` 0.7.1 + `clsx` 2.1.1 + `tailwind-merge` 3.5.0 (composed into `lib/utils.ts#cn`)
- `tw-animate-css` 1.4.0
- `@supabase/supabase-js` **2.105.4**
- `web/CLAUDE.md` aliases `web/AGENTS.md`, which contains a single warning: *"This is NOT the Next.js you know. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code."*

**Backend (Vercel Python serverless functions, `web/api/*.py`)**
- Python (version pinned by `web/.python-version`)
- Each function is a `class handler(BaseHTTPRequestHandler)` exporting `handler` (Vercel auto-discovery pattern)
- `web/requirements.txt`: single dependency — `skyward-common @ git+https://github.com/skyward-org-platform/skyward-common.git@v1.4.1`
- `web/vercel.json` config: `maxDuration: 30s`, `memory: 1024 MB`, excludes tests/fixtures/__pycache__/docs from the bundle
- Indirect deps pulled by skyward-common: `google-cloud-bigquery`, `pandas` (used via `.to_dataframe()`)

**Python tooling outside the web app (`scripts/`, `inference/`, `tests/`)**
- Run from the `~/agency` uv environment (per README: `cd ~/agency && uv sync`)
- `skyward-common` v1.4.1 pulled there
- OpenAI Python SDK (Structured Outputs) used by `inference/`
- `supabase-py` used by `scripts/` and `tests/`

**Database**
- Supabase Postgres project `seo-platform-dev`, project ref `ceyovawndjleprzjsjsr` (URL in `web/.env.local`)
- Extensions enabled: `uuid-ossp`, `vector` (pgvector — used for `page.embedding vector(1536)` with HNSW index), `pg_trgm`, `pg_cron`

**Auth provider**
- DB-layer: Supabase auth (RLS policies reference `auth.uid()` and a `team_member` table joined on `auth.users.id`)
- App-layer: **none.** The web app has no sign-in flow; see §7.

**Styling approach**
- Tailwind v4 utility classes, inline. CSS variables in `web/app/globals.css`. Per-page composition uses `cn()` from `lib/utils.ts`.
- shadcn primitives under `web/components/ui/`. No CSS modules, no styled-components.

**Hosting target**
- Vercel. `web/.vercel/project.json`: project name `skyward-seo-platform`, project ID `prj_eFUNPn2kNAddgfLPCZKa0Nmmm6GM`, org/team `team_tRJkYQFydTCQBNlXQWF1XABS` (`skyward-org-platform`).
- Production URL: `https://skyward-seo-platform.vercel.app`
- README notes Vercel Hobby plan requires commits authored by `data@goskyward.io / Paul Skirbe`.

## 2. Directory structure

`tree` is not installed; the equivalent depth-3 listing (excluding `node_modules`, `.next`, `.git`, `dist`, `__pycache__`, `.vercel`):

```
.
├── .env                                            → symlink to /Users/paulskirbe/agency/.env
├── .gitignore
├── README.md
├── db/
│   └── supabase/
│       ├── .temp/                                  Supabase CLI scratch
│       ├── config.toml                             Supabase project config
│       └── migrations/                             8 SQL files (§6)
├── handoff/
│   └── 2026-05-06-adam-walkthrough/                Markdown handoff docs given to Adam (5 files)
├── inference/                                      OpenAI Brand DNA inference modules
│   ├── __init__.py
│   ├── brand_story.py
│   ├── brand_terms.py
│   ├── client.py                                   Shared OpenAI client + Structured Outputs wrapper
│   ├── future_audience.py
│   ├── proof.py
│   ├── voice_tone.py
│   └── tests/                                      Pytest module tests (5 test files)
├── research/
│   └── tryggvi-stack-notes-v1.md                   Single research note
├── scripts/                                        Python utilities (run from ~/agency uv env)
│   ├── backfill_pages.py                           WQA workbook → page table
│   ├── backfill_phil_lasry_brand_dna.py            Brand DNA backfill for phil-lasry property
│   ├── backfill_phil_lasry_pages.py                Pages backfill for phil-lasry property
│   ├── export_brand_dna_markdown.py                Supabase → delivery/{slug}/00-brand-dna.md
│   ├── pull_plasry_content_from_bq.py              BQ ScreamingFrog content → Supabase
│   ├── seed_clients_properties.py                  Idempotent seed of client + property
│   └── supabase_client.py                          Shared Supabase client factory
├── session-notes/                                  Dated session logs (8 files, most-recent: 2026-05-14)
│   └── RESUME-NEXT-SESSION.md
├── specs/                                          Design docs
│   ├── brand-dna-brain-spec-v1.md
│   ├── claude-design-brief.md
│   ├── data-hub-468216-640f1fa4aadf.json           GCP service-account JSON (committed — note 1)
│   ├── image.png
│   ├── p0-completion-summary.md
│   ├── p0-data-foundation-plan-v1.md
│   ├── references/                                 v2 UI build references + screenshots
│   ├── supabase-schema-spec-v1.md
│   ├── ui-organization-spec-v1.md
│   └── vercel-bigquery-setup.md
├── tests/                                          Pytest smoke tests (2 files)
│   ├── test_seed_idempotent.py
│   └── test_smoke_supabase.py
└── web/                                            Next.js 16 frontend
    ├── .env.local                                  2 vars (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    ├── .python-version
    ├── AGENTS.md / CLAUDE.md                       Warns "this is NOT the Next.js you know"
    ├── README.md
    ├── api/                                        Vercel Python serverless functions (§3)
    │   ├── clients.py
    │   ├── clients/[id].py
    │   └── properties/[slug]/
    │       ├── competitors.py
    │       └── projects.py
    ├── app/                                        Next.js App Router (§3)
    │   ├── layout.tsx
    │   ├── page.tsx
    │   ├── globals.css
    │   ├── favicon.ico
    │   ├── clients/
    │   │   ├── page.tsx
    │   │   └── [id]/page.tsx
    │   └── properties/[slug]/
    │       ├── layout.tsx
    │       ├── page.tsx
    │       ├── actions.ts                          Server actions for Brand DNA edits
    │       ├── keywords/page.tsx
    │       ├── pages/page.tsx
    │       ├── pages/actions.ts                    Server action for audit_action edits
    │       └── projects/page.tsx
    ├── components/                                 (§4)
    │   ├── AuditActionChip.tsx
    │   ├── BrandDnaBodyEditor.tsx
    │   ├── BrandDnaContentEditor.tsx
    │   ├── Sidebar.tsx
    │   └── ui/                                     7 shadcn primitives
    ├── lib/
    │   ├── supabase.ts
    │   └── utils.ts
    ├── public/                                     SVGs + 2 standalone HTML mockups
    │   ├── hierarchy-illustration.html
    │   └── v2-ui-mockup.html                       Large static mockup (§4 note)
    ├── components.json                             shadcn config (style "base-nova")
    ├── next.config.ts                              Empty config
    ├── next-env.d.ts
    ├── package.json / package-lock.json
    ├── postcss.config.mjs
    ├── requirements.txt                            One line: skyward-common v1.4.1
    ├── tsconfig.json
    └── vercel.json
```

Note 1: `specs/data-hub-468216-640f1fa4aadf.json` is named like a Google service-account key file. It is tracked in git (this is a fact; no recommendation).

## 3. Routes / pages

### App Router pages

| Path | File | Data source | Status |
|---|---|---|---|
| `/` | `web/app/page.tsx` | none (static copy) | Welcome screen. Body text reads "Read-only. No auth." |
| `/clients` | `web/app/clients/page.tsx` | `fetch` → `/api/clients?include_counts=true` (Python fn → BQ Meta) | Real data. SSR (`cache: "no-store"`). Renders error panel on fetch failure. |
| `/clients/[id]` | `web/app/clients/[id]/page.tsx` | `fetch` → `/api/clients/[id]` (Python fn → BQ Meta) | Real data. Renders `client`, `owned_domains`, `projects`. Competitors block removed (now lives on property page; see comment at line 192). |
| `/properties/[slug]` | `web/app/properties/[slug]/page.tsx` | Supabase `property` + `brand_dna_section` tables, plus `fetch` → `/api/properties/[slug]/competitors` | Real data. Renders Brand DNA section cards in `SECTION_ORDER` with `BrandDnaBodyEditor` or `BrandDnaContentEditor` per section, plus a `CompetitorsCard` injected in the SECTION_ORDER slot. Drops any `competitors` row from Supabase (BQ Meta is canonical). |
| `/properties/[slug]/pages` | `web/app/properties/[slug]/pages/page.tsx` | Supabase `property` + `page` tables | Real data. Lists URL, page_type, status_code, audit_action (editable inline via `AuditActionChip`), word_count. |
| `/properties/[slug]/projects` | `web/app/properties/[slug]/projects/page.tsx` | `fetch` → `/api/properties/[slug]/projects` (Python fn → Supabase + BQ Meta) | Real data. Lists BQ projects whose linked domains match the property's `primary_domain` + `additional_domains`. |
| `/properties/[slug]/keywords` | `web/app/properties/[slug]/keywords/page.tsx` | none | **Placeholder.** Static "Keywords — coming soon" panel. Top comment: *"Lit up by the adaptive-tab logic when an SEO project is active … real keyword surface lands when Adam's keyword aggregate pipeline (Phase 3) is ready."* |
| `/properties/[slug]/campaigns` | (no file) | — | Referenced as a candidate tab in `properties/[slug]/layout.tsx` line 62 when `paid_search`/`paid_social` projects exist on the property, but **no page.tsx exists** — clicking would 404. |

### Layouts / error / loading

| File | Purpose |
|---|---|
| `web/app/layout.tsx` | Root layout. Wraps children in `flex` with `<Sidebar />` (server component) + `<main>`. Metadata title `"Skyward SEO"`. |
| `web/app/properties/[slug]/layout.tsx` | Property header (client name, property name, domain+url_prefix, pipeline_phase badge) + adaptive tab strip. Calls `getProperty(slug)` from Supabase and `getProjectTypes(slug)` from the projects API. Tabs: Brand DNA, Pages (always); Keywords (if `seo`/`seo_pipeline` project); Campaigns (if `paid_search`/`paid_social` project); Projects (always). Calls `notFound()` if property missing. |

No `error.tsx`, `loading.tsx`, `not-found.tsx`, `template.tsx`, or `middleware.ts` anywhere in `web/`.

### Server actions (`"use server"`)

| File | Exports | Behaviour |
|---|---|---|
| `web/app/properties/[slug]/actions.ts` | `updateBrandDnaBody`, `updateBrandDnaContentKey` | Both write to `brand_dna_section` via the service-role `supabase` client. Stamp `updated_by: "ui:prototype"` (hardcoded — no auth context). Call `revalidatePath(/properties/${slug})`. |
| `web/app/properties/[slug]/pages/actions.ts` | `updateAuditAction` | Validates against `VALID_ACTIONS` set, updates `page.audit_action` + `audit_decided_by: "ui:prototype"` + timestamp, revalidates the pages tab. |

### Vercel Python functions (`web/api/`)

| Endpoint | File | What it does |
|---|---|---|
| `GET /api/clients?search&include_counts` | `web/api/clients.py` | `MetaClient.list_clients(...)` on BQ `data-hub-468216.Meta.clients` (etc). Returns `{clients, count}`. |
| `GET /api/clients/<id>` | `web/api/clients/[id].py` | `MetaClient.get_client`, `.get_client_domains` (owned + competitor), `.list_projects(client_id)`. Returns 404 if client missing. |
| `GET /api/properties/<slug>/competitors` | `web/api/properties/[slug]/competitors.py` | Looks up property via Supabase REST (PostgREST direct call, no supabase-py). Then runs a hand-written BQ SQL against `Meta.client_domains` + `Meta.clients` + `Meta.domains` to find the owning client for that domain and its competitors. Same comment block notes "every property under one client currently sees the same competitor list — known limitation of the BQ data shape today, not a bug." |
| `GET /api/properties/<slug>/projects` | `web/api/properties/[slug]/projects.py` | Supabase REST lookup of property, then hand-written BQ SQL across `Meta.projects` + `Meta.project_domains` + `Meta.domains` matching on `primary_domain` ∪ `additional_domains`. |

All four functions share the same singleton-`MetaClient`/`BigQueryClient` init pattern, same `_row_to_json` helper, and the same env-handling pattern (KeyError → 500 with "missing env var: X"). None of them write back to either store.

## 4. Components

| File | Server/Client | Description |
|---|---|---|
| `web/components/Sidebar.tsx` | Server (no `"use client"`, fetches Supabase at render) | Left nav. Reads `client` + `property` tables (where `status='active'`). Shows hardcoded nav items: Home, Clients, ⚡ Signals (greyed/disabled), ▶ Runs (greyed/disabled). Groups properties under their client when a client has more than one. Phase badge per property. Footer: "Paul Skirbe". |
| `web/components/AuditActionChip.tsx` | Client | Inline `<Select>` dropdown for `audit_action`. Optimistic update via `useTransition`; reverts on error. 8 actions with color mapping. Calls `updateAuditAction` server action. |
| `web/components/BrandDnaBodyEditor.tsx` | Client | Click-to-edit `<textarea>` for prose `body` fields. Optimistic save on blur via `updateBrandDnaBody`. Esc cancels. Autosizes. |
| `web/components/BrandDnaContentEditor.tsx` | Client | Click-to-edit struct editor for `content` jsonb. Detects field kind per key (`short-string`, `long-string`, `number`, `string-array`, `json`) and renders the appropriate inline editor. Each field saves independently via `updateBrandDnaContentKey`. JSON fields have an explicit Save button; others save on blur. String-array supports add/edit/remove chips. |
| `web/components/ui/badge.tsx` | (shadcn) | shadcn `badge` |
| `web/components/ui/button.tsx` | (shadcn) | shadcn `button` |
| `web/components/ui/card.tsx` | (shadcn) | shadcn `card` |
| `web/components/ui/select.tsx` | (shadcn) | shadcn `select` (wraps `@base-ui/react`) |
| `web/components/ui/separator.tsx` | (shadcn) | shadcn `separator` |
| `web/components/ui/table.tsx` | (shadcn) | shadcn `table` |
| `web/components/ui/tabs.tsx` | (shadcn) | shadcn `tabs` |

**Note on `web/public/v2-ui-mockup.html`**: this is a standalone, non-React HTML mockup of a future v2 UI. It is served as a static file at `/v2-ui-mockup.html`. It is *not* wired into the app's routing or components. `web/public/hierarchy-illustration.html` is similar.

## 5. Data layer

### `web/lib/`

- **`web/lib/supabase.ts`** (8 lines) — exports a single `supabase` instance:
  ```ts
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  ```
  No browser/server split. No anon-key client. The README's `SUPABASE_ANON_KEY | web app (RLS-gated)` line does not match the code — the app uses the service-role key everywhere, which bypasses RLS.
- **`web/lib/utils.ts`** (6 lines) — `cn(...inputs)` = `twMerge(clsx(inputs))`. Standard shadcn helper.

There is no `web/lib/bigquery/` or `web/lib/bq.ts`. All BQ access is server-side Python in `web/api/*.py` via `skyward.data.bigquery.BigQueryClient` and `skyward.data.meta.MetaClient` from skyward-common.

### Queries that exist

Supabase queries (TypeScript, via `supabase-js`):
- `property.select("id").eq("slug", slug).single()` — used by 3 pages
- `property.select("id, slug, name, primary_domain, url_prefix, pipeline_phase, client:client_id(name, slug)").eq("slug", slug).single()` — property layout
- `brand_dna_section.select(...).eq("property_id", id)` — Brand DNA page
- `page.select(...).eq("property_id", id).order("audit_action")` — Pages tab
- `brand_dna_section.update({body, updated_by, updated_at}).eq("id", sectionId)` — server action
- `brand_dna_section.select("content").eq("id", id).single()` then `.update({content, ...}).eq("id", id)` — content key edit
- `page.update({audit_action, audit_decided_by, audit_decided_at}).eq("id", pageId)` — audit action
- `client.select("id, slug, name").eq("status", "active").order("name")` — sidebar
- `property.select("id, client_id, slug, name, pipeline_phase").eq("status", "active").order("name")` — sidebar

Supabase via raw PostgREST (Python, in `web/api/properties/[slug]/*.py`):
- `GET /rest/v1/property?slug=eq.<slug>&select=...` with `apikey` + `Authorization: Bearer <SERVICE_ROLE_KEY>`

BigQuery queries:
- Hand-written SQL in `web/api/properties/[slug]/competitors.py` — `Meta.client_domains` JOIN `Meta.domains` JOIN `Meta.clients` to derive owning client + competitor list from a single domain string.
- Hand-written SQL in `web/api/properties/[slug]/projects.py` — `Meta.projects` JOIN `Meta.project_domains` JOIN `Meta.domains` on a domain array.
- Through `skyward-common`'s `MetaClient`: `.list_clients(search, include_counts)`, `.get_client(id)`, `.get_client_domains(client_id, is_competitor)`, `.list_projects(client_id=...)`.

### Mocks / fixtures / seeds

- No files named `*mock*` or `*fixture*` in source.
- `inference/tests/conftest.py` exists (pytest fixtures for inference tests — not in app runtime).
- `scripts/seed_clients_properties.py` is an idempotent upsert seed for the `client` + `property` tables.
- `scripts/backfill_phil_lasry_brand_dna.py` and `backfill_phil_lasry_pages.py` backfill a single specific property from a WQA workbook + inference modules. These are one-shot, not parameterized.

## 6. Schema state

### Migrations under `db/supabase/migrations/`

| File | Effect |
|---|---|
| `20260506100000_extensions.sql` | Enables `uuid-ossp`, `vector`, `pg_trgm`, `pg_cron`. Defines `pg_ext_check(ext_name)` helper. |
| `20260506100100_client_team.sql` | Creates `team_member` (FK → `auth.users`) and `client` (slug, name, legal_name, status, clickup_space_id, created_at, updated_at). RLS enabled on both — reads gated by `auth.role()='authenticated'`, writes additionally require `team_member.active`. |
| `20260506100200_property.sql` | Creates `property` (FK → `client`, slug, name, primary_domain, additional_domains text[], brand_voice_inheritance, status, pipeline_phase 0-6, timestamps). Indexes on client_id, slug, status, primary_domain. RLS same pattern. |
| `20260506100300_page.sql` | Creates `page` (FK → property, url, url_hash generated md5, title, h1, meta_description, content_text, content_hash, word_count, page_type, status_code, canonical_url, noindex, **embedding vector(1536)** with HNSW cosine index, audit_action enum, audit_target_url, audit_notes, audit_decided_at/by, timestamps). Unique (property_id, url). RLS same. Defines `pg_typeof_column(table, column)` helper. |
| `20260506100400_brain.sql` | Creates `brand_dna_section` (FK → property, section enum of 17 values, content jsonb, body text, confidence, source, updated_by, timestamps, unique (property_id, section)). Creates `project_brain_entry` (type enum, title, body, tags, confidence, source, status, superseded_by, related_entries uuid[], timestamps). RLS on both. Creates view `brand_dna_current` that aggregates all sections per property into one jsonb doc. |
| `20260513_brand_dna_section_history.sql` | Creates `brand_dna_section_history` (append-only snapshot table). Creates `snapshot_brand_dna_section()` trigger function. Installs `trg_snapshot_brand_dna_section` BEFORE UPDATE trigger on `brand_dna_section` that fires when `body` or `content` changes. |
| `20260514110000_property_hierarchy.sql` | Adds `property.url_prefix text`, `property.parent_property_id uuid` (self-FK ON DELETE SET NULL), `idx_property_parent` index. Extends `property.status` check to include `'inactive'`. Adds `unique nulls not distinct (primary_domain, url_prefix)` constraint. |
| `20260514110100_client_related.sql` | Adds `client.related_clients uuid[]` (default empty) + GIN index. Comment: "soft list of other client IDs that have a real-world relationship — franchisor↔franchisee, holding↔subsidiary, agency↔white-label. Deliberately NOT a foreign-key column." |

### Tables that should exist after all migrations apply

`team_member`, `client`, `property`, `page`, `brand_dna_section`, `brand_dna_section_history`, `project_brain_entry`.

Plus the view `brand_dna_current` and the helper functions `pg_ext_check`, `pg_typeof_column`, `snapshot_brand_dna_section`, plus trigger `trg_snapshot_brand_dna_section`.

### Live Supabase state

`supabase migration list` requires a `SUPABASE_ACCESS_TOKEN` not present in the environment Claude was invoked with, so live remote state was not directly verified during this inventory. The README states the project is `seo-platform-dev` at `https://ceyovawndjleprzjsjsr.supabase.co`. Migrations are applied with `cd db && supabase db push`.

## 7. Auth state

**There is no working sign-in flow.**

- No `web/middleware.ts`.
- No login / signin / signup / auth pages under `web/app/`.
- No `signIn`, `signUp`, `signOut`, `getUser`, `getSession`, `useUser`, or `auth.*` call anywhere in `web/**.{ts,tsx}` (verified via grep — only hit was the literal "No auth." string in `web/app/page.tsx` line 9).
- `web/lib/supabase.ts` constructs the client with `auth: { persistSession: false }` and uses `SUPABASE_SERVICE_ROLE_KEY`. Service-role bypasses RLS.
- Server actions stamp writes with literal string `"ui:prototype"` for `updated_by` / `audit_decided_by` — there is no user identity to record.
- DB-layer auth exists in the migrations: `team_member` table FK'd to `auth.users(id)`, and every RLS policy checks `auth.role() = 'authenticated'` + `EXISTS team_member.active`. **These policies are currently bypassed** because the app uses the service-role key.
- Sidebar shows hardcoded "Paul Skirbe" footer string.

Net: the app is an unauthenticated tool. Anyone with the production URL `https://skyward-seo-platform.vercel.app` can read and write Brand DNA, page audit actions, and trigger the BQ Python functions.

## 8. Environment

No `.env.example` or `.env.template` exists anywhere in the repo. `web/.env.local` exists (2 vars). The repo-root `.env` is a symlink to `/Users/paulskirbe/agency/.env` (the agency-wide secret store, 24 vars).

### Vars referenced in code

| Var | Referenced in | Required for | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `web/lib/supabase.ts`; `web/api/properties/[slug]/competitors.py`; `web/api/properties/[slug]/projects.py` (fallback when `SUPABASE_URL` unset) | **Boot of web app** | Present in `web/.env.local`. |
| `SUPABASE_SERVICE_ROLE_KEY` | `web/lib/supabase.ts`; `web/api/properties/[slug]/*.py`; `scripts/backfill_pages.py`; `scripts/supabase_client.py`; `tests/test_smoke_supabase.py` | **Boot of web app**; required by Python fns for Supabase REST lookups | Present in `web/.env.local`. |
| `VERCEL_URL` | `web/app/clients/page.tsx`; `web/app/clients/[id]/page.tsx`; `web/app/properties/[slug]/layout.tsx`; `web/app/properties/[slug]/page.tsx`; `web/app/properties/[slug]/projects/page.tsx` | Optional | Vercel injects automatically. Fallback to `http://localhost:3000`. |
| `GCP_DATAHUB_PROJECT_ID` | All 4 `web/api/*.py` functions | Required for Python fn calls (Clients, Competitors, Projects) — without it those endpoints return 500 "missing env var" | Expected value per README: `data-hub-468216`. |
| `GCP_SERVICE_ACCOUNT_JSON` | All 4 `web/api/*.py` functions | Required on Vercel; optional locally (ADC fallback) | One-line JSON string of a GCP service account. |
| `SUPABASE_URL` | `web/api/properties/[slug]/competitors.py`; `web/api/properties/[slug]/projects.py` (preferred over `NEXT_PUBLIC_SUPABASE_URL`); `scripts/supabase_client.py`; `tests/test_smoke_supabase.py` | Required for Python paths that don't fall back | Same URL as the `NEXT_PUBLIC_` one. |
| `OPENAI_API_KEY` | `inference/client.py`; `scripts/pull_plasry_content_from_bq.py` | Required for inference/backfill scripts. Not used by the web app at runtime. | |

### Vars in `web/.env.local` (committed-out via `.env*` rule in `web/.gitignore`)

```
NEXT_PUBLIC_SUPABASE_URL=https://ceyovawndjleprzjsjsr.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<value>
```

### Vars in `/Users/paulskirbe/agency/.env` (symlinked as repo-root `.env`)

Names only (24 total): `ANTHROPIC_API_KEY`, `CLICKUP_API_TOKEN`, `DATABASE_URL_PROD`, `DATAFORSEO_API_LOGIN`, `DATAFORSEO_API_PASSWORD`, `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `ENV`, `GEMINI_API_KEY`, `GOOGLE_KG_API_KEY`, `HUGGINGFACE_API_KEY`, `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`, `SCOPE_BUILDER_DEPLOY_PASSWORD`, `SKOOL_EMAIL`, `SKOOL_PASSWORD`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_ANON_KEY`, `SUPABASE_DB_PASSWORD`, `SUPABASE_POOLER_URL`, `SUPABASE_PROJECT_REF`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `XAI_API_KEY`.

The `GCP_*` vars are **not** in the agency .env — they live only in Vercel's project env per README and `session-notes/2026-05-14-vercel-python-bq-credentials.md`.

## 9. Recent commits

`git log --oneline -30`:

```
e1027c3 docs(references): review Adam's pre-Iceland handoff docs
25631ad docs(references): May 15 Adam check-in — application implications
15d93d7 docs(references): P0 ↔ v2 UI deep field comparison (Client + Brand DNA)
be30608 docs(references): process library ↔ v2 UI gap analysis
b3f9f6b docs(mockup): Identity fields + Proof tab back + 3 new main tabs
9954a4a docs(mockup): rebuild Brand Terms screen to match reference
e6a26ef docs(mockup): add Voice & Tone, Offerings, Brand Terms screens
692bfc7 docs(mockup): add Target Audience + Positioning fields to Identity form
9edb05a docs(mockup): restructure Brand DNA subnav + add Identity form screen
fdb9371 docs(references): capture 4 Brand DNA screenshots as written reference
bda75a3 docs: add specs/references/ folder for UI build artifacts
03604d6 docs(mockup): consolidate Brand DNA subnav (13 → 10 items)
c6f4f2f docs(mockup): move Brand DNA Assistant subcopy into card header
af02816 docs(mockup): update Brand DNA Assistant copy + placeholder
6888cdb docs(mockup): Brand DNA subnav + Overview surface
b5e54db docs(mockup): add Signals + Activity screens to v2 mockup
348a932 docs: v2 UI/UX mockup at /v2-ui-mockup.html
93e5fa3 feat(web): adaptive tabs on /properties/[slug] driven by project type
d334663 feat(web): competitor domains move from /clients/[id] to property Brand DNA
2e873d8 docs: hierarchy illustration HTML at /hierarchy-illustration.html
a6d24d1 Merge feat/p1-clients-via-bq: /clients via BQ Meta + hierarchy framework
3e9c5e9 fix(web): /api/properties/[slug]/projects falls back to NEXT_PUBLIC_SUPABASE_URL
3c20a40 feat(web): Projects tab on /properties/[slug]
47102ed feat(db): hierarchy framework v1 schema + spec
de4587c feat(web): /clients/[id] detail page sourced from BQ Meta
d7c8fd0 feat(web): /clients page sourced from BQ Meta via Vercel Python function
ea00166 chore: standalone repo plumbing — gitignore, repo-relative .env, merge plan
14064ff docs: 2026-05-13 session note — content editor + TNA backfill + DB plan
20dd4ac docs: 2026-05-13 session note — repo migration
159cada chore: trigger Vercel build after repo migration
```

Of the last 30 commits, 16 are `docs(mockup)` / `docs(references)` against `web/public/v2-ui-mockup.html` and the `specs/references/` folder. The most recent app code commit is `93e5fa3 feat(web): adaptive tabs` (8 commits back from HEAD).

## 10. TODOs / stubs

`grep -rIn "TODO|FIXME|XXX|HACK|stub|STUB"` across `web/`, `scripts/`, `inference/`, `db/`, `tests/` returned **zero matches** in source files.

Placeholder / unfinished surface area that is *not* marked with a TODO comment but is visible in the code:

| Location | Description |
|---|---|
| `web/app/properties/[slug]/keywords/page.tsx` | Entire page is a placeholder card. No data calls. |
| `web/app/properties/[slug]/layout.tsx` line 62 | Adds a `Campaigns` tab when `paid_search`/`paid_social` project exists, but `web/app/properties/[slug]/campaigns/page.tsx` does not exist. |
| `web/components/Sidebar.tsx` lines 66-67 | "⚡ Signals" and "▶ Runs" entries rendered as `<div>` with `text-slate-400` (greyed) — not links, no routes. |
| `web/app/properties/[slug]/actions.ts` lines 15, 44 | Hardcoded `updated_by: "ui:prototype"`. |
| `web/app/properties/[slug]/pages/actions.ts` line 29 | Hardcoded `audit_decided_by: "ui:prototype"`. |
| `web/app/page.tsx` line 9 | Body text "Read-only. No auth." — accurate description, not a TODO. |
| `web/api/properties/[slug]/competitors.py` lines 11-15 | Comment block: *"every property under one client currently sees the same competitor list — known limitation of the BQ data shape today, not a bug."* |
| `web/app/properties/[slug]/page.tsx` lines 152-154 | Comment: *"Drop any Supabase brand_dna_section with section='competitors' — BQ Meta is canonical… Re-introduce when BQ Meta migrates and competitors become editable in Supabase."* |
| `web/app/clients/[id]/page.tsx` lines 192-194 | Comment: *"Competitor domains moved to property/Brand DNA view per the 2026-05-14 hierarchy framework."* |
| `web/AGENTS.md` | Single warning: Next.js has breaking changes vs. training data; read `node_modules/next/dist/docs/`. |

## 11. Honest assessment

### What works end-to-end today

1. **Browse clients from BigQuery Meta.** `/clients` lists every client row from BQ with optional domain/competitor/project counts. `/clients/[id]` opens that client's detail with owned domains and projects.
2. **Property header + adaptive tabs.** `/properties/[slug]` renders the header (client name, property name, domain+prefix, pipeline phase) and the tab strip. The tab strip is genuinely dynamic — it queries BQ projects for the property's domain and lights up Keywords / Campaigns based on what's running.
3. **Brand DNA view + click-to-edit.** Brand DNA sections render from Supabase. Bodies are inline-editable; structured `content` jsonb fields are inline-editable per key with type-aware widgets (short string / long string / number / string array / raw JSON). Edits go to Supabase via server actions; the `trg_snapshot_brand_dna_section` trigger writes an audit row to `brand_dna_section_history`. Optimistic UI with rollback on error.
4. **Pages triage.** `/properties/[slug]/pages` lists pages from Supabase with an inline `audit_action` dropdown that persists immediately via a server action.
5. **Competitors panel.** Renders BQ Meta competitors for the property's primary domain inline in the Brand DNA view.
6. **Projects tab.** `/properties/[slug]/projects` lists BQ projects matched to the property by domain.
7. **Sidebar nav.** Auto-populates from Supabase `client` + `property` (status='active'). Groups multi-property clients.

### Closest thing to a working user flow

Open `/properties/<slug>` for a property that already has rows in Supabase `property`, `brand_dna_section`, and `page`. From there a user can:

1. Read the Brand DNA, click into any field, edit, blur to save.
2. Switch to the Pages tab, change `audit_action` per URL via the inline dropdown.
3. Switch to the Projects tab and see what BQ projects are tied to this property's domains.

This works for `phil-lasry` (the property that has bespoke backfill scripts: `scripts/backfill_phil_lasry_brand_dna.py` and `scripts/backfill_phil_lasry_pages.py`) and for any other property where the corresponding rows have been seeded.

### What it would take to put a real engagement like BusBank in front of this app

To get BusBank from "nothing" to "visible at `/properties/busbank` with usable Brand DNA + Pages + Projects":

1. **`client` row in Supabase** — add via `scripts/seed_clients_properties.py` (currently hardcoded to a specific set, would need to be edited or a new seed written) or via the admin portal at `skyward-platform` (which writes to BQ Meta, not Supabase — so today this means a manual SQL `INSERT` or running a local script).
2. **`property` row in Supabase** — same path. Needs slug, primary_domain, additional_domains, url_prefix, pipeline_phase.
3. **Domain registration in BQ Meta** (`data-hub-468216.Meta.client_domains` + `Meta.domains`) — required for the Competitors and Projects panels to surface anything. This happens in Adam's `skyward-platform` admin portal, not in this app.
4. **`page` rows** — populate via `scripts/backfill_pages.py` from a WQA workbook. This script reads columns by header name so it should work across workbook versions, but no BusBank-specific entrypoint script exists yet (the existing ones are `phil-lasry`-specific).
5. **`brand_dna_section` rows** — two paths: (a) run inference modules (`inference/voice_tone.py`, `inference/brand_story.py`, `inference/brand_terms.py`, `inference/proof.py`, `inference/future_audience.py`) against crawled BusBank content following the pattern in `scripts/backfill_phil_lasry_brand_dna.py`; (b) leave empty and edit by hand in the UI.
6. **Page content / embeddings** — `pull_plasry_content_from_bq.py` pulls from the `ScreamingFrog.custom_javascript_page_content` BQ table. BusBank would need either equivalent crawl output already in BQ, or a different ingest path.
7. **Auth** — there is none. The app is currently a single-tenant, no-login tool. If BusBank is a *client-facing* deliverable (i.e., the BusBank team logs in to see it), auth has to be added before anything else. If BusBank is internal-only (Skyward staff editing on behalf of the client), the current "anyone with the URL" model technically works but the service-role key is also being used for all writes, so any visitor can edit.
8. **`updated_by` identity** — every Brand DNA and Pages edit is currently stamped `"ui:prototype"`. Useful audit trail would require swapping that string for the editing user's identity, which depends on (7).
9. **Two-store rule (README §"Two-store architecture")** — the app currently obeys: Brand DNA + page audits live in Supabase; clients, domains, projects, competitors live in BQ Meta. Adding BusBank means provisioning rows in *both* stores. The README notes Adam will migrate BQ Meta into Supabase later, which would collapse this.

### Cross-repo seams (made explicit per the brief)

This app depends on two sibling repos:

**`skyward-common`** (Python shared library at `github.com/skyward-org-platform/skyward-common`)
- Wiring: PyPI-style git pin in `web/requirements.txt`:
  ```
  skyward-common @ git+https://github.com/skyward-org-platform/skyward-common.git@v1.4.1
  ```
- Imports (Python side only — no npm dep):
  - `from skyward.data.bigquery import BigQueryClient` — used in all 4 `web/api/*.py` functions
  - `from skyward.data.meta import MetaClient` — used in `web/api/clients.py` and `web/api/clients/[id].py`
- Methods called on `MetaClient`: `.list_clients(search, include_counts)`, `.get_client(id)`, `.get_client_domains(client_id, is_competitor)`, `.list_projects(client_id=...)`
- The other Python work in this repo (`scripts/`, `inference/`, `tests/`) is described in README as running from the `~/agency` uv environment which also pulls `skyward-common` v1.4.1.
- Per README rule: read-only dep. No PRs back from this repo.

**`skyward-platform`** (broader backend / pipeline orchestration + admin portal at `github.com/skyward-org-platform/skyward-platform`)
- Wiring: **none in code.** No npm import, no Python import, no submodule, no monorepo workspace.
- The connection is operational: both apps read/write the same BigQuery dataset `data-hub-468216.Meta.*`. `skyward-platform` is the canonical write surface for clients/domains/competitors/projects in BQ during this phase. This app reads those tables via skyward-common but never writes them.
- The connection is surfaced in UI: `/clients` and `/clients/[id]` pages link to `https://github.com/skyward-org-platform/skyward-platform` with copy "Edits live in the admin portal during this phase."

**No monorepo tooling.** No Turborepo, Nx, Lerna, pnpm workspaces, yarn workspaces, or git submodules anywhere. The three repos are coupled via:

1. **BigQuery dataset** `data-hub-468216.Meta.*` — shared data plane (this app + admin portal both read; admin portal writes)
2. **Supabase project** `seo-platform-dev` (`ceyovawndjleprzjsjsr.supabase.co`) — this app's write surface
3. **skyward-common** as a git-pinned Python package — versioned at v1.4.1, used by both this app's Python functions and the agency-wide Python environment
4. **Shared `.env`** at `/Users/paulskirbe/agency/.env` (symlinked here) — single secret store for the local agency workspace; Vercel has its own equivalent

The seams are clear and deliberate. The README's "Two-store architecture (interim rule, 2026-05-14)" section is the authoritative description of why they look this way: Adam owns BQ Meta and the admin portal; this app owns the new Brand DNA / pages / project_brain Supabase surface; the two are deliberately disconnected until Adam migrates Meta into Supabase.

---

## 12. Update Log

This section captures material changes since the initial 2026-05-16 inventory. Each entry points to a session note for the full record.

### 2026-05-21 — Execution surface shipped (merged to main, production-deployed)

Single new route `/properties/[slug]/pages` becomes the canonical execution surface — mirrors the 12-tab WQA workbook (Phase 1) and the ~14-tab Technical SEO Audit workbook (Phase 2) in one app surface, scoped per property. 40-file diff merged via PR #1 (`b214f0d`). Production: https://skyward-seo-platform.vercel.app.

**New tables in `seo-platform-dev`:**
- `page_execution` + `page_execution_history` + `snapshot_page_execution` trigger — per-URL workflow state (status, owner, due, notes, target URL, restore content spec).
- `page_check_state` + `page_check_state_history` + trigger — per-URL × Phase 2 check workflow state.
- `url_relationship` — cross-URL edges (table only, no UI surface).

**New routes / sub-routes:**
- `/properties/[slug]/pages` gains a TRIAGE / TECHNICAL AUDIT mode switcher. Triage sub-tabs (per `?action=`): Overview, All URLs, Optimize, Redirect, Restore, Remove, Consolidate, Evaluate, Investigate, Canonical Audit, Action Legend. Audit sub-tabs (per `?mode=audit&view=`): Overview/Issue Summary, Audit Checklist, URL Priority, Architecture, Schema, Page Speed (Blocked), Broken Links (Blocked). Per-check drill at `?view=checklist&check={T6|C8|...}`.

**New components:**
- `components/UrlDrawer.tsx` — universal per-URL drawer (Signals / Phase 1 / Phase 2 Checks / Execution / Restore Spec / History / footer).
- `components/wqa/{CanonicalAuditTab,ActionLegendTab,ConsolidateTab}.tsx`.
- `components/audit/{AuditModeShell,AuditOverviewTab,AuditChecklistTab,AuditCheckDetailView,AuditUrlPriorityTab,AuditArchitectureTab,AuditSchemaTab,AuditPageSpeedTab,AuditBrokenTab}.tsx`.

**New libs:**
- `lib/page-execution.ts`, `lib/page-check-state.ts` — typed queries.
- `lib/wqa-checks.ts` — TypeScript port of T/C check predicates from `delivery/tna/build_phase2_technical.py`.

**New server actions** (extending `app/properties/[slug]/pages/wqa-actions.ts`):
- `setExecutionStatus`, `setExecutionField` (page_execution writes)
- `setCheckStatus`, `setCheckNotes`, `setCheckOwner` (page_check_state writes)

**New API endpoints:**
- `GET /api/wqa/export?slug=X&phase=1|2` — streams the canonical xlsx (12-tab Phase 1 OR ~14-tab Phase 2), byte-identical to `delivery/tna/build_phase1_wqa.py` / `build_phase2_technical.py` output. Backed by `web/api/wqa/_phase1_builder.py` (~1156 LoC) + `_phase2_builder.py` (~916 LoC) — forks of those standalone scripts.

**Lib fixes shipped this session:**
- `lib/supabase.ts` — lazy Proxy singleton (avoids "supabaseKey is required" module-load race in Next.js 16 server render).
- `lib/api-base.ts` — preview/dev VERCEL_ENV → `VERCEL_URL`; production → `VERCEL_PROJECT_PRODUCTION_URL`. Prevents cross-env API auth mismatches.
- `lib/auth.ts` — `requireWriteToken` fail-open when `APP_WRITE_TOKEN` env unset (matches proxy middleware; Supabase RLS is the real backstop).

**Vercel plan:** Pro (upgraded this session — Hobby plan capped at 12 functions, blocked initial preview deploy).

**Deployment Protection:** disabled for previews this session to allow server-to-server fetches; production gates writes via APP_WRITE_TOKEN cookie.

**Followups tracked in `session-notes/2026-05-21-execution-surface-shipped.md`:**
1. Python WQA builders duplicated between `web/api/` and `~/agency/delivery/tna/` — drift risk.
2. Audit-mode Status writes `page_execution` not `page_check_state` — semantic conflation per spec edit-boundaries table.
3. Drawer "Open full page" link 404s.
4. History reader placeholder — schema in place, UI query pending.
5. Notes-prefix encoding for Remove "Recommended Action" is fragile.
6. Untracked `web/` subdirectory restructure still in working tree; git-triggered Vercel builds remain unreliable until committed (workaround: `vercel --prod` from local).

**Reference docs added this session:**
- `docs/superpowers/specs/2026-05-20-platform-execution-surface-design.md` — design spec
- `docs/superpowers/plans/2026-05-20-platform-execution-surface.md` — implementation plan
- `docs/web-app-as-built-2026-05-21.md` — as-built mapping each surface to its source-of-truth SOP

**Session note:** `session-notes/2026-05-21-execution-surface-shipped.md`
