---
tags: [skyward, data-infrastructure, meta, reference]
created: 2026-05-15
---

# Skyward Meta Hierarchy

How clients, domains, projects, and competitors fit together — at a glance.

Related: [[Implementation - Meta Tables]], [[2026-03-30 Meta Tables Redesign]], [[BQ Schema Audit]]

---

## The Big Picture

```mermaid
flowchart TB
    Client(["🏢 <b>Client</b><br/><i>e.g. Sears Parts Direct</i>"]):::thing

    Client --> Owns[/"owns"/]:::link
    Owns --> Domain(["🌐 <b>Domain</b><br/><i>e.g. searspartsdirect.com</i>"]):::thing
    Owns --> Competitor(["⚔️ <b>Competitor Domain</b><br/><i>e.g. repairclinic.com</i>"]):::competitor

    Domain --> HasProject[/"has project"/]:::link
    Competitor --> HasProject
    HasProject --> Project(["📋 <b>Project</b><br/><i>e.g. SEO Pipeline Q2</i>"]):::thing

    Client -.->|"client-wide project<br/>(no specific domain)"| Project

    Client --> Has[/"has"/]:::link
    Has --> Data(["📊 <b>Data Sources</b><br/><i>GA4, GSC, etc.</i>"]):::thing
    Domain --> Feeds[/"feeds"/]:::link
    Feeds --> Data

    classDef thing fill:#1971c2,stroke:#0b3d75,color:#fff,stroke-width:2px
    classDef competitor fill:#c92a2a,stroke:#5a0d0d,color:#fff,stroke-width:2px
    classDef link fill:#fff,stroke:#868e96,color:#495057,stroke-dasharray: 3 3
```

**How to read it:** Blue boxes are the **things** Skyward tracks. Red boxes are **competitors** (same kind of thing as a domain, just flagged differently). Small white labels in between are the **relationships** that connect them.

**The typical flow is Client → Domain → Project** — most projects target a specific domain (or competitor domain). The dotted arrow shows the shortcut: a project can also live directly under the client when it's not tied to any one domain (e.g. a cross-domain analysis or a client-wide initiative).

---

## A Client's World

What every client looks like in the system:

```mermaid
flowchart LR
    C(["🏢 <b>Client</b>"]):::thing

    C --> D1(["🌐 Their Domain"]):::thing
    C --> D2(["🌐 Their Domain"]):::thing
    C --> X1(["⚔️ Competitor"]):::competitor
    C --> X2(["⚔️ Competitor"]):::competitor
    C --> X3(["⚔️ Competitor"]):::competitor

    D1 --> P1(["📋 Project on D1"]):::thing
    D2 --> P2(["📋 Project on D2"]):::thing
    C -.->|client-wide| P3(["📋 Cross-domain Project"]):::thing

    classDef thing fill:#1971c2,stroke:#0b3d75,color:#fff,stroke-width:2px
    classDef competitor fill:#c92a2a,stroke:#5a0d0d,color:#fff,stroke-width:2px
```

A client can have **many** domains of their own, **many** competitor domains they want to watch, and **many** projects running at once.

---

## Following the Data

When Skyward pulls data (say, from DataForSEO), how does that row know which client / project it belongs to?

```mermaid
flowchart LR
    Pull(["🔄 <b>Data Pull</b><br/>gets a <b>job_id</b>"]):::action

    Pull --> Row1(["📊 Row in BigQuery"]):::data
    Pull --> Row2(["📊 Row in BigQuery"]):::data
    Pull --> Row3(["📊 Row in BigQuery"]):::data

    Row1 --> Log(["📒 <b>Upload Log</b><br/>job_id + upload_id<br/>+ client + project"]):::log
    Row2 --> Log
    Row3 --> Log

    Log --> C(["🏢 Client"]):::thing
    Log --> P(["📋 Project"]):::thing

    classDef thing fill:#1971c2,stroke:#0b3d75,color:#fff,stroke-width:2px
    classDef action fill:#5f3dc4,stroke:#2c1a5e,color:#fff,stroke-width:2px
    classDef data fill:#e7f5ff,stroke:#1971c2,color:#0b3d75
    classDef log fill:#d3f9d8,stroke:#2f9e44,color:#0f3d1c,stroke-width:2px
```

