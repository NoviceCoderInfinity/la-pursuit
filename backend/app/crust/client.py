"""Typed, rate-limit-aware Crustdata client with disk cache, backoff and ledger hooks."""
from __future__ import annotations

import asyncio
import hashlib
import json
import time
from typing import Any

import httpx
from diskcache import Cache

from app.config import settings
from app.ledger import Ledger
from app.trace import Tracer

# requests per minute per endpoint (from docs.crustdata.com/general/rate-limits)
RPM = {
    "/company/enrich": 15, "/person/enrich": 15,
    "/company/search": 30, "/person/search": 30, "/job/search": 30,
    "/company/identify": 30,
    "/web/search/live": 10, "/web/enrich/live": 10,
    "/watch": 10, "/account": 60,
}


class CrustError(RuntimeError):
    def __init__(self, status: int, message: str, path: str):
        super().__init__(f"{path} -> {status}: {message}")
        self.status, self.message, self.path = status, message, path


class _Gate:
    """Spaces calls to one endpoint so we never exceed its RPM."""
    def __init__(self, rpm: int):
        self.interval = 60.0 / rpm
        self.last = 0.0
        self.lock = asyncio.Lock()

    async def wait(self) -> None:
        async with self.lock:
            now = time.monotonic()
            delay = self.last + self.interval - now
            if delay > 0:
                await asyncio.sleep(delay)
            self.last = time.monotonic()


