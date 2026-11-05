// Renders the real Liquid theme (layout + JSON templates + sections + snippets) with mock data
// and assembles a single-file, fully navigable preview: preview/index.html
//   node scripts/render/render.mjs        (or: npm run build  inside scripts/render)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Liquid } from 'liquidjs';
import { makeStore } from './mock.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const jparse = (t) => JSON.parse(t.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ''));   // Shopify's editor adds a comment header to JSON files it saves
const LOCALES = { es: jparse(read('locales/es.default.json')), en: jparse(read('locales/en.json')) };
const CONTENT_EN = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/render/content.en.json'), 'utf8'));
export const LANGS = ['es', 'en'];

// ---------------------------------------------------------------- engine
function makeEngine(state, lang) {
  const locale = LOCALES[lang];
  state.globals = {};
  const engine = new Liquid({ partials: [path.join(ROOT, 'snippets')], extname: '.liquid', jsTruthy: false, strictFilters: true, globals: state.globals });
  const kw = (args) => Object.fromEntries(args.filter(Array.isArray));
  const money = (c, trim) => {
    const v = Number(c) / 100;
    let s = v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (trim) s = s.replace(/\.00$/, '');
    return '$' + s;
  };

  engine.registerFilter('t', (k, ...a) => {
    const raw = String(k).split('.').reduce((o, p) => (o ? o[p] : undefined), locale);
    if (raw === undefined || typeof raw !== 'string') return `translation missing: ${lang}.${k}`;
    const vars = kw(a);
    return raw.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, n) => (vars[n] !== undefined ? vars[n] : m));
  });
  engine.registerFilter('hmac_sha256', () => 'preview-token');
  engine.registerFilter('upcase', (v) => String(v ?? '').toUpperCase());
  engine.registerFilter('asset_url', (f) => `assets/${f}`);
  engine.registerFilter('stylesheet_tag', (u) => `<link rel="stylesheet" href="${u}">`);
  engine.registerFilter('image_url', (img) => (img && img.src) || '');
  engine.registerFilter('image_tag', (url, ...a) => (url ? `<img src="${url}" alt="${kw(a).alt || ''}" loading="${kw(a).loading || 'lazy'}">` : ''));
  engine.registerFilter('money', (c) => money(c, false));
  engine.registerFilter('money_without_trailing_zeros', (c) => money(c, true));
  engine.registerFilter('handleize', (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  engine.registerFilter('json', (v) => JSON.stringify(v === undefined ? null : v));
  engine.registerFilter('default_errors', (e) => (Array.isArray(e) ? e.join(', ') : String(e ?? '')));
  engine.registerFilter('format_address', (a) => (a ? [`${a.first_name} ${a.last_name}`, a.address1, a.address2, `${a.zip} ${a.city}`, a.country].filter(Boolean).join('<br>') : ''));

  // {% sections 'group' %}
  engine.registerTag('sections', {
    parse(tok) { this.group = tok.args.trim().replace(/^['"]|['"]$/g, ''); },
    async render(ctx, emitter) { emitter.write(`<!--@group:${this.group}-->`); state.groups[this.group] = await state.renderGroup(this.group); },
  });
  engine.registerTag('section', {
    parse(tok) { this.name = tok.args.trim().replace(/^['"]|['"]$/g, ''); },
    async render(ctx, emitter) { emitter.write(await state.renderSection(this.name, this.name, {}, {}, null)); },
  });
  // {% form 'type', ... %} ... {% endform %}
  const ACTIONS = { contact: '/contact#kulinaria-contact', product: '/cart/add', customer_login: '/account/login', create_customer: '/account',
    recover_customer_password: '/account/recover', reset_customer_password: '/account/reset', customer_address: '/account/addresses', localization: '/localization' };
  engine.registerTag('form', {
    parse(tok, remain) {
      this.args = tok.args; this.templates = [];
      const stream = this.liquid.parser.parseStream(remain)
        .on('template', (tpl) => this.templates.push(tpl))
        .on('tag:endform', () => stream.stop())
        .on('end', () => { throw new Error('{% endform %} not found'); });
      stream.start();
    },
    * render(ctx, emitter) {
      const type = /^\s*['"]([^'"]+)['"]/.exec(this.args)[1];
      const cls = /class:\s*['"]([^'"]*)['"]/.exec(this.args);
      const id = /id:\s*['"]([^'"]*)['"]/.exec(this.args);
      if (!(type in ACTIONS)) throw new Error('unknown form type ' + type);
      const method = 'post';
      emitter.write(`<form method="${method}" action="${ACTIONS[type]}" data-shopify-form="${type}" accept-charset="UTF-8"${id ? ` id="${id[1]}"` : ''}${cls ? ` class="${cls[1]}"` : ''}>`);
      ctx.push({ form: { errors: null, posted_successfully: false } });
      yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter);
      ctx.pop();
      emitter.write('</form>');
    },
  });
  engine.registerTag('paginate', {
    parse(tok, remain) {
      this.templates = [];
      const stream = this.liquid.parser.parseStream(remain)
        .on('template', (tpl) => this.templates.push(tpl))
        .on('tag:endpaginate', () => stream.stop())
        .on('end', () => { throw new Error('{% endpaginate %} not found'); });
      stream.start();
    },
    * render(ctx, emitter) {
      ctx.push({ paginate: { pages: 1, current_page: 1, previous: null, next: null } });
      yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter);
      ctx.pop();
    },
  });
  return engine;
}

// ---------------------------------------------------------------- site renderer
// Renders the whole theme once per language. Pages of both languages live in the same file (inside inert
// <template>s); an inline script unwraps the active one before the theme JS runs, so a language switch behaves
// like Shopify's: save the choice, reload, get the other storefront.
const untranslated = new Set();

async function renderLang(lang) {
  const tr = (v) => {
    if (lang !== 'en' || typeof v !== 'string') return v;
    if (CONTENT_EN[v] !== undefined) return CONTENT_EN[v];
    if (/[A-Za-zÁ-ú]{3,}/.test(v) && !/^(https?:|\/|#|<img|\{)/.test(v) && !/^[a-z0-9\-_/.:?=&%+,#@]+$/.test(v)) untranslated.add(v);
    return v;
  };
  const store = makeStore(ROOT, lang, tr);
  let current = {};
  const parsedCache = new Map();
  const state = { groups: {} };
  const engine = makeEngine(state, lang);
  const prep = (src) => src.replace(/posted_successfully\?/g, 'posted_successfully');

  const resolveSetting = (def, val) => {
    if (val === undefined) val = def.default;
    switch (def.type) {
      case 'collection': return typeof val === 'string' ? store.collections[val] : val;
      case 'product': return typeof val === 'string' ? store.products.find((p) => p.handle === val) : val;
      case 'page': return typeof val === 'string' ? store.pages[val] : val;
      case 'link_list': return typeof val === 'string' ? store.linklists[val] : val;
      case 'image_picker': return val || null;
      case 'select': case 'url': case 'link_list_id': return val;
      default: return tr(val);
    }
  };

  state.renderSection = async (type, id, given = {}, blocksGiven = {}, order = null, group = '') => {
    if (!parsedCache.has(type)) {
      let src = read(`sections/${type}.liquid`);
      const m = src.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/);
      const schema = JSON.parse(m[1]);
      src = src.replace(m[0], '');
      parsedCache.set(type, { tpl: engine.parse(prep(src)), schema });
    }
    const { tpl, schema } = parsedCache.get(type);
    const settings = {};
    for (const d of schema.settings || []) if (d.id) settings[d.id] = resolveSetting(d, given[d.id]);
    const blockIds = order || Object.keys(blocksGiven);
    const blocks = blockIds.map((bid) => {
      const b = blocksGiven[bid];
      const bd = (schema.blocks || []).find((x) => x.type === b.type);
      if (!bd) throw new Error(`${type}: unknown block type ${b.type}`);
      const bs = {};
      for (const d of bd.settings || []) if (d.id) bs[d.id] = resolveSetting(d, (b.settings || {})[d.id]);
      return { id: bid, type: b.type, settings: bs, shopify_attributes: '' };
    });
    const section = { id, settings, blocks, block_order: blockIds, shopify_attributes: '' };
    const html = await engine.render(tpl, { ...current, section });
    return `<div id="shopify-section-${id}" class="shopify-section${group ? ' shopify-section-group-' + group : ''}">${html}</div>`;
  };

  state.renderGroup = async (name) => {
    const g = jparse(read(`sections/${name}.json`));
    let out = '';
    for (const id of g.order) out += await state.renderSection(g.sections[id].type, id, g.sections[id].settings, g.sections[id].blocks || {}, g.sections[id].block_order || null, name);
    return out;
  };

  let layoutTpl;
  const renderTemplate = async (tplName, pageGlobals) => {
    const t = jparse(read(`templates/${tplName}.json`));
    // the preview has a demo customer and no Apps Script: the admin page shows demo data for them (the real store's values stay in the template)
    if (tplName === 'page.admin') for (const k of Object.keys(t.sections)) Object.assign(t.sections[k].settings || {}, { admin_emails: 'ramon@ejemplo.com', admin_endpoint: '' });
    current = { ...store.globals, ...pageGlobals };
    for (const k of Object.keys(state.globals)) delete state.globals[k];
    Object.assign(state.globals, current);   // Shopify exposes these inside snippets too
    let inner = '';
    for (const id of t.order) {
      const s = t.sections[id];
      inner += await state.renderSection(s.type, id, s.settings || {}, s.blocks || {}, s.block_order || null);
    }
    current.content_for_layout = inner;
    layoutTpl ||= engine.parse(prep(read('layout/theme.liquid')));
    return engine.render(layoutTpl, current);
  };

  const P = (key, url, tpl, title, g = {}) => ({ key, url, tpl, title: tr(title), g });
  const T_ = (k) => tr(k);
  const routes = [
    P('home', '/', 'index', 'Home', { template: { name: 'index' }, page_title: 'Kulinaria MX' }),
    P('menu', '/collections/menu-semanal', 'collection', 'Especiales de la semana', { template: { name: 'collection' }, collection: store.collections['menu-semanal'], page_title: T_('Especiales de la semana') }),
    P('tienda', '/collections/kulinaria-store', 'collection.store', 'Kulinaria Store', { template: { name: 'collection', suffix: 'store' }, collection: store.collections['kulinaria-store'], page_title: 'Kulinaria Store' }),
    ...store.products.map((p) => ({ key: 'p/' + p.handle, url: p.url, tpl: 'product', title: p.title, g: { template: { name: 'product' }, product: p, page_title: p.title } })),
    ...[...JSON.parse(read('scripts/render/pages.json')).map(([h, tpl]) => [h, tpl]), ['perfil', 'page.profile'], ['bienvenida', 'page.bienvenida']].map(([h, tpl]) =>
      ({ key: 'pg/' + h, url: '/pages/' + h, tpl, title: store.pages[h].title, g: { template: { name: 'page' }, page: store.pages[h], page_title: store.pages[h].title } })),
    P('carrito', '/cart', 'cart', 'Mi selección', { template: { name: 'cart' }, page_title: T_('Mi selección') }),
    P('cuenta', '/account', 'customers/account', 'Mi cuenta', { template: { name: 'customers/account' }, page_title: T_('Mi cuenta') }),
    P('login', '/account/login', 'customers/login', 'Iniciar sesión', { template: { name: 'customers/login' }, customer: null, page_title: T_('Iniciar sesión') }),
    P('registro', '/account/register', 'customers/register', 'Crear cuenta', { template: { name: 'customers/register' }, customer: null, page_title: T_('Crear cuenta') }),
    P('direcciones', '/account/addresses', 'customers/addresses', 'Mis direcciones', { template: { name: 'customers/addresses' }, page_title: T_('Mis direcciones') }),
    P('pedido', '/account/orders/1001', 'customers/order', 'Pedido #1001', { template: { name: 'customers/order' }, order: store.order, page_title: T_('Pedido #1001') }),
    P('reset', '/account/reset', 'customers/reset_password', 'Restablecer contraseña', { template: { name: 'customers/reset_password' }, customer: null, page_title: T_('Restablecer contraseña') }),
    P('buscar', '/search', 'search', 'Buscar', { template: { name: 'search' }, page_title: T_('Buscar') }),
    P('404', '/404', '404', 'Página no encontrada', { template: { name: '404' }, page_title: T_('Página no encontrada') }),
  ];
  for (const r of routes) {
    r.g.canonical_url = r.url;
    r.g.request = { locale: { iso_code: lang }, path: r.url };
    r.html = await renderTemplate(r.tpl, r.g);
  }
  return { routes, store, groups: state.groups };
}

export async function renderSite() {
  const per = {};
  for (const lang of LANGS) per[lang] = await renderLang(lang);
  const routes = per.es.routes;

  // ---- link rewriting (Shopify URLs -> SPA hash routes)
  const urlMap = Object.fromEntries(routes.map((r) => [r.url, '#/' + r.key]));
  Object.assign(urlMap, { '/account/logout': '#/home', '/collections': '#/menu', '/localization': '#/home', '/collections/regalos-de-bienvenida': '#/tienda' });
  const dead = [];
  const mapUrl = (v, from) => {
    if (/^(#|https?:|tel:|mailto:|javascript:|data:|assets\/)/.test(v) || v === '') return v;
    const [pathAndQuery] = v.split('#');
    const [p, q] = pathAndQuery.split('?');
    if (p.startsWith('/cart/change')) return '#/carrito';
    if (urlMap[p]) return urlMap[p] + (q ? '?' + q : '');
    dead.push({ from, href: v });
    return '#/404';
  };
  const rewrite = (html, from) => html.replace(/\bhref="([^"]*)"/g, (m, v) => `href="${mapUrl(v, from)}"`);

  const MAIN_RE = /<main id="main" tabindex="-1">([\s\S]*?)<\/main>/;
  const prefixIds = (html, key) => {
    const px = key.replace(/[^a-z0-9]+/gi, '-') + '--';
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    let out = html;
    for (const id of ids) {
      const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(`(\\sid|\\sfor|\\slist|\\saria-controls)="${esc}"`, 'g'), `$1="${px}${id}"`)
        .replace(new RegExp(`href="#${esc}"`, 'g'), `href="#${px}${id}"`);
    }
    return out;
  };

  // ---- page index (reachable at #/indice, no banner needed)
  const indexHtml = (lang) => {
    const items = per[lang].routes.filter((r) => r.key !== 'pg/admin' && (!r.key.startsWith('p/') || r.key === 'p/salmon-costra-almendras'))
      .map((r) => `<li><a href="${r.url}">${r.key.startsWith('p/') ? (lang === 'en' ? 'Dish page' : 'Ficha de platillo') : r.title}</a></li>`).join('');
    return `<section class="section"><div class="container"><div class="section__head"><span class="eyebrow">${lang === 'en' ? 'All pages' : 'Todas las páginas'}</span><h1>${lang === 'en' ? 'Page index' : 'Índice de páginas'}</h1></div><ul class="menu-overlay__more" style="list-style:none">${items}</ul></div></section>`;
  };

  const pagesFor = (lang) => per[lang].routes.map((r) => {
    const inner = r.html.match(MAIN_RE)[1];
    return `<div data-page="${r.key}" data-template="${String(r.tpl || 'page').split('.')[0].replace(/[^a-z0-9]+/gi, '-').toLowerCase()}" data-title="${r.title.replace(/"/g, '&quot;')}" hidden>${prefixIds(rewrite(inner, r.key + ' ' + lang), r.key)}</div>`;
  }).join('\n') + `\n<div data-page="indice" data-title="${lang === 'en' ? 'Page index' : 'Índice de páginas'}" hidden>${rewrite(indexHtml(lang), 'index')}</div>`;

  let doc = per.es.routes.find((r) => r.key === 'home').html;
  doc = doc.replace(MAIN_RE, () => `<main id="main" tabindex="-1">${LANGS.map((l) => `<template data-l="${l}">${pagesFor(l)}</template>`).join('\n')}</main>`);
  for (const g of ['header-group', 'footer-group']) {
    doc = doc.replace(`<!--@group:${g}-->`, () => LANGS.map((l) => `<template data-l="${l}">${rewrite(per[l].groups[g], 'shell ' + l)}</template>`).join(''));
  }

  // ---- i18n tables for the theme JS (read back from each language's rendered layout)
  const I18N = {};
  for (const l of LANGS) {
    const html = per[l].routes.find((r) => r.key === 'home').html;
    const m = html.match(/window\.KULINARIA = (\{[\s\S]*?\n      \});/);
    I18N[l] = new Function('return ' + m[1])().i18n;
  }

  // ---- inline css / js
  const css = read('assets/kulinaria.css');
  const js = read('assets/kulinaria.js');
  doc = doc.replace(/<link rel="stylesheet" href="assets\/kulinaria\.css">/, () => `<style>${css}\n${PREVIEW_CSS}</style>`);

  // ---- media: referenced assets are embedded once and served from memory
  doc = doc.replace(/<style>:root\{--img-wood:url\("assets\/photo-wood\.webp"\)\}<\/style>/, '<style>:root{--img-wood:none}</style>');
  const names = [...new Set([...doc.matchAll(/assets\/([\w.-]+\.(?:png|webp|mp4|jpg))/g)].map((m) => m[1]))].filter((n) => n !== 'favicon.png' || true);
  const table = {};
  for (const n of names) table[n] = fs.readFileSync(path.join(ROOT, 'assets', n)).toString('base64');
  const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  doc = doc.replace(/<img([^>]*?)src="assets\/([^"]+)"/g, (m, pre, f) => `<img${pre}src="${PIXEL}" data-asset="${f}"`);
  doc = doc.replace(/<source([^>]*?)srcset="assets\/([^"]+)"/g, (m, pre, f) => `<source${pre}data-srcset="assets/${f}"`);
  doc = doc.replace(/\sposter="assets\/([^"]+)"/g, (m, f) => ` data-poster="assets/${f}"`);
  doc = doc.replace(/<link rel="icon" type="image\/png" href="assets\/favicon\.png">/, () => `<link rel="icon" type="image/png" href="data:image/png;base64,${table['favicon.png']}">`);
  const boot = `<script type="application/json" id="kx-assets">${JSON.stringify(table)}</script><script>${PREVIEW_JS.replace('__I18N__', () => JSON.stringify(I18N))}</script>`;
  const adminCss = read('assets/kulinaria-admin.css'), adminJs = read('assets/kulinaria-admin.js'), recipesJs = read('assets/kx-recipes.js');
  doc = doc.replace('</head>', () => `<style>${adminCss}</style></head>`);
  doc = doc.replace(/<script src="assets\/kulinaria\.js"[^>]*><\/script>/, () => `${boot}<script>${recipesJs}</script><script>${adminJs}</script><script>${js}</script>`);
  return { doc, routes, dead, store: per.es.store, untranslated: [...untranslated], per };
}

const PREVIEW_CSS = `
[data-page]:not([hidden]){animation:pageIn .9s var(--ease) both}
@keyframes pageIn{from{opacity:0;translate:0 16px}}
.preview-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:var(--bg-raised);border:1px solid var(--gold-500);color:var(--text);padding:14px 22px;border-radius:8px;box-shadow:var(--shadow-card);z-index:500;max-width:90vw;font-family:var(--font-label);font-size:1rem}
`;

const MSG = {
  es: { saved: 'Dirección guardada (demo).', thanks: 'Gracias. Te contactaremos muy pronto.', reset: 'Te enviamos un correo para restablecer tu contraseña (demo).', checkout: 'En la tienda real aquí continúa el checkout seguro de Shopify.', sent: 'Acción enviada (demo).', gift: 'Regalo agregado al carrito (demo).', suffix: 'Kulinaria MX' },
  en: { saved: 'Address saved (demo).', thanks: "Thank you. We'll be in touch very soon.", reset: "We've emailed you a link to reset your password (demo).", checkout: "In the live store, Shopify's secure checkout continues here.", sent: 'Action sent (demo).', gift: 'Gift added to cart (demo).', suffix: 'Kulinaria MX' },
};

const PREVIEW_JS = `
(function () {
  var I18N = __I18N__, MSG = ${JSON.stringify(MSG)};
  var A = JSON.parse(document.getElementById('kx-assets').textContent), cache = {};
  var mime = function (n) { return /\\.mp4$/.test(n) ? 'video/mp4' : /\\.webp$/.test(n) ? 'image/webp' : /\\.jpg$/.test(n) ? 'image/jpeg' : 'image/png'; };
  function blob(name) {
    if (cache[name]) return cache[name];
    var b = atob(A[name]), u = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return (cache[name] = URL.createObjectURL(new Blob([u], { type: mime(name) })));
  }
  function resolve(u) { var n = String(u).replace(/^.*assets\\//, '').split('?')[0]; if (!A[n]) return u; return /\\.mp4$/.test(n) ? blob(n) : 'data:' + mime(n) + ';base64,' + A[n]; }

  // active language: unwrap its <template>s (same effect as Shopify serving /en/)
  var lang = 'es'; try { lang = localStorage.getItem('kx-lang') || 'es'; } catch (e) {}
  if (!I18N[lang]) lang = 'es';
  document.documentElement.lang = lang;
  [].forEach.call(document.querySelectorAll('template[data-l]'), function (t) {
    if (t.getAttribute('data-l') === lang) t.parentNode.insertBefore(t.content, t);
    t.remove();
  });
  var K = window.KULINARIA = window.KULINARIA || {};
  K.i18n = I18N[lang]; K.lang = lang; K.resolve = resolve;
  document.documentElement.style.setProperty('--img-wood', 'url("' + resolve('assets/photo-wood.webp') + '")');
  [].forEach.call(document.querySelectorAll('img[data-asset]'), function (i) { i.src = resolve('assets/' + i.getAttribute('data-asset')); });
  [].forEach.call(document.querySelectorAll('[data-srcset]'), function (e) { e.srcset = resolve(e.getAttribute('data-srcset')); });
  [].forEach.call(document.querySelectorAll('[data-poster]'), function (v) { v.poster = resolve(v.getAttribute('data-poster')); });

  var M = MSG[lang], pages = [].slice.call(document.querySelectorAll('[data-page]'));
  function toast(msg) {
    var t = document.createElement('div'); t.className = 'preview-toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 3800);
  }
  function route() {
    var h = location.hash;
    if (h && h.indexOf('#/') !== 0) return;              // in-page anchors
    var key = (h ? h.slice(2) : 'home').split('?')[0] || 'home';
    var found = false;
    pages.forEach(function (p) { var on = p.getAttribute('data-page') === key; p.hidden = !on; if (on) { found = true; document.body.className = document.body.className.replace(/template-\\S+/, 'template-' + (p.getAttribute('data-template') || 'page')); document.title = p.getAttribute('data-title') + ' | ' + M.suffix; } });
    if (!found) { pages.forEach(function (p) { p.hidden = p.getAttribute('data-page') !== '404'; }); }
    [].forEach.call(document.querySelectorAll('.site-nav a'), function (a) {
      if (a.getAttribute('href').split('?')[0] === '#/' + key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  window.addEventListener('hashchange', route); route();

  // The real store posts these forms to Shopify; the preview simulates the outcome.
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.hasAttribute('data-profile-form')) return;       // handled by the theme's own JS
    e.preventDefault();
    var type = f.getAttribute('data-shopify-form') || '', a = f.getAttribute('action') || '';
    if (type === 'localization') {
      var c = (e.submitter && e.submitter.value) || '';
      if (c && c !== lang) { try { localStorage.setItem('kx-lang', c); } catch (x) {} location.reload(); }
      return;
    }
    if (type === 'product') location.hash = '#/carrito';
    else if (type === 'customer_login' || type === 'create_customer') location.hash = '#/cuenta';
    else if (type === 'customer_address') { toast(M.saved); location.hash = '#/direcciones'; }
    else if (type === 'contact') { var ok = document.createElement('p'); ok.className = 'alert alert--ok'; ok.setAttribute('role', 'status'); ok.textContent = M.thanks; f.insertBefore(ok, f.firstChild); }
    else if (type === 'recover_customer_password' || type === 'reset_customer_password') toast(M.reset);
    else if (a.indexOf('/search') === 0 || f.getAttribute('role') === 'search') location.hash = '#/buscar';
    else if (f.hasAttribute('data-cart-form')) toast(M.checkout);
    else toast(M.sent);
  }, true);

  var origFetch = window.fetch;
  window.fetch = function (u, o) {
    if (typeof u === 'string' && u.indexOf('/cart/') === 0) return Promise.resolve(new Response('{}', { status: 200 }));
    return origFetch ? origFetch.apply(this, arguments) : Promise.reject(new Error('no fetch'));
  };
  document.addEventListener('kulinaria:cart-updated', function (e) { e.preventDefault(); toast(M.gift); });
})();
`;

// ---------------------------------------------------------------- CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { doc, routes, dead, untranslated } = await renderSite();
  const out = path.join(ROOT, 'preview', 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, doc);
  console.log(`rendered ${routes.length} pages x 2 languages -> preview/index.html (${Math.round(doc.length / 1024)} KB)`);
  if (process.env.SHOW_UNTRANSLATED) console.log(JSON.stringify(untranslated, null, 1));
  else if (untranslated.length) console.log(`note: ${untranslated.length} content strings have no English entry in scripts/render/content.en.json (SHOW_UNTRANSLATED=1 to list)`);
  if (dead.length) { console.error('DEAD LINKS:', JSON.stringify(dead, null, 1)); process.exit(1); }
}
