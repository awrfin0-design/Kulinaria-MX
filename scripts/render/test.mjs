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
  ok(`[${r.key}] headline in Kaushan Script`, /Kaushan/.test(info.hFont), info.hFont);
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
const groups = ['.site-nav a', '.site-footer a', '[data-page="home"] a.btn'];
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
ok('menu shows 8 dishes', (await page.$$eval(`${scope} [data-dish]:not(.is-hidden)`, (e) => e.length)) === 8);
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
{ const n = await page.$$eval(`${scope} [data-dish]:not(.is-hidden)`, (e) => e.map((x) => x.dataset.diets)); ok('chip from home -> menu filtered by sin-gluten (4 gluten-free dishes, previous filters cleared)', n.length === 4 && n.every((d) => d.split('|').includes('sin-gluten')), n.length + ' shown'); }

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
await page.click('[data-page="p/bowl-res-quinoa"] [data-add]'); await page.waitForTimeout(100);
ok('add to selection goes to cart', page.url().endsWith('#/carrito'));
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
  await p2.goto(`${URL0}#/cuenta`); await p2.waitForTimeout(150);
  const s = await p2.$$eval('[data-page="cuenta"] [data-pause-lock]', (b) => b.map((x) => x.getAttribute('aria-disabled')));
  const msgs = await p2.$$eval('[data-page="cuenta"] [data-lock-msg]', (m) => m.map((x) => !x.hidden));
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
await page.goto(`${URL0}#/registro`); await page.fill('[data-page="registro"] #registro--reg-first', 'Ana'); await page.fill('[data-page="registro"] #registro--reg-last', 'P');
await page.fill('[data-page="registro"] #registro--reg-email', 'a@b.co'); await page.fill('[data-page="registro"] #registro--reg-pass', 'secret1');
await page.click('[data-page="registro"] form button[type="submit"]'); await page.waitForTimeout(100);
ok('register submits to account', page.url().endsWith('#/cuenta'));
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
ok('header hides when scrolling down', await page.$eval('.site-header', (e) => e.classList.contains('is-hidden')));
ok('sticky offset drops to 0 while header hidden', (await page.evaluate(() => document.documentElement.style.getPropertyValue('--stick'))) === '0px');
await page.evaluate(() => window.scrollTo(0, 1100)); await page.waitForTimeout(350);
ok('header returns when scrolling up', !(await page.$eval('.site-header', (e) => e.classList.contains('is-hidden'))));
ok('header has glass background after scrolling', await page.$eval('.site-header', (e) => e.classList.contains('is-stuck')));

// reveals: after a full scroll-through every reveal target on the home page is revealed
await scrollThrough(page);
const unrevealed = await page.$$eval('[data-page="home"] .reveal:not(.is-in), [data-page="home"] .split:not(.is-in)', (e) => e.filter((x) => !x.closest('.rail__track')).length);
ok('all scroll reveals fire on the home page (carousel cards reveal when scrolled into view)', unrevealed === 0, String(unrevealed));

// marquee runs
const m1 = await page.$eval('[data-page="home"] .marquee__track', (e) => new DOMMatrix(getComputedStyle(e).transform).m41);
await page.waitForTimeout(700);
const m2 = await page.$eval('[data-page="home"] .marquee__track', (e) => new DOMMatrix(getComputedStyle(e).transform).m41);
ok('marquee is animating', m2 < m1 - 3, `${m1} -> ${m2}`);

// stack cards pile up (sticky) and sticky split keeps its intro in view
await page.evaluate(() => { const s = document.querySelector('[data-page="home"] .fg--stack'); window.scrollTo(0, s.getBoundingClientRect().top + window.scrollY + 380); });
await page.waitForTimeout(500);
const stack = await page.$$eval('[data-page="home"] .fg--stack .card', (c) => c.map((x) => Math.round(x.getBoundingClientRect().top)));
ok('stack: first card is pinned near the top while later cards are still below', stack[0] < 220 && stack[0] >= 0 && stack[2] > stack[0] + 20, stack.join(','));
await page.evaluate(() => { const s = document.querySelector('[data-page="home"] .fg--sticky'); window.scrollTo(0, s.getBoundingClientRect().top + window.scrollY + 450); });
await page.waitForTimeout(500);
const head = await page.$eval('[data-page="home"] .fg--sticky .section__head', (e) => Math.round(e.getBoundingClientRect().top));
ok('sticky split: intro stays pinned while cards scroll', head > 0 && head < 260, String(head));

