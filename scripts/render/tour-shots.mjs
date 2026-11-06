// Screenshots of the planner tour (coach marks) on desktop 1430x650 and phone 390x844. Output: /tmp/tour-*.png
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
for (const [name, vp, mob] of [['d', { width: 1430, height: 650 }, false], ['p', { width: 390, height: 844 }, true]]) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: mob, isMobile: mob, deviceScaleFactor: mob ? 2 : 1 });
  await ctx.addInitScript(() => { sessionStorage.setItem('kx-seen', '1'); });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file:///home/user/Kulinaria-MX/preview/index.html#/pg/pedido'); await page.reload(); await page.waitForTimeout(900);
  const F = '[data-page="pg/pedido"] ';
  const click = (s) => (mob ? page.tap(s) : page.click(s));
  await click(F + '[data-fn-next]'); await page.waitForTimeout(500);
  await click(F + '[data-fn-sc-next]'); await page.waitForTimeout(500);
  await page.evaluate(() => { document.querySelector('[data-page="pg/pedido"] [data-fn-tour-open]').click(); });
  await page.waitForTimeout(700);
  for (let i = 1; i <= 4; i++) {
    await page.screenshot({ path: `/tmp/tour-${name}${i}.png` });
    const nx = await page.$('.fn-tour__next'); if (!nx) break;
    await nx.click(); await page.waitForTimeout(600);
  }
  console.log(name, errs.join('|') || 'no page errors', 'tour left open:', !!(await page.$('.fn-tour')));
  await ctx.close();
}
await b.close();
