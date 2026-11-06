// Language audit: opens EVERY page of the preview in Spanish and in English and lists any visible line that looks like the other language.
//   NODE_PATH=$(npm root -g) node lang-audit.mjs [outDir]      (exit code 1 when something is found)
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const URL0 = 'file://' + path.join(ROOT, 'preview/index.html');
const ES = new Set('de la el los las del para con tu tus una por que en se su sus al es más como cuando donde pero también sin sobre entre hasta desde cada tienes eres puedes elige elegir hola gracias'.split(' '));
const EN = new Set('the and your you with for to of is are our will can from on at by or an as be this that choose please thanks welcome'.split(' '));
// words that are valid in both languages or are names (brand, tiers, dish names kept in the original language, units)
const ALLOW = new Set(['kulinaria', 'mx', 'selecto', 'exclusivo', 'signature', 'reserve', 'keto', 'bowl', 'junior', 'wifi', 'whatsapp', 'instagram', 'a', 'o', 'y', 'e', 'u', 'no', 'ok', 'plan', 'menu', 'chef', 'tu']);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const results = { es: {}, en: {} };
let total = 0;
for (const lang of ['es', 'en']) {
  await page.goto(URL0 + '#/home'); await page.evaluate((l) => { localStorage.clear(); sessionStorage.setItem('kx_ob_asked', '1'); localStorage.setItem('kx-lang', l); localStorage.setItem('kx-test-orders', '0'); }, lang);
  await page.reload(); await page.waitForTimeout(3800);
  const keys = await page.evaluate(() => [...document.querySelectorAll('[data-page]')].map((p) => p.getAttribute('data-page')));
  for (const key of keys) {
    await page.evaluate((k) => { location.hash = '#/' + k; }, key); await page.waitForTimeout(120);
    const lines = await page.evaluate((k) => {
      const root = document.querySelector(`[data-page="${k}"]`); const out = new Set();
      const grab = (el) => { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const t = n.textContent.replace(/\s+/g, ' ').trim(); const p = n.parentElement; if (t.length > 2 && p && !['SCRIPT', 'STYLE'].includes(p.tagName) && !p.closest('[data-admin-hub],.admin-hub') && !/^arte del fuego$/i.test(t)) out.add(t); } };
      grab(root); ['.site-header', '.site-footer', '#menu-overlay', '.sheet'].forEach((s) => document.querySelectorAll(s).forEach(grab));
      document.querySelectorAll(`[data-page="${k}"] [placeholder], [data-page="${k}"] [aria-label], [data-page="${k}"] img[alt]`).forEach((e) => { ['placeholder', 'aria-label', 'alt'].forEach((a) => { const v = e.getAttribute(a); if (v && v.trim().length > 2) out.add(v.trim()); }); });
      return [...out];
    }, key);
    const bad = [];
    for (const l of lines) {
      const words = l.toLowerCase().replace(/[^a-záéíóúüñ\s]/g, ' ').split(/\s+/).filter(Boolean);
      const other = lang === 'es' ? EN : ES; const own = lang === 'es' ? ES : EN;
      const hit = words.filter((w) => other.has(w) && !ALLOW.has(w) && !own.has(w));
      if (hit.length >= (words.length > 3 ? 1 : 1) && words.length >= 2 && hit.length / words.length >= 0.2) bad.push(l);
    }
    if (bad.length) { results[lang][key] = bad; total += bad.length; }
  }
}
await browser.close();
for (const lang of ['es', 'en']) {
  const keys = Object.keys(results[lang]);
  console.log(`\n${lang.toUpperCase()}: ${keys.length} page(s) with lines that look like the other language`);
  for (const k of keys) { console.log(`  ${k}`); results[lang][k].slice(0, 6).forEach((l) => console.log(`     · ${l.slice(0, 150)}`)); }
}
console.log(total ? `\n${total} suspicious line(s)` : '\nEvery page is in one language, in both languages.');
process.exit(total ? 1 : 0);
