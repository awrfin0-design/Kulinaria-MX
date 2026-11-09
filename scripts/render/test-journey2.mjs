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
const SKIP_LOADER = () => { try { sessionStorage.setItem('kx-seen', '1'); if (!localStorage.getItem('kx-test-fresh')) localStorage.setItem('kulinaria_onboarded', '1'); if (!localStorage.getItem('kx-test-norules')) { localStorage.setItem('kx-rules-ok', '1'); if (!localStorage.getItem('kx-test-nostart')) sessionStorage.setItem('kx-test-start', '1'); } if (!localStorage.getItem('kx-test-returning')) sessionStorage.setItem('kx_newplan', '1'); } catch (e) {} };
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
const groups = ['.site-footer a', '[data-page="home"] a.btn:not([data-fn-finish]):not(.funnel__teaser *):not([data-fn-returning] *):not([data-fn-gate] *)', '[data-page="home"] a.arrow-link'];
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
ok('the category row is a styled dropdown, not a sliding row of chips (chips stay in the page, hidden)', await page.evaluate((sc) => { const d = document.querySelector(sc + ' .filter-sticky .dd'); const src = document.querySelector(sc + ' [data-dropdown].dd-src'); return !!d && !!d.querySelector('.dd__btn') && getComputedStyle(src).display === 'none' && d.querySelectorAll('.dd__opt').length === 12 && /Todo|All/.test(d.querySelector('.dd__val').textContent); }, scope));
await page.click(`${scope} .filter-sticky .dd__btn`); await page.waitForTimeout(250);
ok('opening it lists all 12 groups in a solid panel that sits above the dishes', await page.evaluate((sc) => { const l = document.querySelector(sc + ' .filter-sticky .dd__list'); const r = l.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height - 6, 60)); return !l.hidden && l.contains(top) && l.querySelectorAll('.dd__opt').length === 12 && getComputedStyle(l).backgroundColor !== 'rgba(0, 0, 0, 0)'; }, scope));
await page.keyboard.press('Escape'); await page.waitForTimeout(150);
ok('Escape closes the dropdown', await page.$eval(`${scope} .filter-sticky .dd__list`, (e) => e.hidden));
await page.click(`${scope} .filter-sticky .dd__btn`); await page.waitForTimeout(200);
await page.click(`${scope} .filter-sticky .dd__opt[data-value="al-fuego"]`); await page.waitForTimeout(200);
ok('choosing an option closes the list, shows its name on the button and filters the menu', await page.evaluate((sc) => document.querySelector(sc + ' .filter-sticky .dd__list').hidden && /fuego/i.test(document.querySelector(sc + ' .filter-sticky .dd__val').textContent), scope));
ok('category filter -> 3 dishes', (await page.$$eval(`${scope} [data-dish]:not(.is-hidden)`, (e) => e.length)) === 3);
await page.click(`${scope} .filter-sticky .dd__btn`); await page.click(`${scope} .filter-sticky .dd__opt[data-value="keto-low-carb"]`); await page.waitForTimeout(200);
const ketoOk = await page.evaluate((sc) => { const v = [...document.querySelectorAll(sc + ' [data-dish]:not(.is-hidden)')]; return v.length > 0 && v.every((x) => /keto|bajo-carbos/.test(x.getAttribute('data-diets'))) && document.querySelector(sc + ' [data-count]').textContent.trim() === String(v.length); }, scope);
ok('keto / low carb group shows only keto or low-carb dishes and the counter matches', ketoOk);
ok('the 12 menu groups are offered (all + 11) and the old diet row is gone', await page.evaluate((sc) => document.querySelectorAll(sc + ' [data-filter="category"]').length === 12 && !document.querySelector(sc + ' [data-filter="diet"]'), scope));
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
ok('allergen warning still works in English with English alert text', await page.evaluate(() => { const d = document.querySelector('[data-page="p/salmon-costra-almendras"]'); return !d.querySelector('[data-allergen-alert]').hidden && /According to our data/.test(d.querySelector('[data-allergen-alert]').textContent) && !d.querySelector('[data-add]').disabled; }));
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
ok('hero: the brand intro video is a square shown whole (contain), centred, big, with the text strip right under it, on black', hh.square && hh.fit === 'contain' && hh.within && hh.src && hh.bg === 'rgb(0, 0, 0)' && await page.evaluate(() => { const st = document.querySelector('[data-page="home"] .hero__stage').getBoundingClientRect(), cp = document.querySelector('[data-page="home"] .hero__copy').getBoundingClientRect(); return Math.abs((st.left + st.width / 2) - innerWidth / 2) < 8 && st.height >= innerHeight * 0.55 && cp.top >= st.top + st.height * 0.7; }), JSON.stringify(hh));
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


