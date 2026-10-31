"""Settings loaded from backend/.env (falls back to ../api.key for the Crustdata key)."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = BACKEND_DIR.parent
load_dotenv(BACKEND_DIR / ".env")


def _crust_key() -> str:
    key = (os.getenv("CRUSTDATA_API_KEY") or "").strip()
    if key:
        return key
    p = REPO_DIR / "api.key"
    if p.exists():
        return p.read_text().strip()
    raise RuntimeError("CRUSTDATA_API_KEY is not set and api.key was not found")


class Settings:
    crust_api_key: str = _crust_key()
    crust_api_version: str = os.getenv("CRUSTDATA_API_VERSION", "2025-11-01")
    crust_base_url: str = "https://api.crustdata.com"
    anthropic_api_key: str | None = (os.getenv("ANTHROPIC_API_KEY") or "").strip() or None
    model: str = os.getenv("VANTAGE_MODEL", "claude-opus-5-5")
    cache_dir: Path = BACKEND_DIR / ".cache"
    runs_dir: Path = BACKEND_DIR / "runs"
    use_cache: bool = os.getenv("VANTAGE_NO_CACHE", "") == ""
    cache_ttl_s: int = 24 * 3600
    min_peers: int = 10
    max_peers: int = 15
    max_discovery_rounds: int = 3


settings = Settings()
settings.cache_dir.mkdir(parents=True, exist_ok=True)
settings.runs_dir.mkdir(parents=True, exist_ok=True)
