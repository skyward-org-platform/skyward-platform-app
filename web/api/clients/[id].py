"""Vercel Python function: GET /api/clients/<id>

Returns a single client's detail plus its owned domains, competitor domains,
and projects from BigQuery Meta via skyward-common's MetaClient.

URL: /api/clients/<int:client_id>
Response:
    {
      "client": {...},
      "owned_domains": [...],
      "competitor_domains": [...],
      "projects": [...]
    }
"""
from __future__ import annotations

import json
import math
import os
import re
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse


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


_ID_RE = re.compile(r"/api/clients/(\d+)/?$")


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
            m = _ID_RE.match(path)
            if not m:
                self._send(400, {"error": f"could not parse client_id from path: {path}"})
                return
            client_id = int(m.group(1))

            meta = _get_meta()
            client = meta.get_client(client_id)
            if client is None:
                self._send(404, {"error": f"client {client_id} not found"})
                return

            owned_df = meta.get_client_domains(client_id, is_competitor=False)
            comp_df = meta.get_client_domains(client_id, is_competitor=True)
            proj_df = meta.list_projects(client_id=client_id)

            self._send(
                200,
                {
                    "client": _row_to_json(client),
                    "owned_domains": [_row_to_json(r) for r in owned_df.to_dict(orient="records")],
                    "competitor_domains": [_row_to_json(r) for r in comp_df.to_dict(orient="records")],
                    "projects": [_row_to_json(r) for r in proj_df.to_dict(orient="records")],
                },
            )
        except KeyError as e:
            self._send(500, {"error": f"missing env var: {e.args[0]}"})
        except Exception as e:
            self._send(500, {"error": f"{type(e).__name__}: {e}"})
