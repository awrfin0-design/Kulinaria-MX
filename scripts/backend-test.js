const fs = require('fs'), crypto = require('crypto');
const code = fs.readFileSync('' + require('path').join(__dirname, '../backend/google-sheets/Code.gs') + '', 'utf8');
const sheets = {}, mails = [];
const mkSheet = (n) => { const rows = []; const sh = { name: n, rows,
  getLastRow: () => rows.length, getLastColumn: () => Math.max(1, ...rows.map((r) => r.length)),
  getRange: (r, c, nr, nc) => {
    if (typeof r === 'string') { const noop = { setNumberFormat() { return noop; }, setFontWeight() { return noop; } }; return noop; }
    const api = { getValues: () => { const out = []; for (let i = 0; i < (nr || 1); i++) { const row = rows[r - 1 + i] || []; out.push(Array.from({ length: nc || 1 }, (_, k) => row[c - 1 + k] === undefined ? '' : row[c - 1 + k])); } return out; },
      getValue: () => { const row = rows[r - 1] || []; return row[c - 1] === undefined ? '' : row[c - 1]; },
      setValues: (v) => { v.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((x, k) => { rows[r - 1 + i][c - 1 + k] = x; }); }); return api; },
      setValue: (x) => { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = x; return api; },
      setFontWeight() { return api; }, setBackground() { return api; }, setFormula() { return api; }, setNumberFormat() { return api; } };
    return api; },
  appendRow: (row) => { rows.push(row); }, deleteRow: (i) => { rows.splice(i - 1, 1); }, setFrozenRows() {}, clear() {} };
  return sh; };
const ss = { getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => { sheets[n] = mkSheet(n); return sheets[n]; } };
['Clientes', 'Pedidos', 'Platillos', 'Recetas'].forEach((n) => { sheets[n] = mkSheet(n); sheets[n].rows.push(['h']); });
const SECRET = 'topsecret';
const props = { WEBHOOK_KEY: 'k', ADMIN_KEY: 'adm', ALERT_EMAILS: 'a@b.c', PROFILE_SECRET: SECRET, SITE_URL: 'https://kulinariamx.com' };
const token = (cid) => crypto.createHmac('sha256', SECRET).update(String(cid)).digest('hex');
const env = { SpreadsheetApp: { getActiveSpreadsheet: () => ss }, PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) }, ContentService: { createTextOutput: (s) => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 1 } },
  MailApp: { sendEmail: (to, sub, body) => mails.push({ to, sub, body }) }, Session: { getScriptTimeZone: () => 'America/Mexico_City' },
  Utilities: { computeHmacSha256Signature: (v, k) => [...crypto.createHmac('sha256', k).update(String(v)).digest()].map((b) => (b > 127 ? b - 256 : b)),
    formatDate: (d, tz, f) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') },
  ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ create() {} }) }) }) }) } };
const fn = new Function(...Object.keys(env), code + ';return {doPost,doGet,sendWeeklyReminders};')(...Object.values(env));
let fails = 0; const ok = (name, c, extra) => { console.log((c ? 'ok   ' : 'FAIL ') + name + (c ? '' : ' :: ' + (extra || ''))); if (!c) fails++; };
const J = (r) => JSON.parse(r.s);

// 1. order webhook: plan line with hidden _platillos + day properties, plus an upgrade line
const order = { id: 1, name: '#1001', created_at: '2026-11-04T12:00:00-06:00', updated_at: '2026-11-04T12:00:00-06:00', email: 'a@x.com', total_price: '3810.00', currency: 'MXN', financial_status: 'paid',
  customer: { id: 5, first_name: 'Ana', last_name: 'Pérez', email: 'a@x.com' },
  note_attributes: [{ name: 'plan', value: 'block' }, { name: 'nivel', value: 'selecto' }, { name: 'alergias', value: 'Mariscos' }, { name: 'dias', value: 'Lunes 9 nov: Pollo' }, { name: 'alerta_alergias', value: 'Salmón gourmet' }, { name: 'direccion', value: 'Calle Lago 24' }, { name: 'contrato_aceptado', value: 'sí' }],
  line_items: [
    { title: 'Plan semanal Selecto', variant_title: '4 semanas', quantity: 1, price: '3600.00', properties: [{ name: 'Comidas por semana', value: '5' }, { name: 'Lunes 9 nov', value: 'Pollo a las hierbas con puré rústico' }, { name: '_platillos', value: '4× Pollo a las hierbas con puré rústico | 1× Filete Prime con verduras asadas' }] },
    { title: 'Mejora de platillo', variant_title: '+3 niveles', quantity: 1, price: '210.00', properties: [{ name: 'Mejora', value: 'Filete Prime con verduras asadas' }] }] };