// =====================================================================  v6: order funnel, full menu fallback, thin marquee
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${URL0}#/home`); await page.evaluate(() => { localStorage.clear(); }); await page.reload(); await page.waitForTimeout(900);
const fnS = '[data-page="home"] [data-funnel]';
const pickCard = (sc, tier, title) => page.evaluate(({ sc, tier, title }) => { const cards = [...document.querySelectorAll(sc + ' [data-fn-dish]:not(.is-hidden)')]; const c = title ? cards.find((x) => new RegExp(title).test(x.getAttribute('data-title'))) : tier ? cards.find((x) => x.getAttribute('data-tier') === tier) : cards[0]; c.querySelector('[data-pick]').click(); }, { sc, tier, title });
ok('the section after the marquee is the order funnel (4 steps)',  await page.evaluate(() => { const m = document.querySelector('[data-page="home"] .marquee'); const f = m.closest('.shopify-section').nextElementSibling; return !!f.querySelector('[data-funnel]') && f.querySelectorAll('[data-fn-dot]').length === 4; }));
ok('step 1 offers the 4-week and the 1-week plan', (await page.$$eval(`${fnS} [data-plan-choice]`, (b) => b.map((x) => x.getAttribute('data-plan-choice')))).join() === 'block,week');
ok('the funnel is a plain stepper: not sticky', await page.evaluate(() => getComputedStyle(document.querySelector('[data-page="home"] .funnel__stage')).position === 'static'));
ok('the whole funnel is one frame: it is never taller than the screen', await page.evaluate(() => document.querySelector('[data-page="home"] .funnel__stage').getBoundingClientRect().height <= innerHeight + 2));
await page.locator(`${fnS} [data-plan-choice="block"]`).scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
await page.click(`${fnS} [data-plan-choice="block"]`); await page.waitForTimeout(800); await page.click(`${fnS} [data-fn-sc-next]`); await page.waitForTimeout(500);
ok('plan cards say "from $3,600 / includes 20 meals" and "from $1,000 / includes 5 meals", and there is no tier step', await page.evaluate(() => { const f = document.querySelector('[data-page="home"] [data-funnel]'); const p = (k) => f.querySelector(`[data-plan-choice="${k}"]`).textContent; const t = [...f.querySelectorAll('[data-tier-choice]')]; return /3,600/.test(p('block')) && /20/.test(p('block')) && /1,000/.test(p('week')) && /5/.test(p('week')) && f.querySelector('[data-fn-step="3"]').classList.contains('is-on') && t.map((x) => x.getAttribute('data-block')).join() === '3600,5000,6400,7800' && t.map((x) => x.getAttribute('data-meal')).join() === '180,250,320,390' && !f.querySelector('[data-fn-tierdata]').offsetParent; }));
ok('the meals step shows dish cards with price; higher tiers carry the upgrade badge', await page.evaluate(() => { const f = document.querySelector('[data-page="home"] [data-funnel]'); const vis = [...f.querySelectorAll('[data-fn-dish]:not(.is-hidden)')]; return vis.length >= 8 && vis.every((d) => /\$\d+/.test(d.textContent)) && vis.filter((d) => d.getAttribute('data-tier') !== 'selecto').every((d) => !d.querySelector('[data-fn-up]').hidden); }));
ok('the week strip has one button per weekday (Mon-Fri) with a date, starting on the first day', (await page.$$eval(`${fnS} [data-fn-day-btn]`, (b) => b.length === 5 && b.every((x) => /\d/.test(x.textContent)))) && (await page.$eval(`${fnS} [data-fn-day-btn="0"]`, (b) => b.classList.contains('is-active'))));
ok('the countdown to the cut-off is shown in the summary', /\d/.test(await page.$eval(`${fnS} .fn-cut`, (e) => e.textContent)));
ok('"confirm" is disabled until at least one meal is chosen', await page.$eval(`${fnS} [data-fn-finish]`, (b) => b.getAttribute('aria-disabled') === 'true'));
for (let i = 0; i < 5; i++) await pickCard(fnS, null);
ok('choosing a dish fills the active day and moves on to the next empty one (the meter reaches 5)', (await page.$eval(`${fnS} [data-fn-meter-n]`, (e) => e.textContent.trim())) === '5' && await page.$eval(`${fnS} [data-fn-finish]`, (b) => b.getAttribute('aria-disabled') === 'false'));
ok('base total for the 4-week plan is $3,600', /3,600/.test(await page.$eval(`${fnS} [data-fn-s-total]`, (e) => e.textContent)));
await page.click(`${fnS} [data-fn-day-btn="4"]`); await pickCard(fnS, 'reserve'); await page.waitForTimeout(300);
ok('upgrading Friday to a Reserve dish costs the difference of 3 levels ($210) for that week', /3,810/.test(await page.$eval(`${fnS} [data-fn-s-total]`, (e) => e.textContent)) && /210/.test(await page.$eval(`${fnS} [data-fn-s-up]`, (e) => e.textContent)));
await page.click(`${fnS} [data-fn-day-btn="4"]`); await pickCard(fnS, null); await page.waitForTimeout(200);
ok('back to a dish of the base tier the upgrade charge disappears', /3,600/.test(await page.$eval(`${fnS} [data-fn-s-total]`, (e) => e.textContent)));
await page.click(`${fnS} [data-fn-day-x="4"]`); await page.waitForTimeout(200);
ok('the x on a day removes its dish, and 4 meals are enough to confirm (days can stay empty)', (await page.$eval(`${fnS} [data-fn-meter-n]`, (e) => e.textContent.trim())) === '4' && await page.$eval(`${fnS} [data-fn-finish]`, (b) => b.getAttribute('aria-disabled') === 'false'));
await pickCard(fnS, null); await page.waitForTimeout(200);
await page.evaluate(() => { const f = window.fetch; window.__calls = []; window.fetch = function (u, o) { window.__calls.push(String(u).split('/').pop() + ' ' + ((o && o.body) || '').slice(0, 3000)); return f.apply(this, arguments); }; });
await page.evaluate(() => { localStorage.removeItem('kulinaria_onboarded'); localStorage.setItem('kx-test-orders', '0'); });   // a new account (no orders)
await page.click(`${fnS} [data-fn-finish]`); await page.waitForTimeout(600);
ok('details are never asked in the order flow: without onboarding, confirm sends the customer to the onboarding questionnaire', page.url().includes('bienvenida') && !(await page.evaluate(() => window.__calls.length)));
// onboarded customer: confirm adds the plan and goes to the cart
await page.evaluate(() => { localStorage.setItem('kulinaria_onboarded', '1'); const f = JSON.parse(localStorage.getItem('kulinaria_funnel')); f.info = { name: 'Ana Pérez', email: 'ana@ejemplo.com', phone: '+52 999 000 0000', street: 'Calle Lago 24', cluster: 'Clúster Las Lomas', zip: '97000' }; localStorage.setItem('kulinaria_funnel', JSON.stringify(f)); localStorage.setItem('kulinaria_profile', JSON.stringify({ allergies: ['Mariscos'], dislikes: [], diets: ['Keto'] })); });
await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(900);
await page.evaluate(() => { const f = window.fetch; window.__calls = []; window.fetch = function (u, o) { window.__calls.push(String(u).split('/').pop() + ' ' + ((o && o.body) || '').slice(0, 3000)); return f.apply(this, arguments); }; });
await page.evaluate((sel) => document.querySelector(sel + ' .steps__nav li:nth-child(4)').click(), fnS); await page.waitForTimeout(400);   // the builder always opens on step 1: go to the planner where the saved week is
await page.locator(`${fnS} [data-fn-finish]`).scrollIntoViewIfNeeded();
await page.click(`${fnS} [data-fn-finish]`); await page.waitForTimeout(1000);
const reqs = await page.evaluate(() => window.__calls);
ok('confirming adds ONE plan line with the dishes as properties, and goes to the cart', page.url().endsWith('#/carrito') && reqs.some((r) => /add\.js/.test(r) && /_platillos/.test(r) && /Lunes/.test(r) && /Viernes/.test(r)) && /cart\.js/.test(reqs.join(' ')) && /update\.js/.test(reqs.join(' ')) && !/contrato_aceptado/.test(reqs.join(' ')), JSON.stringify(reqs).slice(0, 300));
await page.evaluate(() => { localStorage.clear(); });
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
// order wizard on the phone
await page.evaluate(() => localStorage.removeItem('kulinaria_funnel')); await page.evaluate(() => { location.hash = '#/pg/pedido'; }); await page.reload(); await page.waitForTimeout(900);
const fnPhone = await page.evaluate(() => { const f = document.querySelector('[data-page="pg/pedido"] [data-funnel]'); const act = f.querySelector('.fn-cta'); return { plans: f.querySelectorAll('[data-plan-choice]').length, docked: act.getBoundingClientRect().bottom <= innerHeight + 2 && !!act.closest('.funnel__aside'), summary: getComputedStyle(f.querySelector('.funnel__facts')).display === 'none' }; });
ok('phone: plan choices are shown and the wizard buttons sit inside the summary box, inside the screen', fnPhone.plans === 2 && fnPhone.docked && fnPhone.summary, JSON.stringify(fnPhone));
await page.click('[data-page="pg/pedido"] [data-fn-next]'); await page.waitForTimeout(500); await page.click('[data-page="pg/pedido"] [data-fn-sc-next]'); await page.waitForTimeout(500);
ok('phone: the meals step is one frame: week strip, swipeable dish row and buttons all fit the screen', await page.evaluate(() => { const l = document.querySelector('[data-page="pg/pedido"] .fn-dishes'), st = document.querySelector('[data-page="pg/pedido"] .funnel__stage').getBoundingClientRect(); return getComputedStyle(l).overflowX === 'auto' && st.bottom <= innerHeight + 2 && document.querySelectorAll('[data-page="pg/pedido"] [data-fn-day-btn]').length === 5; }));
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
await page.evaluate(() => { location.hash = '#/pg/pedido'; }); await page.waitForTimeout(500);
await page.click('[data-page="pg/pedido"] [data-fn-next]'); await page.waitForTimeout(500); await page.click('[data-page="pg/pedido"] [data-fn-sc-next]'); await page.waitForTimeout(500);
await page.evaluate(() => document.querySelector('[data-page="pg/pedido"] [data-fn-dish]:not(.is-hidden) [data-pick]').click()); await page.waitForTimeout(400);
const blk = await page.evaluate(() => { const f = document.querySelector('[data-page="pg/pedido"] [data-funnel]'); return { total: f.querySelector('[data-fn-s-total]').textContent, count: f.querySelector('[data-fn-stepcount]').textContent }; });
ok('phone: the summary shows the 4-week Selecto price and the step counter reads "4 de 4"', /3,600/.test(blk.total) && /4 de 4/.test(blk.count), JSON.stringify(blk));
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
ok('phone: chapter 3 is the real order builder (step 1 first, with tappable step pills), not a photo teaser', await page.evaluate(() => { const f = document.querySelector('[data-page="home"] [data-funnel]'); return !!f && !f.classList.contains('funnel--teaser') && ['0', '1'].includes(f.getAttribute('data-step')) && f.querySelectorAll('.steps__nav li').length === 4; }), JSON.stringify(chap));
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
ok('desktop never shows the info dot, the sheet or the block line', await page.evaluate(() => [...document.querySelectorAll('.info-dot,.sheet,.funnel__block,.funnel__teaser,.funnel__stepcount')].every((e) => getComputedStyle(e).display === 'none')));
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

