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

const results = []; const fail = [];
const ok = (name, cond, extra = '') => { results.push({ name, ok: !!cond }); if (!cond) fail.push(name + (extra ? ' :: ' + extra : '')); };

ok('no dead internal links in rendered templates', dead.length === 0, JSON.stringify(dead));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
// mobile nav toggle
await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${URL0}#/home`);
await page.click('[data-nav-toggle]');
ok('mobile nav opens', await page.$eval('[data-nav]', (n) => n.classList.contains('is-open')));
await page.click('[data-nav] a[href="#/pg/planes"]'); await page.waitForTimeout(80);
ok('mobile nav navigates and closes', page.url().endsWith('#/pg/planes') && !(await page.$eval('[data-nav]', (n) => n.classList.contains('is-open'))));

// ---- screenshots for eyeballing
if (shotDir) {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const k of ['home', 'menu', 'p/salmon-costra-almendras', 'pg/planes', 'pg/embajadores', 'carrito', 'cuenta', 'pg/carta-kulinaria', 'pg/ayuda', 'login']) {
    await page.goto(`${URL0}#/${k}`); await page.waitForTimeout(500);
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
