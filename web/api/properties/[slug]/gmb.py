"""Vercel Python function: GET /api/properties/<slug>/gmb

Returns the Google Business Profile (GBP) for a property as a single
location object. There is one local_seo_profile row per property.

Two data sources, selected by the profile's `connected` flag:

  - connected=True  → Jepto BigQuery dataset (<project>.<dataset>.jepto_gmb_data).
                      Full performance metrics, reviews, Q&A, posts.
  - connected=False → DataForSEO public business listing (live), matched by
                      `gbp_cid`. Profile fields only, no performance/reviews.

This route NEVER 500s the property page: any failure returns 200 with
{"ok": False, "location": None, "error": "..."} so the UI degrades to its
empty state instead of throwing.
"""
from __future__ import annotations

import base64
import json
import math
import os
import re
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse


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


def _supabase_base_and_key() -> tuple[str, str]:
    base = (
        os.environ.get("SUPABASE_URL")
        or os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    ).rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return base, key


def _supabase_get(path_and_query: str) -> list:
    base, key = _supabase_base_and_key()
    req = urllib.request.Request(
        f"{base}/rest/v1/{path_and_query}",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode("utf-8"))


def _fetch_property(slug: str) -> dict | None:
    query = urllib.parse.urlencode({
        "slug": f"eq.{slug}",
        "select": "id,client_id",
    })
    data = _supabase_get(f"property?{query}")
    return data[0] if data else None


def _fetch_profile(property_id: str) -> dict | None:
    query = urllib.parse.urlencode({
        "property_id": f"eq.{property_id}",
        "select": (
            "gbp_name,gbp_cid,connected,jepto_dataset,jepto_location_id,"
            "search_lat,search_lng,primary_geo"
        ),
    })
    data = _supabase_get(f"local_seo_profile?{query}")
    return data[0] if data else None


# ── value normalizers ─────────────────────────────────────────────────────

def _num(v):
    """Best-effort numeric coercion; NaN/None → None."""
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    if hasattr(v, "item"):
        try:
            v = v.item()
        except Exception:
            pass
    if isinstance(v, float) and math.isnan(v):
        return None
    return v


def _as_obj(v):
    """Jepto columns can arrive as JSON strings or already-parsed objects."""
    if v is None:
        return None
    if isinstance(v, (dict, list)):
        return v
    if isinstance(v, str):
        try:
            return json.loads(v)
        except Exception:
            return None
    return None


def _category_display(v) -> str | None:
    """Jepto primaryCategory JSON → its displayName."""
    obj = _as_obj(v)
    if isinstance(obj, dict):
        return obj.get("displayName") or obj.get("name")
    if isinstance(v, str):
        return v
    return None


def _categories_display(v) -> list | None:
    obj = _as_obj(v)
    if isinstance(obj, list):
        out = []
        for c in obj:
            if isinstance(c, dict):
                name = c.get("displayName") or c.get("name")
                if name:
                    out.append(name)
            elif isinstance(c, str):
                out.append(c)
        return out or None
    if isinstance(v, list):
        return v or None
    return None


def _address_str(v) -> str | None:
    """Jepto address JSON → single string."""
    obj = _as_obj(v)
    if isinstance(obj, dict):
        parts = []
        lines = obj.get("addressLines")
        if isinstance(lines, list):
            parts.extend([str(x) for x in lines if x])
        for key in ("locality", "administrativeArea", "postalCode", "regionCode"):
            val = obj.get(key)
            if val:
                parts.append(str(val))
        return ", ".join(parts) if parts else None
    if isinstance(v, str):
        return v
    return None


# ── Jepto (connected) path ─────────────────────────────────────────────────

