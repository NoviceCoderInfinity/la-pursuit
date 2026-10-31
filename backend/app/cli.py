"""CLI: python -m app.cli run "AI voice agent platforms" --until enrich"""
from __future__ import annotations

import asyncio
import json

import typer

from app.pipeline import Run

cli = typer.Typer(add_completion=False, no_args_is_help=True)


@cli.command()
def identify(name: str):
    """Resolve a company name/domain to its canonical Crustdata id."""
    async def go():
        r = Run(name)
        from app.textutil import find_domain
        d = find_domain(name)
        data, ev = await (r.client.identify(domains=[d]) if d else r.client.identify(names=[name]))
        for m in (data[0].get("matches") or [])[:5]:
            b = m["company_data"]["basic_info"]
            typer.echo(f"{m['confidence_score']:.2f}  {b['name']:<28} {b.get('primary_domain') or '-':<24} id={b.get('crustdata_company_id')}  {b.get('employee_count_range')}")
        typer.echo(f"evidence: {ev} · {r.ledger.get(ev).endpoint}")
        await r.client.aclose()
    asyncio.run(go())


@cli.command()
def run(query: str, lens: str = typer.Option(None), until: str = typer.Option(None),
        no_cache: bool = typer.Option(False, "--no-cache"), out: str = typer.Option(None, help="write report JSON here")):
    """Run the pipeline and print a summary."""
    async def go():
        r = Run(query, lens, use_cache=not no_cache)
        async def printer():
            async for e in r.tracer.subscribe():
                d = e.decision
                tag = f"[{e.stage}] "
                if e.type == "stage_start": typer.echo(typer.style(f"\n▶ {e.label}", bold=True))
                elif e.type == "stage_done": typer.echo(typer.style(f"✓ {e.label}", fg="green"))
                elif e.type == "decision" and d: typer.echo(f"  {tag}{d.kind:<12} {d.subject}: {d.reason}")
                elif e.type == "tool_result": typer.echo(f"  {tag}← {e.label} ({e.detail.get('count')} rows, {e.detail.get('ms')}ms{', cached' if e.detail.get('cached') else ''}) {e.ev}")
                elif e.type == "error": typer.echo(typer.style(f"  ✗ {e.label}: {e.detail}", fg="red"))
                elif e.type == "note": typer.echo(f"  {tag}· {e.label}")
        task = asyncio.create_task(printer())
        await r.run(until)
        await task
        await r._close()
        typer.echo(f"\npeers: {len(r.peers)} · ledger entries: {len(r.ledger)} · credits used: {r.credits_used if hasattr(r,'credits_used') else (r.credits_start or 0) - (r.credits_end or 0):.1f}")
        for p in r.peers:
            typer.echo(f"  {p.name:<22} {p.domain:<22} hc={p.headcount!s:<6} raised={_usd(p.raised_usd):<8} {p.hq.label or ''}")
        path = r.save()
        typer.echo(f"saved {path}")
        if out:
            with open(out, "w") as f: json.dump(r.report(), f, default=str)
    asyncio.run(go())


@cli.command("export")
def export(run_ids: list[str], slugs: str = typer.Option(None, help="comma-separated slugs, same order as run ids")):
    """Copy saved runs (backend/runs/<id>.json) into fixtures/runs/<slug>.json and rebuild index.json."""
    import re
    from app.config import REPO_DIR, settings
    dest = REPO_DIR / "fixtures" / "runs"
    dest.mkdir(parents=True, exist_ok=True)
    names = slugs.split(",") if slugs else []
    for i, rid in enumerate(run_ids):
        src = settings.runs_dir / f"{rid}.json"
        rep = json.loads(src.read_text())
        slug = names[i] if i < len(names) else re.sub(r"[^a-z0-9]+", "-", rep["query"].lower()).strip("-")[:48]
        rep["recorded"] = {"slug": slug, "run_id": rid}
        (dest / f"{slug}.json").write_text(json.dumps(rep, ensure_ascii=False, default=str))
        typer.echo(f"exported {rid} -> fixtures/runs/{slug}.json ({src.stat().st_size/1e6:.1f} MB)")
    index = []
    for f in sorted(dest.glob("*.json")):
        if f.name == "index.json":
            continue
        rep = json.loads(f.read_text())
        s = rep.get("summary") or {}
        index.append({"slug": f.stem, **s, "query": rep["query"], "lens": rep.get("lens"), "created": rep.get("created")})
    index.sort(key=lambda r: r.get("created") or "", reverse=True)
    (dest / "index.json").write_text(json.dumps(index, ensure_ascii=False, default=str))
    typer.echo(f"index: {len(index)} runs")


def _usd(v):
    if not v: return "-"
    return f"${v/1e6:.0f}M" if v >= 1e6 else f"${v/1e3:.0f}K"


if __name__ == "__main__":
    cli()