// button fill + magnetic + spotlight
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400);
const btnSel = '[data-page="home"] .hero .btn--gold';
const before = await page.$eval(btnSel, (e) => parseFloat(getComputedStyle(e, '::before').width));
await page.hover(btnSel); await page.waitForTimeout(1000);
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
await page.click('.nav-toggle');
await page.waitForTimeout(900);
ok('mobile burger opens the full-screen menu', await page.$eval('#menu-overlay', (n) => !n.hidden && n.classList.contains('is-open')) && (await page.$eval('.nav-toggle', (n) => n.getAttribute('aria-expanded'))) === 'true');
await page.click('#menu-overlay a[href="#/pg/planes"]'); await page.waitForTimeout(1100);
ok('mobile menu navigates and closes', page.url().endsWith('#/pg/planes') && (await page.$eval('#menu-overlay', (n) => n.hidden)));

// =====================================================================  v3: no banner, theme, language, loader, media, 3D
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(600);
ok('no "Vista previa" banner anywhere', (await page.$$('.preview-bar')).length === 0 && !/vista previa/i.test(await page.evaluate(() => document.body.innerText)));
ok('index of pages is still reachable at #/indice', await (async () => { await page.goto(`${URL0}#/indice`); await page.waitForTimeout(150); return (await page.$$eval('[data-page="indice"] a', (a) => a.length)) >= 18; })());
await page.goto(`${URL0}#/home`); await page.waitForTimeout(300);

// full-screen menu (desktop "Más")
await page.click('.site-nav__more'); await page.waitForTimeout(1000);
ok('"Más" opens the full-screen menu with every main link', await page.$eval('#menu-overlay', (n) => !n.hidden) && (await page.$$eval('#menu-overlay .menu-overlay__main a', (a) => a.length)) >= 5);
ok('menu dialog is modal and labelled', await page.$eval('#menu-overlay', (n) => n.getAttribute('role') === 'dialog' && n.getAttribute('aria-modal') === 'true' && !!n.getAttribute('aria-label')));
await page.keyboard.press('Escape'); await page.waitForTimeout(1000);
ok('Escape closes the menu and returns focus', (await page.$eval('#menu-overlay', (n) => n.hidden)) && (await page.evaluate(() => document.activeElement.className)).includes('site-nav__more'));
ok('header shows only the primary links + "Más"', (await page.$$eval('.site-header .site-nav a', (a) => a.length)) === 3);

// light / dark
const themeOf = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const bgOf = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
ok('light is the default theme', (await themeOf()) === 'light');
const lightBg = await bgOf();
await page.click('.site-header [data-theme-toggle]'); await page.waitForTimeout(900);
const darkBg = await bgOf();
ok('toggle switches to dark and changes the page colours', (await themeOf()) === 'dark' && lightBg !== darkBg, `${lightBg} -> ${darkBg}`);
ok('theme choice is remembered', await page.evaluate(() => localStorage.getItem('kx-theme')) === 'dark');
ok('toggle label + pressed state follow the theme', (await page.$eval('.site-header [data-theme-toggle]', (b) => b.getAttribute('aria-pressed'))) === 'true');
await page.reload(); await page.waitForTimeout(500);
ok('dark theme persists after reload (before paint)', (await themeOf()) === 'dark');
const contrast = await page.evaluate(() => {
  const lum = (c) => { const m = c.match(/\d+(\.\d+)?/g).map(Number).slice(0, 3).map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * m[0] + .7152 * m[1] + .0722 * m[2]; };
  const r = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
  const s = getComputedStyle(document.body); return r(s.color, s.backgroundColor);
});
ok('dark body text contrast >= 7', contrast >= 7, String(contrast));
await page.click('.site-header [data-theme-toggle]'); await page.waitForTimeout(700);
const contrastL = await page.evaluate(() => {
  const lum = (c) => { const m = c.match(/\d+(\.\d+)?/g).map(Number).slice(0, 3).map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * m[0] + .7152 * m[1] + .0722 * m[2]; };
  const r = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
  const s = getComputedStyle(document.body); const acc = getComputedStyle(document.querySelector('[data-page="home"] .fg .eyebrow')).color; return { body: r(s.color, s.backgroundColor), accent: r(acc, s.backgroundColor) };
});
ok('light body text contrast >= 7 and gold labels >= 4.5', contrastL.body >= 7 && contrastL.accent >= 4.5, JSON.stringify(contrastL));

