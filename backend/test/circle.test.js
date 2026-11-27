// Offline test of backend/google-sheets/Circle.gs (+ the hooks in Code.gs) with a tiny fake of Google Apps Script.
//   node backend/test/circle.test.js
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const dir = path.join(__dirname, '..', 'google-sheets');
let pass = 0, fail = 0; const ok = (name, c, d) => { if (c) pass++; else { fail++; console.log('FAIL', name, d !== undefined ? JSON.stringify(d) : ''); } };

// ---------- fake Apps Script ----------
const mails = []; const props = { ALERT_EMAILS: 'owner@kulinariamx.com', SHOP_URL: 'https://kulinariamx.com', CLASS_VARIANT_ID: '555', PROFILE_SECRET: 's', ADMIN_KEY: 'k' };
const book = {};   // sheetName -> array of rows (row 0 = headers)
class Range { constructor(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr || 1; this.nc = nc || 1; }
  getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = this.sh.rows[this.r - 1 + i] || []; out.push(Array.from({ length: this.nc }, (_, j) => row[this.c - 1 + j] === undefined ? '' : row[this.c - 1 + j])); } return out; }
  getValue() { return this.getValues()[0][0]; }
  setValues(v) { v.forEach((rowv, i) => { const idx = this.r - 1 + i; this.sh.rows[idx] = this.sh.rows[idx] || []; rowv.forEach((x, j) => { this.sh.rows[idx][this.c - 1 + j] = x; }); }); return this; }
  setValue(x) { return this.setValues([[x]]); } setFontWeight() { return this; } setBackground() { return this; } setFontColor() { return this; } setNumberFormat() { return this; } setFormula() { return this; } }
class Sheet { constructor(n) { this.name = n; this.rows = []; }
  getLastRow() { return this.rows.length; } getLastColumn() { return Math.max(0, ...this.rows.map((r) => r.length)); }
  getRange(r, c, nr, nc) { return new Range(this, r, c, nr, nc); } setFrozenRows() {} deleteRow(r) { this.rows.splice(r - 1, 1); } appendRow(a) { this.rows.push(a); } clear() { this.rows = []; } }
const sheets = {}; const ss = { getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => (sheets[n] = new Sheet(n)) };
const triggers = [];
const ctx = {
  console, Date, JSON, Math, Number, String, Object, Array, RegExp, parseInt, parseFloat, isNaN, Intl, encodeURIComponent,
  SpreadsheetApp: { getActiveSpreadsheet: () => ss },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
  MailApp: { sendEmail: (m) => mails.push(m) },
  HtmlService: { createHtmlOutput: (h) => ({ html: h, setTitle() { return this; } }) },
  ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/X/exec' }), getProjectTriggers: () => triggers, deleteTrigger() {}, newTrigger: (f) => ({ timeBased: () => ({ everyHours: () => ({ create: () => triggers.push({ getHandlerFunction: () => f }) }) }) }) },
  ContentService: { createTextOutput: (s) => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 1 } },
  Utilities: {
    formatDate: (d, tz, f) => { const p = (n) => String(n).padStart(2, '0'); const z = new Date(d.getTime() - 6 * 3600000); const iso = `${z.getUTCFullYear()}-${p(z.getUTCMonth() + 1)}-${p(z.getUTCDate())}`; if (f === 'yyyy-MM-dd') return iso; if (f === 'HH:mm') return `${p(z.getUTCHours())}:${p(z.getUTCMinutes())}`; return `${iso} ${p(z.getUTCHours())}:${p(z.getUTCMinutes())}`; },
    parseDate: (s) => { const [d, t] = s.split(' '); return new Date(`${d}T${t}:00-06:00`); },
    computeHmacSha256Signature: () => [1, 2, 3], getUuid: () => 'u'
  }
};
vm.createContext(ctx);
for (const f of ['Code.gs', 'Circle.gs']) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
// membership and token checks come from the heavy order sheets: replace them with a fake
const members = { 1: { hasPlan: true, plan: 'block', endsOn: '2099-01-01' }, 2: { hasPlan: true, plan: 'week' } };
vm.runInContext('profileTokenOk_ = function (cid, t) { return t === "tok" + cid; }; creditsFor_ = function (cid) { return ' + JSON.stringify(members) + '[cid] || { hasPlan: false }; };', ctx);
const run = (code) => vm.runInContext(code, ctx);
const get = (params) => { const r = run('doGet({ parameter: ' + JSON.stringify(params) + ' })'); return JSON.parse(r.s); };
const iso = (daysAhead, hour) => { const d = new Date(Date.now() + daysAhead * 86400000 + (hour || 0) * 3600000 - 6 * 3600000); return d.toISOString().slice(0, 10); };

