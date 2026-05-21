"""Vercel Python function: GET /api/wqa/export

Streams either the Phase 1 12-tab WQA workbook (default) or the Phase 2
Technical SEO Audit workbook for a single property, generated on demand
from live state:

  - BQ `wqa_output` row set (resolved by property's primary_domain)
  - Supabase `wqa_decision` overrides (per-URL action override)
  - Supabase `page_execution` rows (Phase 1 only — per-URL target H1 /
    title / meta / target URL surfaced in the Restore + Redirect tabs)
  - Supabase `page_check_state` rows (Phase 2 only — per-check workflow
    status overlaid onto the failing T/C tabs)

Query params:
    slug    (required)  property slug, e.g. "buscharter"
    env     (optional)  "dev" (default) | "prod"
    phase   (optional)  "1" (default) | "2"

Response: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
attachment. Filename:
  - phase=1: `{slug}-Website-Quality-Audit-{YYYY-MM-DD}.xlsx`
  - phase=2: `{slug}-Technical-SEO-Audit-{YYYY-MM-DD}.xlsx`

Auth: optional `Authorization: Bearer <APP_WRITE_TOKEN>` header.
"""
from __future__ import annotations

import datetime as _dt
import json
import os
import re
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse, urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


# ─── BQ singleton (lazy) ───────────────────────────────────────────────────
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
    d = (d or "").strip().lower()
    for prefix in ("https://", "http://", "www."):
        if d.startswith(prefix):
            d = d[len(prefix):]
    return d.rstrip("/")


def _fetch_latest_rows(bq, dataset: str, domain: str, limit: int = 5000):
    """Same query shape as /api/wqa/pages — fetch the most-recent
    (project_id, version) covering this domain and return its rows."""
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
        return []
    df = df.drop(columns=["project_id", "latest_version"], errors="ignore")
    # Scrub NaN → None so pandas downstream stays clean.
    import math
    out = []
    for row in df.to_dict("records"):
        clean = {}
        for k, v in row.items():
            if v is None:
                clean[k] = None
            elif isinstance(v, float) and math.isnan(v):
                clean[k] = None
            elif isinstance(v, (bytes, bytearray)):
                clean[k] = v.decode("utf-8", errors="replace")
            else:
                clean[k] = v
        out.append(clean)
    return out


# ─── Supabase REST helpers ─────────────────────────────────────────────────
def _supabase_get(path: str, *, params: dict | None = None) -> list[dict]:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "Supabase env vars missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"
        )
    qs = "?" + urlencode(params) if params else ""
    req = Request(
        f"{url.rstrip('/')}/rest/v1/{path}{qs}",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
        },
    )
    try:
        with urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"Supabase GET {path} -> {e.code}: {body}")
    except URLError as e:
        raise RuntimeError(f"Supabase GET {path} -> network error: {e.reason}")


def _resolve_property(slug: str) -> dict | None:
    rows = _supabase_get(
        "property",
        params={"select": "id,name,primary_domain,slug", "slug": f"eq.{slug}", "limit": 1},
    )
    return rows[0] if rows else None


def _load_overrides(property_id: str) -> dict[str, dict]:
    rows = _supabase_get(
        "wqa_decision",
        params={
            "select": "url,action,decided_by,decided_at",
            "property_id": f"eq.{property_id}",
        },
    )
    return {r["url"]: r for r in rows}


def _load_executions(property_id: str) -> dict[str, dict]:
    rows = _supabase_get(
        "page_execution",
        params={
            "select": "url,status,owner,due_date,notes,target_url,target_h1,target_title,target_meta",
            "property_id": f"eq.{property_id}",
        },
    )
    return {r["url"]: r for r in rows}


def _load_check_states(property_id: str) -> dict[str, dict]:
    """Returns map keyed by "url\\x1fcheck_id"."""
    rows = _supabase_get(
        "page_check_state",
        params={
            "select": "url,check_id,status,notes,owner,fix_applied_at",
            "property_id": f"eq.{property_id}",
        },
    )
    return {f"{r['url']}\x1f{r['check_id']}": r for r in rows}


