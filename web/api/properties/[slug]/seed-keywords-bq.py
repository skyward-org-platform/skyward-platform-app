"""Vercel Python function: GET /api/properties/<slug>/seed-keywords-bq

Returns seed keywords from BigQuery SEOPipeline.seed_keywords for any
project linked to this property via Meta.projects -> Meta.project_domains
-> Meta.domains. Used by the Brand DNA Seed Keywords import action.

Filename mirrors the competitors.py flat-path precedent. The earlier
nested 'seed-keywords/bq-source.py' layout did not deploy reliably as
a Vercel function and the probe was returning count=0.
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
        "select": "id,slug,name,primary_domain,additional_domains",
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


def _seed_keywords_for_domains(domains: list[str]) -> list[dict]:
    if not domains:
        return []
    bq = _get_bq()
    from google.cloud import bigquery

    # Resolve domains -> BQ project_ids via Meta.projects, then pull every
    # seed keyword for those project_ids. Dedupe on (keyword) - if the same
    # keyword appears under multiple projects, keep the most recent.
    query = f"""
        WITH linked_projects AS (
          SELECT DISTINCT pd.project_id
          FROM `{bq.project_id}.Meta.project_domains` pd
          JOIN `{bq.project_id}.Meta.domains` d ON pd.domain_id = d.domain_id
          WHERE LOWER(d.domain) IN UNNEST(@domains)
        ),
        ranked AS (
          SELECT
            sk.keyword,
            sk.category,
            sk.seed_category,
            sk.source,
            sk.project_id,
            sk.ingest_timestamp,
            ROW_NUMBER() OVER (
              PARTITION BY LOWER(sk.keyword)
              ORDER BY sk.ingest_timestamp DESC
            ) AS rn
          FROM `{bq.project_id}.SEOPipeline.seed_keywords` sk
          JOIN linked_projects lp ON sk.project_id = lp.project_id
        )
        SELECT keyword, category, seed_category, source, project_id, ingest_timestamp
        FROM ranked
        WHERE rn = 1
        ORDER BY LOWER(keyword)
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ArrayQueryParameter(
                "domains", "STRING", [d.lower() for d in domains]
            ),
        ]
    )
    df = bq.client.query(query, job_config=job_config).result().to_dataframe()
    return [_row_to_json(r) for r in df.to_dict(orient="records")]


_SLUG_RE = re.compile(r"/api/properties/([^/]+)/seed-keywords-bq/?$")


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

            domains = [prop["primary_domain"]] + (prop.get("additional_domains") or [])
            domains = [d for d in domains if d]
            seeds = _seed_keywords_for_domains(domains)

            self._send(200, {
                "property": prop,
                "matched_on_domains": domains,
                "seed_keywords": seeds,
                "count": len(seeds),
            })
        except KeyError as e:
            self._send(500, {"error": f"missing env var: {e.args[0]}"})
        except Exception as e:
            self._send(500, {"error": f"{type(e).__name__}: {e}"})
