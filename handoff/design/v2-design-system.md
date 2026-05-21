# v2 Design System

Documents the primitives in `v2-ui-mockup.html` (the canonical reference). Read this in conjunction with `v2-tokens.css` for the raw values and `v2-screens.md` for how primitives compose on each surface.

The design language is intentional: **heavier typographic hierarchy, refined neutral palette with one accent, denser information without feeling cluttered**. Inspirations called out by the mockup itself: Linear, Vercel, Stripe.

---

## Typography

**Family.** Inter is the only sans. Load via `next/font/google` (already wired). System fallbacks: `-apple-system, BlinkMacSystemFont, sans-serif`. Monospace fallback: `ui-monospace, SF Mono, Menlo, monospace`. Apply monospace inline on `.mono` for domain names, URLs, and IDs (table cells, prop card domain lines).

**Inter character variants.** Body sets `font-feature-settings: 'cv11', 'ss01'`. `cv11` is the single-storey `a`; `ss01` is the rounder dotless `i`. These give Inter its sharper, less-academic feel. Without them the brand reads more generic.

**Letter-spacing.** Body is `-0.011em`. Headings progressively tighter: `-0.02em` (h2 22px), `-0.025em` (gauge serif numerals + hero title), `-0.025em` doc header h1.

**Weights used.** 600 (semibold, headings/labels/strong) and 500 (medium, active items, buttons) — the design avoids regular 400 for any structural element. 400 is fine for prose paragraphs (`.screen-desc`, rationale text).

**Sizes.** No formal scale; mockup uses pixels directly. Common values: 9px (phase pill on sidebar property rows), 10px (eyebrow labels, status pills, tab badges), 11px (stat-tile label, small/xsmall body), 12px (sidebar items, body small), 13px (default body, table rows, card titles), 14px (sidebar name, hero metric values, button-larger text), 18px (gauge serif `pct-sign`), 22px (page header h2, screen-title, histogram numeric), 26px (hero h2, stat-tile big number), 28px (doc header h1), 36px (gauge serif percentage number).

**Numerics.** Anywhere a number appears in a tabular or financial context — stat tiles, table count columns, page counts, ranks, percentages, sidebar `sb-count`, `phase` pill — apply `font-variant-numeric: tabular-nums`. Easiest path: a `.tabular` utility class.

**Serif numerals.** Lora 500 at 36px appears in exactly one place: the percentage inside the Completeness Gauge on the Brand DNA Overview screen. The percent sign next to it stays Inter at 18px / 400 / `var(--text-muted)`. Do not use the serif anywhere else.

---

## Surface hierarchy

Three depths only, in order from bottom of the visual stack to top:

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#f7f7f8` | Page canvas (body) |
| `--surface` | `#ffffff` | Cards, panels, top nav, hero bands, primary stage |
| `--surface-alt` | `#fafafa` | Sidebar background, table thead, subnav, hero gradient end |

Hero bands frequently use a gentle linear gradient from `--surface-alt` (0%) to `--surface` (100%) — see `.prop-hero` in the mockup. That gradient is the only place colors blend.

---

## Borders

`--border` (`#e7e7ea`) is the default 1px solid. Border applies to everything: card edges, table row dividers, sidebar items, search input. Use `border-bottom-color: transparent` for "no border" states rather than `border: none` to avoid layout shifts.

`--border-strong` (`#d4d4d8`) appears only on hover for interactive elements (prop cards, histogram cells, buttons).

**Inheritance banner** is the only dashed border in the system — used to mark "Brand DNA inherited from parent property":

```
background: var(--violet-bg);
border: 1px dashed #c4b5fd;
border-radius: 8px;
color: #5b21b6;
```

---

## Color semantics

Beyond the surface/border/text triad, the palette is constrained:

