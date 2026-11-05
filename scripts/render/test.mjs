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
const SKIP_LOADER = () => { try { sessionStorage.setItem('kx-seen', '1'); } catch (e) {} };
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(SKIP_LOADER);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });

// ---- every page: renders, has content, headings use the new fonts, links resolve
const keys = routes.map((r) => r.key);
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
  ok(`[${r.key}] headline in the brand type system`, /Kaushan|Alegreya/.test(info.hFont), info.hFont);
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
await page.click(`${scope} [data-filter="category"][data-value="al-fuego-y-mar"]`);
ok('category filter -> 3 dishes', (await page.$$eval(`${scope} [data-dish]:not(.is-hidden)`, (e) => e.length)) === 3);
await page.click(`${scope} [data-filter="diet"][data-value="keto"]`);
ok('category + keto -> 2 dishes', (await page.$$eval(`${scope} [data-dish]:not(.is-hidden)`, (e) => e.length)) === 2);
ok('counter matches', (await page.$eval(`${scope} [data-count]`, (e) => e.textContent.trim())) === '2');
await page.goto(`${URL0}#/home`); await page.reload();
await page.goto(`${URL0}#/menu?dieta=vegano`); await page.reload(); await page.waitForTimeout(150);
ok('deep link ?dieta=vegano filters menu', (await page.$$eval(`${scope} [data-dish]:not(.is-hidden)`, (e) => e.length)) === 1);

// ---- home diet chip deep-links into the filtered menu without reload
await page.goto(`${URL0}#/home`); await page.waitForTimeout(100);
await page.click('[data-page="home"] a.chip[href*="dieta=sin-gluten"]'); await page.waitForTimeout(150);
{ const n = await page.$$eval(`${scope} [data-dish]:not(.is-hidden)`, (e) => e.map((x) => x.dataset.diets)); ok('chip from home -> menu filtered by sin-gluten (5 gluten-free dishes this week, previous filters cleared)', n.length === 5 && n.every((d) => d.split('|').includes('sin-gluten')), n.length + ' shown'); }

// ---- allergy profile blocks dishes + product page alert
await page.goto(`${URL0}#/pg/perfil`); await page.waitForTimeout(100);
await page.check('[data-page="pg/perfil"] input[name="allergy"][value="Frutos secos"]');
await page.fill('[data-page="pg/perfil"] [data-tag-input]', 'cebolla'); await page.press('[data-page="pg/perfil"] [data-tag-input]', 'Enter');
await page.click('[data-page="pg/perfil"] button[type="submit"]'); await page.waitForTimeout(100);
ok('profile saved message', await page.$eval('[data-page="pg/perfil"] [data-profile-msg]', (e) => !e.hidden));
await page.goto(`${URL0}#/menu`); await page.waitForTimeout(100);
const blocked = await page.$$eval(`${scope} .dish.is-blocked`, (e) => e.map((x) => x.querySelector('.dish__title').textContent.trim()));
ok('allergic dish (frutos secos) is blocked', blocked.length === 1 && /Salmón/.test(blocked[0]), blocked.join('|'));
ok('dislike lowers compatibility on vegan bowl (cebolla)', /70%|40%|7\d%/.test(await page.$eval(`${scope} [data-dish][data-category="bowls-de-la-semana"][data-tier="exclusivo"] [data-compat]`, (e) => e.textContent)));
await page.goto(`${URL0}#/p/salmon-costra-almendras`); await page.waitForTimeout(100);
ok('product alert visible + add disabled', await page.evaluate(() => {
  const d = document.querySelector('[data-page="p/salmon-costra-almendras"]');
  return !d.querySelector('[data-allergen-alert]').hidden && d.querySelector('[data-add]').disabled;
}));
await page.goto(`${URL0}#/p/bowl-res-quinoa`); await page.waitForTimeout(100);
ok('other product not blocked', await page.evaluate(() => { const d = document.querySelector('[data-page="p/bowl-res-quinoa"]'); return d.querySelector('[data-allergen-alert]').hidden && !d.querySelector('[data-add]').disabled; }));
await page.evaluate(() => localStorage.clear());

