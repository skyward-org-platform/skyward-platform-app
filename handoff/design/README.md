# Design — V1.1 reference

What's in here and what order to read it in.

## Files

| File | What it is |
|---|---|
| `v2-ui-mockup.html` | **Canonical visual reference.** A single self-contained HTML file containing 16 fully-styled screens covering the platform's operational surface. Source of truth for all V1.1 visual + structural work. Also viewable at `/handoff/v2-ui-mockup.html` on the deployed site (behind the existing auth gate) via the copy at `web/public/handoff/v2-ui-mockup.html`. |
| `v2-tokens.css` | The `:root` CSS custom properties extracted from the mockup, annotated. Drop into `web/app/globals.css` during the visual refresh step (V1.1 Phase 3). |
| `v2-design-system.md` | Documentation of every design primitive: typography, surfaces, color semantics, status pill system, action pill system, phase strip, sidebar, card, completeness chip, activity item, tabs, subnav, histogram, buttons. The doc that answers "how does the v2 status pill differ from the v2 action pill" without spelunking the HTML. |
| `v2-screens.md` | One entry per screen (1–16). Each entry: name, intended route, purpose, key sections, data dependencies, "what's new" rationale paraphrased from the mockup's own rationale paragraph. |
| `README.md` | This file. |

## Read order for a fresh session

1. **`v2-ui-mockup.html`** — open in a browser. Skim all 16 screens. Read the change-log section at the end carefully (`#change`). This is the visual literacy step — every later doc references this file.
2. **`v2-design-system.md`** — read top to bottom. Pay particular attention to the "Status pill vs. action pill" section (the most common confusion) and the "Phase strip" section (the most-reused primitive).
3. **`v2-screens.md`** — skim the index. Read the specific entry for whatever surface you're implementing.

For ongoing work, the typical session pattern is:
- Building a screen → read its entry in `v2-screens.md`, find the corresponding section in the mockup, reference `v2-design-system.md` for any primitive that's unclear.
- Adding a new component → check `v2-design-system.md` first to see if the pattern already exists in the system.
- Tweaking visuals → reference `v2-tokens.css` for the canonical values; don't invent new ones.

## What this is NOT

There is another design package at `~/agency/operations/process-library/design/files (3)/` with its own README, design-system.md, tokens.css, screens.md, and data-model.md. **Do not use that one as a reference for V1.1.**

Why:
- It was designed around a different mental model (workspace / engagement / cluster / brief) for SEO pipeline phases that aren't built upstream.
- It defines a different Supabase schema (`workspaces`, `engagements`) that conflicts with the current `client → property → page → brand_dna_section` schema.
- It targets a dark theme; the platform-app stays light per the V1.1 brief.
- It's archived future-state reference for pipeline Phases 4–5 — a V2+ horizon, not the current iteration.

That package stays where it is. Don't delete it, don't modify it, don't read it during V1.1 work. The v2 mockup at `handoff/design/v2-ui-mockup.html` is the canonical reference for everything in V1.1.

## What V1.1 isn't doing

Per the brief:

- No schema changes (`brand_dna_section`, `page`, `property`, `client` etc. all stay as they are).
- No new BigQuery tables or datasets.
- No dark theme on platform-app.
- No touching `skyward-common`, `skyward-platform`, `goskyward-platform`, or `process-library`.
- No new auth model — the existing `requireWriteToken()` middleware + Vercel deployment protection stay.
- No cluster scoring / Eubanks formula / brief-generation surfaces.
- Project Brain (screen 16) is held until explicit sign-off — it's the one V1.1 phase that requires a new server-action surface (the schema already exists in `db/supabase/migrations/20260506100400_brain.sql`).

## Step-to-screen mapping

The brief's V1.1 phases map onto specific screens:

| Brief step | Screens |
|---|---|
| Step 3 — Structural reorganization | 4 (Property overview) + 5 (Brand DNA moved off `/properties/[slug]`). Reusable **PhaseStrip** built here, used in steps 4 and 6 too. |
| Step 4 — Dashboard | 1 (Workspace Dashboard) |
| Step 5 — Visual refresh | All screens — apply `v2-tokens.css`, build StatusPill + ActionPill components, tabular numerics, Inter font features |
| Step 6 — New primitives | 2 (Clients list with phase coverage bar) + 7 (Project cards) + the v2 sidebar with ⌘K |
| Step 7 — New surfaces (optional, on hold) | 16 (Project Brain) + 9 (Signals as a real surface, not just a card) |

Surfaces NOT in V1.1: 8 (Keywords future state — stays as a placeholder), 10 (Activity — possibly partial), 11–15 (Brand DNA subnav targets — visual work folded into Step 5, but the 10-item subnav structure itself is Step 3 territory).

## Ambiguity policy

When something isn't clear:

1. **Check the v2 mockup directly** — most ambiguities resolve by looking at the screen and reading its rationale paragraph.
2. **Check `v2-design-system.md`** for the relevant primitive.
3. **Ask Paul.**

Don't invent visual variations or new mental models. The mockup has been iterated on for weeks; its decisions are deliberate.
