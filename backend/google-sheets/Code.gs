/**
 * Kulinaria MX — Shopify -> Google Sheets (client profiles + orders)
 *
 * Receives Shopify webhooks (customers/create, customers/update, orders/create) and keeps three sheets up to date:
 *   Clientes   one row per client (upsert by e-mail): contact, address, allergies, dislikes, diets, referral code, plan
 *   Pedidos    one row per order (upsert by order id): who, when, plan, focus, totals, delivery data, dishes summary
 *   Platillos  one row per ordered dish (for the weekly kitchen report)
 *   Semana     live summary: how many of each dish to cook (formulas, created by setupSheets)
 *
 * Setup: see backend/README.md. Open the Sheet > Extensions > Apps Script, paste this file, run setupSheets() once,
 * set the script property WEBHOOK_KEY (Project Settings > Script properties), then Deploy > New deployment > Web app
 * (Execute as: me, Who has access: Anyone). The deployed URL is what the Shopify webhooks call.
 *
 * Besides the raw tables it keeps two READ-ONLY report tabs up to date (rebuilt automatically after every order and every weekly choice):
 *   Entregas   one row per client and delivery week: what to put in the box each weekday, which days need a delivery, allergies
 *   Resumen    this week and next week: deliveries and meals per day, dishes per day, totals, active plans
 * Credits: a plan covers 1 or 4 delivery weeks, up to 5 meals a week (one per weekday). Days left empty are simply not delivered.
 *
 * Order data written by the theme (cart attributes -> order "additional details"):
 *   nombre, correo, telefono, direccion, alergias, no_me_gustan, dietas, enfoque, plan, codigo_referencia, pedido_embudo, contrato_aceptado
 */

var SHEETS = {
  Clientes: ['ID Shopify', 'Creado', 'Actualizado', 'Nombre', 'Apellido', 'Correo', 'Teléfono', 'Dirección', 'Ciudad', 'CP', 'Alergias', 'No me gustan', 'Dietas', 'Código de referencia', 'Plan', 'Etiquetas', 'Notas'],
  Pedidos: ['ID Shopify', 'Pedido', 'Fecha', 'Cliente', 'Correo', 'Teléfono', 'Total', 'Moneda', 'Pago', 'Entrega', 'Plan', 'Enfoque', 'Dietas', 'Alergias', 'No me gustan', 'Dirección de entrega', 'Código de referencia', 'Contrato aceptado', 'Platillos', 'Nota', 'Días (JSON)', 'ID Cliente', 'Para', 'Notas cocina'],
  Platillos: ['ID Pedido', 'Pedido', 'Fecha', 'Cliente', 'Platillo', 'Variante', 'Cantidad', 'Precio unitario', 'Plan de suscripción']
};

function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]).setFontWeight('bold').setBackground('#1B2316').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    var boldCol = { Clientes: 4, Pedidos: 4, Platillos: 4 }[name];
    if (boldCol && sh.getLastRow() > 1) sh.getRange(2, boldCol, sh.getLastRow() - 1, 1).setFontWeight('bold');   // the client's name in bold
  });
  var wk = ss.getSheetByName('Semana') || ss.insertSheet('Semana');
  wk.clear();
  wk.getRange('A1').setValue('Platillos a cocinar (suma de todos los pedidos; filtra por fecha en Platillos)').setFontWeight('bold');
  wk.getRange('A3').setFormula('=IFERROR(QUERY(Platillos!A1:I,"select E, sum(G) where E is not null group by E order by sum(G) desc label E \'Platillo\', sum(G) \'Cantidad\'",1),"")');
  wk.getRange('D1').setValue('Dietas más pedidas').setFontWeight('bold');
  wk.getRange('D3').setFormula('=IFERROR(QUERY(Pedidos!A1:T,"select L, count(A) where L is not null group by L order by count(A) desc label L \'Enfoque\', count(A) \'Pedidos\'",1),"")');
  wk.getRange('G1').setValue('Alergias declaradas').setFontWeight('bold');
  wk.getRange('G3').setFormula('=IFERROR(QUERY(Clientes!A1:Q,"select K, count(F) where K is not null and K <> \'\' group by K order by count(F) desc label K \'Alergias\', count(F) \'Clientes\'",1),"")');
}

/**
 * GET ?action=admin&key=<ADMIN_KEY>  -> the data of the admin hub (orders, clients, recipes). Without that action it only says it is alive.
 * ADMIN_KEY is a script property (Project Settings > Script properties) and is the password the admin types in /pages/admin.
 * Use a long, unique one: this URL is public, the password is what protects the data.
 */
function doGet(e) {
  var params = (e && e.parameter) || {};
  if (params.action === 'profile') return out_(profileGet_(params.cid, params.token));
  if (params.action === 'week') return out_(weekGet_(params.cid, params.token, params.week));
  if (params.action === 'credits') return out_(creditsGet_(params.cid, params.token));
  if (params.action === 'weekset') return out_(weekSet_(params.cid, params.token, { week: params.week, email: params.email, upgrade: params.upgrade, days: String(params.days || '').split('|') }));
  if (params.action === 'pause') return out_(pauseSet_(params.cid, params.token, { mode: params.mode, week: params.week, weeks: String(params.weeks || '').split('|').filter(Boolean), email: params.email }));
  if (/^discount/.test(String(params.action || ''))) return out_(discountApi_(params));
  if (/^(expense|sample|lead)_/.test(String(params.action || ''))) return out_(adminApi_(params));
  if (params.action !== 'admin') return out_({ ok: true, service: 'kulinaria-sheets' });
  var key = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!key || params.key !== key) return out_({ ok: false, error: 'forbidden' });
  return out_(adminData_());
}