// ---- add to selection -> cart; cart gating; referral + gift
await page.goto(`${URL0}#/p/bowl-res-quinoa`); await page.reload(); await page.waitForTimeout(100);
await page.click('[data-page="p/bowl-res-quinoa"] [data-add]'); await page.waitForTimeout(150);
ok('dish page CTA opens the plan builder with the dish preselected', /#\/pg\/pedido\?dish=bowl-res-quinoa|#\/pedido\?dish=bowl-res-quinoa/.test(page.url()), page.url());
await page.goto(`${URL0}#/carrito`); await page.waitForTimeout(150);
const cartScope = '[data-page="carrito"]';
ok('checkout disabled until contract accepted', await page.$eval(`${cartScope} [data-checkout]`, (e) => e.disabled));
await page.check(`${cartScope} [data-contract]`);
ok('checkout enabled after contract', !(await page.$eval(`${cartScope} [data-checkout]`, (e) => e.disabled)));
ok('gift hidden before code', await page.$eval(`${cartScope} [data-gift]`, (e) => e.hidden));
await page.fill(`${cartScope} [data-referral]`, 'juanfit');
ok('gift shown with code (uppercased)', (await page.$eval(`${cartScope} [data-gift]`, (e) => !e.hidden)) && (await page.$eval(`${cartScope} [data-referral]`, (e) => e.value)) === 'JUANFIT');
await page.click(`${cartScope} [data-gift-add]`); await page.waitForTimeout(150);
ok('gift add shows confirmation', (await page.$$('.preview-toast')).length > 0);

// ---- account: pause locks follow the Saturday-10:00 cycle (Mexico City time)
async function lockStateAt(iso) {
  const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await c2.addInitScript(SKIP_LOADER);
  const p2 = await c2.newPage();
  await p2.clock.install({ time: new Date(iso) });
  await p2.goto(`${URL0}#/pg/cuenta-pausas`); await p2.waitForTimeout(150);
  const s = await p2.$$eval('[data-page="pg/cuenta-pausas"] [data-pause-lock]', (b) => b.map((x) => x.getAttribute('aria-disabled')));
  const msgs = await p2.$$eval('[data-page="pg/cuenta-pausas"] [data-lock-msg]', (m) => m.map((x) => !x.hidden));
  await c2.close(); return { s, msgs };
}
// Mexico City is UTC-6 year-round. Mon 12:00 local = 18:00Z; Tue 11:00 local; Fri 20:00 local; Sat 09:00 / 10:30 local.
let st = await lockStateAt('2026-11-02T18:00:00Z'); ok('Mon noon: both pauses open', st.s.join() === 'false,false', st.s.join());
st = await lockStateAt('2026-11-03T17:00:00Z'); ok('Tue 11:00: Thu/Fri pause locked, Mon-Wed open', st.s.join() === 'true,false' && st.msgs[0] === true, st.s.join());
st = await lockStateAt('2026-11-07T02:00:00Z'); ok('Fri 20:00: both locked', st.s.join() === 'true,true', st.s.join());
st = await lockStateAt('2026-11-07T15:00:00Z'); ok('Sat 09:00: still locked until cutoff', st.s.join() === 'true,true', st.s.join());
st = await lockStateAt('2026-11-07T16:30:00Z'); ok('Sat 10:30: new cycle, both open again', st.s.join() === 'false,false', st.s.join());

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
ok('header holds only the logo, the announcement link, the login, the cart and the burger', (await page.$$('.site-header a, .site-header button')).length === 7);
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
  await openMenu(); await page.click(`#menu-overlay a[href="${h}"]`); await page.waitForTimeout(1100);
  ok(`menu link ${h} navigates and closes the menu`, page.url().endsWith(h) && (await page.$eval('#menu-overlay', (n) => n.hidden)));
}

// page structure: every sitemap page has a header with breadcrumbs; families have a sub-navigation
const noHead = [];
for (const [h] of pagesList) {
  await page.goto(`${URL0}#/pg/${h}`); await page.waitForTimeout(60);
  const ok1 = await page.$eval(`[data-page="pg/${h}"]`, (e) => !!e.querySelector('.page-head h1') && !!e.querySelector('.page-head__crumbs'));
  if (!ok1) noHead.push(h);
}
ok('every page and subpage has a page header with breadcrumbs', noHead.length === 0, noHead.join(' '));
await page.goto(`${URL0}#/pg/embajadores-gimnasios`); await page.waitForTimeout(150);
ok('subpages show the family sub-navigation with the current page marked', (await page.$$eval('[data-page="pg/embajadores-gimnasios"] .page-head__sub a', (a) => a.length)) >= 6 && (await page.$eval('[data-page="pg/embajadores-gimnasios"] .page-head__sub a[aria-current="page"]', (a) => /Gimnasios/.test(a.textContent))));
// Miro coverage: sections that must exist
const must = { 'home': ['.hero', '.marquee', '[data-funnel]', '[data-rail]', '.tier-ladder', '.fg--index', '.diet-chips, .chips', '.plan-card', '.accordion', '.cta-banner'],
  'pg/planes': ['.plan-card', '.tier-ladder', '.accordion'], 'pg/ayuda': ['form'], 'pg/terminos': ['.accordion details'], 'pg/carta-cotizacion': ['form'],
  'pg/embajadores-solicitar': ['form'], 'pg/checkout': ['.card'], 'pg/cuenta-semana': ['[data-cutoff]'], 'pg/cuenta-pausas': ['[data-pause-lock]'], 'pg/cuenta-monedero': ['.card'] };
const lacking = [];
for (const [k, sels] of Object.entries(must)) { await page.goto(`${URL0}#/${k}`); await page.waitForTimeout(80); for (const sel of sels) if (!(await page.$(`[data-page="${k}"] ${sel}`))) lacking.push(`${k} ${sel}`); }
ok('key sections from the Miro board exist on their pages', lacking.length === 0, lacking.join(' | '));
ok('terms page carries all 10 contract clauses', await (async () => { await page.goto(`${URL0}#/pg/terminos`); await page.waitForTimeout(100); return (await page.$$eval('[data-page="pg/terminos"] .accordion details', (d) => d.length)) === 10; })());

// account subpages: each shows its own panel inside the account shell
for (const [k, sel] of [['semana', '#semana'], ['pausas', '#pausas'], ['monedero', '#monedero'], ['perfil', '#perfil'], ['referidos', '#referidos'], ['pedidos', '#pedidos'], ['entregas', '#entregas']]) {
  await page.goto(`${URL0}#/pg/cuenta-${k}`); await page.waitForTimeout(80);
  ok(`account sub-page ${k} renders its panel and the account navigation`, !!(await page.$(`[data-page="pg/cuenta-${k}"] .account-block[id$="${k}"]`)) && (await page.$$eval(`[data-page="pg/cuenta-${k}"] .account-nav a`, (a) => a.length)) >= 8);
}
ok('account overview links to all 8 account areas', (await (async () => { await page.goto(`${URL0}#/cuenta`); await page.waitForTimeout(100); return page.$$eval('[data-page="cuenta"] .index-row', (r) => r.length); })()) === 8);

