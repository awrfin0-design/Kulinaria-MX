// Phone: is any vertical scroll area left inside the builder (a finger could get stuck in it)? Can the page scroll past the builder in every step?
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
for (const [w, h] of [[390, 800], [360, 640]]) {
  for (const where of ['#/pg/pedido', '#/home']) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    await ctx.addInitScript(() => { sessionStorage.setItem('kx-seen', '1'); try { localStorage.setItem('kx-rules-ok', '1'); localStorage.setItem('kx-test-start', '1'); localStorage.setItem('kx-test-orders', '0'); localStorage.setItem('kx-tour-planner', '1'); } catch (e) {} sessionStorage.setItem('kx-test-start', '1'); sessionStorage.setItem('kx_newplan', '1'); sessionStorage.setItem('kx_ob_asked', '1'); });
    const page = await ctx.newPage();
    await page.goto('file:///home/user/Kulinaria-MX/preview/index.html' + where); await page.reload(); await page.waitForTimeout(900);
    const pg = where === '#/home' ? 'home' : 'pg/pedido';
    for (let k = 1; k <= 4; k++) {
      await page.evaluate(([pg, k]) => document.querySelector('[data-page="' + pg + '"] [data-funnel] .steps__nav li:nth-child(' + k + ')').click(), [pg, k]); await page.waitForTimeout(400);
      const r = await page.evaluate((pg) => {
        const f = document.querySelector('[data-page="' + pg + '"] [data-funnel]');
        const traps = [...f.querySelectorAll('*')].filter((e) => { const c = getComputedStyle(e); return /(auto|scroll)/.test(c.overflowY) && e.scrollHeight > e.clientHeight + 2 && e.clientHeight > 0; }).map((e) => (e.className || e.tagName).toString().slice(0, 30));
        const sec = f.closest('.shopify-section'), r = sec.getBoundingClientRect();
        return { step: f.getAttribute('data-step'), traps, sectionH: Math.round(r.height), vh: innerHeight, pageCanScrollPast: document.documentElement.scrollHeight > r.bottom + scrollY - 10 };
      }, pg);
      console.log(w + 'x' + h, where, JSON.stringify(r), r.traps.length === 0 && r.pageCanScrollPast ? 'ok' : 'STUCK?');
    }
    await ctx.close();
  }
}
await b.close();
