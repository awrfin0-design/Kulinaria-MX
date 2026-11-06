// Why does the builder open on step 2 in the test flow? (state carried over from earlier tests)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => { try { sessionStorage.setItem('kx-seen', '1'); if (!sessionStorage.getItem('kx-test-norules')) { localStorage.setItem('kx-rules-ok', '1'); if (!sessionStorage.getItem('kx-test-nostart')) sessionStorage.setItem('kx-test-start', '1'); } if (!sessionStorage.getItem('kx-test-returning')) sessionStorage.setItem('kx_newplan', '1'); } catch (e) {} });
const page = await ctx.newPage();
await page.goto('file:///home/user/Kulinaria-MX/preview/index.html#/home'); await page.evaluate(() => { localStorage.setItem('kx-test-orders', '0'); sessionStorage.setItem('kx_ob_asked', '1'); sessionStorage.setItem('kx_reach', '3'); });
const ss = () => page.evaluate(() => JSON.stringify({ ...sessionStorage }));
console.log('A', await ss());
await page.goto('file:///home/user/Kulinaria-MX/preview/index.html#/pg/pedido'); console.log('B', await ss()); await page.reload(); await page.waitForTimeout(800); console.log('C', await ss());
await page.evaluate(() => { sessionStorage.setItem('kx-test-norules', '1'); localStorage.removeItem('kx-rules-ok'); localStorage.removeItem('kulinaria_funnel'); }); await page.reload(); await page.waitForTimeout(800);
console.log(JSON.stringify(await page.evaluate(() => ({ step: document.querySelector('[data-page="pg/pedido"] [data-funnel]').getAttribute('data-step'), ls: { ...localStorage }.hasOwnProperty('kx-rules-ok'), ss: { ...sessionStorage } }))));
await b.close();