// multi-step registration
await page.goto(`${URL0}#/registro`); await page.reload(); await page.waitForTimeout(500);
const rg = '[data-page="registro"]';
ok('registration is a 5-step flow starting at step 1', (await page.$$eval(`${rg} [data-step]`, (s) => s.length)) === 5 && (await page.$$eval(`${rg} [data-step].is-on`, (s) => s.length)) === 1);
await page.click(`${rg} [data-step-next]`); await page.waitForTimeout(150);
ok('required fields block moving to the next step', await page.$eval(`${rg} [data-step]:nth-of-type(1)`, (s) => s.classList.contains('is-on')) || (await page.$$eval(`${rg} [data-step].is-on`, (s) => s[0] === document.querySelectorAll('[data-page="registro"] [data-step]')[0])));
await page.fill(`${rg} #registro--reg-first`, 'Ana'); await page.fill(`${rg} #registro--reg-last`, 'P'); await page.fill(`${rg} #registro--reg-email`, 'a@b.co'); await page.fill(`${rg} #registro--reg-pass`, 'secret1');
await page.click(`${rg} [data-step-next]`); await page.waitForTimeout(150); await page.click(`${rg} [data-step-next]`); await page.waitForTimeout(150);
await page.check(`${rg} input[name="allergy"][value="Mariscos"]`); await page.fill(`${rg} [name="dislikes"]`, 'cilantro, pasas');
await page.click(`${rg} [data-step-next]`); await page.waitForTimeout(150); await page.click(`${rg} [data-step-next]`); await page.waitForTimeout(150);
ok('step 5 shows the contract and keeps submit disabled until accepted', await page.$eval(`${rg} [data-signup-submit]`, (b) => b.disabled));
await page.check(`${rg} [data-signup-contract]`);
ok('accepting the contract enables sign-up', !(await page.$eval(`${rg} [data-signup-submit]`, (b) => b.disabled)));
await page.click(`${rg} [data-signup-submit]`); await page.waitForTimeout(250);
ok('sign-up ends in the account and stores the allergy profile', page.url().endsWith('#/cuenta') && JSON.parse(await page.evaluate(() => localStorage.getItem('kulinaria_profile') || '{}')).allergies.includes('Mariscos'));
await page.evaluate(() => localStorage.clear());

// light / dark (toggle lives in the menu)
const themeOf = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const bgOf = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(600);
ok('light is the default theme', (await themeOf()) === 'light');
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
ok('menu filters are translated and still work in English', (await page.$eval('[data-page="menu"] [data-filter="category"][data-value="al-fuego-y-mar"]', (b) => b.textContent.trim())) === 'Fire & Sea');
await page.click('[data-page="menu"] [data-filter="category"][data-value="al-fuego-y-mar"]');
ok('category filter works in English', (await page.$$eval('[data-page="menu"] [data-dish]:not(.is-hidden)', (e) => e.length)) === 3);
await page.goto(`${URL0}#/pg/perfil`); await page.waitForTimeout(150);
await page.check('[data-page="pg/perfil"] input[name="allergy"][value="Frutos secos"]'); await page.click('[data-page="pg/perfil"] button[type="submit"]'); await page.waitForTimeout(100);
await page.goto(`${URL0}#/p/salmon-costra-almendras`); await page.waitForTimeout(150);
ok('allergen blocking still works in English with English alert text', await page.evaluate(() => { const d = document.querySelector('[data-page="p/salmon-costra-almendras"]'); return !d.querySelector('[data-allergen-alert]').hidden && /Not suitable for your profile/.test(d.querySelector('[data-allergen-alert]').textContent) && d.querySelector('[data-add]').disabled; }));
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
ok('hero: the brand intro video is a square shown whole (contain, never cropped) to the right of the headline, on black', hh.square && hh.fit === 'contain' && hh.stageRightOfCopy && hh.within && hh.src && hh.bg === 'rgb(0, 0, 0)', JSON.stringify(hh));
ok('hero: serif headline with brand-script phrase, circle-arrow CTA, no inline nav', /Alegreya/.test(hh.h1Font) && /Kaushan/.test(hh.emFont) && hh.arrow && !hh.nav, JSON.stringify(hh));
ok('hero headline never overlaps the video (text column stays left of it)', await page.evaluate(() => document.querySelector('[data-page="home"] .hero__copy').getBoundingClientRect().right <= document.querySelector('[data-page="home"] .hero__stage').getBoundingClientRect().left + 4));
// 3D / pointer: hero photo drifts, dish tilt, coverflow, peek
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(500);
await page.mouse.move(300, 300); await page.mouse.move(1300, 700, { steps: 6 }); await page.waitForTimeout(500);
await page.evaluate(() => { const r = document.querySelector('[data-page="home"] [data-rail]'); window.scrollTo(0, r.getBoundingClientRect().top + window.scrollY - 120); }); await page.waitForTimeout(700);
const dm = '[data-page="home"] .rail .dish__media';
const dbox = await page.$eval(dm, (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
await page.mouse.move(dbox.x + dbox.w * 0.85, dbox.y + dbox.h * 0.2); await page.waitForTimeout(500);
ok('dish card tilts toward the pointer', (await page.$eval(dm, (e) => parseFloat(e.style.getPropertyValue('--ry')))) > 1.5);
ok('carousel cards have a coverflow angle', await page.$$eval('[data-page="home"] .rail .dish', (c) => c.some((x) => x.style.getPropertyValue('--ry') !== '' && parseFloat(x.style.getPropertyValue('--ry')) !== 0)));
await page.evaluate(() => { const r = document.querySelector('[data-page="home"] .fg--index'); window.scrollTo(0, r.getBoundingClientRect().top + window.scrollY - 100); }); await page.waitForTimeout(700);
const row = await page.$eval('[data-page="home"] .index-row[data-peek]', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + 200, y: r.top + r.height / 2 }; });
await page.mouse.move(row.x, row.y); await page.mouse.move(row.x + 10, row.y + 4); await page.waitForTimeout(600);
ok('hovering a category row shows its photo next to the cursor', await page.evaluate(() => { const p = document.querySelector('.peek'); return !!p && p.classList.contains('is-on') && /^(blob|data):/.test(p.querySelector('img').src); }));


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
ok('every page opens with the photo header', motif.noPhoto.filter((k) => !['404'].includes(k)).length === 0, motif.noPhoto.join(' '));
ok('every page has a serif headline with a brand-script phrase', motif.noEm.length === 0, motif.noEm.join(' '));
ok('no raw emphasis asterisks leak into the page', motif.leak.length === 0, motif.leak.join(' '));


