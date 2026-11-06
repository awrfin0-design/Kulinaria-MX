// Desktop: with the pointer over the middle of the builder, does the mouse wheel still scroll the page?
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 700 } });
await ctx.addInitScript(() => { sessionStorage.setItem('kx-seen', '1'); sessionStorage.setItem('kx_newplan', '1'); sessionStorage.setItem('kx_ob_asked', '1'); try { localStorage.setItem('kx-rules-ok', '1'); localStorage.setItem('kx-tour-planner', '1'); localStorage.setItem('kx-test-orders', '0'); } catch (e) {} sessionStorage.setItem('kx-test-start', '1'); });
const page = await ctx.newPage();
await page.goto('file:///home/user/Kulinaria-MX/preview/index.html#/home'); await page.reload(); await page.waitForTimeout(900);
await page.evaluate(() => { const f = document.querySelector('[data-page="home"] [data-funnel]'); window.scrollTo(0, f.getBoundingClientRect().top + scrollY - 20); }); await page.waitForTimeout(300);
for (let k = 1; k <= 4; k++) {
  await page.evaluate((k) => document.querySelector('[data-page="home"] [data-funnel] .steps__nav li:nth-child(' + k + ')').click(), k); await page.waitForTimeout(400);
  const spots = await page.evaluate(() => { const f = document.querySelector('[data-page="home"] [data-funnel]'); const r = f.querySelector('.step.is-on').getBoundingClientRect(); return [[r.left + r.width * 0.5, r.top + r.height * 0.5], [r.left + r.width * 0.2, r.top + r.height * 0.3], [r.left + r.width * 0.8, r.top + r.height * 0.7]]; });
  const res = [];
  for (const [x, y] of spots) {
    await page.evaluate(() => { const f = document.querySelector('[data-page="home"] [data-funnel]'); window.scrollTo(0, f.getBoundingClientRect().top + scrollY - 20); }); await page.waitForTimeout(200);
    const y0 = await page.evaluate(() => scrollY); await page.mouse.move(x, y); await page.mouse.wheel(0, 300); await page.waitForTimeout(400);
    res.push(Math.round((await page.evaluate(() => scrollY)) - y0));
  }
  console.log('step', k, 'page scrolled by (px) with the wheel over three spots:', res.join(', '), res.every((d) => d > 50) ? 'ok' : 'STUCK');
}
await b.close();
