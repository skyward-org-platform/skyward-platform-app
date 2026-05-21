"""Vercel Python function: POST /api/llm/calculate-cost

Wraps `skyward.llm.costs.calculate_cost` — the canonical source of truth
for LLM pricing across all Skyward projects. The TypeScript route handlers
(Brand DNA Assistant, Research & Fill) call this after every Anthropic
completion to get a USD cost they can log to llm_call_log.

Body:
    {
        "model": "claude-sonnet-4-6",   (Anthropic model id)
        "input_tokens": 1234,
        "output_tokens": 567,
        "provider": "anthropic"          (optional; defaults to "anthropic")
    }

Returns:
    { "ok": true, "cost_usd": 0.012345, "model_normalized": "claude-sonnet-4-20250514" }
    { "ok": false, "error": "..." }

The `model_normalized` field reports which pricing table entry was used
when the supplied model name needed aliasing (e.g. "claude-sonnet-4-6"
isn't in skyward-common's ANTHROPIC_COSTS yet, so it maps to
"claude-sonnet-4-20250514" which has the same per-token pricing).

Auth: optional `Authorization: Bearer <APP_WRITE_TOKEN>` header. Skipped if
APP_WRITE_TOKEN isn't set (dev convenience).
"""
from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler


# Aliases for model names that haven't landed in skyward-common's pricing
# table yet. Keys are the strings the platform sends; values are entries
# from ANTHROPIC_COSTS / OPENAI_COSTS / GEMINI_COSTS etc.
MODEL_ALIASES = {
    # Sonnet 4.x — same pricing as 2025-05-14 release
    "claude-sonnet-4-6": "claude-sonnet-4-20250514",
    # Opus 4.x — same pricing as 2025-05-14 release
    "claude-opus-4-7": "claude-opus-4-20250514",
    # Haiku 4.5 — assume same as 3.5 until skyward-common catches up
    "claude-haiku-4-5-20251001": "claude-haiku-3-5-20241022",
}


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

        model = (body.get("model") or "").strip()
        provider = (body.get("provider") or "anthropic").strip().lower()
        try:
            input_tokens = int(body.get("input_tokens") or 0)
            output_tokens = int(body.get("output_tokens") or 0)
        except (TypeError, ValueError):
            return self._send(
                400,
                {
                    "ok": False,
                    "error": "input_tokens and output_tokens must be integers.",
                },
            )

        if not model:
            return self._send(400, {"ok": False, "error": "model is required."})

        normalized = MODEL_ALIASES.get(model, model)

        try:
            from skyward.llm.costs import calculate_cost

            cost = calculate_cost(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                model=normalized,
                provider=provider,
            )
            return self._send(
                200,
                {
                    "ok": True,
                    "cost_usd": round(float(cost), 6),
                    "model_normalized": normalized,
                },
            )
        except KeyError as e:
            return self._send(
                200,
                {
                    "ok": False,
                    "error": f"No pricing entry for {normalized!r}. "
                    f"Add it to skyward.llm.costs and update MODEL_ALIASES if needed. ({e})",
                },
            )
        except Exception as e:
            return self._send(500, {"ok": False, "error": str(e)})
