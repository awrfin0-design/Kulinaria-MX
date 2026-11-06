// Home on a phone: why is the builder cut off under its step pills?
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
await ctx.addInitScript(() => { sessionStorage.setItem('kx-seen', '1'); sessionStorage.setItem('kx_newplan', '1'); sessionStorage.setItem('kx_ob_asked', '1'); try { localStorage.setItem('kx-rules-ok', '1'); localStorage.setItem('kx-test-orders', '0'); } catch (e) {} });
const page = await ctx.newPage();
await page.goto('file:///home/user/Kulinaria-MX/preview/index.html#/home'); await page.reload(); await page.waitForTimeout(900);
console.log(JSON.stringify(await page.evaluate(() => {
  const f = document.querySelector('[data-page="home"] [data-funnel]'); const out = [];
  const q = (e) => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e); return [e.tagName + '.' + (e.className || '').toString().slice(0, 26), Math.round(r.top + scrollY), Math.round(r.height), c.overflow, c.height === 'auto' ? 'auto' : c.height, c.maxHeight, c.minHeight, c.display]; };
  out.push(q(f)); ['.funnel__track', '.funnel__stage', '.funnel__panel', '.funnel__main', '.step.is-on', '.fn-rules'].forEach((s) => { const e = f.querySelector(s); if (e) out.push(q(e)); });
  const sec = f.closest('.shopify-section'); out.push(q(sec));
  return out;
})));
await b.close();
