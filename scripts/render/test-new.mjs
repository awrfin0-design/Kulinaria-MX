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
const SKIP_LOADER = () => { try { sessionStorage.setItem('kx-seen', '1'); if (!localStorage.getItem('kx-test-norules')) { localStorage.setItem('kx-rules-ok', '1'); if (!localStorage.getItem('kx-test-nostart')) sessionStorage.setItem('kx-test-start', '1'); } if (!localStorage.getItem('kx-test-returning')) sessionStorage.setItem('kx_newplan', '1'); } catch (e) {} };
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(SKIP_LOADER);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });


await page.goto(URL0); await page.evaluate(() => { localStorage.setItem('kx-test-orders', '0'); sessionStorage.setItem('kx_ob_asked', '1'); });
// =====================================================================  v49: funnel tutorial + per-day ingredient tweaks
{
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => localStorage.removeItem('kulinaria_funnel')); await page.evaluate(() => { location.hash = '#/pg/pedido'; }); await page.reload(); await page.waitForTimeout(800);
  await page.evaluate(() => { localStorage.setItem('kx-test-norules', '1'); localStorage.removeItem('kx-rules-ok'); localStorage.removeItem('kulinaria_funnel'); }); await page.reload(); await page.waitForTimeout(800);
  const R0 = '[data-page="pg/pedido"] ';
  const r0 = await page.evaluate(() => { const f = document.querySelector('[data-page="pg/pedido"] [data-funnel]'); const t = f.querySelector('[data-fn-rules]').textContent; return { step: f.getAttribute('data-step'), items: f.querySelectorAll('.fn-rcard').length, chk: f.querySelector('[data-fn-rules-check]').disabled, btn: f.querySelector('[data-fn-rules-next]').disabled, txt: t }; });
  ok('the first step explains the rules: $3,600 base, about $900 a week, extra paid on the week, with the $1,280 example', r0.step === '0' && r0.items === 9 && /3,600/.test(r0.txt) && /900/.test(r0.txt) && /1,280/.test(r0.txt) && /380/.test(r0.txt), JSON.stringify([r0.step, r0.items]));
  ok('until the visitor reaches the end of the rules, "I understand" and the next button are locked', r0.chk === true && r0.btn === true);
  await page.evaluate(() => { const b = document.querySelector('[data-page="pg/pedido"] [data-fn-dot]:nth-child(3)'); b.click(); }); await page.waitForTimeout(200);
  ok('the dots cannot skip the rules', await page.evaluate(() => document.querySelector('[data-page="pg/pedido"] [data-funnel]').getAttribute('data-step') === '0'));
  await page.evaluate(() => { const r = document.querySelector('[data-page="pg/pedido"] [data-fn-rules-rail]'); r.scrollLeft = r.scrollWidth; }); await page.waitForTimeout(500);
  console.log('DEBUG', JSON.stringify(await page.evaluate(() => { const f = document.querySelector('[data-page="pg/pedido"] [data-funnel]'); const r = f.querySelector('[data-fn-rules-rail]'); return { step: f.getAttribute('data-step'), sl: r.scrollLeft, sw: r.scrollWidth, cw: r.clientWidth, dis: f.querySelector('[data-fn-rules-check]').disabled, vis: r.getBoundingClientRect().width, rules: localStorage.getItem('kx-rules-ok'), cls: f.className, panel: getComputedStyle(f.querySelector('.funnel__panel')).display, on: f.querySelector('.step.is-on').getAttribute('data-fn-step'), ret: !f.querySelector('[data-fn-returning]').hidden, orders: localStorage.getItem('kx-test-orders'), np: sessionStorage.getItem('kx_newplan'), vw: innerWidth }; })));
  ok('after scrolling to the end the tick box unlocks, and the button unlocks once it is ticked', await page.evaluate(() => { const f = document.querySelector('[data-page="pg/pedido"] [data-funnel]'); const c = f.querySelector('[data-fn-rules-check]'), b = f.querySelector('[data-fn-rules-next]'); const before = !c.disabled && b.disabled; c.click(); return before && !b.disabled; }));
  await page.evaluate(() => document.querySelector('[data-page="pg/pedido"] [data-fn-rules-next]').click()); await page.waitForTimeout(400);
  ok('then the plan step opens and the rules are remembered', await page.evaluate(() => document.querySelector('[data-page="pg/pedido"] [data-funnel]').getAttribute('data-step') === '1' && localStorage.getItem('kx-rules-ok') === '1'));
  await page.evaluate(() => { localStorage.removeItem('kx-test-norules'); });
  await page.evaluate(() => document.querySelector('[data-page="pg/pedido"] [data-plan-choice="block"]').click()); await page.waitForTimeout(700); await page.click('[data-page="pg/pedido"] [data-fn-sc-next]'); await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('[data-page="pg/pedido"] [data-fn-dish]:not(.is-hidden) [data-pick]').click()); await page.waitForTimeout(400);
  ok('the pencil appears on a day with a dish and the tweak panel starts closed', await page.evaluate(() => { const e = document.querySelector('[data-page="pg/pedido"] [data-fn-day-edit="0"]'); const m = document.querySelector('[data-page="pg/pedido"] [data-fn-mods]'); return !!e && !e.hidden && m.hidden; }));
  await page.click('[data-page="pg/pedido"] .fn-week [data-fn-day-edit="0"]'); await page.waitForTimeout(250);
  const mods = await page.evaluate(() => { const m = document.querySelector('[data-page="pg/pedido"] [data-fn-mods]'); return m && !m.hidden ? { chips: m.querySelectorAll('.chip').length, inp: !!m.querySelector('[data-fn-mods-note]'), warn: /alergia|allergy/i.test(m.textContent) } : null; });
  ok('after picking a dish, the day offers its ingredients to leave out, a free note and the allergy disclaimer', !!mods && mods.chips >= 1 && mods.inp && mods.warn, JSON.stringify(mods));
  await page.click('[data-page="pg/pedido"] [data-fn-mods] .chip'); await page.fill('[data-page="pg/pedido"] [data-fn-mods-note]', 'salsa aparte'); await page.waitForTimeout(150);
  ok('the summary lists the dish ingredients and the tweak made', await page.evaluate(() => { const t = document.querySelector('[data-page="pg/pedido"] .funnel__list li .fn-s-ing'); return !!t && /salsa aparte/.test(t.textContent) && t.textContent.length > 20; }));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('kulinaria_funnel')).mods[0]);
  ok('tweaks are saved with the day (ingredient off + note)', saved.off.length === 1 && saved.note === 'salsa aparte', JSON.stringify(saved));
  await page.goto(`${URL0}#/home`); await page.evaluate(() => { localStorage.removeItem('kulinaria_onboarded'); }); await page.goto(`${URL0}#/pg/cuenta-perfil`); await page.reload(); await page.waitForTimeout(500);
  ok('profile page starts with the questionnaire banner until the onboarding is done', await page.evaluate(() => { const b = document.querySelector('[data-page="pg/cuenta-perfil"] [data-onb-banner]'); return !!b && !b.hidden && /bienvenida/.test(b.querySelector('a').getAttribute('href')); }));
  await page.evaluate(() => localStorage.setItem('kulinaria_onboarded', '1')); await page.reload(); await page.waitForTimeout(400);
  ok('the questionnaire banner disappears once the profile exists', await page.evaluate(() => document.querySelector('[data-page="pg/cuenta-perfil"] [data-onb-banner]').hidden));
  await page.evaluate(() => localStorage.clear());
  for (const [vw, vh] of [[1440, 900], [1280, 720], [390, 844]]) {
    await page.setViewportSize({ width: vw, height: vh }); await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(700);
    const wv = await page.evaluate(() => { const f = document.querySelector('[data-page="home"] .welcome-video__frame'); const r = f && f.getBoundingClientRect(); const funnel = document.querySelector('[data-page="home"] [data-funnel]'); const fr = funnel && funnel.closest('.shopify-section').getBoundingClientRect(); return f ? { h: Math.round(r.height), vh: innerHeight, copy: /\S/.test(f.querySelector('.welcome-video__copy').textContent), hasVideo: !!f.querySelector('video'), funnelH: fr ? Math.round(fr.height) : 0 } : null; });
    ok(`home welcome film @${vw}x${vh}: a framed player with a welcome text that fits inside one screen`, !!wv && wv.hasVideo && wv.copy && wv.h <= wv.vh, JSON.stringify(wv));
    if (vw > 760) ok(`home order builder section fits one screen @${vw}x${vh}`, !!wv && wv.funnelH > 0 && wv.funnelH <= vh + 2, JSON.stringify(wv));
    else ok(`home order builder on a phone (${vw}x${vh}): its section is tall enough for the step and the next section does not cover it`, await page.evaluate(() => { const f = document.querySelector('[data-page="home"] [data-funnel]'); const sec = f.closest('.shopify-section'), nx = sec.nextElementSibling; const on = f.querySelector('.step.is-on').getBoundingClientRect(); return on.height > 100 && on.bottom <= nx.getBoundingClientRect().top + 2; }));
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  // a visitor who is not signed in never sees allergy warnings, even with an old profile stored in the browser
  const G3 = URL0.replace('index.html', 'guest.html');
  await page.goto(`${G3}#/home`); await page.evaluate(() => { localStorage.setItem('kulinaria_profile', JSON.stringify({ allergies: ['Frutos secos'], dislikes: [], diets: [] })); }); await page.goto(`${G3}#/p/salmon-costra-almendras`); await page.reload(); await page.waitForTimeout(500);
  ok('guest: no allergy alert on the salmon page (warnings are only for signed-in, onboarded accounts)', await page.evaluate(() => { const d = document.querySelector('[data-page="p/salmon-costra-almendras"]'); return !!d && d.querySelector('[data-allergen-alert]').hidden; }));
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(() => localStorage.removeItem('kulinaria_funnel'));
}