// language: ES -> EN reload, every page translated, switch back
ok('html lang is es by default', (await page.evaluate(() => document.documentElement.lang)) === 'es');
await page.click('.site-header .lang__btn[value="en"]'); await page.waitForTimeout(900);
ok('language switch persists en and reloads in English', (await page.evaluate(() => document.documentElement.lang)) === 'en' && /Your week, served like a signature piece/.test(await page.$eval('[data-page="home"] .hero h1', (h) => h.getAttribute('aria-label') || h.innerText)));
ok('header and CTA are in English', /choose my plan/i.test(await page.$eval('.site-header__cta', (a) => a.textContent)) && (await page.$eval('.site-nav a', (a) => a.textContent.trim())) === 'Menu');
const leaks = [];
for (const k of keys.filter((k) => !k.startsWith('p/') || k === 'p/salmon-costra-almendras')) {
  await page.goto(`${URL0}#/${k}`); await page.waitForTimeout(80);
  const t = await page.$eval(`[data-page="${k}"]`, (e) => e.innerText);
  const bad = t.match(/\b(Elegir|Menú|Planes|Platillos?|Cierre|Ver el|Guardar|Quitar|Carrito|Pedido|Cuenta|Contrase|Dirección|Entrega|alergias?)\b/g);
  if (bad) leaks.push(`${k}: ${[...new Set(bad)].join(',')}`);
}
ok('no Spanish UI strings leak into the English storefront', leaks.length === 0, leaks.join(' | '));
await page.goto(`${URL0}#/menu`); await page.waitForTimeout(200);
ok('menu filters are translated and still work in English', (await page.$eval('[data-page="menu"] [data-filter="category"][data-value="al-fuego-y-mar"]', (b) => b.textContent.trim())) === 'Fire & Sea');
await page.click('[data-page="menu"] [data-filter="category"][data-value="al-fuego-y-mar"]');
ok('category filter works in English', (await page.$$eval('[data-page="menu"] [data-dish]:not(.is-hidden)', (e) => e.length)) === 3);
await page.goto(`${URL0}#/pg/perfil`); await page.waitForTimeout(150);
await page.check('[data-page="pg/perfil"] input[name="allergy"][value="Frutos secos"]'); await page.click('[data-page="pg/perfil"] button[type="submit"]'); await page.waitForTimeout(100);
await page.goto(`${URL0}#/p/salmon-costra-almendras`); await page.waitForTimeout(150);
ok('allergen blocking still works in English (canonical metafield values) with English alert text', await page.evaluate(() => { const d = document.querySelector('[data-page="p/salmon-costra-almendras"]'); return !d.querySelector('[data-allergen-alert]').hidden && /Not suitable for your profile/.test(d.querySelector('[data-allergen-alert]').textContent) && d.querySelector('[data-add]').disabled; }));
await page.evaluate(() => localStorage.removeItem('kulinaria_profile'));
await page.click('.site-header .lang__btn[value="es"]'); await page.waitForTimeout(900);
ok('language switches back to Spanish', (await page.evaluate(() => document.documentElement.lang)) === 'es' && /Elegir mi plan/.test(await page.$eval('.site-header__cta', (a) => a.textContent)));

