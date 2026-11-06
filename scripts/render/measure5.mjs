// Phone step 2: where is the orange arrow and what covers it?
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1430, height: 650 } });
await ctx.addInitScript(() => { sessionStorage.setItem('kx-seen', '1'); });
const page = await ctx.newPage();
await page.goto('file:///home/user/Kulinaria-MX/preview/index.html#/pg/pedido'); await page.reload(); await page.waitForTimeout(900);
const F = '[data-page="pg/pedido"] ';
await page.click(F + '[data-fn-next]'); await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/shot-dd2.png' });
console.log(JSON.stringify(await page.evaluate(() => {
  const g = (s) => { const e = document.querySelector('[data-page="pg/pedido"] ' + s); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
  const btn = document.querySelector('[data-page="pg/pedido"] [data-fn-sc-next]'), r = btn.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { btn: g('[data-fn-sc-next]'), carousel: g('.fn-carousel--show'), rail: g('[data-fn-sc-grid]'), step: g('.step[data-fn-step="2"]'), main: g('.funnel__main'), topEl: top && (top.className || top.tagName), vh: innerHeight };
})));
try { await page.click(F + '[data-fn-sc-next]', { timeout: 4000 }); console.log('click ok'); } catch (e) { console.log('click failed', String(e.message).split('\n').filter((l) => /intercept/.test(l)).slice(0, 3).join(' | ')); }
await b.close();
