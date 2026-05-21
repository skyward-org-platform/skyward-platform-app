"""Vercel Python function: GET /api/data-access/sources

Query params:
    domain   (required)  Primary domain of the property (e.g. "phil-lasry.com")

Returns the registered BQ data sources for the property's client, sourced
from skyward-common's Meta tables:

    Meta.domains          → resolves domain → domain_id → client_id
    Meta.client_datasets  → registered BQ datasets per client
    Meta.dataset_catalog  → dataset_type + hostname metadata
    BQ INFORMATION_SCHEMA → tables inside each dataset + row counts

Skyward-common is the source of truth for which BQ datasets belong to
which client; this route surfaces that mapping to the platform UI so the
Data Access tab doesn't ask users to retype dataset conventions that
already live in Meta.

Response shape:
    {
      "ok": true,
      "client":  { "id": 5,  "name": "Philippe Lasry" } | null,
      "domain":  { "id": 12, "domain": "phil-lasry.com" } | null,
      "sources": {
        "gsc":      [{ dataset_id, hostname, is_active, notes, tables: [...] }, ...],
        "gmb":      [...],
        "ga4":      [...],
        "facebook": [...]
      }
    }

Each `tables` entry: { table_id, row_count, last_modified, size_bytes }.
"""
from __future__ import annotations

import json
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


def _list_tables(meta, dataset_id: str) -> list[dict]:
    """List tables in a BQ dataset with row counts and last-modified dates.
    Cheap — uses INFORMATION_SCHEMA, no scan cost."""
    project_id = meta.bq.client.project
    sql = f"""
        SELECT
            table_id,
            row_count,
            size_bytes,
            TIMESTAMP_MILLIS(last_modified_time) AS last_modified
        FROM `{project_id}.{dataset_id}.__TABLES__`
        ORDER BY last_modified DESC
        LIMIT 25
    """
    try:
        rows = meta.bq.client.query(sql).result()
        out = []
        for r in rows:
            out.append(
                {
                    "table_id": r["table_id"],
                    "row_count": int(r["row_count"] or 0),
                    "size_bytes": int(r["size_bytes"] or 0),
                    "last_modified": r["last_modified"].isoformat()
                    if r["last_modified"]
                    else None,
                }
            )
        return out
    except Exception:
        # Dataset might not exist, or SA may lack access. Surface empty.
        return []


def _client_id_for_domain(meta, domain: str) -> tuple[dict | None, dict | None]:
    """Return (client, domain) dicts via the chain
    Meta.domains → Meta.client_domains → Meta.clients."""
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


def _grouped_datasets(meta, client_id: int) -> dict[str, list[dict]]:
    """Pull client_datasets for the client; group by dataset_type with
    each entry enriched with the dataset's tables."""
    df = meta.get_client_datasets(client_id=client_id, active_only=False)
    grouped: dict[str, list[dict]] = {}
    for _, row in df.iterrows():
        dtype = str(row["dataset_type"]) if row["dataset_type"] else "unknown"
        entry = {
            "dataset_id": row["dataset_id"],
            "hostname": (
                row["hostname"] if row["hostname"] is not None and str(row["hostname"]) != "nan" else None
            ),
            "is_active": bool(row["is_active"]),
            "notes": (
                row["notes"] if row["notes"] is not None and str(row["notes"]) != "nan" else None
            ),
            "tables": _list_tables(meta, row["dataset_id"]),
        }
        grouped.setdefault(dtype, []).append(entry)
    return grouped


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

    def do_GET(self):
        if not self._check_auth():
            return self._send(401, {"ok": False, "error": "Unauthorized"})

        try:
            q = parse_qs(urlparse(self.path).query)
            domain = (q.get("domain", [""])[0] or "").strip()
            if not domain:
                return self._send(
                    400, {"ok": False, "error": "domain query param is required."}
                )

            meta = _get_meta()
            client_info, domain_info = _client_id_for_domain(meta, domain)

            sources: dict[str, list[dict]] = {
                "gsc": [],
                "gmb": [],
                "ga4": [],
                "facebook": [],
            }
            if client_info is not None:
                grouped = _grouped_datasets(meta, client_info["id"])
                for dtype in sources:
                    sources[dtype] = grouped.get(dtype, [])

            return self._send(
                200,
                {
                    "ok": True,
                    "client": client_info,
                    "domain": domain_info,
                    "sources": sources,
                },
            )
        except Exception as e:
            return self._send(500, {"ok": False, "error": str(e)})
