# Local SEO Module: Foundation + Phase 1 (GMB Dashboard + DataForSEO fallback) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-property Local SEO surface that lists GBP locations and shows each location's profile, performance, reviews, Q&A, and posts, reading connected locations from the Jepto BigQuery dataset and unconnected locations (San Diego, Dallas-Fort Worth) from a DataForSEO public-profile fallback.

**Architecture:** A Supabase `local_seo_location` registry holds the locations per property. A Python Vercel function reads the client's Jepto GMB dataset from BigQuery for connected locations and falls back to DataForSEO for unconnected ones, returning one unified payload shape. Next.js async server components render an overview plus per-location detail, following the existing `tracking` / `data-access` surface patterns.

**Tech Stack:** Next.js (custom build, App Router), TypeScript, Supabase (`@supabase/supabase-js`), Python Vercel functions (`skyward.data.bigquery.BigQueryClient`), DataForSEO API, Tailwind + shadcn/base-ui components.

**Spec:** `docs/superpowers/specs/2026-06-02-local-seo-module-design.md`

**Working tree:** `~/Agency/repos/skyward-platform-app`. Branch off `main` first (e.g. `feat/local-seo-phase1`).

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `db/supabase/migrations/20260605_local_seo_locations.sql` | Create | `local_seo_location` table |
| `db/supabase/migrations/20260605_local_seo_kitchenguard_seed.sql` | Create | Seed KG SD/DFW/Fairfield rows |
| `web/lib/local-seo.ts` | Create | Types + Supabase registry getters + GMB fetch (calls Python API) |
| `web/api/properties/[slug]/gmb.py` | Create | BQ (Jepto) + DataForSEO fallback reader, unified payload |
| `web/components/local-seo/LocationCard.tsx` | Create | Overview card per location |
| `web/components/local-seo/panels.tsx` | Create | Profile / Performance / Reviews / QnA / Posts panels |
| `web/app/properties/[slug]/local-seo/page.tsx` | Create | Overview surface |
| `web/app/properties/[slug]/local-seo/[locationId]/page.tsx` | Create | Per-location detail |
| `web/app/properties/[slug]/layout.tsx` | Modify | Add "Local SEO" tab |
| `web/lib/__tests__/local-seo.test.ts` | Create | Unit tests for the data layer mapping |

---

## Task 1: Supabase migration for the location registry

**Files:**
- Create: `db/supabase/migrations/20260605_local_seo_locations.sql`

- [ ] **Step 1: Write the migration**

```sql
-- local_seo_location: one GBP location under a property. Connected rows
-- link to a Jepto locationId; unconnected rows (e.g. SD, DFW) carry NAP
-- so they render via the DataForSEO fallback.
create table if not exists public.local_seo_location (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.property(id) on delete cascade,
  name text not null,
  store_code text,
  jepto_location_id text,
  connected boolean not null default false,
  primary_geo text,
  search_lat double precision,
  search_lng double precision,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists local_seo_location_property_idx
  on public.local_seo_location (property_id);
create unique index if not exists local_seo_location_jepto_idx
  on public.local_seo_location (jepto_location_id)
  where jepto_location_id is not null;

alter table public.local_seo_location enable row level security;

-- Match existing app tables: service role bypasses RLS; add a permissive
-- read policy consistent with other platform tables in this project.
create policy local_seo_location_service_all on public.local_seo_location
  for all using (true) with check (true);
```

- [ ] **Step 2: Apply the migration**

Run: `cd ~/Agency/repos/skyward-platform-app/db/supabase && supabase db push`
Expected: migration applies, `local_seo_location` exists. (If `supabase` CLI links to a remote project, confirm it targets the correct project first with `supabase projects list`.)

- [ ] **Step 3: Verify the table**

Run: `supabase db execute "select count(*) from public.local_seo_location;"` (or query via the Supabase dashboard)
Expected: returns 0 rows, no error.

- [ ] **Step 4: Commit**

```bash
git add db/supabase/migrations/20260605_local_seo_locations.sql
git commit -m "feat(local-seo): add local_seo_location registry table"
```

