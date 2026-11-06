// Why is the registration "Continuar" button not visible in the suite? Prints the hidden ancestor.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { sessionStorage.setItem('kx-seen', '1'); });
const page = await ctx.newPage();
await page.goto('file:///home/user/Kulinaria-MX/preview/index.html#/home');
await page.evaluate(() => { localStorage.setItem('kx-test-orders', '0'); sessionStorage.setItem('kx_ob_asked', '1'); });
await page.goto('file:///home/user/Kulinaria-MX/preview/index.html#/registro'); await page.reload(); await page.waitForTimeout(700);
console.log(JSON.stringify(await page.evaluate(() => {
  const btn = document.querySelector('[data-page="registro"] [data-step-next]'); const out = [];
  let e = btn; while (e && e !== document.body) { const c = getComputedStyle(e); const r = e.getBoundingClientRect(); out.push([e.tagName, (e.className || '').toString().slice(0, 30), c.display, c.visibility, c.opacity, Math.round(r.width), Math.round(r.height), e.hidden]); e = e.parentElement; }
  return out;
})));
await b.close();
