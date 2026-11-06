// Why does the returning card not show in the test flow?
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1430, height: 650 } });
await ctx.addInitScript(() => { try { sessionStorage.setItem('kx-seen', '1'); if (!sessionStorage.getItem('kx-test-norules')) { localStorage.setItem('kx-rules-ok', '1'); if (!sessionStorage.getItem('kx-test-nostart')) sessionStorage.setItem('kx-test-start', '1'); } if (!sessionStorage.getItem('kx-test-returning')) sessionStorage.setItem('kx_newplan', '1'); } catch (e) {} });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('file:///home/user/Kulinaria-MX/preview/index.html#/home'); await page.evaluate(() => { localStorage.setItem('kx-test-orders', '1'); sessionStorage.setItem('kx-test-returning', '1'); sessionStorage.removeItem('kx_newplan'); sessionStorage.removeItem('kx_credits'); sessionStorage.setItem('kx_ob_asked', '1'); });
console.log('after set', await page.evaluate(() => JSON.stringify({ ...sessionStorage })));
await page.goto('file:///home/user/Kulinaria-MX/preview/index.html#/pg/pedido'); console.log('after goto', await page.evaluate(() => JSON.stringify({ ...sessionStorage }))); await page.reload(); await page.waitForTimeout(1500); console.log('after reload', await page.evaluate(() => JSON.stringify({ ...sessionStorage })));
console.log(JSON.stringify(await page.evaluate(() => { const f = document.querySelector('[data-page="pg/pedido"] [data-funnel]'); const r = f.querySelector('[data-fn-returning]'); return { hidden: r.hidden, cls: f.className, newplan: sessionStorage.getItem('kx_newplan'), orders: localStorage.getItem('kx-test-orders'), panel: getComputedStyle(f.querySelector('.funnel__panel')).display, hasLink: !!r.querySelector('a[href="/pages/cuenta-semana"]'), email: f.getAttribute('data-customer-email') }; })));
console.log(errs.join('|') || 'no page errors');
await b.close();