---

## Task 2: Seed Kitchen Guard locations

**Files:**
- Create: `db/supabase/migrations/20260605_local_seo_kitchenguard_seed.sql`

**Context:** Fairfield is connected (Jepto `locationId` 17597979195334257879). SD + DFW are unconnected and carry search coordinates for the DataForSEO fallback. The `property` row for Kitchen Guard must exist; the seed resolves it by `primary_domain`.

- [ ] **Step 1: Write the seed**

```sql
-- Seed KG GBP locations. Resolve the property by primary domain so the
-- seed is id-agnostic. No-op if the property is absent.
insert into public.local_seo_location
  (property_id, name, store_code, jepto_location_id, connected, primary_geo, search_lat, search_lng)
select p.id, v.name, v.store_code, v.jepto_location_id, v.connected, v.primary_geo, v.lat, v.lng
from public.property p
join (
  values
    ('Kitchen Guard of Fairfield & Westchester','KG-FLD','17597979195334257879', true,  'Fairfield County CT / Westchester County NY', 41.0534, -73.5387),
    ('Kitchen Guard of San Diego',               null,    null,                   false, 'San Diego County, CA',                       33.1192, -117.0864),
    ('Kitchen Guard of Dallas-Fort Worth',       null,    null,                   false, 'Dallas-Fort Worth Metroplex, TX',            32.7767,  -96.7970)
) as v(name, store_code, jepto_location_id, connected, primary_geo, lat, lng) on true
where p.primary_domain ilike '%kitchenguard.com%'
  and not exists (
    select 1 from public.local_seo_location l
    where l.property_id = p.id and l.name = v.name
  );
```

- [ ] **Step 2: Apply**

Run: `cd ~/Agency/repos/skyward-platform-app/db/supabase && supabase db push`
Expected: rows inserted if a kitchenguard.com property exists.

- [ ] **Step 3: Verify**

Run: `supabase db execute "select name, connected, primary_geo from public.local_seo_location order by name;"`
Expected: three KG rows (Fairfield connected=true, SD + DFW connected=false). If zero rows, confirm the KG `property` exists and its `primary_domain`; adjust the `ilike` and re-run.

- [ ] **Step 4: Commit**

```bash
git add db/supabase/migrations/20260605_local_seo_kitchenguard_seed.sql
git commit -m "feat(local-seo): seed Kitchen Guard GBP locations"
```

---

## Task 3: Data layer types + registry getters (`lib/local-seo.ts`)

**Files:**
- Create: `web/lib/local-seo.ts`
- Test: `web/lib/__tests__/local-seo.test.ts`

- [ ] **Step 1: Write the failing test for payload normalization**

```ts
// web/lib/__tests__/local-seo.test.ts
import { describe, it, expect } from "vitest";
import { normalizeGmbResponse } from "../local-seo";

describe("normalizeGmbResponse", () => {
  it("returns empty array when payload missing", () => {
    expect(normalizeGmbResponse(null)).toEqual([]);
    expect(normalizeGmbResponse({} as any)).toEqual([]);
  });

  it("passes through locations and defaults source", () => {
    const out = normalizeGmbResponse({
      ok: true,
      locations: [
        { jepto_location_id: "1", name: "A", source: "jepto", rating: 5, review_count: 10 },
        { name: "B", source: "dataforseo", rating: null, review_count: 0 },
      ],
    } as any);
    expect(out).toHaveLength(2);
    expect(out[0].source).toBe("jepto");
    expect(out[1].source).toBe("dataforseo");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd web && npx vitest run lib/__tests__/local-seo.test.ts`
Expected: FAIL ("normalizeGmbResponse is not a function" / module not found). If vitest is not installed, install dev deps: `npm i -D vitest` and add `"test": "vitest"` to `web/package.json` scripts in this step.

- [ ] **Step 3: Implement `lib/local-seo.ts`**

