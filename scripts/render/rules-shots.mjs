// The rules step (read to the end first) and the flow that follows, on desktop 1430x650 and phone 390x844. Output: /tmp/rules-*.png
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
for (const [name, vp, mob] of [['d', { width: 1430, height: 650 }, false], ['p', { width: 390, height: 844 }, true]]) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: mob, isMobile: mob, deviceScaleFactor: mob ? 2 : 1 });
  await ctx.addInitScript(() => { sessionStorage.setItem('kx-seen', '1'); });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file:///home/user/Kulinaria-MX/preview/index.html#/pg/pedido'); await page.evaluate(() => { localStorage.clear(); }); await page.reload(); await page.waitForTimeout(900);
  const F = '[data-page="pg/pedido"] ';
  const state = () => page.evaluate(() => { const f = document.querySelector('[data-page="pg/pedido"] [data-funnel]'); return { step: f.getAttribute('data-step'), chk: f.querySelector('[data-fn-rules-check]').disabled, btn: f.querySelector('[data-fn-rules-next]').disabled, dots: f.querySelectorAll('[data-fn-dot]').length }; });
  console.log(name, 'start', JSON.stringify(await state()));
  await page.screenshot({ path: `/tmp/rules-${name}1.png` });
  await page.evaluate(() => { const r = document.querySelector('[data-page="pg/pedido"] [data-fn-rules]'); r.scrollTop = r.scrollHeight; }); await page.waitForTimeout(500);
  console.log(name, 'at the end', JSON.stringify(await state()));
  await page.screenshot({ path: `/tmp/rules-${name}2.png` });
  await page.evaluate(() => { document.querySelector('[data-page="pg/pedido"] [data-fn-rules-check]').click(); }); await page.waitForTimeout(300);
  console.log(name, 'ticked', JSON.stringify(await state()));
  await page.evaluate(() => { document.querySelector('[data-page="pg/pedido"] [data-fn-rules-next]').click(); }); await page.waitForTimeout(500);
  console.log(name, 'after', JSON.stringify(await state()));
  await page.screenshot({ path: `/tmp/rules-${name}3.png` });
  await page.evaluate(() => { document.querySelector('[data-page="pg/pedido"] [data-plan-choice="block"]').click(); }); await page.waitForTimeout(800);
  await page.screenshot({ path: `/tmp/rules-${name}4.png` });
  console.log(name, errs.join('|') || 'no page errors');
  await ctx.close();
}
await b.close();
