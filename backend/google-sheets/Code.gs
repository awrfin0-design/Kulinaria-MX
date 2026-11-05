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
 * Order data written by the theme (cart attributes -> order "additional details"):
 *   nombre, correo, telefono, direccion, alergias, no_me_gustan, dietas, enfoque, plan, codigo_referencia, pedido_embudo, contrato_aceptado
 */

var SHEETS = {
  Clientes: ['ID Shopify', 'Creado', 'Actualizado', 'Nombre', 'Apellido', 'Correo', 'Teléfono', 'Dirección', 'Ciudad', 'CP', 'Alergias', 'No me gustan', 'Dietas', 'Código de referencia', 'Plan', 'Etiquetas', 'Notas'],
  Pedidos: ['ID Shopify', 'Pedido', 'Fecha', 'Cliente', 'Correo', 'Teléfono', 'Total', 'Moneda', 'Pago', 'Entrega', 'Plan', 'Enfoque', 'Dietas', 'Alergias', 'No me gustan', 'Dirección de entrega', 'Código de referencia', 'Contrato aceptado', 'Platillos', 'Nota'],
  Platillos: ['ID Pedido', 'Pedido', 'Fecha', 'Cliente', 'Platillo', 'Variante', 'Cantidad', 'Precio unitario', 'Plan de suscripción']
};

function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]).setFontWeight('bold').setBackground('#1B2316').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
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
  if (params.action !== 'admin') return out_({ ok: true, service: 'kulinaria-sheets' });
  var key = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!key || params.key !== key) return out_({ ok: false, error: 'forbidden' });
  return out_(adminData_());
}

function adminData_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = function (name) { var sh = ss.getSheetByName(name); if (!sh || sh.getLastRow() < 2) return []; return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues(); };
  // dishes per order id (a selling plan name on the line = part of a 4-week block)
  var byOrder = {};
  rows('Platillos').forEach(function (r) {
    var id = String(r[0]); byOrder[id] = byOrder[id] || { items: [], block: false };
    byOrder[id].items.push({ title: String(r[4]), qty: Number(r[6]) || 0 });
    if (/4\s*(semanas|weeks)|bloque|block/i.test(String(r[8]))) byOrder[id].block = true;
  });
  var orders = rows('Pedidos').map(function (r) {
    var id = String(r[0]), d = byOrder[id] || { items: [], block: false }, planText = String(r[10] || '').toLowerCase();
    var block = planText === 'block' || (planText === '' && d.block) || /bloque|4\s*(semanas|weeks)/.test(planText);
    return { id: id, name: String(r[1]), date: new Date(r[2]).toISOString(), customer: String(r[3]), email: String(r[4]), total: Number(r[6]) || 0, currency: String(r[7]),
      paid: String(r[8]).toLowerCase() === 'paid', plan: block ? 'block' : 'trial', items: d.items };
  });
  orders.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  var clients = rows('Clientes').map(function (r) { return { email: String(r[5]), created: r[1] ? new Date(r[1]).toISOString() : '' }; }).filter(function (c) { return c.email && c.created; });
  var recipes = rows('Recetas').map(function (r) { return { dish: String(r[0]), name: String(r[1]), qty: Number(r[2]) || 0, unit: String(r[3] || 'g'), cat: String(r[4] || 'pantry'), waste: Number(r[5]) || 0 }; }).filter(function (r) { return r.dish && r.name; });
  return { ok: true, generated: new Date().toISOString(), orders: orders, clients: clients, recipes: recipes.length ? recipes : null };
}