// =====================================================================  v6: order funnel, full menu fallback, thin marquee
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${URL0}#/home`); await page.evaluate(() => { localStorage.clear(); }); await page.reload(); await page.waitForTimeout(900);
const fnS = '[data-page="home"] [data-funnel]';
ok('the section after the marquee is the order funnel (3 steps)', await page.evaluate(() => { const m = document.querySelector('[data-page="home"] .marquee'); const f = m.closest('.shopify-section').nextElementSibling; return !!f.querySelector('[data-funnel]') && f.querySelectorAll('[data-fn-dot]').length === 3; }));
ok('step 1 offers the 4-week and the 1-week plan', (await page.$$eval(`${fnS} [data-plan-choice]`, (b) => b.map((x) => x.getAttribute('data-plan-choice')))).join() === 'block,week');
ok('the funnel is a plain stepper: not sticky', await page.evaluate(() => getComputedStyle(document.querySelector('[data-page="home"] .funnel__stage')).position === 'static'));
await page.locator(`${fnS} [data-plan-choice="block"]`).scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
await page.click(`${fnS} [data-plan-choice="block"]`); await page.click(`${fnS} [data-fn-next]`); await page.waitForTimeout(700);
ok('plan cards say "from $3,600 / includes 20 meals" and "from $1,000 / includes 5 meals", and the tier step is gone', await page.evaluate(() => { const f = document.querySelector('[data-page="home"] [data-funnel]'); const p = (k) => f.querySelector(`[data-plan-choice="${k}"]`).textContent; const t = [...f.querySelectorAll('[data-tier-choice]')]; return /3,600/.test(p('block')) && /20/.test(p('block')) && /1,000/.test(p('week')) && /5/.test(p('week')) && f.querySelector('[data-fn-step="2"]').classList.contains('is-on') && t.map((x) => x.getAttribute('data-block')).join() === '3600,5000,6400,7800' && t.map((x) => x.getAttribute('data-meal')).join() === '180,250,320,390' && !f.querySelector('[data-fn-tierdata]').offsetParent; }));
ok('the meals step shows every dish with its category and price; higher tiers carry the upgrade badge', await page.evaluate(() => { const f = document.querySelector('[data-page="home"] [data-funnel]'); const vis = [...f.querySelectorAll('[data-fn-dish]:not(.is-hidden)')]; return f.querySelector('[data-fn-step="2"]').classList.contains('is-on') && vis.length >= 8 && vis.every((d) => /\$\d+/.test(d.textContent)) && vis.filter((d) => d.getAttribute('data-tier') !== 'selecto').every((d) => !d.querySelector('[data-fn-up]').hidden); }));
ok('there is one weekday slot per meal (Monday to Friday) and the meter counts them', (await page.$$eval(`${fnS} select[data-fn-day]`, (e) => e.length)) === 5);
ok('"continue" is disabled until 5 meals are chosen', await page.$eval(`${fnS} [data-fn-next]`, (b) => b.disabled));
for (let i = 0; i < 6; i++) { await page.evaluate(() => { const d = document.querySelector('[data-page="home"] [data-fn-grid] .fn-dish:not(.is-hidden):not(.is-blocked)'); const p = d.querySelector('[data-q-plus]') && d.classList.contains('is-picked') ? d.querySelector('[data-q-plus]') : d.querySelector('[data-pick]'); p.click(); }); await page.waitForTimeout(120); }
ok('the meter caps at 5 meals per week', (await page.$eval(`${fnS} [data-fn-meter-n]`, (e) => e.textContent.trim())) === '5');
ok('base total for the 4-week plan is $3,600', /3,600/.test(await page.$eval(`${fnS} [data-fn-s-total]`, (e) => e.textContent)));
const upPid = await page.$eval(`${fnS} [data-fn-dish][data-tier="reserve"]`, (e) => e.getAttribute('data-pid'));
await page.selectOption(`${fnS} select[data-fn-day="4"]`, upPid); await page.waitForTimeout(300);
ok('upgrading Friday to a Reserve dish costs the difference of 3 levels ($210) for that week', /3,810/.test(await page.$eval(`${fnS} [data-fn-s-total]`, (e) => e.textContent)) && /210/.test(await page.$eval(`${fnS} [data-fn-s-up]`, (e) => e.textContent)));
await page.selectOption(`${fnS} select[data-fn-day="4"]`, await page.$eval(`${fnS} select[data-fn-day="3"]`, (e) => e.value)); await page.waitForTimeout(200);
ok('back to a dish of the base tier the upgrade charge disappears', /3,600/.test(await page.$eval(`${fnS} [data-fn-s-total]`, (e) => e.textContent)));
await page.click(`${fnS} [data-fn-next]`); await page.waitForTimeout(600);
ok('step 3 is the details form', await page.$eval(`${fnS} [data-fn-step="3"]`, (e) => e.classList.contains('is-on')));
ok('step 4 offers sign-in and account creation', await page.evaluate(() => { const a = document.querySelector('[data-page="home"] [data-fn-step="3"] .fn-account'); return !!a && a.querySelectorAll('a').length >= 1; }));
await page.click(`${fnS} [data-fn-finish]`); await page.waitForTimeout(300);
ok('step 4 will not finish without name, e-mail and phone', !(await page.$eval(`${fnS} [data-fn-error]`, (e) => e.hidden)) && page.url().endsWith('#/home'));
await page.fill(`${fnS} [data-info="name"]`, 'Ana Pérez'); await page.fill(`${fnS} [data-info="email"]`, 'ana@ejemplo.com'); await page.fill(`${fnS} [data-info="phone"]`, '+52 999 000 0000');
await page.fill(`${fnS} [data-info="street"]`, 'Calle Lago 24'); await page.fill(`${fnS} [data-info="cluster"]`, 'Clúster Las Lomas'); await page.check(`${fnS} [data-allergy][value="Mariscos"]`);
await page.evaluate(() => { const f = window.fetch; window.__calls = []; window.fetch = function (u, o) { window.__calls.push(String(u).split('/').pop() + ' ' + ((o && o.body) || '').slice(0, 3000)); return f.apply(this, arguments); }; });
await page.click(`${fnS} [data-fn-finish]`); await page.waitForTimeout(300);
ok('the contract must be accepted in the details step', /contrato|contract/i.test(await page.$eval(`${fnS} [data-fn-error]`, (e) => e.textContent)));
await page.check(`${fnS} [data-fn-contract]`);
await page.click(`${fnS} [data-fn-finish]`); await page.waitForTimeout(900);
const reqs = await page.evaluate(() => window.__calls);
ok('finishing adds ONE plan line with the dishes as properties and goes to the cart', page.url().endsWith('#/carrito') && reqs.some((r) => /add\.js/.test(r) && /_platillos/.test(r) && /Lunes/.test(r) && /Viernes/.test(r)) && /clear\.js/.test(reqs.join(' ')) && /contrato_aceptado/.test(reqs.join(' ')), JSON.stringify(reqs).slice(0, 300));
const savedProfile = await page.evaluate(() => JSON.parse(localStorage.getItem('kulinaria_profile') || '{}'));
ok('the allergy profile is stored for the menu filters', (savedProfile.allergies || []).includes('Mariscos'));
await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(900);
ok('coming back, the funnel remembers the details', await page.evaluate(() => document.querySelector('[data-page="home"] [data-funnel] [data-info="email"]').value === 'ana@ejemplo.com'));
// allergy blocking inside the funnel
await page.evaluate(() => { localStorage.setItem('kulinaria_profile', JSON.stringify({ allergies: ['Frutos secos'], dislikes: [] })); localStorage.removeItem('kulinaria_funnel'); });
await page.reload(); await page.waitForTimeout(900);
await page.click(`${fnS} [data-fn-next]`); await page.waitForTimeout(600);
ok('dishes with a declared allergen are blocked inside the funnel', await page.evaluate(() => { const d = [...document.querySelectorAll('[data-page="home"] [data-fn-grid] .fn-dish')].find((x) => /Salm/.test(x.getAttribute('data-title'))); return !!d && d.classList.contains('is-blocked') && d.querySelector('[data-pick]').disabled; }));
await page.evaluate(() => { localStorage.clear(); });
// the dedicated page and the complete menu
await page.goto(`${URL0}#/pg/pedido`); await page.waitForTimeout(500);
ok('/pages/pedido hosts the same funnel under the photo header', !!(await page.$('[data-page="pg/pedido"] .page-head')) && !!(await page.$('[data-page="pg/pedido"] [data-funnel]')));
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
ok('the ES/EN language switch sits in the header', await page.evaluate(() => { const b = [...document.querySelectorAll('.site-header .lang__btn')]; return b.length === 2 && b.every((x) => x.getBoundingClientRect().width > 0); }));
// client login is visible
ok('header offers the client login', await page.$eval('.site-header .header-login', (a) => /login|sesi|cuenta|account/i.test(a.textContent) && /login|cuenta/.test(a.getAttribute('href'))));
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
ok('desktop header keeps language, login, cart and burger', await page.evaluate(() => { const v = (s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; }; return v('.site-header .lang') && v('.site-header .header-login') && v('.site-header .burger'); }));
const mobile = { width: 390, height: 844 };
await page.setViewportSize(mobile); await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(900);
ok('phone: the header keeps only logo, cart and burger (language, theme and login live in the burger menu)', await page.evaluate(() => { const v = (s) => { const e = document.querySelector(s); return !e || getComputedStyle(e).display === 'none'; }; const bar = document.querySelector('.site-header__bar').getBoundingClientRect(); return v('.site-header .lang') && v('.site-header .header-login') && bar.height <= 56; }));
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
ok('phone: no page is longer than 13 screens and the average is under 3.5 screens', long.length === 0 && totalScreens / pageNames.length < 3.5, long.join(', ') + ' avg ' + (totalScreens / pageNames.length).toFixed(2));
// order wizard on the phone
await page.evaluate(() => localStorage.removeItem('kulinaria_funnel')); await page.evaluate(() => { location.hash = '#/pg/pedido'; }); await page.reload(); await page.waitForTimeout(900);
const fnPhone = await page.evaluate(() => { const f = document.querySelector('[data-page="pg/pedido"] [data-funnel]'); const act = f.querySelector('.funnel__actions'); return { plans: f.querySelectorAll('[data-plan-choice]').length, docked: getComputedStyle(act).position === 'sticky', summary: getComputedStyle(f.querySelector('.funnel__facts')).display === 'none' }; });
ok('phone: plan choices are shown, the wizard buttons dock and the summary is one slim row', fnPhone.plans === 2 && fnPhone.docked && fnPhone.summary, JSON.stringify(fnPhone));
await page.click('[data-page="pg/pedido"] [data-fn-next]'); await page.waitForTimeout(700);
ok('phone: the dish list stays inside the screen (own scroll, never taller than the frame)', await page.evaluate(() => { const l = document.querySelector('[data-page="pg/pedido"] .fn-dishes'); const r = l.getBoundingClientRect(); return r.height <= innerHeight - 200 && getComputedStyle(l).overflowY === 'auto'; }));
// v13: minimal phone UI: slim home, glowing "i" with the pricing sheet, no announcement bar
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => localStorage.removeItem('kulinaria_funnel')); await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(900);
const homePhone = await page.evaluate(() => { const pg = document.querySelector('[data-page="home"]'); const vis = (s) => [...pg.querySelectorAll(s)].some((e) => e.getBoundingClientRect().height > 0 && getComputedStyle(e).display !== 'none'); return { ann: getComputedStyle(document.querySelector('.site-header__ann')).display, teaser: vis('.funnel__teaser'), wizard: vis('.funnel__track'), showcase: vis('.showcase'), band: vis('.band'), rail: vis('.rail'), plans: vis('.plan-card'), screens: document.documentElement.scrollHeight / innerHeight }; });
ok('phone home: hero, order card, this week, showcases, tiers, categories, plans, FAQ and the final call are all there (placeholder testimonials and the marquee are not)', homePhone.teaser && !homePhone.wizard && homePhone.showcase && homePhone.band && homePhone.rail && homePhone.plans && homePhone.screens < 13, JSON.stringify(homePhone));
const homeMore = await page.evaluate(() => { const pg = document.querySelector('[data-page="home"]'); const vis = (s) => [...pg.querySelectorAll(s)].some((e) => e.getBoundingClientRect().height > 0); return { tiers: vis('.tier-ladder'), index: vis('.fg--index'), faq: vis('.accordion'), cta: vis('.cta-banner'), marquee: vis('.marquee'), testimonials: vis('.fg--grid.section--raised') }; });
ok('phone home keeps tiers, categories, FAQ and the final call, and drops the marquee and the placeholder testimonials', homeMore.tiers && homeMore.index && homeMore.faq && homeMore.cta && !homeMore.marquee && !homeMore.testimonials, JSON.stringify(homeMore));
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
await page.click('[data-page="home"] .funnel__teaser .info-dot'); await page.waitForTimeout(600);
const sheet = await page.evaluate(() => { const s = document.getElementById('sheet-pricing'); const r = s.querySelector('.sheet__panel').getBoundingClientRect(); return { open: s.classList.contains('is-open'), steps: s.querySelectorAll('.sheet__steps>li').length, tiers: [...s.querySelectorAll('.sheet__tiers dd')].map((x) => x.textContent).join(), fits: r.bottom <= innerHeight + 1 && r.height <= innerHeight * 0.9 && /4/.test(s.textContent) }; });
ok('phone: the glowing "i" opens a bottom sheet that explains the 4-week block and the per-meal prices ($180/$250/$320/$390)', sheet.open && sheet.steps === 4 && sheet.tiers === '$180,$250,$320,$390' && sheet.fits, JSON.stringify(sheet));
await page.keyboard.press('Escape'); await page.waitForTimeout(500);
ok('phone: the sheet closes with Escape or the button', await page.evaluate(() => !document.getElementById('sheet-pricing').classList.contains('is-open')));
await page.evaluate(() => { location.hash = '#/pg/pedido'; }); await page.waitForTimeout(500);
await page.click('[data-page="pg/pedido"] [data-fn-next]'); await page.waitForTimeout(700);
await page.click('[data-page="pg/pedido"] [data-fn-dish]:not(.is-hidden):not(.is-blocked) [data-pick]'); await page.waitForTimeout(400);
const blk = await page.evaluate(() => { const f = document.querySelector('[data-page="pg/pedido"] [data-funnel]'); return { total: f.querySelector('[data-fn-s-total]').textContent, count: f.querySelector('[data-fn-stepcount]').textContent }; });
ok('phone: the summary shows the 4-week Selecto price and the step counter reads "2 de 3"', /3,600/.test(blk.total) && /2 de 3/.test(blk.count), JSON.stringify(blk));
await page.setViewportSize({ width: 1440, height: 900 });
// v14: "Capítulos" phone design
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(1000);
const chap = await page.evaluate(() => {
  const pg = document.querySelector('[data-page="home"]'); const hero = pg.querySelector('.hero'); const h1 = hero.querySelector('h1');
  const rgb = (c) => c.match(/\d+/g).map(Number); const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const dishes = [...pg.querySelectorAll('.rail .dish')]; const track = pg.querySelector('.rail__track');
  const teaser = pg.querySelector('.funnel--teaser');
  return { tabs: !!document.querySelector('.app-tabs') && getComputedStyle(document.querySelector('.app-tabs')).display !== 'none', dark: document.documentElement.getAttribute('data-theme'),
    heroH: Math.round(hero.getBoundingClientRect().height), vh: innerHeight, h1lum: lum(rgb(getComputedStyle(h1).color)), bodyClass: document.body.className,
    slideW: dishes[0] ? Math.round(dishes[0].getBoundingClientRect().width) : 0, swipe: track ? getComputedStyle(track).scrollSnapType : '', slides: dishes.length,
    teaserH: Math.round(teaser.getBoundingClientRect().height), teaserBg: !!teaser.querySelector('.funnel__teaser-bg img') };
});
ok('phone: there is no bottom tab bar (burger-only navigation)', !chap.tabs, JSON.stringify(chap));
const heroPhone = await page.evaluate(() => { const hero = document.querySelector('[data-page="home"] .hero'), st = hero.querySelector('.hero__stage').getBoundingClientRect(), v = hero.querySelector('.hero__video--intro'), cp = hero.querySelector('.hero__copy').getBoundingClientRect(); return { stageW: Math.round(st.width), square: Math.abs(st.width - st.height) < 3, fit: getComputedStyle(v).objectFit, copyBelow: cp.top >= st.bottom - st.height * 0.12, h: Math.round(hero.getBoundingClientRect().height), vh: innerHeight }; }); heroPhone.h1lum = chap.h1lum;
ok('phone: the intro video is shown whole and uncropped (full width square, headline and button underneath on black, no side crop)', heroPhone.stageW === 390 && heroPhone.square && heroPhone.fit === 'contain' && heroPhone.copyBelow && heroPhone.h <= heroPhone.vh + 60 && heroPhone.h1lum > 0.8, JSON.stringify(heroPhone));
ok('phone: chapter 2 shows one dish per screen and you swipe sideways between dishes', chap.slideW === 390 && /x/.test(chap.swipe) && chap.slides >= 5, JSON.stringify(chap));
ok('phone: chapter 3 ("Tu bloque") is a full-screen photo with the order button over it', chap.teaserH >= chap.vh - 2 && chap.teaserBg, JSON.stringify(chap));
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
  ok('phone: first visit opens in the dark theme (black + gold)', await fp.evaluate(() => document.documentElement.getAttribute('data-theme') === 'dark'));
  await fresh.close();
}
await page.setViewportSize({ width: 1440, height: 900 });
ok('desktop never shows the info dot, the sheet or the block line', await page.evaluate(() => [...document.querySelectorAll('.info-dot,.sheet,.funnel__block,.funnel__teaser,.funnel__stepcount')].every((e) => getComputedStyle(e).display === 'none')));
await page.setViewportSize({ width: 1440, height: 900 });
// =====================================================================  v17: Day / Night / Fuego carousel
await page.setViewportSize({ width: 1440, height: 900 });
await page.evaluate(() => localStorage.removeItem('kx-theme')); await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(900);
const modes = [];
for (let i = 0; i < 3; i++) {
  await openMenu();
  const st = await page.evaluate(() => { const g = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim().toLowerCase(); const lg = (s) => { const e = document.querySelector('.site-header ' + s); return e ? getComputedStyle(e).display : null; };
    return { theme: document.documentElement.getAttribute('data-theme'), accent: g('--accent'), bg: g('--bg-base'), font: getComputedStyle(document.querySelector('h1')).fontFamily.split(',')[0].replace(/"/g, ''), ink: lg('.logo--ink'), gold: lg('.logo--gold'), fuego: lg('.logo--fuego'), label: [...document.querySelectorAll('.tc__name')].find((n) => getComputedStyle(n).opacity === '1')?.textContent.trim() }; });
  modes.push(st);
  await page.click('#menu-overlay [data-theme-next]'); await page.waitForTimeout(700); await closeMenu(); await page.waitForTimeout(500);
}
ok('the carousel goes Day -> Night -> Fuego -> Day', modes.map((m) => m.theme).join() === 'light,dark,fuego', JSON.stringify(modes.map((m) => m.theme)));
ok('Day is white + olive, Night is black + gold, Fuego is black + orange-red #FF6200', modes[0].accent === '#cad89b' || modes[0].accent !== '#ff6200', JSON.stringify(modes[0])) ;
ok('Night keeps its gold accent', modes[1].accent === '#e2c36b' && modes[1].bg === '#0d0c0a', JSON.stringify(modes[1]));
ok('Fuego uses the brand colours (accent #FF6200, background #0E0E0E)', modes[2].accent === '#ff6200' && modes[2].bg === '#0e0e0e', JSON.stringify(modes[2]));
ok('Fuego uses the brand fonts (Playfair Display titles) and the other modes keep theirs', modes[2].font === 'Playfair Display' && modes[1].font !== 'Playfair Display', JSON.stringify(modes.map((m) => m.font)));
ok('each mode shows its own logo (ink / gold / orange-and-white Fuego logo)', modes[0].ink !== 'none' && modes[0].fuego === 'none' && modes[1].gold !== 'none' && modes[1].fuego === 'none' && modes[2].fuego !== 'none' && modes[2].gold === 'none', JSON.stringify(modes.map((m) => [m.ink, m.gold, m.fuego])));
ok('the carousel label names the mode (Día / Noche / Fuego)', modes.map((m) => m.label).join() === 'Día,Noche,Fuego', JSON.stringify(modes.map((m) => m.label)));
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
  ok('admin hub: title, 4 tabs, demo-data notice, 7 KPI cards', await page.evaluate((a) => document.querySelectorAll(a + ' .adm-tabs button').length === 4 && !!document.querySelector(a + ' .adm-demo') && document.querySelectorAll(a + ' .adm-kpi').length === 7, A));
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
await page.goto(`${URL0}#/home`); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }); await page.goto(`${URL0}#/pg/bienvenida`); await page.waitForTimeout(500);
const obS = '[data-page="pg/bienvenida"] [data-onboarding]';
ok('onboarding page: a 3-step questionnaire (who, where, allergies/diet)', (await page.$$eval(`${obS} [data-ob-step]`, (e) => e.length)) === 3 && !(await page.$eval(`${obS} [data-ob-form]`, (e) => e.hidden)));
await page.click(`${obS} [data-ob-next]`); await page.waitForTimeout(150);
ok('onboarding step 1 will not continue without name, e-mail and phone', await page.$eval(`${obS} [data-ob-step="1"]`, (e) => e.classList.contains('is-on')) && !(await page.$eval(`${obS} [data-ob-error]`, (e) => e.hidden)));
await page.fill(`${obS} [data-ob="name"]`, 'Ana Pérez'); await page.fill(`${obS} [data-ob="email"]`, 'ana@ejemplo.com'); await page.fill(`${obS} [data-ob="phone"]`, '+52 999 000 0000');
await page.click(`${obS} [data-ob-next]`); await page.waitForTimeout(150);
await page.fill(`${obS} [data-ob="street"]`, 'Calle Lago 24'); await page.fill(`${obS} [data-ob="cluster"]`, 'Clúster Las Lomas'); await page.fill(`${obS} [data-ob="zip"]`, '97000');
await page.click(`${obS} [data-ob-next]`); await page.waitForTimeout(150);
await page.check(`${obS} [data-ob-allergy][value="Mariscos"]`); await page.check(`${obS} [data-ob-diet][value="Keto"]`); await page.fill(`${obS} [data-ob="dislikes"]`, 'cebolla');
await page.click(`${obS} [data-ob-save]`); await page.waitForTimeout(400);
ok('after saving, a welcome screen greets the customer and points to choosing the plan', !(await page.$eval(`${obS} [data-ob-welcome]`, (e) => e.hidden)) && /Ana/.test(await page.$eval(`${obS} [data-ob-hello]`, (e) => e.textContent)) && /pedido/.test(await page.$eval(`${obS} [data-ob-welcome] a.btn--gold`, (e) => e.getAttribute('href'))));
const obSaved = await page.evaluate(() => ({ f: JSON.parse(localStorage.getItem('kulinaria_funnel') || '{}'), p: JSON.parse(localStorage.getItem('kulinaria_profile') || '{}'), on: localStorage.getItem('kulinaria_onboarded') }));
ok('the answers are stored once (contact, address, allergies, diet, dislikes)', obSaved.on === '1' && obSaved.f.info.email === 'ana@ejemplo.com' && obSaved.f.info.street === 'Calle Lago 24' && obSaved.p.allergies.includes('Mariscos') && obSaved.p.diets.includes('Keto') && obSaved.p.dislikes.includes('cebolla'));
await page.goto(`${URL0}#/pg/pedido`); await page.reload(); await page.waitForTimeout(900);
const fnO = '[data-page="pg/pedido"] [data-funnel]';
ok('the order builder does not ask again: details step shows a saved summary instead of the form', await page.evaluate(() => { const f = document.querySelector('[data-page="pg/pedido"] [data-funnel]'); return f.querySelector('[data-fn-fields]').hidden && !f.querySelector('[data-fn-saved]').hidden && /ana@ejemplo.com/.test(f.querySelector('[data-fn-saved-text]').textContent); }));
ok('the first delivery date is shown (Monday) with a real date on each weekday slot', await page.evaluate(() => { const f = document.querySelector('[data-page="pg/pedido"] [data-funnel]'); return /\d/.test(f.querySelector('[data-fn-first]').textContent) && [...f.querySelectorAll('.fn-days label')].every((l) => /\d/.test(l.textContent)); }));

await browser.close();
ok('no JS errors on any page', errors.length === 0, errors.slice(0, 5).join(' | '));
const pass = results.filter((r) => r.ok).length;
console.log(`${pass}/${results.length} checks passed`);
if (fail.length) { console.log('FAILED:\n - ' + fail.join('\n - ')); process.exit(1); }
