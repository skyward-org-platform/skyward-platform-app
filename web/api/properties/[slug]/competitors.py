"""Vercel Python function: GET /api/properties/<slug>/competitors

Returns competitor domains for the client that owns this property's
primary_domain in BigQuery Meta. The hop is:

    property.primary_domain
      → Meta.client_domains (is_competitor=false, owning client)
      → Meta.client_domains (is_competitor=true, competitor rows)
      → Meta.domains (resolve to actual hostnames)

We render competitors on the property page per the 2026-05-14 hierarchy
framework — they're brand-relative, not legal-entity-relative. Source
stays BQ Meta (no Supabase duplication during this phase), so every
property under one client currently sees the same competitor list.
That's a known limitation of the BQ data shape today, not a bug.
"""
from __future__ import annotations

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


def _fetch_property(slug: str) -> dict | None:
    base = (
        os.environ.get("SUPABASE_URL")
        or os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    ).rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    query = urllib.parse.urlencode({
        "slug": f"eq.{slug}",
        "select": "id,slug,name,primary_domain,additional_domains,url_prefix",
    })
    req = urllib.request.Request(
        f"{base}/rest/v1/property?{query}",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        data = json.loads(r.read().decode("utf-8"))
    return data[0] if data else None


def _row_to_json(row: dict) -> dict:
    out = {}
    for k, v in row.items():
        if v is None:
            out[k] = None
        elif hasattr(v, "isoformat"):
            out[k] = v.isoformat()
        elif hasattr(v, "item"):
            try:
                v = v.item()
            except Exception:
                pass
            out[k] = v if not (isinstance(v, float) and math.isnan(v)) else None
        elif isinstance(v, float) and math.isnan(v):
            out[k] = None
        else:
            out[k] = v
    return out


def _competitors_for_domain(domain: str) -> tuple[str | None, list[dict]]:
    """Resolve the owning client for this domain, then return their competitors.

    Returns (client_name, competitor_rows).
    """
    bq = _get_bq()
    from google.cloud import bigquery

    query = f"""
        WITH owning_client AS (
          SELECT DISTINCT cd.client_id
          FROM `{bq.project_id}.Meta.client_domains` cd
          JOIN `{bq.project_id}.Meta.domains` d ON cd.domain_id = d.domain_id
          WHERE LOWER(d.domain) = LOWER(@primary_domain)
            AND cd.is_competitor = FALSE
        )
        SELECT
          c.client_id,
          c.client_name,
          d.domain_id,
          d.domain,
          d.domain_name,
          d.is_active,
          cd.priority,
          d.notes
        FROM owning_client oc
        JOIN `{bq.project_id}.Meta.clients` c ON c.client_id = oc.client_id
        LEFT JOIN `{bq.project_id}.Meta.client_domains` cd
          ON cd.client_id = oc.client_id AND cd.is_competitor = TRUE
        LEFT JOIN `{bq.project_id}.Meta.domains` d
          ON d.domain_id = cd.domain_id
        ORDER BY d.domain
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("primary_domain", "STRING", domain)]
    )
    df = bq.client.query(query, job_config=job_config).result().to_dataframe()

    if df.empty:
        return None, []

    client_name = df["client_name"].iloc[0]
    # Some rows may have NULL d.domain when client has no competitors.
    competitor_rows = [
        _row_to_json(r) for r in df.to_dict(orient="records") if r.get("domain")
    ]
    return client_name, competitor_rows


_SLUG_RE = re.compile(r"/api/properties/([^/]+)/competitors/?$")


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
                self._send(400, {"error": f"could not parse slug from path: {path}"})
                return
            slug = m.group(1)

            prop = _fetch_property(slug)
            if not prop:
                self._send(404, {"error": f"property {slug} not found"})
                return

            client_name, competitors = _competitors_for_domain(prop["primary_domain"])

            self._send(200, {
                "property": prop,
                "bq_client_name": client_name,
                "matched_on_domain": prop["primary_domain"],
                "competitors": competitors,
                "count": len(competitors),
            })
        except KeyError as e:
            self._send(500, {"error": f"missing env var: {e.args[0]}"})
        except Exception as e:
            self._send(500, {"error": f"{type(e).__name__}: {e}"})
