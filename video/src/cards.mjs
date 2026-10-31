import { chromium } from "playwright";
import fs from "node:fs";
const [V] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(`${V}/cards.json`, "utf8"));
const font = `-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif`;
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
for (const [id, eyebrow, text] of spec.cards) {
  const big = id === "c04" || id === "e02";
  await p.setContent(`<html><body style="margin:0;width:1920px;height:1080px;background:#000;display:flex;align-items:center;justify-content:center;font-family:${font};-webkit-font-smoothing:antialiased">
  <div style="text-align:center">
   ${eyebrow ? `<div style="font-size:${big ? 30 : 24}px;letter-spacing:.32em;color:${big ? "#fff" : "#3b82f6"};font-weight:600;margin-bottom:${big ? 34 : 30}px">${big ? `<span style="display:inline-block;width:22px;height:22px;border-radius:50%;border:3px solid #fff;margin-right:16px;vertical-align:-2px;position:relative"><span style="position:absolute;inset:6px;border-radius:50%;background:#3b82f6"></span></span>` : ""}${eyebrow}</div>` : ""}
   <div style="font-size:${big ? 92 : 78}px;line-height:1.12;font-weight:600;letter-spacing:-.035em;color:#f5f5f7">${text}</div>
  </div></body></html>`);
  await p.screenshot({ path: `${V}/cards/${id}.png` });
}
for (const [id, text] of Object.entries(spec.captions)) {
  await p.setContent(`<html><body style="margin:0;width:1920px;height:1080px;background:transparent;font-family:${font};-webkit-font-smoothing:antialiased">
   <div style="position:absolute;left:0;right:0;bottom:64px;text-align:center"><span style="display:inline-block;padding:18px 34px;border-radius:999px;background:rgba(0,0,0,.78);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(12px);color:#fff;font-size:40px;font-weight:600;letter-spacing:-.015em">${text}</span></div></body></html>`);
  await p.screenshot({ path: `${V}/cards/cap-${id}.png`, omitBackground: true });
}
await b.close(); console.log("cards done");