```ts
// web/lib/local-seo.ts
// Local SEO data layer. Registry rows come from Supabase; GMB data comes
// from the Python API (Jepto BQ for connected locations, DataForSEO for
// the rest). Every getter degrades to [] / null when data is absent.
import { supabase } from "./supabase";
import { apiBase } from "./api-base";

export type LocalSeoLocation = {
  id: string;
  property_id: string;
  name: string;
  store_code: string | null;
  jepto_location_id: string | null;
  connected: boolean;
  primary_geo: string | null;
  search_lat: number | null;
  search_lng: number | null;
  status: string;
};

export type GmbReview = {
  rating: number | null;
  comment: string | null;
  reply: string | null;
  reviewer: string | null;
  date: string | null;
};
export type GmbQna = { question: string | null; answer: string | null };
export type GmbPost = { summary: string | null; cta: string | null; date: string | null };
export type GmbPerformance = {
  search_impressions: number | null;
  maps_impressions: number | null;
  calls: number | null;
  web_clicks: number | null;
  directions: number | null;
  bookings: number | null;
};
export type GmbLocation = {
  jepto_location_id: string | null;
  name: string;
  source: "jepto" | "dataforseo" | "none";
  primary_category: string | null;
  additional_categories: string[] | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  hours: string | null;
  attributes: string | null;
  photo_count: number | null;
  rating: number | null;
  review_count: number | null;
  performance: GmbPerformance | null;
  reviews: GmbReview[];
  qna: GmbQna[];
  posts: GmbPost[];
};

export async function getLocations(propertyId: string): Promise<LocalSeoLocation[]> {
  const { data } = await supabase
    .from("local_seo_location")
    .select(
      "id, property_id, name, store_code, jepto_location_id, connected, primary_geo, search_lat, search_lng, status",
    )
    .eq("property_id", propertyId)
    .eq("status", "active")
    .order("name");
  return (data as LocalSeoLocation[] | null) ?? [];
}

export function normalizeGmbResponse(payload: { ok?: boolean; locations?: GmbLocation[] } | null): GmbLocation[] {
  if (!payload || !Array.isArray(payload.locations)) return [];
  return payload.locations.map((l) => ({ ...l, source: l.source ?? "none" }));
}

export async function getGmbData(slug: string): Promise<GmbLocation[]> {
  try {
    const res = await fetch(`${apiBase()}/api/properties/${slug}/gmb`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    return normalizeGmbResponse(await res.json());
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run the test, verify pass**

Run: `cd web && npx vitest run lib/__tests__/local-seo.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/local-seo.ts web/lib/__tests__/local-seo.test.ts web/package.json
git commit -m "feat(local-seo): data layer types, registry getter, GMB fetch + normalization"
```

---

## Task 4: Python API `gmb.py` (Jepto BQ + DataForSEO fallback)

**Files:**
- Create: `web/api/properties/[slug]/gmb.py`

**Context:** Mirror `web/api/properties/[slug]/competitors.py` for BQ client + property resolution. Resolve the client's `gmb` dataset the way `web/api/data-access/sources.py` does (Meta.domains -> client_id -> Meta.client_datasets filtered to dataset_type 'gmb'). For each Supabase `local_seo_location`: if `connected`, read the Jepto dataset; else call DataForSEO. Emit one unified payload.

- [ ] **Step 1: Implement the function**

```python
"""Vercel Python function: GET /api/properties/<slug>/gmb

Returns per-location GMB data for the property. Connected locations are
read from the client's Jepto GMB BigQuery dataset; unconnected locations
fall back to DataForSEO's public business listing. Both map to one shape
so the UI renders them through identical panels.
"""
from __future__ import annotations

import base64
import json
import os
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler

_bq_singleton = None


def _get_bq():
    global _bq_singleton
    if _bq_singleton is not None:
        return _bq_singleton
    from skyward.data.bigquery import BigQueryClient
    project_id = os.environ["GCP_DATAHUB_PROJECT_ID"]
    creds_raw = os.environ.get("GCP_SERVICE_ACCOUNT_JSON")
    credentials_info = json.loads(creds_raw) if creds_raw else None
    _bq_singleton = BigQueryClient(project_id=project_id, credentials_info=credentials_info)
    return _bq_singleton