function adminData_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = function (name) { var sh = ss.getSheetByName(name); if (!sh || sh.getLastRow() < 2) return []; return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues(); };
  var sel = loadSelections_(), pz = loadPauses_();
  var orders = loadOrders_().filter(function (o) { return o.isPlan; }).map(function (o) {
    var byWeek = {}, rw = resolveOrderWeeks_(o, sel, pz); rw.forEach(function (w) { byWeek[w.week] = w.items; });
    return { holder: o.customer, para: o.para, notes: o.notes, phone: o.phone, address: o.address, allergies: o.allergies, dislikes: o.dislikes, weeks: rw.map(function (w) { return { week: w.week, slots: w.slots, src: w.src }; }), paused: rw.paused, id: o.id, name: o.name, date: new Date(o.date).toISOString(), customer: o.para ? o.customer + ' · ' + o.para : o.customer, email: o.email, cid: o.cid, total: o.total, currency: o.currency, paid: o.paid,
      plan: o.block ? 'block' : 'trial', items: countItems_(o.slots), byWeek: byWeek };
  });
  orders.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  var clients = rows('Clientes').map(function (r) { return { email: String(r[5]), created: r[1] ? new Date(r[1]).toISOString() : '' }; }).filter(function (c) { return c.email && c.created; });
  var recipes = rows('Recetas').map(function (r) { return { dish: String(r[0]), name: String(r[1]), qty: Number(r[2]) || 0, unit: String(r[3] || 'g'), cat: String(r[4] || 'pantry'), waste: Number(r[5]) || 0 }; }).filter(function (r) { return r.dish && r.name; });
  var finance = { orders: loadOrders_().map(function (o) { return { id: o.id, name: o.name, date: new Date(o.date).toISOString(), customer: o.customer, para: o.para, total: o.total, paid: o.paid, kind: o.isPlan ? 'plan' : (/mejora|upgrade/i.test(o.summary) ? 'upgrade' : 'other'), test: /^#PRUEBA/.test(o.name) }; }), expenses: loadExpenses_() };
  return { ok: true, generated: new Date().toISOString(), orders: orders, clients: clients, recipes: recipes.length ? recipes : null, finance: finance, leads: loadLeads_() };
}

function doPost(e) {
  var props = PropertiesService.getScriptProperties();
  var params = (e && e.parameter) || {};
  if (e && e.postData && /"action"\s*:\s*"lead"/.test(e.postData.contents || '')) { try { return out_(leadAdd_(JSON.parse(e.postData.contents))); } catch (errL) { return out_({ ok: false, error: String(errL) }); } }
  if (e && e.postData && /"action"\s*:\s*"diet_quote"/.test((e.postData.contents || '').slice(0, 200))) { try { return out_(dietQuoteAdd_(JSON.parse(e.postData.contents))); } catch (errD) { return out_({ ok: false, error: String(errD) }); } }
  if (e && e.postData && /"action"\s*:\s*"week"/.test(e.postData.contents || '')) { try { var wb = JSON.parse(e.postData.contents); return out_(weekSet_(wb.cid, wb.token, wb)); } catch (err2) { return out_({ ok: false, error: String(err2) }); } }
  if (e && e.postData && /"action"\s*:\s*"profile"/.test(e.postData.contents || '')) { try { var pb = JSON.parse(e.postData.contents); return out_(profileSet_(pb.cid, pb.token, pb.profile)); } catch (err) { return out_({ ok: false, error: String(err) }); } }
  if (!props.getProperty('WEBHOOK_KEY') || params.key !== props.getProperty('WEBHOOK_KEY')) return out_({ ok: false, error: 'forbidden' });
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var body = JSON.parse(e.postData.contents);
    var topic = String(params.topic || '').toLowerCase();
    if (topic === 'customers-create' || topic === 'customers-update') upsertCustomer_(body, {});
    else if (topic === 'orders-create' || topic === 'orders-paid') handleOrder_(body);
    else return out_({ ok: false, error: 'unknown topic' });
    return out_({ ok: true });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function attrs_(order) {
  var a = {};
  (order.note_attributes || []).forEach(function (x) { a[x.name] = x.value; });
  return a;
}

function sheet_(name) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name) || (setupSheets(), SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name)); }

function upsertRow_(name, keyCol, key, values) {
  var sh = sheet_(name), last = sh.getLastRow(), row = 0;
  if (last > 1 && key) {
    var keys = sh.getRange(2, keyCol, last - 1, 1).getValues();
    for (var i = 0; i < keys.length; i++) if (String(keys[i][0]).toLowerCase() === String(key).toLowerCase()) { row = i + 2; break; }
  }
  if (!row) row = last + 1;
  sh.getRange(row, 1, 1, values.length).setValues([values]);
  return row;
}

/** extra = {alergias, no_me_gustan, dietas, codigo_referencia, plan} taken from an order's attributes (empty for plain customer webhooks) */
function upsertCustomer_(c, extra) {
  var a = c.default_address || {};
  var email = c.email || '';
  // keep what is already stored when this payload has no profile data
  var sh = sheet_('Clientes'), existing = null, last = sh.getLastRow();
  if (last > 1 && email) {
    var emails = sh.getRange(2, 6, last - 1, 1).getValues();
    for (var i = 0; i < emails.length; i++) if (String(emails[i][0]).toLowerCase() === email.toLowerCase()) { existing = sh.getRange(i + 2, 1, 1, SHEETS.Clientes.length).getValues()[0]; break; }
  }
  var keep = function (idx, v) { return v || (existing ? existing[idx] : '') || ''; };
  upsertRow_('Clientes', 6, email, [
    c.id || (existing && existing[0]) || '', keep(1, c.created_at), c.updated_at || new Date().toISOString(),
    keep(3, c.first_name || extra.nombre), keep(4, c.last_name), email, keep(6, c.phone || extra.telefono),
    keep(7, [a.address1, a.address2].filter(Boolean).join(', ') || extra.direccion), keep(8, a.city), keep(9, a.zip),
    keep(10, extra.alergias), keep(11, extra.no_me_gustan), keep(12, extra.dietas), keep(13, extra.codigo_referencia), keep(14, extra.plan),
    keep(15, c.tags), keep(16, c.note)
  ]);
}

function lineProp_(line, name) {
  var v = ''; (line.properties || []).forEach(function (pr) { if (String(pr.name) === name) v = String(pr.value == null ? '' : pr.value); });
  return v === '-' ? '' : v;
}
function handleOrder_(o) {
  var a = attrs_(o), c = o.customer || {};
  var name = a.nombre || [c.first_name, c.last_name].filter(Boolean).join(' ') || (o.billing_address && o.billing_address.name) || '';
  var email = o.email || c.email || a.correo || '';
  var ship = o.shipping_address || {};
  var addr = a.direccion || [ship.address1, ship.address2, ship.city, ship.zip].filter(Boolean).join(', ');
  // 1. client profile (created/updated from the order's profile attributes)
  upsertCustomer_({ id: c.id, email: email, first_name: c.first_name || (name.split(' ')[0] || ''), last_name: c.last_name || name.split(' ').slice(1).join(' '), phone: c.phone || a.telefono,
    default_address: c.default_address || { address1: addr, city: ship.city, zip: ship.zip }, tags: c.tags, note: c.note, created_at: c.created_at, updated_at: o.updated_at }, a);
  // 2. dishes. An order can hold one plan line PER PERSON (a parent ordering for the family): every plan line becomes its own row, keyed order id, order id-2, ...
  var items = (o.line_items || []);
  var planLines = items.filter(function (i) { return dishRowsOf_(i).length; });
  var multi = planLines.length > 1;
  var summaryOf = function (line, rows) { return rows.map(function (d) { return d.qty + '× ' + d.title; }).join(' | ') + ' [' + (line.title || 'Plan') + ' · ' + (line.variant_title || '') + ']'; };
  var allRows = expandDishes_(items);
  var summary = planLines.length
    ? planLines.map(function (l) { var who = lineProp_(l, '_para_nombre'); return (who ? who + ': ' : '') + summaryOf(l, dishRowsOf_(l)); }).join('  ||  ')
    : items.map(function (i) { return i.quantity + '× ' + i.title + (i.variant_title ? ' (' + i.variant_title + ')' : ''); }).join(' | ');
  var isNew = !orderExists_(o.id);
  var sh = sheet_('Platillos'), last = sh.getLastRow();
  if (last > 1) {                       // replace the order's previous dish rows so re-sent webhooks never duplicate
    var ids = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var r = ids.length - 1; r >= 0; r--) if (String(ids[r][0]) === String(o.id)) sh.deleteRow(r + 2);
  }
  var writeRow = function (key, line, rows, idx) {
    var para = line ? lineProp_(line, '_para_nombre') : '';
    var planKey = line ? (multi ? (/4/.test(String(line.variant_title)) ? 'block' : 'week') : (a.plan || (/4/.test(String(line.variant_title)) ? 'block' : 'week'))) : '';
    var slots = parseSlots_(line ? (lineProp_(line, '_dias') || (idx === 0 ? a.dias : '')) : a.dias, rows);
    var total = o.total_price;
    if (multi && line) {                // each person's row carries its own price (plan + that person's upgrades)
      var pid = lineProp_(line, '_para'), t = Number(line.price) * Number(line.quantity || 1);
      items.forEach(function (i) { if (i !== line && !dishRowsOf_(i).length && lineProp_(i, '_para') === pid) t += Number(i.price) * Number(i.quantity || 1); });
      total = t.toFixed(2);
    }
    var al = line ? (lineProp_(line, '_alergias') || a.alergias || '') : (a.alergias || '');
    var dl = line ? (lineProp_(line, '_no_me_gustan') || a.no_me_gustan || '') : (a.no_me_gustan || '');
    var dt = line ? (lineProp_(line, '_dietas') || a.dietas || '') : (a.dietas || '');
    var rowSummary = line ? summaryOf(line, rows) : summary;
    var row = upsertRow_('Pedidos', 1, key, [key, o.name, o.created_at, name, email, c.phone || a.telefono || '', total, o.currency, o.financial_status, o.fulfillment_status || 'pendiente',
      planKey, a.enfoque || a.nivel || '', dt, al, dl, addr, a.codigo_referencia || '', a.contrato_aceptado || '', rowSummary, o.note || '', JSON.stringify(slots), String(c.id || ''), para, [a.ficha_cocina, line ? lineProp_(line, '_notas') : ''].filter(Boolean).join(' || ')]);
    try { sheet_('Pedidos').getRange(row, 4).setFontWeight('bold'); } catch (e0) { /* formatting never blocks an order */ }
    rows.forEach(function (d) { sh.appendRow([o.id, o.name, o.created_at, para || name, d.title, a.nivel || '', d.qty, '', line ? String(line.variant_title || '') : '']); });
  };
  if (planLines.length) planLines.forEach(function (l, idx) { writeRow(idx === 0 ? o.id : o.id + '-' + (idx + 1), l, dishRowsOf_(l), idx); });
  else {
    writeRow(o.id, null, [], 0);
    items.forEach(function (i) {
      sh.appendRow([o.id, o.name, o.created_at, name, i.title, i.variant_title || '', i.quantity, i.price,
        (i.selling_plan_allocation && i.selling_plan_allocation.selling_plan && i.selling_plan_allocation.selling_plan.name) || '']);
    });
  }
  (o.line_items || []).forEach(function (li) { (li.properties || []).forEach(function (pr) { if (pr.name === '_semana') weekMarkPaid_(o.customer && o.customer.id, String(pr.value)); }); });
  try { rebuildDeliveries_(); } catch (err) { /* reports must never block an order */ }
  if (isNew) alertNewOrder_(o, name, email, addr, a, summary);
}


/** The funnel adds ONE plan line (e.g. "Plan semanal Exclusivo", variant "4 semanas") with the chosen dishes as a line property:
 *  Platillos: "2× Filete Prime con verduras asadas | 3× Bowl de res magra y quinoa"  (quantities are PER WEEK). */
function dishRowsOf_(line) {
  var props = line.properties || [], out = [];
  props.forEach(function (p) {
    if (!/^_?(platillos|dishes)$/i.test(String(p.name || ''))) return;
    String(p.value || '').split('|').forEach(function (part) {
      var m = part.trim().match(/^(\d+)\s*[×x]\s*(.+)$/);
      if (m) out.push({ title: m[2].trim(), qty: Number(m[1]) });
    });
  });
  return out;
}
function expandDishes_(items) {
  var rows = [];
  items.forEach(function (i) { dishRowsOf_(i).forEach(function (d) { d.planLabel = String(i.variant_title || ''); rows.push(d); }); });
  return rows;
}

function orderExists_(id) {
  var sh = sheet_('Pedidos'), last = sh.getLastRow();
  if (last < 2) return false;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return true;
  return false;
}

/**
 * E-mail alert for every NEW order. Script property ALERT_EMAILS = one or more addresses separated by commas
 * (e.g. equipo@kulinariamx.com). Without the property nothing is sent. Free Google accounts can send about 100 e-mails a day.
 * A failure to send never blocks saving the order.
 */
function alertNewOrder_(o, name, email, addr, a, summary) {
  try {
    var plan = (a.plan === 'block' || /4 semanas/.test(summary)) ? 'Plan de 4 semanas (20 comidas)' : 'Plan de 1 semana (5 comidas)';
    var to = PropertiesService.getScriptProperties().getProperty('ALERT_EMAILS');
    if (to) {
      var body = ['Nuevo pedido ' + o.name, '', 'Cliente: ' + name, 'Correo: ' + email, 'Teléfono: ' + ((o.customer && o.customer.phone) || a.telefono || ''), 'Dirección: ' + addr, '',
        'Plan: ' + plan, 'Total: $' + o.total_price + ' ' + o.currency, 'Platillos: ' + summary, 'Días: ' + (a.dias || '-'), '',
        'ALERGIAS: ' + (a.alergias || 'ninguna declarada'), (a.alerta_alergias ? 'ATENCIÓN: eligió platillos que PUEDEN contener sus alergias: ' + a.alerta_alergias : ''), 'No le gustan: ' + (a.no_me_gustan || '-'), 'Dietas: ' + (a.dietas || '-'), '', 'Panel: abre /pages/admin en tu sitio.'].join('\n');
      MailApp.sendEmail(to, 'Nuevo pedido ' + o.name + ' · ' + name, body);
    }
  } catch (err) { /* never block the order */ }
  try { whatsappAlert_(o, name, a, summary); } catch (err2) { /* never block the order */ }
}