| Token | Foreground | Background tint | Meaning |
|---|---|---|---|
| Emerald `#059669` | text + dot | `--emerald-bg` `#ecfdf5` | Active property, restore action, success, "filled" completeness, rank-improvement activity |
| Sky `#0284c7` | text + dot | `--sky-bg` `#f0f9ff` | Prospect property, optimize action, decision activity |
| Amber `#d97706` | text + dot | `--amber-bg` `#fffbeb` | Paused property, redirect action, undecided-warm (yellow row tint on Pages triage) |
| Rose `#dc2626` | text + dot | `--rose-bg` `#fef2f2` | Inactive (with rose), remove action, danger |
| Indigo `#4f46e5` | text + dot | `--indigo-bg` `#eef2ff` | Current phase on phase strip, completed project pill, edit activity dot, rationale rule, sweep progress fill |
| Violet `#7c3aed` | text + dot | `--violet-bg` `#f5f3ff` | AI / Brand DNA Assistant / inheritance banner / Source attribution ("agent:voice_tone_v1") |
| Slate `#64748b` | text + dot | `--slate-bg` `#f8fafc` | Inactive property, keep action, neutral |

Indigo is the closest thing to a secondary brand color — it appears on every phase strip's current cell, on completed pills, and on rationale rules. Treat it as "the design has an opinion here," not as decoration.

**Near-black `--accent: #18181b`** is the primary action color (primary button background, active sidebar item background) AND the "done" color on phase strips. The accent IS the brand — Skyward's wordmark in the doc header uses it, and the logo square in the sidebar brand row uses it.

---

## Status pill vs. action pill

This is the single most important distinction in the system and the docs question it must answer.

### Status pill (`.pill`)

Represents the **state of a thing that exists** — a property, an engagement, a project. Always paired with a leading 5px colored dot. Five variants only:

| Class | Meaning |
|---|---|
| `pill-active` | Engagement is currently being worked (emerald) |
| `pill-prospect` | New, not yet engaged (sky) |
| `pill-paused` | Was active, currently on hold (amber) |
| `pill-inactive` | Past engagement, archive-tier (slate) |
| `pill-completed` | Reached a terminal stage (indigo) |

Visual treatment: 10px font, 600 weight, uppercase, 0.04em tracking, `2px 8px` padding, 4px border-radius. Background is the tint (`--*-bg`); foreground is the named color.

### Action pill (`.action`)

Represents an **operator decision about what to do with something** — a triage outcome on a page. Used in the Pages tab on every row. Distinct palette specifically to avoid being read as state.

| Class | Meaning | Palette |
|---|---|---|
| `action-optimize` | Stay; improve it | sky |
| `action-restore` | Broken page to bring back | emerald |
| `action-redirect` | 301 to correct destination | amber |
| `action-consolidate` | Merge into another URL | violet |
| `action-remove` | Delete / noindex | rose |
| `action-keep` | Stay; no work needed | slate |
| `action-no_action` | Duplicate / system / excluded | neutral (`#f4f4f5` bg / `#71717a` fg) |
| `action-undecided` | Pending review | neutral (same as no_action; row gets warm-yellow background on Pages triage) |

Visual treatment is similar (10px, uppercase, 0.04em, 4px radius) but **NO dot prefix** and slightly tighter padding (`2px 7px`). The dot prefix is the visual cue that lets a reader distinguish: dot = state of a thing, no dot = decision made.

If you remember nothing else: **status pills have dots, action pills don't.**

---

## Phase strip

Used on the Dashboard active engagements table, the Clients list pipeline-coverage column, the Property hero, and every Project card. The hero variant has labels; everywhere else is the bare strip.

```
.phase-strip { display: flex; gap: 3px; }
.phase-cell  { flex: 1; height: 5px; background: #f0f0f2; border-radius: 1px; }
.phase-cell.done    { background: #18181b; }
.phase-cell.current { background: var(--indigo); }
```

7 cells (P0–P6). Render `done` for any phase strictly below the property's current phase; `current` for the current one; bare for upcoming.

Hero variant adds `.phase-cell-labels` row beneath: 7 spans with 9px text, `--text-subtle`, 0.04em tracking, content `P0 · P1 · …`.

Build this as **one reusable component** (`web/components/PhaseStrip.tsx`) — it appears in at least 4 places in v2.

