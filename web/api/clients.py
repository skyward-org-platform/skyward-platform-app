"""Vercel Python function: GET /api/clients

Reads BigQuery Meta tables via skyward-common's MetaClient and returns the
clients list as JSON.

Query params:
    search             (optional) case-insensitive match on client_name/abbreviation
    include_counts     (optional) "true" to include domain/competitor/project counts
    include_channels   (optional) "true" to include the project-type breakdown per
                       client (an inline SQL bypass against Meta.projects since
                       MetaClient.list_clients doesn't expose this)

Auth:
    Locally: uses Application Default Credentials (gcloud auth application-default login)
    On Vercel: reads GCP_SERVICE_ACCOUNT_JSON env var (SA JSON as one-line string)

Env vars:
    GCP_DATAHUB_PROJECT_ID       (required)  e.g. "data-hub-468216"
    GCP_SERVICE_ACCOUNT_JSON     (Vercel)    SA JSON content. Omit locally to use ADC.
"""
from __future__ import annotations

import json
import math
import os
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse


_meta_singleton = None


def _get_meta():
    global _meta_singleton
    if _meta_singleton is not None:
        return _meta_singleton

    from skyward.data.bigquery import BigQueryClient
    from skyward.data.meta import MetaClient

    project_id = os.environ["GCP_DATAHUB_PROJECT_ID"]
    creds_raw = os.environ.get("GCP_SERVICE_ACCOUNT_JSON")
    credentials_info = json.loads(creds_raw) if creds_raw else None
    bq = BigQueryClient(project_id=project_id, credentials_info=credentials_info)
    _meta_singleton = MetaClient(bq)
    return _meta_singleton


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


def _channels_by_client(meta) -> dict[int, list[dict]]:
    """Return per-client list of {project_type, count} for ACTIVE projects.

    Inline SQL bypass: MetaClient.list_clients doesn't surface project-type
    breakdown, and we don't want to call list_projects per-client (N+1).
    One grouped query gives us everything.

    Per the project-CLAUDE.md bypass rule: this is acceptable in routes
    when adding a MetaClient method would block on a multi-repo release.
    """
    from google.cloud import bigquery as bq

    project_id = meta.bq.project_id
    sql = f"""
        SELECT client_id, project_type, COUNT(*) AS n
        FROM `{project_id}.Meta.projects`
        WHERE COALESCE(LOWER(status), 'active') = 'active'
        GROUP BY client_id, project_type
        ORDER BY client_id, project_type
    """
    job_config = bq.QueryJobConfig()
    rows = meta.bq.client.query(sql, job_config=job_config).result()
    out: dict[int, list[dict]] = {}
    for row in rows:
        cid = int(row["client_id"]) if row["client_id"] is not None else None
        if cid is None:
            continue
        out.setdefault(cid, []).append(
            {"project_type": row["project_type"], "count": int(row["n"])}
        )
    return out


class handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode("utf-8"))

    def do_GET(self):
        try:
            q = parse_qs(urlparse(self.path).query)
            search = q.get("search", [None])[0]
            include_counts = q.get("include_counts", ["false"])[0].lower() == "true"
            include_channels = (
                q.get("include_channels", ["false"])[0].lower() == "true"
            )

            meta = _get_meta()
            df = meta.list_clients(search=search, include_counts=include_counts)
            records = [_row_to_json(r) for r in df.to_dict(orient="records")]

            if include_channels:
                channels_map = _channels_by_client(meta)
                for r in records:
                    cid = r.get("client_id")
                    r["channels"] = (
                        channels_map.get(int(cid), []) if cid is not None else []
                    )

            self._send(200, {"clients": records, "count": len(records)})
        except KeyError as e:
            self._send(500, {"error": f"missing env var: {e.args[0]}"})
        except Exception as e:
            self._send(500, {"error": f"{type(e).__name__}: {e}"})
