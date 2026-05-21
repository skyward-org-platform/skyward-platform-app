"""Vercel Python function: GET /api/wqa/pages

Read-only viewer for skyward-seo-pipeline's wqa_output aggregate. Adam's
package writes a 44-column per-URL row to BigQuery (`SEOPipelineDev.
wqa_output` dev, `SEOPipeline.wqa_output` prod) each WQA run. This route
returns the latest run scoped to a single property's primary domain so
the platform UI can render it on the Pages tab.

Query params:
    domain   (required)  property's primary_domain (e.g. "buscharter.com.au")
    env      (optional)  "dev" (default) | "prod"
    limit    (optional)  cap rows returned (default 5000)

Returns:
    {
      "ok": true,
      "project_id": 11,
      "version": 8,
      "row_count": 1234,
      "rows": [ {url, page_path, sessions, impressions, ...}, ... ],
      "site_summary": { total_urls, primary_urls, indexable_urls, ... }
    }

The "site summary" gives the Pages tab the WQA SOP's "Get the Numbers"
header counts without re-aggregating client-side.

Auth: optional `Authorization: Bearer <APP_WRITE_TOKEN>` header.
"""
from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse


_bq_singleton = None


def _get_bq():
    global _bq_singleton
    if _bq_singleton is not None:
        return _bq_singleton

    from skyward.data.bigquery import BigQueryClient

    project_id = os.environ["GCP_DATAHUB_PROJECT_ID"]
    creds_raw = os.environ.get("GCP_SERVICE_ACCOUNT_JSON")
    credentials_info = json.loads(creds_raw) if creds_raw else None
    _bq_singleton = BigQueryClient(
        project_id=project_id, credentials_info=credentials_info
    )
    return _bq_singleton


def _normalize_domain(d: str) -> str:
    """Lowercase, strip protocol/www, trailing slash. Matches what's likely
    stored as primary_domain in Supabase."""
    d = d.strip().lower()
    for prefix in ("https://", "http://", "www."):
        if d.startswith(prefix):
            d = d[len(prefix) :]
    return d.rstrip("/")


def _fetch_latest_rows(
    bq, dataset: str, domain: str, limit: int
) -> tuple[int | None, int | None, list[dict]]:
    """One-shot: find the most-recent (project_id, version) covering this
    domain AND return its rows. Previously two queries; collapsing into a
    single scan cuts ~1-2s off /pages page-load.

    Strategy: pick the (project_id, version) pair with the most matching
    rows in a CTE, then return only rows belonging to that pair. BigQuery
    plans this as a single scan with two aggregations."""
    from google.cloud import bigquery as gbq

    sql = f"""
        WITH match AS (
          SELECT
            project_id,
            MAX(version) AS latest_version,
            COUNT(*) AS row_count
          FROM `data-hub-468216.{dataset}.wqa_output`
          WHERE LOWER(url) LIKE @pattern
          GROUP BY project_id
          ORDER BY row_count DESC
          LIMIT 1
        )
        SELECT
          m.project_id,
          m.latest_version,
          w.url, w.page_path, w.is_primary_url, w.data_sources, w.in_sitemap,
          w.best_tv_keyword, w.best_tv_kw_sv, w.best_tv_kw_rank,
          w.best_sv_keyword, w.best_sv_kw_sv, w.best_sv_kw_rank,
          w.type, w.current_title, w.meta_description, w.h1, w.word_count,
          w.link_score, w.inlinks, w.outlinks, w.canonical_link_element,
          w.status_code, w.status, w.indexability, w.indexability_status,
          w.page_depth,
          w.sessions, w.session_pct_change, w.losing_traffic,
          w.average_session_duration, w.conversions,
          w.conversion_rate_pct, w.ecom_conversion_rate_pct, w.total_revenue,
          w.average_ctr, w.average_impressions,
          w.backlinks, w.referring_domains, w.dofollow, w.nofollow
        FROM `data-hub-468216.{dataset}.wqa_output` w
        JOIN match m
          ON w.project_id = m.project_id
         AND w.version = m.latest_version
        WHERE LOWER(w.url) LIKE @pattern
        ORDER BY w.sessions DESC NULLS LAST, w.average_impressions DESC NULLS LAST
        LIMIT @lim
    """
    job_config = gbq.QueryJobConfig(
        query_parameters=[
            gbq.ScalarQueryParameter("pattern", "STRING", f"%//{domain}%"),
            gbq.ScalarQueryParameter("lim", "INT64", limit),
        ]
    )
    df = bq.client.query(sql, job_config=job_config).result().to_dataframe()
    if df.empty:
        return None, None, []
    project_id = int(df["project_id"].iloc[0])
    version = int(df["latest_version"].iloc[0])
    # Strip the metadata columns before returning rows.
    df = df.drop(columns=["project_id", "latest_version"])
    rows = [{k: _scrub(v) for k, v in row.items()} for row in df.to_dict("records")]
    return project_id, version, rows


