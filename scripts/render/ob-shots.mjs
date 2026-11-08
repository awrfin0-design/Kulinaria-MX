// Screenshots of the gate (before ordering) and of the onboarding questionnaire, desktop + phone. Usage: node ob-shots.mjs [tag]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const tag = process.argv[2] || 'a';
const U = 'file:///home/user/Kulinaria-MX/preview/index.html';
const b = await chromium.launch();
for (const [name, vp, mobile] of [['d', { width: 1360, height: 900 }, false], ['m', { width: 390, height: 844 }, true]]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('kx-seen', '1'); localStorage.setItem('kx-rules-ok', '1'); if (!localStorage.getItem('kx-test-fresh')) localStorage.setItem('kulinaria_onboarded', '1'); } catch (e) {} });
  const page = await ctx.newPage();
  await page.goto(U + '#/home'); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('kx-test-fresh', '1'); localStorage.setItem('kx-test-gate', '1'); localStorage.setItem('kx-test-orders', '0'); sessionStorage.setItem('kx_ob_asked', '1'); });
  await page.reload(); await page.waitForTimeout(900);
  await page.evaluate(() => { const g = document.querySelector('[data-page="home"] [data-fn-gate]'); window.scrollTo(0, g.getBoundingClientRect().top + scrollY - 90); }); await page.waitForTimeout(500);
  await page.screenshot({ path: `/tmp/gate-${tag}-${name}.png` });
  await page.goto(U + '#/pg/bienvenida'); await page.reload(); await page.waitForTimeout(800);
  for (let k = 1; k <= 7; k++) {
    await page.evaluate(() => { const o = document.querySelector('[data-page="pg/bienvenida"] [data-onboarding]'); window.scrollTo(0, o.getBoundingClientRect().top + scrollY - 60); }); await page.waitForTimeout(250);
    await page.screenshot({ path: `/tmp/ob-${tag}-${name}-${k}.png` });
    const nx = await page.$('[data-page="pg/bienvenida"] [data-ob-next]:not([hidden])'); if (!nx) break;
    if (k === 1) { await page.fill('[data-page="pg/bienvenida"] [data-ob="name"]', 'Ana Pérez'); await page.fill('[data-page="pg/bienvenida"] [data-ob="email"]', 'ana@ejemplo.com'); await page.fill('[data-page="pg/bienvenida"] [data-ob="phone"]', '999 000 0000'); }
    if (k === 2) { for (const [kk, v] of [['street', 'Calle Lago'], ['cluster', 'Las Lomas'], ['city', 'Puebla'], ['zip', '72000']]) await page.fill(`[data-page="pg/bienvenida"] [data-ob="${kk}"]`, v); }
    await nx.click(); await page.waitForTimeout(250);
  }
  await ctx.close();
}
await b.close();
console.log('shots done');