function doPost(e) {
  var props = PropertiesService.getScriptProperties();
  var params = (e && e.parameter) || {};
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

function handleOrder_(o) {
  var a = attrs_(o), c = o.customer || {};
  var name = a.nombre || [c.first_name, c.last_name].filter(Boolean).join(' ') || (o.billing_address && o.billing_address.name) || '';
  var email = o.email || c.email || a.correo || '';
  var ship = o.shipping_address || {};
  var addr = a.direccion || [ship.address1, ship.address2, ship.city, ship.zip].filter(Boolean).join(', ');
  // 1. client profile (created/updated from the order's profile attributes)
  upsertCustomer_({ id: c.id, email: email, first_name: c.first_name || (name.split(' ')[0] || ''), last_name: c.last_name || name.split(' ').slice(1).join(' '), phone: c.phone || a.telefono,
    default_address: c.default_address || { address1: addr, city: ship.city, zip: ship.zip }, tags: c.tags, note: c.note, created_at: c.created_at, updated_at: o.updated_at }, a);
  // 2. dishes
  var items = (o.line_items || []);
  var dishRows = expandDishes_(items);            // dishes chosen inside a plan line (one weekly selection, repeated every week of the plan)
  var planLine = items.filter(function (i) { return dishRowsOf_(i).length; })[0];
  var planKey = a.plan || (planLine && /4/.test(String(planLine.variant_title)) ? 'block' : planLine ? 'week' : '');
  var summary = dishRows.length
    ? dishRows.map(function (d) { return d.qty + '× ' + d.title; }).join(' | ') + ' [' + (planLine.title || 'Plan') + ' · ' + (planLine.variant_title || '') + ']'
    : items.map(function (i) { return i.quantity + '× ' + i.title + (i.variant_title ? ' (' + i.variant_title + ')' : ''); }).join(' | ');
  // 3. order row (remember if it is a brand-new order, to alert the kitchen only once)
  var isNew = !orderExists_(o.id);
  upsertRow_('Pedidos', 1, o.id, [o.id, o.name, o.created_at, name, email, c.phone || a.telefono || '', o.total_price, o.currency, o.financial_status, o.fulfillment_status || 'pendiente',
    planKey, a.enfoque || a.nivel || '', a.dietas || '', a.alergias || '', a.no_me_gustan || '', addr, a.codigo_referencia || '', a.contrato_aceptado || '', summary, o.note || '']);
  // 4. dish rows (replace the order's previous rows so re-sent webhooks never duplicate)
  var sh = sheet_('Platillos'), last = sh.getLastRow();
  if (last > 1) {
    var ids = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var r = ids.length - 1; r >= 0; r--) if (String(ids[r][0]) === String(o.id)) sh.deleteRow(r + 2);
  }
  if (dishRows.length) {
    dishRows.forEach(function (d) { sh.appendRow([o.id, o.name, o.created_at, name, d.title, a.nivel || '', d.qty, '', d.planLabel]); });
  } else {
    items.forEach(function (i) {
      sh.appendRow([o.id, o.name, o.created_at, name, i.title, i.variant_title || '', i.quantity, i.price,
        (i.selling_plan_allocation && i.selling_plan_allocation.selling_plan && i.selling_plan_allocation.selling_plan.name) || '']);
    });
  }
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
    var to = PropertiesService.getScriptProperties().getProperty('ALERT_EMAILS');
    if (!to) return;
    var plan = (a.plan === 'block' || /4 semanas/.test(summary)) ? 'Plan de 4 semanas (20 comidas)' : 'Plan de 1 semana (5 comidas)';
    var body = ['Nuevo pedido ' + o.name, '', 'Cliente: ' + name, 'Correo: ' + email, 'Teléfono: ' + ((o.customer && o.customer.phone) || a.telefono || ''), 'Dirección: ' + addr, '',
      'Plan: ' + plan, 'Total: $' + o.total_price + ' ' + o.currency, 'Platillos: ' + summary, 'Días: ' + (a.dias || '-'), '',
      'ALERGIAS: ' + (a.alergias || 'ninguna declarada'), 'No le gustan: ' + (a.no_me_gustan || '-'), 'Dietas: ' + (a.dietas || '-'), '', 'Panel: abre /pages/admin en tu sitio.'].join('\n');
    MailApp.sendEmail(to, 'Nuevo pedido ' + o.name + ' · ' + name, body);
  } catch (err) { /* never block the order */ }
}