def _scrub(v):
    import math

    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    if isinstance(v, (bytes, bytearray)):
        return v.decode("utf-8", errors="replace")
    return v


def _site_summary(rows: list[dict]) -> dict:
    """Counts the WQA SOP's "Get the Numbers" block (section 3.2)."""
    total = len(rows)
    primary = sum(1 for r in rows if r.get("is_primary_url"))
    in_sitemap = sum(1 for r in rows if (r.get("in_sitemap") or "").lower() in ("true", "yes", "1"))
    status_dist: dict[str, int] = {}
    indexability_dist: dict[str, int] = {}
    for r in rows:
        sc = str(r.get("status_code") or "—")
        status_dist[sc] = status_dist.get(sc, 0) + 1
        idx = str(r.get("indexability") or "—").lower()
        indexability_dist[idx] = indexability_dist.get(idx, 0) + 1
    return {
        "total_urls": total,
        "primary_urls": primary,
        "in_sitemap_urls": in_sitemap,
        "status_code_distribution": dict(
            sorted(status_dist.items(), key=lambda x: -x[1])
        ),
        "indexability_distribution": dict(
            sorted(indexability_dist.items(), key=lambda x: -x[1])
        ),
    }


class handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(json.dumps(body, default=str).encode("utf-8"))

    def _check_auth(self) -> bool:
        expected = os.environ.get("APP_WRITE_TOKEN")
        if not expected:
            return True
        header = self.headers.get("Authorization") or ""
        if not header.startswith("Bearer "):
            return False
        return header[len("Bearer ") :] == expected

    def do_GET(self):
        if not self._check_auth():
            return self._send(401, {"ok": False, "error": "Unauthorized"})

        try:
            q = parse_qs(urlparse(self.path).query)
            domain = (q.get("domain", [""])[0] or "").strip()
            env = (q.get("env", ["dev"])[0] or "dev").strip().lower()
            try:
                limit = int(q.get("limit", ["5000"])[0])
            except ValueError:
                limit = 5000

            if not domain:
                return self._send(
                    400, {"ok": False, "error": "domain query param required."}
                )

            dataset = (
                "SEOPipelineDev" if env == "dev" else "SEOPipeline"
            )
            domain_norm = _normalize_domain(domain)

            bq = _get_bq()
            project_id, version, rows = _fetch_latest_rows(
                bq, dataset, domain_norm, limit
            )
            if project_id is None or version is None:
                return self._send(
                    200,
                    {
                        "ok": True,
                        "project_id": None,
                        "version": None,
                        "row_count": 0,
                        "rows": [],
                        "site_summary": None,
                        "env": env,
                        "message": (
                            f"No WQA run found in {dataset}.wqa_output for "
                            f"domain {domain_norm!r}. Run "
                            f"`uv run wqa --domain {domain_norm}` from the CLI."
                        ),
                    },
                )

            return self._send(
                200,
                {
                    "ok": True,
                    "project_id": project_id,
                    "version": version,
                    "row_count": len(rows),
                    "rows": rows,
                    "site_summary": _site_summary(rows),
                    "env": env,
                    "dataset": dataset,
                },
            )
        except Exception as e:
            return self._send(500, {"ok": False, "error": str(e)})
