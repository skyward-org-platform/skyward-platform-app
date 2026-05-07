---
title: Skyward SEO Platform
status: scaffolding
version: v0.1 | 2026-04-28
---

# Skyward SEO Platform

In-house automation layer for the Skyward SEO pipeline. Lives alongside `process-library/` (the SOPs it automates) and `tools/` (third-party).

Inspired by Tryggvi Rafn's Brand DNA Brain → Keyword Universe → Command Center / Mission Control architecture (transcript + comparison at `operations/external-training/tryggvi-rafn/`), adapted to the 7-phase Skyward pipeline (`operations/process-library/1. seo-pipeline/pipeline-structure-v2.md`).

## Why this exists separately

- `process-library/` is human-readable SOPs and templates. Code-free.
- `tools/` is third-party (cloned MCP servers, vendor SDKs). Mostly gitignored.
- `seo-platform/` is Skyward-built code, specs, and data layers that operationalize the pipeline.

## Subdirectory map

| Path | Purpose |
|---|---|
| `specs/` | Design docs and component specs before code is written. Brand DNA Brain spec, Project Brain spec, etc. |
| `brand-dna-brain/` | Per-client structured business profile. Phase 0 enhancement. |
| `project-brain/` | Per-client typed knowledge layer (issue / working / research / preference / strategy / insight) with confidence scores. |
| `keyword-universe/` | Continuous keyword discovery, scoring, clustering. Phase 3 + Phase 6 feedback loop. |
| `command-center/` | Playbook engine that fires workflows on signals. Multi-phase orchestration layer. |
| `research/` | Notes, prototypes, references that don't yet belong to a component. |

## Build order (per `tryggvi-rafn/pipeline-vs-tryggvi-comparison-v1.md`)

1. Brand DNA Brain spec + scaffolding
2. Project Brain convention + per-client directories
3. Page-content embeddings → seed keywords feeding Keyword Universe
4. Continuous Keyword Universe (Phase 6 → Phase 3 cron)
5. Information-gain auto-trigger for top-20 keywords
6. Command Center playbook engine

Phases 1-3 are the data feeds. Phase 6 is infrastructure that's only worth building once 1-3 produce signals worth acting on.

## Conventions

- Specs are markdown with version + timestamp frontmatter (per agency standard).
- Per-client data lives at `delivery/{client}/...` not here. This directory is the system, not the data.
- Code that needs an `.env` reads from agency root `.env` (per global CLAUDE.md security rule).

## Related

- Pipeline structure: `operations/process-library/1. seo-pipeline/pipeline-structure-v2.md`
- Tryggvi transcript + comparison: `operations/external-training/tryggvi-rafn/`
- Skyward platform vision (deep): `operations/strategy/skyward-platform-vision-v1.md`
