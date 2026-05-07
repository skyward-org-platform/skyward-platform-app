"""Shared Supabase client factory used by seed/backfill/export scripts."""
from __future__ import annotations

import os
import sys
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client

# Ensure the seo-platform dir is on sys.path so sibling packages resolve.
# The dash in 'seo-platform' makes it invalid as a Python package name,
# so we operate from inside the dir and import siblings as top-level packages.
_HERE = Path(__file__).resolve().parent.parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

load_dotenv("/Users/paulskirbe/agency/.env")


@lru_cache(maxsize=1)
def get_admin_client() -> Client:
    """Service-role client. Bypasses RLS. Use for backend scripts."""
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)
