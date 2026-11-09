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


await page.goto(URL0);
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
  await page.click(`${f} [data-plan-choice="week"]`); await page.waitForTimeout(700); await page.click(`${f} [data-fn-sc-next]`); await page.waitForTimeout(500);
  for (let i = 0; i < 5; i++) await page.evaluate((f) => document.querySelector(f + ' [data-fn-dish]:not(.is-hidden) [data-pick]').click(), f);
  await page.evaluate(() => { const fe = window.fetch; window.__calls = []; window.fetch = function (u, o) { window.__calls.push(String(u).split('/').pop()); return fe.apply(this, arguments); }; });
  await page.click(`${f} [data-fn-finish]`); await page.waitForTimeout(1000);
  ok('existing customer: confirming a week goes straight to the cart without asking for any details', page.url().endsWith('#/carrito') && (await page.evaluate(() => window.__calls)).join() === "cart.js,update.js,add.js", page.url());
}
// a new account that tries to order without answering the questionnaire is sent to it
await page.goto(`${URL0}#/home`); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('kx-test-orders', '0'); sessionStorage.setItem('kx_ob_asked', '1'); });
await page.goto(`${URL0}#/pg/cuenta-semana`); await page.reload(); await page.waitForTimeout(4200);
ok('Mi semana tells a customer without a plan to build their order first', await page.$eval('[data-page="pg/cuenta-semana"] [data-mw-buy]', (e) => !e.hidden && /pedido/.test(e.querySelector('a').getAttribute('href'))));
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });


await browser.close();
console.log(fail.length ? fail.length + ' failed' : 'all onboarding checks passed');