def _supabase(path: str, params: dict) -> list:
    base = (os.environ.get("SUPABASE_URL") or os.environ["NEXT_PUBLIC_SUPABASE_URL"]).rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    q = urllib.parse.urlencode(params)
    req = urllib.request.Request(
        f"{base}/rest/v1/{path}?{q}",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode("utf-8"))


def _fetch_property(slug: str) -> dict | None:
    rows = _supabase("property", {"slug": f"eq.{slug}", "select": "id,slug,client_id,primary_domain"})
    return rows[0] if rows else None


def _fetch_locations(property_id: str) -> list:
    return _supabase("local_seo_location", {
        "property_id": f"eq.{property_id}",
        "status": "eq.active",
        "select": "name,store_code,jepto_location_id,connected,primary_geo,search_lat,search_lng",
        "order": "name",
    })


def _resolve_gmb_dataset(client_id) -> str | None:
    """Return the BQ dataset id for the client's GMB (Jepto) data, or None."""
    if client_id is None:
        return None
    bq = _get_bq()
    sql = (
        "SELECT dataset_id FROM `Meta.client_datasets` cd "
        "JOIN `Meta.dataset_catalog` dc USING (dataset_id) "
        "WHERE cd.client_id = @cid AND dc.dataset_type = 'gmb' AND cd.is_active = TRUE "
        "LIMIT 1"
    )
    rows = bq.query(sql, params={"cid": client_id})
    return rows[0]["dataset_id"] if rows else None


def _jepto_location(dataset: str, location_id: str) -> dict:
    bq = _get_bq()
    project = os.environ["GCP_DATAHUB_PROJECT_ID"]
    tbl = f"`{project}.{dataset}.jepto_gmb_data`"
    # Latest profile snapshot
    prof = bq.query(
        f"SELECT primaryCategory, additionalCategories, primaryPhone, address, websiteUrl, "
        f"regularHours, attributes, profile, totalReviewCount, locationAverageRating "
        f"FROM {tbl} WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY) "
        f"AND entityType='location' AND locationId=@lid ORDER BY date DESC LIMIT 1",
        params={"lid": location_id},
    )
    p = prof[0] if prof else {}
    perf = bq.query(
        f"SELECT SUM(searchImpressions) si, SUM(mapsImpressions) mi, SUM(callClicks) cc, "
        f"SUM(webClicks) wc, SUM(directionRequests) dr, SUM(bookings) bk "
        f"FROM {tbl} WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY) "
        f"AND entityType='metric_performance' AND locationId=@lid",
        params={"lid": location_id},
    )
    pf = perf[0] if perf else {}
    reviews = bq.query(
        f"SELECT starRating, reviewComment, reviewReply, reviewerDisplayName, CAST(updateTime AS STRING) ut "
        f"FROM {tbl} WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY) "
        f"AND entityType='review' AND locationId=@lid ORDER BY updateTime DESC LIMIT 10",
        params={"lid": location_id},
    )
    qna = bq.query(
        f"SELECT question, answer FROM {tbl} WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY) "
        f"AND entityType='answer' AND locationId=@lid LIMIT 10",
        params={"lid": location_id},
    )
    posts = bq.query(
        f"SELECT postSummary, postCallToAction, CAST(postPublishDate AS STRING) pd FROM {tbl} "
        f"WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY) AND entityType='localPost' "
        f"AND locationId=@lid ORDER BY postPublishDate DESC LIMIT 10",
        params={"lid": location_id},
    )
    return {
        "source": "jepto",
        "primary_category": _cat_name(p.get("primaryCategory")),
        "additional_categories": None,
        "phone": p.get("primaryPhone"),
        "address": _addr(p.get("address")),
        "website": p.get("websiteUrl"),
        "hours": p.get("regularHours"),
        "attributes": p.get("attributes"),
        "photo_count": None,
        "rating": _num(p.get("locationAverageRating")),
        "review_count": p.get("totalReviewCount"),
        "performance": {
            "search_impressions": pf.get("si"), "maps_impressions": pf.get("mi"),
            "calls": pf.get("cc"), "web_clicks": pf.get("wc"),
            "directions": pf.get("dr"), "bookings": pf.get("bk"),
        },
        "reviews": [
            {"rating": r.get("starRating"), "comment": r.get("reviewComment"),
             "reply": r.get("reviewReply"), "reviewer": r.get("reviewerDisplayName"),
             "date": r.get("ut")} for r in reviews
        ],
        "qna": [{"question": q.get("question"), "answer": q.get("answer")} for q in qna],
        "posts": [{"summary": p2.get("postSummary"), "cta": p2.get("postCallToAction"),
                   "date": p2.get("pd")} for p2 in posts],
    }