// ---------- scenarios ----------
run('circleSetup()');
ok('setup creates the five tabs', ['Clases', 'Reservas', 'Cupones', 'Entrenadores', 'Gimnasios'].every((n) => sheets[n]) && triggers.length === 1);
const adm = (p) => get(Object.assign({ key: 'k' }, p));
// a class in 3 days, capacity 3, minimum 2, confirmation deadline 24 h before
adm({ action: 'circle_class_save', ckey: 'padel-x', sport: 'padel', title: 'Torneo de Pádel', coach: 'Anny', date: iso(3), time: '09:00', venue: 'Club', cap: 3, min: 2, price: 600, limit: 24 });
adm({ action: 'circle_class_save', ckey: 'tenis-y', sport: 'tenis', title: 'Clínica de Tenis', coach: 'Jess', date: iso(3), time: '09:00', venue: 'Raqueta', cap: 5, min: 4, price: 600, limit: 24 });
const lst = get({ action: 'classes' });
ok('the public list shows both classes with seats and no personal data', lst.classes.length >= 2 && lst.classes.find((c) => c.key === 'padel-x').left === 3 && !JSON.stringify(lst).includes('@'), lst.classes[0]);
const book1 = (cid, cls, seats, email) => get({ action: 'book', cid: String(cid), token: 'tok' + cid, cls, seats: String(seats), name: 'Ana', last: 'Pérez', email: email || 'ana@x.com', phone: '1' });
ok('a visitor without a block cannot book (members only)', get({ action: 'book', cid: '2', token: 'tok2', cls: 'padel-x', seats: '1', name: 'Bob', email: 'b@x.com' }).error === 'members_only');
ok('a forged token cannot book', get({ action: 'book', cid: '1', token: 'bad', cls: 'padel-x', seats: '1', name: 'Bob', email: 'b@x.com' }).error === 'members_only');
const b1 = book1(1, 'padel-x', 2, 'ana@x.com');
ok('a member books 2 seats: Pendiente, nothing charged, a receipt e-mail goes out', b1.ok && b1.state === 'Pendiente' && b1.left === 1 && mails.some((m) => m.to === 'ana@x.com' && /No se cobra nada/.test(m.htmlBody)), b1);
ok('the owner is alerted about the booking', mails.some((m) => m.to === 'owner@kulinariamx.com' && /Nueva reserva/.test(m.subject)));
ok('booking the same class twice with the same e-mail does not duplicate', book1(1, 'padel-x', 1, 'ana@x.com').duplicate === true);
members[3] = { hasPlan: true, plan: 'block' }; vm.runInContext('creditsFor_ = function (cid) { return ' + JSON.stringify(members) + '[cid] || { hasPlan: false }; };', ctx);
const b3 = book1(3, 'padel-x', 2, 'luis@x.com');
ok('over the capacity the booking goes to the waiting list', b3.ok && b3.state === 'En espera' && mails.some((m) => m.to === 'luis@x.com' && /lista de espera/.test(m.htmlBody)), b3);
ok('the public seats count only Pendiente + Confirmada', get({ action: 'classes' }).classes.find((c) => c.key === 'padel-x').taken === 2);
// one more person for tenis (below its minimum of 4)
members[4] = { hasPlan: true, plan: 'block' }; vm.runInContext('creditsFor_ = function (cid) { return ' + JSON.stringify(members) + '[cid] || { hasPlan: false }; };', ctx);
book1(4, 'tenis-y', 1, 'eva@x.com');
// move both classes inside the confirmation window (20 hours before the start)
const setStart = (key, hoursFromNow) => { const sh = sheets.Clases; const d = new Date(Date.now() + hoursFromNow * 3600000 - 6 * 3600000); const row = sh.rows.findIndex((r) => r[0] === key); sh.rows[row][4] = d.toISOString().slice(0, 10); sh.rows[row][5] = d.toISOString().slice(11, 16); };
setStart('padel-x', 20); setStart('tenis-y', 20);
mails.length = 0; run('circleTick()');
const cls = (k) => sheets.Clases.rows.find((r) => r[0] === k)[10];
const rs = (id) => sheets.Reservas.rows.find((r) => r[0] === id);
ok('at the deadline the class that reached its minimum becomes Confirmada and its bookings too', cls('padel-x') === 'Confirmada' && rs(b1.id)[7] === 'Confirmada', [cls('padel-x'), rs(b1.id)]);
ok('the confirmation e-mail carries the payment link with the reservation id', mails.some((m) => m.to === 'ana@x.com' && /cart\/555:2\?attributes\[reserva\]=/.test(m.htmlBody)), mails.map((m) => m.to));
ok('the class below its minimum is cancelled, the booking cancelled and the person told, nothing charged', cls('tenis-y') === 'Cancelada' && mails.some((m) => m.to === 'eva@x.com' && /no alcanzó el mínimo/.test(m.htmlBody)));
ok('the owner is told about the cancelled class', mails.some((m) => m.to === 'owner@kulinariamx.com' && /cancelada por mínimo/i.test(m.subject)));
ok('the waiting list stays waiting while the class is still full', rs(b3.id)[7] === 'En espera');
// a seat frees up: the waiting list is promoted
get({ action: 'circle_res_set', key: 'k', id: b1.id, status: 'Cancelada' });
mails.length = 0; run('circleTick()');
var firstRsvp = mails.find((m) => /RSVP final/.test(m.subject)) || { htmlBody: '' };
ok('the first run inside 24 h sends the one final RSVP e-mail (with the one-click link) to the confirmed people', mails.some((m) => /RSVP final/.test(m.subject) && /action=rsvp&id=/.test(m.htmlBody)));
ok('when a seat is freed the waiting list is promoted automatically and told', rs(b3.id)[7] === 'Confirmada' && mails.some((m) => m.to === 'luis@x.com' && /confirmado/.test(m.htmlBody)), rs(b3.id));
// payment: a Shopify order carrying the reservation id marks the seat as paid
run('handleOrder_ = handleOrder_;');
run('circleOnOrder_({}, { reserva: "' + b3.id + '" })');
ok('the paid order marks the reservation Pagado and e-mails the receipt (owner in copy)', rs(b3.id)[9] === 'Pagado' && mails.some((m) => m.to === 'luis@x.com' && /pago/i.test(m.subject) && m.bcc === 'owner@kulinariamx.com'));
// unpaid seats are released shortly before the class
const b5 = book1(4, 'padel-x', 1, 'eva2@x.com');
setStart('padel-x', 5); mails.length = 0; run('circleTick()');
ok('unpaid confirmed seats are released PAY_HOURS before the class (the paid ones stay)', rs(b5.id)[7] === 'Cancelada' && rs(b3.id)[7] === 'Confirmada');
ok('the final RSVP is sent only once (it already went out at the previous run)', !mails.some((m) => /RSVP final/.test(m.subject)) && sheets.Clases.rows.find((r) => r[0] === 'padel-x')[13] === 'sí');
// RSVP: the one-click link marks the reservation and rejects a forged one
const rsvpMail = firstRsvp;
const lm = (rsvpMail.htmlBody.match(/action=rsvp&id=([^&"]+)&t=([0-9a-f]+)/) || []);
const doRsvp = (id, t) => run('circleRsvpPage_({ id: ' + JSON.stringify(id) + ', t: ' + JSON.stringify(t) + ' })').html;
ok('a forged RSVP link is refused', /No pudimos registrar/.test(doRsvp(lm[1] || 'x', 'deadbeef')));
ok('the real RSVP link marks "Sí" and thanks the person', /te esperamos/.test(doRsvp(lm[1], lm[2])) && sheets.Reservas.rows.find((r) => r[0] === lm[1])[11] === 'Sí');
// names: first name + last name + e-mail are required to book
members[7] = { hasPlan: true, plan: 'block' }; vm.runInContext('creditsFor_ = function (cid) { return ' + JSON.stringify(members) + '[cid] || { hasPlan: false }; };', ctx);
adm({ action: 'circle_class_save', ckey: 'five-z', sport: 'funcional', title: 'Circuito', coach: 'Paulina', date: iso(3), time: '09:00', venue: 'Gym', cap: 20, min: 6, price: 600, limit: 24 });
ok('booking without a last name is refused', get({ action: 'book', cid: '7', token: 'tok7', cls: 'five-z', seats: '1', name: 'Eva', email: 'e@x.com' }).error === 'bad_name');
ok('booking without a valid e-mail is refused', get({ action: 'book', cid: '7', token: 'tok7', cls: 'five-z', seats: '1', name: 'Eva', last: 'Soto', email: 'nope' }).error === 'bad_contact');
ok('the full name (first + last) is what is stored', (() => { const r = get({ action: 'book', cid: '7', token: 'tok7', cls: 'five-z', seats: '1', name: 'Eva', last: 'Soto', email: 'eva5@x.com' }); return r.ok && sheets.Reservas.rows.find((x) => x[0] === r.id)[3] === 'Eva Soto'; })());
// 5 people or fewer (minimum 6): the class does not go and everybody gets the cancellation e-mail
for (let i = 1; i < 5; i++) get({ action: 'book', cid: '7', token: 'tok7', cls: 'five-z', seats: '1', name: 'P' + i + 'x', last: 'Lopez', email: 'p' + i + '@x.com' });
setStart('five-z', 20); mails.length = 0; run('circleTick()');
ok('with 5 people (minimum 6) the class is cancelled and all 5 get the automatic cancellation e-mail, nobody is charged', cls('five-z') === 'Cancelada' && mails.filter((m) => /clase cancelada/.test(m.subject)).length === 5 && sheets.Reservas.rows.filter((r) => r[2] === 'five-z' && r[7] === 'Cancelada').length === 5);
// coupons
const c1 = get({ action: 'coupon', cid: '1', token: 'tok1', partner: 'magnate', email: 'ana@x.com', name: 'Ana' });
ok('a member gets a personal partner code, stored and e-mailed', c1.ok && /^KMAG-[0-9A-Z]+$/.test(c1.code) && sheets.Cupones.rows.length === 2 && mails.some((m) => m.to === 'ana@x.com' && m.htmlBody.indexOf(c1.code) > -1), c1);
ok('asking again returns the same code without duplicating', get({ action: 'coupon', cid: '1', token: 'tok1', partner: 'magnate' }).code === c1.code && sheets.Cupones.rows.length === 2);
ok('a customer without a block cannot get a coupon', get({ action: 'coupon', cid: '2', token: 'tok2', partner: 'magnate' }).error === 'members_only');
ok('the partner check says the code is valid while the block is active, and never leaks personal data', (() => { const r = get({ action: 'coupon_check', code: c1.code.toLowerCase() }); return r.valid === true && r.partner === 'magnate' && !JSON.stringify(r).includes('ana'); })());
members[1] = { hasPlan: false }; vm.runInContext('creditsFor_ = function (cid) { return ' + JSON.stringify(members) + '[cid] || { hasPlan: false }; };', ctx);
ok('the same code stops being valid when the block ends', get({ action: 'coupon_check', code: c1.code }).valid === false);
ok('a made-up code is invalid', get({ action: 'coupon_check', code: 'KMAG-ZZZZZ' }).valid === false);
members[1] = { hasPlan: true, plan: 'block' }; vm.runInContext('creditsFor_ = function (cid) { return ' + JSON.stringify(members) + '[cid] || { hasPlan: false }; };', ctx);
const red = get({ action: 'circle_coupon_redeem', key: 'k', code: c1.code });
ok('staff can redeem a valid code in the admin hub (the use is counted)', red.ok && red.coupons.find((x) => x.code === c1.code).uses === 1);
// directory + lead routing
get({ action: 'circle_dir_save', key: 'k', tab: 'trainer', name: 'Carla', role: 'IFBB', zone: 'Lomas', email: 'carla@x.com', phone: '1' });
get({ action: 'circle_dir_save', key: 'k', tab: 'gym', name: 'Sports World', zone: 'Angelópolis', email: 'sw@x.com', contact: 'Gerente' });
mails.length = 0;
run('leadAdd_({ kind: "entrenador", name: "Zoe", email: "zoe@x.com", cid: "1", token: "tok1", fields: { tipo: "entrenador", entrenador: "Carla", meta: "Fuerza" } })');
ok('a trainer request is e-mailed to that trainer (owner in copy) and the member gets an acknowledgement', mails.some((m) => m.to === 'carla@x.com' && /Nuevo alumno/.test(m.subject)) && mails.some((m) => m.to === 'zoe@x.com' && /recibimos/.test(m.subject)), mails.map((m) => m.to + ':' + m.subject));
mails.length = 0;
run('leadAdd_({ kind: "sede", name: "Zoe", email: "zoe2@x.com", fields: { tipo: "sede", sede: "Sports World", zona_sede: "Lomas" } })');
ok('a gym pickup request goes to that gym\'s contact', mails.some((m) => m.to === 'sw@x.com'));
mails.length = 0;
const lead = run('leadAdd_({ kind: "clase", name: "Nope", email: "nope@x.com", fields: {} })');
ok('member-only lead kinds are still rejected server-side without a valid account', lead.ok === false && lead.error === 'members_only');
mails.length = 0;
run('leadAdd_({ kind: "gimnasio", name: "Luis G", email: "lg@x.com", fields: { tipo: "gimnasio", gimnasio: "Titan" } })');
ok('a partner-gym application is acknowledged to the applicant', mails.some((m) => m.to === 'lg@x.com' && /recibimos|got your request/.test(m.subject)));
adm({ action: 'circle_class_save', ckey: 'desc-q', sport: 'tenis', title: 'Con descripción', coach: 'Ren', date: iso(6), time: '10:00', venue: 'Club', cap: 8, min: 6, price: 600, limit: 24, desc: 'Clínica de saque y derecha para todos los niveles.' });
ok('a class description saved in the admin is shown in the public list', (get({ action: 'classes' }).classes.find((c) => c.key === 'desc-q') || {}).desc === 'Clínica de saque y derecha para todos los niveles.');
adm({ action: 'circle_dir_save', tab: 'trainer', name: 'Carla', role: 'IFBB', zone: 'Lomas', email: 'carla@x.com', phone: '+52 222 111 2233', active: 'Sí' });
ok('a trainer\'s direct contact is given to a member with a block', (() => { const r = get({ action: 'trainer', cid: '1', token: 'tok1', name: 'Carla' }); return r.ok && r.found && r.email === 'carla@x.com' && /222/.test(r.whatsapp); })());
ok('...and never to someone without a block, or with a forged token', get({ action: 'trainer', cid: '2', token: 'tok2', name: 'Carla' }).error === 'members_only' && get({ action: 'trainer', cid: '1', token: 'bad', name: 'Carla' }).error === 'members_only');
ok('the admin data lists classes, reservations, coupons, trainers and gyms', (() => { const d = get({ action: 'circle_data', key: 'k' }); return d.ok && d.classes.length >= 2 && d.reservas.length >= 3 && d.coupons.length === 1 && d.trainers.length === 1 && d.gyms.length === 1; })());
ok('admin actions need the key', get({ action: 'circle_data' }).error === 'forbidden');
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