def _from_jepto(profile: dict) -> dict:
    bq = _get_bq()
    from google.cloud import bigquery

    dataset = profile["jepto_dataset"]
    location_id = profile["jepto_location_id"]
    table = f"`{bq.project_id}.{dataset}.jepto_gmb_data`"
    # jepto_gmb_data is partitioned on `date` — queries without a date filter
    # error, so EVERY query here bounds to the last 90 days.
    date_filter = "date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)"
    params = [bigquery.ScalarQueryParameter("loc", "STRING", str(location_id))]

    def run(sql: str):
        job_config = bigquery.QueryJobConfig(query_parameters=params)
        return bq.client.query(sql, job_config=job_config).result().to_dataframe()

    # 1. Latest location-entity row.
    loc_df = run(f"""
        SELECT primaryCategory, additionalCategories, primaryPhone, address,
               websiteUrl, regularHours, attributes, totalReviewCount,
               locationAverageRating
        FROM {table}
        WHERE {date_filter}
          AND entityType = 'location'
          AND locationId = @loc
        ORDER BY date DESC
        LIMIT 1
    """)

    # 2. Summed performance metrics.
    perf_df = run(f"""
        SELECT
          SUM(searchImpressions) AS search_impressions,
          SUM(mapsImpressions)   AS maps_impressions,
          SUM(callClicks)        AS calls,
          SUM(webClicks)         AS web_clicks,
          SUM(directionRequests) AS directions,
          SUM(bookings)          AS bookings
        FROM {table}
        WHERE {date_filter}
          AND entityType = 'metric_performance'
          AND locationId = @loc
    """)

    # 3. Recent reviews / answers / posts.
    reviews_df = run(f"""
        SELECT reviewRating, reviewComment, reviewReply, reviewerName, date
        FROM {table}
        WHERE {date_filter} AND entityType = 'review' AND locationId = @loc
        ORDER BY date DESC LIMIT 10
    """)
    qna_df = run(f"""
        SELECT question, answer
        FROM {table}
        WHERE {date_filter} AND entityType = 'answer' AND locationId = @loc
        ORDER BY date DESC LIMIT 10
    """)
    posts_df = run(f"""
        SELECT summary, callToAction, date
        FROM {table}
        WHERE {date_filter} AND entityType = 'localPost' AND locationId = @loc
        ORDER BY date DESC LIMIT 10
    """)

    primary_category = None
    additional_categories = None
    phone = address = website = hours = attributes = None
    rating = review_count = None
    if not loc_df.empty:
        r = loc_df.iloc[0]
        primary_category = _category_display(r.get("primaryCategory"))
        additional_categories = _categories_display(r.get("additionalCategories"))
        phone = r.get("primaryPhone")
        address = _address_str(r.get("address"))
        website = r.get("websiteUrl")
        hrs = _as_obj(r.get("regularHours"))
        hours = json.dumps(hrs) if hrs is not None else None
        attrs = _as_obj(r.get("attributes"))
        attributes = json.dumps(attrs) if attrs is not None else None
        review_count = _num(r.get("totalReviewCount"))
        rating = _num(r.get("locationAverageRating"))

    performance = None
    if not perf_df.empty:
        pr = perf_df.iloc[0]
        performance = {
            "search_impressions": _num(pr.get("search_impressions")),
            "maps_impressions": _num(pr.get("maps_impressions")),
            "calls": _num(pr.get("calls")),
            "web_clicks": _num(pr.get("web_clicks")),
            "directions": _num(pr.get("directions")),
            "bookings": _num(pr.get("bookings")),
        }

    reviews = []
    for rr in reviews_df.to_dict(orient="records"):
        d = rr.get("date")
        reviews.append({
            "rating": _num(rr.get("reviewRating")),
            "comment": rr.get("reviewComment"),
            "reply": rr.get("reviewReply"),
            "reviewer": rr.get("reviewerName"),
            "date": d.isoformat() if hasattr(d, "isoformat") else (d if d else None),
        })

    qna = [
        {"question": q.get("question"), "answer": q.get("answer")}
        for q in qna_df.to_dict(orient="records")
    ]

    posts = []
    for pp in posts_df.to_dict(orient="records"):
        d = pp.get("date")
        posts.append({
            "summary": pp.get("summary"),
            "cta": pp.get("callToAction"),
            "date": d.isoformat() if hasattr(d, "isoformat") else (d if d else None),
        })

    return {
        "name": profile.get("gbp_name") or "",
        "source": "jepto",
        "primary_geo": profile.get("primary_geo"),
        "primary_category": primary_category,
        "additional_categories": additional_categories,
        "phone": phone,
        "address": address,
        "website": website,
        "hours": hours,
        "attributes": attributes,
        "photo_count": None,
        "rating": rating,
        "review_count": review_count,
        "performance": performance,
        "reviews": reviews,
        "qna": qna,
        "posts": posts,
    }


