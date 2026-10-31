import { chromium } from "playwright";
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 })).newPage();
await p.goto("http://localhost:3000/run/rec_harvey-vs-legora?q=" + encodeURIComponent("Is Harvey AI worth backing against Legora?") + "&lens=investor", { waitUntil: "networkidle", timeout: 120000 });
await p.evaluate(() => { document.documentElement.dataset.theme = "dark"; window.dispatchEvent(new Event("themechange")); });
await p.waitForSelector("#deck", { timeout: 180000 }); await p.waitForTimeout(3000);
await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(800);
const chip = p.locator('section .tnum[title^="Evidence"]').first(); await chip.click(); await p.waitForTimeout(2500);
await p.screenshot({ path: process.argv[2] }); await b.close(); console.log("ok");