# ─── filename helper ────────────────────────────────────────────────────────
_SAFE_FN = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_filename(s: str) -> str:
    return _SAFE_FN.sub("-", s).strip("-") or "export"


# ─── handler ───────────────────────────────────────────────────────────────
class handler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, body):
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
        return header[len("Bearer "):] == expected

    def do_GET(self):
        if not self._check_auth():
            return self._send_json(401, {"ok": False, "error": "Unauthorized"})

        try:
            q = parse_qs(urlparse(self.path).query)
            slug = (q.get("slug", [""])[0] or "").strip()
            env = (q.get("env", ["dev"])[0] or "dev").strip().lower()
            phase = (q.get("phase", ["1"])[0] or "1").strip()
            if not slug:
                return self._send_json(400, {"ok": False, "error": "slug query param required."})
            if phase not in ("1", "2"):
                return self._send_json(400, {"ok": False, "error": "unknown phase"})

            prop = _resolve_property(slug)
            if not prop:
                return self._send_json(404, {"ok": False, "error": f"property {slug!r} not found"})

            primary_domain = (prop.get("primary_domain") or "").strip()
            if not primary_domain:
                return self._send_json(
                    400,
                    {"ok": False, "error": f"property {slug!r} has no primary_domain set"},
                )

            dataset = "SEOPipelineDev" if env == "dev" else "SEOPipeline"
            domain_norm = _normalize_domain(primary_domain)

            bq = _get_bq()
            rows = _fetch_latest_rows(bq, dataset, domain_norm)
            if not rows:
                return self._send_json(
                    404,
                    {
                        "ok": False,
                        "error": (
                            f"No WQA run found in {dataset}.wqa_output for "
                            f"domain {domain_norm!r}. Run "
                            f"`uv run wqa --domain {domain_norm}` first."
                        ),
                    },
                )

            overrides = _load_overrides(prop["id"])
            title = (prop.get("name") or slug).strip()

            # Builder imports: deferred so cold-start of unrelated routes
            # doesn't pay openpyxl + pandas import cost. Vercel runs each
            # function file in isolation, so we add this dir to sys.path.
            import sys as _sys
            _here = os.path.dirname(os.path.abspath(__file__))
            if _here not in _sys.path:
                _sys.path.insert(0, _here)

            today = _dt.date.today().isoformat()

            if phase == "2":
                check_states = _load_check_states(prop["id"])
                from _phase1_builder import build_phase1_dataframe  # type: ignore
                from _phase2_builder import build_phase2_workbook  # type: ignore

                triage_df = build_phase1_dataframe(
                    rows, domain=domain_norm, overrides=overrides
                )

                # Sitewide HTTP probes (S1/S3) hit the public origin; allow
                # disabling via env so we can keep cold invocations fast.
                skip_http = os.environ.get("PHASE2_SKIP_SITEWIDE_HTTP", "").lower() in (
                    "1", "true", "yes",
                )
                buf = build_phase2_workbook(
                    triage_df,
                    title=title,
                    domain=domain_norm,
                    check_states=check_states,
                    skip_sitewide_http=skip_http,
                )
                filename = f"{_safe_filename(slug)}-Technical-SEO-Audit-{today}.xlsx"
            else:
                executions = _load_executions(prop["id"])
                from _phase1_builder import build_phase1_workbook  # type: ignore

                # Pick a primary host: prefer the canonical https://www.{domain}
                # form unless the resolved BQ rows show a bare-host majority.
                primary_host = f"https://www.{domain_norm}"

                buf = build_phase1_workbook(
                    rows,
                    title=title,
                    primary_host=primary_host,
                    domain=domain_norm,
                    overrides=overrides,
                    executions=executions,
                )
                filename = f"{_safe_filename(slug)}-Website-Quality-Audit-{today}.xlsx"

            data = buf.getvalue()

            self.send_response(200)
            self.send_header(
                "Content-Type",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            self.send_header(
                "Content-Disposition", f'attachment; filename="{filename}"'
            )
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            return self._send_json(500, {"ok": False, "error": f"{type(e).__name__}: {e}"})
