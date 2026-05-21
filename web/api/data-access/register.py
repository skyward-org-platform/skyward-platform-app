"""Vercel Python function: POST /api/data-access/register

Body:
    {
        "domain": "phil-lasry.com",       (required — resolves to client_id)
        "dataset_id": "jepto_gsc_...",    (required)
        "dataset_type": "gsc",            (required: gsc|gmb|ga4|facebook)
        "hostname": "phil-lasry.com",     (optional — defaults to domain)
        "notes": "..."                    (optional)
    }

Registers the BQ dataset in Meta.dataset_catalog + Meta.client_datasets via
skyward-common's MetaClient.add_client_dataset(). The Platform UI calls this
when the user fills out the "Register dataset" inline form on the Data Access
tab; skyward-common stays the single source of truth.

Returns:
    { "ok": true,  "status": "added", "warning": "..." | null }
    { "ok": false, "error": "..." }
"""
from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler


_meta_singleton = None
ALLOWED_TYPES = {"gsc", "gmb", "ga4", "facebook"}


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


def _resolve_client_and_domain(meta, domain: str) -> tuple[dict | None, dict | None]:
    """Resolve domain → (client, domain) via Meta tables. Same chain as
    /api/data-access/sources."""
    domain_row = meta.get_domain(domain)
    if not domain_row:
        return None, None

    project_id = meta.bq.client.project
    from google.cloud import bigquery as bq

    sql = f"""
        SELECT c.client_id, c.client_name
        FROM `{project_id}.Meta.client_domains` cd
        JOIN `{project_id}.Meta.clients` c ON c.client_id = cd.client_id
        WHERE cd.domain_id = @domain_id
          AND cd.is_competitor IS NOT TRUE
          AND COALESCE(c.is_active, TRUE) = TRUE
        LIMIT 1
    """
    job_config = bq.QueryJobConfig(
        query_parameters=[
            bq.ScalarQueryParameter("domain_id", "INT64", domain_row["domain_id"])
        ]
    )
    df = meta.bq.client.query(sql, job_config=job_config).result().to_dataframe()
    if df.empty:
        return None, domain_row
    return {
        "id": int(df["client_id"].iloc[0]),
        "name": df["client_name"].iloc[0],
    }, domain_row


class handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode("utf-8"))

    def _check_auth(self) -> bool:
        expected = os.environ.get("APP_WRITE_TOKEN")
        if not expected:
            return True
        header = self.headers.get("Authorization") or ""
        if not header.startswith("Bearer "):
            return False
        return header[len("Bearer ") :] == expected

    def do_POST(self):
        if not self._check_auth():
            return self._send(401, {"ok": False, "error": "Unauthorized"})

        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length) if length > 0 else b"{}"
            body = json.loads(raw or b"{}")
        except Exception as e:
            return self._send(
                400, {"ok": False, "error": f"Invalid JSON body: {e}"}
            )

        domain = (body.get("domain") or "").strip()
        dataset_id = (body.get("dataset_id") or "").strip()
        dataset_type = (body.get("dataset_type") or "").strip().lower()
        hostname = (body.get("hostname") or "").strip() or domain or None
        notes = (body.get("notes") or "").strip() or None

        if not domain:
            return self._send(400, {"ok": False, "error": "domain is required."})
        if not dataset_id:
            return self._send(400, {"ok": False, "error": "dataset_id is required."})
        if dataset_type not in ALLOWED_TYPES:
            return self._send(
                400,
                {
                    "ok": False,
                    "error": f"dataset_type must be one of {sorted(ALLOWED_TYPES)}.",
                },
            )

        try:
            meta = _get_meta()
            client, domain_row = _resolve_client_and_domain(meta, domain)
            if client is None:
                return self._send(
                    400,
                    {
                        "ok": False,
                        "error": f"No client matched domain {domain} in Meta.client_domains.",
                    },
                )
            result = meta.add_client_dataset(
                client_id=client["id"],
                dataset_id=dataset_id,
                dataset_type=dataset_type,
                hostname=hostname,
                domain_id=domain_row["domain_id"] if domain_row else None,
                notes=notes,
            )
            return self._send(
                200,
                {
                    "ok": True,
                    "status": result.get("status", "added"),
                    "warning": result.get("warning"),
                    "client": client,
                },
            )
        except Exception as e:
            return self._send(500, {"ok": False, "error": str(e)})