---

## Sidebar

Width 248px. Background `--surface-alt`. Right border `--border`. Vertical flex column with `sb-foot` pinned to bottom via `margin-top: auto`.

**Structure, top to bottom:**

1. **`sb-brand`** (18/16/14 padding, bottom border) — 28px square logo (near-black bg, white "S", semibold 13px), brand name "Skyward Platform" (14px / 600), version eyebrow "v2 prototype" (10px / `--text-subtle`, 0.02em tracking).
2. **`sb-search`** — 12px margin, white bg, 1px border, 7px radius, 7/10 padding, 12px font, `--text-subtle`. Inline `🔍` icon + placeholder + `⌘K` keyboard hint on the right (`kbd` chip: `surface-alt` bg, 1px border, 10px monospace).
3. **`sb-group: Workspace`** — heading + 3-4 items (Dashboard / Clients / Activity / Signals). Heading is 10px / 600 / uppercase / 0.08em / `--text-subtle` / `12/8/6` padding. Item is 13px, 6/8 padding, 5px radius, `sb-icon` (14px width, `--text-muted` color) + label + optional `sb-count` (10px / `--text-subtle` / tabular). Hover: `#f0f0f2`. Active: `#18181b` bg + white text + white icon.
4. **`sb-group: Properties`** — heading + (per client) one `sb-client` row + N `sb-property` rows. `sb-client`: 11px / 500 / `--text-muted` with chevron suffix (9px / `--text-subtle`). `sb-property`: 12px, 22px left padding (to hang below the client header), 5/10 vertical/right padding, 5px radius. Each property has a 5px colored dot (using `.dot.active` / `.dot.prospect` / `.dot.inactive`) and a right-aligned `.phase` pill (9px / monospace / 0/4 padding / 3px radius / 1px `--border` outline / `--surface` bg / `--text-subtle` color, e.g. "P3").
5. **`sb-foot`** — top border, 12px padding, flex row with `sb-avatar` (26px circle, indigo-pink gradient, white initials, 11px semibold) + name (12px / 500) + role (10px / `--text-muted`).

**⌘K behavior** (per the brief): basic implementation is fine for V1.1 — exact-match search across client + property names, modal overlay, no fuzzy match yet.

---

## Card

Default container for grouped content. 1px `--border`, 10px radius, `--surface` background, `overflow: hidden` so the inner header divider doesn't bleed out the corners.

```
.card    { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.card-h  { padding: 14px 18px; border-bottom: 1px solid var(--border); display: flex; align-items: center; }
.card-h h3   { font-size: 13px; font-weight: 600; margin: 0; }
.card-h .src { margin-left: auto; font-size: 10px; color: var(--text-subtle); text-transform: uppercase; letter-spacing: 0.05em; }
.card-b  { padding: 18px; }
```

For tables inside cards, set `card-b` padding to 0 so the table fills edge-to-edge and the table's own borders align with the card edges.

**Variants in the wild:**
- **Stat tile** (`.stat-tile`): 1-row card. 16/18 padding. Label (11px uppercase) → big number (26px / 600 / tabular) → optional sub (11px / `--text-subtle`). Optional `.stat-trend` inline next to the number (`stat-up` emerald arrow, `stat-down` rose arrow).
- **Property card** (`.prop-card`): cursor pointer, hover bumps the border to `--border-strong` and adds a soft shadow. Name (14px / 600) → domain (12px monospace) → meta-row.
- **DNA section** (`.dna-section`): same shape but flatter — used in the Brand DNA editor. Each row gets a 12px-top-margin `.dna-field` with a label (`.k` — 11px uppercase) and value (`.v` — 13px / 1.55 line-height).

---

## Completeness chip

Three states for whether a Brand DNA section has data:

| Class | Background | Foreground | Dot | Meaning |
|---|---|---|---|---|
| `compl-chip.filled` | `--emerald-bg` | `--emerald` | emerald | Filled locally |
| `compl-chip.inherited` | `--violet-bg` | `--violet` | violet | Inherited from parent property |
| `compl-chip.empty` | transparent | `--text-subtle` | `--text-subtle` | Dashed 1px `--border`, no fill |

