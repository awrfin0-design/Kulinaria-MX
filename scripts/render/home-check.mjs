// Do the home page animations start? (reveals, marquee, sticky split) plus any page error.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { sessionStorage.setItem('kx-seen', '1'); localStorage.setItem('kx-rules-ok', '1'); });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
await page.goto('file:///home/user/Kulinaria-MX/preview/index.html#/home'); await page.reload(); await page.waitForTimeout(1500);
console.log(JSON.stringify(await page.evaluate(() => ({ cls: document.documentElement.className, motion: document.documentElement.classList.contains('motion-ready'), noMotion: document.documentElement.classList.contains('no-motion'), reveals: document.querySelectorAll('[data-page="home"] [data-reveal], [data-page="home"] .reveal').length, revealed: document.querySelectorAll('[data-page="home"] .is-in, [data-page="home"] [data-reveal].is-visible').length }))));
const h = await page.evaluate(() => document.documentElement.scrollHeight);
for (let y = 0; y < h; y += 450) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(70); }
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(250);
console.log(JSON.stringify(await page.evaluate(() => { const un = [...document.querySelectorAll('[data-page="home"] .reveal:not(.is-in), [data-page="home"] .split:not(.is-in)')].filter((x) => !x.closest('.rail__track')); return { h: document.documentElement.scrollHeight, un: un.length, first: un.slice(0, 4).map((e) => (e.className || '').toString().slice(0, 40) + ' @' + Math.round(e.getBoundingClientRect().top + scrollY)) }; })));
console.log('errors:', errs.slice(0, 6).join(' | ') || 'none');
await b.close();
