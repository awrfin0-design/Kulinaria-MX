// Hover on the "create account" buttons and the auth tabs; takes before/after shots to spot glitches.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const U = 'file:///home/user/Kulinaria-MX/preview/index.html';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
await ctx.addInitScript(() => { try { sessionStorage.setItem('kx-seen', '1'); localStorage.setItem('kx-rules-ok', '1'); } catch (e) {} });
const page = await ctx.newPage();
const shot = async (name, sel) => {
  const el = await page.$(sel); if (!el) { console.log('missing', sel); return; }
  await el.scrollIntoViewIfNeeded(); const r = await el.boundingBox();
  const clip = { x: Math.max(0, r.x - 30), y: Math.max(0, r.y - 30), width: r.width + 60, height: r.height + 60 };
  await page.mouse.move(5, 5); await page.waitForTimeout(500); await page.screenshot({ path: `/tmp/hv-${name}-0.png`, clip });
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.waitForTimeout(120); await page.screenshot({ path: `/tmp/hv-${name}-1.png`, clip });
  await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/hv-${name}-2.png`, clip });
  console.log(name, JSON.stringify(await page.evaluate((s) => { const e = document.querySelector(s); const c = getComputedStyle(e); return { tr: c.transform, bg: c.backgroundColor, color: c.color, w: e.getBoundingClientRect().width }; }, sel)));
};
await page.goto(U + '#/login'); await page.reload(); await page.waitForTimeout(900);
await shot('tab', '[data-page="login"] .auth__tabs a:not(.is-on)');
await shot('switch', '[data-page="login"] .auth__switch a');
await page.goto(U + '#/pg/bienvenida'); await page.reload(); await page.waitForTimeout(900);
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kx-test-fresh', '1'); localStorage.setItem('kx-test-gate', '1'); localStorage.setItem('kx-test-orders', '0'); });
await page.goto(U + '#/home'); await page.reload(); await page.waitForTimeout(900);
await shot('gate-outline', '[data-page="home"] [data-fn-gate-a1] .btn--outline');
await b.close();
