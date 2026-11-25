import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const TH = process.argv[2] || 'fuego', W = +process.argv[3] || 1440, H = +process.argv[4] || 900, TAG = process.argv[5] || 'x';
const ctx = await b.newContext({ viewport: { width: W, height: H } }); const p = await ctx.newPage();
await p.addInitScript((t) => { localStorage.setItem('kx-lang','es'); sessionStorage.setItem('kx-seen','1'); localStorage.setItem('kx-theme', t); localStorage.setItem('kulinaria_onboarded','1'); localStorage.setItem('kx-test-orders','0'); localStorage.setItem('kx_dietpick','all'); sessionStorage.setItem('kx_newplan','1'); }, TH);
await p.goto('file:///home/user/Kulinaria-MX/preview/index.html#/pg/pedido'); await p.reload(); await p.waitForTimeout(1800);
const F = '[data-page="pg/pedido"] [data-funnel]';
await p.evaluate((f) => document.querySelector(f + ' [data-cat-choice="keto-low-carb"]').click(), F); await p.waitForTimeout(300);
for (let k = 0; k < 4; k++) { const st = await p.evaluate((f) => document.querySelector(f).getAttribute('data-step'), F); if (st === '3') break;
  await p.evaluate((f) => { const a = document.querySelector(f + ' .step.is-on [data-fn-go-next], ' + f + ' .step.is-on [data-fn-rules-next], ' + f + ' .step.is-on [data-fn-how-go]'); if (a) a.click(); }, F); await p.waitForTimeout(900); }
console.log(await p.evaluate((f) => document.querySelector(f).getAttribute('data-step'), F));
await p.evaluate((f) => { const e = document.querySelector(f + ' .fn-wk') || document.querySelector(f); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 90); }, F); await p.waitForTimeout(700);
await p.locator(F + ' .fn-wk').screenshot({ path: `/tmp/wk-${TAG}.png` });
await b.close();
