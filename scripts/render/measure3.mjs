// Geometry of a planner card on the phone (390x844): where does the dark gap under the photo come from?
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await ctx.addInitScript(() => { sessionStorage.setItem('kx-seen', '1'); });
const page = await ctx.newPage();
await page.goto('file:///home/user/Kulinaria-MX/preview/index.html#/pg/pedido'); await page.reload(); await page.waitForTimeout(900);
const F = '[data-page="pg/pedido"] ';
await page.tap(F + '[data-fn-next]'); await page.waitForTimeout(300); await page.tap(F + '[data-fn-next]'); await page.waitForTimeout(500);
console.log(JSON.stringify(await page.evaluate(() => {
  const d = document.querySelector('[data-page="pg/pedido"] .step[data-fn-step="3"] .fn-dish');
  const r = (e) => { const q = e.getBoundingClientRect(); return [Math.round(q.top), Math.round(q.height), getComputedStyle(e).position]; };
  return { card: r(d), kids: [...d.children].map((k) => [k.className.toString().slice(0, 22), ...r(k)]), img: r(d.querySelector('.fn-dish__media img')) };
})));
await b.close();