// =====================================================================  v50: seasonal staples, returning customers, rules step fits the desktop frame
{
  await page.setViewportSize({ width: 1430, height: 650 });
  await page.goto(`${URL0}#/menu`); await page.evaluate(() => { localStorage.setItem('kx-test-orders', '0'); }); await page.reload(); await page.waitForTimeout(700);
  const SM = '[data-page="menu"] ';
  const cnt = () => page.evaluate((sm) => ({ week: document.querySelectorAll(sm + '[data-dish]:not(.is-hidden):not([data-seasonal])').length, season: document.querySelectorAll(sm + '[data-dish]:not(.is-hidden)[data-seasonal]').length, note: !document.querySelector(sm + '[data-season-note]').hidden }), SM);
  const c0 = await cnt();
  ok('menu page: by default only the weekly dishes show (the seasonal ones wait behind the toggle)', c0.week === 9 && c0.season === 0 && !c0.note, JSON.stringify(c0));
  await page.click(`${SM}[data-filter="season"][data-value="season"]`); await page.waitForTimeout(300);
  const c1 = await cnt();
  ok('menu page: "De temporada" shows the limited-edition dishes with the explanation, and hides the weekly ones', c1.week === 0 && c1.season === 2 && c1.note, JSON.stringify(c1));
  ok('seasonal cards carry a "limited edition" ribbon with the season', await page.evaluate((sm) => [...document.querySelectorAll(sm + '[data-seasonal] .dish__ribbon')].every((r) => /limitada/i.test(r.textContent)) && document.querySelectorAll(sm + '[data-seasonal] .dish__ribbon').length === 2, SM));
  await page.click(`${SM}[data-filter="season"][data-value="week"]`); await page.waitForTimeout(300);
  ok('and back to the weekly menu', (await cnt()).week === 9);

  // order funnel: the toggle sits on the menu step
  await page.evaluate(() => { sessionStorage.setItem('kx_newplan', '1'); localStorage.removeItem('kulinaria_funnel'); }); await page.goto(`${URL0}#/pg/pedido`); await page.reload(); await page.waitForTimeout(800);
  const PF = '[data-page="pg/pedido"] ';
  await page.evaluate(() => document.querySelector('[data-page="pg/pedido"] [data-plan-choice="block"]').click()); await page.waitForTimeout(700);
  const sc0 = await page.evaluate((pf) => [...document.querySelectorAll(pf + '.fn-sc')].filter((c) => getComputedStyle(c).display !== 'none').length, PF);
  await page.click(`${PF}[data-fn-season="season"]`); await page.waitForTimeout(300);
  const sc1 = await page.evaluate((pf) => [...document.querySelectorAll(pf + '.fn-sc')].filter((c) => getComputedStyle(c).display !== 'none').length, PF);
  ok('order builder, menu step: the seasonal toggle swaps the weekly cards for the 2 limited-edition ones', sc0 === 9 && sc1 === 2, `${sc0} -> ${sc1}`);

  // returning customer: every order button leads to Mi semana and the builder offers it first
  await page.evaluate(() => { localStorage.setItem('kx-test-orders', '1'); localStorage.setItem('kx-test-returning', '1'); sessionStorage.removeItem('kx_newplan'); sessionStorage.removeItem('kx_credits'); }); await page.goto(`${URL0}#/pg/pedido`); await page.reload(); await page.waitForTimeout(1200);
  ok('returning customer: the order builder opens with "Ya tienes un plan activo" and a button to Mi semana (the steps are hidden)', await page.evaluate((pf) => { const r = document.querySelector(pf + '[data-fn-returning]'); return !!r && !r.hidden && !!r.querySelector('a[href*="cuenta-semana"]') && getComputedStyle(document.querySelector(pf + '.funnel__panel')).display === 'none'; }, PF));
  await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(1200);
  ok('returning customer: the hero order button leads to Mi semana', await page.evaluate(() => { const a = document.querySelector('[data-page="home"] .hero [data-order-cta]'); return !!a && a.getAttribute('href') === '/pages/cuenta-semana' && /semana/i.test(a.textContent); }));
  await page.goto(`${URL0}#/pg/pedido`); await page.reload(); await page.waitForTimeout(1000);
  await page.click(`${PF}[data-fn-newplan]`); await page.waitForTimeout(300);
  ok('"I want to buy a new plan" brings the four steps back', await page.evaluate((pf) => getComputedStyle(document.querySelector(pf + '.funnel__panel')).display !== 'none' && document.querySelectorAll(pf + '[data-fn-dot]').length === 4, PF));
  await page.evaluate(() => { localStorage.setItem('kx-test-orders', '0'); localStorage.removeItem('kx-test-returning'); sessionStorage.setItem('kx_newplan', '1'); sessionStorage.removeItem('kx_credits'); localStorage.removeItem('kulinaria_funnel'); });

  // the rules fit the desktop frame (no scrolling to read them) and the tick still gates the next button
  await page.evaluate(() => { localStorage.setItem('kx-test-norules', '1'); localStorage.removeItem('kx-rules-ok'); }); await page.reload(); await page.waitForTimeout(1000);
  const rf = await page.evaluate((pf) => { const r = document.querySelector(pf + '[data-fn-rules-rail]'), f = document.querySelector(pf + '[data-funnel]'); return { vfits: r.scrollHeight <= r.clientHeight + 8, stage: f.querySelector('.funnel__stage').getBoundingClientRect().bottom <= innerHeight + 12, step: f.getAttribute('data-step'), chk: f.querySelector('[data-fn-rules-check]').disabled, btn: f.querySelector('[data-fn-rules-next]').disabled, ticked: f.querySelector('[data-fn-rules-check]').checked }; }, PF);
  ok('rules step on desktop: vertical cards in a row, nothing scrolls up and down, the tick and button are in the frame on a 650px-high screen', rf.vfits && rf.stage && rf.step === '0', JSON.stringify(rf));
  ok('rules step on desktop: the tick is locked and not ticked until the last card has been reached', rf.chk === true && rf.ticked === false && rf.btn === true, JSON.stringify(rf));
  await page.evaluate(() => { const r = document.querySelector('[data-page="pg/pedido"] [data-fn-rules-rail]'); r.scrollLeft = r.scrollWidth; }); await page.waitForTimeout(500);
  ok('rules step on desktop: reaching the last card unlocks the box, still unticked, and the button waits for the tick', await page.evaluate((pf) => { const f = document.querySelector(pf + '[data-funnel]'); const c = f.querySelector('[data-fn-rules-check]'), b = f.querySelector('[data-fn-rules-next]'); const ok1 = !c.disabled && !c.checked && b.disabled; c.click(); return ok1 && !b.disabled; }, PF));
  await page.evaluate(() => { localStorage.removeItem('kx-test-norules'); localStorage.setItem('kx-rules-ok', '1'); });
}