/** WhatsApp alert to the owner (WhatsApp Business Cloud API from Meta). Script properties: WHATSAPP_TOKEN (permanent token), WHATSAPP_PHONE_ID (sender number id), WHATSAPP_TO (owner number, digits with country code, e.g. 5219991234567).
 *  Optional WHATSAPP_TEMPLATE (default "nuevo_pedido", language es_MX): an approved template with 4 body variables {{1}} order, {{2}} client, {{3}} total, {{4}} dishes.
 *  WHATSAPP_MODE=text sends a free-text message instead (only delivered if the owner wrote to that number in the last 24 h). Without the properties nothing is sent. */
function whatsappAlert_(o, name, a, summary) {
  var pr = PropertiesService.getScriptProperties(), tok = pr.getProperty('WHATSAPP_TOKEN'), pid = pr.getProperty('WHATSAPP_PHONE_ID'), to = String(pr.getProperty('WHATSAPP_TO') || '').replace(/\D/g, '');
  if (!tok || !pid || !to) return false;
  var short = String(summary || '').replace(/\s+/g, ' ').slice(0, 280), total = '$' + o.total_price + ' ' + o.currency, alert = a && a.alerta_alergias ? ' · ALERGIA: ' + a.alerta_alergias : '';
  var payload = pr.getProperty('WHATSAPP_MODE') === 'text'
    ? { messaging_product: 'whatsapp', to: to, type: 'text', text: { body: 'Nuevo pedido ' + o.name + ' · ' + name + ' · ' + total + '\n' + short + alert } }
    : { messaging_product: 'whatsapp', to: to, type: 'template', template: { name: pr.getProperty('WHATSAPP_TEMPLATE') || 'nuevo_pedido', language: { code: 'es_MX' }, components: [{ type: 'body', parameters: [o.name, name, total, short + alert].map(function (t) { return { type: 'text', text: String(t || '-') }; }) }] } };
  var res = UrlFetchApp.fetch('https://graph.facebook.com/v20.0/' + pid + '/messages', { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + tok }, payload: JSON.stringify(payload), muteHttpExceptions: true });
  return res.getResponseCode() < 300;
}


/* ---------- customer profile (asked once at onboarding) ----------
 * The theme sends the Shopify customer id plus a token = HMAC-SHA256(customer id, PROFILE_SECRET) computed by Shopify's Liquid on the server,
 * so only the logged-in customer can read/write their own row. Script property PROFILE_SECRET must equal the Shopify shop metafield kulinaria.profile_secret. */
function profileTokenOk_(cid, token) {
  var secret = PropertiesService.getScriptProperties().getProperty('PROFILE_SECRET');
  if (!secret || !cid || !token) return false;
  var hex = Utilities.computeHmacSha256Signature(String(cid), secret).map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  return hex === String(token).toLowerCase();
}
function profileSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName('Perfiles');
  if (!sh) { sh = ss.insertSheet('Perfiles'); sh.getRange(1, 1, 1, 4).setValues([['ID Cliente', 'Actualizado', 'Correo', 'Perfil (JSON)']]).setFontWeight('bold'); }
  return sh;
}
function profileGet_(cid, token) {
  if (!profileTokenOk_(cid, token)) return { ok: false, error: 'forbidden' };
  var sh = profileSheet_(), last = sh.getLastRow();
  for (var r = 2; r <= last; r++) if (String(sh.getRange(r, 1).getValue()) === String(cid)) { try { return { ok: true, profile: JSON.parse(sh.getRange(r, 4).getValue()) }; } catch (e) { return { ok: true, profile: null }; } }
  return { ok: true, profile: null };
}
function profileSet_(cid, token, profile) {
  if (!profileTokenOk_(cid, token)) return { ok: false, error: 'forbidden' };
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = profileSheet_(), last = sh.getLastRow(), row = 0, email = (profile && profile.info && profile.info.email) || '';
    for (var r = 2; r <= last; r++) if (String(sh.getRange(r, 1).getValue()) === String(cid)) { row = r; break; }
    if (!row) row = last + 1;
    sh.getRange(row, 1, 1, 4).setValues([[String(cid), new Date(), email, JSON.stringify(profile || {})]]);
    return { ok: true };
  } finally { lock.releaseLock(); }
}


/* ---------- plan, credits and weekly choices ("Mi semana") ----------
 * A plan covers 1 or 4 delivery weeks and up to 5 meals a week (one per weekday). Days left empty are NOT delivered; a whole week can be skipped.
 * Week 1 is what came with the order (property "dias"). Weeks 2-4 are chosen by the client in "Mi semana" (tab Selecciones):
 *   Confirmada = saved, nothing to pay · Pendiente de pago = a higher-tier upgrade is in the cart · Pagada = the order webhook saw the upgrade line.
 * A week with no row repeats the last non-empty choice (the contract's automatic Saturday selection); a saved EMPTY week stays empty (skipped).
 * Only a customer with a paid plan that covers that week can save a choice (checked here, not only in the page). */