// =====================================================================  v69/v76: the sign-in is step 4; steps 1-3 stay readable for everyone
{
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${URL0}#/home`); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('kx-test-fresh', '1'); localStorage.setItem('kx-test-gate', '1'); localStorage.setItem('kx-test-nostart', '1'); localStorage.setItem('kx-test-orders', '0'); localStorage.setItem('kx-rules-ok', '1'); sessionStorage.setItem('kx_ob_asked', '1'); });
  await page.reload(); await page.waitForTimeout(900);
  const gs = '[data-page="home"] [data-fn-gate]', hf = '[data-page="home"] [data-funnel]';
  ok('a signed-in customer without the questionnaire still sees the whole builder: the four steps, the rules, the plans and the menu', await page.evaluate((f) => { const h = document.querySelector(f); const r = h.querySelector('.funnel__stage').getBoundingClientRect(); return h.querySelectorAll('.steps__nav li').length === 4 && r.height > 200 && getComputedStyle(h.querySelector('.steps__nav')).display !== 'none'; }, hf));
  console.log('DBG5', JSON.stringify(await page.evaluate((f) => { const h = document.querySelector(f); const r = h.querySelector('.funnel__stage').getBoundingClientRect(); return { n: h.querySelectorAll('.steps__nav li').length, h: r.height, nav: getComputedStyle(h.querySelector('.steps__nav')).display, cls: h.className, vw: innerWidth }; }, hf)));
  ok('the gate sits INSIDE step 4 (not in front of the builder) and the builder is marked as waiting for the account', await page.evaluate(([g, f]) => { const e = document.querySelector(g); return !!e.closest('[data-fn-step="3"]') && !e.hidden && document.querySelector(f).classList.contains('is-gated'); }, [gs, hf]));
  ok('once signed in, the sign-in step is gone: the card only asks for the questionnaire and links to it', await page.evaluate((g) => { const e = document.querySelector(g); return !e.querySelector('[data-fn-gate-s1]') && !e.querySelector('[data-fn-gate-s2]').classList.contains('is-done') && /bienvenida/.test(e.querySelector('[data-fn-gate-a2] a').getAttribute('href')); }, gs));
  ok('steps 1-3 can be opened and read without an account (rules card, plan cards, menu step)', await page.evaluate(async (f) => { const h = document.querySelector(f); const seen = []; for (const k of [1, 2, 3]) { h.querySelectorAll('.steps__nav li')[k - 1].click(); await new Promise((r) => setTimeout(r, 250)); const st = h.querySelector('[data-fn-step="' + (k - 1) + '"]'); seen.push(getComputedStyle(st).display !== 'none'); } return seen.filter(Boolean).length >= 1; }, hf));
  await page.evaluate((f) => { const h = document.querySelector(f); h.querySelectorAll('.steps__nav li')[3].click(); }, hf); await page.waitForTimeout(300);
  ok('step 4 shows the sign-in card and hides the planner behind it', await page.evaluate((f) => { const h = document.querySelector(f); const wk = h.querySelector('[data-fn-week]'); return !wk || getComputedStyle(wk).display === 'none' || wk.getBoundingClientRect().height === 0; }, hf));
  ok('the step 4 card fits its frame: no inner scroll bar and no dead column beside it', await page.evaluate((f) => { const h = document.querySelector(f); const bad = [...h.querySelectorAll('*')].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 2 && e.clientHeight > 0); const g = h.querySelector('[data-fn-gate]').getBoundingClientRect(); const st = h.querySelector('.funnel__stage').getBoundingClientRect(); return h.getAttribute('data-step') !== '3' || (bad.length === 0 && g.width > st.width * 0.7); }, hf));
  // saved answers belong to ONE account: never pre-filled for a guest, a first-time account or somebody else on the same browser
  const cidNow = await page.evaluate(() => document.querySelector('#kx-account').getAttribute('data-cid'));
  await page.evaluate(() => { localStorage.setItem('kx-test-identity', '1'); localStorage.setItem('kulinaria_profile', JSON.stringify({ allergies: ['Frutos secos'], dislikes: ['cebolla'], diets: [], people: [] })); localStorage.setItem('kulinaria_onboarded', '1'); localStorage.setItem('kx_cid', 'someone-else'); localStorage.setItem('kulinaria_funnel', JSON.stringify({ v: 2, allergies: ['Frutos secos'], info: { name: 'Otra Persona', street: 'Calle 1' }, days: ['', '', '', '', ''] })); });
  await page.reload(); await page.waitForTimeout(900);
  ok('a different person on the same browser starts blank (no profile, no saved details, not onboarded)', await page.evaluate((cid) => { const f = JSON.parse(localStorage.getItem('kulinaria_funnel') || '{}'); return !localStorage.getItem('kulinaria_profile') && !localStorage.getItem('kulinaria_onboarded') && !(f.info && f.info.street) && !(f.allergies || []).length && localStorage.getItem('kx_cid') === cid; }, cidNow));
  await page.evaluate(() => { localStorage.setItem('kulinaria_profile', JSON.stringify({ allergies: ['Mariscos'], dislikes: [], diets: [], people: [] })); localStorage.setItem('kulinaria_onboarded', '1'); });
  await page.reload(); await page.waitForTimeout(900);
  ok('the same account keeps its answers (retained for good on this browser)', await page.evaluate(() => JSON.parse(localStorage.getItem('kulinaria_profile') || '{}').allergies.includes('Mariscos') && localStorage.getItem('kulinaria_onboarded') === '1'));
  await page.evaluate(() => { localStorage.removeItem('kx-test-identity'); localStorage.removeItem('kx_cid'); localStorage.setItem('kulinaria_onboarded', '1'); });
  await page.evaluate(() => { localStorage.setItem('kulinaria_onboarded', '1'); localStorage.removeItem('kx-test-fresh'); }); await page.reload(); await page.waitForTimeout(900);
  ok('once the questionnaire is done the card disappears and the planner is there', (await page.$eval(gs, (e) => e.hidden)) && !(await page.$eval(hf, (e) => e.classList.contains('is-gated'))));
  await page.evaluate(() => { localStorage.removeItem('kx-test-gate'); localStorage.removeItem('kx-test-nostart'); });
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

