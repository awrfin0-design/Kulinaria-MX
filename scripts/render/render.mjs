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
const locale = JSON.parse(read('locales/es.default.json'));

// ---------------------------------------------------------------- engine
function makeEngine(state) {
  const engine = new Liquid({ partials: [path.join(ROOT, 'snippets')], extname: '.liquid', jsTruthy: false, strictFilters: true });
  const kw = (args) => Object.fromEntries(args.filter(Array.isArray));
  const money = (c, trim) => {
    const v = Number(c) / 100;
    let s = v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (trim) s = s.replace(/\.00$/, '');
    return '$' + s;
  };

  engine.registerFilter('t', (k) => String(k).split('.').reduce((o, p) => (o ? o[p] : undefined), locale) ?? `[missing ${k}]`);
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
    async render(ctx, emitter) { emitter.write(await state.renderGroup(this.group)); },
  });
  engine.registerTag('section', {
    parse(tok) { this.name = tok.args.trim().replace(/^['"]|['"]$/g, ''); },
    async render(ctx, emitter) { emitter.write(await state.renderSection(this.name, this.name, {}, {}, null)); },
  });
  // {% form 'type', ... %} ... {% endform %}
  const ACTIONS = { contact: '/contact#kulinaria-contact', product: '/cart/add', customer_login: '/account/login', create_customer: '/account',
    recover_customer_password: '/account/recover', reset_customer_password: '/account/reset', customer_address: '/account/addresses' };
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
export async function renderSite() {
  const store = makeStore(ROOT);
  let current = {};
  const parsedCache = new Map();
  const state = {};
  const engine = makeEngine(state);
  const prep = (src) => src.replace(/posted_successfully\?/g, 'posted_successfully');

  const resolveSetting = (def, val) => {
    if (val === undefined) val = def.default;
    switch (def.type) {
      case 'collection': return typeof val === 'string' ? store.collections[val] : val;
      case 'product': return typeof val === 'string' ? store.products.find((p) => p.handle === val) : val;
      case 'page': return typeof val === 'string' ? store.pages[val] : val;
      case 'link_list': return typeof val === 'string' ? store.linklists[val] : val;
      case 'image_picker': return val || null;
      default: return val;
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
    const g = JSON.parse(read(`sections/${name}.json`));
    let out = '';
    for (const id of g.order) out += await state.renderSection(g.sections[id].type, id, g.sections[id].settings, g.sections[id].blocks || {}, g.sections[id].block_order || null, name);
    return out;
  };

  let layoutTpl;
  const renderTemplate = async (tplName, pageGlobals) => {
    const t = JSON.parse(read(`templates/${tplName}.json`));
    current = { ...store.globals, ...pageGlobals };
    let inner = '';
    for (const id of t.order) {
      const s = t.sections[id];
      inner += await state.renderSection(s.type, id, s.settings || {}, s.blocks || {}, s.block_order || null);
    }
    current.content_for_layout = inner;
    layoutTpl ||= engine.parse(prep(read('layout/theme.liquid')));
    return engine.render(layoutTpl, current);
  };

  // ---- route table
  const P = (key, url, tpl, title, g = {}) => ({ key, url, tpl, title, g });
  const routes = [
    P('home', '/', 'index', 'Home', { template: { name: 'index' }, page_title: 'Kulinaria MX' }),
    P('menu', '/collections/menu-semanal', 'collection', 'Menú semanal', { template: { name: 'collection' }, collection: store.collections['menu-semanal'], page_title: 'Menú semanal' }),
    P('tienda', '/collections/kulinaria-store', 'collection.store', 'Kulinaria Store', { template: { name: 'collection', suffix: 'store' }, collection: store.collections['kulinaria-store'], page_title: 'Kulinaria Store' }),
    ...store.products.map((p) => P('p/' + p.handle, p.url, 'product', p.title, { template: { name: 'product' }, product: p, page_title: p.title })),
    ...[['planes', 'page.plans'], ['nosotros', 'page.about'], ['filosofia', 'page.philosophy'], ['embajadores', 'page.ambassadors'],
      ['carta-kulinaria', 'page.carta'], ['ayuda', 'page.help'], ['perfil', 'page.profile']].map(([h, tpl]) =>
      P('pg/' + h, '/pages/' + h, tpl, store.pages[h].title, { template: { name: 'page' }, page: store.pages[h], page_title: store.pages[h].title })),
    P('carrito', '/cart', 'cart', 'Mi selección', { template: { name: 'cart' }, page_title: 'Mi selección' }),
    P('cuenta', '/account', 'customers/account', 'Mi cuenta', { template: { name: 'customers/account' }, page_title: 'Mi cuenta' }),
    P('login', '/account/login', 'customers/login', 'Iniciar sesión', { template: { name: 'customers/login' }, customer: null, page_title: 'Iniciar sesión' }),
    P('registro', '/account/register', 'customers/register', 'Crear cuenta', { template: { name: 'customers/register' }, customer: null, page_title: 'Crear cuenta' }),
    P('direcciones', '/account/addresses', 'customers/addresses', 'Mis direcciones', { template: { name: 'customers/addresses' }, page_title: 'Mis direcciones' }),
    P('pedido', '/account/orders/1001', 'customers/order', 'Pedido #1001', { template: { name: 'customers/order' }, order: store.order, page_title: 'Pedido #1001' }),
    P('reset', '/account/reset', 'customers/reset_password', 'Restablecer contraseña', { template: { name: 'customers/reset_password' }, customer: null, page_title: 'Restablecer contraseña' }),
    P('buscar', '/search', 'search', 'Buscar', { template: { name: 'search' }, page_title: 'Buscar' }),
    P('404', '/404', '404', 'Página no encontrada', { template: { name: '404' }, page_title: 'Página no encontrada' }),
  ];
  for (const r of routes) {
    r.g.canonical_url = r.url;
    r.html = await renderTemplate(r.tpl, r.g);
  }

  // ---- link rewriting (Shopify URLs -> SPA hash routes)
  const urlMap = Object.fromEntries(routes.map((r) => [r.url, '#/' + r.key]));
  Object.assign(urlMap, { '/account/logout': '#/home', '/collections': '#/menu' });
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

  // ---- split shell / main of the home render
  const home = routes.find((r) => r.key === 'home').html;
  const MAIN_RE = /<main id="main" tabindex="-1">([\s\S]*?)<\/main>/;
  const shellBefore = home.slice(0, home.indexOf('<main id="main"'));
  const shellAfter = home.slice(home.indexOf('</main>') + '</main>'.length);

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

  const pagesHtml = routes.map((r) => {
    const inner = r.html.match(MAIN_RE)[1];
    return `<div data-page="${r.key}" data-title="${r.title.replace(/"/g, '&quot;')}" hidden>${prefixIds(rewrite(inner, r.key), r.key)}</div>`;
  }).join('\n');

  const css = read('assets/kulinaria.css');
  const js = read('assets/kulinaria.js');
  let before = rewrite(shellBefore, 'shell').replace(/<link rel="stylesheet" href="assets\/kulinaria\.css">/, () => `<style>${css}\n${PREVIEW_CSS}</style>`);
  let after = rewrite(shellAfter, 'shell').replace(/<script src="assets\/kulinaria\.js"[^>]*><\/script>/, () => `<script>${js}</script>`);
  const barLinks = routes.filter((r) => !r.key.startsWith('p/') || r.key === 'p/salmon-costra-almendras')
    .map((r) => `<a href="#/${r.key}">${r.key.startsWith('p/') ? 'Ficha de platillo' : r.title}</a>`).join('');
  const bar = `<details class="preview-bar"><summary><strong>VISTA PREVIA</strong> · generada desde las plantillas Liquid del tema con datos de ejemplo · <u>ver todas las páginas</u></summary><div class="preview-bar__links">${barLinks}</div></details>`;
  before = before.replace(/<body([^>]*)>/, (m, attrs) => `<body${attrs}>${bar}`);
  after = after.replace('</body>', () => `<script>${PREVIEW_JS}</script></body>`);
  let doc = `${before}<main id="main" tabindex="-1">\n${pagesHtml}\n</main>${after}`;
  const ASSET_FILES = ['logo.png', 'logo-cream.png', 'logo-black.png', 'logo-mark.png', 'favicon.png'];
  const table = Object.fromEntries(ASSET_FILES.map((f) => [f, 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'assets', f)).toString('base64')]));
  const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  doc = doc.replace(/<img([^>]*?)src="assets\/([^"]+\.png)"/g, (m, pre, f) => `<img${pre}src="${PIXEL}" data-asset="${f}"`);
  doc = doc.replace(/<link rel="icon" type="image\/png" href="assets\/favicon\.png">/, () => `<link rel="icon" type="image/png" href="${table['favicon.png']}">`);
  doc = doc.replace('</body>', () => `<script>(function(){var A=${JSON.stringify({ 'logo.png': table['logo.png'], 'logo-cream.png': table['logo-cream.png'], 'logo-black.png': table['logo-black.png'], 'logo-mark.png': table['logo-mark.png'] })};[].forEach.call(document.querySelectorAll('img[data-asset]'),function(i){i.src=A[i.getAttribute('data-asset')]||i.src;});})();</script></body>`);

  return { doc, routes, dead, store };
}

const PREVIEW_CSS = `
.preview-bar{background:#050505;border-bottom:1px solid var(--border);padding:8px 16px;font-family:var(--font-label);font-size:.85rem;color:var(--text-muted);text-align:center}
.preview-bar summary{cursor:pointer;list-style:none}
.preview-bar summary::-webkit-details-marker{display:none}
.preview-bar strong{color:var(--gold-300);letter-spacing:.16em}
.preview-bar__links{display:flex;gap:8px 16px;flex-wrap:wrap;justify-content:center;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)}
.preview-bar a{color:var(--gold-300);text-decoration:underline;text-underline-offset:3px}
.preview-bar a{color:var(--gold-300)}
[data-page]:not([hidden]){animation:pageIn .9s var(--ease) both}
@keyframes pageIn{from{opacity:0;translate:0 16px}}
.preview-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:var(--bg-raised);border:1px solid var(--gold-500);color:var(--text);padding:14px 22px;border-radius:8px;box-shadow:var(--shadow-card);z-index:200;max-width:90vw;font-family:var(--font-label);font-size:1rem}
`;

const PREVIEW_JS = `
(function () {
  var pages = [].slice.call(document.querySelectorAll('[data-page]'));
  var nav = document.querySelector('[data-nav]');
  function toast(msg) {
    var t = document.createElement('div'); t.className = 'preview-toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 3800);
  }
  function route() {
    var h = location.hash;
    if (h && h.indexOf('#/') !== 0) return;              // in-page anchors
    var key = (h ? h.slice(2) : 'home').split('?')[0] || 'home';
    var found = false;
    pages.forEach(function (p) { var on = p.getAttribute('data-page') === key; p.hidden = !on; if (on) { found = true; document.title = p.getAttribute('data-title') + ' | Kulinaria MX'; } });
    if (!found) { pages.forEach(function (p) { p.hidden = p.getAttribute('data-page') !== '404'; }); }
    [].forEach.call(document.querySelectorAll('.site-nav a'), function (a) {
      if (a.getAttribute('href').split('?')[0] === '#/' + key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (nav) nav.classList.remove('is-open');
    var pb = document.querySelector('.preview-bar'); if (pb) pb.open = false;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  window.addEventListener('hashchange', route); route();

  // The real store posts these forms to Shopify; the preview simulates the outcome.
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.hasAttribute('data-profile-form')) return;       // handled by the theme's own JS
    e.preventDefault();
    var type = f.getAttribute('data-shopify-form') || '', a = f.getAttribute('action') || '';
    if (type === 'product') location.hash = '#/carrito';
    else if (type === 'customer_login' || type === 'create_customer') location.hash = '#/cuenta';
    else if (type === 'customer_address') { toast('Dirección guardada (demo).'); location.hash = '#/direcciones'; }
    else if (type === 'contact') { var ok = document.createElement('p'); ok.className = 'alert alert--ok'; ok.setAttribute('role', 'status'); ok.textContent = 'Gracias. Te contactaremos muy pronto.'; f.insertBefore(ok, f.firstChild); }
    else if (type === 'recover_customer_password' || type === 'reset_customer_password') toast('Te enviamos un correo para restablecer tu contraseña (demo).');
    else if (a.indexOf('/search') === 0 || f.getAttribute('role') === 'search') location.hash = '#/buscar';
    else if (f.hasAttribute('data-cart-form')) toast('En la tienda real aquí continúa el checkout seguro de Shopify.');
    else toast('Acción enviada (demo).');
  }, true);

  var origFetch = window.fetch;
  window.fetch = function (u, o) {
    if (typeof u === 'string' && u.indexOf('/cart/') === 0) return Promise.resolve(new Response('{}', { status: 200 }));
    return origFetch ? origFetch.apply(this, arguments) : Promise.reject(new Error('no fetch'));
  };
  document.addEventListener('kulinaria:cart-updated', function (e) { e.preventDefault(); toast('Regalo agregado al carrito (demo).'); });
})();
`;

// ---------------------------------------------------------------- CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { doc, routes, dead } = await renderSite();
  const out = path.join(ROOT, 'preview', 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, doc);
  console.log(`rendered ${routes.length} pages -> preview/index.html (${Math.round(doc.length / 1024)} KB)`);
  if (dead.length) { console.error('DEAD LINKS:', JSON.stringify(dead, null, 1)); process.exit(1); }
}