var DAYS_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
function weekStr_(v) { return v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(v || ''); }
function mondayStr_(now) { now = now || new Date(); var back = (now.getDay() + 6) % 7; return ymd_(new Date(now.getFullYear(), now.getMonth(), now.getDate() - back)); }
function countItems_(slots) {
  var counts = {}, order = [];
  (slots || []).forEach(function (cell) { String(cell || '').split(' + ').forEach(function (t) { t = t.trim(); if (!t) return; if (!(t in counts)) { counts[t] = 0; order.push(t); } counts[t]++; }); });   // a day can hold two plates: "Plato A + Plato B" counts as two dishes
  return order.map(function (t) { return { title: t, qty: counts[t] }; });
}
function padSlots_(arr) { var out = []; for (var i = 0; i < 5; i++) out.push(String((arr || [])[i] || '').trim().slice(0, 260)); return out; }
function parseSlots_(diasAttr, dishRows) {
  var slots = ['', '', '', '', ''], parts = String(diasAttr || '').split('|');
  if (diasAttr && parts.length >= 5) {
    for (var i = 0; i < 5; i++) { var part = parts[i] || '', k = part.indexOf(':'); slots[i] = k > -1 ? part.slice(k + 1).trim() : ''; }
    if (slots.some(Boolean)) return slots;
  }
  var list = []; (dishRows || []).forEach(function (d) { for (var j = 0; j < d.qty; j++) list.push(d.title); });
  return padSlots_(list);
}
function slotsFromSummary_(summary) {
  var rows = []; String(summary || '').split(' [')[0].split('|').forEach(function (part) { var m = part.trim().match(/^(\d+)\s*[×x]\s*(.+)$/); if (m) rows.push({ title: m[2].trim(), qty: Number(m[1]) }); });
  return parseSlots_('', rows);
}
function loadOrders_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Pedidos'); if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 23).getValues().map(function (r) {
    var slots = []; try { slots = JSON.parse(r[20] || '[]'); } catch (e) {}
    slots = slots.length ? padSlots_(slots) : slotsFromSummary_(r[18]);
    var pl = String(r[10] || '').toLowerCase();
    return { id: String(r[0]), name: String(r[1]), date: r[2], customer: String(r[3]), email: String(r[4] || '').toLowerCase(), phone: String(r[5] || ''), total: Number(r[6]) || 0, currency: String(r[7]),
      paid: String(r[8]).toLowerCase() === 'paid', isPlan: pl !== '', block: pl === 'block' || /bloque|4/.test(pl), address: String(r[15] || ''), allergies: String(r[13] || ''), dislikes: String(r[14] || ''), slots: slots, cid: String(r[21] || ''), para: String(r[22] || ''), notes: String(r[23] || ''), summary: String(r[18] || '') };
  });
}
function loadSelections_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Selecciones'), out = {}; if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 9).getValues().forEach(function (r) {
    if (!/confirmada|pagada/i.test(String(r[6]))) return;
    var slots = []; try { slots = JSON.parse(r[8] || '[]'); } catch (e) {}
    if (!slots.length) { var items = []; try { items = JSON.parse(r[3] || '[]'); } catch (e2) {} var flat = []; items.forEach(function (i) { for (var j = 0; j < (Number(i.qty) || 1); j++) flat.push(i.title); }); slots = flat; }
    var row = { slots: padSlots_(slots) }, w = weekStr_(r[2]);
    if (r[0]) out[String(r[0]) + '|' + w] = row;
    if (r[1]) out['e:' + String(r[1]).toLowerCase() + '|' + w] = row;
  });
  return out;
}
/** what goes in the box for every delivery week of one order. Paused weeks are skipped, so the plan simply ends later (out.paused = skipped Mondays, out.unplaced = plan weeks still waiting for a Monday because of an open pause) */
function resolveOrderWeeks_(o, sel, pz) {
  pz = pz || loadPauses_();
  var isPaused = pausedFn_(pz, o.cid, o.email), n = o.block ? 4 : 1, out = [], last = o.slots.slice(), d = firstMonday_(o.date), i = 0, guard = 0, skipped = [];
  while (i < n && guard++ < 80) {
    var w = ymd_(d), slots, src; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
    if (isPaused(w)) { skipped.push(w); continue; }
    if (i === 0) { slots = o.slots.slice(); src = 'pedido'; }
    else {
      var row = !o.para && ((o.cid && sel[o.cid + '|' + w]) || sel['e:' + o.email + '|' + w]);
      if (row) { slots = row.slots.slice(); src = slots.some(Boolean) ? 'elegida' : 'saltada'; }
      else { slots = last.slice(); src = 'automática'; }
    }
    if (slots.some(Boolean) && src !== 'automática') last = slots.slice();
    out.push({ week: w, idx: i, slots: slots, src: src, items: countItems_(slots) });
    i++;
  }
  out.paused = skipped; out.unplaced = n - i;
  return out;
}
/* ---------- pauses: a paused Monday is not delivered and is not consumed, the plan ends one week later ---------- */
function pauseSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName('Pausas');
  if (!sh) { sh = ss.insertSheet('Pausas'); sh.getRange(1, 1, 1, 5).setValues([['ID Cliente', 'Correo', 'Semana (lunes)', 'Tipo', 'Actualizado']]).setFontWeight('bold').setBackground('#1B2316').setFontColor('#FFFFFF'); sh.getRange('C:C').setNumberFormat('@'); sh.setFrozenRows(1); }
  return sh;
}
/** { 'cid': {weeks:{monday:1}, from:'monday or empty'}, 'e:mail': … } ; Tipo "Semana" = one paused Monday, "Desde" = every Monday from that one until the client resumes */
function loadPauses_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Pausas'), out = {}; if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(function (r) {
    var w = weekStr_(r[2]); if (!w) return;
    [String(r[0] || ''), r[1] ? 'e:' + String(r[1]).toLowerCase() : ''].forEach(function (k) {
      if (!k) return; var e = out[k] = out[k] || { weeks: {}, from: '' };
      if (String(r[3]) === 'Desde') { if (!e.from || w < e.from) e.from = w; } else e.weeks[w] = 1;
    });
  });
  return out;
}
function pausedFn_(pz, cid, email) {
  var a = (cid && pz[String(cid)]) || null, b = (email && pz['e:' + String(email).toLowerCase()]) || null;
  return function (w) { return [a, b].some(function (e) { return e && (e.weeks[w] || (e.from && w >= e.from)); }); };
}
/** modes: weeks (p.weeks = Mondays to pause), from (pause p.week and every week after it), resume (p.week = first week that is delivered again) */
function pauseSet_(cid, token, p) {
  if (!profileTokenOk_(cid, token)) return { ok: false, error: 'forbidden' };
  var now = p.now ? new Date(p.now) : new Date(), allowed = allowedMonday_(now), mode = String(p.mode || 'weeks');
  var isMon = function (w) { return /^\d{4}-\d{2}-\d{2}$/.test(w) && new Date(w + 'T12:00:00').getDay() === 1; };
  var weeks = (mode === 'weeks' ? (p.weeks || []) : [p.week]).map(String);
  if (!weeks.length || weeks.length > 12 || !weeks.every(isMon)) return { ok: false, error: 'bad week' };
  if (weeks.some(function (w) { return w < allowed; })) return { ok: false, error: 'closed' };
  var cr = creditsFor_(cid, now); if (!cr.hasPlan) return { ok: false, error: 'no_plan' };
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = pauseSheet_(), email = emailOfCid_(cid) || String(p.email || '').toLowerCase(), last = sh.getLastRow(), rows = last > 1 ? sh.getRange(2, 1, last - 1, 5).getValues() : [];
    var keep = rows.filter(function (r) { return String(r[0]) !== String(cid); }), mine = rows.filter(function (r) { return String(r[0]) === String(cid); }).map(function (r) { return [r[0], r[1], weekStr_(r[2]), String(r[3]), r[4]]; });
    var stamp = new Date(), add = function (w, t) { mine.push([String(cid), email, w, t, stamp]); };
    if (mode === 'weeks') weeks.forEach(function (w) { if (!mine.some(function (r) { return r[2] === w && r[3] === 'Semana'; })) add(w, 'Semana'); });
    else if (mode === 'from') { mine = mine.filter(function (r) { return r[3] !== 'Desde'; }); add(weeks[0], 'Desde'); }
    else if (mode === 'resume') {
      var w0 = weeks[0], out = [];
      mine.forEach(function (r) {
        if (r[3] === 'Desde') {                                           // an open pause becomes the explicit weeks before the resume date
          var d = new Date(r[2] + 'T12:00:00'), n = 0;
          while (ymd_(d) < w0 && n++ < 60) { out.push([r[0], r[1], ymd_(d), 'Semana', r[4]]); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7); }
        } else if (r[2] < w0) out.push(r);
      });
      mine = out;
    } else return { ok: false, error: 'bad mode' };
    var all = keep.map(function (r) { return [r[0], r[1], weekStr_(r[2]), String(r[3]), r[4]]; }).concat(mine);
    if (last > 1) sh.getRange(2, 1, last - 1, 5).clearContent();
    if (all.length) { sh.getRange(2, 3, all.length, 1).setNumberFormat('@'); sh.getRange(2, 1, all.length, 5).setValues(all); }
    try { rebuildDeliveries_(now); } catch (err) { /* reports must never block a pause */ }
    var res = creditsFor_(cid, now); res.ok = true; return res;
  } finally { lock.releaseLock(); }
}
function emailOfCid_(cid) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), a = ss.getSheetByName('Clientes'), b = ss.getSheetByName('Perfiles'), i, v;
  if (a && a.getLastRow() > 1) { v = a.getRange(2, 1, a.getLastRow() - 1, 6).getValues(); for (i = 0; i < v.length; i++) if (String(v[i][0]) === String(cid) && v[i][5]) return String(v[i][5]).toLowerCase(); }
  if (b && b.getLastRow() > 1) { v = b.getRange(2, 1, b.getLastRow() - 1, 3).getValues(); for (i = 0; i < v.length; i++) if (String(v[i][0]) === String(cid) && v[i][2]) return String(v[i][2]).toLowerCase(); }
  return '';
}
function ordersOfCustomer_(cid) {
  var email = emailOfCid_(cid);
  return loadOrders_().filter(function (o) { return o.isPlan && (o.cid ? o.cid === String(cid) : (email && o.email === email)); });
}
/** the plan state of one customer: weeks left, meals planned, which weeks can still be chosen */
function creditsFor_(cid, now) {
  now = now || new Date();
  var sel = loadSelections_(), pz = loadPauses_(), todayMon = mondayStr_(now), allowed = allowedMonday_(now), editable = {}, left = 0, total = 0, planned = 0, ends = '', had = false, kinds = {}, open = false;
  var paidRows = ordersOfCustomer_(cid).filter(function (o) { return o.paid; }), selfRows = paidRows.filter(function (o) { return !o.para; });
  (selfRows.length ? selfRows : paidRows).forEach(function (o) {
    had = true;
    var wk = resolveOrderWeeks_(o, sel, pz), live = wk.filter(function (w) { return w.week >= todayMon; });
    if (!live.length && !wk.unplaced) return;
    kinds[o.block ? 'block' : 'week'] = 1; total += wk.length + wk.unplaced; left += live.length + wk.unplaced;
    wk.forEach(function (w) { planned += w.items.reduce(function (a, i) { return a + i.qty; }, 0); if (w.week >= allowed && w.idx >= 1 && !o.para) editable[w.week] = 1; });
    if (wk.unplaced) open = true; else if (wk[wk.length - 1].week > ends) ends = wk[wk.length - 1].week;
  });
  var mine = pz[String(cid)] || { weeks: {}, from: '' }, paused = Object.keys(mine.weeks).filter(function (w) { return w >= allowed; }).sort(), pausedFrom = mine.from && (mine.from >= allowed ? mine.from : allowed) || '';
  return { ok: true, hasPlan: left > 0, expired: had && left === 0, plan: kinds.block ? 'block' : (kinds.week ? 'week' : ''), weeksLeft: left, weeksTotal: total, mealsPlanned: planned, mealsMax: total * 5, endsOn: open ? '' : ends, paused: paused, pausedFrom: pausedFrom, nextOpen: allowed, editable: Object.keys(editable).sort() };
}
function creditsGet_(cid, token) {
  if (!profileTokenOk_(cid, token)) return { ok: false, error: 'forbidden' };
  return creditsFor_(cid);
}
function weekSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName('Selecciones');
  if (!sh) { sh = ss.insertSheet('Selecciones'); sh.getRange(1, 1, 1, 9).setValues([['ID Cliente', 'Correo', 'Semana (lunes)', 'Platillos (JSON)', 'Resumen', 'Mejora ($)', 'Estado', 'Actualizado', 'Días (JSON)']]).setFontWeight('bold'); sh.getRange('C:C').setNumberFormat('@'); }
  return sh;
}
function weekRow_(sh, cid, week) {
  var last = sh.getLastRow(); if (last < 2) return 0;
  var v = sh.getRange(2, 1, last - 1, 3).getValues();
  for (var i = 0; i < v.length; i++) if (String(v[i][0]) === String(cid) && weekStr_(v[i][2]) === String(week)) return i + 2;
  return 0;
}
function weekGet_(cid, token, week) {
  if (!profileTokenOk_(cid, token)) return { ok: false, error: 'forbidden' };
  var sh = weekSheet_(), row = weekRow_(sh, cid, week), last = sh.getLastRow();
  var slotsOf = function (r) { var s = []; try { s = JSON.parse(r[8] || '[]'); } catch (e) {} if (!s.length) { var it = []; try { it = JSON.parse(r[3] || '[]'); } catch (e2) {} it.forEach(function (i) { for (var j = 0; j < (Number(i.qty) || 1); j++) s.push(i.title); }); } return padSlots_(s); };
  if (row) { var r = sh.getRange(row, 1, 1, 9).getValues()[0]; return { ok: true, selection: { week: week, status: String(r[6]), upgrade: Number(r[5]) || 0, slots: slotsOf(r), items: countItems_(slotsOf(r)) } }; }
  var prevRow = null, prevWeek = '';
  if (last > 1) sh.getRange(2, 1, last - 1, 9).getValues().forEach(function (x) { var w = weekStr_(x[2]); if (String(x[0]) === String(cid) && w < week && w > prevWeek && slotsOf(x).some(Boolean)) { prevWeek = w; prevRow = x; } });
  return { ok: true, selection: null, previous: prevRow ? { week: prevWeek, slots: slotsOf(prevRow), items: countItems_(slotsOf(prevRow)) } : null };
}
function weekSet_(cid, token, p) {
  if (!profileTokenOk_(cid, token)) return { ok: false, error: 'forbidden' };
  var week = String(p.week || ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || new Date(week + 'T12:00:00').getDay() !== 1) return { ok: false, error: 'bad week' };
  var now = p.now ? new Date(p.now) : new Date();
  if (week < allowedMonday_(now)) return { ok: false, error: 'closed' };
  var cr = creditsFor_(cid, now);
  if (!cr.hasPlan) return { ok: false, error: 'no_plan' };
  if (cr.editable.indexOf(week) < 0) return { ok: false, error: 'not_covered' };
  var slots = padSlots_(p.days), items = countItems_(slots);
  var summary = items.map(function (i) { return i.qty + '× ' + i.title; }).join(' | ') || '(semana sin comidas)';
  var up = Math.max(0, Number(p.upgrade) || 0), status = up > 0 ? 'Pendiente de pago' : 'Confirmada';
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = weekSheet_(), row = weekRow_(sh, cid, week) || sh.getLastRow() + 1;
    sh.getRange(row, 3).setNumberFormat('@');
    sh.getRange(row, 1, 1, 9).setValues([[String(cid), emailOfCid_(cid) || String(p.email || '').toLowerCase(), week, JSON.stringify(items), summary, up, status, new Date(), JSON.stringify(slots)]]);
    try { rebuildDeliveries_(now); } catch (err) { /* reports must never block a choice */ }
    return { ok: true, status: status, meals: items.reduce(function (a, i) { return a + i.qty; }, 0) };
  } finally { lock.releaseLock(); }
}
/** called from the order webhook for lines that carry the hidden property _semana (an upgrade paid for that week) */
function weekMarkPaid_(cid, week) {
  if (!cid || !week) return;
  var sh = weekSheet_(), row = weekRow_(sh, cid, week);
  if (row) sh.getRange(row, 7).setValue('Pagada');
  try { rebuildDeliveries_(); } catch (err) {}
}