Visual: 5/10 padding, 5px radius, 11px / 500. Always paired with a leading 5px colored dot (or matching dashed for empty).

Used in the Completeness Gauge card on the Brand DNA Overview screen (s5).

---

## Activity item

Pattern for the recent-activity feed (Dashboard right column) and the Activity surface (s10).

```
.activity-item { padding: 10px 0; border-bottom: 1px solid var(--border); display: flex; gap: 12px; font-size: 12px; }
.activity-dot  { width: 6px; height: 6px; border-radius: 50%; margin-top: 6px; flex-shrink: 0; background: var(--text-subtle); }
.activity-dot.edit     { background: var(--indigo); }
.activity-dot.decision { background: var(--sky); }
.activity-dot.rank     { background: var(--emerald); }
.activity-meta { color: var(--text-muted); margin-top: 1px; }
```

Three densities (per the s10 rationale):
- **Today**: full treatment — avatar + actor + diff line. Brand DNA edits render diffs inline (e.g., `+ B2B-fluent · − casual`).
- **Yesterday**: denser, single line + timestamp.
- **This week**: single-line, no diff details.

AI events render with a violet `AI` avatar + a cost line under the body. System events use a settings glyph (no avatar).

Last item in a group: `border-bottom: none`.

---

## Tabs

Used on the Property surface to switch between Overview / Brand DNA / Pages / Projects / Keywords / etc.

```
.tabstrip { border-bottom: 1px solid var(--border); padding: 0 32px; background: var(--surface); display: flex; }
.tab      { padding: 12px 16px; font-size: 13px; color: var(--text-muted); border-bottom: 2px solid transparent; margin-bottom: -1px; }
.tab:hover  { color: var(--text); }
.tab.active { color: var(--text); border-bottom-color: #18181b; font-weight: 500; }
.tab-badge  { background: var(--bg); color: var(--text-muted); padding: 1px 6px; border-radius: 3px; font-size: 10px; tabular; }
.tab.active .tab-badge { background: #18181b; color: white; }
```

**Tab cluster separators** (`.tab-cluster-sep`) — 1px×20px vertical divider in `--border` — visually group:
- always-on tabs (Overview, Brand DNA, Pages)
- ⎮ project-driven tabs (Keywords, Campaigns — only when a relevant project exists)
- ⎮ meta tabs (Projects, Project Brain)

---

## Subnav (Brand DNA tab)

Distinct from primary tabs. Sits below the main tabstrip, on `--surface-alt` background. Used to navigate within Brand DNA's 10 sections (Overview · Identity · Voice & Tone · Offerings · Brand Terms · Site Structure · Commercial Policy · Audiences · Personas · Seed Keywords).

```
.subnav      { display: flex; gap: 2px; padding: 8px 32px; background: var(--surface-alt); border-bottom: 1px solid var(--border); font-size: 12.5px; }
.subnav-item { padding: 5px 12px; color: var(--text-muted); border-radius: 5px; cursor: pointer; }
.subnav-item:hover  { color: var(--text); background: var(--surface); }
.subnav-item.active { color: var(--text); background: var(--surface); font-weight: 600; box-shadow: 0 0 0 1px var(--border), 0 1px 2px rgba(0,0,0,0.04); }
```

Counts shown only on countable items (Offerings 11, Brand Terms 2, Audiences 3, Personas 4, Seed Keywords 24). Meta tabs (Overview, Identity, Voice & Tone, Site Structure, Commercial Policy) have no counts.

---

## Histogram cell (Pages triage)

The 7-cell action distribution at the top of the Pages tab. Doubles as a filter — clicking a cell scopes the table.

