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
  const d = document.querySelector('[data-page="pg/pedido"] .step[data-fn-step="3"] .fn-dish'); const bd = d.querySelector('.fn-dish__body'); const cs = getComputedStyle(bd);
  return { disp: cs.display, flex: cs.flex, maxH: cs.maxHeight, h: cs.height, sh: bd.scrollHeight, ch: bd.clientHeight, kids: [...bd.children].map((k) => [k.className.toString().slice(0, 18), Math.round(k.getBoundingClientRect().height), getComputedStyle(k).display]) };
})));
await b.close();
