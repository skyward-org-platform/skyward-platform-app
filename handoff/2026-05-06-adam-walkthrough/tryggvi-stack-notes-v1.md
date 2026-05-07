---
title: Tryggvi Rafn — Infrastructure / Stack Notes
status: incomplete (source was deliberately vague)
source: Edward Show podcast #1,027 — transcript at `operations/external-training/tryggvi-rafn/automated-seo-system-podcast-transcript.md`
version: v1 | 2026-04-29
---

# What we know

| Layer | Disclosed | Notes |
|---|---|---|
| Build agent | **Claude + Codex** | "Did you use Claude to make this?" → "Yeah, Claude and Codex." |
| Bootstrap agent | **Open Claude / Claude Code** on a dedicated laptop | Installed on a fresh laptop with a fresh email so it couldn't touch his work environment. First thing it built was Mission Control + sub-agents. |
| Data layer | "Data warehouse" exists | Vendor not named. |
| Vector layer | Vector database for page content | Vendor not named. Used for cosine-similarity keyword seeding. |
| Agent topology | Stateful PM agent + stateless workers | PM has memory + context + mission. Workers wake, do a task, sleep. |
| Scheduling | Cron / scheduler | Relevance scoring agent "runs on a cron, on a schedule." |
| External APIs | Ahrefs | Mentioned explicitly with error handling. Implied: GSC, embedding provider, possibly DataForSEO. |

# What he didn't disclose

- **Frontend framework** — the UI is clearly a web app (he demoed it screen-share), but no React / Next.js / Vue / SvelteKit / etc. mention.
- **Hosting / deployment** — no Vercel / Render / Fly / self-hosted reference.
- **App database** — separate from the warehouse and the vector store. Postgres? Mongo? Unknown.
- **Queue / job runner** — for the stateless agents. Could be cron + DB rows, could be a real queue. Unknown.
- **Embedding model** — OpenAI ada? Cohere? Local? Unknown.
- **Playbook definition format** — config files, code, or a DSL? Unknown. (This is the most important unknown for us — playbooks are the orchestration layer.)
- **Agent communication** — direct function calls, message queue, shared DB state? Unknown.

# Lessons he shared that touch on infra

1. **Gated code-upload pipeline.** Rebuilt the platform four times before learning that vibe-coded agents produce code that needs to be reviewed and gated before it ships. Took the "let agents write code unsupervised" path, watched it break repeatedly, then moved to a workflow where he writes the code himself but uses agents for ideas/organization.
2. **Error handling is critical** — emphasized when describing the data pipeline. Without it, scraped data and API calls fail silently or cascade.
3. **Build the data warehouse first.** Said the vector DB / cosine similarity step was "very easy when you have all of the other pipelines in place." Order of operations: warehouse → pipelines → embeddings → agents.

# Why this matters for our build

We're picking patterns, not cloning the system. Our stack is already decided:
- Data warehouse: **BigQuery** (project `data-hub-468216`)
- Vector store: **BigQuery vector search** is the leading candidate (no new vendor needed). Pgvector via Supabase is the fallback if we want it in the app DB.
- App framework: **Next.js** (consistent with finance + scope-doc apps)
- Hosting: **Vercel** (skyward account, `data-5740`)
- Embedding model: TBD — OpenAI ada-002 / text-embedding-3 likely default
- Job runner: TBD — `/loop` + scheduled remote agents handle most of what cron would
- Agent build: Claude (we already use this for skills + agents)

So the unknowns from his side mostly don't matter to us. The two that do:
1. **Playbook definition format** — when we get to Command Center, we'll have to invent this ourselves. He gave us no shortcut.
2. **Embedding model + refresh cadence** — needs a decision in our embeddings spec.

# Open questions for if/when we talk to him directly

If Paul gets a follow-up conversation with Tryggvi (he offered: "find me on Twitter"):

1. What's the playbook definition format and trigger model? Config file, code, DB rows?
2. Where does the vector DB live (vendor + storage choice)?
3. Embedding model and refresh strategy?
4. How do stateless workers get tasks — queue, DB poll, or direct invocation?
5. What does the gated code-upload pipeline look like in practice — pre-commit hooks, CI gate, or manual review?
6. Cost — what's monthly infra spend look like at his scale?

# References

- Transcript: `operations/external-training/tryggvi-rafn/automated-seo-system-podcast-transcript.md`
- Pipeline comparison: `operations/external-training/tryggvi-rafn/pipeline-vs-tryggvi-comparison-v1.md`
- Brand DNA Brain spec: `operations/seo-platform/specs/brand-dna-brain-spec-v1.md`