/* ---------- report tabs: Entregas (who gets what, which days) and Resumen (totals) ---------- */
function writeBlock_(sh, startRow, rows) {
  if (!rows.length) return startRow;
  var w = 0; rows.forEach(function (r) { if (r.length > w) w = r.length; });
  var padded = rows.map(function (r) { var c = r.slice(); while (c.length < w) c.push(''); return c; });
  sh.getRange(startRow, 1, padded.length, w).setValues(padded);
  return startRow + padded.length;
}
function reportSheet_(name) { var ss = SpreadsheetApp.getActiveSpreadsheet(); return ss.getSheetByName(name) || ss.insertSheet(name); }
function rebuildDeliveries_(now) {
  now = now || new Date();
  var sel = loadSelections_(), pz = loadPauses_(), todayMon = mondayStr_(now), nextMon = allowedMonday_(now), horizon = ymd_(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7 * 6));
  var rows = [], weeks = {}, dishWeek = {}, active = {}, weeksLeft = 0, pausedBy = {};
  loadOrders_().filter(function (o) { return o.paid && o.isPlan; }).forEach(function (o) {
    var rw = resolveOrderWeeks_(o, sel, pz); rw.paused.forEach(function (w) { if (w >= todayMon && w <= horizon) { (pausedBy[w] = pausedBy[w] || {})[o.cid || o.email] = 1; } });
    rw.forEach(function (w) {
      if (w.week < todayMon || w.week > horizon) return;
      var days = []; w.slots.forEach(function (t, i) { if (t) days.push(DAYS_ES[i]); });
      rows.push([w.week, o.para ? o.para + ' (' + o.customer + ')' : o.customer, o.phone, o.address, w.slots[0], w.slots[1], w.slots[2], w.slots[3], w.slots[4], days.join(', ') || '— sin entregas —', days.length, o.allergies || '', w.src, o.name]);
      var wk = weeks[w.week] = weeks[w.week] || { customers: 0, meals: 0, skipped: 0, auto: 0, perDay: [0, 0, 0, 0, 0] };
      wk.customers++; if (w.src === 'saltada') wk.skipped++; if (w.src === 'automática') wk.auto++;
      w.slots.forEach(function (t, i) { if (!t) return; wk.meals++; wk.perDay[i]++; var d = dishWeek[w.week] = dishWeek[w.week] || {}; (d[t] = d[t] || [0, 0, 0, 0, 0])[i]++; });
      if (w.week >= todayMon) { active[o.cid || o.email] = 1; weeksLeft++; }
    });
  });
  rows.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : String(a[1]).localeCompare(String(b[1])); });
  // Entregas
  var en = reportSheet_('Entregas'); en.clearContents();
  var head = ['Semana (lunes)', 'Cliente', 'Teléfono', 'Dirección', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Días con entrega', 'Comidas', 'Alergias', 'Origen', 'Pedido'];
  writeBlock_(en, 1, [head].concat(rows.map(function (r) { var c = r.slice(); c[10] = [r[4], r[5], r[6], r[7], r[8]].filter(Boolean).length; return c; })));
  en.getRange(1, 1, 1, head.length).setFontWeight('bold').setBackground('#1B2316').setFontColor('#FFFFFF'); en.setFrozenRows(1);
  if (rows.length) en.getRange(2, 2, rows.length, 1).setFontWeight('bold');   // client name in bold
  // Resumen
  var rs = reportSheet_('Resumen'); rs.clearContents(); var r0 = 1;
  var block = function (title, week) {
    var wk = weeks[week] || { customers: 0, meals: 0, skipped: 0, auto: 0, perDay: [0, 0, 0, 0, 0] };
    var out = [[title + ' · lunes ' + week], ['Día', 'Entregas (clientes)', 'Comidas'], ];
    for (var i = 0; i < 5; i++) out.push([DAYS_ES[i], wk.perDay[i], wk.perDay[i]]);
    out.push(['Total de comidas', '', wk.meals], ['Clientes con plan esta semana', wk.customers], ['Clientes en pausa esta semana', Object.keys(pausedBy[week] || {}).length], ['Semanas saltadas', wk.skipped], ['Elección automática (no eligieron)', wk.auto], [], ['Platillo', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Total']);
    var d = dishWeek[week] || {};
    Object.keys(d).sort(function (a, b) { var s = function (k) { return d[k].reduce(function (x, y) { return x + y; }, 0); }; return s(b) - s(a); }).forEach(function (t) { out.push([t].concat(d[t], [d[t].reduce(function (x, y) { return x + y; }, 0)])); });
    out.push([]);
    return out;
  };
  var allOrders = loadOrders_(), paidOrders = allOrders.filter(function (o) { return o.paid; }), revenue = paidOrders.reduce(function (a, o) { return a + o.total; }, 0), custs = {};
  allOrders.forEach(function (o) { custs[o.cid || o.email || o.id] = 1; });
  var totals = [['Totales generales'], ['Pedidos registrados', distinct_(allOrders)], ['Pedidos pagados', distinct_(paidOrders)], ['Pedidos pendientes de pago', distinct_(allOrders) - distinct_(paidOrders)], ['Ventas pagadas (MXN)', revenue], ['Ticket promedio (MXN)', distinct_(paidOrders) ? Math.round(revenue / distinct_(paidOrders)) : 0], ['Gastos registrados (MXN)', loadExpenses_().reduce(function (a, x) { return a + x.amount; }, 0)], ['Utilidad = ventas − gastos (MXN)', revenue - loadExpenses_().reduce(function (a, x) { return a + x.amount; }, 0)], ['Clientes con pedidos', Object.keys(custs).length], []];
  r0 = writeBlock_(rs, r0, totals);
  r0 = writeBlock_(rs, r0, block('Esta semana', todayMon));
  if (nextMon !== todayMon) r0 = writeBlock_(rs, r0, block('Próxima semana', nextMon));
  var all = [['Todas las semanas'], ['Semana (lunes)', 'Clientes', 'Comidas', 'Saltadas', 'Automáticas']];
  Object.keys(weeks).sort().forEach(function (w) { all.push([w, weeks[w].customers, weeks[w].meals, weeks[w].skipped, weeks[w].auto]); });
  all.push([], ['Planes activos (clientes)', Object.keys(active).length], ['Semanas de entrega por cumplir', weeksLeft]);
  writeBlock_(rs, r0, all);
  rs.getRange('A1').setFontWeight('bold');
}
/** run by hand or by the daily trigger: rebuilds Entregas and Resumen */
function refreshDeliveries() { rebuildDeliveries_(); return 'Entregas y Resumen actualizados.'; }

/* ---------- weekly reminder: "choose your next 5 meals" ----------
 * Run installWeeklyReminders() once. Every Thursday and Friday (09:00) it e-mails each client with an active 4-week plan whose NEXT delivery week
 * (weeks 2-4) has no row in "Selecciones". Script property SITE_URL (default https://kulinariamx.com). Free Google accounts send ~100 e-mails/day.
 * Without a choice the previous week repeats (automatic Saturday selection), so the reminder is a nudge, not a requirement. */
function installWeeklyReminders() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sendWeeklyReminders') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sendWeeklyReminders').timeBased().everyDays(1).atHour(9).create();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'refreshDeliveries') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('refreshDeliveries').timeBased().everyDays(1).atHour(5).create();
  return 'Listo: recordatorios jueves y viernes a las 9:00 y reporte de entregas cada día a las 5:00.';
}
function pad2_(n) { return (n < 10 ? '0' : '') + n; }
function ymd_(d) { return d.getFullYear() + '-' + pad2_(d.getMonth() + 1) + '-' + pad2_(d.getDate()); }
/** the Monday a given order starts: Saturday 10:00 is the cut-off, the first delivery is the Monday after that Saturday */
function firstMonday_(orderDate, cutoffHour) {
  var d = new Date(orderDate), h = cutoffHour == null ? 10 : cutoffHour;
  var s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, 0, 0, 0);
  while (s.getDay() !== 6 || s.getTime() < d.getTime()) s = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1, h, 0, 0, 0);
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 2);
}
function sendWeeklyReminders(now) {
  now = now || new Date();
  var dow = now.getDay(); if (dow !== 4 && dow !== 5) return 'Hoy no toca recordatorio.';
  var daysToMon = ((1 - dow + 7) % 7) || 7, next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToMon), nextStr = ymd_(next);
  var ss = SpreadsheetApp.getActiveSpreadsheet(), pe = ss.getSheetByName('Pedidos'); if (!pe || pe.getLastRow() < 2) return 'Sin pedidos.';
  var orders = pe.getRange(2, 1, pe.getLastRow() - 1, 11).getValues();
  var sel = {}, sh = ss.getSheetByName('Selecciones');
  if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach(function (r) { sel[String(r[1]).toLowerCase() + '|' + weekStr_(r[2])] = 1; });
  var pz = loadPauses_(), site = PropertiesService.getScriptProperties().getProperty('SITE_URL') || 'https://kulinariamx.com', sent = {}, n = 0;
  orders.forEach(function (r) {
    var email = String(r[4] || '').toLowerCase(), plan = String(r[10] || '').toLowerCase();
    if (!email || sent[email] || !(plan === 'block' || /4/.test(plan))) return;
    var first = firstMonday_(r[2]), idx = Math.round((next.getTime() - first.getTime()) / (7 * 86400000));
    if (idx < 1 || idx > 3) return;                               // only weeks 2-4 of a 4-week plan need a new choice
    if (sel[email + '|' + nextStr] || pausedFn_(pz, '', email)(nextStr)) return;
    var name = String(r[3] || '').split(' ')[0] || '';
    var body = ['Hola ' + name + ',', '', 'Tu plan de Kulinaria sigue activo. Elige tus comidas de la semana del ' + nextStr + ' (hasta 5, puedes dejar días vacíos) antes del sábado a las 10:00:', site + '/pages/cuenta-semana', '',
      'Si no eliges, repetimos tu selección anterior. Si subes un platillo de nivel, solo pagas la diferencia.'].concat(idx === 3 ? ['', 'Esta es la última semana de tu plan. Para seguir, elige un nuevo plan: ' + site + '/pages/pedido'] : []).concat(['', 'Kulinaria MX · Arte del fuego']).join('\n');
    try { MailApp.sendEmail(email, 'Elige tus comidas de la próxima semana · Kulinaria', body); sent[email] = 1; n++; } catch (err) { /* keep going */ }
  });
  return 'Recordatorios enviados: ' + n;
}

