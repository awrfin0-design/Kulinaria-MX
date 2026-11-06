// Prints the geometry of the planner step at 1430x650 to find what overflows the frame.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1430, height: 650 } });
await ctx.addInitScript(() => { sessionStorage.setItem('kx-seen', '1'); });
const page = await ctx.newPage();
await page.goto('file:///home/user/Kulinaria-MX/preview/index.html#/pg/pedido'); await page.reload(); await page.waitForTimeout(900);
const F = '[data-page="pg/pedido"] ';
await page.click(F + '[data-fn-next]'); await page.waitForTimeout(300); await page.click(F + '[data-fn-next]'); await page.waitForTimeout(500);
console.log(JSON.stringify(await page.evaluate(() => {
  const g = (s) => { const e = document.querySelector('[data-page="pg/pedido"] ' + s); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), Math.round(r.height)]; };
  return { vh: innerHeight, stage: g('.funnel__stage'), step3: g('.step[data-fn-step="3"]'), main: g('.funnel__main'), carousel: g('.step[data-fn-step="3"] .fn-carousel'), rail: g('.step[data-fn-step="3"] .fn-dishes'), card: g('.step[data-fn-step="3"] .fn-dish'), media: g('.step[data-fn-step="3"] .fn-dish__media'), body: g('.step[data-fn-step="3"] .fn-dish__body'), aside: g('.funnel__aside'), pick: g('.fn-pickbar'), week: g('.fn-week') };
})));
await b.close();