```
.histo      { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
.histo-cell { border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; background: var(--surface); cursor: pointer; }
.histo-cell:hover    { border-color: var(--border-strong); }
.histo-cell.selected { background: #18181b; color: white; border-color: #18181b; }
.histo-cell .lbl     { font-size: 10px; uppercase; 0.06em tracking; --text-muted, 600; }
.histo-cell.selected .lbl { color: #d4d4d8; }
.histo-cell .num     { font-size: 22px; font-weight: 600; margin-top: 2px; tabular; }
```

The "Review" cell (undecided action) is visually distinct — warm yellow row treatment in the table below — to draw the eye to outstanding decisions.

---

## Buttons

```
.btn         { background: var(--surface); border: 1px solid var(--border); color: var(--text); font-size: 12px; font-weight: 500; padding: 6/12; border-radius: 6px; }
.btn:hover   { background: var(--bg); border-color: var(--border-strong); }
.btn-primary { background: #18181b; border-color: #18181b; color: white; }
.btn-primary:hover { background: #3f3f46; }
```

Primary button is the only black-fill element in the system besides active sidebar items. Use sparingly — typically one per screen (top-right: Save, New brief, Send to Airtable). Secondary actions stay as `.btn`.

---

## Inheritance banner

Used at the top of any Brand DNA section that's inherited from a parent property:

```
.inherit-banner {
  background: var(--violet-bg);
  border: 1px dashed #c4b5fd;
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 12px;
  color: #5b21b6;
}
```

Text reads: "Inheriting N sections from PARENT NAME · Override Locally". Override-Locally is a per-section affordance, rendered next to each inherited section's header.

---

## Brand DNA Assistant (chat)

Three components used inside the Brand DNA Overview Assistant card. Reference for when V1.1 Phase 5 (Project Brain) needs similar chat affordances.

- **`chat-msg`** — flex row, gap 10, items-start. Reversed for user messages.
- **`chat-avatar`** — 26px circle. `.user` (near-black bg, white initial, 11px / 600). `.assistant` (violet linear-gradient bg, violet text, 14px sparkle character).
- **`chat-bubble`** — 9/13 padding, 14px border-radius, 13px / 1.55 line-height, max-width 78%. `.user` near-black bg + white text + bottom-right radius 4. `.assistant` violet-bg + dark-violet text + bottom-left radius 4.
- **`chat-input`** — 14px top margin + top border. Input is 9/12 padding, 8px radius, 13px font. Focus border `--text`.
- **`typing`** — three 5px violet dots animating with staggered opacity + translateY; sits in a violet-bg bubble during AI thinking.

---

## Progress bar (indeterminate sweep)

Used for the Brand DNA "Research & Fill" pipeline mid-run:

```
.progress      { height: 4px; background: var(--surface-alt); border-radius: 2px; overflow: hidden; position: relative; }
.progress-fill { position: absolute; top: 0; left: -30%; width: 30%; height: 100%;
                 background: linear-gradient(90deg, transparent, var(--indigo), transparent);
                 animation: sweep 1.5s ease-in-out infinite; }
@keyframes sweep { 0% { left: -30%; } 100% { left: 100%; } }
```

Paired with a stepped progress list below — see `.step` / `.step.done` / `.step.current` / `.step.pending` in the mockup style block (lines 673-695).

---

## Spacing rhythm

No formal scale. Common values, in order of frequency: 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 48. Page padding is `28px 32px`. Card padding is `18px` (or `14px 18px` for headers). Group gap inside grids is `12–16px`. Section margin-bottom is `24–28px`.

Don't introduce values outside this list without a strong reason.

---

## Anti-patterns

- **Dark mode.** Platform-app is light. The dark admin portal at `~/skyward-platform` is a deliberate split.
- **Teal.** Not in the palette. Don't add it.
- **Bold (700).** The mockup uses 600 max. Headings, primary buttons, active items — all 600. Don't ramp to 700.
- **Multiple primary buttons per screen.** One per surface, typically top-right.
- **Solid borders on inheritance / empty states.** Use dashed (`compl-chip.empty` and `inherit-banner`).
- **Tag colors borrowed across pill systems.** Status pills get the status palette + dot prefix; action pills get the action palette without dot. Don't mix.
