// Step 1 as cards: desktop 1430x650 and phone 390x800. Output: /tmp/rail-*.png
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
for (const [name, vp, mob] of [['d', { width: 1280, height: 800 }, false]]) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: mob, isMobile: mob, deviceScaleFactor: mob ? 2 : 1 });
  await ctx.addInitScript(() => { sessionStorage.setItem('kx-seen', '1'); sessionStorage.setItem('kx_newplan', '1'); sessionStorage.setItem('kx_ob_asked', '1'); try { localStorage.setItem('kx-test-orders', '0'); } catch (e) {} });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file:///home/user/Kulinaria-MX/preview/index.html#/pg/pedido'); await page.evaluate(() => localStorage.clear()); await page.evaluate(() => localStorage.setItem('kx-test-orders', '0')); await page.reload(); await page.waitForTimeout(1000);
  const F = '[data-page="pg/pedido"] ';
  const st = () => page.evaluate(() => { const f = document.querySelector('[data-page="pg/pedido"] [data-funnel]'); const c = f.querySelector('[data-fn-rules-check]'), b = f.querySelector('[data-fn-rules-next]'); return { step: f.getAttribute('data-step'), unlocked: !c.disabled, ticked: c.checked, btnLocked: b.disabled }; });
  console.log(name, 'start', JSON.stringify(await st()));
  await page.screenshot({ path: `/tmp/rail-${name}1.png` });
  await page.evaluate(() => { const r = document.querySelector('[data-page="pg/pedido"] [data-fn-rules-rail]'); r.scrollLeft = r.scrollWidth; }); await page.waitForTimeout(700);
  console.log(name, 'at the end', JSON.stringify(await st()));
  await page.screenshot({ path: `/tmp/rail-${name}2.png` });
  await page.evaluate(() => document.querySelector('[data-page="pg/pedido"] [data-fn-rules-check]').click()); await page.waitForTimeout(200);
  console.log(name, 'ticked', JSON.stringify(await st()));
  await page.evaluate(() => document.querySelector('[data-page="pg/pedido"] [data-fn-rules-next]').click()); await page.waitForTimeout(500);
  console.log(name, 'after continue', JSON.stringify(await st()));
  console.log(name, errs.join('|') || 'no page errors');
  await ctx.close();
}
await b.close();
