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
// =====================================================================  v69: steps 1 and 2 before ordering: sign in, then the questionnaire
{
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${URL0}#/home`); await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('kx-test-fresh', '1'); localStorage.setItem('kx-test-gate', '1'); localStorage.setItem('kx-test-orders', '0'); localStorage.setItem('kx-rules-ok', '1'); sessionStorage.setItem('kx_ob_asked', '1'); });
  await page.reload(); await page.waitForTimeout(900);
  const gs = '[data-page="home"] [data-fn-gate]';
  ok('a signed-in customer who has not done the questionnaire sees the gate, not the builder', !(await page.$eval(gs, (e) => e.hidden)) && (await page.$eval('[data-page="home"] [data-funnel]', (e) => e.classList.contains('is-gated'))));
  ok('gate step 1 (account) is done and step 2 (questionnaire) links to it', await page.evaluate((g) => { const e = document.querySelector(g); return e.querySelector('[data-fn-gate-s1]').classList.contains('is-done') && !e.querySelector('[data-fn-gate-s2]').classList.contains('is-done') && /bienvenida/.test(e.querySelector('[data-fn-gate-a2] a').getAttribute('href')); }, gs));
  await page.evaluate(() => { localStorage.setItem('kulinaria_onboarded', '1'); localStorage.removeItem('kx-test-fresh'); }); await page.reload(); await page.waitForTimeout(900);
  ok('once the questionnaire is done the gate disappears and the builder opens', (await page.$eval(gs, (e) => e.hidden)) && !(await page.$eval('[data-page="home"] [data-funnel]', (e) => e.classList.contains('is-gated'))));
  await page.evaluate(() => { localStorage.removeItem('kx-test-gate'); });
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
await page.fill(`${obS} [data-ob="city"]`, 'Mérida'); await page.fill(`${obS} [data-ob="zip"]`, '97000'); await page.fill(`${obS} [data-ob="refs"]`, 'Frente al parque'); await page.selectOption(`${obS} [data-ob="window"]`, 'pm');
await page.click(`${obS} [data-ob-next]`); await page.waitForTimeout(150);
await page.fill(`${obS} [data-ob="adults"]`, '2'); await page.fill(`${obS} [data-ob="kids"]`, '1'); await page.check(`${obS} [data-ob-group="meals"][value="comidas"]`);
await page.click(`${obS} [data-ob-next]`); await page.waitForTimeout(150);
await page.check(`${obS} [data-ob-allergy][value="Mariscos"]`); await page.selectOption(`${obS} [data-ob="severity"]`, 'fuerte'); await page.check(`${obS} [data-ob-group="conditions"][value="diabetes"]`);
await page.click(`${obS} [data-ob-next]`); await page.waitForTimeout(150);
await page.check(`${obS} [data-ob-diet][value="Keto"]`); await page.fill(`${obS} [data-ob="dislikes"]`, 'cebolla'); await page.selectOption(`${obS} [data-ob="goal"]`, 'bajar'); await page.selectOption(`${obS} [data-ob="spice"]`, '2');
await page.click(`${obS} [data-ob-next]`); await page.waitForTimeout(150);
await page.click(`${obS} [data-ob-save]`); await page.waitForTimeout(250);
ok('saving without the three confirmations is refused', !(await page.$eval(`${obS} [data-ob-error]`, (e) => e.hidden)) && (await page.$eval(`${obS} [data-ob-welcome]`, (e) => e.hidden)));
for (const c of await page.$$(`${obS} [data-ob-consent]`)) await c.check();
await page.click(`${obS} [data-ob-save]`); await page.waitForTimeout(400);
ok('after saving, a welcome screen greets the customer and points to choosing the plan', !(await page.$eval(`${obS} [data-ob-welcome]`, (e) => e.hidden)) && /Ana/.test(await page.$eval(`${obS} [data-ob-hello]`, (e) => e.textContent)) && /pedido/.test(await page.$eval(`${obS} [data-ob-welcome] a.btn--gold`, (e) => e.getAttribute('href'))));
const obSaved = await page.evaluate(() => ({ f: JSON.parse(localStorage.getItem('kulinaria_funnel') || '{}'), p: JSON.parse(localStorage.getItem('kulinaria_profile') || '{}'), on: localStorage.getItem('kulinaria_onboarded') }));
ok('the answers are stored once (contact, address, allergies, diet, dislikes)', obSaved.on === '1' && obSaved.f.info.email === 'ana@ejemplo.com' && obSaved.f.info.street === 'Calle Lago 24' && obSaved.f.info.city === 'Mérida' && obSaved.f.info.window === 'pm' && obSaved.f.info.adults === '2' && obSaved.f.info.meals === 'comidas' && obSaved.f.info.conditions === 'diabetes' && obSaved.f.info.goal === 'bajar' && !!obSaved.f.info.consent && obSaved.p.allergies.includes('Mariscos') && obSaved.p.diets.includes('Keto') && obSaved.p.dislikes.includes('cebolla'));
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
