import { chromium } from "playwright";
import fs from "node:fs";
const [OUT, T] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: `${OUT}/raw-${T}`, size: { width: 1920, height: 1080 } } });
const p = await ctx.newPage(); const w = (ms) => p.waitForTimeout(ms);
const dark = () => p.evaluate(() => { document.documentElement.dataset.theme = "dark"; window.dispatchEvent(new Event("themechange")); });
const glide = async (y, ms = 1400) => { await p.evaluate(([y, ms]) => new Promise((r) => { const s = scrollY, d = y - s, t0 = performance.now(); const f = (t) => { const k = Math.min(1, (t - t0) / ms); const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; scrollTo(0, s + d * e); k < 1 ? requestAnimationFrame(f) : r(); }; requestAnimationFrame(f); }), [y, ms]); };
const sceneY = (id) => p.evaluate((i) => document.getElementById(i).getBoundingClientRect().top + scrollY - 113, id);
const go = async (id, hold = 2200) => { await glide(await sceneY(id)); await w(hold); };
const moveTo = async (sel, i = 0) => { const el = p.locator(sel).nth(i); const bx = await el.boundingBox(); if (bx) { await p.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2, { steps: 25 }); } return el; };
if (T === "home") {
  await p.goto("http://localhost:3000/", { waitUntil: "networkidle" }); await dark(); await w(1800);
  await moveTo("input"); await p.click("input"); await p.keyboard.type("Is Harvey AI worth backing against Legora?", { delay: 55 }); await w(900);
  await glide(1150, 1800); await w(2200); await glide(1900, 1600); await w(2200);
} else {
  const R = { harvey: ["harvey-vs-legora", "investor", ["field", "truth", "constellation", "deck"]], linear: ["linear-threats", "operator", ["field", "globe", "chord", "deck"]], scribe: ["ai-scribe-doctors-us", "founder", ["globe", "field", "constellation", "deck"]] }[T];
  const q = (await (await fetch(`http://localhost:3000/fixtures/runs/${R[0]}.json`)).json()).query;
  await p.goto(`http://localhost:3000/run/rec_${R[0]}?q=${encodeURIComponent(q)}&lens=${R[1]}`, { waitUntil: "domcontentloaded" }); await dark();
  await p.waitForSelector("#deck", { timeout: 180000 }); await w(2500); await glide(0, 600); await w(2500);
  const chip = await moveTo('section .tnum[title^="Evidence"]', 1); await w(400); await chip.click({ timeout: 3000 }).catch(() => {}); await w(2600); await p.keyboard.press("Escape"); await w(700);
  for (const s of R[2]) {
    await go(s, 600);
    if (s === "globe") { const g = p.locator("#globe canvas").first(); const bx = await g.boundingBox(); if (bx) { const cx = bx.x + bx.width / 2, cy = bx.y + bx.height / 2; await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx - 380, cy + 40, { steps: 60 }); await p.mouse.up(); await w(900); await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + 260, cy - 30, { steps: 45 }); await p.mouse.up(); } await w(1200); }
    else if (s === "field") { const play = p.locator('#field button[aria-label="Play"]').first(); if (await play.count()) { await moveTo('#field button[aria-label="Play"]'); await play.click({ timeout: 3000 }).catch(() => {}); await w(2600); } const row = await moveTo("#field [role=button]", 1); await row.click({ timeout: 3000 }).catch(() => {}); await w(1800); }
    else if (s === "chord") { await moveTo("#chord svg path", 3); await w(1400); await moveTo("#chord svg path", 8); await w(1400); }
    else if (s === "constellation") { await moveTo("#constellation circle", 4); await w(1400); }
    else if (s === "truth") { await w(1600); }
    else if (s === "deck") { await w(2400); await glide((await sceneY("deck")) + 700, 1600); await w(2000); }
  }
  if (T === "harvey") { await glide(0, 1200); await w(600); const op = await moveTo("header button:has-text('Operator')"); await op.click({ timeout: 3000 }).catch(() => {}); await w(2200); const fo = await moveTo("header button:has-text('Founder')"); await fo.click({ timeout: 3000 }).catch(() => {}); await w(2200); }
}
const vid = await p.video().path(); await ctx.close(); await b.close();
fs.renameSync(vid, `${OUT}/${T}.webm`); console.log("rec", T);