// every locale key in es has an English twin (and vice versa)
{
  const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, p + k + '.') : [p + k]));
  const es = flat(JSON.parse(fs.readFileSync(path.join(ROOT, 'locales/es.default.json'), 'utf8'))), en = flat(JSON.parse(fs.readFileSync(path.join(ROOT, 'locales/en.json'), 'utf8')));
  ok('locales/en.json has exactly the keys of es.default.json', es.length === en.length && es.every((k) => en.includes(k)), es.filter((k) => !en.includes(k)).join(','));
  const used = new Set(); for (const f of fs.readdirSync(path.join(ROOT, 'sections')).filter((f) => f.endsWith('.liquid')).map((f) => 'sections/' + f).concat(fs.readdirSync(path.join(ROOT, 'snippets')).map((f) => 'snippets/' + f), ['layout/theme.liquid'])) {
    for (const m of fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(/'([a-z_0-9-]+(?:\.[a-z_0-9-]+)+)'\s*\|\s*t\b/g)) used.add(m[1]);
  }
  ok('every static t-key used in Liquid exists in the locale', [...used].every((k) => es.includes(k)), [...used].filter((k) => !es.includes(k)).join(','));
}

// loading screen: shown on first visit, gone once loaded, skipped later in the session
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

// particle background + wood
{
  const cv = await page.evaluate(() => { const c = document.querySelector('[data-particles]'); const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++; return { w: c.width, n }; });
  ok('particle canvas is drawing', cv.w > 0 && cv.n > 20, JSON.stringify(cv));
  ok('background layer is fixed behind the page', await page.$eval('.bg-fx', (e) => getComputedStyle(e).position === 'fixed' && getComputedStyle(e).zIndex === '-1'));
}

