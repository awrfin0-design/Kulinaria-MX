/* Kulinaria MX — admin hub (orders tally + shopping list). Only loaded on /pages/admin.
   Two parts: (1) pure calculation functions (KXAdmin.*, tested in node), (2) the screen (mounted on [data-admin-hub]).
   Data comes from the Google Apps Script endpoint (backend/google-sheets/Code.gs) or, until it is connected, demo data. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KXAdmin = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var CAT_ORDER = ['prot', 'fish', 'veg', 'dairy', 'pantry'];
  var CAT_NAME = {
    es: { prot: 'Carnes y aves', fish: 'Pescados y mariscos', veg: 'Verduras y frutas', dairy: 'Lácteos y huevo', pantry: 'Despensa y especias' },
    en: { prot: 'Meat & poultry', fish: 'Fish & seafood', veg: 'Vegetables & fruit', dairy: 'Dairy & eggs', pantry: 'Pantry & spices' }
  };

  /* ------------------------------------------------------------------ dates */
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var ymd = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var parseYmd = function (s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  var addDays = function (d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); };
  var mondayOf = function (d) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -((x.getDay() + 6) % 7)); };

  /* Orders close on Saturday at the cut-off hour. First delivery = the Monday after that Saturday. */
  function firstDeliveryMonday(iso, cutoffHour) {
    var d = new Date(iso), h = cutoffHour == null ? 10 : cutoffHour;
    var s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, 0, 0, 0);
    while (s.getDay() !== 6 || s.getTime() < d.getTime()) s = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1, h, 0, 0, 0);
    return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 2);
  }
  var weeksOf = function (order) { return order.plan === 'block' ? 4 : 1; };
  function deliveryWeeks(order, cutoffHour) {
    var first = firstDeliveryMonday(order.date, cutoffHour), out = [];
    for (var i = 0; i < weeksOf(order); i++) out.push(ymd(addDays(first, 7 * i)));
    return out;
  }
  /** items cooked for one delivery week of an order: the client's own choice for that week, else the last choice repeated
   *  (the contract's automatic Saturday selection); week 1 = the items that came with the order */
  function itemsOf(o, w) { return (o.byWeek && o.byWeek[w]) || o.items || []; }
  function attachWeeklies(orders, selections, cutoff) {
    var by = {};
    (selections || []).forEach(function (s) { by[String(s.email || '').toLowerCase() + '|' + s.week] = s.items || []; });
    orders.forEach(function (o) {
      if (o.byWeek) return;                     // the Sheet already resolved every week (skips, automatic repeats, credits)
      var cur = o.items || [], map = {}, e = String(o.email || '').toLowerCase();
      deliveryWeeks(o, cutoff).forEach(function (w, i) { if (i > 0 && by[e + '|' + w]) cur = by[e + '|' + w]; map[w] = cur; });
      o.byWeek = map;
    });
    return orders;
  }
  function weeksInMonth(year, month) {              // Mondays that fall inside the month
    var out = [], d = mondayOf(new Date(year, month, 1));
    if (d.getMonth() !== month) d = addDays(d, 7);
    for (; d.getMonth() === month; d = addDays(d, 7)) out.push(ymd(d));
    return out;
  }

  /* ------------------------------------------------------------------ recipes */
  var norm = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); };

  /** accepts {dishes:{handle:{title,ing:[[name,qty,unit,cat,waste]]}}} (bundled) or a flat row list [{dish,name,qty,unit,cat,waste}] (Google Sheet) */
  function normalizeRecipes(input) {
    var map = {};
    var add = function (title, ing) { map[norm(title)] = map[norm(title)] || { title: title, ing: [] }; map[norm(title)].ing.push(ing); };
    if (input && input.dishes) {
      Object.keys(input.dishes).forEach(function (h) {
        var d = input.dishes[h];
        d.ing.forEach(function (r) { add(d.title, { name: r[0], qty: +r[1] || 0, unit: r[2] || 'g', cat: r[3] || 'pantry', waste: +r[4] || 0 }); });
        map[norm(h)] = map[norm(d.title)];                 // the handle works as a key too
      });
    } else if (Array.isArray(input)) {
      input.forEach(function (r) { if (r.dish && r.name) add(r.dish, { name: r.name, qty: +r.qty || 0, unit: r.unit || 'g', cat: r.cat || 'pantry', waste: +r.waste || 0 }); });
    }
    return map;
  }
  function findRecipe(map, title) {
    var k = norm(title);
    if (map[k]) return map[k];
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) if (keys[i].indexOf(k) === 0 || k.indexOf(keys[i]) === 0) return map[keys[i]];
    return null;
  }
  function recipeList(map) {                              // unique recipes, for the "Recetas" tab
    var seen = {}, out = [];
    Object.keys(map).forEach(function (k) { var r = map[k]; if (!seen[r.title]) { seen[r.title] = 1; out.push(r); } });
    return out;
  }

  /* ------------------------------------------------------------------ shopping list */
  function roundUp(v, unit) { var step = unit === 'u' ? 1 : 10; return Math.ceil(v / step - 1e-9) * step; }

  /** orders: [{date, plan:'block'|'trial', items:[{title, qty}]}] · opts: {from, to (ymd Mondays, inclusive), cutoff, buffer (%)} */
  function shopping(orders, recipes, opts) {
    var from = opts.from, to = opts.to || opts.from, buffer = opts.buffer == null ? 5 : opts.buffer;
    var rows = {}, missing = {}, plates = 0, active = 0;
    orders.forEach(function (o) {
      var weeks = deliveryWeeks(o, opts.cutoff).filter(function (w) { return w >= from && w <= to; });
      if (!weeks.length) return;
      active++;
      weeks.forEach(function (w) { itemsOf(o, w).forEach(function (it) {
        var n = +it.qty || 0; if (!n) return;
        plates += n;
        var rec = findRecipe(recipes, it.title);
        if (!rec) { missing[it.title] = (missing[it.title] || 0) + n; return; }
        rec.ing.forEach(function (g) {
          var key = norm(g.name) + '|' + g.unit;
          var r = rows[key] = rows[key] || { key: key, name: g.name, unit: g.unit, cat: g.cat, net: 0, gross: 0, dishes: {} };
          var net = g.qty * n, gross = g.waste > 0 && g.waste < 95 ? net / (1 - g.waste / 100) : net;
          r.net += net; r.gross += gross; r.dishes[rec.title] = (r.dishes[rec.title] || 0) + n;
        });
      }); });
    });
    var list = Object.keys(rows).map(function (k) { var r = rows[k]; r.buy = roundUp(r.gross * (1 + buffer / 100), r.unit); return r; });
    list.sort(function (a, b) { return CAT_ORDER.indexOf(a.cat) - CAT_ORDER.indexOf(b.cat) || a.name.localeCompare(b.name, 'es'); });
    return { rows: list, missing: missing, plates: plates, orders: active };
  }
  function fmtQty(v, unit) {
    var f = function (x, d) { var s = x.toFixed(d); return d && /\.0+$/.test(s) ? s.replace(/\.0+$/, '') : s; };
    if (unit === 'g') return v >= 1000 ? { n: f(v / 1000, 1), u: 'kg' } : { n: f(v, 0), u: 'g' };
    if (unit === 'ml') return v >= 1000 ? { n: f(v / 1000, 1), u: 'L' } : { n: f(v, 0), u: 'ml' };
    return { n: f(v, 0), u: 'pz' };
  }

  /** per delivery week: how many orders were active, dishes to cook, and how many 4-week blocks started that week */
  function weeklyHistory(orders, cutoff, fromMonday, count) {
    var out = [];
    for (var i = 0; i < count; i++) {
      var w = ymd(addDays(parseYmd(fromMonday), 7 * i)), active = 0, plates = 0, started = 0;
      orders.forEach(function (o) {
        var weeks = deliveryWeeks(o, cutoff);
        if (weeks.indexOf(w) < 0) return;
        active++; if (weeks[0] === w && o.plan === 'block') started++;
        itemsOf(o, w).forEach(function (it) { plates += +it.qty || 0; });
      });
      out.push({ week: w, orders: active, plates: plates, newBlocks: started });
    }
    return out;
  }
  function activeBlocks(orders, cutoff, todayMonday) {
    return orders.filter(function (o) { return o.plan === 'block' && deliveryWeeks(o, cutoff).slice(-1)[0] >= todayMonday; }).length;
  }

  /* ------------------------------------------------------------------ tally */
  function monthTally(orders, clients, year, month, cutoff) {
    var inMonth = orders.filter(function (o) { var d = new Date(o.date); return d.getFullYear() === year && d.getMonth() === month; });
    var t = { orders: inMonth.length, blocks: 0, trials: 0, revenue: 0, plates: 0, top: [], newClients: 0, perWeek: {} };
    var dishes = {};
    inMonth.forEach(function (o) {
      if (o.plan === 'block') t.blocks++; else t.trials++;
      t.revenue += +o.total || 0;
      var wk = ymd(mondayOf(new Date(o.date))); t.perWeek[wk] = (t.perWeek[wk] || 0) + 1;
      deliveryWeeks(o, cutoff).forEach(function (w) { itemsOf(o, w).forEach(function (it) { var n = +it.qty || 0; t.plates += n; dishes[it.title] = (dishes[it.title] || 0) + n; }); });
    });
    t.avg = t.orders ? t.revenue / t.orders : 0;
    t.top = Object.keys(dishes).map(function (k) { return { title: k, n: dishes[k] }; }).sort(function (a, b) { return b.n - a.n; });
    if (clients && clients.length) {
      t.newClients = clients.filter(function (c) { var d = new Date(c.created); return d.getFullYear() === year && d.getMonth() === month; }).length;
    } else {                                           // no client list: a client is "new" in the month of their first order
      var first = {};
      orders.forEach(function (o) { var e = String(o.email || o.customer || '').toLowerCase(); if (e && (!first[e] || o.date < first[e])) first[e] = o.date; });
      Object.keys(first).forEach(function (e) { var d = new Date(first[e]); if (d.getFullYear() === year && d.getMonth() === month) t.newClients++; });
    }
    return t;
  }

  /* ------------------------------------------------------------------ demo data (until the Sheet endpoint is connected) */
  function demoData(now, recipeMap) {
    var seed = 20260101, rnd = function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    var titles = recipeList(recipeMap).map(function (r) { return r.title; });
    var price = function (i) { return [160, 160, 220, 160, 280, 340, 220, 160, 220, 160, 160][i % 11]; };
    var names = ['Ana Pérez', 'Luis Mena', 'Sofía Rojas', 'Carlos Díaz', 'Marta Gil', 'Pablo Ruiz', 'Elena Cruz', 'Jorge Vidal', 'Lucía Soto', 'Diego Paz', 'Nora Lara', 'Iván Rey', 'Tania Ríos', 'Omar Vega', 'Paula Ibarra', 'Raúl Mora', 'Sara Luna', 'Hugo Ponce'];
    var orders = [], clients = {};
    for (var i = 0; i < 74; i++) {
      var daysAgo = Math.floor(rnd() * 56), d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 8 + Math.floor(rnd() * 12), Math.floor(rnd() * 60));
      var who = names[Math.floor(rnd() * names.length)], k = 1 + Math.floor(rnd() * 3), items = [], used = {}, weekly = 0;
      for (var j = 0; j < k; j++) { var ix = Math.floor(rnd() * titles.length); if (used[ix]) continue; used[ix] = 1; var q = 1 + Math.floor(rnd() * 3); items.push({ title: titles[ix], qty: q }); weekly += q * price(ix); }
      var plan = rnd() < 0.68 ? 'block' : 'trial';
      var email = who.toLowerCase().replace(/[^a-z]/g, '') + '@ejemplo.com';
      orders.push({ id: 1000 + i, name: '#' + (1001 + i), date: d.toISOString(), customer: who, email: email, plan: plan, total: Math.round(plan === 'block' ? weekly * 4 : weekly * 1.15), items: items });
      if (!clients[email] || d < new Date(clients[email].created)) clients[email] = { email: email, created: d.toISOString() };
    }
    orders.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    return { orders: orders, clients: Object.keys(clients).map(function (e) { return clients[e]; }), demo: true };
  }

  var api = { CAT_ORDER: CAT_ORDER, CAT_NAME: CAT_NAME, ymd: ymd, parseYmd: parseYmd, addDays: addDays, mondayOf: mondayOf, firstDeliveryMonday: firstDeliveryMonday,
    weeksOf: weeksOf, deliveryWeeks: deliveryWeeks, weeksInMonth: weeksInMonth, norm: norm, normalizeRecipes: normalizeRecipes, findRecipe: findRecipe, recipeList: recipeList,
    mount: mount, shopping: shopping, itemsOf: itemsOf, attachWeeklies: attachWeeklies, weeklyHistory: weeklyHistory, activeBlocks: activeBlocks, fmtQty: fmtQty, monthTally: monthTally, demoData: demoData };

  /* ================================================================== the screen (browser only) */
  if (typeof document === 'undefined') return api;

  var STR = {
    es: { title: 'Panel de administración', demo: 'Datos de demostración. Conecta el Google Sheet (docs/admin.md) para ver los pedidos reales.', tabs: ['Resumen', 'Lista de compras', 'Recetas', 'Pedidos', 'Descuentos'],
      dTitle: 'Generar código de descuento', dHelp: 'Crea un código y dile cuántas veces se puede usar en total. Shopify lo aplica en el pago y deja de aceptarlo cuando se agotan los usos.', dCode: 'Código', dGen: 'Sugerir código', dKind: 'Tipo', dPercent: 'Porcentaje (%)', dAmount: 'Monto fijo (MXN)', dValue: 'Valor', dUses: 'Usos en total', dEnds: 'Vence (opcional)', dCreate: 'Crear código', dList: 'Códigos creados', dUsed: 'Usos', dStatus: 'Estado', dOff: 'Desactivar', dNone: 'Aún no hay códigos.', dDemo: 'Conecta el Google Sheet (docs/setup-checklist.md) para crear códigos reales.', dOk: 'Código creado: ', dDone: 'Código desactivado.', dErrTok: 'Falta conectar Shopify: en el Apps Script agrega las propiedades SHOPIFY_STORE y SHOPIFY_TOKEN (ver docs/setup-checklist.md).', dErrCode: 'El código debe tener de 3 a 30 letras, números, guiones o guion bajo.', dErrVal: 'Escribe un valor válido (porcentaje de 1 a 100).', dErrUses: 'Escribe cuántas veces se puede usar (1 o más).', dErr: 'No se pudo completar: ', dActive: 'Activo', dExpired: 'Agotado o vencido', dScheduled: 'Programado', dUnlimited: '—',
      orders: 'Pedidos del mes', blocks: 'Planes de 4 semanas', trials: 'Planes de 1 semana', clients: 'Clientes nuevos', sales: 'Ventas', avg: 'Ticket promedio', plates: 'Platillos a cocinar', top: 'Platillos más pedidos', mix: 'Bloque vs. suelto',
      perWeek: 'Pedidos por semana', week: 'Semana', month: 'Mes', buffer: 'Colchón de compra (%)', copy: 'Copiar lista', csv: 'Descargar CSV', print: 'Imprimir', copied: 'Lista copiada',
      forWhat: 'Para', dishesWord: 'platillos', activeOrders: 'pedidos activos', missing: 'Sin receta (no entran en la lista):', ingredient: 'Ingrediente', qty: 'Comprar', none: 'No hay pedidos activos en este periodo.',
      history: 'Historial por semana', hWeek: 'Semana', hOrders: 'Pedidos activos', hPlates: 'Platillos', hNew: 'Bloques nuevos', activeNow: 'Bloques activos ahora', calc: 'Cálculo', withWaste: 'con merma', recipesNote: 'Cantidades por porción. Son estimaciones de arranque: el chef las ajusta en la hoja "Recetas" del Google Sheet.', per: 'por porción', waste: 'merma',
      date: 'Fecha', order: 'Pedido', client: 'Cliente', plan: 'Plan', items: 'Platillos', total: 'Total', firstDelivery: '1ª entrega', block: 'Bloque 4 sem.', trial: 'Semana de prueba',
      key: 'Contraseña de administración', keyHelp: 'Es la clave ADMIN_KEY que configuraste en el Apps Script.', enter: 'Entrar', badKey: 'Contraseña incorrecta.', loading: 'Cargando…', error: 'No se pudieron cargar los datos', lock: 'Cerrar sesión',
      noRecipes: 'Aún no hay recetas.', cooking: 'Para cocinar', buyList: 'Ver lista de compras', thisWeek: 'Esta semana', nextWeek: 'Próxima semana' },
    en: { title: 'Admin panel', demo: 'Demo data. Connect the Google Sheet (docs/admin.md) to see real orders.', tabs: ['Summary', 'Shopping list', 'Recipes', 'Orders', 'Discounts'],
      dTitle: 'Generate a discount code', dHelp: 'Create a code and say how many times it can be used in total. Shopify applies it at checkout and stops accepting it when the uses run out.', dCode: 'Code', dGen: 'Suggest a code', dKind: 'Type', dPercent: 'Percentage (%)', dAmount: 'Fixed amount (MXN)', dValue: 'Value', dUses: 'Total uses', dEnds: 'Expires (optional)', dCreate: 'Create code', dList: 'Codes created', dUsed: 'Uses', dStatus: 'Status', dOff: 'Deactivate', dNone: 'No codes yet.', dDemo: 'Connect the Google Sheet (docs/setup-checklist.md) to create real codes.', dOk: 'Code created: ', dDone: 'Code deactivated.', dErrTok: 'Shopify is not connected: add the SHOPIFY_STORE and SHOPIFY_TOKEN properties in the Apps Script (see docs/setup-checklist.md).', dErrCode: 'The code needs 3 to 30 letters, numbers, hyphens or underscores.', dErrVal: 'Enter a valid value (percentage from 1 to 100).', dErrUses: 'Enter how many times it can be used (1 or more).', dErr: 'Could not complete: ', dActive: 'Active', dExpired: 'Used up or expired', dScheduled: 'Scheduled', dUnlimited: '—',
      orders: 'Orders this month', blocks: '4-week blocks', trials: 'Trial weeks (loose)', clients: 'New clients', sales: 'Sales', avg: 'Average ticket', plates: 'Dishes to cook', top: 'Most ordered dishes', mix: 'Block vs loose',
      perWeek: 'Orders per week', week: 'Week', month: 'Month', buffer: 'Buying buffer (%)', copy: 'Copy list', csv: 'Download CSV', print: 'Print', copied: 'List copied',
      forWhat: 'For', dishesWord: 'dishes', activeOrders: 'active orders', missing: 'No recipe (not in the list):', ingredient: 'Ingredient', qty: 'Buy', none: 'No active orders in this period.',
      history: 'Weekly history', hWeek: 'Week', hOrders: 'Active orders', hPlates: 'Dishes', hNew: 'New blocks', activeNow: 'Active blocks now', calc: 'Math', withWaste: 'with waste', recipesNote: 'Quantities per portion. Starting estimates: the chef adjusts them in the "Recetas" Google Sheet tab.', per: 'per portion', waste: 'waste',
      date: 'Date', order: 'Order', client: 'Client', plan: 'Plan', items: 'Dishes', total: 'Total', firstDelivery: '1st delivery', block: '4-week block', trial: 'Trial week',
      key: 'Admin password', keyHelp: 'It is the ADMIN_KEY you set in the Apps Script.', enter: 'Enter', badKey: 'Wrong password.', loading: 'Loading…', error: 'Could not load the data', lock: 'Sign out',
      noRecipes: 'No recipes yet.', cooking: 'To cook', buyList: 'See shopping list', thisWeek: 'This week', nextWeek: 'Next week' }
  };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var MONTHS = { es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'], en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] };
  var money = function (v, lang) { try { return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v); } catch (e) { return '$' + Math.round(v); } };

  function mount(el) {
    var lang = el.getAttribute('data-lang') === 'en' ? 'en' : 'es', T = STR[lang], cutoff = +el.getAttribute('data-cutoff-hour') || 10;
    var endpoint = el.getAttribute('data-endpoint') || '';
    var recipes = normalizeRecipes(window.KX_RECIPES || { dishes: {} });
    var now = new Date();
    var adminKey = '', S = { disc: null, discMsg: '', discBad: false, tab: 0, year: now.getFullYear(), month: now.getMonth(), mode: 'week', week: ymd(addDays(mondayOf(now), 7)), buffer: 5, data: null };
    try { var b = parseFloat(localStorage.getItem('kx-admin-buffer')); if (b >= 0 && b <= 50) S.buffer = b; } catch (e) {}
    var checksKey = function () { return 'kx-admin-checks:' + (S.mode === 'week' ? S.week : S.year + '-' + S.month); };
    var getChecks = function () { try { return JSON.parse(localStorage.getItem(checksKey()) || '{}'); } catch (e) { return {}; } };
    var setChecks = function (c) { try { localStorage.setItem(checksKey(), JSON.stringify(c)); } catch (e) {} };

    var period = function () { if (S.mode === 'week') return { from: S.week, to: S.week }; var w = weeksInMonth(S.year, S.month); return { from: w[0] || ymd(new Date(S.year, S.month, 1)), to: w[w.length - 1] || ymd(new Date(S.year, S.month, 28)) }; };
    var list = function () { var p = period(); return shopping(S.data.orders, recipes, { from: p.from, to: p.to, cutoff: cutoff, buffer: S.buffer }); };
    var weekLabel = function (m) { var a = parseYmd(m), b = addDays(a, 6); return a.getDate() + '–' + b.getDate() + ' ' + MONTHS[lang][b.getMonth()].slice(0, 3); };

    function viewSummary() {
      var t = monthTally(S.data.orders, S.data.clients, S.year, S.month, cutoff);
      var topMax = t.top.length ? t.top[0].n : 1, pb = t.orders ? Math.round((t.blocks / t.orders) * 100) : 0;
      var nextW = ymd(addDays(mondayOf(now), 7)), cook = shopping(S.data.orders, recipes, { from: nextW, to: nextW, cutoff: cutoff, buffer: 0 });
      var wk = Object.keys(t.perWeek).sort(), wkMax = Math.max.apply(null, wk.map(function (k) { return t.perWeek[k]; }).concat([1]));
      return '<div class="adm-nav"><button data-m="-1" aria-label="‹">‹</button><b>' + esc(MONTHS[lang][S.month] + ' ' + S.year) + '</b><button data-m="1" aria-label="›">›</button></div>' +
        '<div class="adm-kpis">' +
        kpi(T.orders, t.orders, 'orders') + kpi(T.blocks, t.blocks, 'blocks') + kpi(T.trials, t.trials, 'trials') + kpi(T.clients, t.newClients, 'clients') +
        kpi(T.activeNow, activeBlocks(S.data.orders, cutoff, ymd(mondayOf(now))), 'active') + kpi(T.sales, money(t.revenue, lang), 'sales') + kpi(T.avg, money(t.avg, lang), 'avg') + '</div>' +
        '<div class="adm-grid"><section class="adm-card"><h3>' + T.mix + '</h3><div class="adm-bar"><i style="width:' + pb + '%"></i></div><p class="adm-muted">' + t.blocks + ' ' + esc(T.blocks.toLowerCase()) + ' · ' + t.trials + ' ' + esc(T.trials.toLowerCase()) + '</p>' +
        '<h3>' + T.perWeek + '</h3><div class="adm-spark">' + wk.map(function (k) { return '<span title="' + esc(weekLabel(k)) + '"><i style="height:' + Math.round((t.perWeek[k] / wkMax) * 100) + '%"></i><em>' + t.perWeek[k] + '</em></span>'; }).join('') + '</div></section>' +
        '<section class="adm-card"><h3>' + T.top + '</h3>' + (t.top.length ? t.top.slice(0, 8).map(function (d) { return '<div class="adm-row"><span>' + esc(d.title) + '</span><b>' + d.n + '</b><div class="adm-bar sm"><i style="width:' + Math.round((d.n / topMax) * 100) + '%"></i></div></div>'; }).join('') : '<p class="adm-muted">' + T.none + '</p>') + '</section>' +
        '<section class="adm-card adm-hist"><h3>' + T.history + '</h3><table><thead><tr><th>' + T.hWeek + '</th><th>' + T.hOrders + '</th><th>' + T.hPlates + '</th><th>' + T.hNew + '</th></tr></thead><tbody>' + weeklyHistory(S.data.orders, cutoff, ymd(addDays(mondayOf(now), -49)), 12).reverse().map(function (h) { return '<tr' + (h.week === ymd(mondayOf(now)) ? ' class="now"' : '') + '><td>' + esc(weekLabel(h.week)) + '</td><td>' + h.orders + '</td><td>' + h.plates + '</td><td>' + h.newBlocks + '</td></tr>'; }).join('') + '</tbody></table></section>' +
        '<section class="adm-card adm-cta"><h3>' + T.cooking + ' · ' + T.nextWeek + '</h3><p class="adm-big">' + cook.plates + ' <small>' + T.dishesWord + '</small></p><p class="adm-muted">' + cook.orders + ' ' + T.activeOrders + '</p><button class="adm-btn" data-go="1" data-week="' + nextW + '">' + T.buyList + '</button></section></div>';
    }
    function kpi(label, val, id) { return '<div class="adm-kpi" data-kpi="' + id + '"><span>' + esc(label) + '</span><b>' + esc(val) + '</b></div>'; }

    function viewShopping() {
      var r = list(), checks = getChecks(), p = period();
      var head = '<div class="adm-toolbar"><div class="adm-seg" role="group"><button data-mode="week" aria-pressed="' + (S.mode === 'week') + '">' + T.week + '</button><button data-mode="month" aria-pressed="' + (S.mode === 'month') + '">' + T.month + '</button></div>' +
        '<div class="adm-nav">' + (S.mode === 'week' ? '<button data-w="-1">‹</button><b>' + esc(weekLabel(S.week)) + '</b><button data-w="1">›</button>' : '<button data-m="-1">‹</button><b>' + esc(MONTHS[lang][S.month] + ' ' + S.year) + '</b><button data-m="1">›</button>') + '</div>' +
        '<label class="adm-buffer">' + T.buffer + ' <input type="number" min="0" max="50" step="1" value="' + S.buffer + '" data-buffer></label></div>' +
        '<p class="adm-sum"><b>' + r.plates + '</b> ' + T.dishesWord + ' · <b>' + r.orders + '</b> ' + T.activeOrders + '</p>';
      if (!r.rows.length) return head + '<p class="adm-empty">' + T.none + '</p>' + missingHtml(r);
      var out = head, cat = '';
      r.rows.forEach(function (row) {
        if (row.cat !== cat) { if (cat) out += '</ul>'; cat = row.cat; out += '<h3 class="adm-cat">' + esc(CAT_NAME[lang][cat] || cat) + '</h3><ul class="adm-list">'; }
        var q = fmtQty(row.buy, row.unit), dishes = Object.keys(row.dishes).map(function (d) { return d + ' ×' + row.dishes[d]; }).join(' · ');
        var fq = function (v) { var x = fmtQty(v, row.unit); return x.n + ' ' + x.u; };
        var calc = T.calc + ': ' + fq(row.net) + (row.gross > row.net + 0.5 ? ' → ' + T.withWaste + ' ' + fq(row.gross) : '') + ' → +' + S.buffer + '% = ' + fq(row.gross * (1 + S.buffer / 100));
        out += '<li class="' + (checks[row.key] ? 'done' : '') + '"><label><input type="checkbox" data-check="' + esc(row.key) + '"' + (checks[row.key] ? ' checked' : '') + '><span class="adm-name">' + esc(row.name) + '<small>' + esc(dishes) + '</small><small class="adm-calc">' + esc(calc) + '</small></span><span class="adm-qty" data-qty="' + esc(row.key) + '"><b>' + esc(q.n) + '</b> ' + esc(q.u) + '</span></label></li>';
      });
      out += '</ul>' + missingHtml(r) + '<div class="adm-actions"><button class="adm-btn" data-act="copy">' + T.copy + '</button><button class="adm-btn" data-act="csv">' + T.csv + '</button><button class="adm-btn ghost" data-act="print">' + T.print + '</button></div>';
      return out;
    }
    function missingHtml(r) { var k = Object.keys(r.missing); return k.length ? '<p class="adm-warn">' + T.missing + ' ' + esc(k.map(function (d) { return d + ' (×' + r.missing[d] + ')'; }).join(', ')) + '</p>' : ''; }

    function viewRecipes() {
      var rl = recipeList(recipes); if (!rl.length) return '<p class="adm-empty">' + T.noRecipes + '</p>';
      return '<p class="adm-muted">' + T.recipesNote + '</p><div class="adm-recipes">' + rl.map(function (r) {
        var grams = r.ing.reduce(function (a, g) { return a + (g.unit === 'g' || g.unit === 'ml' ? g.qty : 0); }, 0);
        return '<section class="adm-card"><h3>' + esc(r.title) + ' <small>' + Math.round(grams) + ' g/ml ' + T.per + '</small></h3><table><tbody>' + r.ing.map(function (g) { return '<tr><td>' + esc(g.name) + '</td><td>' + esc(g.qty) + ' ' + esc(g.unit === 'u' ? 'pz' : g.unit) + '</td><td class="adm-muted">' + (g.waste ? T.waste + ' ' + g.waste + '%' : '') + '</td></tr>'; }).join('') + '</tbody></table></section>';
      }).join('') + '</div>';
    }
    function viewOrders() {
      var rows = S.data.orders.slice(0, 200);
      return '<div class="adm-tablewrap"><table class="adm-table"><thead><tr><th>' + T.date + '</th><th>' + T.order + '</th><th>' + T.client + '</th><th>' + T.plan + '</th><th>' + T.items + '</th><th>' + T.total + '</th><th>' + T.firstDelivery + '</th></tr></thead><tbody>' + rows.map(function (o) {
        var d = new Date(o.date);
        return '<tr><td>' + d.getDate() + ' ' + MONTHS[lang][d.getMonth()].slice(0, 3) + '</td><td>' + esc(o.name || o.id) + '</td><td>' + esc(o.customer) + '</td><td>' + (o.plan === 'block' ? T.block : T.trial) + '</td><td>' + esc((o.items || []).map(function (i) { return i.qty + '× ' + i.title; }).join(' | ')) + '</td><td>' + esc(money(o.total, lang)) + '</td><td>' + esc(weekLabel(ymd(firstDeliveryMonday(o.date, cutoff)))) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    }

    function viewDiscounts() {
      var f = '<section class="adm-card"><h3>' + T.dTitle + '</h3><p class="adm-muted">' + T.dHelp + '</p>' +
        '<form class="adm-form" data-discform><label>' + T.dCode + '<span class="adm-inline"><input name="code" maxlength="30" autocomplete="off" required style="text-transform:uppercase"><button class="adm-btn ghost" type="button" data-dgen>' + T.dGen + '</button></span></label>' +
        '<label>' + T.dKind + '<select name="kind"><option value="percent">' + T.dPercent + '</option><option value="amount">' + T.dAmount + '</option></select></label>' +
        '<label>' + T.dValue + '<input name="value" type="number" min="1" step="1" required></label>' +
        '<label>' + T.dUses + '<input name="uses" type="number" min="1" step="1" required></label>' +
        '<label>' + T.dEnds + '<input name="ends" type="date"></label>' +
        '<button class="adm-btn" type="submit">' + T.dCreate + '</button></form>' +
        '<p class="' + (S.discBad ? 'adm-warn' : 'adm-muted') + '" data-discmsg role="status"' + (S.discMsg ? '' : ' hidden') + '>' + esc(S.discMsg) + '</p></section>';
      if (!endpoint) return '<p class="adm-demo">' + T.dDemo + '</p>' + f;
      var rows = (S.disc || []);
      var tab = rows.length ? '<div class="adm-tablewrap"><table class="adm-table" data-disctable><thead><tr><th>' + T.dCode + '</th><th>' + T.dValue + '</th><th>' + T.dUsed + '</th><th>' + T.dStatus + '</th><th></th></tr></thead><tbody>' + rows.map(function (d) {
        var st = d.status === 'ACTIVE' ? T.dActive : d.status === 'SCHEDULED' ? T.dScheduled : T.dExpired;
        return '<tr><td><b>' + esc(d.code) + '</b></td><td>' + (d.kind === 'percent' ? d.value + ' %' : money(d.value, lang)) + '</td><td>' + d.uses + ' / ' + (d.limit || T.dUnlimited) + '</td><td>' + st + '</td><td>' + (d.status === 'ACTIVE' ? '<button class="adm-btn ghost" data-doff="' + esc(d.id) + '">' + T.dOff + '</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="adm-empty">' + (S.disc ? T.dNone : T.loading) + '</p>';
      return f + '<h3 class="adm-cat">' + T.dList + '</h3>' + tab;
    }
    var dErr = function (j) { return j.error === 'no_token' ? T.dErrTok : j.error === 'bad_code' ? T.dErrCode : j.error === 'bad_value' ? T.dErrVal : j.error === 'bad_uses' ? T.dErrUses : T.dErr + (j.detail || j.error || ''); };
    var dCall = function (params, cb) {
      var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
      fetch(endpoint + (endpoint.indexOf('?') > -1 ? '&' : '?') + 'key=' + encodeURIComponent(adminKey) + '&' + q).then(function (r) { return r.json(); }).then(cb).catch(function () { cb({ ok: false, error: 'net', detail: T.error }); });
    };
    var dLoad = function () { if (!endpoint) return; dCall({ action: 'discounts' }, function (j) { if (j.ok) S.disc = j.discounts || []; else { S.disc = []; S.discMsg = dErr(j); S.discBad = true; } if (S.tab === 4) render(); }); };
    function render() {
      var banner = S.data.demo ? '<p class="adm-demo">' + T.demo + '</p>' : '';
      var body = [viewSummary, viewShopping, viewRecipes, viewOrders, viewDiscounts][S.tab]();
      el.innerHTML = '<header class="adm-head"><h1>' + T.title + '</h1><div class="adm-tabs" role="tablist">' + T.tabs.map(function (n, i) { return '<button role="tab" aria-selected="' + (S.tab === i) + '" data-tab="' + i + '">' + n + '</button>'; }).join('') + '</div></header>' + banner + '<div class="adm-body">' + body + '</div>';
    }

    el.addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      if (t.hasAttribute('data-tab')) { S.tab = +t.getAttribute('data-tab'); render(); if (S.tab === 4 && S.disc === null) dLoad(); return; }
      if (t.hasAttribute('data-dgen')) { var cf = el.querySelector('[data-discform] [name=code]'), w = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', c2 = 'KUL'; for (var gi = 0; gi < 5; gi++) c2 += w.charAt(Math.floor(Math.random() * w.length)); cf.value = c2; return; }
      if (t.hasAttribute('data-doff')) { dCall({ action: 'discount_off', id: t.getAttribute('data-doff') }, function (j) { S.discMsg = j.ok ? T.dDone : dErr(j); S.discBad = !j.ok; S.disc = null; render(); dLoad(); }); return; }
      if (t.hasAttribute('data-m')) { var d = new Date(S.year, S.month + (+t.getAttribute('data-m')), 1); S.year = d.getFullYear(); S.month = d.getMonth(); render(); return; }
      if (t.hasAttribute('data-w')) { S.week = ymd(addDays(parseYmd(S.week), 7 * (+t.getAttribute('data-w')))); render(); return; }
      if (t.hasAttribute('data-mode')) { S.mode = t.getAttribute('data-mode'); render(); return; }
      if (t.hasAttribute('data-go')) { S.week = t.getAttribute('data-week'); S.mode = 'week'; S.tab = 1; render(); return; }
      if (t.hasAttribute('data-act')) exportList(t.getAttribute('data-act'));
      if (t.hasAttribute('data-lock')) { try { sessionStorage.removeItem('kx-admin-key'); } catch (x) {} location.reload(); }
    });
    el.addEventListener('submit', function (e) {
      var fm = e.target.closest('[data-discform]'); if (!fm) return; e.preventDefault();
      var g = function (n) { return fm.elements[n].value; }, code = g('code').toUpperCase().trim();
      var bad = function (m) { S.discMsg = m; S.discBad = true; render(); };
      if (!/^[A-Z0-9_-]{3,30}$/.test(code)) { bad(T.dErrCode); return; }
      if (!(+g('value') > 0) || (g('kind') === 'percent' && +g('value') > 100)) { bad(T.dErrVal); return; }
      if (!(+g('uses') >= 1)) { bad(T.dErrUses); return; }
      if (!endpoint) { bad(T.dDemo); return; }
      dCall({ action: 'discount_new', code: code, kind: g('kind'), value: g('value'), uses: g('uses'), ends: g('ends') }, function (j) { S.discMsg = j.ok ? T.dOk + j.code : dErr(j); S.discBad = !j.ok; S.disc = null; render(); if (j.ok) dLoad(); else S.disc = []; });
    });
    el.addEventListener('change', function (e) {
      var c = e.target.closest('[data-check]');
      if (c) { var cs = getChecks(); if (c.checked) cs[c.getAttribute('data-check')] = 1; else delete cs[c.getAttribute('data-check')]; setChecks(cs); c.closest('li').classList.toggle('done', c.checked); return; }
      var b = e.target.closest('[data-buffer]');
      if (b) { S.buffer = Math.max(0, Math.min(50, parseFloat(b.value) || 0)); try { localStorage.setItem('kx-admin-buffer', String(S.buffer)); } catch (x) {} render(); }
    });
    function exportList(kind) {
      var r = list(), rows = r.rows.map(function (g) { var q = fmtQty(g.buy, g.unit); return [CAT_NAME[lang][g.cat] || g.cat, g.name, q.n, q.u]; });
      if (kind === 'print') { window.print(); return; }
      var text = rows.map(function (x) { return x[1] + ': ' + x[2] + ' ' + x[3]; }).join('\n');
      if (kind === 'copy') { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { flash(T.copied); }, function () { flash(T.copied); }); return; }
      var csv = ['Categoría,Ingrediente,Cantidad,Unidad'].concat(rows.map(function (x) { return x.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); })).join('\n');
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = 'lista-de-compras-' + period().from + '.csv'; a.click();
    }
    function flash(msg) { var f = document.createElement('div'); f.className = 'adm-toast'; f.textContent = msg; document.body.appendChild(f); setTimeout(function () { f.remove(); }, 2200); }

    function gate(msg) {
      el.innerHTML = '<div class="adm-gate"><h1>' + T.title + '</h1><p>' + T.keyHelp + '</p><form data-keyform><label>' + T.key + '<input type="password" autocomplete="current-password" required></label><button class="adm-btn" type="submit">' + T.enter + '</button></form>' + (msg ? '<p class="adm-warn" role="alert">' + msg + '</p>' : '') + '</div>';
      el.querySelector('[data-keyform]').addEventListener('submit', function (ev) { ev.preventDefault(); var k = el.querySelector('input').value; try { sessionStorage.setItem('kx-admin-key', k); } catch (x) {} load(k); });
    }
    function load(key) {
      adminKey = key || '';
      if (!endpoint) { S.data = demoData(now, recipes); render(); return; }
      el.innerHTML = '<p class="adm-empty">' + T.loading + '</p>';
      var url = endpoint + (endpoint.indexOf('?') > -1 ? '&' : '?') + 'action=admin&key=' + encodeURIComponent(key || '');
      fetch(url).then(function (r) { return r.json(); }).then(function (j) {
        if (!j.ok) { try { sessionStorage.removeItem('kx-admin-key'); } catch (x) {} gate(j.error === 'forbidden' ? T.badKey : T.error); return; }
        if (j.recipes && j.recipes.length) recipes = normalizeRecipes(j.recipes);
        S.data = { orders: attachWeeklies(j.orders || [], j.selections || [], cutoff), clients: j.clients || [], demo: false }; render();
      }).catch(function () { gate(T.error); });
    }
    var saved = ''; try { saved = sessionStorage.getItem('kx-admin-key') || ''; } catch (e) {}
    if (!endpoint) load(''); else if (saved) load(saved); else gate('');
  }

  var start = function () { [].forEach.call(document.querySelectorAll('[data-admin-hub]'), mount); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  return api;
});
