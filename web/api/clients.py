"""Vercel Python function: GET /api/clients

Reads BigQuery Meta tables via skyward-common's MetaClient and returns the
clients list as JSON.

Query params:
    search          (optional) case-insensitive match on client_name/abbreviation
    include_counts  (optional) "true" to include domain/competitor/project counts

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

            meta = _get_meta()
            df = meta.list_clients(search=search, include_counts=include_counts)
            records = [_row_to_json(r) for r in df.to_dict(orient="records")]
            self._send(200, {"clients": records, "count": len(records)})
        except KeyError as e:
            self._send(500, {"error": f"missing env var: {e.args[0]}"})
        except Exception as e:
            self._send(500, {"error": f"{type(e).__name__}: {e}"})
