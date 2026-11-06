// Phone walk-through on small screens: can every step be scrolled to its end? Output: /tmp/ph-*.png and a log.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
for (const [name, vp] of [['a', { width: 390, height: 700 }], ['b', { width: 360, height: 560 }]]) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { sessionStorage.setItem('kx-seen', '1'); try { localStorage.setItem('kx-rules-ok', '1'); localStorage.setItem('kx-tour-planner', '1'); } catch (e) {} });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file:///home/user/Kulinaria-MX/preview/index.html#/pg/pedido'); await page.evaluate(() => { localStorage.removeItem('kulinaria_funnel'); }); await page.reload(); await page.waitForTimeout(900);
  const F = '[data-page="pg/pedido"] ';
  const info = (label) => page.evaluate((label) => {
    const f = document.querySelector('[data-page="pg/pedido"] [data-funnel]');
    const bar = f.querySelector('.funnel__aside'), br = bar.getBoundingClientRect();
    const last = [...f.querySelectorAll('.step.is-on .fn-plan, .step.is-on .fn-dish, .step.is-on .fn-sc')].pop();
    const lr = last && last.getBoundingClientRect();
    return { label, step: f.getAttribute('data-step'), vh: innerHeight, pageScroll: Math.round(document.documentElement.scrollHeight - innerHeight), barTop: bar && getComputedStyle(bar).display !== 'none' ? Math.round(br.top) : null, lastBottom: lr ? Math.round(lr.bottom) : null };
  }, label);
  console.log(name, JSON.stringify(await info('plan')));
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(500);
  console.log(name, JSON.stringify(await info('plan, scrolled to the end')));
  await page.screenshot({ path: `/tmp/ph-${name}1.png` });
  await page.evaluate(() => { document.querySelector('[data-page="pg/pedido"] [data-plan-choice="block"]').click(); }); await page.waitForTimeout(800);
  await page.screenshot({ path: `/tmp/ph-${name}2.png` });
  console.log(name, JSON.stringify(await info('menu')));
  await page.tap(F + '[data-fn-sc-next]'); await page.waitForTimeout(700);
  await page.screenshot({ path: `/tmp/ph-${name}3.png` });
  console.log(name, JSON.stringify(await info('planner')));
  const sc = await page.evaluate(() => { const s = document.querySelector('[data-page="pg/pedido"] .step[data-fn-step="3"]'); return { sh: s.scrollHeight, ch: s.clientHeight }; });
  await page.evaluate(() => { const s = document.querySelector('[data-page="pg/pedido"] .step[data-fn-step="3"]'); s.scrollTop = s.scrollHeight; }); await page.waitForTimeout(400);
  await page.screenshot({ path: `/tmp/ph-${name}4.png` });
  console.log(name, 'planner scroll', JSON.stringify(sc), errs.join('|') || 'no page errors');
  await ctx.close();
}
await b.close();