let r = J(fn.doPost({ parameter: { key: 'k', topic: 'orders-create' }, postData: { contents: JSON.stringify(order) } }));
ok('order webhook accepted', r.ok, JSON.stringify(r));
ok('dish rows come from the hidden _platillos property (upgrade line adds none)', sheets.Platillos.rows.length === 3 && /Pollo/.test(sheets.Platillos.rows[1][4]) && sheets.Platillos.rows[1][6] === 4, JSON.stringify(sheets.Platillos.rows));
ok('new-order alert e-mail sent once with the day plan and the allergy warning for flagged dishes', mails.length === 1 && /Lunes 9 nov/.test(mails[0].body) && /PUEDEN contener sus alergias: Salmón gourmet/.test(mails[0].body), mails[0] && mails[0].body);
fn.doPost({ parameter: { key: 'k', topic: 'orders-create' }, postData: { contents: JSON.stringify(order) } });
ok('re-delivery of the same webhook does not duplicate the order or the e-mail', sheets.Pedidos.rows.length === 2 && mails.length === 1, sheets.Pedidos.rows.length + '/' + mails.length);
ok('webhook without the key is refused', J(fn.doPost({ parameter: { topic: 'orders-create' }, postData: { contents: '{}' } })).ok === false);

// 2. profile: only with the signed token
const prof = { info: { name: 'Ana Pérez', email: 'a@x.com', phone: '999' }, checks: ['Mariscos'], allergies: ['Mariscos'], dislikes: ['cebolla'], diets: ['Keto'] };
ok('profile write with a wrong token is refused', J(fn.doPost({ parameter: {}, postData: { contents: JSON.stringify({ action: 'profile', cid: 5, token: 'bad', profile: prof }) } })).ok === false);
ok('profile write with the signed token works', J(fn.doPost({ parameter: {}, postData: { contents: JSON.stringify({ action: 'profile', cid: 5, token: token(5), profile: prof }) } })).ok === true);
r = J(fn.doGet({ parameter: { action: 'profile', cid: '5', token: token(5) } }));
ok('profile read returns what was saved', r.ok && r.profile.info.email === 'a@x.com' && r.profile.allergies[0] === 'Mariscos');
ok('another customer cannot read it (token of customer 6 on id 5)', J(fn.doGet({ parameter: { action: 'profile', cid: '5', token: token(6) } })).ok === false);
fn.doPost({ parameter: {}, postData: { contents: JSON.stringify({ action: 'profile', cid: 5, token: token(5), profile: Object.assign({}, prof, { dislikes: [] }) }) } });
ok('profile update overwrites the same row (no duplicates)', sheets.Perfiles.rows.length === 2);

