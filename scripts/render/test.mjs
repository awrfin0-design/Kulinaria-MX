// End-to-end check of the generated preview (which is rendered from the real Liquid templates).
//   NODE_PATH=$(npm root -g) node test.mjs [screenshotDir]
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderSite } from './render.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shotDir = process.argv[2];
if (shotDir) fs.mkdirSync(shotDir, { recursive: true });

const { doc, routes, dead } = await renderSite();
fs.mkdirSync(path.join(ROOT, 'preview'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'preview', 'index.html'), doc);
import { execFileSync } from 'node:child_process';
try { execFileSync('node', ['render.mjs'], { cwd: path.dirname(new URL(import.meta.url).pathname), env: { ...process.env, GUEST: '1' }, stdio: 'ignore' }); } catch (e) { /* rendered earlier */ }
const URL0 = 'file://' + path.join(ROOT, 'preview', 'index.html');

async function scrollThrough(pg) {
  const h = await pg.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 450) { await pg.evaluate((yy) => window.scrollTo(0, yy), y); await pg.waitForTimeout(70); }
  await pg.evaluate(() => window.scrollTo(0, 0)); await pg.waitForTimeout(250);
}
const results = []; const fail = [];
const ok = (name, cond, extra = '') => { results.push({ name, ok: !!cond }); if (!cond) { fail.push(name + (extra ? ' :: ' + extra : '')); console.log('FAIL ' + name + ' :: ' + extra); } else if (process.env.VERBOSE) console.log('ok   ' + name); };

ok('no dead internal links in rendered templates', dead.length === 0, JSON.stringify(dead));

const browser = await chromium.launch();
const SKIP_LOADER = () => { try { sessionStorage.setItem('kx-seen', '1'); if (!localStorage.getItem('kx-test-nodiet')) localStorage.setItem('kx_dietpick', 'all'); if (!localStorage.getItem('kx-test-fresh')) localStorage.setItem('kulinaria_onboarded', '1'); if (!localStorage.getItem('kx-test-norules')) { localStorage.setItem('kx-rules-ok', '1'); if (!localStorage.getItem('kx-test-nostart')) sessionStorage.setItem('kx-test-start', '1'); } if (!localStorage.getItem('kx-test-returning')) sessionStorage.setItem('kx_newplan', '1'); } catch (e) {} };
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(SKIP_LOADER);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource|file:\/\/\/cart\.js/.test(m.text())) errors.push('console: ' + m.text()); });

// ---- every page: renders, has content, headings use the new fonts, links resolve
const keys = routes.map((r) => r.key);
await page.goto(URL0); await page.evaluate(() => { localStorage.setItem('kx-test-orders', '0'); sessionStorage.setItem('kx_ob_asked', '1'); });   // page-structure checks look at the questionnaire page too (a new account)
for (const r of routes) {
  await page.goto(`${URL0}#/${r.key}`);
  await page.waitForTimeout(120);
  const info = await page.evaluate((key) => {
    const el = document.querySelector(`[data-page="${key}"]`);
    const visible = [...document.querySelectorAll('[data-page]')].filter((p) => !p.hidden).map((p) => p.getAttribute('data-page'));
    const h = el.querySelector('h1,h2');
    return { visible, len: el.innerText.trim().length, hFont: h ? getComputedStyle(h).fontFamily : '', hText: h ? h.innerText.slice(0, 40) : '' };
  }, r.key);
  ok(`[${r.key}] only this page visible`, info.visible.length === 1 && info.visible[0] === r.key, info.visible.join(','));
  ok(`[${r.key}] has content`, info.len > 80, String(info.len));
  ok(`[${r.key}] headline in the brand type system`, /Playfair/.test(info.hFont), info.hFont);
}

// ---- all hash links across the whole document point to a real page
const badLinks = await page.evaluate(() => {
  const keys = new Set([...document.querySelectorAll('[data-page]')].map((p) => p.getAttribute('data-page')));
  const bad = [];
  document.querySelectorAll('a[href^="#/"]').forEach((a) => { const k = a.getAttribute('href').slice(2).split('?')[0]; if (!keys.has(k)) bad.push(a.getAttribute('href')); });
  const anchors = [];
  document.querySelectorAll('a[href^="#"]:not([href^="#/"])').forEach((a) => { const id = a.getAttribute('href').slice(1); if (id && !document.getElementById(id)) anchors.push(a.getAttribute('href')); });
  return { bad, anchors };
});
ok('every #/ link resolves to a page', badLinks.bad.length === 0, badLinks.bad.join(' '));
ok('every in-page anchor has a target', badLinks.anchors.length === 0, badLinks.anchors.join(' '));

// ---- actually click through the real navigation (header, footer, hero CTAs)
await page.goto(`${URL0}#/home`);
const groups = ['.site-footer a', '[data-page="home"] a.btn:not([data-fn-finish]):not(.funnel__teaser *):not([data-fn-returning] *):not([data-fn-gate] *)', '[data-page="home"] a.arrow-link:not(.hs *)'];
for (const base of groups) {
  const hrefs = await page.$$eval(base, (as) => [...new Set(as.map((a) => a.getAttribute('href')).filter((h) => h && h.startsWith('#/')))]);
  for (const h of hrefs) {
    await page.goto(`${URL0}#/home`); await page.waitForTimeout(40);
    await page.click(`${base}[href="${h}"]`, { timeout: 4000 }).catch((e) => fail.push(`could not click ${base} ${h}: ${e.message.split('\n')[0]}`));
    await page.waitForTimeout(60);
    const expect = h.slice(2).split('?')[0];
    const shown = await page.evaluate(() => [...document.querySelectorAll('[data-page]')].filter((p) => !p.hidden).map((p) => p.getAttribute('data-page'))[0]);
    ok(`click ${base} -> ${h}`, shown === expect, shown);
  }
}

// ---- menu: filters, tier, deep link
await page.goto(`${URL0}#/menu`); await page.waitForTimeout(150);
const scope = '[data-page="menu"]';
ok('menu shows the 9 dishes scheduled for this week (2 are planned for later weeks)', (await page.$$eval(`${scope} [data-dish]:not(.is-hidden)`, (e) => e.length)) === 9);
ok('the category row is a styled dropdown, not a sliding row of chips (chips stay in the page, hidden)', await page.evaluate((sc) => { const d = document.querySelector(sc + ' .filter-sticky .dd'); const src = document.querySelector(sc + ' [data-dropdown].dd-src'); return !!d && !!d.querySelector('.dd__btn') && getComputedStyle(src).display === 'none' && d.querySelectorAll('.dd__opt').length === 13 && /Todo|All/.test(d.querySelector('.dd__val').textContent); }, scope));
await page.click(`${scope} .filter-sticky .dd__btn`); await page.waitForTimeout(250);
ok('opening it lists all 13 groups in a solid panel that sits above the dishes', await page.evaluate((sc) => { const l = document.querySelector(sc + ' .filter-sticky .dd__list'); const r = l.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height - 6, 60)); return !l.hidden && l.contains(top) && l.querySelectorAll('.dd__opt').length === 13 && getComputedStyle(l).backgroundColor !== 'rgba(0, 0, 0, 0)'; }, scope));
await page.keyboard.press('Escape'); await page.waitForTimeout(150);
ok('Escape closes the dropdown', await page.$eval(`${scope} .filter-sticky .dd__list`, (e) => e.hidden));
await page.click(`${scope} .filter-sticky .dd__btn`); await page.waitForTimeout(200);
await page.click(`${scope} .filter-sticky .dd__opt[data-value="al-fuego"]`); await page.waitForTimeout(200);
ok('choosing an option closes the list, shows its name on the button and filters the menu', await page.evaluate((sc) => document.querySelector(sc + ' .filter-sticky .dd__list').hidden && /fuego/i.test(document.querySelector(sc + ' .filter-sticky .dd__val').textContent), scope));
ok('category filter -> 3 dishes', (await page.$$eval(`${scope} [data-dish]:not(.is-hidden)`, (e) => e.length)) === 3);
await page.click(`${scope} .filter-sticky .dd__btn`); await page.click(`${scope} .filter-sticky .dd__opt[data-value="keto-low-carb"]`); await page.waitForTimeout(200);
const ketoOk = await page.evaluate((sc) => { const v = [...document.querySelectorAll(sc + ' [data-dish]:not(.is-hidden)')]; return v.length > 0 && v.every((x) => /keto|bajo-carbos/.test(x.getAttribute('data-diets'))) && document.querySelector(sc + ' [data-count]').textContent.trim() === String(v.length); }, scope);
ok('keto / low carb group shows only keto or low-carb dishes and the counter matches', ketoOk);
ok('the 13 menu groups are offered (all + 12) and the old diet row is gone', await page.evaluate((sc) => document.querySelectorAll(sc + ' [data-filter="category"]').length === 13 && !document.querySelector(sc + ' [data-filter="diet"]'), scope));
await page.goto(`${URL0}#/home`); await page.reload();
await page.goto(`${URL0}#/menu?dieta=vegano`); await page.reload(); await page.waitForFunction(() => document.querySelectorAll('[data-page="menu"] [data-dish]:not(.is-hidden)').length < 9, null, { timeout: 6000 }).catch(() => {}); await page.waitForTimeout(300);
const vgN = await page.$$eval(`${scope} [data-dish]:not(.is-hidden)`, (e) => e.map((x) => x.getAttribute('data-diets')));
ok('deep link ?dieta=vegano opens the Veggie group (vegetarian + vegan dishes only)', vgN.length >= 1 && vgN.every((x) => /vegano|vegetariano/.test(x)), JSON.stringify(vgN));

// ---- home diet chip deep-links into the filtered menu without reload
await page.goto(`${URL0}#/home`); await page.waitForTimeout(100);
ok('home: the lifestyle chips are one multi-select dropdown that starts on "all"', await page.evaluate(() => { const d = document.querySelector('[data-page="home"] .dd--multi'); return !!d && d.querySelectorAll('.dd__opt').length >= 5 && /Todos|All/.test(d.querySelector('.dd__val').textContent); }));
await page.click('[data-page="home"] .dd--multi .dd__btn'); await page.click('[data-page="home"] .dd--multi .dd__opt[data-value="sin-gluten"]'); await page.waitForTimeout(250);
ok('home: ticking an option keeps the list open (several can be ticked) and the button names it', await page.evaluate(() => { const d = document.querySelector('[data-page="home"] .dd--multi'); return !d.querySelector('.dd__list').hidden && /gluten/i.test(d.querySelector('.dd__val').textContent) && d.querySelector('.dd__opt[data-value="sin-gluten"]').getAttribute('aria-selected') === 'true'; }));
await page.keyboard.press('Escape'); await page.waitForTimeout(150);
{ const n = await page.$$eval('[data-page="home"] [data-dc-grid] [data-dish]:not(.is-hidden)', (e) => e.map((x) => x.dataset.diets)); ok('home chips filter the dishes listed right below them (5 gluten-free dishes this week)', n.length === 5 && n.every((d) => d.split('|').includes('sin-gluten')), n.length + ' shown');
  await page.evaluate(() => document.querySelector('[data-page="home"] [data-dchip="vegano"]').click()); await page.waitForTimeout(200);
  const n2 = await page.$$eval('[data-page="home"] [data-dc-grid] [data-dish]:not(.is-hidden)', (e) => e.length);
  ok('a second chip narrows the list (gluten-free AND vegan) and the count line follows', n2 > 0 && n2 < 5 && /\d/.test(await page.$eval('[data-page="home"] [data-dc-count]', (e) => e.textContent)), String(n2)); }

// ---- allergy profile blocks dishes + product page alert
await page.goto(`${URL0}#/pg/perfil`); await page.waitForTimeout(100);
await page.check('[data-page="pg/perfil"] input[name="allergy"][value="Frutos secos"]');
await page.fill('[data-page="pg/perfil"] [data-tag-input]', 'cebolla'); await page.press('[data-page="pg/perfil"] [data-tag-input]', 'Enter');
await page.fill('[data-page="pg/perfil"] [data-tag-input]', 'cilantro'); await page.press('[data-page="pg/perfil"] [data-tag-input]', 'Enter');
ok('profile page: dislike tags can be removed with their × (the tag disappears and the rest stay)', await (async () => { const n0 = await page.$$eval('[data-page="pg/perfil"] .tag', (e) => e.length); await page.click('[data-page="pg/perfil"] .tag:nth-of-type(2) button'); const left = await page.$$eval('[data-page="pg/perfil"] .tag', (e) => e.map((x) => x.firstChild.textContent.trim())); return n0 === 2 && left.length === 1 && left[0] === 'cebolla'; })());
await page.click('[data-page="pg/perfil"] button[type="submit"]'); await page.waitForTimeout(100);
ok('profile saved message', await page.$eval('[data-page="pg/perfil"] [data-profile-msg]', (e) => !e.hidden));
await page.goto(`${URL0}#/menu`); await page.waitForTimeout(100);
const blocked = await page.$$eval(`${scope} .dish.is-warned`, (e) => e.map((x) => x.querySelector('.dish__title').textContent.trim()));
ok('allergic dish (frutos secos) gets a warning, but stays available', blocked.length === 2 && /Salmón/.test(blocked[0]) && /nogada/i.test(blocked[1]) && (await page.$eval(`${scope} .dish.is-warned [data-fn-warnbox]`, (b) => !b.hidden && /almendra|nuez|frutos secos|almond|nut/i.test(b.querySelector('[data-fn-warn]').textContent))), blocked.join('|'));
ok('dislike lowers compatibility on vegan bowl (cebolla)', /70%|40%|7\d%/.test(await page.$eval(`${scope} [data-dish][data-category="bowls-de-la-semana"][data-tier="exclusivo"] [data-compat]`, (e) => e.textContent)));
await page.goto(`${URL0}#/p/salmon-costra-almendras`); await page.waitForTimeout(100);
ok('product alert visible, the plan button stays available', await page.evaluate(() => {
  const d = document.querySelector('[data-page="p/salmon-costra-almendras"]');
  return !d.querySelector('[data-allergen-alert]').hidden && !d.querySelector('[data-add]').disabled;
}));
await page.goto(`${URL0}#/p/bowl-res-quinoa`); await page.waitForTimeout(100);
ok('other product not blocked', await page.evaluate(() => { const d = document.querySelector('[data-page="p/bowl-res-quinoa"]'); return d.querySelector('[data-allergen-alert]').hidden && !d.querySelector('[data-add]').disabled; }));
await page.evaluate(() => localStorage.clear());

// ---- add to selection -> cart; cart gating; referral + gift
await page.goto(`${URL0}#/p/bowl-res-quinoa`); await page.reload(); await page.waitForTimeout(100);
await page.click('[data-page="p/bowl-res-quinoa"] [data-add]'); await page.waitForTimeout(150);
ok('dish page CTA opens the plan builder with the dish preselected', /#\/pg\/pedido\?dish=bowl-res-quinoa|#\/pedido\?dish=bowl-res-quinoa/.test(page.url()), page.url());
await page.evaluate(() => localStorage.setItem('kulinaria_onboarded', '1')); await page.goto(`${URL0}#/carrito`); await page.reload(); await page.waitForTimeout(900);
const cartScope = '[data-page="carrito"]';
ok('checkout disabled until contract accepted', await page.$eval(`${cartScope} [data-checkout]`, (e) => e.disabled));
await page.check(`${cartScope} [data-contract]`);
ok('checkout enabled after contract', !(await page.$eval(`${cartScope} [data-checkout]`, (e) => e.disabled)));
ok('gift hidden before code', await page.$eval(`${cartScope} [data-gift]`, (e) => e.hidden));
await page.fill(`${cartScope} [data-referral]`, 'juanfit');
ok('gift shown with code (uppercased)', (await page.$eval(`${cartScope} [data-gift]`, (e) => !e.hidden)) && (await page.$eval(`${cartScope} [data-referral]`, (e) => e.value)) === 'JUANFIT');
await page.click(`${cartScope} [data-gift-add]`); await page.waitForTimeout(150);
ok('gift add shows confirmation', (await page.$$('.preview-toast')).length > 0);

// ---- account: pausar entregas (pause weeks / open pause / resume; plan only; sign-in only)
{
  const mp = '[data-page="pg/cuenta-pausas"] [data-mypause]';
  const openPause = async (ls) => { await page.goto(`${URL0}#/home`); await page.evaluate((o) => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('kx-lang', 'es'); sessionStorage.setItem('kx_ob_asked', '1'); Object.entries(o).forEach(([k, v]) => localStorage.setItem(k, v)); }, ls || {}); await page.goto(`${URL0}#/pg/cuenta-pausas`); await page.reload(); await page.waitForTimeout(4200); };
  await openPause({ 'kx-test-orders': '1' });
  ok('pause: a customer with a plan sees the pause form and the deliveries are active', await page.evaluate((m) => { const r = document.querySelector(m); return !r.querySelector('[data-mp-main]').hidden && r.querySelector('[data-mp-none]').hidden && /activas/.test(r.querySelector('[data-mp-status]').textContent) && r.querySelector('[data-mp-start]').options.length === 12 && r.querySelector('[data-mp-resume]').hidden; }, mp));
  await page.selectOption(`${mp} [data-mp-len]`, '2'); await page.click(`${mp} [data-mp-pause]`); await page.waitForTimeout(250);
  ok('pause: pausing 2 weeks lists them, confirms, and offers to resume', await page.evaluate((m) => { const r = document.querySelector(m); return /Semanas en pausa/.test(r.querySelector('[data-mp-status]').textContent) && !r.querySelector('[data-mp-msg]').hidden && /Listo/.test(r.querySelector('[data-mp-msg]').textContent) && !r.querySelector('[data-mp-resume]').hidden; }, mp));
  await page.click(`${mp} [data-mp-resume-go]`); await page.waitForTimeout(250);
  ok('pause: resuming from the first week brings the deliveries back', await page.evaluate((m) => { const r = document.querySelector(m); return /activas/.test(r.querySelector('[data-mp-status]').textContent) && r.querySelector('[data-mp-resume]').hidden; }, mp));
  await page.selectOption(`${mp} [data-mp-len]`, 'open'); await page.click(`${mp} [data-mp-pause]`); await page.waitForTimeout(250);
  ok('pause: "until I resume" shows an open pause with no end date', await page.evaluate((m) => { const r = document.querySelector(m); return /hasta que las reanudes/.test(r.querySelector('[data-mp-status]').textContent) && /no tiene fecha/.test(r.querySelector('[data-mp-ends]').textContent); }, mp));
  await page.click(`${mp} [data-mp-resume-go]`); await page.waitForTimeout(250);
  ok('pause: resuming an open pause makes it active again', await page.$eval(`${mp} [data-mp-status]`, (e) => /activas/.test(e.textContent)));
  await openPause({ 'kx-test-orders': '0' });
  ok('pause: a customer without a plan is told there is nothing to pause and gets a link to build an order', await page.evaluate((m) => { const r = document.querySelector(m); return !r.querySelector('[data-mp-none]').hidden && r.querySelector('[data-mp-main]').hidden && !!r.querySelector('[data-mp-none] a[href*="pedido"]'); }, mp));
  await openPause({ 'kx-test-orders': '1', 'kx-lang': 'en' });
  ok('pause: English page is wholly English', await page.evaluate((m) => { const r = document.querySelector(m); return /Your deliveries are active/.test(r.querySelector('[data-mp-status]').textContent) && /Pause deliveries/.test(r.textContent) && !/Pausar|semanas/.test(r.textContent); }, mp));
  await page.goto(`${URL0}#/home`); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('kx-test-orders', '0'); sessionStorage.setItem('kx_ob_asked', '1'); sessionStorage.setItem('kx-seen', '1'); }); await page.reload(); await page.waitForTimeout(300);
}

// ---- forms
await page.goto(`${URL0}#/pg/carta-kulinaria`); await page.waitForTimeout(100);
const cf = '[data-page="pg/carta-kulinaria"] form';
await page.fill(`${cf} [name="contact[name]"]`, 'Ana'); await page.fill(`${cf} [name="contact[email]"]`, 'a@b.co'); await page.fill(`${cf} [name="contact[phone]"]`, '999'); await page.fill(`${cf} [name="contact[body]"]`, 'Cena');
await page.click(`${cf} button[type="submit"]`); await page.waitForTimeout(100);
ok('quote form shows success', (await page.$$(`${cf} .alert--ok`)).length === 1);
ok('carta page has no cart / price symbols', !(await page.$eval('[data-page="pg/carta-kulinaria"]', (e) => /\$\d/.test(e.innerText))));
await page.goto(`${URL0}#/login`); await page.fill('[data-page="login"] [name="customer[email]"]', 'x@y.co'); await page.fill('[data-page="login"] [name="customer[password]"]', 'pw');
await page.click('[data-page="login"] form[data-shopify-form="customer_login"] button[type="submit"]'); await page.waitForTimeout(100);
ok('login submits to account', page.url().endsWith('#/cuenta'));
await page.goto(`${URL0}#/buscar`); await page.fill('[data-page="buscar"] input[name="q"]', 'pollo'); await page.press('[data-page="buscar"] input[name="q"]', 'Enter'); await page.waitForTimeout(100);
ok('search form stays on search', page.url().endsWith('#/buscar'));


// =====================================================================  motion / layout / logo
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(500);
const htmlCls = await page.evaluate(() => document.documentElement.className);
ok('motion layer started (html.js + motion-ready)', /\bjs\b/.test(htmlCls) && /motion-ready/.test(htmlCls), htmlCls);

// logo artwork: real images, loaded, in header / hero / footer / dish placeholders
const logos = await page.evaluate(async () => {
  const imgs = [...document.querySelectorAll('img.logo')];
  await Promise.all(imgs.map((i) => (i.complete ? 1 : new Promise((r) => { i.onload = i.onerror = r; }))));
  const q = (sel) => [...document.querySelectorAll(sel)].filter((i) => i.naturalWidth > 300 || i.classList.contains('logo--mark'));
  return { total: imgs.length, broken: imgs.filter((i) => i.naturalWidth === 0).length,
    header: !!document.querySelector('.site-header img.logo[alt*="Kulinaria"]'), loader: !!document.querySelector('.loader img.logo--mark'), overlay: !!document.querySelector('.menu-overlay img.logo'),
    footer: !!document.querySelector('.site-footer img.logo'), 
    noTextK: !document.querySelector('.logo__k') };
});
ok('logo images all load', logos.total >= 4 && logos.broken === 0, JSON.stringify(logos));
ok('logo in header, menu overlay, loader and footer; no typographic stand-in', logos.header && logos.loader && logos.overlay && logos.footer && logos.noTextK, JSON.stringify(logos));

// headline words
const split = await page.evaluate(() => { const h = document.querySelector('[data-page="home"] .hero h1'); return { words: h.querySelectorAll('.w').length, label: h.getAttribute('aria-label'), text: h.innerText.trim() }; });
ok('hero headline split into words with aria-label', split.words >= 5 && split.label === split.text.replace(/\s+/g, ' '), JSON.stringify(split));