class CrustClient:
    def __init__(self, ledger: Ledger, tracer: Tracer, *, use_cache: bool | None = None):
        self.ledger, self.tracer = ledger, tracer
        self.use_cache = settings.use_cache if use_cache is None else use_cache
        self.cache = Cache(str(settings.cache_dir / "crust"))
        self.http = httpx.AsyncClient(
            base_url=settings.crust_base_url, timeout=httpx.Timeout(300.0, connect=15.0),
            headers={"Authorization": f"Bearer {settings.crust_api_key}",
                     "x-api-version": settings.crust_api_version,
                     "Content-Type": "application/json"})
        self._gates: dict[str, _Gate] = {}

    async def aclose(self) -> None:
        await self.http.aclose()

    def _gate(self, path: str) -> _Gate:
        key = next((k for k in RPM if path.startswith(k)), "/company/search")
        if key not in self._gates:
            self._gates[key] = _Gate(RPM[key])
        return self._gates[key]

    @staticmethod
    def _cache_key(method: str, path: str, body: Any) -> str:
        raw = f"{method} {path} {json.dumps(body, sort_keys=True, default=str)}"
        return hashlib.sha256(raw.encode()).hexdigest()

    async def call(self, method: str, path: str, body: dict[str, Any] | None = None, *,
                   label: str, cacheable: bool = True, params: dict[str, Any] | None = None) -> tuple[Any, str]:
        """Perform one API call. Returns (response_json, evidence_id)."""
        tr = self.tracer
        key = self._cache_key(method, path, {"body": body, "params": params})
        tr.emit("tool_call", label, detail={"endpoint": path, "method": method,
                                            "params": _short(body or params or {})})
        if cacheable and self.use_cache and key in self.cache:
            data = self.cache[key]
            ev = self.ledger.record(path, body or params or {}, data, cached=True, label=label, ms=0)
            tr.emit("tool_result", label, detail={"endpoint": path, "cached": True,
                                                  "count": _count(data), "ms": 0}, ev=[ev])
            return data, ev

        attempt, last_err = 0, None
        while attempt < 3:
            attempt += 1
            await self._gate(path).wait()
            t0 = time.monotonic()
            try:
                r = await self.http.request(method, path, json=body, params=params)
            except httpx.HTTPError as e:   # network / timeout
                last_err = CrustError(0, str(e), path)
                tr.decide("retry", path, f"network error on attempt {attempt}: {type(e).__name__}")
                await asyncio.sleep(2 ** attempt)
                continue
            ms = int((time.monotonic() - t0) * 1000)
            if r.status_code == 429 or r.status_code >= 500:
                wait = float(r.headers.get("Retry-After", 2 ** attempt))
                last_err = CrustError(r.status_code, r.text[:200], path)
                tr.decide("retry", path, f"HTTP {r.status_code} on attempt {attempt}, backing off {wait:.0f}s")
                await asyncio.sleep(min(wait, 30))
                continue
            if r.status_code >= 400:
                msg = _err_msg(r)
                tr.emit("error", label, detail={"endpoint": path, "status": r.status_code, "message": msg})
                raise CrustError(r.status_code, msg, path)
            data = r.json()
            if cacheable and self.use_cache:
                self.cache.set(key, data, expire=settings.cache_ttl_s)
            ev = self.ledger.record(path, body or params or {}, data, ms=ms, label=label)
            tr.emit("tool_result", label, detail={"endpoint": path, "cached": False,
                                                  "count": _count(data), "ms": ms}, ev=[ev])
            return data, ev
        assert last_err is not None
        tr.emit("error", label, detail={"endpoint": path, "message": str(last_err), "attempts": attempt})
        raise last_err

    # ---- typed helpers -------------------------------------------------------
    async def identify(self, *, names: list[str] | None = None, domains: list[str] | None = None,
                       linkedin_urls: list[str] | None = None, label: str = "company/identify"):
        body: dict[str, Any] = {}
        if names: body["names"] = names
        if domains: body["domains"] = domains
        if linkedin_urls: body["professional_network_profile_urls"] = linkedin_urls
        return await self.call("POST", "/company/identify", body, label=label)

    async def enrich(self, domains: list[str], fields: list[str], label: str = "company/enrich"):
        return await self.call("POST", "/company/enrich", {"domains": domains, "fields": fields}, label=label)

    async def enrich_ids(self, ids: list[int], fields: list[str], label: str = "company/enrich"):
        return await self.call("POST", "/company/enrich", {"crustdata_company_ids": ids, "fields": fields}, label=label)

    async def search_companies(self, *, query: str | None = None, mode: str = "hybrid",
                               filters: dict[str, Any] | None = None, fields: list[str] | None = None,
                               limit: int = 25, label: str = "company/search"):
        body: dict[str, Any] = {"limit": limit}
        if query: body["search"] = {"query": query, "mode": mode}
        if filters: body["filters"] = filters
        if fields: body["fields"] = fields
        return await self.call("POST", "/company/search", body, label=label)

    async def search_jobs(self, body: dict[str, Any], label: str = "job/search"):
        return await self.call("POST", "/job/search", body, label=label)

    async def search_people(self, body: dict[str, Any], label: str = "person/search"):
        return await self.call("POST", "/person/search", body, label=label)

    async def enrich_people(self, urls: list[str], fields: list[str] | None = None, label: str = "person/enrich"):
        body: dict[str, Any] = {"professional_network_profile_urls": urls}
        if fields: body["fields"] = fields
        return await self.call("POST", "/person/enrich", body, label=label)

    async def web_search(self, query: str, *, sources: list[str] | None = None, label: str = "web/search"):
        body: dict[str, Any] = {"query": query}
        if sources: body["sources"] = sources
        return await self.call("POST", "/web/search/live", body, label=label)

    async def web_fetch(self, urls: list[str], label: str = "web/fetch"):
        return await self.call("POST", "/web/enrich/live", {"urls": urls}, label=label)

    async def watch_company(self, body: dict[str, Any], *, preview: bool, label: str = "watch/company"):
        b = dict(body, preview=preview)
        return await self.call("POST", "/watch/company", b, label=label, cacheable=preview)

    async def watch_company_discovery(self, body: dict[str, Any], *, preview: bool, label: str = "watch/company/search"):
        b = dict(body, preview=preview)
        return await self.call("POST", "/watch/company/search", b, label=label, cacheable=preview)

    async def credits(self) -> float | None:
        try:
            data, _ = await self.call("GET", "/account/credits", None, label="account/credits", cacheable=False)
            return float(data["account"]["credits"])
        except Exception:
            return None


def _short(obj: Any, limit: int = 300) -> Any:
    s = json.dumps(obj, default=str)
    return obj if len(s) <= limit else {"_preview": s[:limit] + " …"}


def _count(data: Any) -> int | None:
    if isinstance(data, list):
        return len(data)
    if isinstance(data, dict):
        for k in ("companies", "profiles", "job_listings", "results"):
            if isinstance(data.get(k), list):
                return len(data[k])
    return None


def _err_msg(r: httpx.Response) -> str:
    try:
        j = r.json()
        return j.get("error", {}).get("message") or j.get("error_msg") or r.text[:200]
    except Exception:
        return r.text[:200]
