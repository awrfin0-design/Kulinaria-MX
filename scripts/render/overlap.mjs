// Home on a phone, every step: is the builder section tall enough, or does the next section sit on top of it?
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
for (const [w, h] of [[390, 800], [360, 640]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { sessionStorage.setItem('kx-seen', '1'); sessionStorage.setItem('kx_newplan', '1'); sessionStorage.setItem('kx_ob_asked', '1'); try { localStorage.setItem('kx-rules-ok', '1'); localStorage.setItem('kx-tour-planner', '1'); localStorage.setItem('kx-test-orders', '0'); } catch (e) {} });
  const page = await ctx.newPage();
  await page.goto('file:///home/user/Kulinaria-MX/preview/index.html#/home'); await page.reload(); await page.waitForTimeout(900);
  for (let k = 1; k <= 4; k++) {
    await page.evaluate((k) => { document.querySelector('[data-page="home"] [data-funnel] .steps__nav li:nth-child(' + k + ')').click(); }, k); await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const f = document.querySelector('[data-page="home"] [data-funnel]'); const sec = f.closest('.shopify-section'), nx = sec.nextElementSibling;
      const on = f.querySelector('.step.is-on'), onr = on.getBoundingClientRect(), sr = sec.getBoundingClientRect(), nr = nx.getBoundingClientRect();
      const bar = f.querySelector('.funnel__aside'), br = bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect() : null;
      return { step: f.getAttribute('data-step'), section: [Math.round(sr.top + scrollY), Math.round(sr.height)], stepBottom: Math.round(onr.bottom + scrollY), barBottom: br ? Math.round(br.bottom + scrollY) : null, nextTop: Math.round(nr.top + scrollY) };
    });
    console.log(w + 'x' + h, JSON.stringify(r), r.nextTop >= r.section[0] + r.section[1] - 2 && r.stepBottom <= r.nextTop + 2 ? 'ok' : 'OVERLAP');
    if (k === 1 || k === 4) { await page.evaluate(() => { const f = document.querySelector('[data-page="home"] [data-funnel]'); window.scrollTo(0, f.getBoundingClientRect().top + scrollY - 70); }); await page.waitForTimeout(300); await page.screenshot({ path: `/tmp/ov-${w}-${k}.png` }); }
  }
  await ctx.close();
}
await b.close();