def _dataforseo_location(name: str, lat, lng) -> dict:
    login = os.environ.get("DATAFORSEO_LOGIN")
    pw = os.environ.get("DATAFORSEO_PASSWORD")
    if not (login and pw and lat is not None and lng is not None):
        return _empty_location("none")
    auth = base64.b64encode(f"{login}:{pw}".encode()).decode()
    body = json.dumps([{
        "title": name, "location_coordinate": f"{lat},{lng},60",
        "is_claimed": False, "limit": 5,
    }]).encode()
    req = urllib.request.Request(
        "https://api.dataforseo.com/v3/business_data/business_listings/search/live",
        data=body, headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode("utf-8"))
        items = (data.get("tasks") or [{}])[0].get("result") or []
        items = (items[0].get("items") if items else []) or []
        m = next((i for i in items if name.lower() in (i.get("title") or "").lower()), items[0] if items else None)
    except Exception:
        m = None
    if not m:
        return _empty_location("none")
    rating = (m.get("rating") or {}).get("value")
    return {
        "source": "dataforseo",
        "primary_category": m.get("category"),
        "additional_categories": m.get("additional_categories"),
        "phone": m.get("phone"),
        "address": m.get("address"),
        "website": m.get("url"),
        "hours": json.dumps(m.get("work_time")) if m.get("work_time") else None,
        "attributes": json.dumps(m.get("attributes")) if m.get("attributes") else None,
        "photo_count": m.get("total_photos"),
        "rating": rating,
        "review_count": (m.get("rating") or {}).get("votes_count"),
        "performance": None, "reviews": [], "qna": [], "posts": [],
    }


def _empty_location(source: str) -> dict:
    return {"source": source, "primary_category": None, "additional_categories": None,
            "phone": None, "address": None, "website": None, "hours": None, "attributes": None,
            "photo_count": None, "rating": None, "review_count": None, "performance": None,
            "reviews": [], "qna": [], "posts": []}


def _cat_name(raw):
    if not raw:
        return None
    try:
        return json.loads(raw).get("displayName") if isinstance(raw, str) else raw.get("displayName")
    except Exception:
        return raw if isinstance(raw, str) else None


def _addr(raw):
    if not raw:
        return None
    try:
        a = json.loads(raw) if isinstance(raw, str) else raw
        parts = (a.get("addressLines") or []) + [a.get("locality"), a.get("administrativeArea"), a.get("postalCode")]
        return ", ".join([x for x in parts if x])
    except Exception:
        return raw if isinstance(raw, str) else None


def _num(v):
    try:
        return float(v) if v is not None else None
    except Exception:
        return None