/** the first Monday a client can still choose: orders close Saturday 10:00 (script time zone = Mexico). Sunday and Saturday after 10:00 roll to the following Monday. */
function allowedMonday_(now) {
  now = now || new Date();
  var dow = now.getDay(), mins = now.getHours() * 60 + now.getMinutes(), d = ((1 - dow + 7) % 7) || 7;
  if (dow === 0 || (dow === 6 && mins >= 10 * 60)) d += 7;
  return ymd_(new Date(now.getFullYear(), now.getMonth(), now.getDate() + d));
}


/* ---------- discount codes (admin page) ----------
 * The admin generates a code on /pages/admin ("Descuentos"): percent or fixed amount, and how many times it can be used in total.
 * Shopify counts the uses and stops accepting it afterwards. Needs two script properties: SHOPIFY_STORE (xxxx.myshopify.com) and SHOPIFY_TOKEN
 * (Admin API access token with the scopes read_discounts + write_discounts) OR, for apps made in the Shopify Dev Dashboard, SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET; and the ADMIN_KEY password. */
/** Admin API token: either a fixed SHOPIFY_TOKEN (old custom apps) or SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET of an app made in the Dev Dashboard (the token is requested and cached ~23 h) */
function shopifyToken_(store) {
  var pr = PropertiesService.getScriptProperties(), fixed = pr.getProperty('SHOPIFY_TOKEN'); if (fixed) return fixed;
  var id = pr.getProperty('SHOPIFY_CLIENT_ID'), secret = pr.getProperty('SHOPIFY_CLIENT_SECRET'); if (!id || !secret) return '';
  var cache = CacheService.getScriptCache(), hit = cache.get('shopify_token'); if (hit) return hit;
  var res = UrlFetchApp.fetch('https://' + store + '/admin/oauth/access_token', { method: 'post', contentType: 'application/x-www-form-urlencoded', payload: { grant_type: 'client_credentials', client_id: id, client_secret: secret }, muteHttpExceptions: true });
  var body; try { body = JSON.parse(res.getContentText()); } catch (e) { return ''; }
  if (!body || !body.access_token) return '';
  cache.put('shopify_token', body.access_token, 82800);
  return body.access_token;
}
function shopifyGql_(query, variables) {
  var pr = PropertiesService.getScriptProperties(), store = pr.getProperty('SHOPIFY_STORE'), tok = store ? shopifyToken_(store) : '';
  if (!store || !tok) return { error: 'no_token' };
  var res = UrlFetchApp.fetch('https://' + store + '/admin/api/2025-01/graphql.json', { method: 'post', contentType: 'application/json', headers: { 'X-Shopify-Access-Token': tok }, payload: JSON.stringify({ query: query, variables: variables || {} }), muteHttpExceptions: true });
  var body; try { body = JSON.parse(res.getContentText()); } catch (e) { return { error: 'bad_response' }; }
  if (res.getResponseCode() >= 400 || body.errors) return { error: 'shopify', detail: JSON.stringify(body.errors || body).slice(0, 300) };
  return { data: body.data };
}
function discountApi_(p) {
  var key = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!key || p.key !== key) return { ok: false, error: 'forbidden' };
  var act = String(p.action), r;
  if (act === 'discounts') {
    r = shopifyGql_('{ discountNodes(first: 50, reverse: true, query: "method:code") { nodes { id discount { __typename ... on DiscountCodeBasic { title status usageLimit asyncUsageCount startsAt endsAt codes(first: 1) { nodes { code } } customerGets { value { __typename ... on DiscountPercentage { percentage } ... on DiscountAmount { amount { amount } } } } } } } } }');
    if (r.error) return { ok: false, error: r.error, detail: r.detail };
    var list = r.data.discountNodes.nodes.filter(function (n) { return n.discount && n.discount.__typename === 'DiscountCodeBasic'; }).map(function (n) {
      var d = n.discount, v = d.customerGets && d.customerGets.value || {};
      return { id: n.id, code: d.codes.nodes[0] ? d.codes.nodes[0].code : d.title, status: d.status, uses: d.asyncUsageCount || 0, limit: d.usageLimit || 0, ends: d.endsAt || '',
        kind: v.__typename === 'DiscountPercentage' ? 'percent' : 'amount', value: v.percentage != null ? Math.round(v.percentage * 10000) / 100 : Number(v.amount && v.amount.amount) || 0 };
    });
    return { ok: true, discounts: list };
  }
  if (act === 'discount_new') {
    var code = String(p.code || '').toUpperCase().trim(), kind = p.kind === 'amount' ? 'amount' : 'percent', value = Number(p.value), uses = Math.floor(Number(p.uses));
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return { ok: false, error: 'bad_code' };
    if (!(value > 0) || (kind === 'percent' && value > 100)) return { ok: false, error: 'bad_value' };
    if (!(uses >= 1 && uses <= 100000)) return { ok: false, error: 'bad_uses' };
    var ends = /^\d{4}-\d{2}-\d{2}$/.test(String(p.ends || '')) ? p.ends + 'T23:59:59-06:00' : null;
    var input = { title: code, code: code, startsAt: new Date().toISOString(), endsAt: ends, usageLimit: uses, appliesOncePerCustomer: p.once !== '0', customerSelection: { all: true },
      customerGets: { value: kind === 'percent' ? { percentage: value / 100 } : { discountAmount: { amount: value, appliesOnEachItem: false } }, items: { all: true } },
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true } };
    r = shopifyGql_('mutation($d: DiscountCodeBasicInput!) { discountCodeBasicCreate(basicCodeDiscount: $d) { codeDiscountNode { id } userErrors { field message } } }', { d: input });
    if (r.error) return { ok: false, error: r.error, detail: r.detail };
    var res = r.data.discountCodeBasicCreate;
    if (res.userErrors && res.userErrors.length) return { ok: false, error: 'shopify', detail: res.userErrors.map(function (u) { return u.message; }).join('; ') };
    return { ok: true, id: res.codeDiscountNode.id, code: code };
  }
  if (act === 'discount_off') {
    if (!/^gid:\/\/shopify\/DiscountCodeNode\/\d+$/.test(String(p.id || ''))) return { ok: false, error: 'bad_id' };
    r = shopifyGql_('mutation($id: ID!) { discountCodeDeactivate(id: $id) { userErrors { message } } }', { id: p.id });
    if (r.error) return { ok: false, error: r.error, detail: r.detail };
    var e = r.data.discountCodeDeactivate.userErrors; if (e && e.length) return { ok: false, error: 'shopify', detail: e[0].message };
    return { ok: true };
  }
  return { ok: false, error: 'unknown_action' };
}