// parallax var + progress + header auto-hide
const p0 = await page.$eval('[data-page="home"] .hero', (e) => parseFloat(getComputedStyle(e).getPropertyValue('--p') || '0'));
await page.evaluate(() => window.scrollTo(0, 450)); await page.waitForTimeout(250);
const p1 = await page.$eval('[data-page="home"] .hero', (e) => parseFloat(getComputedStyle(e).getPropertyValue('--p') || '0'));
ok('hero parallax progress follows scroll', p1 > p0 + 0.2, `${p0} -> ${p1}`);
ok('scroll progress bar advances', parseFloat(await page.$eval('.scroll-progress', (e) => e.style.getPropertyValue('--sp'))) > 0.02);
await page.evaluate(() => window.scrollTo(0, 1400)); await page.waitForTimeout(350);
ok('header is fixed and stays visible while scrolling (no hide/show flicker)', await page.$eval('.site-header', (e) => { const w = e.closest('.shopify-section'); return getComputedStyle(w).position === 'fixed' && Math.round(e.getBoundingClientRect().top) === 0 && !e.classList.contains('is-hidden'); }));
ok('sticky offset is a constant', (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--stick').trim())) === '92px');
ok('header turns compact with a glass background after scrolling', await page.$eval('.site-header', (e) => e.classList.contains('is-stuck')));

// regression: the header used to change height and shove the page while the first pixels scrolled
{
  await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(900);
  await page.evaluate(() => { window.__ys = []; window.__tops = []; const h = document.querySelector('.site-header'); const f = () => { window.__ys.push(window.scrollY); window.__tops.push(Math.round(h.getBoundingClientRect().top * 10) / 10); requestAnimationFrame(f); }; f(); });
  for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, 14); await page.waitForTimeout(36); }
  await page.waitForTimeout(500);
  const fl = await page.evaluate(() => { const ys = window.__ys; let back = 0; for (let i = 1; i < ys.length; i++) if (ys[i] < ys[i - 1] - 0.5) back++; return { back, tops: [...new Set(window.__tops)], n: ys.length }; });
  ok('slow scroll from the top: the page never jumps back and the header never moves', fl.back === 0 && fl.tops.length === 1 && fl.tops[0] === 0, JSON.stringify(fl));
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
}

// reveals: after a full scroll-through every reveal target on the home page is revealed
await scrollThrough(page);
const unrevealed = await page.$$eval('[data-page="home"] .reveal:not(.is-in), [data-page="home"] .split:not(.is-in)', (e) => e.filter((x) => !x.closest('.rail__track')).length);
ok('all scroll reveals fire on the home page (carousel cards reveal when scrolled into view)', unrevealed === 0, String(unrevealed));

// marquee runs
const m1 = await page.$eval('[data-page="home"] .marquee__track', (e) => new DOMMatrix(getComputedStyle(e).transform).m41);
await page.waitForTimeout(700);
const m2 = await page.$eval('[data-page="home"] .marquee__track', (e) => new DOMMatrix(getComputedStyle(e).transform).m41);
ok('marquee is animating', m2 < m1 - 3, `${m1} -> ${m2}`);

// editorial rows (no pinned cards) + sticky split keeps its intro in view
const mq = await page.$eval('[data-page="home"] .marquee', (e) => ({ h: Math.round(e.getBoundingClientRect().height), items: [...e.querySelectorAll('.marquee__group:first-child .marquee__item')].map((i) => i.textContent.trim().split(/\s+/).length) }));
ok('marquee is thin (< 70px) and carries whole phrases (>= 6 items, each 4+ words)', mq.h < 70 && mq.items.length >= 6 && mq.items.every((n) => n >= 4), JSON.stringify(mq));
await page.evaluate(() => { const s = document.querySelector('[data-page="home"] .fg--sticky'); window.scrollTo(0, s.getBoundingClientRect().top + window.scrollY + 450); });
await page.waitForTimeout(500);
const head = await page.$eval('[data-page="home"] .fg--sticky .section__head', (e) => Math.round(e.getBoundingClientRect().top));
ok('sticky split: intro stays pinned while cards scroll', head > 0 && head < 260, String(head));

// button fill + magnetic + spotlight
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400);
const btnSel = '[data-page="home"] .plan-card .btn--gold';
const before = await page.$eval(btnSel, (e) => parseFloat(getComputedStyle(e, '::before').width));
await page.locator(btnSel).scrollIntoViewIfNeeded(); await page.waitForTimeout(1600); await page.hover(btnSel); await page.waitForTimeout(1000);
const after = await page.$eval(btnSel, (e) => parseFloat(getComputedStyle(e, '::before').width));
ok('pill button fills from the cursor on hover', before < 5 && after > 100, `${before} -> ${after}`);
ok('pill buttons are fully rounded', (await page.$eval(btnSel, (e) => parseFloat(getComputedStyle(e).borderTopLeftRadius))) >= 40);
await page.evaluate(() => window.scrollTo(0, 3000)); await page.waitForTimeout(300);
const card = '[data-page="home"] .fg--grid .card';
if (await page.$(card)) { await page.hover(card, { position: { x: 60, y: 40 } }); await page.waitForTimeout(200);
  ok('card spotlight follows the pointer', (await page.$eval(card, (e) => e.style.getPropertyValue('--mx'))) !== ''); }

// carousel
await page.evaluate(() => { const r = document.querySelector('[data-page="home"] [data-rail]'); window.scrollTo(0, r.getBoundingClientRect().top + window.scrollY - 150); }); await page.waitForTimeout(600);
const rs = '[data-page="home"] [data-rail]';
ok('carousel: prev disabled at start, next enabled', (await page.$eval(`${rs} [data-rail-prev]`, (e) => e.disabled)) && !(await page.$eval(`${rs} [data-rail-next]`, (e) => e.disabled)));
await page.click(`${rs} [data-rail-next]`); await page.waitForTimeout(900);
ok('carousel: next arrow scrolls the track', (await page.$eval(`${rs} .rail__track`, (e) => e.scrollLeft)) > 150);
const bb = await page.$eval(`${rs} .rail__track`, (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
const sl0 = await page.$eval(`${rs} .rail__track`, (e) => e.scrollLeft);
await page.mouse.move(bb.x + 200, bb.y); await page.mouse.down(); await page.mouse.move(bb.x - 120, bb.y, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(700);
ok('carousel: drag with the mouse scrolls the track', (await page.$eval(`${rs} .rail__track`, (e) => e.scrollLeft)) !== sl0);
await page.$eval(`${rs} .rail__track`, (e) => { e.scrollLeft = e.scrollWidth; }); await page.waitForTimeout(900);
ok('carousel: cards reveal as they scroll into view', (await page.$$eval(`${rs} .dish.reveal:not(.is-in)`, (e) => e.length)) === 0);

// sticky filter pill on the menu + sticky media on product page
await page.goto(`${URL0}#/menu`); await page.waitForTimeout(300);
await page.evaluate(() => window.scrollTo(0, 900)); await page.waitForTimeout(500);
const fs1 = await page.$eval('[data-page="menu"] .filter-sticky', (e) => ({ top: Math.round(e.getBoundingClientRect().top), pos: getComputedStyle(e).position }));
ok('menu: filter pill is sticky and pinned in view', fs1.pos === 'sticky' && fs1.top >= 0 && fs1.top < 130, JSON.stringify(fs1));
await page.goto(`${URL0}#/p/salmon-costra-almendras`); await page.waitForTimeout(300);
await page.evaluate(() => window.scrollTo(0, 420)); await page.waitForTimeout(500);
const pm = await page.$eval('[data-page="p/salmon-costra-almendras"] .product__media', (e) => Math.round(e.getBoundingClientRect().top));
ok('product: photo stays pinned while the details scroll', pm >= 0 && pm < 150, String(pm));

// reduced motion: no hidden content, header never hides, marquee static
{
  const rctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await rctx.addInitScript(SKIP_LOADER);
  const rp = await rctx.newPage();
  await rp.goto(`${URL0}#/home`); await rp.waitForTimeout(500);
  const ro = await rp.evaluate(() => {
    const vis = (s) => [...document.querySelectorAll(`[data-page="home"] ${s}`)].every((e) => parseFloat(getComputedStyle(e).opacity) > 0.99);
    return { reveal: vis('.reveal'), words: vis('.w>i'), marquee: getComputedStyle(document.querySelector('[data-page="home"] .marquee__track')).animationName };
  });
  await rp.evaluate(() => window.scrollTo(0, 1600)); await rp.waitForTimeout(300);
  const hidden = await rp.$eval('.site-header', (e) => e.classList.contains('is-hidden'));
  ok('prefers-reduced-motion: everything visible immediately, header stays, marquee still', ro.reveal && ro.words && !hidden && (ro.marquee === 'none' || ro.marquee === 'marquee'), JSON.stringify({ ...ro, hidden }));
  await rctx.close();
}
// failsafe: if the motion script never starts, .no-motion reveals everything
await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(300);
const failsafe = await page.evaluate(async () => {
  const el = document.querySelector('[data-page="home"] .faq, [data-page="home"] .accordion details');
  el.classList.remove('is-in'); const hiddenBefore = parseFloat(getComputedStyle(el).opacity);
  document.documentElement.classList.add('no-motion'); await new Promise((r) => setTimeout(r, 1400)); const after = parseFloat(getComputedStyle(el).opacity);
  document.documentElement.classList.remove('no-motion'); return { hiddenBefore, after };
});
ok('failsafe class reveals content', failsafe.after === 1, JSON.stringify(failsafe));

// ---- layout: no horizontal overflow on desktop / tablet / phone, for every page
for (const w of [1440, 820, 390]) {
  await page.setViewportSize({ width: w, height: 900 });
  const over = [];
  for (const k of keys.filter((k) => !k.startsWith('p/') || k === 'p/salmon-costra-almendras')) {
    await page.goto(`${URL0}#/${k}`); await page.waitForTimeout(60);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (sw > 1) over.push(`${k}(+${sw})`);
  }
  ok(`no horizontal overflow @${w}px`, over.length === 0, over.join(' '));
}
// mobile: burger opens the full-screen menu
await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${URL0}#/home`); await page.waitForTimeout(300);
await page.click('.burger');
await page.waitForTimeout(900);
ok('mobile burger opens the full-screen menu', await page.$eval('#menu-overlay', (n) => !n.hidden && n.classList.contains('is-open')) && (await page.$eval('.burger', (n) => n.getAttribute('aria-expanded'))) === 'true');
await page.evaluate(() => { const g = document.querySelector('#menu-overlay a[href="#/pg/plan-bloque"]').closest('.sitemap__group'); const t = g && g.querySelector('.sitemap__tog'); if (t && !g.classList.contains('is-open')) t.click(); }); await page.waitForTimeout(300);
await page.click('#menu-overlay a[href="#/pg/plan-bloque"]'); await page.waitForTimeout(1100);
ok('mobile menu navigates and closes', page.url().endsWith('#/pg/plan-bloque') && (await page.$eval('#menu-overlay', (n) => n.hidden)));

// =====================================================================  v4: burger menu, light/dark, i18n, loader, media, 3D, IA
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(700);
const openMenu = async () => { await page.click('.burger'); await page.waitForTimeout(1100); };
const closeMenu = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(1000); };
ok('no "Vista previa" banner anywhere', (await page.$$('.preview-bar')).length === 0 && !/vista previa/i.test(await page.evaluate(() => document.body.innerText)));
ok('page index is reachable at #/indice', await (async () => { await page.goto(`${URL0}#/indice`); await page.waitForTimeout(200); return (await page.$$eval('[data-page="indice"] a', (a) => a.length)) >= 45; })());
await page.goto(`${URL0}#/home`); await page.waitForTimeout(400);

// header = logo + cart + burger only
ok('header holds only the logo, the announcement link, the account circle and the burger (language, profile and cart live in the circle drop-down)', (await page.$$eval('.site-header a, .site-header button', (els) => els.filter((e) => !e.closest('[data-acct-pop]')).length)) === 4);
ok('no fake-wood background anywhere', await page.evaluate(() => !/wood/i.test(getComputedStyle(document.querySelector('.bg-fx'), '::before').backgroundImage) && !document.querySelector('style').textContent.includes('photo-wood')));

// burger -> full sitemap
await openMenu();
const sm = await page.evaluate(() => ({ groups: document.querySelectorAll('#menu-overlay .sitemap__group').length, links: document.querySelectorAll('#menu-overlay .sitemap a').length }));
ok('burger opens a full-screen sitemap with every top-level page and its subpages', sm.groups >= 10 && sm.links >= 40, JSON.stringify(sm));
ok('menu dialog is modal and labelled', await page.$eval('#menu-overlay', (n) => n.getAttribute('role') === 'dialog' && n.getAttribute('aria-modal') === 'true' && !!n.getAttribute('aria-label')));
await closeMenu();
ok('Escape closes the menu and returns focus to the burger', (await page.$eval('#menu-overlay', (n) => n.hidden)) && (await page.evaluate(() => document.activeElement.className)).includes('burger'));
const pagesList = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/render/pages.json'), 'utf8')).filter(([h]) => h !== 'admin');   // the admin page is deliberately hidden from every menu
await openMenu();
const inMenu = await page.$$eval('#menu-overlay .sitemap a', (a) => a.map((x) => x.getAttribute('href')));
const missing = pagesList.map(([h]) => '#/pg/' + h).filter((h) => !inMenu.includes(h));
ok('every page and subpage of the Miro sitemap is reachable from the menu', missing.length === 0, missing.join(' '));
await closeMenu();
for (const h of ['#/pg/plan-bloque', '#/pg/cuenta-pausas', '#/pg/carta-galeria', '#/pg/terminos', '#/registro', '#/pg/embajadores-directorio']) {
  await page.goto(`${URL0}#/home`); await page.waitForTimeout(150);
  await openMenu(); await page.click(`#menu-overlay a[href^="${h}"]`); await page.waitForTimeout(1100);
  ok(`menu link ${h} navigates and closes the menu`, (page.url().endsWith(h) || (h === '#/registro' && page.url().includes('#/registro'))) && (await page.$eval('#menu-overlay', (n) => n.hidden)));
}

// page structure: every sitemap page has a header with breadcrumbs; families have a sub-navigation
const noHead = [];
for (const [h] of pagesList) {
  if (h === 'pedido') continue;                      // the order page is a single frame (no photo header) so it fits one screen
  await page.goto(`${URL0}#/pg/${h}`); await page.waitForTimeout(60);
  const ok1 = await page.$eval(`[data-page="pg/${h}"]`, (e) => !!e.querySelector('.page-head h1') && !!e.querySelector('.page-head__crumbs'));
  if (!ok1) noHead.push(h);
}
ok('every page and subpage has a page header with breadcrumbs', noHead.length === 0, noHead.join(' '));
await page.goto(`${URL0}#/pg/embajadores-gimnasios`); await page.waitForTimeout(150);
ok('subpages show the family sub-navigation with the current page marked', (await page.$$eval('[data-page="pg/embajadores-gimnasios"] .page-head__sub a', (a) => a.length)) >= 6 && (await page.$eval('[data-page="pg/embajadores-gimnasios"] .page-head__sub a[aria-current="page"]', (a) => /Gimnasios/.test(a.textContent))));
// Miro coverage: sections that must exist
const must = { 'home': ['.hero', '.marquee', '[data-funnel]', '[data-rail]', '.tier-ladder', '.diet-chips, .chips', '.plan-card', '.accordion', '.cta-banner'],
  'pg/planes': ['.plan-card', '.tier-ladder', '.accordion'], 'pg/ayuda': ['form'], 'pg/terminos': ['.legal h3'], 'pg/carta-cotizacion': ['form'],
  'pg/embajadores-solicitar': ['form'], 'pg/checkout': ['.card'], 'pg/cuenta-semana': ['[data-cutoff]'], 'pg/cuenta-pausas': ['[data-mypause]'], 'pg/cuenta-monedero': ['.hub__card'] };
const lacking = [];
for (const [k, sels] of Object.entries(must)) { await page.goto(`${URL0}#/${k}`); await page.waitForTimeout(80); for (const sel of sels) if (!(await page.$(`[data-page="${k}"] ${sel}`))) lacking.push(`${k} ${sel}`); }
ok('key sections from the Miro board exist on their pages', lacking.length === 0, lacking.join(' | '));
ok('terms page carries the full terms (12 numbered sections) and the privacy page the privacy notice (9)', await (async () => { await page.goto(`${URL0}#/pg/terminos`); await page.waitForTimeout(100); const a = await page.$$eval('[data-page="pg/terminos"] .legal h3', (d) => d.length); await page.goto(`${URL0}#/pg/privacidad`); await page.waitForTimeout(100); const b = await page.$$eval('[data-page="pg/privacidad"] .legal h3', (d) => d.length); return a === 12 && b === 9; })());

// account subpages: each shows its own panel inside the account shell
for (const [k, sel] of [['semana', '#semana'], ['pausas', '#pausas'], ['pedidos', '#pedidos']]) {
  await page.goto(`${URL0}#/pg/cuenta-${k}`); await page.waitForTimeout(80);
  ok(`account sub-page ${k} renders its panel and the account navigation`, !!(await page.$(`[data-page="pg/cuenta-${k}"] .account-block[id$="${k}"]`)) && (await page.$$eval(`[data-page="pg/cuenta-${k}"] .account-nav a`, (a) => a.length)) >= 4);
}
ok('account overview is one summary page: week, my details and allergies, balance and referrals (cards, no empty sub-pages)', (await (async () => { await page.goto(`${URL0}#/cuenta`); await page.waitForTimeout(150); return page.$$eval('[data-page="cuenta"] .hub__card:not([data-onb-banner])', (r) => r.length); })()) === 4);

// multi-step registration
await page.goto(`${URL0}#/registro`); await page.reload(); await page.waitForTimeout(500);
const rg = '[data-page="registro"]';
ok('registration is a short 2-step flow starting at step 1 (the questionnaire comes after signing in)', (await page.$$eval(`${rg} [data-step]`, (s) => s.length)) === 2 && (await page.$$eval(`${rg} [data-step].is-on`, (s) => s.length)) === 1);
ok('registration no longer repeats the allergy / address questions (they live in the questionnaire)', (await page.$$eval(`${rg} input[name="allergy"], ${rg} [name="address[address1]"]`, (s) => s.length)) === 0);
await page.click(`${rg} [data-step-next]`); await page.waitForTimeout(150);
ok('required fields block moving to the next step', await page.$eval(`${rg} [data-step]:nth-of-type(1)`, (s) => s.classList.contains('is-on')) || (await page.$$eval(`${rg} [data-step].is-on`, (s) => s[0] === document.querySelectorAll('[data-page="registro"] [data-step]')[0])));
await page.fill(`${rg} #registro--reg-first`, 'Ana'); await page.fill(`${rg} #registro--reg-last`, 'P'); await page.fill(`${rg} #registro--reg-email`, 'a@b.co'); await page.fill(`${rg} #registro--reg-pass`, 'secret1');
ok('the password can be shown and hidden', await (async () => { await page.click(`${rg} [data-pw-toggle]`); const a = await page.$eval(`${rg} #registro--reg-pass`, (e) => e.type); await page.click(`${rg} [data-pw-toggle]`); const b = await page.$eval(`${rg} #registro--reg-pass`, (e) => e.type); return a === 'text' && b === 'password'; })());
await page.click(`${rg} [data-step-next]`); await page.waitForTimeout(150);
ok('step 2 shows the contract and keeps submit disabled until accepted', await page.$eval(`${rg} [data-signup-submit]`, (b) => b.disabled));
await page.check(`${rg} [data-signup-contract]`);
ok('accepting the contract enables sign-up', !(await page.$eval(`${rg} [data-signup-submit]`, (b) => b.disabled)));
await page.click(`${rg} [data-signup-submit]`); await page.waitForTimeout(250);
ok('sign-up ends in the account', page.url().endsWith('#/cuenta'));
// sign-in screen: the entry point
await page.goto(`${URL0}#/login`); await page.reload(); await page.waitForTimeout(500);
ok('sign-in screen has the promise panel, the Entrar / Crear cuenta tabs and a show-password toggle', await page.evaluate(() => { const s = document.querySelector('[data-page="login"]'); return !!s.querySelector('.auth__art') && s.querySelectorAll('.auth__tabs a').length === 2 && !!s.querySelector('[data-pw-toggle]') && !s.querySelector('.page-head'); }));
ok('"forgot password" links to the recover form, which has its own e-mail field and a way back', await page.evaluate(() => { const r = document.querySelector('[data-page="login"]'); return !!r.querySelector('a[href$="recover"]') && !!r.querySelector('.auth__recover input[type="email"]') && !!r.querySelector('.auth__recover a[href$="login"]'); }));
await page.evaluate(() => localStorage.clear());

// light / dark (toggle lives in the menu)
const themeOf = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const bgOf = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(600);
ok('Fuego is the default theme', (await themeOf()) === 'fuego');
await page.evaluate(() => localStorage.setItem('kx-theme', 'light')); await page.reload(); await page.waitForTimeout(600);
const lightBg = await bgOf();
await openMenu(); await page.click('#menu-overlay [data-theme-next]'); await page.waitForTimeout(500); await closeMenu(); await page.waitForTimeout(500);
const darkBg = await bgOf();
ok('toggle switches to dark and changes the page colours', (await themeOf()) === 'dark' && lightBg !== darkBg, `${lightBg} -> ${darkBg}`);
ok('theme choice is remembered', await page.evaluate(() => localStorage.getItem('kx-theme')) === 'dark');
await page.reload(); await page.waitForTimeout(600);
ok('dark theme persists after reload (before paint)', (await themeOf()) === 'dark');
ok('gold logo shows on dark, ink logo on light', await page.evaluate(() => getComputedStyle(document.querySelector('.site-header .logo--gold')).display !== 'none' && getComputedStyle(document.querySelector('.site-header .logo--ink')).display === 'none'));
const lumC = `(c) => { const m = c.match(/\\d+(\\.\\d+)?/g).map(Number).slice(0, 3).map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * m[0] + .7152 * m[1] + .0722 * m[2]; }`;
const contrastDark = await page.evaluate(`(() => { const lum = ${lumC}; const r = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05); const s = getComputedStyle(document.body); return r(s.color, s.backgroundColor); })()`);
ok('dark body text contrast >= 7', contrastDark >= 7, String(contrastDark));
await openMenu(); await page.click('#menu-overlay [data-theme-prev]'); await page.waitForTimeout(500); await closeMenu(); await page.waitForTimeout(500);
const contrastL = await page.evaluate(`(() => { const lum = ${lumC}; const r = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05); const s = getComputedStyle(document.body); const acc = getComputedStyle(document.querySelector('[data-page="home"] .fg .eyebrow')).color; return { body: r(s.color, s.backgroundColor), accent: r(acc, s.backgroundColor) }; })()`);
ok('light body text contrast >= 7 and labels >= 4.5', contrastL.body >= 7 && contrastL.accent >= 4.5, JSON.stringify(contrastL));

// language: ES -> EN, every page translated, back to ES
ok('html lang is es by default', (await page.evaluate(() => document.documentElement.lang)) === 'es');
await openMenu(); await page.click('#menu-overlay .lang__btn[value="en"]'); await page.waitForTimeout(1000);
ok('language switch persists en and reloads in English', (await page.evaluate(() => document.documentElement.lang)) === 'en' && /A week, served like a signature piece/.test(await page.$eval('[data-page="home"] .hero h1', (h) => h.getAttribute('aria-label') || h.innerText)));
await openMenu();
ok('menu and CTA are in English', /choose my plan/i.test(await page.$eval('#menu-overlay .menu-overlay__foot .arrow-link', (a) => a.textContent)) && /Weekly specials/.test(await page.$eval('#menu-overlay .sitemap__top', (a) => a.textContent)));
await closeMenu();
const leaks = [];
for (const k of keys.filter((k) => !k.startsWith('p/') || k === 'p/salmon-costra-almendras')) {
  await page.goto(`${URL0}#/${k}`); await page.waitForTimeout(70);
  const t = await page.$eval(`[data-page="${k}"]`, (e) => e.innerText);
  const bad = t.match(/\b(Elegir|Menú|Planes|Platillos?|Cierre|Ver el|Guardar|Quitar|Carrito|Pedido|Cuenta|Contrase|Dirección|Entrega|alergias?|Bloque|semana)\b/g);
  if (bad) leaks.push(`${k}: ${[...new Set(bad)].join(',')}`);
}
ok('no Spanish UI strings leak into the English storefront', leaks.length === 0, leaks.join(' | '));
await page.goto(`${URL0}#/menu`); await page.waitForTimeout(250);
ok('menu filters are translated and still work in English', (await page.$eval('[data-page="menu"] [data-filter="category"][data-value="al-fuego"]', (b) => b.textContent.trim())) === "From the fire");
await page.click('[data-page="menu"] .filter-sticky .dd__btn'); await page.click('[data-page="menu"] .filter-sticky .dd__opt[data-value="al-fuego"]'); await page.waitForTimeout(200);
ok('category filter works in English', (await page.$$eval('[data-page="menu"] [data-dish]:not(.is-hidden)', (e) => e.length)) === 3);
await page.goto(`${URL0}#/pg/perfil`); await page.waitForTimeout(150);
await page.check('[data-page="pg/perfil"] input[name="allergy"][value="Frutos secos"]'); await page.click('[data-page="pg/perfil"] button[type="submit"]'); await page.waitForTimeout(100);
await page.goto(`${URL0}#/p/salmon-costra-almendras`); await page.waitForTimeout(150);
ok('allergen warning still works in English with English alert text', await page.evaluate(() => { const d = document.querySelector('[data-page="p/salmon-costra-almendras"]'); return !d.querySelector('[data-allergen-alert]').hidden && /Contains or may contain|According to our data/.test(d.querySelector('[data-allergen-alert]').textContent) && !d.querySelector('[data-add]').disabled; }));
await page.evaluate(() => localStorage.removeItem('kulinaria_profile'));
await openMenu(); await page.click('#menu-overlay .lang__btn[value="es"]'); await page.waitForTimeout(1000);
ok('language switches back to Spanish', (await page.evaluate(() => document.documentElement.lang)) === 'es' && /Elegir mi plan/.test(await page.evaluate(() => document.querySelector('#menu-overlay .menu-overlay__foot .arrow-link').textContent)));

// every locale key in es has an English twin (and vice versa)
{
  const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, p + k + '.') : [p + k]));
  const es = flat(JSON.parse(fs.readFileSync(path.join(ROOT, 'locales/es.default.json'), 'utf8').replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ''))), en = flat(JSON.parse(fs.readFileSync(path.join(ROOT, 'locales/en.json'), 'utf8').replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '')));
  ok('locales/en.json has exactly the keys of es.default.json', es.length === en.length && es.every((k) => en.includes(k)), es.filter((k) => !en.includes(k)).join(','));
  const used = new Set(); for (const f of fs.readdirSync(path.join(ROOT, 'sections')).filter((f) => f.endsWith('.liquid')).map((f) => 'sections/' + f).concat(fs.readdirSync(path.join(ROOT, 'snippets')).map((f) => 'snippets/' + f), ['layout/theme.liquid'])) {
    for (const m of fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(/'([a-z_0-9-]+(?:\.[a-z_0-9-]+)+)'\s*\|\s*t\b/g)) used.add(m[1]);
  }
  ok('every static t-key used in Liquid exists in the locale', [...used].every((k) => es.includes(k)), [...used].filter((k) => !es.includes(k)).join(','));
}

