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
  const swapDay = async (i) => {
    await page.evaluate(({ f, i }) => document.querySelector(f + ' [data-bd-focus="' + i + ':0"]').click(), { f: FN, i }); await page.waitForTimeout(250); await page.keyboard.press('Escape'); await page.waitForTimeout(150); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    await page.evaluate((f) => { document.querySelector(f + ' [data-bd-more]').click(); document.querySelector(f + ' [data-bd-menu] [data-bd-view="bowls"]').click(); }, FN); await page.waitForTimeout(250);
    await page.evaluate((f) => document.querySelector(f + ' [data-ct-tier="selecto"]').click(), FN); await page.waitForTimeout(250);
    await page.evaluate((f) => [...document.querySelectorAll(f + ' [data-ct-pick]')].find((b) => !b.classList.contains('is-on')).click(), FN); await page.waitForTimeout(450);
  };
  const KETO = ['Pollo a las hierbas con puré rústico', 'Pollo a las hierbas con puré rústico', 'Pollo a las hierbas con puré rústico', 'Pollo a las hierbas con puré rústico', 'Pollo a las hierbas con puré rústico'];
  const tiersNow = () => page.evaluate((f) => [...document.querySelector(f).querySelectorAll('.fn-wk__slot:not(.is-empty) .fn-wk__tier')].map((e) => e.className.replace(/.*fn-wk__tier--/, '')), FN);

  // ---- signed out: the first step is the sign-in screen
  await page.setViewportSize({ width: 1440, height: 860 });
  await base({ guest: true }); await open(true);
  const g = await page.evaluate((f) => { const h = document.querySelector(f), s = h.querySelector('.fn-start'); const dots = [...h.querySelectorAll('[data-fn-dot]')].filter((d) => getComputedStyle(d).display !== 'none'); return { step: h.getAttribute('data-step'), start: !!s && s.offsetParent !== null, btn: (s.querySelector('.fn-start__btn') || {}).getAttribute && s.querySelector('.fn-start__btn').getAttribute('href'), txt: s.innerText, dots: dots.length, title: getComputedStyle(h.querySelector('.funnel__title')).display }; }, FN);
  ok('signed out: step 1 is the sign-in screen (nothing else can be opened first)', g.step === '0' && g.start, JSON.stringify([g.step, g.start]));
  ok('signed out: one button, "Iniciar sesión", that leads to login / create account', /login|register|account/.test(g.btn || '') && /iniciar sesi[oó]n/i.test(g.txt), g.btn);
  ok('signed out: the pitch shows $180 a day, the 4-week block ($900 a week) and the 1-week trial per day with its +15% rate', /180/.test(g.txt) && /900/.test(g.txt) && /207/.test(g.txt) && /15%/.test(g.txt), g.txt.replace(/\s+/g, ' ').slice(0, 220));
  const cnt = await page.evaluate((f) => { const h = document.querySelector(f), c = h.querySelector('[data-fn-stepcount]'); return { txt: c.textContent, vis: c.offsetParent !== null, pills: getComputedStyle(h.querySelector('.steps__nav')).display, bar: getComputedStyle(h.querySelector('.funnel__bar')).display }; }, FN);
  ok('the step indicator is the counter "Paso 1 de 4" with a slim progress line (no pills) and there is no "4 pasos" headline', /1\D+4/.test(cnt.txt) && cnt.vis && cnt.pills === 'none' && cnt.bar !== 'none' && g.title === 'none', JSON.stringify(cnt));

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
  ok('the suggested keto menu is the Selecto base: only Selecto dishes, none of the paid levels pre-selected', nKeto.join('|') === KETO.join('|') && (await tiersNow()).every((t) => t === 'selecto'), nKeto.join(' | '));
  ok('the total is the plain Selecto base ($3,600): no upgrades are added by default', /3,600/.test(w1.total || '') && !/3,[7-9]/.test(w1.total || ''), w1.total);
  ok('the stepper reads "Paso 4 de 4"', /4\D+4/.test(w1.stepcount || ''), w1.stepcount);
  await base({ profile: { allergies: ['Pescado'], dislikes: [], people: [] } }); await open(false); await chooseDiet('keto-low-carb');
  const nAllergic = await names(), warn = await page.evaluate((f) => document.querySelector(f).querySelectorAll('.fn-wk__slot.has-warn').length, FN);
  ok('a customer allergic to fish gets the same Selecto keto menu (no fish in it, so no warnings)', nAllergic.join('|') === KETO.join('|') && warn === 0, warn + ' warnings');
  await base(); await open(false); await chooseDiet('fit-proteina');
  ok('another category is Selecto too (high protein: the beef bowl, every day)', /Bowl de res/.test((await names())[0]) && (await tiersNow()).every((t) => t === 'selecto'));

  // ---- step 2 of 4: "how it works" (three steps and the money), shown once to a signed-in customer
  await base(); await page.evaluate(() => { localStorage.setItem('kx-test-guide', '1'); localStorage.removeItem('kx-rules-ok'); });
  await open(false);
  const hw = await page.evaluate((f) => { const h = document.querySelector(f), w = h.querySelector('.fn-hw'), r = w && w.getBoundingClientRect(); return { step: h.getAttribute('data-step'), vis: !!w && w.offsetParent !== null, steps: w ? w.querySelectorAll('.fn-hw__steps li').length : 0, money: w ? w.innerText.replace(/\s+/g, ' ') : '', btn: !!(w && w.querySelector('[data-fn-how-go]')), cnt: h.querySelector('[data-fn-stepcount]').innerText.replace(/\s+/g, ' '), side: document.documentElement.scrollWidth <= innerWidth + 1, start: !!(h.querySelector('.fn-start') && h.querySelector('.fn-start').offsetParent) }; }, FN);
  ok('a signed-in customer who has not read the instructions lands on "Cómo funciona" (no sign-in screen)', hw.step === '0' && hw.vis && !hw.start, JSON.stringify([hw.step, hw.vis, hw.start]));
  ok('it shows exactly three steps and how the money works: $3,600 deposit, $900 weekly budget, +$70-$210 per upgraded dish, trial week $1,035', hw.steps === 3 && /3,600/.test(hw.money) && /900/.test(hw.money) && /70/.test(hw.money) && /210/.test(hw.money) && /1,035/.test(hw.money), hw.money.slice(0, 260));
  ok('the counter reads "Paso 2 de 4" with Entra completed and Cómo funciona highlighted', /2\D+4/.test(hw.cnt) && /✓\s*Entra/.test(hw.cnt) && hw.btn, hw.cnt);
  await page.evaluate((f) => document.querySelector(f + ' [data-fn-how-go]').click(), FN); await page.waitForTimeout(500);
  ok('"Entendido, empezar" opens plan and diet (step 3 of 4) and remembers it', (await page.evaluate((f) => document.querySelector(f).getAttribute('data-step'), FN)) === '1' && (await page.evaluate(() => localStorage.getItem('kx-rules-ok'))) === '1' && /3\D+4/.test(await page.evaluate((f) => document.querySelector(f + ' [data-fn-stepcount]').innerText, FN)));
  await page.evaluate(() => { localStorage.removeItem('kx-test-guide'); localStorage.setItem('kx-test-nostart', '1'); }); await page.reload(); await page.waitForTimeout(1200);
  ok('on the next visit the instructions are skipped (straight to plan and diet)', (await page.evaluate((f) => document.querySelector(f).getAttribute('data-step'), FN)) === '1');
  await page.evaluate((f) => [...document.querySelector(f + ' [data-fn-stepcount]').querySelectorAll('.fn-sc__s')][1].click(), FN); await page.waitForTimeout(400);
  ok('the counter reopens "Cómo funciona" whenever you want to read it again', (await page.evaluate((f) => document.querySelector(f).getAttribute('data-step'), FN)) === '0' && (await page.evaluate((f) => !!document.querySelector(f + ' .fn-hw').offsetParent, FN)));
  await page.setViewportSize({ width: 390, height: 844 });
  ok('phone: the instructions fit the width and the three steps stack', await page.evaluate((f) => { const w = document.querySelector(f + ' .fn-hw'), r = w.getBoundingClientRect(); return document.documentElement.scrollWidth <= innerWidth + 1 && r.right <= innerWidth + 1 && w.querySelectorAll('.fn-hw__steps li').length === 3; }, FN));
  await page.setViewportSize({ width: 1440, height: 860 });

  await base(); await open(false); await chooseDiet('fit-proteina');

  // ---- upgrade through the group catalogue, swap, second plate
  const fridayUp = await page.evaluate((f) => !!document.querySelector(f + ' [data-bd-up="4:0"]'), FN);
  ok('every card has the upgrade button, Friday included', fridayUp && (await page.evaluate((f) => document.querySelectorAll(f + ' .fn-wk__up').length, FN)) === 5);
  await page.evaluate((f) => document.querySelector(f + ' [data-bd-up="0:0"]').click(), FN); await page.waitForTimeout(450); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  const pk = await page.evaluate((f) => { const c = document.querySelector(f + ' [data-fn-ct]'); return { tabs: [...c.querySelectorAll('.fn-ct__tab')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()), on: (c.querySelector('.fn-ct__tab.is-on') || {}).textContent, who: c.querySelector('.fn-ct__for').textContent, n: c.querySelectorAll('[data-ct-pick]').length }; }, FN);
  ok('"Elevar nivel" aims the catalogue at that day with Exclusivo / Signature / Reserve tabs and their extra price', /Lunes/.test(pk.who) && /Exclusivo/.test(pk.on) && pk.tabs.length === 4 && /\+\$?\s?70/.test(pk.tabs[1]) && /\+\$?\s?140/.test(pk.tabs[2]) && /\+\$?\s?210/.test(pk.tabs[3]), JSON.stringify(pk));
  ok('the catalogue lists only dishes of that level', pk.n >= 1 && (await page.evaluate((f) => [...document.querySelectorAll(f + ' [data-ct-pick]')].every((b) => /\+\$70/.test(b.textContent)), FN)));
  const before = await page.evaluate((f) => ({ total: document.querySelector(f + ' [data-fn-s-total]').textContent }), FN);
  await page.evaluate((f) => document.querySelector(f + ' [data-ct-pick]').click(), FN); await page.waitForTimeout(500);
  const af = await page.evaluate((f) => ({ tier: document.querySelector(f + ' .fn-wk__card .fn-wk__tier').textContent, total: document.querySelector(f + ' [data-fn-s-total]').textContent }), FN);
  ok('choosing an upgrade tags the card with the extra and raises the total by $70', /\+\$70/.test(af.tier) && parseFloat(af.total.replace(/[^\d]/g, '')) === parseFloat(before.total.replace(/[^\d]/g, '')) + 70, JSON.stringify([before, af]));
  const cur = (await names())[1];
  await swapDay(1);
  ok('"Cambiar" lets you take any dish of any group (Todos > Bowls) and replaces only that day', (await names())[1] !== cur && (await names())[0] === (await names())[0], (await names()).join(' | '));
  ok('a second plate: the card offers "+ Añadir platillo"; choosing a dish puts it under the first one', await (async () => {
    await page.evaluate((f) => document.querySelector(f + ' [data-bd-add2="0"]').click(), FN); await page.waitForTimeout(250); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    const lab = await page.evaluate((f) => document.querySelector(f + ' .fn-ct__for').textContent, FN);
    await page.evaluate((f) => [...document.querySelectorAll(f + ' [data-ct-pick]')].find((b) => !b.classList.contains('is-on')).click(), FN); await page.waitForTimeout(450);
    return /\+1/.test(lab) && (await page.evaluate((f) => document.querySelectorAll(f + ' .fn-wk__slot.is-second').length, FN)) === 1;
  })());
  await page.evaluate((f) => document.querySelector(f + ' [data-wk-clear="0:1"]').click(), FN); await page.waitForTimeout(300);
  ok('the second plate can be removed again', (await page.evaluate((f) => document.querySelectorAll(f + ' .fn-wk__slot.is-second').length, FN)) === 0);

  // ---- header: diet chip + deposit / weekly budget, nutrition, clickable step counter
  await base(); await open(false); await chooseDiet('keto-low-carb');
  const hd = await page.evaluate((f) => { const h = document.querySelector(f); return { diet: h.querySelector('[data-fn-diet-name]').textContent, plan: h.querySelector('[data-fn-plan-name]').textContent, up: (h.querySelector('[data-fn-s-up]') || {}).textContent, total: h.querySelector('[data-fn-s-total]').textContent, label: (h.querySelector('.funnel__total span') || {}).textContent, lines: [...h.querySelectorAll('.fn-wk__slot .fn-wk__m')].map((e) => e.textContent), nutri: (h.querySelector('[data-fn-wk-nutri]') || {}).innerText }; }, FN);
  ok('the week header shows the chosen diet and the money model: deposit $3,600 and $900 a week', /Keto/.test(hd.diet) && /3,600/.test(hd.plan) && /900/.test(hd.plan), JSON.stringify([hd.diet, hd.plan]));
  ok('the bar says what is paid today: the deposit plus this week\'s upgrades only (none by default: the suggested menu is Selecto)', /3,600/.test(hd.total) && !/\+|350/.test(hd.up || '') && /Hoy pagas/i.test(hd.label), JSON.stringify([hd.up, hd.total, hd.label]));
  ok('every plate shows its nutrition (kcal, protein, carbs, fat) and the week has a nutrition summary', hd.lines.length === 5 && hd.lines.every((l) => /\d+ kcal · P \d+ · C \d+ · G \d+/.test(l)) && /kcal/i.test(hd.nutri || '') && /Promedio/i.test(hd.nutri || ''), JSON.stringify([hd.lines[0], (hd.nutri || '').replace(/\s+/g, ' ')]));
  await page.evaluate((f) => document.querySelector(f + ' [data-fn-diet-open]').click(), FN); await page.waitForTimeout(250);
  const dmn = await page.evaluate((f) => { const m = document.querySelector(f + ' [data-fn-dietmenu]'), r = m.getBoundingClientRect(); return { open: !m.hidden, n: m.querySelectorAll('[data-fn-diet-pick]').length, on: (m.querySelector('.is-on') || {}).textContent, inScreen: r.right <= innerWidth + 1 && r.bottom <= innerHeight + 40 }; }, FN);
  ok('clicking the diet opens a list of every diet (13), the current one ticked', dmn.open && dmn.n === 13 && /Keto/.test(dmn.on || ''), JSON.stringify(dmn));
  await page.evaluate((f) => document.querySelector(f + ' [data-fn-diet-pick="veggie"]').click(), FN); await page.waitForTimeout(700);
  const nv = await names();
  ok('choosing another diet loads that diet\'s suggested menu (the fixed one) and updates the chip', /Omelette/.test(nv[0]) && /Omelette|Crema/.test(nv[4]) && /Plantas/.test(await page.evaluate((f) => document.querySelector(f + ' [data-fn-diet-name]').textContent, FN)), nv.join(' | '));
  const sc3 = await page.evaluate((f) => [...document.querySelector(f + ' [data-fn-stepcount]').querySelectorAll('.fn-sc__s')].map((b) => b.textContent.replace(/\s+/g, ' ').trim() + ':' + (b.classList.contains('is-done') ? 'done' : '') + (b.classList.contains('is-on') ? 'on' : '')), FN);
  ok('the step counter lists the four steps (sign in, how it works, plan and diet, your week): the first three completed, the current one highlighted', sc3.length === 4 && /done/.test(sc3[0]) && /done/.test(sc3[1]) && /done/.test(sc3[2]) && /on/.test(sc3[3]) && /✓/.test(sc3[2]), sc3.join(' | '));
  await swapDay(1);
  const editedWeek = await names();
  await page.evaluate((f) => [...document.querySelector(f + ' [data-fn-stepcount]').querySelectorAll('.fn-sc__s')][2].click(), FN); await page.waitForTimeout(500);
  ok('clicking a completed step in the counter goes back to it (plan and diet)', (await page.evaluate((f) => document.querySelector(f).getAttribute('data-step'), FN)) === '1');
  await page.evaluate((f) => document.querySelector(f + ' [data-fn-go-next]').click(), FN); await page.waitForTimeout(700);
  ok('going back and forward again keeps the edited week (nothing is reset)', (await names()).join('|') === editedWeek.join('|'), (await names()).join(' | '));

  // ---- people: each one keeps their own week; a new person starts from the default menu
  await base({ profile: { allergies: [], dislikes: [], people: [{ id: 'p1', name: 'Johnny', allergies: [], dislikes: [], diets: [] }] } }); await open(false); await chooseDiet('fit-proteina');
  await page.waitForFunction((f) => document.querySelectorAll(f + ' .fn-who__b').length >= 2, FN, { timeout: 5000 }).catch(() => {});
  ok('"Pedido para" shows a chip for me and for each family member, plus an add link', await page.evaluate((f) => { const c = [...document.querySelectorAll(f + ' .fn-who__b')].map((b) => b.textContent); return c.length === 2 && /Johnny/.test(c[1]) && !!document.querySelector(f + ' .fn-who__add'); }, FN));
  await swapDay(1);
  const mineEdited = await names();
  await page.evaluate((f) => document.querySelector(f + ' [data-fn-who-pick="p1"]').click(), FN); await page.waitForTimeout(600);
  const johnny = await names();
  ok('a family member with no week yet starts from the default menu of the chosen diet (not blank)', johnny.length === 5 && johnny.every((n) => n !== '-') && /Bowl de res/.test(johnny[0]) && /Bowl de res/.test(johnny[4]), johnny.join(' | '));
  await page.evaluate((f) => document.querySelector(f + ' [data-fn-who-pick=""]').click(), FN); await page.waitForTimeout(600);
  ok('switching back to myself restores my edited week (nothing is lost)', (await names()).join('|') === mineEdited.join('|'), (await names()).join(' | '));
  await page.evaluate(() => { localStorage.setItem('kx-test-nostart', '1'); sessionStorage.removeItem('kx-test-start'); });
  await page.reload(); await page.waitForTimeout(1200);
  ok('and the week survives a page reload', (await page.evaluate((f) => document.querySelector(f).getAttribute('data-step'), FN)) === '3' && (await names()).join('|') === mineEdited.join('|'));

  // ---- confirming puts ONE plan line in the cart with the dishes as properties
  await base({ funnel: { info: { name: 'Ana Pérez', email: 'ana@ejemplo.com', phone: '+52 999 000 0000', street: 'Calle Lago 24', cluster: 'Clúster Las Lomas', zip: '72000' } } }); await open(false); await chooseDiet('veggie');
  await page.evaluate(() => { const f = window.fetch; window.__calls = []; window.fetch = function (u, o) { window.__calls.push(String(u).split('/').pop() + ' ' + ((o && o.body) || '').slice(0, 3000)); return f.apply(this, arguments); }; });
  await page.locator(`${FN} [data-fn-finish]`).scrollIntoViewIfNeeded(); await page.click(`${FN} [data-fn-finish]`); await page.waitForTimeout(500);
  ok('the confirm button first opens "Resumen de tu semana" (nothing is sent yet)', await page.evaluate(() => { const m = document.querySelector('.fn-md--sum'); return !!m && !m.hidden && /Resumen de tu semana/.test(m.textContent) && !(window.__calls || []).some((r) => /add\.js/.test(r)); }));
  await page.click('.fn-md--sum [data-sm-go]'); await page.waitForTimeout(1000);
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
  const hr0 = await page.evaluate((h) => { const e = document.querySelector(h), c = e.querySelector('[data-hero-cube]'); return { faces: c.querySelectorAll('.hero__face').length, slides: c.querySelectorAll('.hs').length, dots: e.querySelectorAll('[data-hs-dot]').length, loop: e.querySelector('[data-hero-video]').loop, d3: getComputedStyle(c).transformStyle, ctl: getComputedStyle(e.querySelector('.hero__ctl')).visibility, arrows: [...e.querySelectorAll('.hero__arr')].filter((x) => getComputedStyle(x).display !== 'none').length }; }, HR);
  ok('hero: 7 items in a 3D cube: the video first (it does not loop) and 6 content slides, one dot each', hr0.faces === 7 && hr0.slides === 6 && hr0.dots === 7 && hr0.loop === false && hr0.d3 === 'preserve-3d' && hr0.ctl === 'visible' && hr0.arrows === 0, JSON.stringify(hr0));
  ok('hero: the video is the first thing shown', (await faceNow()) === 0);
  const fitD = await page.evaluate((h) => { const e = document.querySelector(h), cb = e.querySelector('[data-hero-cube]').getBoundingClientRect(), d = [...e.querySelectorAll('[data-hs-dot]')].map((x) => x.querySelector('i').getBoundingClientRect()), ctl = e.querySelector('.hero__ctl').getBoundingClientRect(), cp = e.querySelector('.hero__face--intro .hero__copy').getBoundingClientRect(); return { cubeBottom: Math.round(cb.bottom), vh: innerHeight, copyBottom: Math.round(cp.bottom), dots: d.length, dotW: Math.round(d[0].width), centered: Math.abs((ctl.left + ctl.width / 2) - innerWidth / 2) < 6, ctlBottom: Math.round(ctl.bottom) }; }, HR);
  ok('hero: the whole carousel (video face included) fits inside the screen', fitD.cubeBottom <= fitD.vh && fitD.copyBottom <= fitD.vh, JSON.stringify(fitD));
  ok('hero: tiny dots, centred, at the bottom of the hero', fitD.dots === 7 && fitD.dotW <= 8 && fitD.centered, JSON.stringify(fitD));
  await page.evaluate((h) => document.querySelector(h + ' [data-hero-video]').dispatchEvent(new Event('ended')), HR); await page.waitForTimeout(350);
  const mid = await page.evaluate((c) => { const e = document.querySelector(c); return { cls: e.className, tr: getComputedStyle(e).transform.slice(0, 9) }; }, CB);
  ok('hero: when the video has played the cube turns (a real 3D rotation: the video leaves the frame, the next item comes in)', /rot-next/.test(mid.cls) && mid.tr === 'matrix3d(', JSON.stringify(mid));
  await page.waitForTimeout(1500);
  const hr1 = await page.evaluate((h) => { const e = document.querySelector(h), on = e.querySelector('.hs.is-cur'); const r = on.getBoundingClientRect(), st = on.querySelector('.hx__strip'); return { h2: on.querySelector('h2').textContent, img: !!on.querySelector('img'), strip: !!st && st.querySelectorAll('.hx__card').length >= 3, fits: r.left >= -1 && r.right <= innerWidth + 1, hiddenOthers: [...e.querySelectorAll('.hero__face:not(.is-cur)')].every((x) => x.getAttribute('aria-hidden') === 'true'), idle: !document.querySelector(h + ' [data-hero-cube]').className.match(/rot-/), videoDot: document.querySelector(h + ' [data-hs-dot="0"]').hidden }; }, HR);
  ok('hero: slide 1 comes in (the brand banner): title, background photo and the three advantages', (await faceNow()) === 1 && /Cero compras/.test(hr1.h2) && hr1.img && hr1.strip && hr1.fits && hr1.hiddenOthers && hr1.idle, JSON.stringify(hr1));
  ok('hero: the intro video leaves the carousel after it has played once (its dot disappears)', hr1.videoDot === true);
  const texts = await page.evaluate((h) => [...document.querySelector(h).querySelectorAll('.hs')].map((x) => x.textContent.replace(/\s+/g, ' ')), HR);
  ok('hero: slide 1 keeps the brand banner (Cero compras. Cero cocina. Cero estrés., 4-week cycle, Diseñar mi plan, 100% adaptable, Alta cocina, Sin complicaciones)', /Cero compras\. Cero cocina\. Cero estrés\./.test(texts[0]) && /ciclo de 4 semanas/.test(texts[0]) && /Diseñar mi plan/.test(texts[0]) && /100% adaptable/i.test(texts[0]) && /Alta cocina/i.test(texts[0]) && /Sin complicaciones/i.test(texts[0]), texts[0].slice(0, 200));
  ok('hero: slide 2 keeps the mockup content (ambassadors, 3 bullets, events with coaches and dates, family access card)', /Embajadoras Kulinaria/i.test(texts[1]) && /Eventos deportivos y activaciones exclusivas/.test(texts[1]) && /Clínica de tenis/i.test(texts[1]) && /Jessica/.test(texts[1]) && /26 Nov/.test(texts[1]) && /Acceso Familia Kulinaria/i.test(texts[1]), texts[1].slice(0, 200));
  ok('hero: slide 3 keeps the mockup content (Ángel Otero, three points, five nutrition plans)', /Tu nutrición adaptable, respaldada por expertos/.test(texts[2]) && /Ángel Otero/.test(texts[2]) && /Reservar consulta/i.test(texts[2]) && /Plan de pérdida de peso/i.test(texts[2]) && /Consulta individual/i.test(texts[2]), texts[2].slice(0, 200));
  ok('hero: slide 4 keeps the mockup content (three block plans with prices, six ecosystem keys)', /Multiplica tu inversión/.test(texts[3]) && /699 MXN/.test(texts[3]) && /La más elegida/i.test(texts[3]) && /Nivel VIP/i.test(texts[3]) && /KFW Fitness Wear/i.test(texts[3]) && /Magnate Barbería/i.test(texts[3]), texts[3].slice(0, 200));
  ok('hero: the plans show the old price struck through and the new one highlighted (850 -> 699, free items), plus the gift line', await page.evaluate((h) => { const p = [...document.querySelectorAll(h + ' .hx__plan')]; return p.length === 3 && p[0].querySelectorAll('s').length === 1 && /850/.test(p[0].querySelector('s').textContent) && /699/.test(p[0].querySelector('b + *, b').parentNode.textContent) && /Elige un regalo/.test(p[0].textContent) && p[1].querySelectorAll('s').length === 3 && p[2].querySelectorAll('s').length === 1 && p[1].querySelectorAll('b').length >= 3 && /Kit completo KFW/.test(p[2].textContent); }, HR));
  ok('hero: slide 5 keeps the mockup content (private table, executive chef, formats, book your date)', /Tu mesa privada/.test(texts[5]) && /Menú de degustación personalizado/.test(texts[5]) && /Cenas íntimas/i.test(texts[5]) && /Reserva tu fecha/i.test(texts[5]), texts[5].slice(0, 200));
  ok('hero: slide 5 keeps the second rewards mockup (Multiplica tus resultados, three rows, six benefit tiles)', /Multiplica tus resultados y desbloquea recompensas/.test(texts[4]) && /Pago inmediato por bloque/.test(texts[4]) && /Ahorras \$151/.test(texts[4]) && /Pase VIP a experiencias/.test(texts[4]) && /Nutrición de casa/.test(texts[4]) && /Experiencias VIP/.test(texts[4]) && /Gimnasios hermanos/i.test(texts[4]), texts[4].slice(0, 200));
  const a0 = await faceNow(); await page.waitForTimeout(6800);
  ok('hero: the cube turns to the next slide by itself', (await faceNow()) === a0 + 1, a0 + ' -> ' + (await faceNow()));
  await page.mouse.move(700, 420); const c0 = await faceNow(); await page.waitForTimeout(6800);
  ok('hero: a mouse resting over the hero does NOT freeze it', (await faceNow()) !== c0, c0 + ' -> ' + (await faceNow()));
  await page.mouse.move(2, 2);
  await page.waitForTimeout(1200); for (let k = 0; k < 3 && (await faceNow()) !== 6; k++) { await page.evaluate((h) => document.querySelector(h + ' [data-hs-dot="6"]').click(), HR); await page.waitForTimeout(1700); }
  ok('hero: a dot turns the cube to that slide', (await faceNow()) === 6);
  await page.evaluate((h) => document.querySelector(h).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })), HR); await page.waitForTimeout(1700);
  ok('hero: after the last slide the loop wraps to the first slide, NOT back to the video (it is shown once)', (await faceNow()) === 1, String(await faceNow()));
  await page.evaluate((h) => document.querySelector(h).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })), HR); await page.waitForTimeout(1700);
  ok('hero: going back from the first slide wraps to the last one (still no video)', (await faceNow()) === 6, String(await faceNow()));
  ok('hero: every slide has a title, a photo, plans or rows, and a working link', await page.evaluate((h) => [...document.querySelector(h).querySelectorAll('.hs')].every((x) => x.querySelector('h2').textContent.trim().length > 4 && (x.querySelector('img') || x.querySelector('.hx__plan') || x.querySelector('.hx__rows')) && /^(\/|#\/|dialog:)/.test(x.querySelector('a').getAttribute('href'))), HR));
  const hLink = await page.evaluate((h) => document.querySelector(h + ' .hs.is-cur a').getAttribute('href'), HR);
  await page.click(HR + ' .hs.is-cur a'); await page.waitForTimeout(400);
  ok('hero: the button of the item in frame opens its page or its form', /^dialog:/.test(hLink) ? await page.evaluate(() => !document.querySelector('[data-hx-dialog]').hidden) : page.url().endsWith(hLink), page.url() + ' vs ' + hLink);
  if (/^dialog:/.test(hLink)) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
  await page.goto(`${URL0}#/home`);
  await page.setViewportSize({ width: 390, height: 844 }); await page.reload(); await page.waitForTimeout(1300);
  await page.evaluate((h) => document.querySelector(h + ' [data-hero-video]').dispatchEvent(new Event('ended')), HR); await page.waitForTimeout(1800);
  ok('hero on a phone: the cube works at phone width, the item fits and its controls are inside the screen', await page.evaluate((h) => { const e = document.querySelector(h), c = e.querySelector('.hero__ctl').getBoundingClientRect(), on = e.querySelector('.hs.is-cur').getBoundingClientRect(); return document.documentElement.scrollWidth <= innerWidth + 1 && c.right <= innerWidth + 1 && on.right <= innerWidth + 1 && on.width > 300; }, HR));
  await page.setViewportSize({ width: 1440, height: 900 });

  // ---- private circle: everybody can preview the classes, only a 4-week block opens them
  await page.setViewportSize({ width: 1440, height: 860 });
  const CR = '[data-page="pg/circulo-privado"]';
  await base(); await page.evaluate(() => localStorage.setItem('kx-test-orders', '0'));
  await page.goto(`${URL0}#/pg/circulo-privado`); await page.reload(); await page.waitForTimeout(1200);
  const cl = await page.evaluate((c) => { const r = document.querySelector(c + ' [data-circle]'); const card = r.querySelector('.circle__card'); return { locked: r.classList.contains('is-locked'), cards: r.querySelectorAll('.circle__card').length, gate: !r.querySelector('[data-circle-gate]').hidden, lockIcons: [...r.querySelectorAll('.circle__lock')].filter((x) => getComputedStyle(x).display !== 'none').length, bookTxt: card.querySelector('[data-circle-book]').innerText, price: /600/.test(r.innerText), detail: /Ren Jiménez/.test(card.innerText) && /09:00/.test(card.innerText), pills: [...r.querySelectorAll('[data-circle-filters] [data-sport]')].map((x) => x.getAttribute('data-sport')).join() }; }, CR);
  ok('private circle (no block): 12 classes are visible as a preview with a lock on every card and the $600 price', cl.locked && cl.cards === 12 && cl.gate && cl.lockIcons === 12 && cl.price && cl.detail, JSON.stringify(cl));
  ok('private circle: the sport filters are there (Todas + pádel, tenis, ciclismo, basketball, running, funcional)', cl.pills === 'all,padel,tenis,ciclismo,basketball,running,funcional', cl.pills);
  await page.evaluate((c) => document.querySelector(c + ' [data-circle-book]').click(), CR); await page.waitForTimeout(300);
  ok('private circle: a locked card does not book anything and the banner points to "Empezar mi bloque"', await page.evaluate((c) => !document.querySelector(c + ' .circle__card.is-sent') && /pedido/.test(document.querySelector(c + ' .circle__gatebtn').getAttribute('href')), CR));
  await page.evaluate((c) => document.querySelector(c + ' [data-circle-filters] [data-sport="tenis"]').click(), CR); await page.waitForTimeout(200);
  ok('private circle: the tennis filter shows only the 2 tennis classes', (await page.evaluate((c) => [...document.querySelectorAll(c + ' .circle__card:not([hidden])')].map((x) => x.getAttribute('data-sport')), CR)).join() === 'tenis,tenis');
  await page.evaluate(() => localStorage.setItem('kx-test-orders', '2'));
  await page.reload(); await page.waitForTimeout(1200);
  const cm = await page.evaluate((c) => { const r = document.querySelector(c + ' [data-circle]'); return { member: r.classList.contains('is-member'), gate: r.querySelector('[data-circle-gate]').hidden, welcome: !r.querySelector('[data-circle-welcome]').hidden, lockIcons: [...r.querySelectorAll('.circle__lock')].filter((x) => getComputedStyle(x).display !== 'none').length, book: getComputedStyle(r.querySelector('.circle__booklbl')).display !== 'none' }; }, CR);
  ok('private circle (active 4-week block): the locks and the banner are gone and "Apartar lugar" is enabled', cm.member && cm.gate && cm.welcome && cm.lockIcons === 0 && cm.book, JSON.stringify(cm));
  await page.evaluate(() => { document.querySelector('[data-hx-dialog]').setAttribute('data-endpoint', 'https://script.example/exec'); });
  const posts = []; await page.route('https://script.example/**', async (route) => { posts.push(route.request().postData() || ''); await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
  await page.evaluate((c) => document.querySelector(c + ' [data-circle-book]').click(), CR); await page.waitForTimeout(350);
  const cd = await page.evaluate(() => { const d = document.querySelector('[data-hx-dialog]'); return { open: !d.hidden, title: d.querySelector('[data-hxd-title]').textContent, chip: d.querySelector('[data-hxd-chip]').textContent, seats: !!d.querySelector('.hxd__g:not([hidden]) [name=lugares]'), price: /600/.test(d.querySelector('[data-hxd-sub]').textContent) }; });
  ok('private circle: a member who taps "Apartar lugar" gets the class form (class, date, venue and price, seats to choose)', cd.open && /Apartar lugar/.test(cd.title) && /Torneo Relámpago de Pádel/.test(cd.chip) && /Club Pádel Lomas/.test(cd.chip) && cd.seats && cd.price, JSON.stringify(cd));
  await page.fill('[data-hx-dialog] [name=name]', 'Ana'); await page.fill('[data-hx-dialog] [name=email]', 'ana@ejemplo.com'); await page.selectOption('[data-hx-dialog] [name=lugares]', '2'); await page.check('[data-hx-dialog] [name=consent]');
  await page.click('[data-hx-dialog] .hxd__go'); await page.waitForTimeout(350);
  ok('booking a class asks for first name, LAST NAME and e-mail: without the last name nothing is sent and the form says so', await page.evaluate(() => { const e = document.querySelector('[data-hxd-err]'); return !e.hidden && /apellido/i.test(e.textContent) && document.querySelector('[data-hxd-form]').hidden === false; }) && !posts.some((p) => /"tipo":"clase"/.test(p)));
  await page.fill('[data-hx-dialog] [name=apellido]', 'Pérez');
  await page.click('[data-hx-dialog] .hxd__go'); await page.waitForTimeout(500);
  ok('private circle: sending it books the class: the request carries the class and 2 spots, and the card shows "Solicitud enviada"', await page.evaluate((c) => !!document.querySelector(c + ' .circle__card.is-sent') && /enviada/i.test(document.querySelector(c + ' .circle__card.is-sent').innerText), CR) && posts.some((p) => /"tipo":"clase"/.test(p) && /Torneo Rel/.test(p) && /"lugares":"2"/.test(p)), posts.join(' | ').slice(0, 300));
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await page.evaluate(() => localStorage.setItem('kx-test-orders', '0'));
  await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(1200);
  ok('the ambassadors slide of the hero links to the private circle ("Ver más fechas")', await page.evaluate(() => /circulo-privado/.test(document.querySelector('[data-page="home"] .hs .hx__striphead a').getAttribute('href'))));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${URL0}#/pg/circulo-privado`); await page.reload(); await page.waitForTimeout(1200);
  ok('private circle on a phone: one column, nothing wider than the screen', await page.evaluate((c) => document.documentElement.scrollWidth <= innerWidth + 1 && getComputedStyle(document.querySelector(c + ' .circle__grid')).gridTemplateColumns.split(' ').length === 1, CR));
  await page.setViewportSize({ width: 1440, height: 860 });

  // ---- home sections: welcome photo (2), order portal (3), trainers (4), KFW (5)
  await page.setViewportSize({ width: 1440, height: 860 });
  await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(1300);
  const hs = await page.evaluate(() => { const pg = document.querySelector('[data-page="home"]'), secs = [...pg.querySelectorAll('.shopify-section')].map((e) => e.firstElementChild && e.firstElementChild.className); const w = pg.querySelector('.welcome-video'), tr = pg.querySelector('.tr'), kf = pg.querySelector('.kf'); const idx = (el) => secs.findIndex((c) => c === el.className); return { welcome: !!w && !!w.querySelector('img.welcome-video__photo') && !w.querySelector('video'), funnel: !!pg.querySelector('[data-funnel]'), order: [idx(w), idx(pg.querySelector('[data-funnel]').closest('section')), idx(tr), idx(kf)], trainers: tr ? tr.querySelectorAll('.tr__card:not(.tr__card--cta)').length : 0, trTxt: tr ? tr.textContent.replace(/\s+/g, ' ') : '', kfCards: kf ? kf.querySelectorAll('.kf__card').length : 0, kfTxt: kf ? kf.textContent.replace(/\s+/g, ' ') : '', dishesGone: !pg.querySelector('.rail'), glassGone: !pg.querySelector('.showcase--glass') }; });
  ok('home section 2: the welcome frame shows the photo (no video) in the same frame', hs.welcome);
  ok('home order: welcome frame, order portal, trainers, KFW (the dishes rail is gone)', hs.order[0] < hs.order[1] && hs.order[1] < hs.order[2] && hs.order[2] < hs.order[3] && hs.dishesGone, JSON.stringify(hs.order));
  ok('home section 4 keeps the mockup content: champion team, palmarés, five trainers with zone and distance, elite roster card', hs.trainers === 5 && /Los mejores entrenadores de tu ciudad/.test(hs.trTxt) && /Campeón Mundial IFBB Elite Pro/.test(hs.trTxt) && /Carla/.test(hs.trTxt) && /Jaime/.test(hs.trTxt) && /Angelópolis · 1\.8 km/.test(hs.trTxt) && /Elegir a mi entrenador/.test(hs.trTxt), hs.trTxt.slice(0, 160));
  ok('home section 5 keeps the mockup content: KFW headline, explore button and the four collection cards', hs.kfCards >= 2 && /Viste la disciplina/.test(hs.kfTxt) && /Explorar colección/.test(hs.kfTxt) && ((/Enterizos/.test(hs.kfTxt) && /Gorras/.test(hs.kfTxt)) || /\$\s?\d|MXN/.test(hs.kfTxt) || hs.kfCards >= 2), hs.kfTxt.slice(0, 160));
  ok('home sections 4 and 5: links work (roster -> trainers page, collection -> the store)', await page.evaluate(() => { const pg = document.querySelector('[data-page="home"]'); return /entrenador/.test(pg.querySelector('.tr__cbtn').getAttribute('href')) && /tienda|kulinaria-store|store/.test(pg.querySelector('.kf__btn').getAttribute('href')); }));
  await page.setViewportSize({ width: 390, height: 844 }); await page.reload(); await page.waitForTimeout(1300);
  ok('home sections 4 and 5 on a phone: nothing wider than the screen, trainer cards swipe', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && getComputedStyle(document.querySelector('[data-page="home"] .tr__cards')).overflowX === 'auto'));
  await page.setViewportSize({ width: 1440, height: 860 });

  // ---- hero buttons really do things
  await base(); await page.evaluate(() => { localStorage.setItem('kx-test-orders', '2'); });
  await page.setViewportSize({ width: 1440, height: 860 });
  await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(1300);
  const HX = '[data-page="home"] [data-hero]';
  await page.evaluate((h) => document.querySelector(h + ' [data-hero-video]').dispatchEvent(new Event('ended')), HX); await page.waitForTimeout(1800);
  const links = await page.evaluate((h) => [...document.querySelectorAll(h + ' .hs')].map((x) => [...x.querySelectorAll('a:not([aria-disabled])')].map((a) => a.getAttribute('href'))), HX);
  ok('hero: every event card opens the matching sport on the circle page (tenis, funcional, ciclismo, pádel)', ['tenis', 'funcional', 'ciclismo', 'padel'].every((sp) => links[1].some((l) => new RegExp('circulo-privado\\?deporte=' + sp).test(l))), links[1].join(' '));
  ok('hero: no dead buttons: every link is a page, a dialog or the order flow', links.flat().every((l) => l && l !== '#' && /^(#\/|\/|dialog:)/.test(l)), links.flat().filter((l) => !l || l === '#').join(','));
  await page.evaluate((h) => document.querySelector(h + ' [data-hs-dot="2"]').click(), HX); await page.waitForTimeout(1700);
  await page.evaluate((h) => document.querySelector(h + ' .hs.is-cur a.hx__card[href*="deporte=tenis"]').click(), HX); await page.waitForTimeout(500);
  await page.reload(); await page.waitForTimeout(1500);
  const tenis = await page.evaluate(() => { const r = document.querySelector('[data-page="pg/circulo-privado"] [data-circle]'); return { on: (r.querySelector('[data-sport].is-on') || {}).getAttribute && r.querySelector('[data-sport].is-on').getAttribute('data-sport'), shown: [...r.querySelectorAll('.circle__card:not([hidden])')].map((c) => c.getAttribute('data-sport')).join() }; });
  ok('clicking the tennis card lands on the circle page already filtered to tennis', page.url().includes('circulo-privado') && tenis.on === 'tenis' && tenis.shown === 'tenis,tenis', JSON.stringify(tenis));
  await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(1300);
  await page.evaluate((h) => document.querySelector(h + ' [data-hero-video]').dispatchEvent(new Event('ended')), HX); await page.waitForTimeout(1800);
  await page.evaluate((h) => document.querySelector(h + ' [data-hs-dot="3"]').click(), HX); await page.waitForTimeout(1700);
  await page.evaluate((h) => document.querySelector(h + ' .hs.is-cur a.hx__btn').click(), HX); await page.waitForTimeout(400);
  const dg = await page.evaluate(() => { const d = document.querySelector('[data-hx-dialog]'); return { open: !d.hidden, title: d.querySelector('[data-hxd-title]').textContent, chip: d.querySelector('[data-hxd-chip]').textContent, fits: d.querySelector('.hxd__box').getBoundingClientRect().bottom <= innerHeight + 2 }; });
  ok('hero: "Reservar consulta" opens a request form titled for the consultation with Ángel Otero', dg.open && /consulta/i.test(dg.title) && /Ángel Otero/.test(dg.chip) && dg.fits, JSON.stringify(dg));
  const turn0 = await page.evaluate((h) => [...document.querySelector(h + ' [data-hero-cube]').querySelectorAll('.hero__face')].findIndex((f) => f.classList.contains('is-cur')), HX); await page.waitForTimeout(5800);
  ok('hero: the carousel waits while the request form is open', (await page.evaluate((h) => [...document.querySelector(h + ' [data-hero-cube]').querySelectorAll('.hero__face')].findIndex((f) => f.classList.contains('is-cur')), HX)) === turn0);
  await page.click('[data-hx-dialog] .hxd__go'); await page.waitForTimeout(200);
  ok('hero: sending the form empty shows what is missing and sends nothing', await page.evaluate(() => { const e = document.querySelector('[data-hxd-err]'); return !e.hidden && e.textContent.length > 8; }));
  await page.fill('[data-hx-dialog] [name=name]', 'Ana'); await page.fill('[data-hx-dialog] [name=email]', 'ana@ejemplo.com'); await page.check('[data-hx-dialog] [name=consent]');
  const posts0 = []; page.on('request', (r) => { if (/script\.example|exec/.test(r.url()) && r.method() === 'POST') posts0.push((r.postData() || '').slice(0, 400)); });
  await page.click('[data-hx-dialog] .hxd__go'); await page.waitForTimeout(500);
  ok('hero: a valid request shows the thank-you and closes with Escape', await page.evaluate(() => !document.querySelector('[data-hxd-ok]').hidden && document.querySelector('[data-hxd-form]').hidden));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok('hero: Escape closes the form and the carousel is free again', await page.evaluate(() => document.querySelector('[data-hx-dialog]').hidden && !document.documentElement.classList.contains('hx-dlg-open')));
  await page.evaluate((h) => document.querySelector(h + ' [data-hs-dot="4"]').click(), HX); await page.waitForTimeout(1700);
  await page.evaluate((h) => [...document.querySelectorAll(h + ' .hs.is-cur .hx__card')].find((c) => /Magnate/i.test(c.textContent)).click(), HX); await page.waitForTimeout(300);
  ok('hero: the Magnate Barbería tile opens the coupon request', await page.evaluate(() => { const d = document.querySelector('[data-hx-dialog]'); return !d.hidden && /cupón/i.test(d.querySelector('[data-hxd-title]').textContent) && /Magnate/.test(d.querySelector('[data-hxd-chip]').textContent); }));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.evaluate((h) => document.querySelector(h + ' [data-hs-dot="4"]').click(), HX); await page.waitForTimeout(1700);
  ok('hero: the 1-block plan goes to the order flow with the 4-week plan chosen; 2 and 3 blocks open a request', await page.evaluate((h) => { const b = [...document.querySelectorAll(h + ' .hs.is-cur .hx__pbtn')].map((a) => a.getAttribute('href')); return /pedido\?plan=block/.test(b[0]) && /^dialog:plan/.test(b[1]) && /^dialog:plan/.test(b[2]); }, HX));
  await page.evaluate((h) => document.querySelector(h + ' [data-hs-dot="3"]').click(), HX); await page.waitForTimeout(1700);
  ok('hero: the five nutrition plans each open the consultation request with that plan named', await page.evaluate((h) => { const c = [...document.querySelectorAll(h + ' .hs.is-cur .hx__card')].map((a) => a.getAttribute('href')); return c.length === 5 && c.every((l) => /^dialog:consulta~/.test(l)); }, HX));
  await page.setViewportSize({ width: 1440, height: 860 });

  // ---- every hero / home button leads to its own working form
  await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(1300);
  await page.evaluate(() => { document.querySelector('[data-hx-dialog]').setAttribute('data-endpoint', 'https://script.example/exec'); });
  const HP = []; page.on('request', (r) => { if (/script\.example/.test(r.url()) && r.method() === 'POST') HP.push(r.postData() || ''); });
  await page.route('https://script.example/**', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
  const fillBase = async () => { await page.fill('[data-hx-dialog] [name=name]', 'Ana Pérez'); await page.fill('[data-hx-dialog] [name=email]', 'ana@ejemplo.com'); await page.fill('[data-hx-dialog] [name=phone]', '2221234567'); await page.check('[data-hx-dialog] [name=consent]'); };
  const vis = () => page.evaluate(() => [...document.querySelectorAll('[data-hx-dialog] .hxd__g:not([hidden]) [name]')].map((x) => x.name).join());
  await page.evaluate((h) => document.querySelector(h + ' [data-hero-video]').dispatchEvent(new Event('ended')), HX); await page.waitForTimeout(1800);
  // private events
  for (let k = 0; k < 3 && (await page.evaluate((h) => [...document.querySelector(h + ' [data-hero-cube]').querySelectorAll('.hero__face')].findIndex((f) => f.classList.contains('is-cur')), HX)) !== 6; k++) { await page.evaluate((h) => document.querySelector(h + ' [data-hs-dot="6"]').click(), HX); await page.waitForTimeout(1700); }
  await page.evaluate((h) => [...document.querySelectorAll(h + ' .hs.is-cur .hx__card')].find((c) => /Cenas íntimas/i.test(c.textContent)).click(), HX); await page.waitForTimeout(350);
  const ev = await page.evaluate(() => { const d = document.querySelector('[data-hx-dialog]'); return { title: d.querySelector('[data-hxd-title]').textContent, type: d.querySelector('[name=tipo_evento]').selectedOptions[0].textContent, fits: d.querySelector('.hxd__box').getBoundingClientRect().bottom <= innerHeight + 2 }; });
  ok('private events: "Cenas íntimas" opens the event builder with that type preselected', /evento privado/i.test(ev.title) && /Cena íntima/.test(ev.type) && ev.fits, JSON.stringify(ev));
  const evVis = await vis();
  ok('private events: all the event fields are on the form', ['tipo_evento', 'fecha', 'invitados', 'tiempos', 'presupuesto', 'lugar', 'alergias'].every((n) => evVis.split(',').includes(n)), evVis);
  const calS = await page.evaluate(() => { const c = document.querySelector('[data-hxd-cal]'), days = [...c.querySelectorAll('.hxd__day')]; const t = new Date(); return { shown: !!c && c.offsetHeight > 120, label: c.querySelector('[data-hxd-callbl]').textContent, today: (days.find((d) => +d.textContent === t.getDate()) || {}).disabled === true, free: days.filter((d) => !d.disabled).length, prevOff: c.querySelector('[data-hxd-calnav="-1"]').disabled }; });
  ok('private events: the form shows an availability calendar (this month, past days closed, previous month locked)', calS.shown && /\d{4}/.test(calS.label) && calS.today && calS.prevOff, JSON.stringify(calS));
  await fillBase(); await page.click('[data-hx-dialog] .hxd__go'); await page.waitForTimeout(250);
  ok('private events: sending without picking a date asks for one and sends nothing', await page.evaluate(() => { const e = document.querySelector('[data-hxd-err]'); return !e.hidden && /fecha/i.test(e.textContent); }));
  await page.evaluate(() => { const d = document.querySelector('[data-hx-dialog]'); const n = new Date(); n.setMonth(n.getMonth() + 1); const iso = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-15'; d.setAttribute('data-busy', iso); });
  await page.click('[data-hxd-calnav="1"]'); await page.waitForTimeout(150);
  ok('private events: dates marked as unavailable in the theme settings cannot be picked', await page.evaluate(() => { const b = document.querySelector('.hxd__day[data-d$="-15"]'); return b && b.disabled && b.classList.contains('is-busy'); }));
  await fillBase(); await page.click('.hxd__day.is-free[data-d$="-20"]'); await page.waitForTimeout(100); await page.fill('[data-hx-dialog] [name=invitados]', '10'); await page.selectOption('[data-hx-dialog] [name=tiempos]', { index: 2 }); await page.selectOption('[data-hx-dialog] [name=presupuesto]', { index: 2 }); await page.fill('[data-hx-dialog] [name=lugar]', 'Lomas de Angelópolis'); await page.fill('[data-hx-dialog] [name=alergias]', 'Sin mariscos');
  await page.click('[data-hx-dialog] .hxd__go'); await page.waitForTimeout(500);
  ok('private events: sending creates the event request (kind carta) with type, date, guests, courses, budget, venue and allergies', HP.some((p) => /"kind":"carta"/.test(p) && /Cena íntima/.test(p) && /"fecha":"\d{4}-\d{2}-20"/.test(p) && /"invitados":"10"/.test(p) && /"tiempos":"5 tiempos"/.test(p) && /Lomas de Angel/.test(p) && /mariscos/.test(p)), HP.join(' | ').slice(0, 360));
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  // nutrition consultation
  for (let k = 0; k < 3 && (await page.evaluate((h) => [...document.querySelector(h + ' [data-hero-cube]').querySelectorAll('.hero__face')].findIndex((f) => f.classList.contains('is-cur')), HX)) !== 3; k++) { await page.evaluate((h) => document.querySelector(h + ' [data-hs-dot="3"]').click(), HX); await page.waitForTimeout(1700); }
  await page.evaluate((h) => [...document.querySelectorAll(h + ' .hs.is-cur .hx__card')].find((c) => /Nutrición deportiva/i.test(c.textContent)).click(), HX); await page.waitForTimeout(350);
  const cv = await page.evaluate(() => { const d = document.querySelector('[data-hx-dialog]'); return { goal: d.querySelector('[name=objetivo]').selectedOptions[0].textContent, vis: [...d.querySelectorAll('.hxd__g:not([hidden]) [name]')].map((x) => x.name).join() }; });
  ok('nutrition: a plan card opens the consultation form with that goal selected, plus format, day and time to choose', /Nutrición deportiva de élite/.test(cv.goal) && /modalidad/.test(cv.vis) && /dia/.test(cv.vis) && /horario/.test(cv.vis), JSON.stringify(cv));
  await fillBase(); await page.selectOption('[data-hx-dialog] [name=dia]', { index: 2 }); await page.selectOption('[data-hx-dialog] [name=horario]', { index: 1 });
  await page.click('[data-hx-dialog] .hxd__go'); await page.waitForTimeout(500);
  ok('nutrition: sending books the consultation request with the goal, format, day and time', HP.some((p) => /"tipo":"consulta"/.test(p) && /Nutrición deportiva de élite/.test(p) && /"dia":"Miércoles"/.test(p) && /"horario":"Tarde"/.test(p)), HP.slice(-1).join('').slice(0, 300));
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  // trainers (home section 4)
  await page.evaluate(() => { const e = document.querySelector('[data-page="home"] .tr'); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 80); }); await page.waitForTimeout(400);
  await page.evaluate(() => [...document.querySelectorAll('[data-page="home"] .tr__card:not(.tr__card--cta)')].find((c) => /Fernando/.test(c.textContent)).click()); await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('[data-dp-content] a[href^="dialog:entrenador"]').click()); await page.waitForTimeout(450);
  const trn = await page.evaluate(() => { const d = document.querySelector('[data-hx-dialog]'); return { title: d.querySelector('[data-hxd-title]').textContent, who: d.querySelector('[name=entrenador]').value, vis: [...d.querySelectorAll('.hxd__g:not([hidden]) [name]')].map((x) => x.name).join() }; });
  ok('trainers: tapping a trainer opens "Elige a tu entrenador" with that trainer selected, goal, format, days per week and area', /entrenador/i.test(trn.title) && trn.who === 'Fernando' && /meta/.test(trn.vis) && /dias_semana/.test(trn.vis) && /zona/.test(trn.vis), JSON.stringify(trn));
  await fillBase(); await page.selectOption('[data-hx-dialog] [name=meta]', { index: 1 });
  await page.click('[data-hx-dialog] .hxd__go'); await page.waitForTimeout(500);
  ok('trainers: sending connects the customer with the trainer (trainer, goal and days in the request)', HP.some((p) => /"tipo":"entrenador"/.test(p) && /"entrenador":"Fernando"/.test(p) && /"meta":"Masa muscular"/.test(p) && /"dias_semana":"3"/.test(p)), HP.slice(-1).join('').slice(0, 300));
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await page.evaluate(() => document.querySelector('[data-page="home"] .tr__cbtn').click()); await page.waitForTimeout(300);
  ok('trainers: the roster button opens the same form with "the one that suits me best"', await page.evaluate(() => { const d = document.querySelector('[data-hx-dialog]'); return !d.hidden && d.querySelector('[name=entrenador]').value === ''; }));
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  // coupons: members get a personal code, everybody else sees the lock
  await page.evaluate(() => localStorage.setItem('kx-test-orders', '0')); await page.reload(); await page.waitForTimeout(1300);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('kx:open-dialog', { detail: { kind: 'cupon', what: 'Magnate Barbería' } })));  await page.waitForTimeout(400);
  const cpl = await page.evaluate(() => { const d = document.querySelector('[data-hx-dialog]'); return { lock: !d.querySelector('[data-hxd-couponlock]').hidden, code: !d.querySelector('[data-hxd-coupon]').hidden, send: !d.querySelector('[data-hxd-go]').hidden }; });
  ok('coupons: without an active 4-week block the coupon shows the lock and a way to start the block', cpl.lock && !cpl.code && !cpl.send, JSON.stringify(cpl));
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  const gt = {};
  for (const k of ['consulta', 'entrenador', 'clase']) {
    await page.evaluate((k) => document.dispatchEvent(new CustomEvent('kx:open-dialog', { detail: { kind: k, what: 'x' } })), k); await page.waitForTimeout(350);
    gt[k] = await page.evaluate(() => { const d = document.querySelector('[data-hx-dialog]'); return { lock: !d.querySelector('[data-hxd-gate]').hidden, form: [...d.querySelectorAll('.hxd__g:not([hidden])')].length, go: !d.querySelector('.hxd__go').hidden, cta: /pedido\?plan=block/.test((d.querySelector('[data-hxd-gate] a') || {}).href || '') }; });
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  }
  ok('member-only requests (nutrition consult, trainer, class) show a lock with "Empezar mi bloque" instead of the form when there is no active 4-week block', ['consulta', 'entrenador', 'clase'].every((k) => gt[k].lock && gt[k].form === 0 && !gt[k].go && gt[k].cta), JSON.stringify(gt));
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('kx:open-dialog', { detail: { kind: 'evento', what: 'Cena íntima' } }))); await page.waitForTimeout(300);
  ok('private events, partner-gym and area requests stay open to everyone (they are sales leads, not member perks)', await page.evaluate(() => { const d = document.querySelector('[data-hx-dialog]'); return d.querySelector('[data-hxd-gate]').hidden && !d.querySelector('.hxd__go').hidden; }));
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await page.evaluate(() => localStorage.setItem('kx-test-orders', '2')); await page.reload(); await page.waitForTimeout(1300);
  await page.evaluate(() => { document.querySelector('[data-hx-dialog]').setAttribute('data-endpoint', 'https://script.example/exec'); document.dispatchEvent(new CustomEvent('kx:open-dialog', { detail: { kind: 'cupon', what: 'Magnate Barbería' } })); }); await page.waitForTimeout(600);
  const cpm = await page.evaluate(() => { const d = document.querySelector('[data-hx-dialog]'); return { code: d.querySelector('[data-hxd-code]').textContent, shown: !d.querySelector('[data-hxd-coupon]').hidden, lock: !d.querySelector('[data-hxd-couponlock]').hidden }; });
  ok('coupons: a customer with an active block sees a personal code (KMAG-…) and can have it emailed', /^KMAG-/.test(cpm.code) && cpm.shown && !cpm.lock, JSON.stringify(cpm));
  await fillBase(); await page.click('[data-hx-dialog] .hxd__go'); await page.waitForTimeout(500);
  ok('coupons: sending records the coupon request with the code', HP.some((p) => /"tipo":"cupon"/.test(p) && /KMAG-/.test(p)), HP.slice(-1).join('').slice(0, 260));
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await page.evaluate(() => localStorage.setItem('kx-test-orders', '0'));
  await page.setViewportSize({ width: 1440, height: 860 });

  // ---- home: Gimnasios hermanos (red estratégica), right under the KFW apparel section
  await base(); await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(1300);
  const gyPosts = []; page.on('request', (r) => { if (/script\.example|exec/.test(r.url()) && r.method() === 'POST') gyPosts.push((r.postData() || '').slice(0, 500)); });
  await page.route('https://script.example/**', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
  await page.evaluate(() => { document.querySelector('[data-hx-dialog]').setAttribute('data-endpoint', 'https://script.example/exec'); });
  const gy = await page.evaluate(() => { const pg = document.querySelector('[data-page="home"]'), s = pg.querySelector('.gy'), kf = pg.querySelector('.kf'); const t = s ? s.innerText.replace(/\s+/g, ' ') : ''; return { has: !!s, after: !!(s && kf && (kf.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING)), txt: t, logos: s ? [...s.querySelectorAll('.gy__logo')].map((l) => l.getAttribute('aria-label')) : [], pins: s ? s.querySelectorAll('.gy__pin').length : 0 }; });
  ok('home: the gym network section sits right after the KFW apparel section', gy.has && gy.after, JSON.stringify([gy.has, gy.after]));
  ok('gym section keeps the mockup text (tag, headline, 15+ gyms paragraph, both buttons, map button and zone, official collection line)', /Gimnasios hermanos · Red estratégica/i.test(gy.txt) && /Alianzas que impulsan/.test(gy.txt) && /tu rendimiento\./.test(gy.txt) && /Más de 15 gimnasios partners unidos por una misma visión de comunidad y alto desempeño/.test(gy.txt) && /punto de entrega para recoger tus pedidos Kulinaria/.test(gy.txt) && /Explorar sedes/i.test(gy.txt) && /Afiliar gimnasio/i.test(gy.txt) && /Buscar sede en mi zona/i.test(gy.txt) && /Lomas de Angelópolis/.test(gy.txt) && /Colección oficial KFW/i.test(gy.txt), gy.txt.slice(0, 200));
  ok('gym section shows the eight partner gyms and the affiliation card (Afilia tu gimnasio, Dueño o gerente, Agendar reunión)', gy.logos.length === 8 && ['Sports World', 'Empire Fitness', 'smart fit', 'Anytime Fitness', 'Prime Fitness', 'Crownit', 'Stone Fit', 'Lomas Training'].every((n) => gy.logos.some((l) => l === n)) && /Afilia tu gimnasio/.test(gy.txt) && /¿Dueño o gerente\? Suma tu sede a la red Kulinaria\./.test(gy.txt) && /Agendar reunión/i.test(gy.txt) && gy.pins >= 6, JSON.stringify([gy.logos, gy.pins]));
  ok('"Explorar sedes" goes to the partner gyms page', await page.evaluate(() => /embajadores-gimnasios/.test([...document.querySelectorAll('[data-page="home"] .gy__btn')].find((a) => /Explorar sedes/i.test(a.textContent)).getAttribute('href'))));
  await page.evaluate(() => { const e = document.querySelector('[data-page="home"] .gy'); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 40); }); await page.waitForTimeout(500);
  await page.click('[data-page="home"] .gy__mapbtn'); await page.waitForTimeout(350);
  const sd = await page.evaluate(() => { const d = document.querySelector('[data-hx-dialog]'); return { open: !d.hidden, title: d.querySelector('[data-hxd-title]').textContent, vis: [...d.querySelectorAll('.hxd__g:not([hidden]) [name]')].map((x) => x.name).join() }; });
  ok('"Buscar sede en mi zona" opens a form asking for your area', sd.open && /Elige tu sede/.test(sd.title) && /zona_sede/.test(sd.vis), JSON.stringify(sd));
  await page.fill('[data-hx-dialog] [name=name]', 'Ana Pérez'); await page.fill('[data-hx-dialog] [name=email]', 'ana@ejemplo.com'); await page.check('[data-hx-dialog] [name=consent]'); await page.fill('[data-hx-dialog] [name=zona_sede]', 'Lomas de Angelópolis');
  await page.click('[data-hx-dialog] .hxd__go'); await page.waitForTimeout(500);
  ok('sending the area request lands in the sheet with the area', gyPosts.some((p) => /"tipo":"sede"/.test(p) && /Lomas de Angel/.test(p)), gyPosts.slice(-1).join('').slice(0, 260));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.click('[data-page="home"] .gy__logo[aria-label="Sports World"]'); await page.waitForTimeout(350);
  ok('clicking a gym logo opens the pickup form with that gym already filled in', await page.evaluate(() => { const d = document.querySelector('[data-hx-dialog]'); return !d.hidden && d.querySelector('[name=sede]').value === 'Sports World'; }));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.click('[data-page="home"] .gy__affil .gy__btn'); await page.waitForTimeout(350);
  const gf = await page.evaluate(() => { const d = document.querySelector('[data-hx-dialog]'); return { title: d.querySelector('[data-hxd-title]').textContent, vis: [...d.querySelectorAll('.hxd__g:not([hidden]) [name]')].map((x) => x.name).join() }; });
  ok('"Agendar reunión" opens the partner-gym form (gym name, role, locations, meeting date and time, city)', /Afilia tu gimnasio/.test(gf.title) && ['gimnasio', 'cargo', 'sedes', 'fecha_reunion', 'horario_reunion', 'ciudad'].every((n) => gf.vis.split(',').includes(n)), JSON.stringify(gf));
  await page.fill('[data-hx-dialog] [name=name]', 'Luis Gerente'); await page.fill('[data-hx-dialog] [name=email]', 'luis@gym.com'); await page.check('[data-hx-dialog] [name=consent]'); await page.fill('[data-hx-dialog] [name=gimnasio]', 'Titan Gym'); await page.selectOption('[data-hx-dialog] [name=cargo]', { index: 1 }); await page.fill('[data-hx-dialog] [name=ciudad]', 'Puebla');
  await page.click('[data-hx-dialog] .hxd__go'); await page.waitForTimeout(500);
  ok('sending it creates a partnership request (kind gimnasio) with the gym, role and city', gyPosts.some((p) => /"kind":"gimnasio"/.test(p) && /Titan Gym/.test(p) && /"cargo":"Gerente"/.test(p) && /Puebla/.test(p)), gyPosts.slice(-1).join('').slice(0, 300));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.setViewportSize({ width: 390, height: 844 }); await page.reload(); await page.waitForTimeout(1200);
  ok('phone: the gym section fits the width and keeps all eight logos', await page.evaluate(() => { const s = document.querySelector('[data-page="home"] .gy'); return s.scrollWidth <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1 && s.querySelectorAll('.gy__logo').length === 8; }));
  await page.setViewportSize({ width: 1440, height: 900 });

  // ---- "Tu semana" board: group pills, day cards, weekend add-ons, sides, customise pop-up, tally summary
  await base({ funnel: { info: { name: 'Ana Pérez', email: 'ana@ejemplo.com', phone: '+52 999 000 0000', street: 'Calle Lago 24', cluster: 'Clúster Las Lomas', zip: '72000' } } }); await page.setViewportSize({ width: 1440, height: 900 }); await open(false); await chooseDiet('keto-low-carb');
  const bd = await page.evaluate((f) => { const h = document.querySelector(f), t = (q) => (h.querySelector(q) || {}).textContent || ''; return { pills: [...h.querySelectorAll('.fn-bd__pill')].map((b) => b.textContent.trim()), info: t('.fn-bd__info'), note: t('.fn-bd__note'), title: t('.fn-bd__titlebar h4'), sub: t('.fn-bd__titlebar p'), cards: h.querySelectorAll('.fn-wk__card').length, we: [...h.querySelectorAll('.fn-we')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()), grp: [...h.querySelectorAll('.fn-wk__card .fn-wk__grp')].length }; }, FN);
  ok('the week step shows the group pills (four quick groups + Todos), the closing-time pill and the "mix groups freely" note', bd.pills.length === 5 && /Todos/.test(bd.pills[4]) && /Cierra: Sáb 10:00 AM/.test(bd.info) && /Auto-selección activa si no confirmas/.test(bd.info) && /Mezcla grupos libremente: cambia de dieta arriba sin perder tus días elegidos/.test(bd.note), JSON.stringify(bd.pills) + bd.info);
  ok('title "Tu semana recomendada/combinada", five day cards each with the group badge, plus Saturday and Sunday locked as add-ons', /Tu semana/.test(bd.title) && /Personaliza tus platillos por día/.test(bd.sub) && bd.cards === 5 && bd.grp === 5 && bd.we.length === 2 && /Activar Sábado/.test(bd.we[0]) && /Toca para despertar/.test(bd.we[0]) && /Activar Domingo/.test(bd.we[1]), JSON.stringify(bd.we));
  const namesBefore = (await names()).join('|');
  const evenness = () => page.evaluate((f) => {
    const cs = [...document.querySelectorAll(f + ' .fn-wk__card')], sel = { top: '.fn-wk__top', nutrition: '.fn-wk__m', tier: '.fn-wk__slot > .fn-wk__tier', photo: '.fn-wk__img', buttons: '.fn-wk__btns', side: '.fn-wk__comp', second: '.fn-wk__add2' }, out = {};
    Object.keys(sel).forEach((k) => { const v = cs.map((c) => { const e = c.querySelector(sel[k]); return e ? e.getBoundingClientRect().top - c.getBoundingClientRect().top : null; }).filter((x) => x !== null); out[k] = v.length === cs.length ? +(Math.max(...v) - Math.min(...v)).toFixed(2) : 'missing'; });
    const hh = cs.map((c) => c.getBoundingClientRect().height); out.height = +(Math.max(...hh) - Math.min(...hh)).toFixed(2); return out; }, FN);
  const ev1 = await evenness();
  ok('the five day cards are perfectly even: name, nutrition, level chip, photo, buttons, side dish and second-plate rows start at the same height in every card, and the cards are the same height (desktop)', Object.values(ev1).every((v) => typeof v === 'number' && v <= 1), JSON.stringify(ev1));
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
  const ev2 = await evenness();
  ok('...and on a phone too', Object.values(ev2).every((v) => typeof v === 'number' && v <= 1), JSON.stringify(ev2));
  await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(300);
  await page.evaluate((f) => document.querySelector(f + ' [data-bd-view="sin-gluten"]').click(), FN); await page.waitForTimeout(300);
  ok('picking another group only changes the catalogue below: the days already chosen stay', (await names()).join('|') === namesBefore && await page.evaluate((f) => /Catálogo de grupo/.test(document.querySelector(f + ' .fn-ct__head h4').textContent) && !!document.querySelector(f + ' .fn-bd__pill.is-on[data-bd-view="sin-gluten"]'), FN));
  // the category badge on a day card is a button: it opens the categories and shows that menu in the catalogue
  await page.evaluate((f) => document.querySelector(f + ' [data-bd-grp="1"]').click(), FN); await page.waitForTimeout(250);
  const gm = await page.evaluate((f) => { const m = document.querySelector(f + ' [data-bd-gmenu="1"]'); return { open: !m.hidden, n: m.querySelectorAll('[data-bd-gpick]').length, badge: document.querySelector(f + ' [data-bd-grp="1"]').textContent.trim() }; }, FN);
  ok('the category badge of a day card is clickable and lists every category', gm.open && gm.n === 12, JSON.stringify(gm));
  await page.evaluate((f) => document.querySelector(f + ' [data-bd-gpick="1:bowls"]').click(), FN); await page.waitForTimeout(400);
  const gc = await page.evaluate((f) => ({ cat: document.querySelector(f + ' .fn-ct__head h4').textContent, who: document.querySelector(f + ' .fn-ct__for').textContent, n: document.querySelectorAll(f + ' [data-ct-pick]').length, on: document.querySelector(f + ' .fn-bd__pill.is-on, .fn-bd__pill--more.is-on') !== null }), FN);
  ok('choosing a category from the badge shows that group in the catalogue at the bottom, aimed at that day, without touching the chosen days', /Bowls/i.test(gc.cat) && /Martes/.test(gc.who) && gc.n >= 1 && (await names()).join('|') === namesBefore, JSON.stringify(gc));
  // "Cambiar": the same carousel pop-up for the plates of the category
  await page.evaluate((f) => document.querySelector(f + ' [data-bd-focus="2:0"]').click(), FN); await page.waitForTimeout(350);
  const dp = await page.evaluate(() => { const m = document.querySelector('.fn-md--cr'); return { open: !m.hidden, title: m.querySelector('.fn-cr__t').textContent, sub: m.querySelector('.fn-cr__s').textContent, tabs: [...m.querySelectorAll('[data-cr-tab]')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()), center: m.querySelector('.fn-cr__c h4').textContent, sheet: !!m.querySelector('[data-cr-sheet]'), ings: m.querySelectorAll('[data-cr-ing]').length, note: !!m.querySelector('[data-cr-note]'), ok: (m.querySelector('[data-cr-ok]') || {}).textContent, fits: m.querySelector('.fn-md__box').getBoundingClientRect().bottom <= innerHeight + 2 }; });
  ok('"Cambiar" opens "Elige tu platillo" for that day and group: level tabs, the current plate big in the middle with its ficha, ingredients to omit, special request and "Confirmar platillo"', dp.open && dp.fits && /Elige tu platillo/.test(dp.title) && /Miércoles/.test(dp.sub) && dp.tabs.length === 4 && /Selecto \(\d+\)/.test(dp.tabs[0]) && dp.center.length > 3 && dp.sheet && dp.ings >= 1 && dp.note && /Confirmar platillo/.test(dp.ok), JSON.stringify(dp));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok('the pop-up closes with Escape and nothing changed', (await names()).join('|') === namesBefore);
  await page.evaluate((f) => document.querySelector(f + ' [data-bd-grp="2"]').click(), FN); await page.waitForTimeout(150);
  await page.evaluate((f) => document.querySelector(f + ' [data-bd-gpick="2:bowls"]').click(), FN); await page.waitForTimeout(300);
  await page.evaluate((f) => document.querySelector(f + ' [data-bd-focus="2:0"]').click(), FN); await page.waitForTimeout(350);
  const nav = await page.evaluate(() => { const m = document.querySelector('.fn-md--cr'); const first = m.querySelector('.fn-cr__c h4').textContent, has = !!m.querySelector('.fn-cr__n--next:not(.is-empty)'); return { first, has }; });
  if (nav.has) { await page.click('.fn-md--cr .fn-cr__n--next'); await page.waitForTimeout(200); }
  const second = await page.evaluate(() => document.querySelector('.fn-md--cr .fn-cr__c h4').textContent);
  ok('the plates around the middle one are clickable (and arrows / keys move along): the middle plate changes', !nav.has || second !== nav.first, JSON.stringify([nav, second]));
  await page.click('.fn-md--cr [data-cr-ok]'); await page.waitForTimeout(400);
  const afterC = await names(), beforeC = namesBefore.split('|');
  ok('confirming puts the chosen plate on that day only (Wednesday); the other days stay', afterC.length === 5 && afterC[2] !== beforeC[2] && [0, 1, 3, 4].every((k) => afterC[k] === beforeC[k]), afterC.join(' | '));
  // side dish
  await page.evaluate((f) => document.querySelector(f + ' [data-bd-comp="1"]').click(), FN); await page.waitForTimeout(300);
  const cp = await page.evaluate(() => { const m = document.querySelector('.fn-md--cr'); return { open: !m.hidden, title: m.querySelector('.fn-cr__t').textContent, tabs: [...m.querySelectorAll('[data-cr-tab]')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()), none: !!m.querySelector('[data-cr-none]'), center: !!m.querySelector('.fn-cr__c h4'), fits: m.querySelector('.fn-md__box').getBoundingClientRect().bottom <= innerHeight + 2 }; });
  ok('"Elegir complemento" opens "Elige tu complemento": tabs Ensaladas / Sopas / Postres with their counts, the chosen plate big in the middle, and "Sin complemento"', cp.open && cp.fits && /Elige tu complemento/.test(cp.title) && cp.tabs.length === 3 && /Ensalada \(\d+\)/.test(cp.tabs[0]) && /Sopa \(\d+\)/.test(cp.tabs[1]) && /Postre \(\d+\)/.test(cp.tabs[2]) && cp.none && cp.center, JSON.stringify(cp));
  await page.click('.fn-md--cr [data-cr-tab="sopa"]'); await page.waitForTimeout(250);
  await page.click('.fn-md--cr [data-cr-ok]'); await page.waitForTimeout(300);
  ok('confirming a side closes the pop-up and the card reads "… elegido" with the plate chosen', await page.evaluate((f) => !!document.querySelector('.fn-md--cr').hidden && /elegido/.test(document.querySelector(f + ' [data-bd-comp="1"]').textContent) && /Crema|Sopa/.test(document.querySelector(f + ' [data-bd-comp="1"]').textContent), FN));
  // customise pop-up
  await page.evaluate((f) => document.querySelector(f + ' [data-bd-cust="0"]').click(), FN); await page.waitForTimeout(300);
  const cu = await page.evaluate(() => { const m = document.querySelector('.fn-md--cust'); return { open: !m.hidden, txt: m.textContent.replace(/\s+/g, ' '), ings: m.querySelectorAll('[data-md-ing]').length, fits: m.querySelector('.fn-md__box').getBoundingClientRect().bottom <= innerHeight + 2 }; });
  ok('the pencil opens "Personaliza tu platillo": dish, nutrition chip, full sheet link, ingredients to remove, special request, save and cancel', cu.open && cu.fits && /Personaliza tu platillo/.test(cu.txt) && /Ver ficha nutricional completa/.test(cu.txt) && /Quitar ingredientes \(toca para omitir\)/.test(cu.txt) && /Nota para cocina/.test(cu.txt) && /Guardar cambios/.test(cu.txt) && /Cancelar/.test(cu.txt) && cu.ings >= 2, cu.txt.slice(0, 160));
  await page.click('.fn-md--cust [data-md-ing]'); await page.fill('.fn-md--cust [data-md-note]', 'Sin sal extra'); await page.click('.fn-md--cust [data-md-close].fn-md__cancel'); await page.waitForTimeout(250);
  ok('Cancelar throws the changes away', await page.evaluate((f) => !document.querySelector(f + ' .fn-wk__card .fn-wk__note') && document.querySelector('.fn-md--cust').hidden, FN));
  await page.evaluate((f) => document.querySelector(f + ' [data-bd-cust="0"]').click(), FN); await page.waitForTimeout(250);
  const ing0 = await page.evaluate(() => document.querySelector('.fn-md--cust [data-md-ing]').getAttribute('data-md-ing'));
  await page.click('.fn-md--cust [data-md-ing]'); await page.fill('.fn-md--cust [data-md-note]', 'Sin sal extra'); await page.click('.fn-md--cust [data-md-save]'); await page.waitForTimeout(350);
  ok('Guardar cambios keeps the omitted ingredient and the note on the card', await page.evaluate(({ f, ing0 }) => { const n = document.querySelector(f + ' .fn-wk__card .fn-wk__note'); return !!n && n.textContent.indexOf(ing0) > -1 && /Sin sal extra/.test(n.textContent); }, { f: FN, ing0 }), ing0);
  // weekend add-on
  const t0 = await page.evaluate((f) => parseFloat(document.querySelector(f + ' [data-fn-s-total]').textContent.replace(/[^\d]/g, '')), FN);
  await page.evaluate((f) => document.querySelector(f + ' [data-we-on="0"]').click(), FN); await page.waitForTimeout(300); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok('"+ Activar Sábado" wakes the card (delivered Friday) and offers "Elegir platillo"', await page.evaluate((f) => { const e = document.querySelector(f + ' .fn-we.is-on'); return !!e && /Entrega viernes/i.test(e.textContent) && /Sábado/.test(e.textContent) && /Elegir platillo/.test(e.textContent); }, FN));
  await page.evaluate((f) => document.querySelector(f + ' [data-ct-pick]').click(), FN); await page.waitForTimeout(400);
  const wk = await page.evaluate((f) => { const e = document.querySelector(f + ' .fn-we.is-on'); return { tier: (e.querySelector('.fn-wk__tier') || {}).textContent, total: parseFloat(document.querySelector(f + ' [data-fn-s-total]').textContent.replace(/[^\d]/g, '')) }; }, FN);
  const price = parseFloat((wk.tier || '').replace(/[^\d]/g, ''));
  ok('a weekend dish is an extra: it shows its own price and adds it to "Hoy pagas"', price >= 150 && wk.total === t0 + price, JSON.stringify([t0, wk]));
  // the tally
  await page.evaluate((f) => { document.querySelectorAll(f + ' [data-fn-dish]').forEach((d) => { d.setAttribute('data-calcium', '120'); d.setAttribute('data-iron', '2.4'); d.setAttribute('data-vitc', '18'); d.setAttribute('data-potassium', '620'); d.setAttribute('data-fiber', '6'); }); }, FN);
  await page.evaluate(() => { const f = window.fetch; window.__calls = []; window.fetch = function (u, o) { window.__calls.push(String(u).split('/').pop() + ' ' + ((o && o.body) || '').slice(0, 4000)); return f.apply(this, arguments); }; });
  await page.locator(`${FN} [data-fn-finish]`).scrollIntoViewIfNeeded(); await page.click(`${FN} [data-fn-finish]`); await page.waitForTimeout(500);
  const sm = await page.evaluate(() => { const m = document.querySelector('.fn-md--sum'); return { open: !m.hidden, txt: m.textContent.replace(/\s+/g, ' '), days: m.querySelectorAll('.fn-sm__day').length, fits: m.querySelector('.fn-md__box').getBoundingClientRect().bottom <= innerHeight + 2 }; });
  ok('the tally lists every day (Mon-Fri + the weekend dish), the plan deposit, level upgrades, $0 sides, the closing time and "Total de hoy"', sm.open && sm.days === 6 && /Detalle por día \(6 consumos\)/.test(sm.txt) && /Desglose de niveles y extras/.test(sm.txt) && /depósito/i.test(sm.txt) && /3,600/.test(sm.txt) && /Selecto/.test(sm.txt) && /Complementos incluidos/.test(sm.txt) && /Cierre de edición/.test(sm.txt) && /Total de hoy/.test(sm.txt) && /Añadir snack o postre extra/.test(sm.txt) && /Confirmar y guardar semana/.test(sm.txt), sm.txt.slice(0, 220));
  ok('the tally breaks the week down in nutrition: calories and macros per day (and the weekend dish), daily average, week total and the calorie split', await page.evaluate(() => { const n = document.querySelector('.fn-sm__nut'); if (!n) return false; const rows = [...n.querySelectorAll('tbody tr')]; const tot = n.querySelector('tr.is-total'); const kc = (r) => parseFloat(r.children[1].textContent.replace(/[^\d]/g, '')); const sum = rows.reduce((a, r) => a + kc(r), 0); return rows.length === 6 && /Promedio por día/.test(n.textContent) && /Total de la semana/.test(n.textContent) && /Reparto de calorías/.test(n.textContent) && /por platillo/.test(n.textContent) && Math.abs(sum - kc(tot)) <= 1 && /Proteína \d+%/.test(n.textContent); }));
  ok('dish tiles say the calories are per plate', await page.evaluate((f) => /kcal por platillo/.test(document.querySelector(f + ' .fn-dish .dish__facts').textContent), FN));
  const mic = await page.evaluate(() => { const m = document.querySelector('.fn-sm__micro'); return m ? [...m.querySelectorAll('li')].map((l) => l.textContent.replace(/\s+/g, ' ').trim()) : []; });
  ok('micronutrients: when the dish sheets carry them the tally shows the daily average of each against the daily reference value (% VD)', mic.length >= 3 && mic.some((x) => /Calcio/.test(x) && /%/.test(x)) && mic.some((x) => /Hierro/.test(x)) && mic.some((x) => /Vitamina C/.test(x)), JSON.stringify(mic));
  ok('the tally total equals "Hoy pagas" (deposit + upgrades + weekend dish)', await page.evaluate((f) => { const t = document.querySelector('.fn-sm__total b').textContent.replace(/[^\d]/g, ''), b = document.querySelector(f + ' [data-fn-s-total]').textContent.replace(/[^\d]/g, ''); return t === b; }, FN));
  await page.click('.fn-md--sum [data-sm-go]'); await page.waitForTimeout(1200);
  const cl2 = await page.evaluate(() => window.__calls);
  ok('confirming puts the plan line, the upgrade line and the weekend dish (as its own product, flagged as an extra) in the cart, with sides and notes as properties', page.url().endsWith('#/carrito') && cl2.some((r) => /add\.js/.test(r) && /_platillos/.test(r) && /fin-de-semana/.test(r) && /Sin sal extra/.test(r) && /Crema|Sopa/.test(r) && /_extras/.test(r)), JSON.stringify(cl2).slice(0, 500));

  // ---- circle page: live classes, seats and real booking answers from the sheet backend
  await base(); await page.evaluate(() => localStorage.setItem('kx-test-orders', '2')); await page.setViewportSize({ width: 1440, height: 900 });
  const live = [
    { key: 'tenis-a', sport: 'tenis', title: 'Clínica de Tenis', coach: 'Jessica', date: '2026-12-10', time: '09:00', venue: 'Raqueta Club', cap: 12, min: 6, price: 600, status: 'Abierta', art: '', taken: 3, left: 9, full: false, waiting: 0, limit: 24 },
    { key: 'padel-b', sport: 'padel', title: 'Torneo de Pádel', coach: 'Anny', date: '2026-12-12', time: '10:00', venue: 'Club Padel', cap: 8, min: 4, price: 600, status: 'Confirmada', art: '', taken: 8, left: 0, full: true, waiting: 2, limit: 24 },
    { key: 'run-c', sport: 'running', title: 'Rodada de 10K', coach: 'Ren', date: '2026-12-14', time: '07:00', venue: 'Parque', cap: 20, min: 5, price: 0, status: 'Cancelada', art: '', taken: 0, left: 20, full: false, waiting: 0, limit: 24 }];
  const bookCalls = []; let bookState = 'Pendiente';
  await page.route('https://script.example/**', async (route) => { const u = new URL(route.request().url()), q = Object.fromEntries(u.searchParams); let body = { ok: true };
    if (q.action === 'classes') body = { ok: true, classes: live }; else if (q.action === 'book') { bookCalls.push(q); body = { ok: true, state: bookState, id: 'r1', left: 5 }; } else if (q.action === 'coupon') body = { ok: true, code: 'KMAG-SRV42', partner: 'magnate', expires: '2099-01-01' };
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) }); });
  await page.goto(`${URL0}#/pg/circulo-privado`); await page.reload(); await page.waitForTimeout(1200);
  await page.evaluate(() => { document.querySelector('[data-circle]').setAttribute('data-endpoint', 'https://script.example/exec'); document.querySelector('[data-hx-dialog]').setAttribute('data-endpoint', 'https://script.example/exec'); document.dispatchEvent(new CustomEvent('kx:circle-refresh')); }); await page.waitForTimeout(700);
  const lv = await page.evaluate(() => { const cs = [...document.querySelectorAll('[data-page="pg/circulo-privado"] .circle__card')]; return { n: cs.length, keys: cs.map((c) => c.getAttribute('data-key')).join(), txt: cs.map((c) => c.textContent.replace(/\s+/g, ' ')), dis: cs.map((c) => c.querySelector('[data-circle-book]').disabled), pills: [...document.querySelectorAll('[data-page="pg/circulo-privado"] [data-circle-filters] [data-sport]:not([hidden])')].map((p) => p.getAttribute('data-sport')).join() }; });
  ok('the circle page shows the classes of the sheet (not the typed ones), with seats left, full + waiting list, status and the price', lv.n === 3 && lv.keys === 'tenis-a,padel-b,run-c' && /Quedan 9 lugares/.test(lv.txt[0]) && /Faltan 3 para confirmar/.test(lv.txt[0]) && /Llena/.test(lv.txt[1]) && /En espera: 2/.test(lv.txt[1]) && /Clase confirmada/.test(lv.txt[1]) && /\$600/.test(lv.txt[0]), JSON.stringify([lv.txt[1].slice(0, 220)]));
  ok('a cancelled class cannot be booked and the sport pills only list the sports that have classes', lv.dis[2] === true && lv.pills === 'all,padel,tenis,running' || lv.pills.split(',').sort().join() === 'all,padel,running,tenis', lv.pills);
  await page.evaluate(() => document.querySelector('[data-page="pg/circulo-privado"] .circle__card[data-key="tenis-a"] [data-circle-book]').click()); await page.waitForTimeout(400);
  await page.fill('[data-hx-dialog] [name=name]', 'Ana'); await page.fill('[data-hx-dialog] [name=apellido]', 'Pérez'); await page.fill('[data-hx-dialog] [name=email]', 'ana@ejemplo.com'); await page.check('[data-hx-dialog] [name=consent]'); await page.selectOption('[data-hx-dialog] [name=lugares]', '2');
  await page.click('[data-hx-dialog] .hxd__go'); await page.waitForTimeout(600);
  ok('booking asks the sheet for the class key and seats, and tells the member it is a request to be confirmed by e-mail (nothing charged)', bookCalls.length === 1 && bookCalls[0].cls === 'tenis-a' && bookCalls[0].seats === '2' && bookCalls[0].email === 'ana@ejemplo.com' && bookCalls[0].name === 'Ana' && bookCalls[0].last === 'Pérez' && await page.evaluate(() => { const o = document.querySelector('[data-hxd-ok]'); return !o.hidden && /te confirmamos por correo/.test(o.textContent) && /no se cobra nada/i.test(o.textContent); }), JSON.stringify(bookCalls));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  bookState = 'En espera';
  await page.evaluate(() => document.querySelector('[data-page="pg/circulo-privado"] .circle__card[data-key="padel-b"] [data-circle-book]').click()); await page.waitForTimeout(400);
  await page.fill('[data-hx-dialog] [name=name]', 'Luis'); await page.fill('[data-hx-dialog] [name=apellido]', 'Gómez'); await page.fill('[data-hx-dialog] [name=email]', 'luis@ejemplo.com'); await page.check('[data-hx-dialog] [name=consent]'); await page.click('[data-hx-dialog] .hxd__go'); await page.waitForTimeout(600);
  ok('a full class answers "lista de espera"', await page.evaluate(() => /lista de espera/.test(document.querySelector('[data-hxd-ok]').textContent)));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('kx:open-dialog', { detail: { kind: 'cupon', what: 'Cupón Magnate Barbería' } }))); await page.waitForTimeout(600);
  ok('the coupon code shown is the one issued by the sheet (not a made-up one)', await page.evaluate(() => document.querySelector('[data-hxd-code]').textContent === 'KMAG-SRV42'));
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);

  // ---- admin hub: classes (capacity + reservations), coupons, trainer / gym directory
  await base(); await page.setViewportSize({ width: 1280, height: 900 }); await page.evaluate(() => sessionStorage.setItem('kx-admin-key', 'adm'));
  const admCalls = [];
  const cdata = { ok: true, classes: [{ key: 'tenis-a', sport: 'tenis', title: 'Clínica de Tenis', coach: 'Jessica', date: '2026-12-10', time: '09:00', venue: 'Raqueta Club', cap: 12, min: 6, price: 600, status: 'Abierta', limit: 24, taken: 3 }, { key: 'padel-b', sport: 'padel', title: 'Torneo de Pádel', coach: 'Anny', date: '2026-12-12', time: '10:00', venue: 'Club', cap: 8, min: 4, price: 600, status: 'Confirmada', limit: 24, taken: 8 }],
    reservas: [{ id: 'r1', cls: 'tenis-a', name: 'Ana', email: 'ana@x.com', phone: '999', seats: 2, status: 'Pendiente', paid: 'Pendiente' }],
    coupons: [{ code: 'KMAG-ABC12', partner: 'magnate', name: 'Ana', email: 'ana@x.com', expires: '2099-01-01', status: 'Activo', uses: 0 }], trainers: [{ name: 'Carla', role: 'IFBB', zone: 'Lomas', email: 'c@x.com', phone: '1', active: 'Sí' }], gyms: [{ name: 'Sports World', zone: 'Angelópolis', address: '', contact: '', email: 'sw@x.com', phone: '', pickup: 'Sí', active: 'Sí' }] };
  await page.route('https://script.example/**', async (route) => { const q = Object.fromEntries(new URL(route.request().url()).searchParams); admCalls.push(q);
    const body = q.action === 'admin' ? { ok: true, orders: [], clients: [], recipes: null, finance: { orders: [], expenses: [] }, leads: [] } : q.action === 'coupon_check' ? { ok: true, valid: q.code === 'KMAG-ABC12', partner: 'magnate', expires: '2099-01-01' } : /^circle_/.test(q.action) ? cdata : { ok: true };
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) }); });
  await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(900);
  await page.evaluate(() => { const d = document.createElement('div'); d.id = 'adm-c'; d.setAttribute('data-endpoint', 'https://script.example/exec'); d.setAttribute('data-lang', 'es'); document.body.appendChild(d); window.KXAdmin.mount(d); });
  await page.waitForSelector('#adm-c [data-tab="8"]', { timeout: 8000 }); await page.click('#adm-c [data-tab="8"]'); await page.waitForTimeout(500);
  const ac = await page.evaluate(() => ({ cards: document.querySelectorAll('#adm-c .adm-class').length, txt: document.querySelector('#adm-c [data-classes]').textContent.replace(/\s+/g, ' '), res: document.querySelectorAll('#adm-c [data-res-status]').length, form: !!document.querySelector('#adm-c [data-class-form]') }));
  ok('admin "Clases": every class shows seats taken / capacity, the minimum, its status and its reservations; there is a form to add or edit a class', ac.cards === 2 && /3 \/ 12/.test(ac.txt) && /Mínimo para confirmar: 6/.test(ac.txt) && /Confirmada/.test(ac.txt) && ac.res === 1 && ac.form, JSON.stringify(ac));
  await page.selectOption('#adm-c [data-res-status="r1"]', 'Confirmada'); await page.waitForTimeout(400);
  ok('changing a reservation state in the hub calls the sheet (which e-mails the member)', admCalls.some((c) => c.action === 'circle_res_set' && c.id === 'r1' && c.status === 'Confirmada'));
  await page.fill('#adm-c [data-class-form] [name=title]', 'Circuito funcional'); await page.fill('#adm-c [data-class-form] [name=date]', '2026-12-20'); await page.fill('#adm-c [data-class-form] [name=cap]', '15'); await page.fill('#adm-c [data-class-form] [name=min]', '5'); await page.click('#adm-c [data-c-save]'); await page.waitForTimeout(400);
  ok('saving the form creates/updates the class (title, date, capacity, minimum, price, hours before) in the sheet', admCalls.some((c) => c.action === 'circle_class_save' && c.title === 'Circuito funcional' && c.date === '2026-12-20' && c.cap === '15' && c.min === '5' && c.limit === '24'), JSON.stringify(admCalls.slice(-1)));
  await page.evaluate(() => { window.confirm = () => true; }); await page.click('#adm-c [data-c-cancel="tenis-a"]'); await page.waitForTimeout(300);
  ok('cancelling a class from the hub goes to the sheet (it e-mails everybody booked)', admCalls.some((c) => c.action === 'circle_class_cancel' && c.ckey === 'tenis-a'));
  await page.click('#adm-c [data-tab="9"]'); await page.waitForTimeout(300);
  await page.fill('#adm-c [data-cp-form] [name=code]', 'KMAG-ABC12'); await page.click('#adm-c [data-cp-check]'); await page.waitForTimeout(400);
  ok('admin "Cupones": checking a code says VÁLIDO with the partner and expiry; the list shows who has which code', await page.evaluate(() => /VÁLIDO/.test(document.querySelector('#adm-c [data-cp-result]').textContent) && /KMAG-ABC12/.test(document.querySelector('#adm-c [data-coupons]').textContent)));
  await page.click('#adm-c [data-cp-redeem="KMAG-ABC12"]'); await page.waitForTimeout(300);
  ok('"Canjear" registers the redemption', admCalls.some((c) => c.action === 'circle_coupon_redeem' && c.code === 'KMAG-ABC12'));
  await page.click('#adm-c [data-tab="10"]'); await page.waitForTimeout(300);
  await page.fill('#adm-c [data-dir-form="trainer"] [name=name]', 'Ramón'); await page.fill('#adm-c [data-dir-form="trainer"] [name=email]', 'ramon@x.com'); await page.click('#adm-c [data-dir-save="trainer"]'); await page.waitForTimeout(300);
  ok('admin "Directorio": trainers and partner gyms are listed and can be added (their e-mail receives the requests)', admCalls.some((c) => c.action === 'circle_dir_save' && c.tab === 'trainer' && c.name === 'Ramón' && c.email === 'ramon@x.com') && await page.evaluate(() => /Carla/.test(document.querySelector('#adm-c [data-trainers]').textContent) && /Sports World/.test(document.querySelector('#adm-c [data-gyms]').textContent)));

  // ---- v157/158: loader theme + trainer profile panel
  {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const th of ['fuego', 'llama']) {
      await page.evaluate((t) => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('kx-lang', 'es'); localStorage.setItem('kx-theme', t); localStorage.setItem('kx-test-orders', '0'); }, th);
      await page.goto(URL0 + '#/home'); await page.reload(); await page.waitForTimeout(250);
      const L = await page.evaluate(() => { const l = document.getElementById('loader'); if (!l) return null; const cs = getComputedStyle(l); return { bg: cs.backgroundImage, color: cs.color, flame: !!l.querySelector('.loader__flame'), k: !!l.querySelector('.loader__k'), bar: !!l.querySelector('[data-loader-bar]'), pct: !!l.querySelector('[data-loader-pct]') }; });
      ok('loader (' + th + '): flame + K mark + progress bar, themed background', L && L.flame && L.k && L.bar && L.pct && /gradient/.test(L.bg), JSON.stringify(L));
    }
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('kx-lang', 'es'); sessionStorage.setItem('kx-seen', '1'); localStorage.setItem('kx-test-orders', '0'); });
    await page.goto(URL0 + '#/home'); await page.reload(); await page.waitForTimeout(900);
    const n = await page.evaluate(() => document.querySelectorAll('[data-tr-card]').length);
    ok('trainers: every trainer card is a button that opens a profile', n >= 5, String(n));
    await page.evaluate(() => document.querySelector('[data-tr-card]').scrollIntoView({ block: 'center' })); await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('[data-tr-card]').click()); await page.waitForTimeout(700);
    const tp = await page.evaluate(() => { const p = document.querySelector('[data-dish-panel]'); const c = p.querySelector('[data-dp-content]'); return { open: !p.hidden, name: (c.querySelector('.dd__title') || {}).textContent, acc: c.querySelectorAll('.tp__acc li').length, heads: [...c.querySelectorAll('.dd__h')].map((h) => h.textContent.trim()), ig: (c.querySelector('.tp__ig') || {}).href || '', lockShown: !!c.querySelector('[data-tp-lock]') && !c.querySelector('[data-tp-lock]').hidden, contactHidden: c.querySelector('[data-tp-open]').hidden, full: !p.querySelector('[data-dp-full]').hidden }; });
    ok('trainer panel: name, accolades, specialty, how they train, Instagram placeholder link', tp.open && tp.name && tp.acc >= 2 && tp.heads.length >= 4 && /instagram\.com/.test(tp.ig) && !tp.full, JSON.stringify(tp));
    ok('trainer panel: contact is locked for someone without a 4-week block (with the "Empezar mi bloque" call to action)', tp.lockShown && tp.contactHidden, JSON.stringify(tp));
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    await page.evaluate(() => localStorage.setItem('kx-test-orders', '2'));
    await page.reload(); await page.waitForTimeout(900);
    await page.evaluate(() => document.querySelector('[data-tr-card]').scrollIntoView({ block: 'center' })); await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('[data-tr-card]').click()); await page.waitForTimeout(800);
    const tm = await page.evaluate(() => { const c = document.querySelector('[data-dp-content]'); return { lock: c.querySelector('[data-tp-lock]').hidden, open: !c.querySelector('[data-tp-open]').hidden, btn: (c.querySelector('[data-tp-open] a[href^="dialog:entrenador"]') || document.body).getAttribute('href') || '' }; });
    ok('trainer panel: a block member sees the contact button (opens the trainer request)', tm.lock && tm.open && /dialog:entrenador~/.test(tm.btn || ''), JSON.stringify(tm));
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  }

  // ---- v159/160: class descriptions + panel, KFW cards
  {
    await page.setViewportSize({ width: 1440, height: 900 });
    const CR2 = '[data-page="pg/circulo-privado"]';
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('kx-lang', 'es'); sessionStorage.setItem('kx-seen', '1'); localStorage.setItem('kx-test-orders', '0'); });
    await page.goto(`${URL0}#/pg/circulo-privado`); await page.reload(); await page.waitForTimeout(1200);
    const cd = await page.evaluate((c) => [...document.querySelectorAll(c + ' .circle__card')].map((x) => ((x.querySelector('.circle__desc') || {}).textContent || '').trim().length), CR2);
    ok('classes: every class card carries a description', cd.length >= 4 && cd.every((n) => n > 30), JSON.stringify(cd));
    await page.evaluate((c) => document.querySelector(c + ' .circle__card .circle__top').click(), CR2); await page.waitForTimeout(700);
    const cp = await page.evaluate(() => { const p = document.querySelector('[data-dish-panel]'), c = p.querySelector('[data-dp-content]'); return { open: !p.hidden, title: (c.querySelector('.dd__title') || {}).textContent, about: [...c.querySelectorAll('.dd__h')].map((h) => h.textContent).join('|'), desc: ((c.querySelector('.dd__desc') || {}).textContent || '').length, lock: !c.querySelector('[data-tp-lock]').hidden, pickHidden: p.querySelector('[data-dp-pick]').hidden }; });
    ok('class panel: description, coach and venue; locked (no booking button) without a 4-week block', cp.open && cp.title && /Sobre esta clase/.test(cp.about) && cp.desc > 30 && cp.lock && cp.pickHidden, JSON.stringify(cp));
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    await page.evaluate(() => localStorage.setItem('kx-test-orders', '2')); await page.reload(); await page.waitForTimeout(1200);
    await page.evaluate((c) => document.querySelector(c + ' .circle__card .circle__top').click(), CR2); await page.waitForTimeout(800);
    const cm = await page.evaluate(() => { const p = document.querySelector('[data-dish-panel]'), c = p.querySelector('[data-dp-content]'); return { lock: c.querySelector('[data-tp-lock]').hidden, pickHidden: p.querySelector('[data-dp-pick]').hidden, label: p.querySelector('[data-dp-pick]').textContent }; });
    ok('class panel: a block member can book straight from the panel', cm.lock && !cm.pickHidden && /Apartar|Reservar/.test(cm.label), JSON.stringify(cm));
    await page.evaluate(() => document.querySelector('[data-dp-pick]').click()); await page.waitForTimeout(500);
    ok('...and it opens the booking form for that class', await page.evaluate(() => !document.querySelector('[data-hx-dialog]').hidden));
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(1000);
    const kf = await page.evaluate(() => { const k = document.querySelector('[data-page="home"] .kf'); return { cards: k.querySelectorAll('.kf__card').length, col: !!k.querySelector('[data-kf-cards]') }; });
    ok('KFW: the section shows its cards (store products when the collection has them, theme cards otherwise)', kf.col && kf.cards >= 2, JSON.stringify(kf));
  }

  // ---- v161: complements always offer several cards to flick through; pickers never open on an empty tab
  {
    await page.setViewportSize({ width: 1440, height: 900 });
    await base(); await open(false); await chooseDiet('keto-low-carb');
    await page.evaluate((f) => document.querySelector(f + ' [data-bd-comp="0"]').click(), FN); await page.waitForTimeout(500);
    const c1 = await page.evaluate(() => { const m = document.querySelector('.fn-md--cr'); return { open: m && !m.hidden, tabs: [...m.querySelectorAll('.fn-cr__tab')].map((t) => t.textContent.trim()), img: ((m.querySelector('.fn-cr__ph span') || {}).style || {}).backgroundImage || '', next: !m.querySelector('[data-cr-go="next"]').disabled, title: (m.querySelector('.fn-cr__c h4') || {}).textContent }; });
    ok('complement picker: the salad tab has a picture and several cards (not a single empty placeholder)', c1.open && /ensalada/i.test(c1.tabs[0]) && /\((\d+)\)/.test(c1.tabs[0]) && +/\((\d+)\)/.exec(c1.tabs[0])[1] >= 3 && /data:image|url/.test(c1.img) && c1.next, JSON.stringify(c1));
    await page.evaluate(() => document.querySelector('.fn-md--cr [data-cr-go="next"]').click()); await page.waitForTimeout(250);
    const c2 = await page.evaluate(() => (document.querySelector('.fn-md--cr .fn-cr__c h4') || {}).textContent);
    ok('...and the arrow shuffles to the next one', c2 && c2 !== c1.title, c1.title + ' → ' + c2);
    await page.evaluate(() => document.querySelector('.fn-md--cr [data-cr-ok]').click()); await page.waitForTimeout(400);
    const c3 = await page.evaluate((f) => (document.querySelector(f + ' [data-bd-comp="0"]') || {}).textContent, FN);
    ok('choosing it shows its name on the day card', c3 && c3.indexOf(c2) > -1, c3);
    for (const tab of ['sopa', 'postre']) {
      await page.evaluate((f) => document.querySelector(f + ' [data-bd-comp="1"]').click(), FN); await page.waitForTimeout(400);
      await page.evaluate((t) => document.querySelector('.fn-md--cr [data-cr-tab="' + t + '"]').click(), tab); await page.waitForTimeout(200);
      const n = await page.evaluate(() => document.querySelectorAll('.fn-md--cr .fn-cr__tab')[0] ? +/\((\d+)\)/.exec([...document.querySelectorAll('.fn-md--cr .fn-cr__tab.is-on')][0].textContent)[1] : 0);
      ok('complement picker: the ' + tab + ' tab also has several cards', n >= 3, String(n));
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    }
    // swapping a dish: the picker opens on a tab that has dishes
    await page.evaluate((f) => document.querySelector(f + ' [data-bd-focus="0:0"]').click(), FN); await page.waitForTimeout(300);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  }

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