def _build(slug: str) -> dict:
    prop = _fetch_property(slug)
    if not prop:
        return {"ok": False, "error": "property_not_found", "locations": []}
    locations = _fetch_locations(prop["id"])
    dataset = None
    if any(l.get("connected") for l in locations):
        dataset = _resolve_gmb_dataset(prop.get("client_id"))
    out = []
    for loc in locations:
        if loc.get("connected") and loc.get("jepto_location_id") and dataset:
            data = _jepto_location(dataset, loc["jepto_location_id"])
        else:
            data = _dataforseo_location(loc["name"], loc.get("search_lat"), loc.get("search_lng"))
        data.update({
            "jepto_location_id": loc.get("jepto_location_id"),
            "name": loc["name"],
            "primary_geo": loc.get("primary_geo"),
        })
        out.append(data)
    return {"ok": True, "locations": out}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        slug = self.path.rstrip("/").split("/")[-1].split("?")[0]
        try:
            payload = _build(urllib.parse.unquote(slug))
            code = 200 if payload.get("ok") else 404
        except Exception as e:  # never 500 the page
            payload, code = {"ok": False, "error": str(e), "locations": []}, 200
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)
```

- [ ] **Step 2: Sanity-check imports/signature against an existing function**

Run: `cd web && python -c "import ast; ast.parse(open('api/properties/[slug]/gmb.py').read()); print('parse ok')"`
Expected: `parse ok`. Confirm `BigQueryClient.query(sql, params=...)` matches the signature used in `api/properties/[slug]/competitors.py`; if that file uses a different method name (e.g. `query_rows`), match it here.

- [ ] **Step 3: Commit**

```bash
git add "web/api/properties/[slug]/gmb.py"
git commit -m "feat(local-seo): gmb API reading Jepto BQ with DataForSEO fallback"
```

---

## Task 5: Overview + detail components

**Files:**
- Create: `web/components/local-seo/LocationCard.tsx`
- Create: `web/components/local-seo/panels.tsx`

- [ ] **Step 1: Write `LocationCard.tsx`**

```tsx
import Link from "next/link";
import type { GmbLocation } from "@/lib/local-seo";

