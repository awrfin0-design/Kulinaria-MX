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


await page.goto(URL0);
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
  ok('hero: the cube turns to the next item by itself (about every 4 seconds)', (await faceNow()) === a0 + 1, a0 + ' -> ' + (await faceNow()));
  await page.mouse.move(700, 420); const c0 = await faceNow(); await page.waitForTimeout(5600);
  ok('hero: a mouse resting over the hero does NOT freeze it (it keeps turning)', (await faceNow()) !== c0, c0 + ' -> ' + (await faceNow()));
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
console.log(fail.length ? fail.length + ' failed' : 'flow ok (' + results.length + ' checks)');
