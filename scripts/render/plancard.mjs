// Is the home plan-card button visible (the suite scrolls to it)?
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { sessionStorage.setItem('kx-seen', '1'); });
const page = await ctx.newPage();
await page.goto('file:///home/user/Kulinaria-MX/preview/index.html#/home'); await page.reload(); await page.waitForTimeout(900);
console.log(JSON.stringify(await page.evaluate(() => {
  const btn = document.querySelector('[data-page="home"] .plan-card .btn--gold'); if (!btn) return 'no button';
  const out = []; let e = btn; while (e && e !== document.body) { const c = getComputedStyle(e); const r = e.getBoundingClientRect(); out.push([e.tagName, (e.className || '').toString().slice(0, 28), c.display, c.visibility, c.opacity, Math.round(r.width), Math.round(r.height)]); e = e.parentElement; }
  return out.slice(0, 8);
})));
await b.close();