// =====================================================================  v51: the builder always starts on step 1; phone stepper moves freely
{
  await page.setViewportSize({ width: 390, height: 800 });
  await page.evaluate(() => { localStorage.removeItem('kx-test-norules'); sessionStorage.removeItem('kx-test-start'); localStorage.setItem('kx-test-nostart', '1'); localStorage.setItem('kx-rules-ok', '1'); localStorage.setItem('kx-test-orders', '0'); sessionStorage.setItem('kx_newplan', '1'); localStorage.removeItem('kulinaria_funnel'); });
  await page.goto(`${URL0}#/pg/pedido`); await page.reload(); await page.waitForTimeout(900);
  const PS = '[data-page="pg/pedido"] ';
  const st0 = await page.evaluate((ps) => { const f = document.querySelector(ps + '[data-funnel]'); return { step: f.getAttribute('data-step'), chk: f.querySelector('[data-fn-rules-check]').checked, unlocked: !f.querySelector('[data-fn-rules-check]').disabled, btn: f.querySelector('[data-fn-rules-next]').disabled }; }, PS);
  ok('the builder always opens on step 1 (how it works), also for someone who has read it before; the box is available but never pre-ticked', st0.step === '0' && st0.chk === false && st0.unlocked === true && st0.btn === true, JSON.stringify(st0));
  ok('phone: a row of four step pills is visible, and the later ones look locked until step 1 is complete', await page.evaluate((ps) => { const n = document.querySelector(ps + '.funnel__top .steps__nav'); const li = [...n.querySelectorAll('li')]; return getComputedStyle(n).display !== 'none' && li.length === 4 && li.every((x) => x.getBoundingClientRect().height >= 36) && li[1].classList.contains('is-locked') && li[3].classList.contains('is-locked') && !li[0].classList.contains('is-locked'); }, PS));
  await page.click(`${PS}.steps__nav li:nth-child(2)`); await page.waitForTimeout(300);
  ok('step 2 cannot be opened before step 1 is complete (a message says why)', await page.evaluate((ps) => document.querySelector(ps + '[data-funnel]').getAttribute('data-step') === '0' && /anterior|previous/i.test(document.querySelector(ps + '[data-fn-error]').textContent), PS));
  await page.evaluate((ps) => { const r = document.querySelector(ps + '[data-fn-rules-rail]'); r.scrollLeft = r.scrollWidth; }, PS); await page.waitForTimeout(500);
  await page.evaluate((ps) => { document.querySelector(ps + '[data-fn-rules-check]').click(); }, PS); await page.waitForTimeout(150);
  await page.evaluate((ps) => { document.querySelector(ps + '[data-fn-rules-next]').click(); }, PS); await page.waitForTimeout(400);
  ok('ticking "I understand" and continuing opens step 2 (the plan)', await page.evaluate((ps) => document.querySelector(ps + '[data-funnel]').getAttribute('data-step') === '1', PS));
  await page.click(`${PS}.steps__nav li:nth-child(3)`); await page.waitForTimeout(300);
  ok('step 3 (menu) stays closed until a plan has been chosen', await page.evaluate((ps) => document.querySelector(ps + '[data-funnel]').getAttribute('data-step') === '1', PS));
  await page.evaluate((ps) => document.querySelector(ps + '[data-plan-choice="block"]').click(), PS); await page.waitForTimeout(700);
  ok('choosing a plan opens step 3 (the menu)', await page.evaluate((ps) => document.querySelector(ps + '[data-funnel]').getAttribute('data-step') === '2', PS));
  await page.click(`${PS}.steps__nav li:nth-child(4)`); await page.waitForTimeout(300);
  ok('step 4 (the planner) stays closed until the menu step has been continued', await page.evaluate((ps) => document.querySelector(ps + '[data-funnel]').getAttribute('data-step') === '2', PS));
  await page.click(`${PS}[data-fn-sc-next]`); await page.waitForTimeout(500);
  ok('"Continuar al siguiente paso" opens step 4', await page.evaluate((ps) => document.querySelector(ps + '[data-funnel]').getAttribute('data-step') === '3', PS));
  await page.click(`${PS}.steps__nav li:nth-child(1)`); await page.waitForTimeout(300);
  ok('and any step already completed can be reopened freely', await page.evaluate((ps) => document.querySelector(ps + '[data-funnel]').getAttribute('data-step') === '0', PS));
  await page.click(`${PS}.steps__nav li:nth-child(4)`); await page.waitForTimeout(300);
  ok('(and the steps already reached stay open: back to step 4)', await page.evaluate((ps) => document.querySelector(ps + '[data-funnel]').getAttribute('data-step') === '3', PS));
  await page.goto(`${URL0}#/home`); await page.reload(); await page.waitForTimeout(900);
  ok('home on a phone: the welcome film is contained in a rounded frame with side margins (not edge to edge)', await page.evaluate(() => { const f = document.querySelector('[data-page="home"] .welcome-video__frame'); const r = f.getBoundingClientRect(); return r.left >= 12 && innerWidth - r.right >= 12 && parseFloat(getComputedStyle(f).borderTopLeftRadius) >= 16; }));
  ok('home on a phone: the order builder starts on step 1', await page.evaluate(() => document.querySelector('[data-page="home"] [data-funnel]').getAttribute('data-step') === '0'));
  await page.evaluate(() => { localStorage.removeItem('kx-test-nostart'); sessionStorage.setItem('kx-test-start', '1'); sessionStorage.removeItem('kx_newplan'); });
  await page.setViewportSize({ width: 1280, height: 800 });
}


await browser.close();
console.log(fail.length ? fail.length + ' failed' : 'all new checks passed');