// loading screen
{
  const lctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const lp = await lctx.newPage();
  await lp.goto(`${URL0}#/home`);
  const shown = await lp.evaluate(() => getComputedStyle(document.getElementById('loader')).display !== 'none' && !document.documentElement.classList.contains('is-loaded'));
  await lp.waitForTimeout(2800);
  const gone = await lp.evaluate(() => document.documentElement.classList.contains('is-loaded') && getComputedStyle(document.getElementById('loader')).visibility === 'hidden');
  ok('loading screen appears first and then fades away', shown && gone, JSON.stringify({ shown, gone }));
  await lp.reload(); await lp.waitForTimeout(200);
  ok('loading screen is skipped on later page views of the session', await lp.evaluate(() => document.documentElement.classList.contains('is-loaded')));
  await lctx.close();
}

// particles
{
  const cv = await page.evaluate(() => { const c = document.querySelector('[data-particles]'); const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++; return { w: c.width, n }; });
  ok('particle canvas is drawing', cv.w > 0 && cv.n > 20, JSON.stringify(cv));
}

// hero: the brand intro video (square, black) + headline + circle-arrow CTA
await page.goto(`${URL0}#/home`); await page.waitForTimeout(600);
const hh = await page.evaluate(async () => {
  const hero = document.querySelector('[data-page="home"] .hero'), st = hero.querySelector('.hero__stage').getBoundingClientRect(), cp = hero.querySelector('.hero__copy').getBoundingClientRect(), v = hero.querySelector('.hero__video--intro');
  const h1 = hero.querySelector('h1'), em = h1.querySelector('em');
  return { square: Math.abs(st.width - st.height) < 3, fit: getComputedStyle(v).objectFit, stageRightOfCopy: st.left >= cp.right - 4, within: st.top >= 0 && st.bottom <= innerHeight + 2, h1Font: getComputedStyle(h1).fontFamily, emFont: getComputedStyle(em).fontFamily, arrow: !!hero.querySelector('.arrow-link .arrow-link__c'), nav: !!document.querySelector('.site-nav'), bg: getComputedStyle(hero).backgroundColor, src: !!v.getAttribute('data-video-src') && /video-hero-intro/.test(v.getAttribute('data-video-src') || '') };
});
ok('hero: the brand intro video is a square shown whole (contain), centred, big, with the text strip right under it, on black', hh.square && hh.fit === 'contain' && hh.within && hh.src && hh.bg === 'rgb(0, 0, 0)' && await page.evaluate(() => { const st = document.querySelector('[data-page="home"] .hero__stage').getBoundingClientRect(), cp = document.querySelector('[data-page="home"] .hero__copy').getBoundingClientRect(); return Math.abs((st.left + st.width / 2) - innerWidth / 2) < 8 && st.height >= innerHeight * 0.4 && cp.top >= st.top + st.height * 0.7; }), JSON.stringify(hh));
ok('hero: serif headline with brand-script phrase, circle-arrow CTA, no inline nav', /Playfair/.test(hh.h1Font) && /Playfair/.test(hh.emFont) && hh.arrow && !hh.nav, JSON.stringify(hh));
ok('hero: headline, sub and button sit under the video and the whole hero fits the first screen', await page.evaluate(() => { const c = document.querySelector('[data-page="home"] .hero__cta').getBoundingClientRect(); return c.bottom <= innerHeight; }));
// 3D / pointer: hero photo drifts, dish tilt, coverflow, peek
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(500);
await page.mouse.move(300, 300); await page.mouse.move(1300, 700, { steps: 6 }); await page.waitForTimeout(500);
await page.evaluate(() => { const r = document.querySelector('[data-page="home"] [data-rail]'); window.scrollTo(0, r.getBoundingClientRect().top + window.scrollY - 120); }); await page.waitForTimeout(700);
const dm = '[data-page="home"] .rail .dish__media';
const dbox = await page.$eval(dm, (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
await page.mouse.move(dbox.x + dbox.w * 0.85, dbox.y + dbox.h * 0.2); await page.waitForTimeout(500);
ok('dish card tilts toward the pointer', (await page.$eval(dm, (e) => parseFloat(e.style.getPropertyValue('--ry')))) > 1.5);
ok('carousel cards have a coverflow angle', await page.$$eval('[data-page="home"] .rail .dish', (c) => c.some((x) => x.style.getPropertyValue('--ry') !== '' && parseFloat(x.style.getPropertyValue('--ry')) !== 0)));


// ---- v5: one palette per theme, the same motif everywhere, seamless switching
await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(800);
const tok = (n) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim().toLowerCase(), n);
ok('light palette = white + olive green', (await tok('--brand')) === '#4f6330' && (await tok('--bg-base')) === '#f5f4ec');
await page.evaluate(() => localStorage.setItem('kx-theme', 'dark')); await page.reload(); await page.waitForTimeout(800);
ok('dark palette = black + gold + ivory', (await tok('--brand')) === '#e2c36b' && (await tok('--bg-base')) === '#0d0c0a' && (await tok('--text')) === '#f3ebd9');
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForFunction(() => { const v = document.querySelector('[data-page="home"] .hero__video--intro'); return v && !v.paused && v.currentTime > 0.2; }, null, { timeout: 20000 }).catch(() => {});
ok('the intro video plays in the hero (faded in over its poster)', await page.evaluate(() => { const v = document.querySelector('[data-page="home"] .hero__video--intro'); return !v.paused && v.currentTime > 0 && v.classList.contains('is-on') && /^(blob|data):/.test(v.currentSrc || v.src); }));
ok('the old hero film plays behind the tiers section (moved, not deleted)', await page.evaluate(async () => { const t = document.querySelector('[data-page="home"] .tiers--video'); if (!t) return false; t.scrollIntoView(); await new Promise((r) => setTimeout(r, 2500)); const v = t.querySelector('video'); return !!v && !v.paused && /video-hero-dark|^blob|^data/.test(v.currentSrc || v.src); }));
ok('footer is deep black in dark mode and deep olive in light mode', await (async () => {
  const dark = await page.evaluate(() => getComputedStyle(document.querySelector('.site-footer')).backgroundImage);
  await page.evaluate(() => localStorage.setItem('kx-theme', 'light')); await page.reload(); await page.waitForTimeout(700);
  const lightBg = await page.evaluate(() => getComputedStyle(document.querySelector('.site-footer')).backgroundImage);
  return /13, 12, 10/.test(dark) && /28, 38, 20/.test(lightBg);
})());
// theme switching is instant: no transition storm, one snapshot cross-fade
await page.reload(); await page.waitForTimeout(800);
await page.click('.burger'); await page.waitForTimeout(1000);
const sw = await page.evaluate(async () => { const t0 = performance.now(); document.querySelector('#menu-overlay [data-theme-next]').click(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); const t1 = performance.now(); return { dt: t1 - t0, theme: document.documentElement.getAttribute('data-theme') }; });
ok('theme switch lands within two frames', sw.theme === 'dark' && sw.dt < 250, JSON.stringify(sw));
await page.waitForTimeout(800);
ok('no stuck "is-theming" state after the switch', await page.evaluate(() => !document.documentElement.classList.contains('is-theming')));
await page.keyboard.press('Escape'); await page.waitForTimeout(900);
await page.evaluate(() => localStorage.setItem('kx-theme', 'light'));
// the motif on every page: photo header, serif headline + script phrase, no raw markup
await page.reload(); await page.waitForTimeout(600);
const motif = { noPhoto: [], noEm: [], leak: [] };
for (const r2 of routes.filter((r) => !r.key.startsWith('p/') && r.key !== 'pg/admin')) {
  await page.goto(`${URL0}#/${r2.key}`); await page.waitForTimeout(60);
  const info = await page.$eval(`[data-page="${r2.key}"]`, (e) => ({ photo: !!e.querySelector('.page-head__bg img, .hero__stage'), em: !!e.querySelector('h1 em, h2 em'), star: /\*/.test(e.innerText) }));
  if (!info.photo && r2.key !== 'home') motif.noPhoto.push(r2.key);
  if (!info.em) motif.noEm.push(r2.key);
  if (info.star) motif.leak.push(r2.key);
}
ok('every page opens with the photo header', motif.noPhoto.filter((k) => !['404', 'pg/pedido', 'login', 'registro'].includes(k)).length === 0, motif.noPhoto.join(' '));
ok('every page has a serif headline with a brand-script phrase', motif.noEm.filter((k) => !['login', 'registro'].includes(k)).length === 0, motif.noEm.join(' '));
ok('no raw emphasis asterisks leak into the page', motif.leak.length === 0, motif.leak.join(' '));


// the dedicated page and the complete menu
await page.goto(`${URL0}#/pg/pedido`); await page.waitForTimeout(500);
ok('/pages/pedido hosts the same funnel as one frame right under the header (no big photo header)', !(await page.$('[data-page="pg/pedido"] .page-head')) && !!(await page.$('[data-page="pg/pedido"] [data-funnel]')));
{
  const snip = fs.readFileSync(path.join(ROOT, 'snippets/sitemap-default.liquid'), 'utf8');
  const missingInFallback = pagesList.map(([h]) => '/pages/' + h).filter((u) => !snip.includes('"' + u + '"'));
  ok('the built-in menu (used when no nested navigation exists) lists every page of the Miro sitemap', (snip.match(/class="sitemap__group"/g) || []).length === 10 && missingInFallback.length === 0, missingInFallback.join(' '));
  const ov = fs.readFileSync(path.join(ROOT, 'sections/menu-overlay.liquid'), 'utf8');
  ok('the menu overlay falls back to that complete sitemap', /render 'sitemap-default'/.test(ov));
}


// =====================================================================  v7: fit the screen, product cards, wordmark, spacing
for (const [w, h] of [[1440, 900], [390, 844], [820, 1180]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${URL0}#/home`); await page.waitForTimeout(700);
  const fit = await page.evaluate(() => {
    const vh = innerHeight, q = (sel) => [...document.querySelectorAll(`[data-page="home"] ${sel}`)];
    const tall = [];
    const chk = (name, els, max) => els.forEach((e) => { const r = e.getBoundingClientRect(); if (r.height > max + 1) tall.push(`${name}:${Math.round(r.height)}>${Math.round(max)}`); });
    chk('hero', q('.hero'), vh); chk('showcase-photo', q('.showcase__frame'), vh * 0.7);
    chk('rail-card', q('.rail .dish'), innerWidth <= 760 ? vh : vh * 0.8); chk('row-photo', q('.card__photo'), vh * 0.5); chk('cta', q('.cta-banner'), vh); chk('band', q('.band'), vh);
    return tall;
  });
  ok(`home sections fit the screen @${w}x${h}`, fit.length === 0, fit.join(' '));
}
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${URL0}#/home`); await page.waitForTimeout(800);
const gap = await page.evaluate(() => { const m = document.querySelector('[data-page="home"] .marquee').getBoundingClientRect(), f = document.querySelector('[data-page="home"] [data-fn-stage]').getBoundingClientRect(); return Math.round(f.top - m.bottom); });
ok('the funnel starts right under the marquee (< 40px gap)', gap >= 0 && gap < 40, String(gap));
const shapes = await page.evaluate(() => { const r = (sel) => { const e = document.querySelector(`[data-page="home"] ${sel}`); return e ? getComputedStyle(e).borderTopLeftRadius + '|' + getComputedStyle(e).borderBottomLeftRadius : null; }; return { dish: r('.rail .dish'), media: r('.dish__media'), frame: r('.showcase__frame'), fnDish: r('.fn-dish') }; });
ok('photos are rectangular rounded cards (no arch shapes)', Object.values(shapes).filter(Boolean).every((v) => { const [a, b] = v.split('|').map(parseFloat); return a <= 30 && Math.abs(a - b) < 1 || (a === 0 && b === 0) || (a <= 30 && b <= 30); }), JSON.stringify(shapes));
// the word "Kulinaria" is the logo
const wm = await page.evaluate(() => { const h = [...document.querySelectorAll('[data-page="home"] h2')].find((x) => /Esta semana|This week/.test(x.getAttribute('aria-label') || x.textContent)); const w = h && h.querySelector('.wordmark img'); return { has: !!w, loaded: !!w && w.naturalWidth > 100 }; });
ok('"Esta semana en Kulinaria" shows the logo instead of the word', wm.has && wm.loaded, JSON.stringify(wm));
const leftover = await page.evaluate(() => { const bad = []; const w = document.createTreeWalker(document.querySelector('[data-page="home"]'), NodeFilter.SHOW_TEXT); while (w.nextNode()) { const n = w.currentNode; if (/Kulinaria/.test(n.nodeValue) && !/Kulinaria Junior/.test(n.nodeValue) && !n.parentNode.closest('.wordmark,.visually-hidden,script,style,[data-no-wordmark]')) bad.push(n.nodeValue.trim().slice(0, 40)); } return bad; });
ok('no bare "Kulinaria" word is left in the home copy', leftover.length === 0, leftover.join(' | '));
// header: language switch is visible
ok('the ES/EN language switch sits in the header account menu', await page.evaluate(() => { document.querySelector('.site-header .acct__btn').click(); const b = [...document.querySelectorAll('.site-header .acct__pop .lang__btn')]; const okk = b.length === 2 && b.every((x) => x.getBoundingClientRect().width > 0); document.querySelector('.site-header .acct__btn').click(); return okk; }));
// client login is visible
ok('header offers the account circle with the account link inside', await page.$eval('.site-header .acct', (a) => !!a.querySelector('.acct__btn') && !!a.querySelector('.acct__pop a[href*="cuenta"]')));
// dish cards carry their own short description
ok('dish cards show a short description', (await page.$$eval('[data-page="home"] .rail .dish .dish__desc', (d) => d.length)) >= 4);
// loader: ready quickly and animated
{
  const lctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const lp = await lctx.newPage(); const t0 = Date.now();
  await lp.goto(`${URL0}#/home`);
  const orbit = await lp.evaluate(() => document.querySelectorAll('.loader__orbit').length === 3 && getComputedStyle(document.querySelector('.loader__orbit')).animationName !== 'none');
  await lp.waitForFunction(() => document.documentElement.classList.contains('is-loaded'), null, { timeout: 8000 });
  const dt = Date.now() - t0;
  ok('loader is animated (3 orbiting ingredients) and finishes in under 4 s', orbit && dt < 4000, `${orbit} ${dt}ms`);
  await lctx.close();
}

// =====================================================================  v10: weekly calendar and off-menu dishes
await page.goto(`${URL0}#/menu`); await page.reload(); await page.waitForTimeout(900);
ok('a dish scheduled for a later week is not on this week\'s menu', await page.evaluate(() => ![...document.querySelectorAll('[data-page="menu"] [data-dish]')].some((d) => /Brownie/.test(d.getAttribute('data-title')))));
ok('the calendar lists this week and the next 3, with the scheduled dishes in their week', await page.evaluate(() => { const w = [...document.querySelectorAll('[data-page="menu"] .menu-calendar__week')]; const t = (i) => w[i].textContent; return w.length === 4 && w[0].classList.contains('is-now') && !/Brownie/.test(t(0)) && /Brownie/.test(t(1)) && /Batido verde/.test(t(1)) && /Batido verde/.test(t(2)) && !/\{/.test(t(1)); }));
// =====================================================================  v12: phone app mode (desktop untouched)
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${URL0}#/home`); await page.waitForTimeout(500);
ok('there is no app tab bar anywhere (navigation is the burger menu)', await page.evaluate(() => !document.querySelector('[data-app-tabs],.app-tabs')));
ok('desktop header: logo, one account circle and the burger (language, theme and cart live in the menu)', await page.evaluate(() => { const v = (s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; }; return v('.site-header .acct__btn') && v('.site-header .burger'); }));
const mobile = { width: 390, height: 844 };
await page.setViewportSize(mobile); await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(900);
ok('phone: the header keeps only logo, account circle and burger (language, theme and login live in the menu)', await page.evaluate(() => { const v = (s) => { const e = document.querySelector(s); return !e || getComputedStyle(e).display === 'none'; }; const bar = document.querySelector('.site-header__bar').getBoundingClientRect(); return v('.site-header .lang') && v('.site-header .header-login') && bar.height <= 64; }));
await page.click('[data-menu-open]'); await page.waitForTimeout(900);
ok('phone: the burger menu holds the language switch, theme toggle, account and cart', await page.evaluate(() => { const o = document.querySelector('.menu-overlay'); const vis = (s) => { const e = o.querySelector(s); return !!e && e.getBoundingClientRect().width > 0; }; return vis('.lang') && vis('.theme-carousel') && o.querySelectorAll('.menu-overlay__tools .icon-link').length >= 2; }));
await page.click('[data-menu-close]'); await page.waitForTimeout(600);
// every page: nothing wider than the screen, compact length, nothing hides under the fixed bars
const pageNames = await page.evaluate(() => [...document.querySelectorAll('[data-page]')].map((e) => e.getAttribute('data-page')));
const wide = [], long = [], hidden = [];
let totalScreens = 0;
for (const name of pageNames) {
  await page.evaluate((h) => { location.hash = '#/' + h; }, name); await page.waitForTimeout(250);
  const r = await page.evaluate(() => ({ ow: document.documentElement.scrollWidth - innerWidth, h: document.documentElement.scrollHeight, bw: document.body.scrollWidth - innerWidth }));
  totalScreens += r.h / mobile.height;
  if (r.ow > 1 || r.bw > 1) wide.push(name + ' +' + Math.max(r.ow, r.bw));
  if (r.h / mobile.height > 13) long.push(name + ' ' + (r.h / mobile.height).toFixed(1));
}
ok('phone: no page scrolls sideways (all ' + pageNames.length + ' pages)', wide.length === 0, wide.join(', '));
ok('phone: no page is longer than 13 screens and the average is under 3.9 screens', long.length === 0 && totalScreens / pageNames.length < 3.9, long.join(', ') + ' avg ' + (totalScreens / pageNames.length).toFixed(2));
// v13: minimal phone UI: slim home, glowing "i" with the pricing sheet, no announcement bar
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => localStorage.removeItem('kulinaria_funnel')); await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(900);
const homePhone = await page.evaluate(() => { const pg = document.querySelector('[data-page="home"]'); const vis = (s) => [...pg.querySelectorAll(s)].some((e) => e.getBoundingClientRect().height > 0 && getComputedStyle(e).display !== 'none'); return { ann: getComputedStyle(document.querySelector('.site-header__ann')).display, teaser: vis('.funnel__teaser'), wizard: vis('.funnel__track'), showcase: vis('.showcase'), band: vis('.band'), rail: vis('.rail'), plans: vis('.plan-card'), screens: document.documentElement.scrollHeight / innerHeight }; });
ok('phone home: hero, order card, this week, showcases, tiers, categories, plans, FAQ and the final call are all there (placeholder testimonials and the marquee are not)', !homePhone.teaser && homePhone.wizard && homePhone.showcase && homePhone.band && homePhone.rail && homePhone.plans && homePhone.screens < 13, JSON.stringify(homePhone));
const homeMore = await page.evaluate(() => { const pg = document.querySelector('[data-page="home"]'); const vis = (s) => [...pg.querySelectorAll(s)].some((e) => e.getBoundingClientRect().height > 0); return { tiers: vis('.tier-ladder'), index: vis('.fg--index'), faq: vis('.accordion'), cta: vis('.cta-banner'), marquee: vis('.marquee'), testimonials: vis('.fg--grid.section--raised') }; });
ok('phone home keeps tiers, FAQ and the final call, and drops the marquee and the placeholder testimonials', homeMore.tiers && homeMore.faq && homeMore.cta && !homeMore.marquee && !homeMore.testimonials, JSON.stringify(homeMore));
const swipeRule = await page.evaluate(() => { const bad = []; for (const l of document.querySelectorAll('.fg__list')) { const ph = !!l.querySelector('.card--img'); const sw = getComputedStyle(l).overflowX === 'auto' && l.getBoundingClientRect().width > 0; if (!ph && !l.closest('.fg--index') && sw) bad.push(l.parentElement.className); } return bad; });
const carousel = await page.evaluate(() => { document.querySelector('[data-page="pg/carta-galeria"]'); return null; });
await page.evaluate(() => { location.hash = '#/pg/plan-bloque'; }); await page.waitForTimeout(500);
const igl = await page.evaluate(() => { const l = [...document.querySelectorAll('[data-page="pg/plan-bloque"] .fg__list')].find((x) => x.querySelector('.card--img')); if (!l) return null; const c = l.children[0].getBoundingClientRect(), r = l.getBoundingClientRect(); const dots = l.nextElementSibling; return { cardW: Math.round(c.width), rowW: Math.round(r.width), scroll: l.scrollWidth > l.clientWidth, dots: !!dots && dots.classList.contains('swipe-dots'), counter: dots ? (dots.querySelector('.swipe-n') || {}).textContent : '' }; });
ok('phone: several photos behave like an Instagram post (one at a time, full width, dots and a "1 / n" counter)', igl && igl.cardW === igl.rowW && igl.scroll && igl.dots && /^1 \/ \d+$/.test(igl.counter), JSON.stringify(igl));
const noSide = await page.evaluate(() => { const bad = []; for (const sel of ['.chips', '.filter-bar__row', '.account-nav']) for (const e of document.querySelectorAll(sel)) { if (e.getBoundingClientRect().width > 0 && getComputedStyle(e).overflowX === 'auto') bad.push(sel); } return bad; });
ok('phone: chips and pills wrap, nothing scrolls sideways except the photo carousels', noSide.length === 0, noSide.join(','));
await page.evaluate(() => { location.hash = '#/home'; }); await page.waitForTimeout(600);
ok('phone: only photo cards swipe; text cards stack so nothing is cut in half', swipeRule.length === 0, swipeRule.join(' | '));
ok('phone: no announcement strip above the app bar', homePhone.ann === 'none');
// (the glowing "i" sheet lived in the phone teaser; the real step 1 "how it works" replaced it on the phone home)
await page.setViewportSize({ width: 1440, height: 900 });
// v14: "Capítulos" phone design
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(1000);
const chap = await page.evaluate(() => {
  const pg = document.querySelector('[data-page="home"]'); const hero = pg.querySelector('.hero'); const h1 = hero.querySelector('h1');
  const rgb = (c) => c.match(/\d+/g).map(Number); const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const dishes = [...pg.querySelectorAll('.rail .dish')]; const track = pg.querySelector('.rail__track');
  const teaser = pg.querySelector('.funnel--teaser') || pg.querySelector('[data-funnel]');
  return { tabs: !!document.querySelector('.app-tabs') && getComputedStyle(document.querySelector('.app-tabs')).display !== 'none', dark: document.documentElement.getAttribute('data-theme'),
    heroH: Math.round(hero.getBoundingClientRect().height), vh: innerHeight, h1lum: lum(rgb(getComputedStyle(h1).color)), bodyClass: document.body.className,
    slideW: dishes[0] ? Math.round(dishes[0].getBoundingClientRect().width) : 0, swipe: track ? getComputedStyle(track).scrollSnapType : '', slides: dishes.length,
    teaserH: Math.round(teaser.getBoundingClientRect().height), teaserBg: !!teaser.querySelector('.funnel__teaser-bg img') };
});
ok('phone: there is no bottom tab bar (burger-only navigation)', !chap.tabs, JSON.stringify(chap));
const heroPhone = await page.evaluate(() => { const hero = document.querySelector('[data-page="home"] .hero'), st = hero.querySelector('.hero__stage').getBoundingClientRect(), v = hero.querySelector('.hero__video--intro'), cp = hero.querySelector('.hero__copy').getBoundingClientRect(); return { stageW: Math.round(st.width), square: Math.abs(st.width - st.height) < 3, fit: getComputedStyle(v).objectFit, copyBelow: cp.top >= st.bottom - st.height * 0.12, h: Math.round(hero.getBoundingClientRect().height), vh: innerHeight }; }); heroPhone.h1lum = chap.h1lum;
ok('phone: the intro video is full-bleed (full width), the headline and button sit in a strip right under it and the hero fits the screen', heroPhone.stageW === 390 && heroPhone.copyBelow && heroPhone.h <= heroPhone.vh + 60 && heroPhone.h1lum > 0.8, JSON.stringify(heroPhone));
ok('phone: chapter 2 shows one dish per screen and you swipe sideways between dishes', chap.slideW >= 230 && /x/.test(chap.swipe) && chap.slides >= 5, JSON.stringify(chap));
ok('the preview switches the body template class page by page (like Shopify)', await page.evaluate(() => { location.hash = '#/p/pollo-a-las-hierbas'; return new Promise((r) => setTimeout(() => r(document.body.classList.contains('template-product') && !document.body.classList.contains('template-index')), 300)); }));
await page.evaluate(() => { location.hash = '#/home'; }); await page.waitForTimeout(300);
await page.click('[data-menu-open]'); await page.waitForTimeout(900);
const map = await page.evaluate(() => { const o = document.querySelector('.menu-overlay'); const groups = [...o.querySelectorAll('.sitemap__group')]; const withSub = groups.filter((g) => g.querySelector('.sitemap__sub')); return { groups: groups.length, toggles: o.querySelectorAll('.sitemap__tog').length, withSub: withSub.length, closedSubs: withSub.every((g) => getComputedStyle(g.querySelector('.sitemap__sub')).display === 'none') }; });
ok('phone burger menu: 10 groups, each one with sub-pages has a "+" that opens them (closed at first)', map.groups === 10 && map.toggles === map.withSub && map.withSub >= 8 && map.closedSubs, JSON.stringify(map));
await page.click('.sitemap__group:nth-child(1) .sitemap__tog'); await page.waitForTimeout(400);
ok('phone burger menu: opening "Especiales de la semana" shows its sub-pages as 2-column cards (calendar, order, allergy profile)', await page.evaluate(() => { const g = document.querySelector('.sitemap__group:nth-child(1)'); const sub = g.querySelector('.sitemap__sub'); const links = [...sub.querySelectorAll('a')]; const cols = getComputedStyle(sub).gridTemplateColumns.split(' ').length; return getComputedStyle(sub).display === 'grid' && cols === 2 && links.length >= 3 && links.every((a) => a.getBoundingClientRect().height >= 60); }));
await page.click('[data-menu-close]'); await page.waitForTimeout(500);
await page.evaluate(() => { location.hash = '#/pg/planes'; }); await page.waitForTimeout(500);
ok('phone inner pages: the title sits over a photo (not a separate block)', await page.evaluate(() => { const ph = document.querySelector('[data-page="pg/planes"] .page-head__photo'); const h1 = ph.querySelector('h1').getBoundingClientRect(), bg = ph.querySelector('.page-head__bg').getBoundingClientRect(); return h1.top >= bg.top && h1.bottom <= bg.bottom + 2 && bg.height > 250; }));
// a fresh visitor on a phone gets the dark design
{
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } }); const fp = await fresh.newPage();
  await fp.goto(`${URL0}#/home`); await fp.waitForTimeout(500);
  ok('phone: first visit opens in Fuego (black + orange)', await fp.evaluate(() => document.documentElement.getAttribute('data-theme') === 'fuego'));
  await fresh.close();
}
await page.setViewportSize({ width: 1440, height: 900 });
ok('desktop never shows the info dot, the sheet or the block line (the step counter now shows everywhere)', await page.evaluate(() => [...document.querySelectorAll('.info-dot,.sheet,.funnel__block,.funnel__teaser')].every((e) => getComputedStyle(e).display === 'none')));
await page.setViewportSize({ width: 1440, height: 900 });
// =====================================================================  v17: Day / Night / Fuego carousel
await page.setViewportSize({ width: 1440, height: 900 });
await page.evaluate(() => localStorage.setItem('kx-theme', 'light')); await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(900);
const modes = [];
for (let i = 0; i < 3; i++) {
  await openMenu();
  const st = await page.evaluate(() => { const g = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim().toLowerCase(); const lg = (s) => { const e = document.querySelector('.site-header ' + s); return e ? getComputedStyle(e).display : null; };
    return { theme: document.documentElement.getAttribute('data-theme'), accent: g('--accent'), bg: g('--bg-base'), font: getComputedStyle(document.querySelector('h1')).fontFamily.split(',')[0].replace(/"/g, ''), ink: lg('.logo--ink'), gold: lg('.logo--gold'), fuego: lg('.logo--fuego'), label: [...document.querySelectorAll('.tc__name')].find((n) => getComputedStyle(n).opacity === '1')?.textContent.trim() }; });
  modes.push(st);
  await page.click('#menu-overlay [data-theme-next]'); await page.waitForTimeout(700); await closeMenu(); await page.waitForTimeout(500);
}
const byTheme = {}; modes.forEach((m) => { byTheme[m.theme] = m; }); const mDay = byTheme.light || {}, mNight = byTheme.dark || {}, mFuego = byTheme.fuego || {};
ok('the carousel cycles Day -> Night -> Fuego -> Day (starting wherever the visitor is; Fuego is the default)', ['light,dark,fuego', 'dark,fuego,light', 'fuego,light,dark'].includes(modes.map((m) => m.theme).join()), JSON.stringify(modes.map((m) => m.theme)));
ok('Day is white + olive, Night is black + gold, Fuego is black + orange-red #FF6200', mDay.accent === '#4b5e2b' && mDay.bg === '#f5f4ec', JSON.stringify(mDay)) ;
ok('Night keeps its gold accent', mNight.accent === '#e2c36b' && mNight.bg === '#0d0c0a', JSON.stringify(mNight));
ok('Fuego uses the brand colours (accent #FF6200, background #0E0E0E)', mFuego.accent === '#ff6200' && mFuego.bg === '#0e0e0e', JSON.stringify(mFuego));
ok('all three modes share one type system (Playfair Display titles, Montserrat text)', modes.every((m) => m.font === 'Playfair Display'), JSON.stringify(modes.map((m) => m.font)));
ok('each mode shows its own logo (ink / gold / orange-and-white Fuego logo)', mDay.ink !== 'none' && mDay.fuego === 'none' && mNight.gold !== 'none' && mNight.fuego === 'none' && mFuego.fuego !== 'none' && mFuego.gold === 'none', JSON.stringify(modes.map((m) => [m.ink, m.gold, m.fuego])));
ok('the carousel label names the mode (Día / Noche / Fuego)', mDay.label === 'Día' && mNight.label === 'Noche' && mFuego.label === 'Fuego', JSON.stringify(modes.map((m) => m.label)));
await page.evaluate(() => localStorage.setItem('kx-theme', 'fuego')); await page.reload(); await page.waitForTimeout(800);
ok('the chosen mode is remembered (Fuego survives a reload, before first paint)', await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'fuego');
await openMenu(); await page.click('#menu-overlay [data-theme-pick="light"]'); await page.waitForTimeout(600);
ok('the dots jump straight to a mode', await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'light');
await closeMenu(); await page.waitForTimeout(500); await page.evaluate(() => localStorage.removeItem('kx-theme'));
// =====================================================================  v18: admin hub (orders tally + shopping list)
{
  const K = require(path.join(ROOT, 'assets/kulinaria-admin.js'));
  const recipes = K.normalizeRecipes({ dishes: { 'filete-prime': { title: 'Filete Prime con verduras asadas', ing: [['Filete Prime', 200, 'g', 'prot', 5], ['Sal', 2.5, 'g', 'pantry', 0], ['Huevo', 1, 'u', 'dairy', 0]] } } });
  const at = (y, m, d, h = 12, mi = 0) => new Date(y, m, d, h, mi).toISOString();
  ok('admin: orders close Saturday 10:00; a Wednesday order first delivers on the Monday after that Saturday', K.ymd(K.firstDeliveryMonday(at(2026, 10, 4, 15), 10)) === '2026-11-09');
  ok('admin: an order placed Saturday 09:59 still makes the cycle, 10:01 goes to the next one', K.ymd(K.firstDeliveryMonday(at(2026, 10, 7, 9, 59), 10)) === '2026-11-09' && K.ymd(K.firstDeliveryMonday(at(2026, 10, 7, 10, 1), 10)) === '2026-11-16');
  ok('admin: a Sunday order goes to the following cycle', K.ymd(K.firstDeliveryMonday(at(2026, 10, 8, 20), 10)) === '2026-11-16');
  ok('admin: a 4-week block delivers on 4 consecutive Mondays, a trial on one', K.deliveryWeeks({ date: at(2026, 10, 4), plan: 'block' }, 10).join() === '2026-11-09,2026-11-16,2026-11-23,2026-11-30' && K.deliveryWeeks({ date: at(2026, 10, 4), plan: 'trial' }, 10).join() === '2026-11-09');
  ok('admin: November 2026 has 5 delivery Mondays', K.weeksInMonth(2026, 10).join() === '2026-11-02,2026-11-09,2026-11-16,2026-11-23,2026-11-30');
  const o1 = { date: at(2026, 10, 4), plan: 'block', items: [{ title: 'Filete Prime con verduras asadas', qty: 2 }] };
  const o2 = { date: at(2026, 10, 5), plan: 'trial', items: [{ title: 'filete prime con verduras asadas', qty: 1 }] };
  const L = K.shopping([o1, o2], recipes, { from: '2026-11-09', to: '2026-11-09', cutoff: 10, buffer: 0 });
  const row = (l, n) => l.rows.find((r) => r.name === n);
  ok('admin: 3 steaks of 200 g with 5% waste = 631.6 g to buy, rounded up to 640 g (block and trial orders add up)', row(L, 'Filete Prime').buy === 640 && L.plates === 3 && L.orders === 2, JSON.stringify(row(L, 'Filete Prime')));
  ok('admin: salt 3 x 2.5 g = 7.5 g, rounded up to 10 g; eggs are counted in pieces', row(L, 'Sal').buy === 10 && row(L, 'Huevo').buy === 3 && row(L, 'Huevo').unit === 'u');
  ok('admin: the 10% buying buffer is applied on top of the waste (700 g)', row(K.shopping([o1, o2], recipes, { from: '2026-11-09', to: '2026-11-09', cutoff: 10, buffer: 10 }), 'Filete Prime').buy === 700);
  ok('admin: the trial week only counts in its own week, the block keeps counting (week 3: 2 steaks = 421 g, rounded up to 430 g)', row(K.shopping([o1, o2], recipes, { from: '2026-11-23', to: '2026-11-23', cutoff: 10, buffer: 0 }), 'Filete Prime').buy === 430 && K.shopping([o1, o2], recipes, { from: '2026-12-07', to: '2026-12-07', cutoff: 10 }).rows.length === 0);
  ok('admin: a month adds every delivery week inside it (block 4 weeks x 2 + trial 1 = 9 steaks)', K.shopping([o1, o2], recipes, { from: '2026-11-02', to: '2026-11-30', cutoff: 10, buffer: 0 }).plates === 9);
  ok('admin: dishes without a recipe are reported, not silently ignored', K.shopping([{ date: at(2026, 10, 4), plan: 'trial', items: [{ title: 'Plato nuevo', qty: 2 }] }], recipes, { from: '2026-11-09', to: '2026-11-09', cutoff: 10 }).missing['Plato nuevo'] === 2);
  ok('admin: quantities read like a shopping list (13.2 kg, 950 g, 1.5 L, 3 pz)', ['13.2 kg', '950 g', '1.5 L', '3 pz'].join() === [K.fmtQty(13200, 'g'), K.fmtQty(950, 'g'), K.fmtQty(1500, 'ml'), K.fmtQty(3, 'u')].map((x) => x.n + ' ' + x.u).join());
  const tally = K.monthTally([{ date: at(2026, 10, 4), plan: 'block', total: 2560, email: 'a@x.com', items: [{ title: 'A', qty: 2 }] }, { date: at(2026, 10, 9), plan: 'trial', total: 736, email: 'b@x.com', items: [{ title: 'A', qty: 1 }, { title: 'B', qty: 1 }] }, { date: at(2026, 9, 28), plan: 'block', total: 999, email: 'c@x.com', items: [] }], [{ email: 'a@x.com', created: at(2026, 10, 4) }, { email: 'b@x.com', created: at(2026, 10, 9) }, { email: 'c@x.com', created: at(2026, 9, 28) }], 2026, 10, 10);
  ok('admin: month tally = orders, blocks vs loose trials, sales, new clients and plates to cook', tally.orders === 2 && tally.blocks === 1 && tally.trials === 1 && tally.revenue === 3296 && tally.newClients === 2 && tally.plates === 10 && tally.top[0].title === 'A', JSON.stringify(tally));
  const hist = K.weeklyHistory([o1, o2], 10, '2026-11-02', 6);
  ok('admin: the weekly history remembers past weeks (active orders, dishes, new blocks per delivery week)', hist[1].orders === 2 && hist[1].plates === 3 && hist[1].newBlocks === 1 && hist[2].orders === 1 && hist[5].orders === 0, JSON.stringify(hist));
  ok('admin: "active blocks now" counts blocks that still have deliveries ahead', K.activeBlocks([o1, o2], 10, '2026-11-23') === 1 && K.activeBlocks([o1, o2], 10, '2026-12-14') === 0);
  ok('admin: the Google Sheet recipe rows (Recetas tab) load like the bundled recipes', !!K.findRecipe(K.normalizeRecipes([{ dish: 'Sopa X', name: 'Sal', qty: 1, unit: 'g', cat: 'pantry', waste: 0 }]), 'sopa x'));
  const bundled = K.normalizeRecipes(JSON.parse(fs.readFileSync(path.join(ROOT, 'backend/recipes.json'), 'utf8')));
  ok('admin: every sample dish of the store has a recipe with the pantry basics (oil, salt, garlic where used)', K.recipeList(bundled).length === 11 && K.recipeList(bundled).every((r) => r.ing.length >= 6), String(K.recipeList(bundled).length));
  ok('admin: the page is hidden (not in the sitemap, the burger or any menu) and asks search engines not to index it', !/pages\/admin/.test(fs.readFileSync(path.join(ROOT, 'snippets/sitemap-default.liquid'), 'utf8')) && !/pages\/admin/.test(fs.readFileSync(path.join(ROOT, 'backend/shopify/menu.json'), 'utf8')) && /template\.suffix == 'admin'[\s\S]{0,120}noindex/.test(fs.readFileSync(path.join(ROOT, 'layout/theme.liquid'), 'utf8')));
  ok('admin: the preview never links to /pages/admin from the public pages', await (async () => { await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(`${URL0}#/home`); await page.waitForTimeout(300); return page.evaluate(() => ![...document.querySelectorAll('[data-page]:not([data-page="pg/admin"]) a')].some((a) => /admin/.test(a.getAttribute('href') || ''))); })());
  await page.goto(`${URL0}#/pg/admin`); await page.reload(); await page.waitForTimeout(1200);
  const A = '[data-page="pg/admin"]';
  ok('admin hub: title, 8 tabs, demo-data notice, 7 KPI cards', await page.evaluate((a) => document.querySelectorAll(a + ' .adm-tabs button').length === 8 && !!document.querySelector(a + ' .adm-demo') && document.querySelectorAll(a + ' .adm-kpi').length === 7, A));
  ok('admin hub: the KPIs show orders, 4-week blocks, loose trial weeks, new clients, sales and average ticket', await page.evaluate((a) => { const t = (id) => document.querySelector(a + ' [data-kpi="' + id + '"] b').textContent; return +t('orders') === +t('blocks') + +t('trials') && /^\$/.test(t('sales')) && /^\$/.test(t('avg')) && +t('clients') >= 0; }, A));
  ok('admin summary: a weekly history table of past and coming weeks', await page.evaluate((a) => document.querySelectorAll(a + ' .adm-hist tbody tr').length === 12 && !!document.querySelector(a + ' .adm-hist tr.now'), A));
  await page.click(`${A} [data-tab="1"]`); await page.waitForTimeout(400);
  const shop = await page.evaluate((a) => ({ cats: document.querySelectorAll(a + ' .adm-cat').length, rows: document.querySelectorAll(a + ' .adm-list li').length, kg: /kg|L|g|ml|pz/.test(document.querySelector(a + ' .adm-qty').textContent), week: document.querySelector(a + ' .adm-nav b').textContent, actions: document.querySelectorAll(a + ' .adm-actions button').length }), A);
  ok('admin shopping list: grouped by category with kg / g / L / pieces per ingredient, next week by default, copy / CSV / print', shop.cats >= 3 && shop.rows >= 10 && shop.kg && shop.actions === 3, JSON.stringify(shop));
  const before = await page.evaluate((a) => document.querySelector(a + ' [data-qty]').textContent, A);
  await page.fill(`${A} [data-buffer]`, '20'); await page.dispatchEvent(`${A} [data-buffer]`, 'change'); await page.waitForTimeout(300);
  const after = await page.evaluate((a) => document.querySelector(a + ' [data-qty]').textContent, A);
  ok('admin shopping list: a bigger buying buffer raises the quantities', before !== after, before + ' -> ' + after);
  await page.fill(`${A} [data-buffer]`, '5'); await page.dispatchEvent(`${A} [data-buffer]`, 'change'); await page.waitForTimeout(300);
  await page.click(`${A} .adm-list li:first-child input`); await page.waitForTimeout(200);
  await page.reload(); await page.waitForTimeout(1200); await page.click(`${A} [data-tab="1"]`); await page.waitForTimeout(400);
  ok('admin shopping list: ticked items stay ticked after a reload (you can shop through the list)', await page.evaluate((a) => document.querySelector(a + ' .adm-list li:first-child').classList.contains('done'), A));
  await page.click(`${A} [data-mode="month"]`); await page.waitForTimeout(300);
  ok('admin shopping list: the month view adds up every delivery week of the month', await page.evaluate((a) => /\d/.test(document.querySelector(a + ' .adm-sum b').textContent) && document.querySelector(a + ' [data-m]') !== null, A));
  await page.click(`${A} [data-tab="2"]`); await page.waitForTimeout(300);
  ok('admin recipes: 11 dishes, each with grams per portion and waste', await page.evaluate((a) => document.querySelectorAll(a + ' .adm-recipes .adm-card').length === 11 && /g\/ml/.test(document.querySelector(a + ' .adm-recipes h3').textContent), A));
  await page.click(`${A} [data-tab="3"]`); await page.waitForTimeout(300);
  ok('admin orders: a table with date, client, plan (block / trial), dishes, total and first delivery', await page.evaluate((a) => document.querySelectorAll(a + ' .adm-table tbody tr').length > 20 && document.querySelectorAll(a + ' .adm-table th').length === 7, A));
  await page.click(`${A} [data-tab="0"]`); await page.waitForTimeout(300); await page.click(`${A} [data-go]`); await page.waitForTimeout(300);
  ok('admin summary: "to cook next week" jumps to that week\'s shopping list', await page.evaluate((a) => document.querySelector(a + ' .adm-tabs [aria-selected="true"]').getAttribute('data-tab') === '1', A));
  await page.evaluate(() => { localStorage.clear(); });
}
// ---- screenshots for eyeballing
if (shotDir) {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const k of ['home', 'menu', 'p/salmon-costra-almendras', 'pg/planes', 'pg/embajadores', 'carrito', 'cuenta', 'pg/carta-kulinaria', 'pg/ayuda', 'login', 'registro', 'pg/cuenta-pausas', 'pg/nosotros']) {
    await page.goto(`${URL0}#/${k}`); await page.waitForTimeout(400); await scrollThrough(page);
    await page.screenshot({ path: path.join(shotDir, k.replace(/\W+/g, '_') + '.png'), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${URL0}#/home`); await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shotDir, 'mobile_home.png') });
}

// =====================================================================  v22: onboarding questionnaire (asked once) + welcome
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${URL0}#/home`); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('kx-test-fresh', '1'); localStorage.setItem('kx-test-orders', '0'); sessionStorage.setItem('kx_ob_asked', '1'); }); await page.goto(`${URL0}#/pg/bienvenida`); await page.reload(); await page.waitForTimeout(500);
const obS = '[data-page="pg/bienvenida"] [data-onboarding]';
ok('onboarding page: a thorough 6-step questionnaire (who, delivery, household, allergies/health, tastes, consents)', (await page.$$eval(`${obS} [data-ob-step]`, (e) => e.length)) === 6 && !(await page.$eval(`${obS} [data-ob-form]`, (e) => e.hidden)));
await page.click(`${obS} [data-ob-next]`); await page.waitForTimeout(150);
ok('onboarding step 1 will not continue without name, e-mail and phone', await page.$eval(`${obS} [data-ob-step="1"]`, (e) => e.classList.contains('is-on')) && !(await page.$eval(`${obS} [data-ob-error]`, (e) => e.hidden)));
await page.fill(`${obS} [data-ob="name"]`, 'Ana Pérez'); await page.fill(`${obS} [data-ob="email"]`, 'ana@ejemplo.com'); await page.fill(`${obS} [data-ob="phone"]`, '+52 999 000 0000');
await page.click(`${obS} [data-ob-next]`); await page.waitForTimeout(150);
await page.fill(`${obS} [data-ob="street"]`, 'Calle Lago 24'); await page.fill(`${obS} [data-ob="cluster"]`, 'Clúster Las Lomas');
await page.click(`${obS} [data-ob-next]`); await page.waitForTimeout(150);
ok('delivery step will not continue without city and postal code', await page.$eval(`${obS} [data-ob-step="2"]`, (e) => e.classList.contains('is-on')));
const OB = (s) => `${obS} ${s}`, nextB = () => page.click(OB('[data-ob-next]')).then(() => page.waitForTimeout(160));
const stepOn = () => page.$$eval(OB('[data-ob-step]'), (e) => e.findIndex((x) => x.classList.contains('is-on')) + 1);
ok('the side panel names six steps, marks the current one and shows "Paso 2 de 6" with a progress bar', await page.evaluate((s) => { const o = document.querySelector(s); return o.querySelectorAll('.ob-dots li').length === 6 && o.querySelector('.ob-dots li.is-on') && /2 de 6|2 \/ 6|2 of 6/.test(o.querySelector('[data-ob-count]').textContent) && parseFloat(o.querySelector('[data-ob-bar]').style.width) > 30; }, obS));
await page.fill(OB('[data-ob="city"]'), 'Mérida'); await page.fill(OB('[data-ob="zip"]'), '97000'); await nextB();
ok('outside the service area (postal code 97000) the delivery step refuses and says we only deliver in Puebla for now', (await stepOn()) === 2 && /Puebla/.test(await page.$eval(OB('[data-ob-error]'), (e) => e.textContent)) && !(await page.$eval(OB('[data-ob-error]'), (e) => e.hidden)));
await page.fill(OB('[data-ob="city"]'), 'Puebla'); await page.fill(OB('[data-ob="zip"]'), '72000'); await page.fill(OB('[data-ob="num"]'), '24 B'); await page.fill(OB('[data-ob="refs"]'), 'Frente al parque'); await page.fill(OB('[data-ob="access"]'), 'Caseta, timbre 3');
await page.click(OB('[data-ob-seg="window"] input[value="pm"]'), { force: true });
await page.click(OB('[data-ob-seg="window"] input[value="am"]'), { force: true });
ok('a segmented answer takes exactly one value (choosing morning replaces afternoon)', await page.$$eval(OB('[data-ob-seg="window"] input:checked'), (e) => e.length === 1 && e[0].value === 'am'));
await page.click(OB('[data-ob-seg="window"] input[value="pm"]'), { force: true });
await nextB();
ok('household step: the counters start at 1 adult and 0 children', (await page.$eval(OB('[data-ob="adults"]'), (e) => e.value)) === '1' && (await page.$eval(OB('[data-ob="kids"]'), (e) => e.value)) === '0');
await page.click(OB('[data-ob-count-btn="adults"][data-d="1"]')); await page.click(OB('[data-ob-count-btn="kids"][data-d="1"]')); await page.click(OB('[data-ob-count-btn="kids"][data-d="1"]')); await page.click(OB('[data-ob-count-btn="kids"][data-d="-1"]'));
ok('the + and − buttons change the number of people and never go below the minimum', (await page.$eval(OB('[data-ob="adults"]'), (e) => e.value)) === '2' && (await page.$eval(OB('[data-ob="kids"]'), (e) => e.value)) === '1');
await page.click(OB('[data-ob-count-btn="adults"][data-d="-1"]')); await page.click(OB('[data-ob-count-btn="adults"][data-d="-1"]'));
ok('adults cannot drop below 1', (await page.$eval(OB('[data-ob="adults"]'), (e) => e.value)) === '1');
await page.click(OB('[data-ob-count-btn="adults"][data-d="1"]'));
await page.check(OB('[data-ob-group="meals"][value="comidas"]')); await page.check(OB('[data-ob-group="meals"][value="cenas"]'));
await page.click(OB('[data-ob-seg="portion"] input[value="abundante"]'), { force: true }); await page.click(OB('[data-ob-seg="activity"] input[value="alta"]'), { force: true });
await nextB();
// allergies and health: ticks, removable tags, suggestions, severity, cross-contact, conditions
await page.check(OB('[data-ob-allergy][value="Mariscos"]'));
await page.fill(OB('[data-ob-tags="allergy_other"] [data-ob-tag-input]'), 'ajonjolí'); await page.press(OB('[data-ob-tags="allergy_other"] [data-ob-tag-input]'), 'Enter');
await page.click(OB('[data-ob-tags="allergy_other"] [data-ob-suggest="Almendra"]'));
ok('other allergies become removable tags (typed with Enter, or tapped from the suggestions)', await page.$$eval(OB('[data-ob-tags="allergy_other"] .tag'), (e) => e.map((x) => x.firstChild.textContent).join('|') === 'ajonjolí|Almendra') && await page.$eval(OB('[data-ob-tags="allergy_other"] [data-ob-suggest="Almendra"]'), (e) => e.classList.contains('is-active')));
await page.click(OB('[data-ob-tags="allergy_other"] .tag:first-child button')); await page.waitForTimeout(100);
ok('the × on a tag removes just that tag', await page.$$eval(OB('[data-ob-tags="allergy_other"] .tag'), (e) => e.length === 1 && e[0].firstChild.textContent === 'Almendra') && (await page.$eval(OB('[data-ob="allergy_other"]'), (e) => e.value)) === 'Almendra');
await page.click(OB('[data-ob-tags="allergy_other"] [data-ob-suggest="Almendra"]'));
ok('tapping an active suggestion again removes it (tags can always be taken back)', (await page.$$eval(OB('[data-ob-tags="allergy_other"] .tag'), (e) => e.length)) === 0);
await page.click(OB('[data-ob-tags="allergy_other"] [data-ob-suggest="Nuez"]')); await page.fill(OB('[data-ob-tags="allergy_other"] [data-ob-tag-input]'), 'kiwi'); await page.press(OB('[data-ob-tags="allergy_other"] [data-ob-tag-input]'), 'Enter');
await page.press(OB('[data-ob-tags="allergy_other"] [data-ob-tag-input]'), 'Backspace');
ok('Backspace on the empty field deletes the last tag', await page.$$eval(OB('[data-ob-tags="allergy_other"] .tag'), (e) => e.length === 1 && e[0].firstChild.textContent === 'Nuez'));
await page.click(OB('[data-ob-seg="severity"] input[value="anafilaxia"]'), { force: true }); await page.click(OB('[data-ob-seg="cross"] input[value="estricto"]'), { force: true });
await page.check(OB('[data-ob-group="conditions"][value="diabetes"]')); await page.check(OB('[data-ob-group="conditions"][value="hipertension"]'));
await nextB();
// tastes
await page.check(OB('[data-ob-diet][value="Keto"]')); await page.check(OB('[data-ob-diet][value="Alto en proteína"]'));
await page.fill(OB('[data-ob-tags="dislikes"] [data-ob-tag-input]'), 'cebolla'); await page.press(OB('[data-ob-tags="dislikes"] [data-ob-tag-input]'), 'Enter');
await page.click(OB('[data-ob-tags="dislikes"] [data-ob-suggest="Cilantro"]'));
await page.fill(OB('[data-ob-tags="loves"] [data-ob-tag-input]'), 'aguacate, limón'); await page.press(OB('[data-ob-tags="loves"] [data-ob-tag-input]'), 'Enter');
ok('a tag typed with a comma never splits the saved list (commas are cleaned)', await page.$$eval(OB('[data-ob-tags="loves"] .tag'), (e) => e.length === 1));
await page.check(OB('[data-ob-group="cuisines"][value="mexicana"]')); await page.check(OB('[data-ob-group="cuisines"][value="brasa"]'));
await page.click(OB('[data-ob-seg="spice"] input[value="2"]'), { force: true });
await page.selectOption(OB('[data-ob="goal"]'), 'bajar'); await page.fill(OB('[data-ob="kcal"]'), '1900');
await page.press(OB('[data-ob="kcal"]'), 'Enter'); await page.waitForTimeout(200);
ok('pressing Enter in a field moves to the next step, it never saves early', (await stepOn()) === 6 && (await page.$eval(OB('[data-ob-welcome]'), (e) => e.hidden)));
// the review lists every answer and each Edit jumps back to its step
const rv = await page.$eval(OB('[data-ob-review]'), (e) => e.textContent);
ok('review step lists the answers from all five sections (name, address, household, allergies, tastes)', ['Ana Pérez', 'Puebla', 'Caseta', 'Mariscos', 'Nuez', 'Diabetes', 'cebolla', 'Cilantro', 'aguacate'].every((w) => rv.includes(w)) && /Abundante/.test(rv) && /Anafilaxia|anafilaxia/.test(rv), rv.slice(0, 160));
await page.click(OB('[data-ob-review] .review__sec:nth-child(4) .text-link')); await page.waitForTimeout(200);
ok('Edit on the allergies section jumps back to step 4 with the answers still there', (await stepOn()) === 4 && await page.$eval(OB('[data-ob-allergy][value="Mariscos"]'), (e) => e.checked) && (await page.$$eval(OB('[data-ob-tags="allergy_other"] .tag'), (e) => e.length)) === 1);
ok('a finished step can be revisited from the side panel, but a step not reached yet cannot', await page.evaluate((s) => { const l = document.querySelectorAll(s + ' .ob-dots li'); return l[5].classList.contains('is-done') === false && l[2].classList.contains('is-done'); }, obS));
await page.click(OB('.ob-dots li:nth-child(1)')); await page.waitForTimeout(150);
ok('clicking step 1 in the side panel goes back to it', (await stepOn()) === 1);
await nextB(); await nextB(); await nextB(); await nextB(); await nextB();
ok('back on the last step the review is up to date', (await stepOn()) === 6);
await page.click(OB('[data-ob-save]')); await page.waitForTimeout(250);
ok('saving without the three confirmations is refused', !(await page.$eval(`${obS} [data-ob-error]`, (e) => e.hidden)) && (await page.$eval(`${obS} [data-ob-welcome]`, (e) => e.hidden)));
for (const c of await page.$$(`${obS} [data-ob-consent]`)) await c.check();
await page.click(`${obS} [data-ob-save]`); await page.waitForTimeout(400);
ok('after saving, a welcome screen greets the customer and points to choosing the plan', !(await page.$eval(`${obS} [data-ob-welcome]`, (e) => e.hidden)) && /Ana/.test(await page.$eval(`${obS} [data-ob-hello]`, (e) => e.textContent)) && /pedido/.test(await page.$eval(`${obS} [data-ob-welcome] a.btn--gold`, (e) => e.getAttribute('href'))));
const obSaved = await page.evaluate(() => ({ f: JSON.parse(localStorage.getItem('kulinaria_funnel') || '{}'), p: JSON.parse(localStorage.getItem('kulinaria_profile') || '{}'), on: localStorage.getItem('kulinaria_onboarded') }));
ok('the answers are stored once (contact, address, allergies, diet, dislikes)', obSaved.on === '1' && obSaved.f.info.email === 'ana@ejemplo.com' && obSaved.f.info.street === 'Calle Lago 24' && obSaved.f.info.city === 'Puebla' && obSaved.f.info.window === 'pm' && obSaved.f.info.adults === '2' && obSaved.f.info.kids === '1' && obSaved.f.info.meals === 'comidas, cenas' && obSaved.f.info.conditions === 'diabetes, hipertension' && obSaved.f.info.goal === 'bajar' && obSaved.f.info.kcal === '1900' && obSaved.f.info.portion === 'abundante' && obSaved.f.info.activity === 'alta' && obSaved.f.info.severity === 'anafilaxia' && obSaved.f.info.cross === 'estricto' && obSaved.f.info.spice === '2' && obSaved.f.info.cuisines === 'mexicana, brasa' && obSaved.f.info.loves === 'aguacate limón' && obSaved.f.info.num === '24 B' && obSaved.f.info.access === 'Caseta, timbre 3' && obSaved.p.allergies.includes('Mariscos') && obSaved.p.allergies.includes('Nuez') && !obSaved.p.allergies.includes('kiwi') && obSaved.p.dislikes.join('|') === 'cebolla|Cilantro' && obSaved.p.diets.join('|') === 'Keto|Alto en proteína' && obSaved.p.diets.includes('Keto') && obSaved.p.dislikes.includes('cebolla'));
await page.goto(`${URL0}#/pg/pedido`); await page.reload(); await page.waitForTimeout(900);
const fnO = '[data-page="pg/pedido"] [data-funnel]';
ok('the order builder never asks for details again (no form fields inside it)', await page.evaluate(() => { const f = document.querySelector('[data-page="pg/pedido"] [data-funnel]'); return !f.querySelector('input[data-info]') && f.querySelectorAll('[data-fn-step]').length === 4; }));
ok('the first delivery date is shown (Monday) with a real date on each weekday slot', await page.evaluate(() => { const f = document.querySelector('[data-page="pg/pedido"] [data-funnel]'); return /\d/.test(f.querySelector('[data-fn-first]').textContent) && [...f.querySelectorAll('[data-fn-day-btn]')].every((l) => /\d/.test(l.textContent)); }));

// =====================================================================  v23/v29: "Mi semana": plan box, weeks that can be chosen, skipping days and weeks
await page.setViewportSize({ width: 1440, height: 900 });
const mwS = '[data-page="pg/cuenta-semana"] [data-myweek]';
const openWeek = async (ls) => { await page.goto(`${URL0}#/home`); await page.evaluate((o) => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('kx-lang', 'es'); sessionStorage.setItem('kx_ob_asked', '1'); Object.entries(o).forEach(([k, v]) => localStorage.setItem(k, v)); }, ls || {}); await page.goto(`${URL0}#/pg/cuenta-semana`); await page.reload(); await page.waitForTimeout(4200); };
await openWeek();
ok('Mi semana (paying customer): plan box shows weeks left, meals planned and when the plan ends', await page.evaluate((s) => { const r = document.querySelector(s); return !r.querySelector('[data-mw-credit]').hidden && /3 \/ 4/.test(r.querySelector('[data-mw-s-weeks]').textContent) && /\/ 20/.test(r.querySelector('[data-mw-s-meals]').textContent) && /\d/.test(r.querySelector('[data-mw-s-ends]').textContent) && r.querySelector('[data-mw-buy]').hidden; }, mwS));
ok('Mi semana: only the weeks the plan covers can be chosen, with one slot per weekday and its date', (await page.$$eval(`${mwS} [data-mw-week] option`, (o) => o.length)) === 3 && (await page.$$eval(`${mwS} select[data-mw-day]`, (s) => s.length)) === 5 && (await page.$$eval(`${mwS} .fn-days label`, (l) => l.every((x) => /\d/.test(x.textContent)))));
const mwVals = await page.$$eval(`${mwS} select[data-mw-day]:first-of-type option`, (o) => o.map((x) => [x.value, x.textContent]));
const base = mwVals.filter(([v, t]) => v && !/\+(MX)?\$/.test(t)).map(([v]) => v), dear = mwVals.filter(([v, t]) => v && /\+(MX)?\$210/.test(t)).map(([v]) => v);
await page.selectOption(`${mwS} li:nth-child(1) select[data-mw-day]`, base[0]); await page.selectOption(`${mwS} li:nth-child(3) select[data-mw-day]`, base[1]); await page.selectOption(`${mwS} li:nth-child(5) select[data-mw-day]`, base[2]);
ok('Mi semana: you do not need all 5 days (3 meals, lunch out on Tuesday and Thursday)', /3 de 5/.test(await page.$eval(`${mwS} [data-mw-count]`, (e) => e.textContent)));
await page.click(`${mwS} [data-mw-save]`); await page.waitForTimeout(300);
ok('Mi semana saves 3 meals with nothing to pay', /3 comidas/.test(await page.$eval(`${mwS} [data-mw-msg]`, (e) => e.textContent)) && (await page.$eval(`${mwS} [data-mw-up]`, (e) => e.hidden)));
await page.click(`${mwS} [data-mw-skip]`); await page.waitForTimeout(300);
ok('Mi semana can skip a whole week (no deliveries)', /sin entregas/.test(await page.$eval(`${mwS} [data-mw-msg]`, (e) => e.textContent)) && (await page.$$eval(`${mwS} select[data-mw-day]`, (s) => s.every((x) => x.value === ''))));
await page.selectOption(`${mwS} li:nth-child(5) select[data-mw-day]`, dear[0]); await page.waitForTimeout(200);
ok('a higher-tier dish shows the upgrade difference for that week (+$210)', /210/.test(await page.$eval(`${mwS} [data-mw-up]`, (e) => e.textContent)));
await page.evaluate(() => { const f = window.fetch; window.__calls = []; window.fetch = function (u, o) { window.__calls.push(String(u).split('/').pop() + ' ' + ((o && o.body) || '').slice(0, 1500)); return f.apply(this, arguments); }; });
await page.click(`${mwS} [data-mw-save]`); await page.waitForTimeout(500);
const mwCalls = await page.evaluate(() => window.__calls);
ok('saving an upgraded week adds the upgrade line tagged with the week (hidden _semana) and goes to the cart', mwCalls.some((r) => /add\.js/.test(r) && /_semana/.test(r)) && page.url().endsWith('#/carrito'), JSON.stringify(mwCalls).slice(0, 300));
await openWeek({ 'kx-test-orders': '0' });
ok('Mi semana (customer without a plan): "buy credits" box instead of the planner', await page.evaluate((s) => { const r = document.querySelector(s); return !r.querySelector('[data-mw-buy]').hidden && r.querySelector('[data-mw-credit]').hidden && r.querySelector('[data-mw-planner]').hidden && /\/pages\/pedido|#\/pg\/pedido/.test(r.querySelector('[data-mw-buy-cta]').getAttribute('href')); }, mwS));
await openWeek({ 'kx-test-credits': JSON.stringify({ ok: true, hasPlan: false, expired: true, weeksLeft: 0, weeksTotal: 0, editable: [] }) });
ok('Mi semana (plan finished): says the plan ended and offers a new one', /terminó/.test(await page.$eval(`${mwS} [data-mw-buy-text]`, (e) => e.textContent)));
await openWeek({ 'kx-test-credits': JSON.stringify({ ok: true, hasPlan: true, plan: 'block', weeksLeft: 1, weeksTotal: 4, mealsPlanned: 15, mealsMax: 20, endsOn: '2099-01-01', editable: [] }) });
ok('Mi semana (plan with no open week): explains that nothing can be chosen right now', await page.evaluate((s) => { const r = document.querySelector(s); return !r.querySelector('[data-mw-none]').hidden && r.querySelector('[data-mw-planner]').hidden && !r.querySelector('[data-mw-credit]').hidden; }, mwS));
// the funnel shows the balance only to people who already have a plan
await page.goto(`${URL0}#/home`); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('kx-lang', 'es'); sessionStorage.setItem('kx_ob_asked', '1'); }); await page.goto(`${URL0}#/pg/pedido`); await page.reload(); await page.waitForTimeout(4200);
ok('order flow: a customer with a plan sees the credit banner with a link to Mi semana', await page.evaluate(() => { const b = document.querySelector('[data-page="pg/pedido"] [data-fn-credit]'); return !b.hidden && /3 de 4/.test(b.textContent) && !!b.querySelector('a[href*="cuenta-semana"]'); }));
await page.evaluate(() => { localStorage.setItem('kx-test-orders', '0'); }); await page.reload(); await page.waitForTimeout(4200);
ok('order flow: a customer without a plan does not see it (the plan cards are the purchase of credits)', await page.$eval('[data-page="pg/pedido"] [data-fn-credit]', (b) => b.hidden));
{
  const K2 = require(path.join(ROOT, 'assets/kulinaria-admin.js'));
  const order = { date: '2026-11-04T12:00:00', plan: 'block', email: 'a@b.mx', items: [{ title: 'Salmón gourmet en costra de almendras', qty: 5 }] };   // Wed -> first delivery Mon 2026-11-09
  const sel = [{ email: 'a@b.mx', week: '2026-11-16', items: [{ title: 'Bowl vegano de garbanzo y tahini', qty: 5 }] }];
  K2.attachWeeklies([order], sel, 10);
  ok('admin: week 1 uses the order dishes, week 2 the client\'s own choice, weeks 3-4 repeat that choice (automatic selection)', K2.itemsOf(order, '2026-11-09')[0].title.startsWith('Salm') && K2.itemsOf(order, '2026-11-16')[0].title.startsWith('Bowl vegano') && K2.itemsOf(order, '2026-11-23')[0].title.startsWith('Bowl vegano') && K2.itemsOf(order, '2026-11-30')[0].title.startsWith('Bowl vegano'));
  const rec = K2.normalizeRecipes ? null : null;
  const hist = K2.weeklyHistory([order], 10, '2026-11-09', 4);
  ok('admin: every delivery week counts 5 dishes (not 20 in week one)', hist.map((h) => h.plates).join() === '5,5,5,5', hist.map((h) => h.plates).join());
}

await page.evaluate(() => { localStorage.setItem('kx-lang', 'es'); });
// =====================================================================  v27: new account -> questionnaire; paying customer -> straight to the week
await page.setViewportSize({ width: 1440, height: 900 });
// a brand-new account (no orders, nothing saved) is taken to the questionnaire the moment they are signed in, once
await page.goto(`${URL0}#/home`); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('kx-test-fresh', '1'); localStorage.setItem('kx-test-orders', '0'); });
await page.goto(`${URL0}#/menu`); await page.reload(); await page.waitForFunction(() => location.hash.includes('bienvenida'), null, { timeout: 12000 }).catch(() => {});
ok('new account: right after signing in the customer lands on the questionnaire', page.url().includes('bienvenida'), page.url());
await page.goto(`${URL0}#/menu`); await page.waitForTimeout(500);
ok('new account: it asks only once per visit (they can look around if they skip it)', !page.url().includes('bienvenida'), page.url());
// an existing paying customer is never interrupted
await page.goto(`${URL0}#/home`); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.removeItem('kx-test-fresh'); localStorage.setItem('kx-test-orders', '2'); localStorage.setItem('kulinaria_onboarded', '1'); });
await page.goto(`${URL0}#/menu`); await page.reload(); await page.waitForTimeout(4200);
ok('existing customer: no questionnaire, they browse normally', !page.url().includes('bienvenida'), page.url());
await page.goto(`${URL0}#/pg/bienvenida`); await page.waitForTimeout(900);
ok('existing customer: the welcome page forwards them straight to "Mi semana" (choose the week and submit)', page.url().includes('cuenta-semana'), page.url());
ok('Mi semana offers previous orders and "my details" links and no "buy credits" box for a paying customer', await page.evaluate(() => { const r = document.querySelector('[data-page="pg/cuenta-semana"] [data-myweek]'); return r.querySelector('[data-mw-buy]').hidden && !!r.querySelector('.myweek__links a[href="#/cuenta"]') && !!r.querySelector('.myweek__links a[href*="bienvenida"]'); }));
// existing customer with nothing saved can order a week: no details form, no questionnaire
await page.goto(`${URL0}#/pg/pedido`); await page.reload(); await page.waitForTimeout(4200);
{
  const f = '[data-page="pg/pedido"] [data-funnel]';
  await page.evaluate((f) => document.querySelector(f + ' [data-cat-choice="veggie"]').click(), f); await page.waitForTimeout(200); await page.evaluate((f) => document.querySelector(f + ' [data-fn-go-next]').click(), f); await page.waitForTimeout(900);
  // (the week opens already filled with the suggested menu: nothing to pick)
  await page.evaluate(() => { const fe = window.fetch; window.__calls = []; window.fetch = function (u, o) { window.__calls.push(String(u).split('/').pop()); return fe.apply(this, arguments); }; });
  await page.click(`${f} [data-fn-finish]`); await page.waitForTimeout(1000);
  ok('existing customer: confirming a week goes straight to the cart without asking for any details', page.url().endsWith('#/carrito') && (await page.evaluate(() => window.__calls)).join() === "cart.js,update.js,add.js", page.url());
}
// a new account that tries to order without answering the questionnaire is sent to it
await page.goto(`${URL0}#/home`); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('kx-test-orders', '0'); sessionStorage.setItem('kx_ob_asked', '1'); });
await page.goto(`${URL0}#/pg/cuenta-semana`); await page.reload(); await page.waitForTimeout(4200);
ok('Mi semana tells a customer without a plan to build their order first', await page.$eval('[data-page="pg/cuenta-semana"] [data-mw-buy]', (e) => !e.hidden && /pedido/.test(e.querySelector('a').getAttribute('href'))));
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });


// =====================================================================  v30: admin "Descuentos" (generate a code that works X times) + cart discount field
{
  await page.goto(`${URL0}#/home`); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('kx-lang', 'es'); sessionStorage.setItem('kx_ob_asked', '1'); sessionStorage.setItem('kx-admin-key', 'adm'); }); await page.reload(); await page.waitForTimeout(4200);
  const calls = []; let created = false;
  await page.route('https://script.example/**', async (route) => {
    const u = new URL(route.request().url()), q = Object.fromEntries(u.searchParams); calls.push(q);
    let body = { ok: true };
    if (q.action === 'discount_new') { created = true; body = { ok: true, code: q.code }; }
    else if (q.action === 'discounts') body = { ok: true, discounts: created ? [{ id: 'gid://shopify/DiscountCodeNode/9', code: 'HOLA10', status: 'ACTIVE', uses: 4, limit: 25, kind: 'percent', value: 10, ends: '' }] : [] };
    else if (q.action === 'admin') body = { ok: true, orders: [], clients: [], recipes: null };
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  await page.evaluate(() => { try { sessionStorage.setItem('kx-admin-key', 'adm'); } catch (e) {} const d = document.createElement('div'); d.id = 'adm-test'; d.setAttribute('data-endpoint', 'https://script.example/exec'); d.setAttribute('data-lang', 'es'); document.body.appendChild(d); window.KXAdmin.mount(d); });
  await page.waitForSelector('#adm-test [data-tab="4"]', { timeout: 8000 }).catch(async () => { ok('admin: Descuentos test panel rendered', false, (await page.evaluate(() => (document.querySelector('#adm-test') || { innerHTML: 'no element' }).innerHTML.slice(0, 200))) + ' | key=' + (await page.evaluate(() => sessionStorage.getItem('kx-admin-key')))); });
  await page.click('#adm-test [data-tab="4"]', { timeout: 3000 }).catch(() => {}); await page.waitForTimeout(400);
  ok('admin: the Descuentos tab shows the form (code, type, value, uses, expiry) and "no codes yet"', await page.evaluate(() => { const r = document.querySelector('#adm-test'); const f = r.querySelector('[data-discform]'); return !!f && ['code', 'kind', 'value', 'uses', 'ends'].every((n) => f.elements[n]) && /Aún no hay códigos/.test(r.innerText); }));
  await page.click('#adm-test [data-dgen]', { timeout: 3000 }).catch(() => {});
  ok('admin: "Sugerir código" fills a valid code', /^KUL[A-Z2-9]{5}$/.test(await page.$eval('#adm-test [name=code]', (e) => e.value).catch(() => '')));
  await page.fill('#adm-test [name=code]', 'hola10'); await page.fill('#adm-test [name=value]', '10'); await page.fill('#adm-test [name=uses]', '0'); await page.click('#adm-test [data-discform] button[type=submit]'); await page.waitForTimeout(200);
  ok('admin: 0 uses is refused in the page and never reaches the server', !calls.some((c) => c.action === 'discount_new') && /cuántas veces/.test(await page.$eval('#adm-test', (e) => e.innerText)));
  await page.fill('#adm-test [name=code]', 'hola10'); await page.fill('#adm-test [name=value]', '10'); await page.fill('#adm-test [name=uses]', '25'); await page.click('#adm-test [data-discform] button[type=submit]'); await page.waitForTimeout(500);
  const dn = calls.find((c) => c.action === 'discount_new');
  ok('admin: creating sends code, percent, value and the number of uses with the password', dn && dn.code === 'HOLA10' && dn.kind === 'percent' && dn.value === '10' && dn.uses === '25' && dn.key === 'adm', JSON.stringify(dn));
  ok('admin: the new code appears in the list with its uses (4 / 25) and a deactivate button', await page.evaluate(() => { const t = document.querySelector('#adm-test [data-disctable]'); return !!t && /HOLA10/.test(t.innerText) && /4 \/ 25/.test(t.innerText) && !!t.querySelector('[data-doff]') && /Código creado: HOLA10/.test(document.querySelector('#adm-test').innerText); }));
  await page.click('#adm-test [data-doff]'); await page.waitForTimeout(400);
  ok('admin: deactivating calls discount_off for that code', calls.some((c) => c.action === 'discount_off' && /DiscountCodeNode\/9/.test(c.id)));
  await page.unroute('https://script.example/**'); await page.evaluate(() => document.getElementById('adm-test').remove());
  await page.goto(`${URL0}#/carrito`); await page.waitForTimeout(400);
  ok('cart: a separate discount-code field named "discount" (Shopify applies it at checkout) next to the referral code', await page.evaluate(() => { const c = document.querySelector('[data-page="carrito"]'); const d = c.querySelector('input[name="discount"]'); return !!d && d.id !== c.querySelector('[data-referral]').id && !!c.querySelector('[data-referral]'); }));
}


// =====================================================================  v33: dish detail panel + plan links of the plans page
{
  await page.goto(`${URL0}#/home`); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('kx-lang', 'es'); localStorage.setItem('kx-test-orders', '0'); sessionStorage.setItem('kx_ob_asked', '1'); sessionStorage.setItem('kx-seen', '1'); }); await page.reload(); await page.waitForTimeout(900);
  await page.goto(`${URL0}#/menu`); await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('[data-page="menu"] .dish__media').click()); await page.waitForTimeout(600);
  ok('dish panel: clicking a menu card opens the side panel (no page change) with photo, description, nutrition, ingredients and allergens', await page.evaluate(() => { const p = document.querySelector('[data-dish-panel]'); const c = p.querySelector('[data-dp-content]'); return !p.hidden && location.hash === '#/menu' && !!c.querySelector('.dd__media img') && c.querySelector('.dd__title').textContent.trim().length > 3 && c.querySelectorAll('.dd__nutri div').length >= 4 && /kcal/.test(c.querySelector('.dd__nutri').textContent) && c.querySelectorAll('.dd__h').length >= 3 && !!document.querySelector('[data-dp-full]').getAttribute('href'); }));
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  ok('dish panel: Escape closes it', await page.$eval('[data-dish-panel]', (p) => p.hidden));
}