// photos + videos
await page.goto(`${URL0}#/home`); await page.waitForTimeout(500); await scrollThrough(page);
const media = await page.evaluate(async () => {
  const imgs = [...document.querySelectorAll('[data-page="home"] img')].filter((i) => !i.classList.contains('logo'));
  imgs.forEach((i) => { i.loading = 'eager'; });
  await Promise.race([Promise.all(imgs.map((i) => (i.complete ? 1 : new Promise((r) => { i.onload = i.onerror = r; })))), new Promise((r) => setTimeout(r, 6000))]);
  return { n: imgs.length, broken: imgs.filter((i) => i.naturalWidth === 0).map((i) => i.src.slice(0, 40)), dishPhotos: document.querySelectorAll('[data-page="home"] .dish__media img').length };
});
ok('home photos all load (hero cards, stack, dishes, showcase, cta)', media.n >= 14 && media.broken.length === 0, JSON.stringify(media));
ok('dish cards use their own photos, not the logo placeholder', media.dishPhotos >= 6);
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(1500);
const hv = await page.evaluate(() => { const v = document.querySelector('[data-page="home"] [data-slide].is-on video'); return { playing: !v.paused && v.currentTime > 0, src: v.src.slice(0, 5), poster: !!v.poster }; });
ok('hero video is playing (blob source) with a poster', hv.playing && hv.src === 'blob:' && hv.poster, JSON.stringify(hv));
const slideOn = () => page.evaluate(() => [...document.querySelectorAll('[data-page="home"] [data-slide]')].findIndex((x) => x.classList.contains('is-on')));
const s0 = await slideOn(); await page.waitForTimeout(8600); const s1 = await slideOn();
ok('hero alternates between its two videos', s0 !== -1 && s1 !== -1 && s0 !== s1 && (await page.$$('[data-page="home"] [data-slide]')).length === 2, `${s0} -> ${s1}`);
await page.click('[data-page="home"] [data-media-toggle]'); await page.waitForTimeout(300);
ok('hero pause button stops the video', await page.evaluate(() => [...document.querySelectorAll('[data-page="home"] [data-hero] video')].every((v) => v.paused)));
await page.click('[data-page="home"] [data-media-toggle]');
// scroll-driven video band
const bandY = await page.evaluate(() => { const b = document.querySelector('[data-page="home"] [data-band]'); return b.getBoundingClientRect().top + scrollY; });
const bandH = await page.evaluate(() => { const b = document.querySelector('[data-page="home"] [data-band]'); return b.offsetHeight - innerHeight; });
const times = [];
for (const f of [0.1, 0.5, 0.9]) { await page.evaluate((y) => window.scrollTo(0, y), bandY + bandH * f); await page.waitForTimeout(1300); times.push(await page.$eval('[data-page="home"] [data-scrub]', (v) => +v.currentTime.toFixed(2))); }
ok('scroll scrubs the band video forward', times[0] < times[1] && times[1] < times[2], times.join(' -> '));
ok('band text lines light up with progress', (await page.$$eval('[data-page="home"] .band__line.is-on', (e) => e.length)) === 3);
// fire inside buttons
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(600);
await page.hover('[data-page="home"] .hero .btn--gold'); await page.waitForTimeout(1200);
ok('hovering a button ignites the fire video inside it', await page.evaluate(() => { const b = document.querySelector('[data-page="home"] .hero .btn--gold'); const v = b.querySelector('.btn__fx video'); return b.classList.contains('is-fx') && !!v && !v.paused && parseFloat(getComputedStyle(b.querySelector('.btn__fx')).opacity) > 0.5; }));
await page.mouse.move(5, 500); await page.waitForTimeout(1200);
ok('fire stops when the pointer leaves', await page.evaluate(() => { const b = document.querySelector('[data-page="home"] .hero .btn--gold'); return !b.classList.contains('is-fx') && b.querySelector('.btn__fx video').paused; }));
// 3D: hero stack follows the pointer, dish cards tilt, index shows a photo peek
const c0 = await page.$eval('[data-page="home"] .hero__card--2', (e) => getComputedStyle(e).transform);
await page.mouse.move(1300, 200); await page.waitForTimeout(700);
ok('hero photo cards move in 3D with the pointer', (await page.$eval('[data-page="home"] .hero__card--2', (e) => getComputedStyle(e).transform)) !== c0);
await page.evaluate(() => { const r = document.querySelector('[data-page="home"] [data-rail]'); window.scrollTo(0, r.getBoundingClientRect().top + window.scrollY - 120); }); await page.waitForTimeout(700);
const dm = '[data-page="home"] .rail .dish__media';
const dbox = await page.$eval(dm, (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
await page.mouse.move(dbox.x + dbox.w * 0.85, dbox.y + dbox.h * 0.2); await page.waitForTimeout(500);
ok('dish card tilts toward the pointer', (await page.$eval(dm, (e) => parseFloat(e.style.getPropertyValue('--ry')))) > 1.5);
ok('carousel cards have a coverflow angle', await page.$$eval('[data-page="home"] .rail .dish', (c) => c.some((x) => x.style.getPropertyValue('--ry') !== '' && parseFloat(x.style.getPropertyValue('--ry')) !== 0)));
await page.evaluate(() => { const r = document.querySelector('[data-page="home"] .fg--index'); window.scrollTo(0, r.getBoundingClientRect().top + window.scrollY - 100); }); await page.waitForTimeout(700);
const row = await page.$eval('[data-page="home"] .index-row[data-peek]', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + 200, y: r.top + r.height / 2 }; });
await page.mouse.move(row.x, row.y); await page.mouse.move(row.x + 10, row.y + 4); await page.waitForTimeout(600);
ok('hovering a category row shows its photo next to the cursor', await page.evaluate(() => { const p = document.querySelector('.peek'); return !!p && p.classList.contains('is-on') && /^blob:/.test(p.querySelector('img').src); }));

// ---- screenshots for eyeballing
if (shotDir) {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const k of ['home', 'menu', 'p/salmon-costra-almendras', 'pg/planes', 'pg/embajadores', 'carrito', 'cuenta', 'pg/carta-kulinaria', 'pg/ayuda', 'login']) {
    await page.goto(`${URL0}#/${k}`); await page.waitForTimeout(400); await scrollThrough(page);
    await page.screenshot({ path: path.join(shotDir, k.replace(/\W+/g, '_') + '.png'), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${URL0}#/home`); await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shotDir, 'mobile_home.png') });
}

await browser.close();
ok('no JS errors on any page', errors.length === 0, errors.slice(0, 5).join(' | '));
const pass = results.filter((r) => r.ok).length;
console.log(`${pass}/${results.length} checks passed`);
if (fail.length) { console.log('FAILED:\n - ' + fail.join('\n - ')); process.exit(1); }
