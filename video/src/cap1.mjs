import { chromium } from "playwright";
const [OUT, TARGET] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const wait = (ms) => p.waitForTimeout(ms);
const dark = () => p.evaluate(() => { document.documentElement.dataset.theme = "dark"; window.dispatchEvent(new Event("themechange")); });
const shot = async (n) => { await p.screenshot({ path: `${OUT}/${n}.png` }); console.log("shot", n); };
const toScene = async (id) => { await p.evaluate((i) => { const el = document.getElementById(i); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 113); }, id); await wait(1500); };
if (TARGET === "home") {
  await p.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 }); await dark(); await wait(2000);
  await shot("home-hero");
  await p.evaluate(() => { const h = [...document.querySelectorAll("h2")].find((x) => x.innerText.includes("Three different")); window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 60); }); await wait(1200); await shot("home-personas");
} else {
  const R = { harvey: ["harvey-vs-legora", "investor", ["field", "truth", "constellation", "deck"]], linear: ["linear-threats", "operator", ["field", "streams", "globe", "chord"]], scribe: ["ai-scribe-doctors-us", "founder", ["globe", "constellation", "deck"]] }[TARGET];
  const [slug, lens, scenes] = R;
  const q = (await (await fetch(`http://localhost:3000/fixtures/runs/${slug}.json`)).json()).query;
  await p.goto(`http://localhost:3000/run/rec_${slug}?q=${encodeURIComponent(q)}&lens=${lens}`, { waitUntil: "networkidle", timeout: 120000 }); await dark();
  await wait(1500); await shot(`${TARGET}-trace`);
  await p.waitForSelector("#deck", { timeout: 180000 }); await wait(3000);
  await p.evaluate(() => window.scrollTo(0, 0)); await wait(1000); await shot(`${TARGET}-brief`);
  for (const s of scenes) { await toScene(s); await shot(`${TARGET}-${s}`); }
  if (TARGET === "scribe") { await p.evaluate(() => { const el = document.getElementById("deck"); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY + 650); }); await wait(1200); await shot("scribe-deck2"); }
  if (TARGET === "harvey") { await p.evaluate(() => window.scrollTo(0, 0)); await wait(600); await p.locator("section button.tnum").first().click(); await wait(2000); await shot("harvey-evidence"); }
}
await b.close();