// =====================================================================  v34: header account menu, own account page, clear cart
{
  await page.goto(`${URL0}#/home`); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('kx-lang', 'es'); localStorage.setItem('kx-test-orders', '0'); sessionStorage.setItem('kx_ob_asked', '1'); sessionStorage.setItem('kx-seen', '1'); }); await page.reload(); await page.waitForTimeout(900);
  ok('header: one account circle with the customer initial; no separate "Mi cuenta" link, language switch or cart icon in the bar', await page.evaluate(() => { const h = document.querySelector('[data-page="home"] .site-header') || document.querySelector('.site-header'); const b = h.querySelector('.acct__btn'); return !!b && /^[A-Z]$/.test(b.textContent.replace(/\d+/g, '').trim()) && !h.querySelector('.header-login') && !h.querySelector('.header-actions > .icon-link') && !h.querySelector('.header-actions > .lang'); }));
  await page.evaluate(() => document.querySelector('.site-header .acct__btn').click()); await page.waitForTimeout(300);
  ok('header menu: shows who is signed in (name + email), shortcuts, language, cart summary and sign out', await page.evaluate(() => { const p = document.querySelector('.site-header [data-acct-pop]'); return !p.hidden && /@/.test(p.querySelector('.acct__mail').textContent) && p.querySelectorAll('.acct__links a').length >= 5 && p.querySelectorAll('.lang__btn').length === 2 && !!p.querySelector('.acct__cart') && !!p.querySelector('.acct__out'); }));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok('header menu: Escape closes it', await page.$eval('.site-header [data-acct-pop]', (p) => p.hidden));
  await page.goto(`${URL0}#/cuenta`); await page.waitForTimeout(500);
  ok('account page is our own: greeting with the name, the e-mail signed in, sign out, tiles and the order list (no Shopify page)', await page.evaluate(() => { const p = document.querySelector('[data-page="cuenta"]'); return /Hola/.test(p.querySelector('h2').textContent) && /@/.test(p.innerText) && p.querySelectorAll('.hub__card').length >= 4 && !!p.querySelector('table.acct-orders, .text-muted'); }));
  await page.goto(`${URL0}#/carrito`); await page.waitForTimeout(400);
  ok('cart: has a "Vaciar carrito" button', await page.$eval('[data-page="carrito"]', (c) => !!c.querySelector('[data-cart-clear]')));
  const G2 = URL0.replace('index.html', 'guest.html');
  await page.goto(`${G2}#/home`); await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('.site-header .acct__btn').click()); await page.waitForTimeout(300);
  ok('signed out: the header circle opens sign in / create account, language and cart (no initial, no logout)', await page.evaluate(() => { const p = document.querySelector('.site-header [data-acct-pop]'); return !p.hidden && !!p.querySelector('.acct__guest a.btn--gold') && !p.querySelector('.acct__out') && p.querySelectorAll('.lang__btn').length === 2; }));
  await page.goto(`${URL0}#/home`); await page.waitForTimeout(300);
}


