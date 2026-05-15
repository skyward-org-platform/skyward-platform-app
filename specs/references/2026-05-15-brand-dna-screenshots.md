---
date: 2026-05-15
source: Paul (Desktop screenshots, source app TBD)
purpose: Reference patterns for Brand DNA tabs in v2 UI
---

# Brand DNA tab references (2026-05-15)

Four screenshots shared from another tool we want to channel for the Brand DNA tabs. Source app TBD (not Skyward). Originals on Paul's Desktop, drag into `screenshots/` when convenient — the shell here couldn't resolve those paths but the patterns are captured below.

## 1 · Voice & Tone — slider pattern

A clean dimensional approach. Five sliders, each with a Min/Max label pair and a numeric value (0-100) at the right edge:

| Dimension | Left label | Right label | Value shown |
|---|---|---|---|
| Formality | Casual | Formal | 68 |
| Technicality | Accessible | Technical | 62 |
| Objectivity | Opinionated | Objective | 55 |
| Enthusiasm | Measured | Energetic | 58 |
| Sales Pressure | Advisory | Commercial | 52 |

Below the sliders, two prose textareas:

- **Writing Style** — "Sentences are medium-length (15–25 words typical), declarative, and action-oriented. Paragraphs are short — usually 1–3 sentences max — creating high scannability. Every case study follows an identical three-part structure: The Challenge → Our Approach → Results, with H3 subheadings…"
- **Voice Do's** — "DO use concrete percentage metrics and dollar figures prominently — they lead with '1,950% increase in organic traffic' and '$600K+ in organic revenue' as proof points. DO name proprietary frameworks with capitalized labels — i.e. 'Authority Framework', 'full-stack ecommerce SEO system', 'content engine approach'…"
- **Voice Don'ts** — (cut off in screenshot; assumed present)

Save button top-right (purple primary). Single-page editor.

**What's interesting:** the slider + numeric pairing makes voice a measurable thing rather than a vibes thing. The Do's/Don'ts as prose gives the AI assistant concrete patterns to imitate. Voice & Tone becomes both quantitative and qualitative on one screen.

## 2 · Brand Identity — form pattern

Form-style layout with subcopy at the top. Save button top-right.

Subcopy: "To auto-populate these fields from your website and brand research, use Research & Fill on the Overview tab."

Fields (vertically stacked, each label above an input):
- **Company Name** — single-line: "Nordica Marketing"
- **Company Motto / Tagline** — single-line: "Own your organic growth."
- **Brand Personality** — multi-line: "Confident operator, not consultant. Nordica speaks as a practitioner who has built and scaled their own 7-figure eCommerce brands. The personality is direct, data-grounded, no-nonsense, and results-obsessed — but never arrogant. Think experienced founder advising a peer, not a salesperson pitching a prospect. There is a quiet Nordic pragmatism: say less, prove more."
- **Brand Story** — multi-line: "Founded in Iceland by Tryggvi Rafn Sigurbjarnarson, who has been in the SEO trenches since 2007, Nordica builds and operates its own eCommerce brands, using the exact same frameworks they deploy for clients. Over 18 years, the agency evolved from traditional SEO into a full-stack AI-augmented organic growth system…"

**What's interesting:** much simpler than what we had. Four fields, all editable inline. The "Research & Fill" callback at the top is the same affordance we have on the Overview tab — keeps the editing flow consistent.

## 3 · Brand DNA Assistant — header card

Matches what we already built. Title with sparkle prefix, full-width subcopy beneath the title, divider line below the subcopy: "Have a conversation about your business. I'll run deep research, build audiences and personas, and save the insights to your project brain. Start by telling me what you sell and who buys it."

Confirms current implementation.

## 4 · Products & Brands tab — table pattern + ALTERNATE subnav structure

A different tab inside the same Brand DNA-like surface. Table with columns:

| Column | Example values |
|---|---|
| Name | Keyword & Entity Strategy · Technical SEO & AI Readiness · Content Strategy That Converts · Authority Building & Digital PR · Product-Led SEO System · AI-Augmented Growth System · What We Do |
| Type | service · solution |
| Brand Relation | owner |
| Status | current |
| URL | https://www.nordicamarketing.com/commercial-keyword-research · etc. |

Row trash-can on hover for delete. "+ Add" button top-right.

**Important — this screenshot shows a different subnav structure than what we have today:**

```
Overview · Identity · Voice & Tone · Products & Brands (11) ·
Brand Terms (2) · Site Structure · Commercial Policy · Audiences (3) · Personas
```

Differences vs. our current consolidated subnav (Overview · Voice & Tone · Brand Identity · Brand terms · Personas · Offerings · Proof · Goals · Site structure · Competitors):

| Theirs has | We have | Notes |
|---|---|---|
| Identity | Brand Identity | They keep Identity standalone; we just consolidated 4 tabs into Brand Identity |
| Products & Brands | Offerings | Same concept, different name |
| Commercial Policy | (none) | New concept — pricing/discount/sales rules? |
| Audiences (3) | (rolled into Brand Identity) | We folded Future audience into Brand Identity |
| (no Proof, Goals, Competitors) | Proof · Goals · Competitors | We have, they don't |
| **Counts on tabs (3, 11, 2)** | No counts | Earlier you said "no counts" |

**Decision needed:** Do you want to adopt this structure as a closer match to the reference, or keep the consolidated 10-tab structure we just landed? Counts on tabs — back on or stay off?

## Suggested next moves

1. **Voice & Tone tab** — adopt the slider pattern. Five dimensional sliders + Writing Style + Voice Do's + Voice Don'ts textareas. This is a clean upgrade from chip-list traits.
2. **Brand Identity tab** — adopt the form pattern. Decide if we keep our 4-tab consolidation (which would mean more fields in this form) or split per the reference.
3. **Products & Brands tab** — rename "Offerings" → "Products & Brands"? Adopt the table pattern (Name, Type, Brand Relation, Status, URL)?
4. **Subnav reconciliation** — decide whether Commercial Policy / Audiences are new tabs, or whether their data lives inside our existing tabs.
5. **Counts on subnav** — yes or no?