/* ---------- finances: expenses ("Gastos" tab) and test orders, from the admin page (ADMIN_KEY) ---------- */
function expenseSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName('Gastos');
  if (!sh) { sh = ss.insertSheet('Gastos'); sh.getRange(1, 1, 1, 5).setValues([['Fecha', 'Concepto', 'Categoría', 'Monto (MXN)', 'ID']]).setFontWeight('bold').setBackground('#1B2316').setFontColor('#FFFFFF'); sh.setFrozenRows(1); sh.getRange('A:A').setNumberFormat('@'); }
  return sh;
}
function loadExpenses_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Gastos'); if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues().map(function (r) { return { date: weekStr_(r[0]), concept: String(r[1]), cat: String(r[2]), amount: Number(r[3]) || 0, id: String(r[4]) }; }).filter(function (x) { return x.id; });
}
function adminApi_(p) {
  var key = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!key || p.key !== key) return { ok: false, error: 'forbidden' };
  var act = String(p.action), lock = LockService.getScriptLock();
  if (act === 'expense_new') {
    var date = /^\d{4}-\d{2}-\d{2}$/.test(String(p.date || '')) ? String(p.date) : ymd_(new Date()), amount = Number(p.amount), concept = String(p.concept || '').trim().slice(0, 120), cat = String(p.cat || 'Otros').slice(0, 40);
    if (!concept) return { ok: false, error: 'bad_concept' };
    if (!(amount > 0)) return { ok: false, error: 'bad_amount' };
    lock.waitLock(20000);
    try { var sh = expenseSheet_(), row = sh.getLastRow() + 1, id = 'g' + new Date().getTime().toString(36); sh.getRange(row, 1).setNumberFormat('@'); sh.getRange(row, 1, 1, 5).setValues([[date, concept, cat, amount, id]]); } finally { lock.releaseLock(); }
    try { rebuildDeliveries_(); } catch (e) {}
    return { ok: true, expenses: loadExpenses_() };
  }
  if (act === 'expense_del') {
    lock.waitLock(20000);
    try { var sh2 = expenseSheet_(), last = sh2.getLastRow(); for (var r = last; r >= 2; r--) if (String(sh2.getRange(r, 5).getValue()) === String(p.id)) { sh2.deleteRow(r); break; } } finally { lock.releaseLock(); }
    try { rebuildDeliveries_(); } catch (e2) {}
    return { ok: true, expenses: loadExpenses_() };
  }
  if (act === 'lead_status') {
    var st = String(p.status || ''); if (!/^(Nueva|En proceso|Atendida)$/.test(st)) return { ok: false, error: 'bad_status' };
    lock.waitLock(20000);
    try { var shl = leadSheet_(), ll = shl.getLastRow(); for (var rr = ll; rr >= 2; rr--) if (String(shl.getRange(rr, 8).getValue()) === String(p.id)) { shl.getRange(rr, 7).setValue(st); break; } } finally { lock.releaseLock(); }
    return { ok: true, leads: loadLeads_() };
  }
  if (act === 'sample_order') {            // a fictitious paid order (family: the account holder 4-week plan + a 1-week plan for "Sofía" with an upgrade) to see every sheet and the admin page fill in
    var now = new Date(), id2 = 9000000 + Math.floor(Math.random() * 999999), dishA = 'Pollo a las hierbas con puré rústico', dishB = 'Bowl de res magra y quinoa', dishC = 'Salmón gourmet en costra de almendras', dishD = 'Crema de calabaza asada';
    var dias = 'Lunes: ' + dishA + ' | Martes: ' + dishB + ' | Miércoles: ' + dishA + ' | Jueves: | Viernes: ' + dishD, diasS = 'Lunes: ' + dishB + ' | Martes: | Miércoles: ' + dishC + ' | Jueves: | Viernes: ' + dishB;
    var order = { id: id2, name: '#PRUEBA-' + (id2 % 10000), created_at: now.toISOString(), updated_at: now.toISOString(), email: 'prueba@kulinariamx.com', total_price: '5170.00', currency: 'MXN', financial_status: 'paid',
      customer: { id: 9999001, first_name: 'Cliente', last_name: 'de Prueba', email: 'prueba@kulinariamx.com', phone: '9990000000' },
      note_attributes: [{ name: 'plan', value: 'block' }, { name: 'nivel', value: 'selecto' }, { name: 'alergias', value: 'Mariscos' }, { name: 'no_me_gustan', value: 'brócoli' }, { name: 'dias', value: dias }, { name: 'direccion', value: 'Calle 60 #123, Centro, Mérida' }, { name: 'contrato_aceptado', value: 'sí' }],
      line_items: [
        { title: 'Plan semanal Selecto', variant_title: '4 semanas', quantity: 1, price: '3600.00', properties: [{ name: '_platillos', value: '3× ' + dishA + ' | 1× ' + dishB + ' | 1× ' + dishD }, { name: '_para', value: 'yo' }, { name: '_dias', value: dias }, { name: '_alergias', value: 'Mariscos' }, { name: '_no_me_gustan', value: 'brócoli' }] },
        { title: 'Plan semanal Selecto', variant_title: '1 semana', quantity: 1, price: '1000.00', properties: [{ name: '_platillos', value: '2× ' + dishB + ' | 1× ' + dishC }, { name: '_para', value: 'p1' }, { name: '_para_nombre', value: 'Sofía (prueba)' }, { name: '_dias', value: diasS }, { name: '_alergias', value: 'Cacahuate' }] },
        { title: 'Mejora de platillo', variant_title: '+1 nivel', quantity: 1, price: '70.00', properties: [{ name: '_para', value: 'p1' }, { name: 'Mejora', value: dishC }] }] };
    clearSamples_();                      // one test order at a time: a new one replaces the previous one
    lock.waitLock(20000);
    try { handleOrder_(order); } finally { lock.releaseLock(); }
    return { ok: true, name: order.name };
  }
  if (act === 'sample_clear') {
    var removed = clearSamples_();
    return { ok: true, removed: removed };
  }
  return { ok: false, error: 'unknown_action' };
}

/** removes every test order (#PRUEBA-…) with its dish rows and the test client; returns how many rows of Pedidos were removed */
function clearSamples_() {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  var n = 0;
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet(), ped = ss.getSheetByName('Pedidos'), ids = {};
    if (ped && ped.getLastRow() > 1) for (var i = ped.getLastRow(); i >= 2; i--) { var nm = String(ped.getRange(i, 2).getValue()); if (/^#PRUEBA/.test(nm)) { ids[String(ped.getRange(i, 1).getValue()).split('-')[0]] = 1; ped.deleteRow(i); n++; } }
    var pl = ss.getSheetByName('Platillos'); if (pl && pl.getLastRow() > 1) for (var j = pl.getLastRow(); j >= 2; j--) if (ids[String(pl.getRange(j, 1).getValue())]) pl.deleteRow(j);
    var cl = ss.getSheetByName('Clientes'); if (cl && cl.getLastRow() > 1) for (var k = cl.getLastRow(); k >= 2; k--) if (String(cl.getRange(k, 6).getValue()).toLowerCase() === 'prueba@kulinariamx.com') cl.deleteRow(k);
  } finally { lock.releaseLock(); }
  try { rebuildDeliveries_(); } catch (e3) {}
  return n;
}

/** number of different Shopify orders in a list of rows (an order for a family has one row per person) */
function distinct_(rows) { var seen = {}, n = 0; rows.forEach(function (o) { if (!seen[o.name]) { seen[o.name] = 1; n++; } }); return n; }


/* ---------- requests from the site forms (ambassador code, events, contact): tab "Solicitudes" + e-mail alert ---------- */
function leadSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName('Solicitudes');
  if (!sh) { sh = ss.insertSheet('Solicitudes'); sh.getRange(1, 1, 1, 8).setValues([['Fecha', 'Tipo', 'Nombre', 'Correo', 'Teléfono', 'Detalle', 'Estado', 'ID']]).setFontWeight('bold').setBackground('#1B2316').setFontColor('#FFFFFF'); sh.setFrozenRows(1); }
  return sh;
}
function loadLeads_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Solicitudes'); if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues().map(function (r) { return { date: r[0] instanceof Date ? r[0].toISOString() : String(r[0]), kind: String(r[1]), name: String(r[2]), email: String(r[3]), phone: String(r[4]), detail: String(r[5]), status: String(r[6]) || 'Nueva', id: String(r[7]) }; }).filter(function (x) { return x.id; }).reverse();
}
function leadAdd_(b) {
  var kind = /^(embajador|carta|general)$/.test(String(b.kind)) ? String(b.kind) : 'general', name = String(b.name || '').trim().slice(0, 100), email = String(b.email || '').trim().toLowerCase().slice(0, 120), phone = String(b.phone || '').trim().slice(0, 40);
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'bad_lead' };
  var cache = CacheService.getScriptCache(), ck = 'lead:' + kind + ':' + email;
  if (cache.get(ck)) return { ok: true, duplicate: true };           // the same person sending the same kind of request twice in a minute
  cache.put(ck, '1', 60);
  var f = b.fields || {}, skip = { name: 1, email: 1, phone: 1 }, detail = Object.keys(f).filter(function (k) { return !skip[k] && String(f[k] || '').trim(); }).map(function (k) { return k + ': ' + String(f[k]).trim(); }).join('\n').slice(0, 1500);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { var sh = leadSheet_(), row = sh.getLastRow() + 1, id = 'l' + new Date().getTime().toString(36); sh.getRange(row, 1, 1, 8).setValues([[new Date(), kind, name, email, phone, detail, 'Nueva', id]]); } finally { lock.releaseLock(); }
  try {
    var to = PropertiesService.getScriptProperties().getProperty('ALERT_EMAILS');
    if (to) MailApp.sendEmail(to, 'Nueva solicitud (' + kind + ') · ' + name, ['Tipo: ' + kind, 'Nombre: ' + name, 'Correo: ' + email, 'Teléfono: ' + phone, '', detail, '', 'Verla y marcarla como atendida: /pages/admin → Solicitudes'].join('\n'));
  } catch (e) { /* never block the request */ }
  return { ok: true };
}