// =====================================================================  v35: allergy / dislike detection (any language) and the profile gate before paying
{
  const setProfile = async (prof) => { await page.goto(`${URL0}#/home`); await page.evaluate((pf) => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('kx-lang', 'es'); localStorage.setItem('kx-test-orders', '0'); localStorage.setItem('kulinaria_onboarded', '1'); sessionStorage.setItem('kx_ob_asked', '1'); sessionStorage.setItem('kx-seen', '1'); localStorage.setItem('kulinaria_profile', JSON.stringify(pf)); }, prof); await page.goto(`${URL0}#/menu`); await page.reload(); await page.waitForTimeout(1200); };
  const warned = async () => { await page.waitForTimeout(350); return page.$$eval('[data-page="menu"] [data-dish].is-warned', (c) => c.map((x) => x.querySelector('.dish__title').textContent.trim())); };
  const compat = (title) => page.evaluate((t) => { const d = [...document.querySelectorAll('[data-page="menu"] [data-dish]')].find((x) => x.querySelector('.dish__title').textContent.trim() === t); return d ? d.querySelector('[data-compat]').textContent : ''; }, 'Filete Prime con verduras asadas');
  await setProfile({ allergies: ['nuts'], dislikes: [], diets: [] });
  ok('allergy typed in English ("nuts") flags the dish with almonds', (await warned()).some((t) => /salm/i.test(t)), JSON.stringify(await warned()));
  await setProfile({ allergies: ['peanuts'], dislikes: [], diets: [] });
  ok('a peanut allergy does not flag dishes that have no peanuts (almond is not peanut)', (await warned()).length === 0, JSON.stringify(await warned()));
  await setProfile({ allergies: ['fish'], dislikes: [], diets: [] });
  ok('a fish allergy ("fish") flags the salmon dish', (await warned()).some((t) => /salm/i.test(t)), JSON.stringify(await warned()));
  await setProfile({ allergies: ['Mariscos'], dislikes: [], diets: [] });
  ok('a shellfish allergy ("Mariscos") does not flag the salmon (fish is a separate allergy)', !(await warned()).some((t) => /salm/i.test(t)));
  await setProfile({ allergies: [], dislikes: ['broccoli'], diets: [] });
  ok('a dislike typed in English ("broccoli") lowers the match of the dish that has Brócoli', /[0-9]/.test(await compat()) && !/100/.test(await compat()), await compat());
  ok('the dislike warning names the ingredient the same way the allergy one does, with no stray HTML codes', await page.evaluate(() => { const t = [...document.querySelectorAll('[data-page="menu"] [data-dish] [data-fn-warn]')].map((e) => e.textContent).filter(Boolean); return t.length > 0 && t.every((x) => !/&quot;|&amp;|&#/.test(x)) && t.some((x) => /Br[oó]coli \(no te gusta\)|Broccoli \(you dislike it\)/i.test(x)); }));
  await page.evaluate(() => { localStorage.removeItem('kulinaria_onboarded'); localStorage.setItem('kx-test-fresh', '1'); sessionStorage.setItem('kx_ob_asked', '1'); }); await page.goto(`${URL0}#/carrito`); await page.reload(); await page.waitForTimeout(900);
  await page.check('[data-page="carrito"] [data-contract]', { timeout: 4000 }).catch(() => {});
  ok('a new account that has not confirmed its allergy profile cannot pay yet and is sent to complete it', await page.evaluate(() => { const c = document.querySelector('[data-page="carrito"]'); return c.querySelector('[data-checkout]').disabled && !c.querySelector('[data-cart-profile]').hidden && /bienvenida/.test(c.querySelector('[data-cart-profile] a').getAttribute('href')); }));
  await page.evaluate(() => { localStorage.setItem('kulinaria_onboarded', '1'); localStorage.removeItem('kx-test-fresh'); });
}


// =====================================================================  v39: family members, "for whom", fresh list after the cart is emptied, account nav
{
  await page.goto(`${URL0}#/home`); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('kx-lang', 'es'); localStorage.setItem('kx-test-orders', '0'); localStorage.setItem('kulinaria_onboarded', '1'); sessionStorage.setItem('kx_ob_asked', '1'); sessionStorage.setItem('kx-seen', '1'); }); await page.reload(); await page.waitForTimeout(900);
  await page.goto(`${URL0}#/pg/cuenta-perfil`); await page.reload(); await page.waitForTimeout(1200);
  const pf = '[data-page="pg/cuenta-perfil"]';
  ok('my details page: shows the profile editor and a summary card, not a redirect', await page.evaluate((s) => { const r = document.querySelector(s); return !!r.querySelector('[data-profile-form]') && !!r.querySelector('[data-hub-profile]') && !!r.querySelector('[data-pe-open]') && r.querySelector('[data-person-editor]').hidden; }, pf));
  await page.evaluate((s) => document.querySelector(s + ' [data-pe-open]').click(), pf); await page.waitForTimeout(200);
  ok('family: "add person" opens the SAME questionnaire as for the account holder (allergy checklist, other allergies, dislikes, diets)', await page.evaluate((s) => { const e = document.querySelector(s + ' [data-person-editor]'); return !e.hidden && e.querySelectorAll('[data-pe-allergy]').length >= 4 && !!e.querySelector('[data-pe-other]') && !!e.querySelector('[data-pe-tag-input]') && e.querySelectorAll('[data-pe-diet]').length >= 4 && e.querySelectorAll('[data-pe-suggest]').length >= 3; }, pf));
  await page.fill(`${pf} [data-pe-name]`, 'Sofía');
  await page.evaluate((s) => { document.querySelector(s + ' [data-pe-allergy][value="Mariscos"]').click(); document.querySelector(s + ' [data-pe-diet][value="Vegetariano"]').click(); }, pf);
  await page.fill(`${pf} [data-pe-other]`, 'peanuts'); await page.fill(`${pf} [data-pe-tag-input]`, 'broccoli'); await page.press(`${pf} [data-pe-tag-input]`, 'Enter');
  await page.evaluate((s) => document.querySelector(s + ' [data-pe-suggest]').click(), pf);
  await page.evaluate((s) => document.querySelector(s + ' [data-pe-save]').click(), pf); await page.waitForTimeout(300);
  ok('family: saving stores the person with their own allergies, dislikes and diets (no second account) and lists them with chips', await page.evaluate((s) => { const pr = JSON.parse(localStorage.getItem('kulinaria_profile') || '{}'); const x = (pr.people || [])[0]; const li = document.querySelector(s + ' [data-people-list] li'); return !!x && x.name === 'Sofía' && x.allergies.length === 2 && x.allergies.indexOf('Mariscos') > -1 && x.dislikes[0] === 'broccoli' && x.dislikes.length === 2 && x.diets[0] === 'Vegetariano' && /Sofía/.test(li.textContent) && li.querySelectorAll('.pchip').length >= 5 && document.querySelector(s + ' [data-person-editor]').hidden; }, pf));
  await page.evaluate((s) => [...document.querySelectorAll(s + ' [data-people-list] li button')][0].click(), pf); await page.waitForTimeout(200);
  ok('family: a person can be edited again (the form opens filled in)', await page.evaluate((s) => { const e = document.querySelector(s + ' [data-person-editor]'); return !e.hidden && e.querySelector('[data-pe-name]').value === 'Sofía' && e.querySelector('[data-pe-allergy][value="Mariscos"]').checked && e.querySelector('[data-pe-other]').value === 'peanuts'; }, pf));
  await page.evaluate((s) => document.querySelector(s + ' [data-pe-cancel]').click(), pf);
  await page.evaluate(() => { localStorage.removeItem('kx-test-nostart'); localStorage.removeItem('kx-test-norules'); localStorage.setItem('kx-rules-ok', '1'); sessionStorage.setItem('kx-test-start', '1'); });
  // fresh list after the order was sent and the cart is empty
  await page.evaluate(() => { const f = JSON.parse(localStorage.getItem('kulinaria_funnel') || '{}'); f.v = 2; f.days = ['1', '', '', '', '']; f.qty = { 1: 1 }; f.sent = true; localStorage.setItem('kulinaria_funnel', JSON.stringify(f)); });
  await page.route('**/cart.js', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ item_count: 0, items: [], total_price: 0 }) }));
  await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(1500);
  ok('after the order went to the cart and the cart was emptied, the order builder starts from a fresh list', await page.evaluate(() => { const f = JSON.parse(localStorage.getItem('kulinaria_funnel') || '{}'); return (f.days || []).filter(Boolean).length === 0 && !f.sent; }));
  await page.unroute('**/cart.js');
  await page.goto(`${URL0}#/cuenta-semana`); await page.waitForTimeout(300);
  await page.goto(`${URL0}#/pg/cuenta-semana`); await page.waitForTimeout(500);
  ok('account navigation is short: summary, my week, pause, my details (the empty sub-pages are cards on the summary)', await page.$$eval('[data-page="pg/cuenta-semana"] .account-nav a', (a) => a.length <= 5));
}