# ── DataForSEO (unconnected) path ──────────────────────────────────────────

def _from_dataforseo(profile: dict) -> dict:
    login = os.environ["DATAFORSEO_LOGIN"]
    password = os.environ["DATAFORSEO_PASSWORD"]
    token = base64.b64encode(f"{login}:{password}".encode("utf-8")).decode("ascii")

    lat = profile.get("search_lat")
    lng = profile.get("search_lng")
    coord = f"{lat},{lng},60"
    # The live endpoint matches by name via `filters`, not a top-level
    # `title` field (title alone returns 0 items). Filter by name, then
    # pick the exact listing by CID below.
    name = profile.get("gbp_name") or ""
    body = [{
        "filters": [["title", "like", f"%{name}%"]],
        "location_coordinate": coord,
        "limit": 5,
    }]
    req = urllib.request.Request(
        "https://api.dataforseo.com/v3/business_data/business_listings/search/live",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Basic {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        payload = json.loads(r.read().decode("utf-8"))

    items = []
    try:
        items = payload["tasks"][0]["result"][0]["items"] or []
    except (KeyError, IndexError, TypeError):
        items = []

    item = None
    gbp_cid = profile.get("gbp_cid")
    if items:
        if gbp_cid:
            for it in items:
                if str(it.get("cid")) == str(gbp_cid):
                    item = it
                    break
        if item is None:
            item = items[0]

    if item is None:
        return {
            "name": profile.get("gbp_name") or "",
            "source": "none",
            "primary_geo": profile.get("primary_geo"),
            "primary_category": None,
            "additional_categories": None,
            "phone": None,
            "address": None,
            "website": None,
            "hours": None,
            "attributes": None,
            "photo_count": None,
            "rating": None,
            "review_count": None,
            "performance": None,
            "reviews": [],
            "qna": [],
            "posts": [],
        }

    rating_obj = item.get("rating") or {}
    work_time = item.get("work_time")
    attrs = item.get("attributes")
    return {
        "name": item.get("title") or profile.get("gbp_name") or "",
        "source": "dataforseo",
        "primary_geo": profile.get("primary_geo"),
        "primary_category": item.get("category"),
        "additional_categories": item.get("additional_categories"),
        "phone": item.get("phone"),
        "address": item.get("address"),
        "website": item.get("url"),
        "hours": json.dumps(work_time) if work_time is not None else None,
        "attributes": json.dumps(attrs) if attrs is not None else None,
        "photo_count": item.get("total_photos"),
        "rating": rating_obj.get("value"),
        "review_count": rating_obj.get("votes_count"),
        "performance": None,
        "reviews": [],
        "qna": [],
        "posts": [],
    }


def _build_location(profile: dict) -> dict:
    connected = bool(profile.get("connected"))
    if connected and profile.get("jepto_dataset") and profile.get("jepto_location_id"):
        return _from_jepto(profile)
    return _from_dataforseo(profile)


_SLUG_RE = re.compile(r"/api/properties/([^/]+)/gmb/?$")


class handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode("utf-8"))

    def do_GET(self):
        try:
            path = urlparse(self.path).path
            m = _SLUG_RE.match(path)
            if not m:
                self._send(200, {"ok": False, "location": None, "error": f"could not parse slug from path: {path}"})
                return
            slug = m.group(1)

            prop = _fetch_property(slug)
            if not prop:
                self._send(200, {"ok": True, "location": None})
                return

            profile = _fetch_profile(prop["id"])
            if not profile:
                self._send(200, {"ok": True, "location": None})
                return

            location = _build_location(profile)
            self._send(200, {"ok": True, "location": location})
        except Exception as e:
            # Never 500 the property page — degrade to the empty state.
            self._send(200, {"ok": False, "location": None, "error": f"{type(e).__name__}: {e}"})