export function LocationCard({ slug, loc }: { slug: string; loc: GmbLocation }) {
  const id = loc.jepto_location_id ?? encodeURIComponent(loc.name);
  const badge =
    loc.source === "jepto" ? "Jepto connected"
    : loc.source === "dataforseo" ? "via DataForSEO (public)"
    : "Not connected";
  return (
    <Link
      href={`/properties/${slug}/local-seo/${id}`}
      className="block rounded-lg border p-4 hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{loc.name}</h3>
        <span className="text-xs rounded-full border px-2 py-0.5 text-muted-foreground">{badge}</span>
      </div>
      <p className="text-sm text-muted-foreground mt-1">{loc.primary_category ?? "No category set"}</p>
      <div className="flex gap-4 mt-3 text-sm">
        <span>{loc.rating != null ? `${loc.rating}★` : "No rating"}</span>
        <span>{loc.review_count ?? 0} reviews</span>
        {loc.performance?.calls != null && <span>{loc.performance.calls} calls (90d)</span>}
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Write `panels.tsx`**

```tsx
import type { GmbLocation } from "@/lib/local-seo";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border p-4">
      <h2 className="font-medium mb-3">{title}</h2>
      {children}
    </section>
  );
}

export function ProfilePanel({ loc }: { loc: GmbLocation }) {
  const rows: [string, string | null][] = [
    ["Primary category", loc.primary_category],
    ["Phone", loc.phone],
    ["Address", loc.address],
    ["Website", loc.website],
    ["Hours", loc.hours],
    ["Photos", loc.photo_count != null ? String(loc.photo_count) : null],
  ];
  return (
    <Section title="Profile">
      <dl className="grid grid-cols-[160px_1fr] gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd>{v ?? "—".replace("—", "-")}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

export function PerformancePanel({ loc }: { loc: GmbLocation }) {
  const p = loc.performance;
  if (!p) return <Section title="Performance (90d)"><p className="text-sm text-muted-foreground">No performance data (Jepto-connected locations only).</p></Section>;
  const stat = (label: string, v: number | null) => (
    <div><div className="text-2xl font-semibold">{v ?? 0}</div><div className="text-xs text-muted-foreground">{label}</div></div>
  );
  return (
    <Section title="Performance (90d)">
      <div className="grid grid-cols-3 gap-4">
        {stat("Search impr.", p.search_impressions)}
        {stat("Maps impr.", p.maps_impressions)}
        {stat("Calls", p.calls)}
        {stat("Web clicks", p.web_clicks)}
        {stat("Directions", p.directions)}
        {stat("Bookings", p.bookings)}
      </div>
    </Section>
  );
}

export function ReviewsPanel({ loc }: { loc: GmbLocation }) {
  return (
    <Section title={`Reviews (${loc.review_count ?? 0}, avg ${loc.rating ?? "-"})`}>
      {loc.reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">No review detail (Jepto-connected locations only).</p>
      ) : (
        <ul className="space-y-3">
          {loc.reviews.map((r, i) => (
            <li key={i} className="text-sm border-b pb-2">
              <div className="font-medium">{r.rating ?? "-"}{"★"} {r.reviewer ?? ""}</div>
              {r.comment && <p className="text-muted-foreground">{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function QnAPanel({ loc }: { loc: GmbLocation }) {
  return (
    <Section title="Q&A">
      {loc.qna.length === 0 ? <p className="text-sm text-muted-foreground">No Q&A.</p> : (
        <ul className="space-y-2 text-sm">
          {loc.qna.map((q, i) => (<li key={i}><strong>Q:</strong> {q.question} <br /><strong>A:</strong> {q.answer}</li>))}
        </ul>
      )}
    </Section>
  );
}

export function PostsPanel({ loc }: { loc: GmbLocation }) {
  return (
    <Section title="Posts">
      {loc.posts.length === 0 ? <p className="text-sm text-muted-foreground">No posts.</p> : (
        <ul className="space-y-2 text-sm">
          {loc.posts.map((p, i) => (<li key={i}>{p.summary} {p.cta ? `(${p.cta})` : ""}</li>))}
        </ul>
      )}
    </Section>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no new errors in the new files.

- [ ] **Step 4: Commit**

```bash
git add web/components/local-seo
git commit -m "feat(local-seo): overview card + detail panels"
```

---

## Task 6: Overview + detail routes

**Files:**
- Create: `web/app/properties/[slug]/local-seo/page.tsx`
- Create: `web/app/properties/[slug]/local-seo/[locationId]/page.tsx`

- [ ] **Step 1: Write the overview page**

```tsx
// web/app/properties/[slug]/local-seo/page.tsx
import { getProperty } from "@/lib/property";
import { getGmbData } from "@/lib/local-seo";
import { LocationCard } from "@/components/local-seo/LocationCard";

export default async function LocalSeoOverview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const prop = await getProperty(slug);
  if (!prop) return <div className="p-8 text-sm text-muted-foreground">Property not found.</div>;
  const locations = await getGmbData(slug);
  if (locations.length === 0) {
    return <div className="p-8 text-sm text-muted-foreground">No local SEO locations registered for this property yet.</div>;
  }
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Local SEO</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {locations.map((loc) => (
          <LocationCard key={loc.name} slug={slug} loc={loc} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the detail page**

```tsx
// web/app/properties/[slug]/local-seo/[locationId]/page.tsx
import Link from "next/link";
import { getProperty } from "@/lib/property";
import { getGmbData } from "@/lib/local-seo";
import { ProfilePanel, PerformancePanel, ReviewsPanel, QnAPanel, PostsPanel } from "@/components/local-seo/panels";

export default async function LocalSeoDetail({ params }: { params: Promise<{ slug: string; locationId: string }> }) {
  const { slug, locationId } = await params;
  const prop = await getProperty(slug);
  if (!prop) return <div className="p-8 text-sm text-muted-foreground">Property not found.</div>;
  const locations = await getGmbData(slug);
  const decoded = decodeURIComponent(locationId);
  const loc = locations.find((l) => l.jepto_location_id === decoded || l.name === decoded);
  if (!loc) return <div className="p-8 text-sm text-muted-foreground">Location not found.</div>;
  return (
    <div className="p-6 space-y-4">
      <Link href={`/properties/${slug}/local-seo`} className="text-sm text-muted-foreground hover:underline">{"<- All locations"}</Link>
      <h1 className="text-xl font-semibold">{loc.name}</h1>
      <ProfilePanel loc={loc} />
      <PerformancePanel loc={loc} />
      <ReviewsPanel loc={loc} />
      <QnAPanel loc={loc} />
      <PostsPanel loc={loc} />
    </div>
  );
}
```

- [ ] **Step 3: Verify `getProperty` export**

Run: `cd web && grep -n "export.*getProperty" lib/property.ts`
Expected: a `getProperty` (or equivalent cached getter) export. If the export is named differently (e.g. `getPropertyBySlug`), use that name in both pages.

- [ ] **Step 4: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add "web/app/properties/[slug]/local-seo"
git commit -m "feat(local-seo): overview + per-location detail routes"
```

---

## Task 7: Add the "Local SEO" tab

**Files:**
- Modify: `web/app/properties/[slug]/layout.tsx` (near the existing `tabs.push({ ... label: "Tracking" })` around line 420)

- [ ] **Step 1: Add the tab**

Find the line that pushes the Tracking tab:

```tsx
    tabs.push({ kind: "tab", href: `/properties/${slug}/tracking`, label: "Tracking" });
```

Add directly after it:

```tsx
    tabs.push({ kind: "tab", href: `/properties/${slug}/local-seo`, label: "Local SEO" });
```

- [ ] **Step 2: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "web/app/properties/[slug]/layout.tsx"
git commit -m "feat(local-seo): add Local SEO tab to property nav"
```

---

## Task 8: Run + verify (the shareable link)

**Context:** `next dev` does NOT run the Python Vercel function, so the GMB data fetch would 404 locally under plain `next dev`. Use one of the two options below. A preview deploy is the most reliable shareable link.

- [ ] **Step 1: Confirm required env is present** for Supabase + BQ + DataForSEO: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GCP_DATAHUB_PROJECT_ID`, `GCP_SERVICE_ACCOUNT_JSON`, `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`.

Run: `cd web && vercel env ls` (or check `.env.local`)
Expected: all six present in the target environment.

- [ ] **Step 2A (preview deploy, recommended): deploy a preview**

Run: `cd web && vercel deploy` (preview)
Expected: a preview URL. Open `<preview-url>/properties/<kitchen-guard-slug>/local-seo`.
Verify: three KG locations render. Fairfield shows "Jepto connected" with category, rating, performance, reviews. SD + DFW show "via DataForSEO (public)" with category + rating + NAP. Confirm SD's category reads "Cleaners" (matching our audit) and DFW shows its public listing.

- [ ] **Step 2B (local alternative): vercel dev**

Run: `cd web && vercel dev`
Expected: app on http://localhost:3000 with Python functions active. Open `http://localhost:3000/properties/<kitchen-guard-slug>/local-seo` and verify as above.

- [ ] **Step 3: Capture the Kitchen Guard slug**

Run: `supabase db execute "select slug, name, primary_domain from public.property where primary_domain ilike '%kitchenguard%';"`
Expected: the slug to use in the URL above.

- [ ] **Step 4: Final commit / open PR**

```bash
git add -A && git commit -m "chore(local-seo): phase 1 verification notes"
gh pr create --title "Local SEO module: foundation + GMB dashboard (Phase 1)" --body "Foundation + GMB dashboard with Jepto BQ read and DataForSEO fallback. Spec: docs/superpowers/specs/2026-06-02-local-seo-module-design.md"
```

---

## Self-review notes
- Spec coverage: location registry (T1-2), lib data layer (T3), Jepto + DataForSEO reader (T4), overview + detail UI (T5-6), nav (T7), run/verify with the shareable link (T8). All spec sections covered.
- Assumptions to verify during execution (each has a check step): `BigQueryClient.query` method name/signature (T4 step 2), Meta dataset-resolution column names `dataset_type`/`is_active` (T4, cross-check `data-access/sources.py`), `getProperty` export name (T6 step 3), the Tracking tab line location (T7), and that the KG `property` row exists with a kitchenguard.com domain (T2 step 3).
- Local Python execution caveat called out in T8 (preview deploy or `vercel dev`, not plain `next dev`).
