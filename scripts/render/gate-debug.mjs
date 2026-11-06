import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.addInitScript(() => { try { sessionStorage.setItem('kx-seen', '1'); localStorage.setItem('kx-rules-ok', '1'); sessionStorage.setItem('kx-test-start', '1'); sessionStorage.setItem('kx_newplan', '1'); } catch (e) {} });
await page.goto('file:///home/user/Kulinaria-MX/preview/index.html#/p/bowl-res-quinoa'); await page.reload(); await page.waitForTimeout(400);
console.log(await page.evaluate(() => { const e = document.querySelector('[data-page="p/bowl-res-quinoa"] [data-add]'); const r = e.getBoundingClientRect(); const c = getComputedStyle(e); let p = e, hid = []; while (p && p !== document.body) { if (getComputedStyle(p).display === 'none') hid.push(p.className || p.tagName); p = p.parentElement; } return JSON.stringify({ w: r.width, h: r.height, disp: c.display, vis: c.visibility, hid, url: location.href }); }));
await b.close();