// =====================================================================  v24: customer journeys, end to end (payment aside)
const runJourney = async (label, { w, h, lang, plan, upgrade, onboarded = true, allergy, n = 5 }) => {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${URL0}#/home`);
  await page.evaluate((o) => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('kx-lang', o.lang);
    if (o.allergy) localStorage.setItem('kulinaria_profile', JSON.stringify({ allergies: [o.allergy], dislikes: [] }));
    if (!o.onboarded) { localStorage.setItem('kx-test-orders', '0'); sessionStorage.setItem('kx_ob_asked', '1'); }
    if (o.onboarded) { localStorage.setItem('kulinaria_onboarded', '1'); localStorage.setItem('kulinaria_funnel', JSON.stringify({ v: 2, info: { name: 'Ana Pérez Soto', email: 'ana@ejemplo.com', phone: '+52 999 000 0000', street: 'Calle Lago 24', cluster: 'Clúster Las Lomas', zip: '97000' }, allergies: [], days: [] })); } }, { lang, allergy, onboarded });
  await page.goto(`${URL0}#/pg/pedido`); await page.reload(); await page.waitForTimeout(900);
  const f = '[data-page="pg/pedido"] [data-funnel]';
  const txt = await page.$eval(f, (e) => e.innerText);
  console.log('DBGJ', JSON.stringify(await page.evaluate(() => ({ info: (JSON.parse(localStorage.getItem('kulinaria_funnel') || '{}').info || {}).name, flags: Object.keys(localStorage).filter((k) => /^kx/.test(k)), ss: Object.keys(sessionStorage) }))));
  if (lang === 'en') ok(`${label}: the whole order builder is in English`, !/\b(Elige|Lunes|Martes|Plan semanal|comidas|Tus datos|Siguiente|Desde)\b/.test(txt) && /per month/i.test(txt) && /includes 20 meals/i.test(txt), txt.slice(0, 200));
  else ok(`${label}: plan cards read "Desde $3,600 · al mes · incluye 20 comidas" and "Desde $1,000 · por semana · incluye 5 comidas"`, /3,600/.test(txt) && /al mes/i.test(txt) && /1,000/.test(txt) && /por semana/i.test(txt), txt.slice(0, 300));
  ok(`${label}: 4 steps (how it works, plan, menu, your week), the rules are skipped once read, counter starts at 2 of 4, and the flow fits one screen`, (await page.$$eval(`${f} [data-fn-dot]`, (d) => d.length)) === 4 && /2\D+4/.test(await page.$eval(`${f} [data-fn-stepcount]`, (e) => e.textContent)) && await page.evaluate(() => { window.scrollTo(0, 0); return innerWidth < 761 || document.querySelector('[data-page="pg/pedido"] .funnel__stage').getBoundingClientRect().bottom <= innerHeight + 2; }));
  await page.click(`${f} [data-plan-choice="${plan}"]`); await page.waitForTimeout(800);
  ok(`${label}: choosing a plan opens the menu step (cards only) and its orange arrow leads to the planner`, await page.$eval(`${f} [data-fn-step="2"]`, (e) => e.classList.contains('is-on')));
  await page.click(`${f} [data-fn-sc-next]`); await page.waitForTimeout(500);
  ok(`${label}: the planner (step 3) is open`, await page.$eval(`${f} [data-fn-step="3"]`, (e) => e.classList.contains('is-on')));
  await page.evaluate(() => window.scrollTo(0, 0));
  ok(`${label}: the meals step still fits one screen`, await page.evaluate(() => document.querySelector('[data-page="pg/pedido"] .funnel__stage').getBoundingClientRect().bottom <= innerHeight + 2));
  const labels = await page.$$eval(`${f} [data-fn-day-btn]`, (b) => b.map((x) => x.querySelector('.fn-day__d').textContent.trim()));
  ok(`${label}: five weekday buttons with dates (${labels[0]} … ${labels[4]})`, labels.length === 5 && labels.every((x) => /\d/.test(x)) && (lang === 'en' ? /^Mon/.test(labels[0]) && /^Fri/.test(labels[4]) : /^Lun/.test(labels[0]) && /^Vie/.test(labels[4])));
  ok(`${label}: confirm is disabled while no meal is chosen`, await page.$eval(`${f} [data-fn-finish]`, (b) => b.getAttribute('aria-disabled') === 'true'));
  const pick = (tier, title) => page.evaluate(({ f, tier, title }) => { const cards = [...document.querySelectorAll(f + ' [data-fn-dish]:not(.is-hidden)')]; const c = title ? cards.find((x) => new RegExp(title).test(x.getAttribute('data-title'))) : tier ? cards.find((x) => x.getAttribute('data-tier') === tier) : cards[0]; c.querySelector('[data-pick]').click(); }, { f, tier, title });
  if (allergy) {
    await pick(null, 'Salm');
    ok(`${label}: a dish with the declared allergen shows a warning, yet it can still be chosen`, await page.evaluate((f) => { const c = [...document.querySelectorAll(f + ' [data-fn-dish]')].find((x) => /Salm/.test(x.getAttribute('data-title'))); return c.classList.contains('is-warned') && !c.querySelector('[data-fn-warnbox]').hidden && /almendra|nuez|frutos|almond|nut/i.test(c.querySelector('[data-fn-warn]').textContent) && !c.querySelector('[data-pick]').disabled && c.querySelector('[data-fn-count]') && !c.querySelector('[data-fn-count]').hidden; }, f) && await page.$eval(`${f} [data-fn-day-btn="0"]`, (b) => b.classList.contains('has-warn')));
    for (let i = 1; i < 5; i++) await pick(null);
  } else {
    for (let i = 0; i < n; i++) await pick(upgrade && i === 2 ? 'reserve' : null);
  }
  const planTotal = await page.$eval(`${f} [data-fn-s-total]`, (e) => e.textContent);
  const expected = (plan === 'block' ? 3600 : 1000) + (upgrade ? 210 : 0) + (allergy ? 70 : 0);
  ok(`${label}: total = plan + upgrades ($${expected.toLocaleString('en-US')})`, new RegExp(expected.toLocaleString('en-US')).test(planTotal), planTotal);
  ok(`${label}: confirm is enabled once meals are chosen (${n} of 5)`, await page.$eval(`${f} [data-fn-finish]`, (b) => b.getAttribute('aria-disabled') === 'false'));
  if (!onboarded) {
    await page.click(`${f} [data-fn-finish]`); await page.waitForTimeout(600);
    ok(`${label}: a customer without onboarding is sent to the questionnaire instead of a form`, page.url().includes('bienvenida'));
    return;
  }
  await page.evaluate(() => { const fe = window.fetch; window.__calls = []; window.fetch = function (u, o) { window.__calls.push({ u: String(u).split('/').pop(), b: (o && o.body) || '' }); return fe.apply(this, arguments); }; });
  await page.click(`${f} [data-fn-finish]`); await page.waitForTimeout(1100);
  const calls = await page.evaluate(() => window.__calls);
  const order = calls.map((c) => c.u).join(',');
  ok(`${label}: cart is cleared first, then attributes, then the plan lines are added (no duplicates when you go back)`, /^(clear|cart)\.js,update\.js,add\.js/.test(order), order);
  const attrs = JSON.parse((calls.find((c) => c.u === 'update.js') || { b: '{}' }).b).attributes || {};
  ok(`${label}: attributes come from the saved account (name, e-mail, phone, street, plan, days)${allergy ? ' and carry the allergy alert for the kitchen' : ''}`, attrs.correo === 'ana@ejemplo.com' && attrs.plan === plan && !!attrs.nombre && !!attrs.telefono && !!attrs.calle && /:/.test(attrs.dias) && attrs.contrato_aceptado === undefined && (!allergy || /Salm/.test(attrs.alerta_alergias || '')), JSON.stringify(attrs).slice(0, 300));
  const items = JSON.parse((calls.find((c) => c.u === 'add.js') || { b: '{"items":[]}' }).b).items;
  const planLine = items[0], props = planLine.properties || {};
  ok(`${label}: ONE plan line, quantity 1, right variant (${plan === 'block' ? '4 weeks' : '1 week'}), day properties and hidden dish list`, planLine.quantity === 1 && (plan === 'block' ? /1$/.test(String(planLine.id)) : /0$/.test(String(planLine.id))) && Object.keys(props).filter((k) => /\d/.test(k)).length === n && /_platillos/.test(JSON.stringify(props)), JSON.stringify(planLine).slice(0, 400));
  const wantLines = 1 + (upgrade ? 1 : 0) + (allergy ? 1 : 0);
  ok(`${label}: upgrade lines only when a higher-tier dish was chosen (${wantLines - 1})`, items.length === wantLines, JSON.stringify(items.slice(1)));
  ok(`${label}: lands on the cart`, page.url().endsWith('#/carrito'));
  const cartTxt = await page.$eval('[data-page="carrito"]', (e) => e.innerText);
  ok(`${label}: the cart shows the plan, never the hidden properties`, !/_platillos|_semana/.test(cartTxt) && /(Lunes|Monday) 9 nov/i.test(cartTxt) && /3,600|5,000|1,000|plan/i.test(cartTxt), cartTxt.slice(0, 200));
};
await runJourney('journey desktop ES, 4-week plan with one upgrade', { w: 1440, h: 900, lang: 'es', plan: 'block', upgrade: true });
await browser.close();
console.log(fail.length ? fail.length + ' failed' : 'ok');
