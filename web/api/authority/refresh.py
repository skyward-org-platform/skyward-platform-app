"""Vercel Python function: refresh authority data for one property.

POST /api/authority/refresh?slug=<slug>

Calls DataForSEO Backlinks REST API:
- /v3/backlinks/summary/live  (DR/rank, total backlinks, ref domains)
- /v3/backlinks/referring_domains/live  (latest 1000 ref domains by first_seen desc)

Writes:
- 1 new row to site_snapshot
- Upserts to referring_domain by (property_id, domain), preserving user
  quality + notes (those columns are deliberately omitted from the upsert
  payload, so Supabase ON CONFLICT leaves them alone).

Returns JSON {ok, snapshot_id, refdomains_upserted, total_refdomains_seen}
or {ok: false, error}.

Auth: optional `Authorization: Bearer <APP_WRITE_TOKEN>` header — same
pattern as /api/data-access/register and /api/wqa/export.
"""
from __future__ import annotations

import base64
import json
import os
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen


DFS_BASE = "https://api.dataforseo.com/v3"
DFS_TIMEOUT = 120
SUPABASE_TIMEOUT = 30
REFDOMAIN_BATCH = 200
REFDOMAIN_LIMIT = 1000
SPAM_SCORE_THRESHOLD = 60  # backlinks_spam_score > 60 → detected_spam = true


# ─── DataForSEO REST ─────────────────────────────────────────────────────────
def _dfs_post(path: str, payload: list[dict]) -> dict:
    """POST to DataForSEO. Returns parsed JSON."""
    login = os.environ["DATAFORSEO_LOGIN"]
    password = os.environ["DATAFORSEO_PASSWORD"]
    auth = base64.b64encode(f"{login}:{password}".encode()).decode()
    req = Request(
        f"{DFS_BASE}{path}",
        method="POST",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Basic {auth}",
            "Content-Type": "application/json",
        },
    )
    with urlopen(req, timeout=DFS_TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _get_summary(domain: str) -> dict | None:
    """Returns the first result-item dict from /backlinks/summary/live."""
    r = _dfs_post(
        "/backlinks/summary/live",
        [{"target": domain, "internal_list_limit": 10}],
    )
    tasks = r.get("tasks") or []
    if not tasks:
        return None
    result = (tasks[0].get("result") or [])
    return result[0] if result else None


def _get_referring_domains(domain: str, limit: int = REFDOMAIN_LIMIT) -> list[dict]:
    """Returns the `items` list from /backlinks/referring_domains/live, ordered
    by first_seen desc."""
    r = _dfs_post(
        "/backlinks/referring_domains/live",
        [
            {
                "target": domain,
                "limit": limit,
                "order_by": ["first_seen,desc"],
                "internal_list_limit": 10,
            }
        ],
    )
    tasks = r.get("tasks") or []
    if not tasks:
        return []
    result = (tasks[0].get("result") or [])
    return result[0].get("items", []) if result else []


# ─── Supabase REST (matches the urllib pattern from web/api/wqa/export.py) ──
def _sb_env() -> tuple[str, str]:
    url = (
        os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        or os.environ.get("SUPABASE_URL")
    )
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "Supabase env vars missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"
        )
    return url.rstrip("/"), key


def _sb_get(path: str, *, params: dict | None = None) -> list[dict]:
    url, key = _sb_env()
    qs = "?" + urlencode(params) if params else ""
    req = Request(
        f"{url}/rest/v1/{path}{qs}",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
        },
    )
    try:
        with urlopen(req, timeout=SUPABASE_TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"Supabase GET {path} -> {e.code}: {body}")
    except URLError as e:
        raise RuntimeError(f"Supabase GET {path} -> network error: {e.reason}")


def _sb_insert(path: str, rows: list[dict]) -> list[dict]:
    """Plain insert. Returns inserted rows (representation)."""
    url, key = _sb_env()
    req = Request(
        f"{url}/rest/v1/{path}",
        method="POST",
        data=json.dumps(rows).encode("utf-8"),
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
    )
    try:
        with urlopen(req, timeout=SUPABASE_TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"Supabase POST {path} -> {e.code}: {body}")
    except URLError as e:
        raise RuntimeError(f"Supabase POST {path} -> network error: {e.reason}")


def _sb_upsert(path: str, rows: list[dict], *, on_conflict: str) -> list[dict]:
    """Upsert via PostgREST. `on_conflict` is a comma-separated column list
    matching a unique index. Only columns present in the row payload are
    SET on conflict — that's how we preserve user-edited `quality` / `notes`
    on referring_domain.
    """
    url, key = _sb_env()
    req = Request(
        f"{url}/rest/v1/{path}?on_conflict={on_conflict}",
        method="POST",
        data=json.dumps(rows).encode("utf-8"),
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=representation",
        },
    )
    try:
        with urlopen(req, timeout=SUPABASE_TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"Supabase UPSERT {path} -> {e.code}: {body}")
    except URLError as e:
        raise RuntimeError(f"Supabase UPSERT {path} -> network error: {e.reason}")


