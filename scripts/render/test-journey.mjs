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
console.log(fail.length ? fail.length + ' failed' : 'journey ok');
