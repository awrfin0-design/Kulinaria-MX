// Does the whole rules step fit at 1430x650 with no scrolling?
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1430, height: 650 } });
await ctx.addInitScript(() => { sessionStorage.setItem('kx-seen', '1'); sessionStorage.setItem('kx_ob_asked', '1'); });
const page = await ctx.newPage();
await page.goto('file:///home/user/Kulinaria-MX/preview/index.html#/pg/pedido'); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kx-test-orders', '0'); }); await page.reload(); await page.waitForTimeout(1000);
console.log(JSON.stringify(await page.evaluate(() => { const r = document.querySelector('[data-page="pg/pedido"] [data-fn-rules]'), f = document.querySelector('[data-page="pg/pedido"] [data-funnel]'); return { sh: r.scrollHeight, ch: r.clientHeight, stageBottom: Math.round(f.querySelector('.funnel__stage').getBoundingClientRect().bottom), chk: f.querySelector('[data-fn-rules-check]').disabled }; })));
await page.screenshot({ path: '/tmp/rules-fit.png' });
await b.close();