**The trick:** every row carries a `job_id` and `upload_id`. Those IDs are the breadcrumb trail back to who the data belongs to.

---

## Statuses You'll See

| Thing | Status options | What it means |
|---|---|---|
| 🏢 Client | active / inactive | Whether we're still working with them |
| 🌐 Domain | active / inactive | Whether we're still tracking it |
| 📋 Project | active / complete / deactivated | Where the project is in its lifecycle |
| ⚔️ Competitor flag | yes / no | A domain marked as a competitor instead of a client's own |
| ⭐ Priority | low / normal / high | How important a domain is to a client or project |

---

## The Words That Connect Things

When you see something like "Sears has 3 competitors and 2 projects," here's where each piece lives:

| Phrase | What's actually happening |
|---|---|
| "Client **has** domain" | Connected via `client_domains` |
| "Client **has** competitor" | Connected via `client_domains`, with the competitor flag on |
| "Domain **has** project" | The project record points to its client, and the domain is attached via `project_domains` |
| "Client **runs** a client-wide project" | The project record points to the client, with no rows in `project_domains` |
| "Project **targets** domain" | Connected via `project_domains` (one project can target multiple domains) |
| "Client **has** data source" | Connected via `client_datasets` |
| "Domain **feeds** data source" | Same `client_datasets` row, with the domain attached so we know which property the data is for |

You don't need to know these table names to use the system — but if someone says "check `client_domains`," now you know it just means "the list of which clients have which domains."

---

## For the Technically Curious

<details>
<summary>Click to see the full database schema</summary>

### ID Conventions

Every Client, Domain, and Project has a numeric ID (`client_id`, `domain_id`, `project_id`) auto-generated when it's created. Data sources use their real BigQuery dataset name as the ID (e.g. `analytics_123456789`).

### Full Schema (ER Diagram)

```mermaid
erDiagram
    clients ||--o{ client_domains : "links"
    clients ||--o{ projects : "owns"
    clients ||--o{ client_datasets : "owns"
    domains ||--o{ client_domains : "links"
    domains ||--o{ project_domains : "links"
    domains ||--o{ client_datasets : "optional FK"
    projects ||--o{ project_domains : "targets"
    client_datasets }o--|| dataset_catalog : "references"
    dataset_catalog ||--o{ table_catalog : "contains"
    clients ||--o{ upload_events : "tagged_by"
    projects ||--o{ upload_events : "tagged_by"

    clients {
        INT64 client_id PK
        STRING client_name
        STRING abbreviation
        BOOL is_active
    }
    domains {
        INT64 domain_id PK
        STRING domain
        STRING domain_name
        BOOL is_active
    }
    client_domains {
        INT64 client_id FK
        INT64 domain_id FK
        BOOL is_competitor
        STRING priority
    }
    projects {
        INT64 project_id PK
        INT64 client_id FK
        STRING project_type
        STRING project_name
        STRING status
    }
    project_domains {
        INT64 project_id FK
        INT64 domain_id FK
        STRING role
        STRING priority
    }
    client_datasets {
        INT64 client_id FK
        INT64 domain_id FK
        STRING dataset_id FK
    }
    dataset_catalog {
        STRING dataset PK
        STRING dataset_type
        STRING hostname
    }
    upload_events {
        STRING job_id
        STRING upload_id
        INT64 client_id FK
        INT64 project_id FK
        TIMESTAMP ingest_timestamp
    }
```

### DataForSEO Row-Level Tagging

Every row in the 11 DataForSEO endpoint tables carries: `job_id`, `upload_id`, `ingest_timestamp`, `domain_id`, `domain`, `task_id`, `endpoint_mode` — so any row can be traced back to a client/project via `upload_events.job_id`.

### Notes

- BigQuery does **not** enforce foreign keys — the relationships are convention, enforced in `MetaClient` Python code.
- A single `domains` row is shared across customers: it can be a client's own domain to one customer and a competitor to another, distinguished by the flag on the link row.

</details>
