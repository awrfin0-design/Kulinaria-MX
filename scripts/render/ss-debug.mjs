// Which sessionStorage keys survive a reload in the preview?
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => { try { sessionStorage.setItem('kx-seen', '1'); } catch (e) {} });
const page = await ctx.newPage();
await page.goto('file:///home/user/Kulinaria-MX/preview/index.html#/pg/pedido'); await page.waitForTimeout(500);
await page.evaluate(() => { sessionStorage.setItem('foo', '1'); sessionStorage.setItem('kx_reach', '3'); sessionStorage.setItem('kx-test-norules', '1'); });
console.log('before', await page.evaluate(() => JSON.stringify({ ...sessionStorage })));
await page.reload(); await page.waitForTimeout(600);
console.log('after reload', await page.evaluate(() => JSON.stringify({ ...sessionStorage })));
await b.close();
