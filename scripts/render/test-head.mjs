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
const SKIP_LOADER = () => { try { sessionStorage.setItem('kx-seen', '1'); if (!sessionStorage.getItem('kx-test-norules')) localStorage.setItem('kx-rules-ok', '1'); } catch (e) {} };
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(SKIP_LOADER);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });

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
const groups = ['.site-footer a', '[data-page="home"] a.btn:not([data-fn-finish]):not(.funnel__teaser *)', '[data-page="home"] a.arrow-link'];
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
await page.click(`${scope} [data-filter="category"][data-value="al-fuego"]`);
ok('category filter -> 3 dishes', (await page.$$eval(`${scope} [data-dish]:not(.is-hidden)`, (e) => e.length)) === 3);
await page.click(`${scope} [data-filter="category"][data-value="keto-low-carb"]`);
const ketoOk = await page.evaluate((sc) => { const v = [...document.querySelectorAll(sc + ' [data-dish]:not(.is-hidden)')]; return v.length > 0 && v.every((x) => /keto|bajo-carbos/.test(x.getAttribute('data-diets'))) && document.querySelector(sc + ' [data-count]').textContent.trim() === String(v.length); }, scope);
ok('keto / low carb group shows only keto or low-carb dishes and the counter matches', ketoOk);
ok('the 12 menu groups are offered (all + 11) and the old diet row is gone', await page.evaluate((sc) => document.querySelectorAll(sc + ' [data-filter="category"]').length === 12 && !document.querySelector(sc + ' [data-filter="diet"]'), scope));
await page.goto(`${URL0}#/home`); await page.reload();
await page.goto(`${URL0}#/menu?dieta=vegano`); await page.reload(); await page.waitForFunction(() => document.querySelectorAll('[data-page="menu"] [data-dish]:not(.is-hidden)').length < 9, null, { timeout: 6000 }).catch(() => {}); await page.waitForTimeout(300);
const vgN = await page.$$eval(`${scope} [data-dish]:not(.is-hidden)`, (e) => e.map((x) => x.getAttribute('data-diets')));
ok('deep link ?dieta=vegano opens the Veggie group (vegetarian + vegan dishes only)', vgN.length >= 1 && vgN.every((x) => /vegano|vegetariano/.test(x)), JSON.stringify(vgN));

// ---- home diet chip deep-links into the filtered menu without reload
await page.goto(`${URL0}#/home`); await page.waitForTimeout(100);
await page.evaluate(() => document.querySelector('[data-page="home"] [data-dchip="sin-gluten"]').click()); await page.waitForTimeout(250);
{ const n = await page.$$eval('[data-page="home"] [data-dc-grid] [data-dish]:not(.is-hidden)', (e) => e.map((x) => x.dataset.diets)); ok('home chips filter the dishes listed right below them (5 gluten-free dishes this week)', n.length === 5 && n.every((d) => d.split('|').includes('sin-gluten')), n.length + ' shown');
  await page.evaluate(() => document.querySelector('[data-page="home"] [data-dchip="vegano"]').click()); await page.waitForTimeout(200);
  const n2 = await page.$$eval('[data-page="home"] [data-dc-grid] [data-dish]:not(.is-hidden)', (e) => e.length);
  ok('a second chip narrows the list (gluten-free AND vegan) and the count line follows', n2 > 0 && n2 < 5 && /\d/.test(await page.$eval('[data-page="home"] [data-dc-count]', (e) => e.textContent)), String(n2)); }

// ---- allergy profile blocks dishes + product page alert
await page.goto(`${URL0}#/pg/perfil`); await page.waitForTimeout(100);
await page.check('[data-page="pg/perfil"] input[name="allergy"][value="Frutos secos"]');
await page.fill('[data-page="pg/perfil"] [data-tag-input]', 'cebolla'); await page.press('[data-page="pg/perfil"] [data-tag-input]', 'Enter');
await page.click('[data-page="pg/perfil"] button[type="submit"]'); await page.waitForTimeout(100);
ok('profile saved message', await page.$eval('[data-page="pg/perfil"] [data-profile-msg]', (e) => !e.hidden));
await page.goto(`${URL0}#/menu`); await page.waitForTimeout(100);
const blocked = await page.$$eval(`${scope} .dish.is-warned`, (e) => e.map((x) => x.querySelector('.dish__title').textContent.trim()));
ok('allergic dish (frutos secos) gets a warning, but stays available', blocked.length === 1 && /Salmón/.test(blocked[0]) && (await page.$eval(`${scope} .dish.is-warned [data-fn-warn]`, (e) => !e.hidden && /datos|data/i.test(e.textContent))), blocked.join('|'));
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
await browser.close(); console.log('done head');