// =====================================================================  v43: admin "Finanzas" (income, expenses, profit) and the test order button
{
  await page.goto(`${URL0}#/home`); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('kx-lang', 'es'); sessionStorage.setItem('kx_ob_asked', '1'); sessionStorage.setItem('kx-seen', '1'); sessionStorage.setItem('kx-admin-key', 'adm'); }); await page.reload(); await page.waitForTimeout(900);
  const nowD = new Date(), iso = (d) => d.toISOString();
  const fin = { orders: [ { id: '1', name: '#1001', date: iso(nowD), customer: 'Ana Pérez', para: '', total: 3600, paid: true, kind: 'plan', test: false }, { id: '1-2', name: '#1001', date: iso(nowD), customer: 'Ana Pérez', para: 'Sofía', total: 1000, paid: true, kind: 'plan', test: false }, { id: '2', name: '#1002', date: iso(nowD), customer: 'Ana Pérez', para: '', total: 210, paid: true, kind: 'upgrade', test: false }, { id: '3', name: '#1003', date: iso(nowD), customer: 'Luis', para: '', total: 900, paid: false, kind: 'plan', test: false } ], expenses: [] };
  const fcalls = [];
  await page.route('https://script.example/**', async (route) => {
    const u = new URL(route.request().url()), q = Object.fromEntries(u.searchParams); fcalls.push(q); let body = { ok: true };
    if (q.action === 'admin') body = { ok: true, orders: [], clients: [], recipes: null, finance: fin };
    else if (q.action === 'expense_new') { fin.expenses = [{ date: q.date, concept: q.concept, cat: q.cat, amount: Number(q.amount), id: 'g1' }]; body = { ok: true, expenses: fin.expenses }; }
    else if (q.action === 'expense_del') { fin.expenses = []; body = { ok: true, expenses: [] }; }
    else if (q.action === 'sample_order') body = { ok: true, name: '#PRUEBA-1234' };
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  await page.evaluate(() => { const d = document.createElement('div'); d.id = 'adm-fin'; d.setAttribute('data-endpoint', 'https://script.example/exec'); d.setAttribute('data-lang', 'es'); document.body.appendChild(d); window.KXAdmin.mount(d); });
  await page.waitForSelector('#adm-fin [data-tab="5"]', { timeout: 8000 }); await page.click('#adm-fin [data-tab="5"]'); await page.waitForTimeout(300);
  ok('finance tab: income (paid), plans, upgrades, to collect, expenses and profit for the month', await page.evaluate(() => { const k = document.querySelector('#adm-fin [data-fin-kpis]').innerText.replace(/\s+/g, ' '); return /Ingresos/.test(k) && /4,810/.test(k) && /1,?000|4,600|3,?600/.test(k) && /210/.test(k) && /900/.test(k); }), await page.evaluate(() => document.querySelector('#adm-fin [data-fin-kpis]').innerText.replace(/\s+/g, ' ')));
  ok('finance tab: lists every order with who it is for and its type', await page.evaluate(() => { const t = document.querySelector('#adm-fin [data-fin-orders]').innerText; return /Sofía/.test(t) && /Mejoras/.test(t) && /#1003/.test(t); }));
  await page.fill('#adm-fin [name=concept]', 'Compra de proteínas'); await page.fill('#adm-fin [name=amount]', '1500'); await page.click('#adm-fin [data-expform] button[type=submit]'); await page.waitForTimeout(400);
  ok('finance tab: an expense is saved and the profit is income minus expenses (4,810 − 1,500 = 3,310)', await page.evaluate(() => /3,310/.test(document.querySelector('#adm-fin [data-fin-kpis]').innerText) && /Compra de proteínas/.test(document.querySelector('#adm-fin [data-fin-exp]').innerText)), JSON.stringify(fcalls.filter((c) => c.action === 'expense_new')));
  await page.click('#adm-fin [data-sample="new"]'); await page.waitForTimeout(500);
  ok('finance tab: the test order button creates a fictitious order and reloads the data', fcalls.some((c) => c.action === 'sample_order') && fcalls.filter((c) => c.action === 'admin').length >= 2);
  await page.unroute('https://script.example/**'); await page.evaluate(() => document.getElementById('adm-fin').remove());
}


// =====================================================================  v45: admin "Entregas" (calendar with a dot per delivery day) and the explicit order list
{
  const K2 = require(path.join(ROOT, 'assets/kulinaria-admin.js'));
  const ords = [{ id: '1', name: '#1001', date: '2026-11-04T12:00:00Z', holder: 'Ana Pérez', customer: 'Ana Pérez', para: '', phone: '999 111', address: 'Calle Lago 24, Mérida', allergies: 'Mariscos', dislikes: 'brócoli', paid: true, plan: 'block', total: 3600, items: [{ title: 'Pollo', qty: 2 }],
      weeks: [{ week: '2026-11-09', slots: ['Pollo', '', 'Bowl', '', ''], src: 'pedido' }, { week: '2026-11-16', slots: ['Pollo', '', 'Bowl', '', ''], src: 'automática' }], paused: [] },
    { id: '1-2', name: '#1001', date: '2026-11-04T12:00:00Z', holder: 'Ana Pérez', customer: 'Ana Pérez · Sofía', para: 'Sofía', phone: '999 111', address: 'Calle Lago 24, Mérida', allergies: 'Cacahuate', dislikes: '', paid: true, plan: 'trial', total: 1000, items: [{ title: 'Bowl', qty: 1 }], weeks: [{ week: '2026-11-09', slots: ['Bowl', '', '', '', ''], src: 'pedido' }], paused: [] },
    { id: '9', name: '#9', date: '2026-11-04T12:00:00Z', holder: 'Luis', customer: 'Luis', para: '', phone: '', address: 'X', allergies: '', dislikes: '', paid: false, plan: 'trial', total: 1000, items: [], weeks: [{ week: '2026-11-09', slots: ['Pollo', '', '', '', ''], src: 'pedido' }], paused: [] }];
  const by = K2.deliveriesByDate(ords);
  ok('deliveries by day: a meal on each ordered weekday, per person (Monday 9 has two: Ana and Sofía), empty days and unpaid orders excluded', Object.keys(by).sort().join() === '2026-11-09,2026-11-11,2026-11-16,2026-11-18' && by['2026-11-09'].length === 2 && by['2026-11-09'].some((x) => x.who === 'Sofía' && x.allergies === 'Cacahuate') && by['2026-11-11'][0].dish === 'Bowl', JSON.stringify(Object.keys(by)));
  await page.goto(`${URL0}#/home`); await page.evaluate(() => { sessionStorage.setItem('kx-admin-key', 'adm'); }); await page.reload(); await page.waitForTimeout(900);
  await page.route('https://script.example/**', async (route) => { const q = Object.fromEntries(new URL(route.request().url()).searchParams); const body = q.action === 'admin' ? { ok: true, orders: ords, clients: [], recipes: null, finance: { orders: [], expenses: [] } } : { ok: true }; await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) }); });
  await page.evaluate(() => { const d = document.createElement('div'); d.id = 'adm-del'; d.setAttribute('data-endpoint', 'https://script.example/exec'); d.setAttribute('data-lang', 'es'); document.body.appendChild(d); window.KXAdmin.mount(d); });
  await page.waitForSelector('#adm-del [data-tab="6"]', { timeout: 8000 });
  for (let i = 0; i < 24 && !/noviembre 2026/i.test(await page.$eval('#adm-del .adm-nav b', (e) => e.textContent)); i++) { const cur = await page.$eval('#adm-del .adm-nav b', (e) => e.textContent); const yr = parseInt(cur.slice(-4), 10); await page.click(`#adm-del [data-m="${yr < 2026 ? 1 : -1}"]`); await page.waitForTimeout(80); }
  await page.click('#adm-del [data-kpi-orders]'); await page.waitForTimeout(250);
  ok('summary: the orders counter counts ORDERS (2: #1001 for Ana and Sofía is one order, plus #9), and a family order is shown as one block with its people', await page.evaluate(() => document.querySelector('#adm-del [data-kpi-orders] b').textContent.trim() === '2' && document.querySelectorAll('#adm-del [data-month-orders] .adm-ordergroup').length === 1));
  ok('summary: clicking "Pedidos del mes" opens the orders of the month with who ordered and exactly what (2× Pollo...)', await page.evaluate(() => { const t = (document.querySelector('#adm-del [data-month-orders]') || { innerText: '' }).innerText; return /Ana Pérez/.test(t) && /2× Pollo/.test(t) && /Sofía/.test(t) && /Calle Lago 24/.test(t); }));
  await page.click('#adm-del [data-tab="3"]'); await page.waitForTimeout(300);
  ok('orders tab: the person (bold), who the account is, contact, address, allergies, what was ordered and the dish of each weekday, week by week', await page.evaluate(() => { const t = document.querySelector('#adm-del [data-orders-list]').innerText; return /Ana Pérez/.test(t) && /Sofía/.test(t) && /999 111/.test(t) && /Calle Lago 24/.test(t) && /Mariscos/.test(t) && /Lun/.test(t) && /Mié/.test(t) && /Bowl/.test(t) && !!document.querySelector('#adm-del .adm-order__who'); }));
  await page.click('#adm-del [data-tab="6"]'); await page.waitForTimeout(300);
  const calOk = await page.evaluate(() => ({ cal: !!document.querySelector('#adm-del [data-cal]'), dots: document.querySelectorAll('#adm-del .adm-day[data-has]').length }));
  ok('deliveries tab: a calendar with a dot under every day that has deliveries', calOk.cal);
  await page.evaluate(() => { const d = new Date(); });
  // go to November 2026 (the data) whatever today is
  const nowM = await page.evaluate(() => document.querySelector('#adm-del .adm-nav b').textContent);
  for (let i = 0; i < 24 && !/noviembre 2026/i.test(await page.$eval('#adm-del .adm-nav b', (e) => e.textContent)); i++) { const cur = await page.$eval('#adm-del .adm-nav b', (e) => e.textContent); const yr = parseInt(cur.slice(-4), 10); await page.click(`#adm-del [data-m="${yr < 2026 ? 1 : -1}"]`); await page.waitForTimeout(80); }
  await page.waitForTimeout(200);
  ok('deliveries tab: November shows dots on 9, 11, 16 and 18 only', await page.evaluate(() => [...document.querySelectorAll('#adm-del .adm-day[data-has]')].map((b) => b.getAttribute('data-eday').slice(-2)).join() === '09,11,16,18'));
  await page.click('#adm-del [data-eday="2026-11-09"]'); await page.waitForTimeout(250);
  ok('deliveries tab: a day lists each stop with the person, address, phone, dishes and allergies, plus what to cook that day', await page.evaluate(() => { const t = document.querySelector('#adm-del [data-eday-detail]').innerText; return /Sofía/.test(t) && /Ana Pérez/.test(t) && /Calle Lago 24/.test(t) && /999 111/.test(t) && /Cacahuate/.test(t) && /Mariscos/.test(t) && /2 comidas/.test(t) && /Pollo ×1/.test(t) && /Bowl ×1/.test(t); }));
  await page.unroute('https://script.example/**'); await page.evaluate(() => document.getElementById('adm-del').remove());
}




// =====================================================================  v48: requests tab in the admin, ambassador page in one piece, author signature
{
  await page.goto(`${URL0}#/home`); await page.evaluate(() => { sessionStorage.setItem('kx-admin-key', 'adm'); }); await page.reload(); await page.waitForTimeout(900);
  const leads = [{ id: 'l1', date: '2026-11-05T12:00:00Z', kind: 'embajador', name: 'Coach Pablo', email: 'pablo@gym.com', phone: '999 000 1111', detail: 'Código deseado: PABLOFIT\nTengo 40 alumnos', status: 'Nueva' }, { id: 'l2', date: '2026-11-04T12:00:00Z', kind: 'carta', name: 'María', email: 'maria@x.com', phone: '', detail: 'Invitados: 8', status: 'En proceso' }];
  const lcalls = [];
  await page.route('https://script.example/**', async (route) => { const q = Object.fromEntries(new URL(route.request().url()).searchParams); lcalls.push(q); const body = q.action === 'admin' ? { ok: true, orders: [], clients: [], recipes: null, finance: { orders: [], expenses: [] }, leads } : q.action === 'lead_status' ? { ok: true, leads } : { ok: true, discounts: [] }; await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) }); });
  await page.evaluate(() => { const d = document.createElement('div'); d.id = 'adm-lead'; d.setAttribute('data-endpoint', 'https://script.example/exec'); d.setAttribute('data-lang', 'es'); document.body.appendChild(d); window.KXAdmin.mount(d); });
  await page.waitForSelector('#adm-lead [data-tab="7"]', { timeout: 8000 }); await page.click('#adm-lead [data-tab="7"]'); await page.waitForTimeout(300);
  ok('admin "Solicitudes": every request shows who, type, e-mail/phone/WhatsApp link, what they asked and a state selector', await page.evaluate(() => { const t = document.querySelector('#adm-lead [data-leads]').innerText; return /Coach Pablo/.test(t) && /Embajador/.test(t) && /PABLOFIT/.test(t) && /Evento/.test(t) && !!document.querySelector('#adm-lead a[href^="https://wa.me/52999"]') && document.querySelectorAll('#adm-lead [data-lead-state]').length === 2; }));
  await page.selectOption('#adm-lead [data-lead-state="l1"]', 'Atendida'); await page.waitForTimeout(300);
  ok('changing the state of a request is saved through the script', lcalls.some((c) => c.action === 'lead_status' && c.id === 'l1' && c.status === 'Atendida'));
  await page.click('#adm-lead [data-lead-code]'); await page.waitForTimeout(300);
  ok('"Crear código de descuento" on an ambassador request opens the discount form with a suggested code', await page.evaluate(() => /COACHPABLO/.test(document.querySelector('#adm-lead [data-discform] [name=code]').value)));
  await page.unroute('https://script.example/**'); await page.evaluate(() => document.getElementById('adm-lead').remove());
  await page.goto(`${URL0}#/pg/embajadores`); await page.waitForTimeout(400);
  ok('ambassador page: one page with the code/credits card, the rules (FAQ) and the request form (no separate rules / request pages)', await page.evaluate(() => { const p = document.querySelector('[data-page="pg/embajadores"]'); return !!p.querySelector('.hub__card') && !!p.querySelector('.accordion') && !!p.querySelector('form') && p.querySelectorAll('.accordion details').length >= 6; }));
  ok('the author signature is switched off for now (it can be turned on in the theme settings)', await page.evaluate(() => !document.querySelector('.footer-credit')));
  ok('contact forms hand a copy to the sheet (lead wrapper with the endpoint)', await page.evaluate(() => { const w = document.querySelector('[data-page="pg/embajadores"] [data-lead-wrap]'); return !!w && w.getAttribute('data-kind') === 'embajador'; }));
}