/* =====================================================================================================
 * "¿Tienes tu propia dieta?"  (POST {action:'diet_quote', name, email, phone, plan, notes, file:{name,type,data(base64)}})
 *  1. saves the uploaded plan (PDF / JPG / PNG, max 5 MB) in the Drive folder "Kulinaria · Dietas"
 *  2. adds a row in the sheet "Dietas"
 *  3. if the script property ANTHROPIC_API_KEY is set, asks Claude to read the plan and draft a personalised week using the REAL dishes of the store
 *  4. e-mails the draft. DIET_AI_MODE = 'review' (default: only the owner gets it, to check it first) or 'auto' (the client gets it too)
 * Script properties used: ANTHROPIC_API_KEY (secret, never in the theme), DIET_AI_MODE, DIET_AI_MODEL (default claude-sonnet-5-5), ALERT_EMAILS (owner, already used by other alerts)
 * ===================================================================================================== */
var DIET_HEAD = ['Fecha', 'Nombre', 'Correo', 'Teléfono', 'Plan', 'Notas', 'Archivo', 'Estado', 'Propuesta (IA)', 'ID'];
function dietSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName('Dietas');
  if (!sh) { sh = ss.insertSheet('Dietas'); sh.getRange(1, 1, 1, DIET_HEAD.length).setValues([DIET_HEAD]).setFontWeight('bold').setBackground('#1B2316').setFontColor('#FFFFFF'); sh.setFrozenRows(1); }
  return sh;
}
function dietFolder_() {
  var it = DriveApp.getFoldersByName('Kulinaria · Dietas');
  return it.hasNext() ? it.next() : DriveApp.createFolder('Kulinaria · Dietas');
}
function dietCatalog_() {
  /* the dishes of the store with their nutrition, so the draft only uses dishes that really exist */
  try {
    var d = shopifyGql_('{ products(first: 60, query: "status:active") { nodes { title metafields(first: 20, namespace: "kulinaria") { nodes { key value } } } } }', {});
    var nodes = (((d || {}).data || {}).products || {}).nodes || [], out = [];
    nodes.forEach(function (p) {
      var m = {}; ((p.metafields || {}).nodes || []).forEach(function (x) { m[x.key] = x.value; });
      if (!m.calories) return;
      out.push(p.title + ' | nivel ' + (m.tier || 'selecto') + ' | ' + m.calories + ' kcal | P ' + (m.protein || '?') + ' g | C ' + (m.carbs || '?') + ' g | G ' + (m.fat || '?') + ' g | dietas ' + (m.diets || '[]') + ' | alérgenos ' + (m.allergens || '[]'));
    });
    return out.join('\n');
  } catch (err) { return ''; }
}
function dietPlanAI_(blob, b) {
  var props = PropertiesService.getScriptProperties(), key = props.getProperty('ANTHROPIC_API_KEY');
  if (!key) return { ok: false, text: '', error: 'sin ANTHROPIC_API_KEY' };
  var mime = blob.getContentType(), data = Utilities.base64Encode(blob.getBytes());
  var fileBlock = mime === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: data } }
    : { type: 'image', source: { type: 'base64', media_type: mime, data: data } };
  var catalog = dietCatalog_();
  var prompt = [
    'Eres el equipo de nutrición de Kulinaria MX (comida gourmet preparada, entrega semanal en Puebla). Un cliente subió el plan de su nutriólogo (archivo adjunto).',
    'Tareas: 1) Resume en 3 líneas lo que pide el plan (objetivo, calorías y macros diarios, restricciones, alergias). 2) Propón una semana de lunes a viernes con 5 comidas de 2 tiempos usando SOLO platillos del catálogo de abajo (nombres exactos). 3) Para cada día indica kcal, proteína, carbohidratos y grasa aproximados. 4) Lista ajustes o dudas para confirmar con el nutriólogo. 5) Si el archivo no parece un plan nutricional, dilo y no inventes.',
    'Reglas: respeta alergias y restricciones; si el catálogo no alcanza para cumplir el plan, dilo con claridad y sugiere qué platillo personalizado haría falta. No des consejos médicos ni cambies el plan del nutriólogo; esto es una propuesta de menú. Responde en español, en Markdown breve (una tabla por semana).',
    'Plan contratado: ' + (b.plan === 'week' ? 'semana de prueba' : 'bloque de 4 semanas') + '. Notas del cliente: ' + (b.notes || '(sin notas)'),
    '', 'CATÁLOGO (platillo | nivel | kcal | P | C | G | dietas | alérgenos):', catalog || '(catálogo no disponible: indica que la propuesta es general)'
  ].join('\n');
  var payload = { model: props.getProperty('DIET_AI_MODEL') || 'claude-sonnet-5-5', max_tokens: 3500, messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: prompt }] }] };
  var r = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', { method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, payload: JSON.stringify(payload) });
  var code = r.getResponseCode(), body = {};
  try { body = JSON.parse(r.getContentText()); } catch (e) {}
  if (code !== 200) return { ok: false, text: '', error: 'API ' + code + ' ' + String(r.getContentText()).slice(0, 200) };
  var text = (body.content || []).map(function (c) { return c.text || ''; }).join('\n').trim();
  return { ok: !!text, text: text, error: text ? '' : 'respuesta vacía' };
}
function dietHtml_(md) {
  var esc = String(md || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return '<div style="font:14px/1.5 Arial,sans-serif;color:#222;white-space:pre-wrap">' + esc.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') + '</div>';
}
function dietQuoteAdd_(b) {
  var name = String(b.name || '').trim().slice(0, 100), email = String(b.email || '').trim().toLowerCase().slice(0, 120), phone = String(b.phone || '').trim().slice(0, 40);
  var notes = String(b.notes || '').trim().slice(0, 600), plan = b.plan === 'week' ? 'week' : 'block', f = b.file || {};
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'bad_request' };
  if (!/^(application\/pdf|image\/jpeg|image\/png)$/.test(String(f.type)) || !f.data || String(f.data).length > 7200000) return { ok: false, error: 'bad_file' };
  var cache = CacheService.getScriptCache(), ck = 'diet:' + email;
  if (cache.get(ck)) return { ok: true, duplicate: true };
  cache.put(ck, '1', 120);
  var bytes = Utilities.base64Decode(String(f.data)), safe = String(f.name || 'plan').replace(/[^\w.\- ]+/g, '_').slice(0, 80);
  var blob = Utilities.newBlob(bytes, f.type, new Date().getTime().toString(36) + '-' + safe);
  var file = dietFolder_().createFile(blob), url = file.getUrl(), id = 'd' + new Date().getTime().toString(36), sh = dietSheet_(), row;
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { row = sh.getLastRow() + 1; sh.getRange(row, 1, 1, DIET_HEAD.length).setValues([[new Date(), name, email, phone, plan === 'week' ? 'Semana de prueba' : 'Bloque de 4 semanas', notes, url, 'Recibida', '', id]]); } finally { lock.releaseLock(); }
  var props = PropertiesService.getScriptProperties(), owner = props.getProperty('ALERT_EMAILS'), mode = props.getProperty('DIET_AI_MODE') || 'review';
  var ai = { ok: false, text: '', error: '' };
  try { ai = dietPlanAI_(Utilities.newBlob(bytes, f.type, safe), { plan: plan, notes: notes }); } catch (e1) { ai.error = String(e1); }
  try {
    sh.getRange(row, 8).setValue(ai.ok ? (mode === 'auto' ? 'Propuesta enviada' : 'Borrador para revisar') : 'Revisar a mano' + (ai.error ? ' (' + ai.error + ')' : ''));
    if (ai.ok) sh.getRange(row, 9).setValue(ai.text.slice(0, 49000));
  } catch (e2) {}
  try {
    if (owner) MailApp.sendEmail({ to: owner, subject: 'Dieta personalizada · ' + name, htmlBody: '<p><b>' + name + '</b> · ' + email + ' · ' + phone + '<br>Plan: ' + plan + '<br>Notas: ' + notes + '<br>Archivo: <a href="' + url + '">' + url + '</a></p>' + (ai.ok ? '<h3>Borrador de propuesta (' + (mode === 'auto' ? 'ya enviado al cliente' : 'revísalo antes de enviarlo') + ')</h3>' + dietHtml_(ai.text) : '<p>No se generó borrador automático: ' + (ai.error || 'sin clave de IA') + '. Atender a mano desde la hoja “Dietas”.</p>'), attachments: [blob] });
    if (ai.ok && mode === 'auto') MailApp.sendEmail({ to: email, subject: 'Tu propuesta personalizada · Kulinaria MX', htmlBody: '<p>Hola ' + name + ',</p><p>Con base en el plan que nos compartiste, esta es nuestra propuesta de menú. Es una propuesta de platillos, no sustituye las indicaciones de tu nutriólogo.</p>' + dietHtml_(ai.text) + '<p>¿Te late? Responde a este correo y armamos tu semana.</p>' });
  } catch (e3) { /* never block the request */ }
  return { ok: true, id: id, ai: ai.ok };
}
