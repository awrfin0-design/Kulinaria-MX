// Full-page shots of login / register / the landing page, desktop + phone. Usage: node land-shots.mjs tag [pages...]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const tag = process.argv[2] || 'a';
const pages = process.argv.slice(3).length ? process.argv.slice(3) : ['login', 'registro', 'home'];
const U = 'file:///home/user/Kulinaria-MX/preview/index.html';
const b = await chromium.launch();
for (const [name, vp, mobile] of [['d', { width: 1360, height: 900 }, false], ['m', { width: 390, height: 844 }, true]]) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: mobile, isMobile: mobile });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('kx-seen', '1'); localStorage.setItem('kx-rules-ok', '1'); localStorage.setItem('kulinaria_onboarded', '1'); } catch (e) {} });
  const page = await ctx.newPage();
  for (const pg of pages) {
    await page.goto(U + '#/' + pg); await page.reload(); await page.waitForTimeout(1300);
    // trigger reveal-on-scroll so full-page captures are not blank
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 70)); } window.scrollTo(0, 0); });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `/tmp/land-${tag}-${pg}-${name}.png`, fullPage: pg === 'home' ? false : true });
    if (pg === 'home') {
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let k = 0, y = 0; y < h && k < 14; k++, y += vp.height - 60) { await page.evaluate((y) => window.scrollTo(0, y), y); await page.waitForTimeout(450); await page.screenshot({ path: `/tmp/land-${tag}-home-${name}-${String(k).padStart(2, '0')}.png` }); }
    }
  }
  await ctx.close();
}
await b.close();
console.log('done');
