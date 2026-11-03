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
  wk.getRange('A3').setFormula('=IFERROR(QUERY(Platillos!A2:I,"select E, sum(G) where E is not null group by E order by sum(G) desc label E \'Platillo\', sum(G) \'Cantidad\'",1),"")');
  wk.getRange('D1').setValue('Dietas más pedidas').setFontWeight('bold');
  wk.getRange('D3').setFormula('=IFERROR(QUERY(Pedidos!A2:T,"select L, count(A) where L is not null group by L order by count(A) desc label L \'Enfoque\', count(A) \'Pedidos\'",1),"")');
  wk.getRange('G1').setValue('Alergias declaradas').setFontWeight('bold');
  wk.getRange('G3').setFormula('=IFERROR(QUERY(Clientes!A2:Q,"select K, count(F) where K is not null and K <> \'\' group by K order by count(F) desc label K \'Alergias\', count(F) \'Clientes\'",1),"")');
}

function doGet() { return out_({ ok: true, service: 'kulinaria-sheets' }); }

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
  var summary = items.map(function (i) { return i.quantity + '× ' + i.title + (i.variant_title ? ' (' + i.variant_title + ')' : ''); }).join(' | ');
  // 3. order row
  upsertRow_('Pedidos', 1, o.id, [o.id, o.name, o.created_at, name, email, c.phone || a.telefono || '', o.total_price, o.currency, o.financial_status, o.fulfillment_status || 'pendiente',
    a.plan || '', a.enfoque || '', a.dietas || '', a.alergias || '', a.no_me_gustan || '', addr, a.codigo_referencia || '', a.contrato_aceptado || '', summary, o.note || '']);
  // 4. dish rows (replace the order's previous rows so re-sent webhooks never duplicate)
  var sh = sheet_('Platillos'), last = sh.getLastRow();
  if (last > 1) {
    var ids = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var r = ids.length - 1; r >= 0; r--) if (String(ids[r][0]) === String(o.id)) sh.deleteRow(r + 2);
  }
  items.forEach(function (i) {
    sh.appendRow([o.id, o.name, o.created_at, name, i.title, i.variant_title || '', i.quantity, i.price,
      (i.selling_plan_allocation && i.selling_plan_allocation.selling_plan && i.selling_plan_allocation.selling_plan.name) || '']);
  });
}
