// Screenshots of the order builder (desktop 1430x650 and phone 390x844) for visual checks. Output: /tmp/shot-*.png
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
for (const [name, vp, mob] of [['d', { width: 1430, height: 650 }, false], ['p', { width: 390, height: 844 }, true]]) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: mob, isMobile: mob, deviceScaleFactor: mob ? 2 : 1 });
  await ctx.addInitScript(() => { sessionStorage.setItem('kx-seen', '1'); });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file:///home/user/Kulinaria-MX/preview/index.html#/pg/pedido'); await page.reload(); await page.waitForTimeout(900);
  const F = '[data-page="pg/pedido"] ';
  const click = (s) => (mob ? page.tap(s) : page.click(s));
  await page.screenshot({ path: `/tmp/shot-${name}1.png` });
  await click(F + '[data-fn-next]'); await page.waitForTimeout(600);
  await page.screenshot({ path: `/tmp/shot-${name}2.png` });
  await click(F + '[data-fn-next]'); await page.waitForTimeout(500);
  await page.evaluate(() => { document.querySelector('[data-page="pg/pedido"] .step[data-fn-step="3"] [data-fn-dish] [data-pick]').click(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.querySelectorAll('[data-page="pg/pedido"] .step[data-fn-step="3"] [data-fn-dish] [data-fn-note-t]')[1].click(); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `/tmp/shot-${name}3.png` });
  console.log(name, errs.join('|') || 'no page errors');
  await ctx.close();
}
await b.close();