# ─── DFS field mapping helpers ──────────────────────────────────────────────
def _dofollow_count(item: dict) -> int:
    """DFS /backlinks/referring_domains/live items don't expose a `dofollow`
    field directly. Compute it as backlinks - referring_links_attributes.nofollow.
    """
    backlinks = item.get("backlinks") or 0
    attrs = item.get("referring_links_attributes") or {}
    nofollow = (attrs.get("nofollow") or 0) if isinstance(attrs, dict) else 0
    df = backlinks - nofollow
    return df if df >= 0 else 0


def _norm_iso(ts: str | None) -> str | None:
    """DFS returns timestamps like '2026-05-20 13:58:37 +00:00'. Convert to
    ISO 8601 ('T' separator, normalized offset) for Postgres."""
    if not ts:
        return None
    # Replace the first space (between date + time) with 'T', drop a stray
    # space before the offset.
    s = ts.strip()
    if " " in s:
        date_part, rest = s.split(" ", 1)
        rest = rest.replace(" ", "")
        return f"{date_part}T{rest}"
    return s


# ─── core refresh routine ───────────────────────────────────────────────────
def _refresh_property(slug: str, operator: str) -> dict:
    rows = _sb_get(
        "property",
        params={"select": "id,primary_domain,slug", "slug": f"eq.{slug}", "limit": 1},
    )
    if not rows:
        return {"ok": False, "error": f"property slug={slug} not found"}
    prop = rows[0]
    property_id = prop["id"]
    domain = (prop.get("primary_domain") or "").strip()
    if not domain:
        return {"ok": False, "error": f"property slug={slug} has no primary_domain"}

    summary = _get_summary(domain) or {}
    refdomains = _get_referring_domains(domain)

    # ── site_snapshot ──
    snap_payload = {
        "property_id": property_id,
        "domain_rating": summary.get("rank"),  # DFS uses 0-1000 rank as the DR proxy
        "live_backlinks": summary.get("backlinks"),
        "live_refdomains": summary.get("referring_domains"),
        # /backlinks/summary doesn't return organic_traffic / keywords. A
        # separate /labs call could enrich these later; null for now.
        "source": "dataforseo",
        "fetched_by": operator,
    }
    inserted = _sb_insert("site_snapshot", [snap_payload])
    snap_id = (inserted[0] if inserted else {}).get("id")

    # ── referring_domain upserts ──
    now_iso = datetime.now(timezone.utc).isoformat()
    upserted = 0
    for i in range(0, len(refdomains), REFDOMAIN_BATCH):
        chunk = refdomains[i : i + REFDOMAIN_BATCH]
        payload = []
        for d in chunk:
            domain_name = (d.get("domain") or "").strip()
            if not domain_name:
                continue
            spam_score = d.get("backlinks_spam_score") or 0
            try:
                spam_score_int = int(spam_score)
            except (TypeError, ValueError):
                spam_score_int = 0
            payload.append(
                {
                    "property_id": property_id,
                    "domain": domain_name,
                    "first_seen": _norm_iso(d.get("first_seen")),
                    # DFS doesn't expose a `last_seen` column; `lost_date` is
                    # the closest analog (set when the domain stopped linking).
                    "last_seen": _norm_iso(d.get("lost_date")),
                    "domain_rating": d.get("rank"),
                    # Not returned at the per-refdomain level — null. Could be
                    # enriched via DFS Labs later.
                    "traffic_domain": None,
                    "dofollow_links": _dofollow_count(d),
                    "links_to_target": d.get("backlinks") or 0,
                    "detected_spam": spam_score_int > SPAM_SCORE_THRESHOLD,
                    "last_refreshed_at": now_iso,
                    "updated_by": operator,
                }
            )
        if not payload:
            continue
        # IMPORTANT: payload deliberately omits `quality` and `notes` so the
        # PostgREST upsert leaves user-edited values intact on conflict.
        result = _sb_upsert(
            "referring_domain", payload, on_conflict="property_id,domain"
        )
        upserted += len(result or [])

    return {
        "ok": True,
        "snapshot_id": snap_id,
        "refdomains_upserted": upserted,
        "total_refdomains_seen": len(refdomains),
    }


# ─── handler ────────────────────────────────────────────────────────────────
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
        return header[len("Bearer ") :] == expected

    def do_POST(self):
        if not self._check_auth():
            return self._send_json(401, {"ok": False, "error": "Unauthorized"})
        try:
            parsed = urlparse(self.path)
            params = parse_qs(parsed.query)
            slug = (params.get("slug") or [""])[0].strip()
            if not slug:
                return self._send_json(
                    400, {"ok": False, "error": "missing ?slug="}
                )
            operator = (
                self.headers.get("X-Operator") or "system:authority-refresh"
            )
            result = _refresh_property(slug, operator)
            status = 200 if result.get("ok") else 500
            return self._send_json(status, result)
        except Exception as e:
            return self._send_json(
                500, {"ok": False, "error": f"{type(e).__name__}: {e}"}
            )