// 3. weekly choices (weeks are relative to "now": the server only accepts weeks that are still open)
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const allowed = (() => { const n = new Date(), dow = n.getDay(), mins = n.getHours() * 60 + n.getMinutes(); let d = ((1 - dow + 7) % 7) || 7; if (dow === 0 || (dow === 6 && mins >= 600)) d += 7; return new Date(n.getFullYear(), n.getMonth(), n.getDate() + d); })();
const wk = (k) => ymd(new Date(allowed.getFullYear(), allowed.getMonth(), allowed.getDate() + 7 * k));
const W1 = wk(0), W2 = wk(1), W3 = wk(2);
const past = ymd(new Date(allowed.getFullYear(), allowed.getMonth(), allowed.getDate() - 7));
const put = (cid, week, days, up) => J(fn.doGet({ parameter: { action: 'weekset', cid: String(cid), token: token(cid), week, email: 'a@x.com', days: days.join('|'), upgrade: String(up) } }));
ok('week choice without upgrade is Confirmada', put(5, W1, ['Bowl vegano de garbanzo y tahini', 'Bowl vegano de garbanzo y tahini', 'Crema de calabaza asada', 'Crema de calabaza asada', 'Crema de calabaza asada'], 0).status === 'Confirmada');
ok('week choice with an upgrade waits for payment', put(5, W2, ['Filete Prime con verduras asadas', 'Crema de calabaza asada', 'Crema de calabaza asada', 'Crema de calabaza asada', 'Crema de calabaza asada'], 210).status === 'Pendiente de pago');
ok('a week whose Saturday cut-off has passed is refused by the server', put(5, past, ['x'], 0).error === 'closed', JSON.stringify(put(5, past, ['x'], 0)));
ok('a date that is not a Monday is refused', put(5, wk(0).slice(0, 8) + String(+wk(0).slice(8) + 1).padStart(2, '0'), ['x'], 0).ok === false);
ok('bad week format is refused', put(5, 'mañana', ['x'], 0).ok === false);
ok('a wrong token cannot save a week', J(fn.doGet({ parameter: { action: 'weekset', cid: '5', token: 'bad', week: W1, days: 'x' } })).ok === false);
r = J(fn.doGet({ parameter: { action: 'week', cid: '5', token: token(5), week: W1 } }));
ok('week read returns the saved choice', r.ok && r.selection && r.selection.status === 'Confirmada' && r.selection.items.reduce((a, i) => a + i.qty, 0) === 5, JSON.stringify(r));
r = J(fn.doGet({ parameter: { action: 'week', cid: '5', token: token(5), week: wk(3) } }));
ok('an unchosen week offers the previous choice', r.ok && r.selection === null && r.previous && r.previous.week === W2, JSON.stringify(r));
ok('week read with a wrong token is refused', J(fn.doGet({ parameter: { action: 'week', cid: '5', token: 'x', week: W1 } })).ok === false);
// the paid upgrade (order webhook with the hidden _semana property) flips the status
const up = Object.assign({}, order, { id: 2, name: '#1002', line_items: [{ title: 'Mejora de platillo', variant_title: '+3 niveles', quantity: 1, price: '210.00', properties: [{ name: 'Mejora', value: 'Filete Prime' }, { name: '_semana', value: W2 }] }] });
fn.doPost({ parameter: { key: 'k', topic: 'orders-create' }, postData: { contents: JSON.stringify(up) } });
r = J(fn.doGet({ parameter: { action: 'week', cid: '5', token: token(5), week: W2 } }));
ok('paying the upgrade marks that week Pagada', r.selection && r.selection.status === 'Pagada', JSON.stringify(r));

// 4. admin export carries the confirmed weekly choices
r = J(fn.doGet({ parameter: { action: 'admin', key: 'adm' } }));
ok('admin export includes confirmed/paid weekly choices only', r.ok && r.selections.length === 2 && r.selections.every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.week) && s.items.length), JSON.stringify(r.selections));
ok('admin export still lists the plan order with its first-week dishes', r.orders.some((o) => o.plan === 'block' && o.items.some((i) => /Pollo/.test(i.title))));

// 5. reminders (fixed dates: week 1 = Mon 9 Nov; the rows are seeded by hand so the test does not depend on today)
sheets.Selecciones.rows.length = 1;
sheets.Selecciones.rows.push(['5', 'a@x.com', '2026-11-16', '[]', '', 0, 'Confirmada', new Date()], ['5', 'a@x.com', '2026-11-23', '[]', '', 210, 'Pendiente de pago', new Date()]);
mails.length = 0;
fn.sendWeeklyReminders(new Date(2026, 10, 12, 9)); const m1 = mails.length;
fn.sendWeeklyReminders(new Date(2026, 10, 26, 9)); const m2 = mails.length - m1;
fn.sendWeeklyReminders(new Date(2026, 10, 25, 9)); const m3 = mails.length - m1 - m2;     // Wednesday: nothing
fn.sendWeeklyReminders(new Date(2026, 11, 10, 9)); const m4 = mails.length - m1 - m2 - m3; // plan over (week 5): nothing
ok('reminders: none if the next week is already chosen, one when it is not, none on other weekdays or after the plan ends', m1 === 0 && m2 === 1 && m3 === 0 && m4 === 0, [m1, m2, m3, m4].join());
ok('reminder e-mail links to Mi semana', mails[0] && /kulinariamx.com\/pages\/cuenta-semana/.test(mails[0].body) && mails[0].to === 'a@x.com');
console.log(fails ? fails + ' FAILED' : 'all backend checks passed'); process.exit(fails ? 1 : 0);