// =====================================================================  v110: the new order flow (sign in -> plan + diet -> your week)
{
  const FN = '[data-page="pg/pedido"] [data-funnel]';
  const G2 = URL0.replace('index.html', 'guest.html');
  const base = async (opts = {}) => {
    await page.evaluate((o) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('kx-lang', 'es'); sessionStorage.setItem('kx-seen', '1'); localStorage.setItem('kx-test-orders', '0');
      localStorage.setItem('kx_dietpick', 'all'); sessionStorage.setItem('kx_newplan', '1');
      if (!o.guest) localStorage.setItem('kulinaria_onboarded', '1'); else localStorage.setItem('kx-test-guide', '1');
      if (o.profile) localStorage.setItem('kulinaria_profile', JSON.stringify(o.profile));
      if (o.funnel) localStorage.setItem('kulinaria_funnel', JSON.stringify(Object.assign({ v: 2 }, o.funnel)));
    }, opts);
  };
  const open = async (guest) => { await page.goto(`${guest ? G2 : URL0}#/pg/pedido`); await page.reload(); await page.waitForTimeout(1300); };
  const names = () => page.evaluate((f) => [...document.querySelector(f).querySelectorAll('.fn-wk__card')].map((c) => (c.querySelector('.fn-wk__name') || {}).textContent || '-'), FN);
  const chooseDiet = async (cat) => { await page.evaluate(({ f, cat }) => document.querySelector(f + ' [data-cat-choice="' + cat + '"]').click(), { f: FN, cat }); await page.waitForTimeout(150); await page.evaluate((f) => document.querySelector(f + ' [data-fn-go-next]').click(), FN); await page.waitForTimeout(800); };
  const KETO = ['Pollo a las hierbas con puré rústico', 'Salmón gourmet en costra de almendras', 'Pollo a las hierbas con puré rústico', 'Salmón gourmet en costra de almendras', 'Filete Prime con verduras asadas'];

  // ---- signed out: the first step is the sign-in screen
  await page.setViewportSize({ width: 1440, height: 860 });
  await base({ guest: true }); await open(true);
  const g = await page.evaluate((f) => { const h = document.querySelector(f), s = h.querySelector('.fn-start'); const dots = [...h.querySelectorAll('[data-fn-dot]')].filter((d) => getComputedStyle(d).display !== 'none'); return { step: h.getAttribute('data-step'), start: !!s && s.offsetParent !== null, btn: (s.querySelector('.fn-start__btn') || {}).getAttribute && s.querySelector('.fn-start__btn').getAttribute('href'), txt: s.innerText, dots: dots.length, title: getComputedStyle(h.querySelector('.funnel__title')).display }; }, FN);
  ok('signed out: step 1 is the sign-in screen (nothing else can be opened first)', g.step === '0' && g.start, JSON.stringify([g.step, g.start]));
  ok('signed out: one button, "Iniciar sesión", that leads to login / create account', /login|register|account/.test(g.btn || '') && /iniciar sesi[oó]n/i.test(g.txt), g.btn);
  ok('signed out: the pitch shows $180 a day, the 4-week block ($900 a week) and the 1-week trial per day with its +15% rate', /180/.test(g.txt) && /900/.test(g.txt) && /207/.test(g.txt) && /15%/.test(g.txt), g.txt.replace(/\s+/g, ' ').slice(0, 220));
  const cnt = await page.evaluate((f) => { const h = document.querySelector(f), c = h.querySelector('[data-fn-stepcount]'); return { txt: c.textContent, vis: c.offsetParent !== null, pills: getComputedStyle(h.querySelector('.steps__nav')).display, bar: getComputedStyle(h.querySelector('.funnel__bar')).display }; }, FN);
  ok('the step indicator is the counter "Paso 1 de 3" with a slim progress line (no pills) and there is no "4 pasos" headline', /1\D+3/.test(cnt.txt) && cnt.vis && cnt.pills === 'none' && cnt.bar !== 'none' && g.title === 'none', JSON.stringify(cnt));

  // ---- signed in: the sign-in step is skipped, plan + diet first
  await base(); await open(false);
  const s1 = await page.evaluate((f) => { const h = document.querySelector(f); const cards = [...h.querySelectorAll('[data-cat-choice]')]; return { step: h.getAttribute('data-step'), n: cards.length, svg: cards.every((c) => !!c.querySelector('svg path, svg circle, svg rect')), ids: cards.map((c) => c.getAttribute('data-cat-choice')).join(), disabled: h.querySelector('[data-fn-go-next]').disabled, plans: [...h.querySelectorAll('[data-plan-choice]')].map((p) => p.innerText.replace(/\s+/g, ' ')), rail: getComputedStyle(h.querySelector('[data-fn-cats]')).overflowX, side: document.documentElement.scrollWidth <= innerWidth + 1 }; }, FN);
  ok('signed in: the builder opens on "plan and diet" (the sign-in step is not shown)', s1.step === '1', s1.step);
  ok('the diet carousel offers every menu category (12) plus "no preference", each with its own icon, and it scrolls sideways', s1.n === 13 && s1.svg && s1.rail === 'auto' && /keto-low-carb/.test(s1.ids) && /junior/.test(s1.ids) && /desayunos/.test(s1.ids) && /snacks-postres/.test(s1.ids), JSON.stringify([s1.n, s1.svg, s1.rail]));
  ok('Continue stays disabled until a diet is chosen', s1.disabled === true);
  ok('the plan cards show $180 a day / $900 a week for 4 weeks and $207 a day / $1,035 for the 1-week trial', /180/.test(s1.plans[0]) && /900/.test(s1.plans[0]) && /207/.test(s1.plans[1]) && /1,035/.test(s1.plans[1]), s1.plans.join(' || '));

  // ---- the default menu is fixed per category and the same for everybody
  await chooseDiet('keto-low-carb');
  const w1 = await page.evaluate((f) => { const h = document.querySelector(f); return { step: h.getAttribute('data-step'), filled: h.querySelectorAll('.fn-wk__slot:not(.is-empty)').length, total: (h.querySelector('[data-fn-s-total]') || {}).textContent, stepcount: (h.querySelector('[data-fn-stepcount]') || {}).textContent }; }, FN);
  const nKeto = await names();
  ok('Continue opens "your week" with the five days already filled', w1.step === '3' && w1.filled === 5, JSON.stringify(w1));
  ok('the keto menu is the fixed one from the theme settings (same dishes, Monday to Friday)', nKeto.join('|') === KETO.join('|'), nKeto.join(' | '));
  ok('the total includes the suggested upgrades ($3,600 + $70 + $70 + $210)', /3,950/.test(w1.total || ''), w1.total);
  ok('the stepper reads "Paso 3 de 3"', /3\D+3/.test(w1.stepcount || ''), w1.stepcount);
  await base({ profile: { allergies: ['Pescado'], dislikes: [], people: [] } }); await open(false); await chooseDiet('keto-low-carb');
  const nAllergic = await names(), warn = await page.evaluate((f) => document.querySelector(f).querySelectorAll('.fn-wk__slot.has-warn').length, FN);
  ok('a customer allergic to fish gets the SAME keto menu, with warning icons on the salmon days', nAllergic.join('|') === KETO.join('|') && warn >= 2, warn + ' warnings');
  await base(); await open(false); await chooseDiet('fit-proteina');
  ok('another category has its own fixed menu (high protein starts with the beef bowl and ends with the skirt steak)', /Bowl de res/.test((await names())[0]) && /Arrachera/.test((await names())[4]));

  // ---- upgrade pop-up and swap
  const fridayUp = await page.evaluate((f) => !!document.querySelector(f + ' [data-wk-up="4:0"]'), FN);
  ok('every card has the upgrade button, Friday included', fridayUp && (await page.evaluate((f) => document.querySelectorAll(f + ' .fn-wk__up').length, FN)) === 5);
  await page.evaluate((f) => document.querySelector(f + ' [data-wk-up="0:0"]').click(), FN); await page.waitForTimeout(450);
  const pk = await page.evaluate((f) => { const p = document.querySelector(f + ' [data-fn-picker]'); const vis = [...p.querySelectorAll('[data-fn-dish]:not(.is-hidden)')].filter((c) => c.offsetParent); const r = p.querySelector('.fn-picker__box').getBoundingClientRect(); return { open: !p.hidden, title: p.querySelector('[data-fn-picker-title]').textContent, tiers: [...new Set(vis.map((c) => c.getAttribute('data-tier')))].join(), tabs: [...p.querySelectorAll('[data-pick-tier]')].filter((b) => b.offsetParent).map((b) => b.textContent.replace(/\s+/g, ' ').trim()), fits: r.bottom <= innerHeight + 2 && r.top >= -2 }; }, FN);
  ok('"Elevar nivel" opens a pop-up titled with the day, with Exclusivo / Signature / Reserve tabs and their extra price', pk.open && /Eleva tu experiencia del Lunes/.test(pk.title) && pk.tabs.length === 3 && /\+\$?\s?70/.test(pk.tabs[0]) && /\+\$?\s?140/.test(pk.tabs[1]) && /\+\$?\s?210/.test(pk.tabs[2]), JSON.stringify(pk));
  ok('the upgrade pop-up lists only higher-tier dishes and fits the screen', !/selecto/.test(pk.tiers) && pk.fits, pk.tiers);
  const before = await page.evaluate((f) => ({ total: document.querySelector(f + ' [data-fn-s-total]').textContent }), FN);
  await page.evaluate((f) => { const p = document.querySelector(f + ' [data-fn-picker]'); [...p.querySelectorAll('[data-fn-dish]:not(.is-hidden)')].find((c) => c.offsetParent && c.getAttribute('data-tier') === 'exclusivo').querySelector('[data-pick]').click(); }, FN); await page.waitForTimeout(500);
  const af = await page.evaluate((f) => ({ open: !document.querySelector(f + ' [data-fn-picker]').hidden, tier: document.querySelector(f + ' .fn-wk__card .fn-wk__tier').textContent, total: document.querySelector(f + ' [data-fn-s-total]').textContent }), FN);
  ok('choosing an upgrade closes the pop-up, tags the card with the extra and raises the total by $70', !af.open && /\+\$70/.test(af.tier) && parseFloat(af.total.replace(/[^\d]/g, '')) === parseFloat(before.total.replace(/[^\d]/g, '')) + 70, JSON.stringify([before, af]));
  await page.evaluate((f) => document.querySelector(f + ' [data-wk-swap="1:0"]').click(), FN); await page.waitForTimeout(450);
  const sw = await page.evaluate((f) => { const p = document.querySelector(f + ' [data-fn-picker]'); const vis = [...p.querySelectorAll('[data-fn-dish]:not(.is-hidden)')].filter((c) => c.offsetParent); return { selecto: vis.filter((c) => c.getAttribute('data-tier') === 'selecto').length, all: vis.length, tab: (p.querySelector('[data-pick-tier].is-on') || {}).textContent }; }, FN);
  ok('"Cambiar" lists every dish, base-tier (Selecto) ones included, whatever the diet was', sw.selecto >= 4 && sw.all >= 8, JSON.stringify(sw));
  const cur = (await names())[1];
  await page.evaluate((f) => { const p = document.querySelector(f + ' [data-fn-picker]'); const cur = document.querySelectorAll(f + ' .fn-wk__card')[1].querySelector('.fn-wk__name').textContent; [...p.querySelectorAll('[data-fn-dish]:not(.is-hidden)')].find((c) => c.offsetParent && c.getAttribute('data-tier') === 'selecto' && c.getAttribute('data-title') !== cur).querySelector('[data-pick]').click(); }, FN); await page.waitForTimeout(500);
  ok('swapping replaces only that day and the pop-up closes', (await names())[1] !== cur && (await page.evaluate((f) => document.querySelector(f + ' [data-fn-picker]').hidden, FN)));
  await page.keyboard.press('Escape');

  // ---- two plates a day
  await page.evaluate((f) => document.querySelector(f + ' [data-fn-perday="2"]').click(), FN); await page.waitForTimeout(400);
  ok('2 plates a day: every day gets a second slot (10 slots), the second ones empty', (await page.evaluate((f) => document.querySelectorAll(f + ' .fn-wk__slot').length, FN)) === 10 && (await page.evaluate((f) => document.querySelectorAll(f + ' .fn-wk__slot.is-empty').length, FN)) === 5);
  await page.evaluate((f) => document.querySelector(f + ' [data-wk-swap="0:1"]').click(), FN); await page.waitForTimeout(450);
  ok('the pop-up for a second plate says so', await page.evaluate((f) => /2\.º/.test(document.querySelector(f + ' [data-fn-picker-title]').textContent), FN));
  await page.evaluate((f) => { const p = document.querySelector(f + ' [data-fn-picker]'); [...p.querySelectorAll('[data-fn-dish]:not(.is-hidden)')].find((c) => c.offsetParent && c.getAttribute('data-tier') === 'selecto').querySelector('[data-pick]').click(); }, FN); await page.waitForTimeout(500);
  ok('choosing it fills the second slot of Monday', (await page.evaluate((f) => document.querySelectorAll(f + ' .fn-wk__slot.is-empty').length, FN)) === 4);
  await page.evaluate((f) => document.querySelector(f + ' [data-fn-perday="1"]').click(), FN); await page.waitForTimeout(300);
  ok('back to 1 plate a day: the extra slots disappear', (await page.evaluate((f) => document.querySelectorAll(f + ' .fn-wk__slot').length, FN)) === 5);

  // ---- header: diet chip + deposit / weekly budget, nutrition, clickable step counter
  await base(); await open(false); await chooseDiet('keto-low-carb');
  const hd = await page.evaluate((f) => { const h = document.querySelector(f); return { diet: h.querySelector('[data-fn-diet-name]').textContent, plan: h.querySelector('[data-fn-plan-name]').textContent, up: (h.querySelector('[data-fn-s-up]') || {}).textContent, total: h.querySelector('[data-fn-s-total]').textContent, label: (h.querySelector('.funnel__total span') || {}).textContent, lines: [...h.querySelectorAll('.fn-wk__slot .fn-wk__m')].map((e) => e.textContent), nutri: (h.querySelector('[data-fn-wk-nutri]') || {}).innerText }; }, FN);
  ok('the week header shows the chosen diet and the money model: deposit $3,600 and $900 a week', /Keto/.test(hd.diet) && /3,600/.test(hd.plan) && /900/.test(hd.plan), JSON.stringify([hd.diet, hd.plan]));
  ok('the bar says what is paid today: the deposit plus this week\'s upgrades only (the difference over the weekly budget)', /Depósito/.test(hd.up) && /3,600/.test(hd.up) && /350/.test(hd.up) && /3,950/.test(hd.total) && /Hoy pagas/i.test(hd.label), JSON.stringify([hd.up, hd.total, hd.label]));
  ok('every plate shows its nutrition (kcal, protein, carbs, fat) and the week has a nutrition summary', hd.lines.length === 5 && hd.lines.every((l) => /\d+ kcal · P \d+ · C \d+ · G \d+/.test(l)) && /kcal/i.test(hd.nutri || '') && /Promedio/i.test(hd.nutri || ''), JSON.stringify([hd.lines[0], (hd.nutri || '').replace(/\s+/g, ' ')]));
  await page.evaluate((f) => document.querySelector(f + ' [data-fn-diet-open]').click(), FN); await page.waitForTimeout(250);
  const dmn = await page.evaluate((f) => { const m = document.querySelector(f + ' [data-fn-dietmenu]'), r = m.getBoundingClientRect(); return { open: !m.hidden, n: m.querySelectorAll('[data-fn-diet-pick]').length, on: (m.querySelector('.is-on') || {}).textContent, inScreen: r.right <= innerWidth + 1 && r.bottom <= innerHeight + 40 }; }, FN);
  ok('clicking the diet opens a list of every diet (13), the current one ticked', dmn.open && dmn.n === 13 && /Keto/.test(dmn.on || ''), JSON.stringify(dmn));
  await page.evaluate((f) => document.querySelector(f + ' [data-fn-diet-pick="veggie"]').click(), FN); await page.waitForTimeout(700);
  const nv = await names();
  ok('choosing another diet loads that diet\'s suggested menu (the fixed one) and updates the chip', /Omelette/.test(nv[0]) && /Bowl vegano/.test(nv[4]) && /Plantas/.test(await page.evaluate((f) => document.querySelector(f + ' [data-fn-diet-name]').textContent, FN)), nv.join(' | '));
  const sc3 = await page.evaluate((f) => [...document.querySelector(f + ' [data-fn-stepcount]').querySelectorAll('.fn-sc__s')].map((b) => b.textContent.replace(/\s+/g, ' ').trim() + ':' + (b.classList.contains('is-done') ? 'done' : '') + (b.classList.contains('is-on') ? 'on' : '')), FN);
  ok('the step counter lists the three steps: the first two marked completed, the current one highlighted', sc3.length === 3 && /done/.test(sc3[0]) && /done/.test(sc3[1]) && /on/.test(sc3[2]) && /✓/.test(sc3[1]), sc3.join(' | '));
  await page.evaluate((f) => document.querySelector(f + ' [data-wk-swap="1:0"]').click(), FN); await page.waitForTimeout(400);
  await page.evaluate((f) => { const p = document.querySelector(f + ' [data-fn-picker]'); const cur = document.querySelectorAll(f + ' .fn-wk__card')[1].querySelector('.fn-wk__name').textContent; [...p.querySelectorAll('[data-fn-dish]:not(.is-hidden)')].find((c) => c.offsetParent && c.getAttribute('data-tier') === 'selecto' && c.getAttribute('data-title') !== cur).querySelector('[data-pick]').click(); }, FN); await page.waitForTimeout(500);
  const editedWeek = await names();
  await page.evaluate((f) => [...document.querySelector(f + ' [data-fn-stepcount]').querySelectorAll('.fn-sc__s')][1].click(), FN); await page.waitForTimeout(500);
  ok('clicking a completed step in the counter goes back to it (plan and diet)', (await page.evaluate((f) => document.querySelector(f).getAttribute('data-step'), FN)) === '1');
  await page.evaluate((f) => document.querySelector(f + ' [data-fn-go-next]').click(), FN); await page.waitForTimeout(700);
  ok('going back and forward again keeps the edited week (nothing is reset)', (await names()).join('|') === editedWeek.join('|'), (await names()).join(' | '));

  // ---- people: each one keeps their own week; a new person starts from the default menu
  await base({ profile: { allergies: [], dislikes: [], people: [{ id: 'p1', name: 'Johnny', allergies: [], dislikes: [], diets: [] }] } }); await open(false); await chooseDiet('fit-proteina');
  await page.waitForFunction((f) => document.querySelectorAll(f + ' .fn-who__b').length >= 2, FN, { timeout: 5000 }).catch(() => {});
  ok('"Pedido para" shows a chip for me and for each family member, plus an add link', await page.evaluate((f) => { const c = [...document.querySelectorAll(f + ' .fn-who__b')].map((b) => b.textContent); return c.length === 2 && /Johnny/.test(c[1]) && !!document.querySelector(f + ' .fn-who__add'); }, FN));
  await page.evaluate((f) => document.querySelector(f + ' [data-wk-swap="1:0"]').click(), FN); await page.waitForTimeout(400);
  await page.evaluate((f) => { const p = document.querySelector(f + ' [data-fn-picker]'); const cur = document.querySelectorAll(f + ' .fn-wk__card')[1].querySelector('.fn-wk__name').textContent; [...p.querySelectorAll('[data-fn-dish]:not(.is-hidden)')].find((c) => c.offsetParent && c.getAttribute('data-tier') === 'selecto' && c.getAttribute('data-title') !== cur).querySelector('[data-pick]').click(); }, FN); await page.waitForTimeout(500);
  const mineEdited = await names();
  await page.evaluate((f) => document.querySelector(f + ' [data-fn-who-pick="p1"]').click(), FN); await page.waitForTimeout(600);
  const johnny = await names();
  ok('a family member with no week yet starts from the default menu of the chosen diet (not blank)', johnny.length === 5 && johnny.every((n) => n !== '-') && /Bowl de res/.test(johnny[0]) && /Arrachera/.test(johnny[4]), johnny.join(' | '));
  await page.evaluate((f) => document.querySelector(f + ' [data-fn-who-pick=""]').click(), FN); await page.waitForTimeout(600);
  ok('switching back to myself restores my edited week (nothing is lost)', (await names()).join('|') === mineEdited.join('|'), (await names()).join(' | '));
  await page.evaluate(() => { localStorage.setItem('kx-test-nostart', '1'); sessionStorage.removeItem('kx-test-start'); });
  await page.reload(); await page.waitForTimeout(1200);
  ok('and the week survives a page reload', (await page.evaluate((f) => document.querySelector(f).getAttribute('data-step'), FN)) === '3' && (await names()).join('|') === mineEdited.join('|'));

  // ---- confirming puts ONE plan line in the cart with the dishes as properties
  await base({ funnel: { info: { name: 'Ana Pérez', email: 'ana@ejemplo.com', phone: '+52 999 000 0000', street: 'Calle Lago 24', cluster: 'Clúster Las Lomas', zip: '72000' } } }); await open(false); await chooseDiet('veggie');
  await page.evaluate(() => { const f = window.fetch; window.__calls = []; window.fetch = function (u, o) { window.__calls.push(String(u).split('/').pop() + ' ' + ((o && o.body) || '').slice(0, 3000)); return f.apply(this, arguments); }; });
  await page.locator(`${FN} [data-fn-finish]`).scrollIntoViewIfNeeded(); await page.click(`${FN} [data-fn-finish]`); await page.waitForTimeout(1000);
  const calls = await page.evaluate(() => window.__calls);
  ok('confirm adds one plan line with the days as properties and goes to the cart', page.url().endsWith('#/carrito') && calls.some((r) => /add\.js/.test(r) && /_platillos/.test(r) && /Lunes/.test(r) && /Viernes/.test(r)), JSON.stringify(calls).slice(0, 300));

  // ---- "have your own diet?": a real file upload form
  await base(); await open(false);
  await page.evaluate((f) => document.querySelector(f + ' [data-fn-own]').click(), FN); await page.waitForTimeout(300);
  const own = await page.evaluate(() => { const m = document.querySelector('[data-page="pg/pedido"] [data-fn-own-modal]'), r = m.querySelector('.fn-own__box').getBoundingClientRect(); return { open: !m.hidden, file: !!m.querySelector('input[type=file][accept*="pdf"]'), fits: r.bottom <= innerHeight + 2, w: Math.round(r.width), txt: m.innerText }; });
  ok('the own-diet form opens, has a real file upload, fits the screen and stays compact', own.open && own.file && own.fits && own.w <= 520, JSON.stringify([own.open, own.file, own.fits, own.w]));
  ok('the consent line reads as plain text (the brand word is not turned into a logo)', /Acepto que usen mi archivo/.test(own.txt), own.txt.slice(-160));
  await page.evaluate(() => document.querySelector('[data-page="pg/pedido"] [data-fn-own-form] .fn-own__go').click()); await page.waitForTimeout(200);
  ok('sending it empty shows what is missing and sends nothing', await page.evaluate(() => { const e = document.querySelector('[data-page="pg/pedido"] [data-own-err]'); return !e.hidden && e.textContent.length > 10; }));
  await page.setInputFiles('[data-page="pg/pedido"] [data-fn-own-modal] input[type=file]', { name: 'plan.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
  await page.fill('[data-page="pg/pedido"] [data-fn-own-form] [name=name]', 'Ana'); await page.check('[data-page="pg/pedido"] [data-fn-own-form] [name=consent]');
  await page.evaluate(() => document.querySelector('[data-page="pg/pedido"] [data-fn-own-form] .fn-own__go').click()); await page.waitForTimeout(600);
  ok('a valid file + name + consent shows the thank-you message', await page.evaluate(() => { const m = document.querySelector('[data-page="pg/pedido"] [data-fn-own-modal]'); return !m.querySelector('[data-fn-own-ok]').hidden && m.querySelector('[data-fn-own-form]').hidden; }));
  await page.keyboard.press('Escape');

  // ---- hero: a 3D cube whose first item is the intro video; then it turns through the highlights and comes back to the video
  await page.setViewportSize({ width: 1440, height: 860 });
  await base(); await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(1300);
  const HR = '[data-page="home"] [data-hero]', CB = HR + ' [data-hero-cube]';
  const faceNow = () => page.evaluate((c) => [...document.querySelector(c).querySelectorAll('.hero__face')].findIndex((x) => x.classList.contains('is-cur')), CB);
  const hr0 = await page.evaluate((h) => { const e = document.querySelector(h), c = e.querySelector('[data-hero-cube]'); return { faces: c.querySelectorAll('.hero__face').length, slides: c.querySelectorAll('.hs').length, dots: e.querySelectorAll('[data-hs-dot]').length, loop: e.querySelector('[data-hero-video]').loop, d3: getComputedStyle(c).transformStyle, ctl: getComputedStyle(e.querySelector('.hero__ctl')).visibility, arrows: [...e.querySelectorAll('.hero__arr')].filter((a) => getComputedStyle(a).display !== 'none').length }; }, HR);
  ok('hero: 7 items in a 3D cube: the video first (it does not loop on its own) and 6 highlights, one dot each', hr0.faces === 7 && hr0.slides === 6 && hr0.dots === 7 && hr0.loop === false && hr0.d3 === 'preserve-3d' && hr0.ctl === 'visible' && hr0.arrows === 0, JSON.stringify(hr0));
  ok('hero: the video is the first thing shown', (await faceNow()) === 0);
  const fitD = await page.evaluate((h) => { const e = document.querySelector(h), cb = e.querySelector('[data-hero-cube]').getBoundingClientRect(), d = [...e.querySelectorAll('[data-hs-dot]')].map((x) => x.querySelector('i').getBoundingClientRect()), ctl = e.querySelector('.hero__ctl').getBoundingClientRect(), cp = e.querySelector('.hero__face--intro .hero__copy').getBoundingClientRect(); return { cubeBottom: Math.round(cb.bottom), vh: innerHeight, copyBottom: Math.round(cp.bottom), dots: d.length, dotW: Math.round(d[0].width), centered: Math.abs((ctl.left + ctl.width / 2) - innerWidth / 2) < 6, ctlBottom: Math.round(ctl.bottom) }; }, HR);
  ok('hero: the whole carousel (video face included) fits inside the screen', fitD.cubeBottom <= fitD.vh && fitD.copyBottom <= fitD.vh, JSON.stringify(fitD));
  ok('hero: seven tiny dots, centred, at the very bottom of the hero', fitD.dots === 7 && fitD.dotW <= 8 && fitD.centered && fitD.ctlBottom <= fitD.vh && fitD.ctlBottom >= fitD.vh - 60, JSON.stringify(fitD));
  await page.evaluate((h) => document.querySelector(h + ' [data-hero-video]').dispatchEvent(new Event('ended')), HR); await page.waitForTimeout(350);
  const mid = await page.evaluate((c) => { const e = document.querySelector(c); return { cls: e.className, tr: getComputedStyle(e).transform.slice(0, 9) }; }, CB);
  ok('hero: when the video has played the cube turns (a real 3D rotation: the video leaves the frame, the next item comes in)', /rot-next/.test(mid.cls) && mid.tr === 'matrix3d(', JSON.stringify(mid));
  await page.waitForTimeout(1500);
  const hr1 = await page.evaluate((h) => { const e = document.querySelector(h), on = e.querySelector('.hs.is-cur'); const r = on.getBoundingClientRect(); return { h2: on.querySelector('h2').textContent, link: on.querySelector('a').getAttribute('href'), img: !!on.querySelector('img'), fits: r.left >= -1 && r.right <= innerWidth + 1, hiddenOthers: [...e.querySelectorAll('.hero__face:not(.is-cur)')].every((x) => x.getAttribute('aria-hidden') === 'true'), idle: !document.querySelector(h + ' [data-hero-cube]').className.match(/rot-/) }; }, HR);
  ok('hero: the first highlight is in frame after the turn (tag, title, text, photo, link)', (await faceNow()) === 1 && hr1.h2.length > 5 && /^(\/|#\/)/.test(hr1.link) && hr1.img && hr1.fits && hr1.hiddenOthers && hr1.idle, JSON.stringify(hr1));
  const a0 = await faceNow(); await page.waitForTimeout(6800);
  ok('hero: the cube turns to the next item by itself (about every 5 seconds)', (await faceNow()) === a0 + 1, a0 + ' -> ' + (await faceNow()));
  await page.hover(HR); const c0 = await faceNow(); await page.waitForTimeout(6800);
  ok('hero: hovering pauses it (nothing turns while you read)', (await faceNow()) === c0);
  await page.mouse.move(2, 2);
  await page.evaluate((h) => document.querySelector(h + ' [data-hs-dot="6"]').click(), HR); await page.waitForTimeout(1700);
  ok('hero: a dot turns the cube to that item', (await faceNow()) === 6);
  await page.evaluate((h) => document.querySelector(h).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })), HR); await page.waitForTimeout(1700);
  const back = await page.evaluate((h) => { const v = document.querySelector(h + ' [data-hero-video]'); return { t: v.currentTime, ended: v.ended }; }, HR);
  ok('hero: after the last item the cube comes back to the VIDEO, which starts again from the beginning', (await faceNow()) === 0 && back.t < 3 && !back.ended, JSON.stringify(back));
  await page.evaluate((h) => document.querySelector(h + ' [data-hero-video]').dispatchEvent(new Event('ended')), HR); await page.waitForTimeout(1700);
  ok('hero: when the video ends the loop continues with the first highlight', (await faceNow()) === 1);
  await page.evaluate((h) => document.querySelector(h).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })), HR); await page.waitForTimeout(1700);
  ok('hero: the left key turns the cube the other way (to the video)', (await faceNow()) === 0);
  ok('hero: every highlight has a title, a link and a photo (events, trainers, partners, a "did you know", delivery)', await page.evaluate((h) => [...document.querySelector(h).querySelectorAll('.hs')].every((x) => x.querySelector('h2').textContent.trim().length > 4 && /^(\/|#\/)/.test(x.querySelector('a').getAttribute('href')) && x.querySelector('img')), HR));
  await page.evaluate((h) => document.querySelector(h + ' [data-hero-video]').dispatchEvent(new Event('ended')), HR); await page.waitForTimeout(1700);
  const hLink = await page.evaluate((h) => document.querySelector(h + ' .hs.is-cur a').getAttribute('href'), HR);
  await page.click(HR + ' .hs.is-cur a'); await page.waitForTimeout(400);
  ok('hero: the button of the item in frame opens its page', page.url().endsWith(hLink), page.url() + ' vs ' + hLink);
  await page.goto(`${URL0}#/home`);
  await page.setViewportSize({ width: 390, height: 844 }); await page.reload(); await page.waitForTimeout(1300);
  await page.evaluate((h) => document.querySelector(h + ' [data-hero-video]').dispatchEvent(new Event('ended')), HR); await page.waitForTimeout(1800);
  ok('hero on a phone: the cube works at phone width, the item fits and its controls are inside the screen', await page.evaluate((h) => { const e = document.querySelector(h), c = e.querySelector('.hero__ctl').getBoundingClientRect(), on = e.querySelector('.hs.is-cur').getBoundingClientRect(); return document.documentElement.scrollWidth <= innerWidth + 1 && c.right <= innerWidth + 1 && on.right <= innerWidth + 1 && on.width > 300; }, HR));
  await page.setViewportSize({ width: 1440, height: 900 });

  // ---- phones: nothing wider than the screen, the total bar is inside the screen
  await page.setViewportSize({ width: 390, height: 844 });
  await base({ guest: true }); await open(true);
  ok('phone, signed out: the sign-in screen fits the width', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await base(); await open(false);
  ok('phone: plan and diet fits the width and Continue stays reachable (docked at the bottom of the step)', await page.evaluate((f) => document.documentElement.scrollWidth <= innerWidth + 1 && !!document.querySelector(f + ' [data-fn-go-next]'), FN));
  await chooseDiet('keto-low-carb');
  await page.evaluate((f) => { const e = document.querySelector(f); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 10); }, FN); await page.waitForTimeout(300);
  const ph = await page.evaluate((f) => { const h = document.querySelector(f), bar = h.querySelector('.funnel__aside').getBoundingClientRect(), rail = h.querySelector('[data-fn-wk-cards]'); return { side: document.documentElement.scrollWidth <= innerWidth + 1, barIn: bar.bottom <= innerHeight + 2 && bar.top >= 0, swipe: getComputedStyle(rail).overflowX === 'auto', finish: !!h.querySelector('[data-fn-finish]').offsetParent }; }, FN);
  ok('phone: the week is a swipeable row of day cards and the total + confirm bar sits inside the screen', ph.side && ph.barIn && ph.swipe && ph.finish, JSON.stringify(ph));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
}


await browser.close();
ok('no JS errors on any page', errors.length === 0, errors.slice(0, 5).join(' | '));
const pass = results.filter((r) => r.ok).length;
console.log(`${pass}/${results.length} checks passed`);
if (fail.length) { console.log('FAILED:\n - ' + fail.join('\n - ')); process.exit(1); }
