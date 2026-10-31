"""Small text helpers used by the rule-based judgment steps."""
from __future__ import annotations

import re
from urllib.parse import urlparse

STOP = set("""a an the of for and or to in on at by with from into over under is are be as it its this that these those
we our us you your i my me they their them he she his her who what which how why when where can will would should could
build building make making want wants need needs company companies startup startups platform platforms tool tools app apps
software service services solution solutions product products ai based using use uses used new top best market space idea
invest investing investor investors should about like map analyze analyse research""".split())


def tokens(s: str | None) -> set[str]:
    if not s:
        return set()
    return {t for t in re.findall(r"[a-z0-9][a-z0-9\-]+", s.lower()) if t not in STOP and len(t) > 2}


# Filler that market descriptions are full of but that says nothing about the market itself.
FILLER = set("""business businesse let lets enable enable enabling help helps helping power powered powering ai-powered
deploy deploying build builder interaction organization organisation team world leading one more across every
provide provider offer offering create creating manage way easy simple fast faster better""".split())


def _stem(w: str) -> str:
    if len(w) > 4 and w.endswith("ies"):
        return w[:-3] + "y"
    if len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
        return w[:-1]
    return w


def terms(s: str | None) -> set[str]:
    """tokens() plus light stemming and filler removal, so "AI agents" matches "agent". Discovery only."""
    return {t for t in (_stem(w) for w in tokens(s)) if t not in FILLER and t not in STOP}


def overlap(a: str | None, b: str | None) -> float:
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta)


def domain_of(s: str) -> str | None:
    s = s.strip()
    if "." not in s or " " in s:
        return None
    if not s.startswith("http"):
        s = "https://" + s
    host = urlparse(s).netloc.lower()
    host = host[4:] if host.startswith("www.") else host
    return host or None


def find_domain(text: str) -> str | None:
    m = re.search(r"\b([a-z0-9-]+\.(?:ai|com|io|co|app|dev|tech|net|org|in|xyz|cloud))\b", text.lower())
    return m.group(1) if m else None


def find_linkedin(text: str) -> str | None:
    m = re.search(r"https?://(?:www\.)?linkedin\.com/company/[A-Za-z0-9\-_%]+", text)
    return m.group(0) if m else None
