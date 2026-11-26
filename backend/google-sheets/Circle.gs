/**
 * Kulinaria MX — Círculo privado: classes with capacity + confirmations, payment links, partner coupons, trainer / gym routing.
 * Paste this file in the same Apps Script project as Code.gs (Extensions > Apps Script > + > Script), then run circleSetup() ONCE.
 * It creates the tabs  Clases · Reservas · Cupones · Entrenadores · Gimnasios  and installs the hourly timer.
 *
 * Emails go out with MailApp (free, from the Google account that owns the script: ~100/day personal, 1,500/day Workspace).
 * Script properties (Project Settings > Script properties):
 *   SHOP_URL          https://kulinariamx.com                    (used in payment links)
 *   CLASS_VARIANT_ID  numeric id of the product variant "Clase del Círculo" (the $600 product)
 *   ALERT_EMAILS      owner e-mail(s), comma separated            (already used by Code.gs)
 *   NUTRI_EMAIL       e-mail of the nutritionist (consult requests)   (optional, falls back to ALERT_EMAILS)
 *   PAY_HOURS         hours before the class when an unpaid seat is released (default 12)
 *   COUPON_PREFIXES   JSON, partner key -> code prefix, e.g. {"magnate":"KMAG","kfw":"KKFW"}  (optional)
 *
 * Rules (change them in the Clases tab, per class). Default: with 5 people or fewer (Mínimo = 6) the class does not go and everybody is told by e-mail.
 *   - A class opens with a capacity (Cupo) and a minimum (Mínimo) of seats. Members book (Reservas = Pendiente).
 *   - At the confirmation deadline (Límite = hours before the start) the hourly timer looks at the seats:
 *       seats >= Mínimo  -> class Confirmada, every Pendiente reservation becomes Confirmada, people get the payment link
 *       seats <  Mínimo  -> class Cancelada, everybody is told by e-mail
 *   - Over the capacity, bookings go to En espera and are promoted automatically when a seat frees up.
 *   - Payment: the confirmation e-mail carries a cart link for the seats; the Shopify order (webhook) marks the reservation Pagado.
 *     Unpaid seats are released PAY_HOURS before the class and the waiting list is promoted.
 */

var CIRCLE_SHEETS = {
  Clases: ['Clave', 'Deporte', 'Título', 'Coach', 'Fecha (AAAA-MM-DD)', 'Hora (HH:MM)', 'Sede', 'Cupo', 'Mínimo', 'Precio', 'Estado', 'Foto', 'Límite (horas antes)', 'Recordatorio enviado', 'Descripción'],
  Reservas: ['ID', 'Fecha', 'Clase', 'Nombre', 'Correo', 'Teléfono', 'Lugares', 'Estado', 'CID', 'Pago', 'Idioma', 'RSVP'],
  Cupones: ['Código', 'Aliado', 'Nombre', 'Correo', 'CID', 'Emitido', 'Vence', 'Estado', 'Canjes', 'Último canje'],
  Entrenadores: ['Nombre', 'Rol', 'Zona', 'Correo', 'WhatsApp', 'Activo'],
  Gimnasios: ['Nombre', 'Zona', 'Dirección', 'Contacto', 'Correo', 'Teléfono', 'Punto de entrega', 'Activo']
};
var CIRCLE_TZ = 'America/Mexico_City';

function circleSetup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(CIRCLE_SHEETS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name), h = CIRCLE_SHEETS[name];
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#1B2316').setFontColor('#FFFFFF'); sh.setFrozenRows(1);
  });
  var cl = ss.getSheetByName('Clases');
  if (cl.getLastRow() < 2) {   // a first example so the tab shows the format
    var d = new Date(Date.now() + 10 * 86400000), iso = Utilities.formatDate(d, CIRCLE_TZ, 'yyyy-MM-dd');
    cl.getRange(2, 1, 1, 14).setValues([['tenis-' + iso, 'tenis', 'Clínica de Tenis', 'Jessica', iso, '09:00', 'Raqueta Club', 12, 6, 600, 'Abierta', '', 24, '']]);
  }
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'circleTick') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('circleTick').timeBased().everyHours(1).create();
}

/* ---------- small helpers ---------- */
function cSheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(name);
  if (!sh) { circleSetup(); sh = ss.getSheetByName(name); }
  return sh;
}
function cRows_(name) { var sh = cSheet_(name); if (sh.getLastRow() < 2) return []; return sh.getRange(2, 1, sh.getLastRow() - 1, CIRCLE_SHEETS[name].length).getValues(); }
function cProp_(k, d) { var v = PropertiesService.getScriptProperties().getProperty(k); return v == null || v === '' ? d : v; }
function cStr_(v) { return v == null ? '' : String(v).trim(); }
function cDateStr_(v) { return v instanceof Date ? Utilities.formatDate(v, CIRCLE_TZ, 'yyyy-MM-dd') : cStr_(v); }
function cTimeStr_(v) { return v instanceof Date ? Utilities.formatDate(v, CIRCLE_TZ, 'HH:mm') : cStr_(v); }
function cClass_(r) {
  var date = cDateStr_(r[4]), time = cTimeStr_(r[5]) || '09:00', start = null;
  try { start = Utilities.parseDate(date + ' ' + time, CIRCLE_TZ, 'yyyy-MM-dd HH:mm'); } catch (e) { start = null; }
  return { key: cStr_(r[0]), sport: cStr_(r[1]), title: cStr_(r[2]), coach: cStr_(r[3]), date: date, time: time, venue: cStr_(r[6]), cap: Number(r[7]) || 0, min: Number(r[8]) || 0, price: Number(r[9]) || 0, status: cStr_(r[10]) || 'Abierta', art: cStr_(r[11]), limit: r[12] === '' ? 24 : Number(r[12]), reminded: cStr_(r[13]), desc: cStr_(r[14]).slice(0, 600), start: start };
}
function cRes_(r) { return { id: cStr_(r[0]), at: r[1] instanceof Date ? r[1].toISOString() : cStr_(r[1]), cls: cStr_(r[2]), name: cStr_(r[3]), email: cStr_(r[4]).toLowerCase(), phone: cStr_(r[5]), seats: Number(r[6]) || 1, status: cStr_(r[7]), cid: cStr_(r[8]), paid: cStr_(r[9]), lang: cStr_(r[10]) || 'es', rsvp: cStr_(r[11]) }; }
function cClasses_() { return cRows_('Clases').map(cClass_).filter(function (c) { return c.key; }); }
function cReservas_() { return cRows_('Reservas').map(cRes_).filter(function (r) { return r.id; }); }
function cTaken_(key, reservas) { return (reservas || cReservas_()).filter(function (r) { return r.cls === key && /^(Pendiente|Confirmada)$/.test(r.status); }).reduce(function (a, r) { return a + r.seats; }, 0); }
function cFindRow_(sheet, col, val) { var sh = cSheet_(sheet), last = sh.getLastRow(); if (last < 2) return 0; var v = sh.getRange(2, col, last - 1, 1).getValues(); for (var i = 0; i < v.length; i++) if (cStr_(v[i][0]) === String(val)) return i + 2; return 0; }
function cMoney_(n) { return '$' + Number(n || 0).toLocaleString('es-MX'); }
function cWhen_(c) { var d = c.start; if (!d) return c.date + ' ' + c.time; return Utilities.formatDate(d, CIRCLE_TZ, "EEEE d 'de' MMMM, HH:mm").replace(/^./, function (x) { return x.toUpperCase(); }); }

/* ---------- e-mail ---------- */
function cMail_(to, subject, html, copyOwner) {
  if (!to) return;
  try {
    var o = cProp_('ALERT_EMAILS', ''), shell = '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#151515"><div style="background:#0e0e0e;padding:18px 22px;border-radius:14px 14px 0 0"><b style="color:#ff6200;font-size:22px">Kulinaria</b> <span style="color:#bbb;font-size:12px">Arte del fuego</span></div><div style="border:1px solid #eee;border-top:0;padding:22px;border-radius:0 0 14px 14px;line-height:1.55">' + html + '</div><p style="color:#999;font-size:12px;text-align:center">Kulinaria MX · kulinariamx.com</p></div>';
    MailApp.sendEmail({ to: to, subject: subject, htmlBody: shell, name: 'Kulinaria', replyTo: (o.split(',')[0] || '').trim() || undefined, bcc: copyOwner ? o : undefined });
  } catch (e) { /* mail never blocks the booking */ }
}
function cTxt_(lang, es, en) { return lang === 'en' ? en : es; }
function cPayLink_(res, cls) {
  var shop = cProp_('SHOP_URL', ''), vid = cProp_('CLASS_VARIANT_ID', ''); if (!shop || !vid) return '';
  return shop.replace(/\/$/, '') + '/cart/' + vid + ':' + res.seats + '?attributes[reserva]=' + encodeURIComponent(res.id) + '&attributes[clase]=' + encodeURIComponent(cls.title + ' · ' + cls.date);
}
function cMailBook_(res, cls, state) {
  var L = res.lang, w = cWhen_(cls), msg;
  if (state === 'En espera') msg = cTxt_(L, '<p>Hola ' + res.name + ', la clase <b>' + cls.title + '</b> (' + w + ') está llena. Te pusimos en <b>lista de espera</b>: si se libera un lugar te avisamos de inmediato.</p>', '<p>Hi ' + res.name + ', <b>' + cls.title + '</b> (' + w + ') is full. You are on the <b>waiting list</b>; we will email you the moment a seat frees up.</p>');
  else if (state === 'Confirmada') { var pl = cPayLink_(res, cls); msg = cTxt_(L, '<p>Hola ' + res.name + ', tu lugar en <b>' + cls.title + '</b> está <b>confirmado</b> (' + w + ', ' + cls.venue + ', ' + res.seats + ' lugar(es)).</p>' + (pl && cls.price ? '<p>Para asegurarlo paga ' + cMoney_(cls.price * res.seats) + ': <a href="' + pl + '">pagar mi lugar</a>.</p>' : ''), '<p>Hi ' + res.name + ', your seat in <b>' + cls.title + '</b> is <b>confirmed</b> (' + w + ', ' + cls.venue + ', ' + res.seats + ' seat(s)).</p>' + (pl && cls.price ? '<p>To secure it pay ' + cMoney_(cls.price * res.seats) + ': <a href="' + pl + '">pay for my seat</a>.</p>' : '')); }
  else msg = cTxt_(L, '<p>Hola ' + res.name + ', recibimos tu solicitud para <b>' + cls.title + '</b> (' + w + ', ' + cls.venue + ', ' + res.seats + ' lugar(es)).</p><p>La clase se confirma cuando se junten <b>' + cls.min + '</b> lugares, hasta ' + cls.limit + ' h antes. Te escribimos en cuanto esté confirmada (o si no alcanza el mínimo). <b>No se cobra nada todavía.</b></p>', '<p>Hi ' + res.name + ', we got your request for <b>' + cls.title + '</b> (' + w + ', ' + cls.venue + ', ' + res.seats + ' seat(s)).</p><p>The class is confirmed once <b>' + cls.min + '</b> seats are booked, up to ' + cls.limit + ' h before. We will email you as soon as it is confirmed (or if the minimum is not reached). <b>Nothing is charged yet.</b></p>');
  cMail_(res.email, cTxt_(L, 'Kulinaria · ' + cls.title, 'Kulinaria · ' + cls.title), msg, false);
}

/* ---------- public API (GET) ---------- */
function circlePublic_(p) {
  var act = String(p.action);
  if (act === 'classes') return { ok: true, classes: circleClassesPublic_() };
  if (act === 'book') return circleBook_(p);
  if (act === 'coupon') return circleCoupon_(p);
  if (act === 'coupon_check') return circleCouponCheck_(p);
  if (act === 'myres') return circleMine_(p);
  return { ok: false, error: 'unknown' };
}
function circleMember_(cid, token) {
  try { if (!(cid && token && profileTokenOk_(cid, token))) return false; var cr = creditsFor_(cid); return !!(cr && cr.hasPlan && cr.plan === 'block'); } catch (e) { return false; }
}
function circleClassesPublic_() {
  var now = new Date(), res = cReservas_();
  return cClasses_().filter(function (c) { return c.start && c.start.getTime() > now.getTime() - 3600000 && c.status !== 'Archivada'; }).sort(function (a, b) { return a.start - b.start; }).map(function (c) {
    var taken = cTaken_(c.key, res), left = Math.max(0, c.cap - taken), wait = res.filter(function (r) { return r.cls === c.key && r.status === 'En espera'; }).length;
    return { key: c.key, sport: c.sport, title: c.title, coach: c.coach, date: c.date, time: c.time, venue: c.venue, cap: c.cap, min: c.min, price: c.price, status: c.status, art: c.art, desc: c.desc, taken: taken, left: left, full: left === 0, waiting: wait, limit: c.limit, deadline: c.start ? new Date(c.start.getTime() - c.limit * 3600000).toISOString() : '' };
  });
}
function circleBook_(p) {
  if (!circleMember_(p.cid, p.token)) return { ok: false, error: 'members_only' };
  var first = cStr_(p.name).slice(0, 60), last = cStr_(p.last).slice(0, 60), name = (first + ' ' + last).trim(), email = cStr_(p.email).toLowerCase().slice(0, 120), phone = cStr_(p.phone).slice(0, 40), seats = Math.max(1, Math.min(4, parseInt(p.seats, 10) || 1)), lang = p.lang === 'en' ? 'en' : 'es';
  if (first.length < 2 || last.length < 2) return { ok: false, error: 'bad_name' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'bad_contact' };
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var cls = cClasses_().filter(function (c) { return c.key === String(p.cls); })[0];
    if (!cls) return { ok: false, error: 'no_class' };
    if (cls.status === 'Cancelada' || cls.status === 'Archivada' || !cls.start || cls.start.getTime() < Date.now()) return { ok: false, error: 'closed' };
    var res = cReservas_(), dup = res.filter(function (r) { return r.cls === cls.key && r.email === email && /^(Pendiente|Confirmada|En espera)$/.test(r.status); })[0];
    if (dup) return { ok: true, duplicate: true, state: dup.status, id: dup.id };
    var left = cls.cap - cTaken_(cls.key, res), state = left >= seats ? (cls.status === 'Confirmada' ? 'Confirmada' : 'Pendiente') : 'En espera';
    var id = 'r' + new Date().getTime().toString(36) + Math.random().toString(36).slice(2, 5), sh = cSheet_('Reservas');
    sh.getRange(sh.getLastRow() + 1, 1, 1, 12).setValues([[id, new Date(), cls.key, name, email, phone, seats, state, String(p.cid), cls.price ? 'Pendiente' : '—', lang, '']]);
    var rr = { id: id, name: name, email: email, seats: seats, lang: lang, status: state };
    cMailBook_(rr, cls, state);
    var o = cProp_('ALERT_EMAILS', ''); if (o) cMail_(o, 'Nueva reserva · ' + cls.title, '<p><b>' + name + '</b> (' + email + (phone ? ', ' + phone : '') + ') · ' + seats + ' lugar(es) · <b>' + state + '</b><br>' + cls.title + ' · ' + cWhen_(cls) + '<br>Lugares tomados: ' + (cTaken_(cls.key) ) + ' / ' + cls.cap + ' (mínimo ' + cls.min + ')</p>', false);
    return { ok: true, state: state, id: id, left: Math.max(0, cls.cap - cTaken_(cls.key)) };
  } finally { lock.releaseLock(); }
}
function circleMine_(p) {
  if (!(p.cid && p.token && profileTokenOk_(p.cid, p.token))) return { ok: false, error: 'forbidden' };
  return { ok: true, reservas: cReservas_().filter(function (r) { return r.cid === String(p.cid); }).map(function (r) { return { id: r.id, cls: r.cls, seats: r.seats, status: r.status, paid: r.paid }; }) };
}

/* ---------- the hourly timer: confirm or cancel, remind, release unpaid seats, promote the waiting list ---------- */
function circleTick() {
  var lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    var now = Date.now(), payH = Number(cProp_('PAY_HOURS', 12)) || 12, res = cReservas_();
    var sh = cSheet_('Clases'), rowsC = cRows_('Clases');
    rowsC.forEach(function (r, i) {
      var c = cClass_(r); if (!c.key || !c.start || /^(Cancelada|Archivada)$/.test(c.status)) return;
      var hours = (c.start.getTime() - now) / 3600000, row = i + 2;
      if (hours <= 0) { sh.getRange(row, 11).setValue('Archivada'); return; }
      if (c.status === 'Abierta' && hours <= c.limit) {
        var taken = cTaken_(c.key, res);
        if (taken >= c.min) {
          sh.getRange(row, 11).setValue('Confirmada');
          res.filter(function (x) { return x.cls === c.key && x.status === 'Pendiente'; }).forEach(function (x) { circleSetRes_(x.id, 'Confirmada'); x.status = 'Confirmada'; cMailBook_(x, c, 'Confirmada'); });
        } else {
          sh.getRange(row, 11).setValue('Cancelada');
          res.filter(function (x) { return x.cls === c.key && /^(Pendiente|En espera|Confirmada)$/.test(x.status); }).forEach(function (x) {
            circleSetRes_(x.id, 'Cancelada');
            cMail_(x.email, cTxt_(x.lang, 'Kulinaria · clase cancelada', 'Kulinaria · class cancelled'), cTxt_(x.lang, '<p>Hola ' + x.name + ', la clase <b>' + c.title + '</b> (' + cWhen_(c) + ') no alcanzó el mínimo de ' + c.min + ' lugares y se canceló. No se te cobró nada. Mira las próximas clases del círculo en kulinariamx.com/pages/circulo-privado</p>', '<p>Hi ' + x.name + ', <b>' + c.title + '</b> (' + cWhen_(c) + ') did not reach the minimum of ' + c.min + ' seats and was cancelled. Nothing was charged. See the next classes at kulinariamx.com/pages/circulo-privado</p>'), false);
          });
          cMail_(cProp_('ALERT_EMAILS', ''), 'Clase cancelada por mínimo · ' + c.title, '<p>' + c.title + ' · ' + cWhen_(c) + ' no llegó al mínimo (' + cTaken_(c.key, res) + ' / ' + c.min + '). Se avisó a los inscritos.</p>', false);
        }
      }
      if (c.status === 'Confirmada' || (c.status === 'Abierta' && hours > c.limit)) {
        // unpaid seats of a confirmed class are released shortly before the start
        if (c.status === 'Confirmada' && c.price && hours <= payH) {
          res.filter(function (x) { return x.cls === c.key && x.status === 'Confirmada' && x.paid === 'Pendiente'; }).forEach(function (x) {
            circleSetRes_(x.id, 'Cancelada'); x.status = 'Cancelada';
            cMail_(x.email, cTxt_(x.lang, 'Kulinaria · liberamos tu lugar', 'Kulinaria · we released your seat'), cTxt_(x.lang, '<p>Hola ' + x.name + ', no recibimos el pago de tu lugar en <b>' + c.title + '</b> y lo liberamos. Si aún quieres ir, reserva de nuevo si hay lugares.</p>', '<p>Hi ' + x.name + ', we did not receive payment for your seat in <b>' + c.title + '</b>, so we released it. If you still want to go, book again if seats remain.</p>'), false);
          });
        }
        // waiting list -> promote while seats are free
        var free = c.cap - cTaken_(c.key, res);
        res.filter(function (x) { return x.cls === c.key && x.status === 'En espera'; }).sort(function (a, b) { return a.at < b.at ? -1 : 1; }).forEach(function (x) {
          if (free >= x.seats) { free -= x.seats; var ns = c.status === 'Confirmada' ? 'Confirmada' : 'Pendiente'; circleSetRes_(x.id, ns); x.status = ns; cMailBook_(x, c, ns); }
        });
        // reminder 24 h before
        if (c.status === 'Confirmada' && hours <= 24 && !c.reminded) {
          sh.getRange(row, 14).setValue('sí');
          res.filter(function (x) { return x.cls === c.key && x.status === 'Confirmada'; }).forEach(function (x) {
            var rsvp = cRsvpLink_(x.id), unpaid = c.price && x.paid === 'Pendiente', pl = unpaid ? cPayLink_(x, c) : '';
            cMail_(x.email, cTxt_(x.lang, 'Kulinaria · RSVP final: ' + c.title, 'Kulinaria · final RSVP: ' + c.title),
              cTxt_(x.lang, '<p>Hola ' + x.name + ', mañana es <b>' + c.title + '</b>: ' + cWhen_(c) + ', ' + c.venue + '. Coach ' + c.coach + '.</p><p><b>Confirma tu asistencia (RSVP final):</b> <a href="' + rsvp + '">Sí, voy</a></p>' + (unpaid ? '<p>Tu lugar aún está sin pagar' + (pl ? ': <a href="' + pl + '">pagar ahora</a>' : '') + '. Lo liberamos ' + payH + ' h antes de la clase.</p>' : ''),
                '<p>Hi ' + x.name + ', <b>' + c.title + '</b> is tomorrow: ' + cWhen_(c) + ', ' + c.venue + '. Coach ' + c.coach + '.</p><p><b>Confirm you are coming (final RSVP):</b> <a href="' + rsvp + '">Yes, I am going</a></p>' + (unpaid ? '<p>Your seat is not paid yet' + (pl ? ': <a href="' + pl + '">pay now</a>' : '') + '. We release it ' + payH + ' h before the class.</p>' : '')), false);
          });
        }
      }
    });
  } finally { lock.releaseLock(); }
}
function circleSetRes_(id, status, paid) {
  var row = cFindRow_('Reservas', 1, id); if (!row) return false; var sh = cSheet_('Reservas');
  if (status) sh.getRange(row, 8).setValue(status); if (paid) sh.getRange(row, 10).setValue(paid); return true;
}
function cSign_(id) {
  var secret = cProp_('PROFILE_SECRET', 'kulinaria');
  return Utilities.computeHmacSha256Signature('rsvp:' + id, secret).map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('').slice(0, 24);
}
function cRsvpLink_(id) {
  var base = cProp_('WEBAPP_URL', ''); try { if (!base) base = ScriptApp.getService().getUrl(); } catch (e) {}
  return base + (base.indexOf('?') > -1 ? '&' : '?') + 'action=rsvp&id=' + encodeURIComponent(id) + '&t=' + cSign_(id);
}
/** One-click final RSVP from the e-mail. Returns a small HTML page (not JSON). */
function circleRsvpPage_(p) {
  var ok = false, title = '', id = cStr_(p.id);
  if (id && cStr_(p.t) === cSign_(id)) {
    var r = cReservas_().filter(function (x) { return x.id === id; })[0];
    if (r && r.status === 'Confirmada') { var row = cFindRow_('Reservas', 1, id); if (row) { cSheet_('Reservas').getRange(row, 12).setValue('Sí'); ok = true; var c = cClasses_().filter(function (k) { return k.key === r.cls; })[0]; title = c ? c.title + ' · ' + cWhen_(c) : ''; } }
  }
  var html = '<div style="font-family:Arial,sans-serif;max-width:480px;margin:60px auto;text-align:center"><h2 style="color:#ff6200">Kulinaria</h2>' + (ok ? '<h3>¡Listo, te esperamos!</h3><p>' + title + '</p>' : '<h3>No pudimos registrar tu RSVP</h3><p>La clase ya no está confirmada o el enlace venció. Escríbenos y lo resolvemos.</p>') + '</div>';
  return HtmlService.createHtmlOutput(html).setTitle('Kulinaria · RSVP');
}
/** Called by Code.gs when a Shopify order carries the cart attribute reserva=<id>: the seat is paid. */
function circleOnOrder_(o, a) {
  var id = cStr_(a && a.reserva); if (!id) return;
  if (circleSetRes_(id, '', 'Pagado')) {
    var r = cReservas_().filter(function (x) { return x.id === id; })[0], c = r && cClasses_().filter(function (k) { return k.key === r.cls; })[0];
    if (r && c) cMail_(r.email, cTxt_(r.lang, 'Kulinaria · pago recibido', 'Kulinaria · payment received'), cTxt_(r.lang, '<p>Hola ' + r.name + ', recibimos tu pago. Tu lugar en <b>' + c.title + '</b> (' + cWhen_(c) + ', ' + c.venue + ') está asegurado. ¡Nos vemos!</p>', '<p>Hi ' + r.name + ', payment received. Your seat in <b>' + c.title + '</b> (' + cWhen_(c) + ', ' + c.venue + ') is secured. See you there!</p>'), true);
  }
}

/* ---------- partner coupons (valid only while the 4-week block is active) ---------- */
function circlePrefix_(partner) {
  var map = {}; try { map = JSON.parse(cProp_('COUPON_PREFIXES', '{}')); } catch (e) {}
  var k = String(partner || 'magnate').toLowerCase().replace(/[^a-z0-9]/g, '');
  return map[k] || (k === 'magnate' ? 'KMAG' : 'K' + k.slice(0, 3).toUpperCase());
}
function circleCoupon_(p) {
  if (!circleMember_(p.cid, p.token)) return { ok: false, error: 'members_only' };
  var partner = cStr_(p.partner || 'magnate').slice(0, 40), code = circlePrefix_(partner) + '-' + (parseInt(p.cid, 10) || 0).toString(36).toUpperCase().slice(-5);
  var cr = creditsFor_(p.cid), ends = cr && cr.endsOn ? cr.endsOn : '', row = cFindRow_('Cupones', 1, code), sh = cSheet_('Cupones');
  if (!row) {
    sh.getRange(sh.getLastRow() + 1, 1, 1, 10).setValues([[code, partner, cStr_(p.name).slice(0, 100), cStr_(p.email).toLowerCase().slice(0, 120), String(p.cid), new Date(), ends, 'Activo', 0, '']]);
    if (p.email) cMail_(cStr_(p.email), cTxt_(p.lang === 'en' ? 'en' : 'es', 'Kulinaria · tu cupón ' + code, 'Kulinaria · your coupon ' + code), cTxt_(p.lang === 'en' ? 'en' : 'es', '<p>Tu cupón de <b>' + partner + '</b>: <b style="font-size:22px;color:#ff6200">' + code + '</b></p><p>Preséntalo en el establecimiento. Válido mientras tu bloque de 4 semanas esté activo' + (ends ? ' (hasta ' + ends + ')' : '') + '.</p>', '<p>Your <b>' + partner + '</b> coupon: <b style="font-size:22px;color:#ff6200">' + code + '</b></p><p>Show it at the venue. Valid while your 4-week block is active' + (ends ? ' (until ' + ends + ')' : '') + '.</p>'), false);
  } else if (ends) sh.getRange(row, 7).setValue(ends);
  return { ok: true, code: code, partner: partner, expires: ends };
}
/** Public check a partner can call (no personal data): is this code valid right now? */
function circleCouponCheck_(p) {
  var code = cStr_(p.code).toUpperCase(), row = cFindRow_('Cupones', 1, code); if (!row) return { ok: true, valid: false, reason: 'unknown' };
  var r = cSheet_('Cupones').getRange(row, 1, 1, 10).getValues()[0], cid = cStr_(r[4]);
  var cr = null; try { cr = creditsFor_(cid); } catch (e) {}
  var valid = !!(cr && cr.hasPlan && cr.plan === 'block') && cStr_(r[7]) !== 'Revocado';
  return { ok: true, valid: valid, partner: cStr_(r[1]), expires: cStr_(r[6]), reason: valid ? '' : 'inactive' };
}

/* ---------- lead notifications: nutrition consults, trainers, gyms, partner-gym applications ---------- */
function circleLeadNotify_(kind, b, detail) {
  var lang = b.lang === 'en' ? 'en' : 'es', f = b.fields || {}, owner = cProp_('ALERT_EMAILS', ''), name = cStr_(b.name), email = cStr_(b.email);
  var box = '<p style="background:#f6f6f6;padding:12px;border-radius:10px;white-space:pre-line">' + detail.replace(/</g, '&lt;') + '</p>';
  var who = '<p><b>' + name + '</b> · ' + email + (b.phone ? ' · ' + b.phone : '') + '</p>';
  var send = function (to, subj, html, bcc) { if (!to || to === owner) return; cMail_(to, subj, html, bcc); };
  var ack = function (es, en) { cMail_(email, cTxt_(lang, 'Kulinaria · recibimos tu solicitud', 'Kulinaria · we got your request'), cTxt_(lang, '<p>Hola ' + name + ', ' + es + '</p>', '<p>Hi ' + name + ', ' + en + '</p>'), false); };
  if (kind === 'consulta') { send(cProp_('NUTRI_EMAIL', owner), 'Consulta nutricional · ' + name, who + box, false); ack('recibimos tu solicitud de consulta con Ángel Otero. Te escribimos para acordar día y horario.', 'we got your consultation request with Ángel Otero. We will email you to agree a day and time.'); }
  else if (kind === 'entrenador') {
    var tr = cRows_('Entrenadores').filter(function (r) { return cStr_(r[0]).toLowerCase() === cStr_(f.entrenador).toLowerCase() && cStr_(r[5]) !== 'No'; })[0];
    send(tr && cStr_(tr[3]) ? cStr_(tr[3]) : owner, 'Nuevo alumno · ' + name, who + box, true);
    ack('recibimos tu solicitud para entrenar' + (f.entrenador ? ' con ' + f.entrenador : '') + '. Te contactan en breve.', 'we got your request to train' + (f.entrenador ? ' with ' + f.entrenador : '') + '. They will contact you shortly.');
  } else if (kind === 'sede') {
    var gy = cRows_('Gimnasios').filter(function (r) { return cStr_(r[0]).toLowerCase() === cStr_(f.sede).toLowerCase() && cStr_(r[7]) !== 'No'; })[0];
    send(gy && cStr_(gy[4]) ? cStr_(gy[4]) : owner, 'Punto de entrega · ' + name, who + box, true);
    ack('recibimos tu solicitud de sede. Te confirmamos la más cercana a tu zona.', 'we got your gym request. We will confirm the closest one to your area.');
  } else if (kind === 'gimnasio') { send(owner, 'Gimnasio quiere afiliarse · ' + cStr_(f.gimnasio), who + box, false); ack('gracias por tu interés en sumar tu sede a la red Kulinaria. Agendamos tu reunión y te confirmamos por correo.', 'thanks for your interest in joining the Kulinaria network. We will schedule your meeting and confirm by email.'); }
  else if (kind === 'plan') { send(owner, 'Plan 2-3 bloques · ' + name, who + box, false); ack('recibimos tu solicitud. Te contactamos para activar tu plan.', 'we got your request. We will contact you to activate your plan.'); }
  else if (kind === 'carta') { send(owner, 'Evento privado · ' + name, who + box, false); ack('recibimos tu solicitud de evento privado. Nuestro chef te envía una propuesta.', 'we got your private event request. Our chef will send you a proposal.'); }
}

/* ---------- admin API (key-protected): called from Code.gs adminApi_ for every action that starts with circle_ ---------- */
function circleAdmin_(p) {
  var act = String(p.action), lock = LockService.getScriptLock();
  if (act === 'circle_data') return circleAdminData_();
  lock.waitLock(20000);
  try {
    if (act === 'circle_class_save') {
      var key = cStr_(p.ckey) || (cStr_(p.sport || 'clase') + '-' + cStr_(p.date)), row = cFindRow_('Clases', 1, key), sh = cSheet_('Clases');
      var vals = [key, cStr_(p.sport), cStr_(p.title), cStr_(p.coach), cStr_(p.date), cStr_(p.time) || '09:00', cStr_(p.venue), Number(p.cap) || 10, Number(p.min) || 1, Number(p.price) || 0, cStr_(p.status) || 'Abierta', cStr_(p.art), p.limit === '' || p.limit == null ? 24 : Number(p.limit), '', cStr_(p.desc).slice(0, 600)];
      if (row) { vals[13] = sh.getRange(row, 14).getValue(); sh.getRange(row, 1, 1, 15).setValues([vals]); } else sh.getRange(sh.getLastRow() + 1, 1, 1, 15).setValues([vals]);
      sh.getRange(row || sh.getLastRow(), 5).setNumberFormat('@'); return circleAdminData_();
    }
    if (act === 'circle_class_cancel') {
      var rc = cFindRow_('Clases', 1, p.ckey); if (!rc) return { ok: false, error: 'no_class' };
      var c = cClasses_().filter(function (k) { return k.key === String(p.ckey); })[0]; cSheet_('Clases').getRange(rc, 11).setValue('Cancelada');
      cReservas_().filter(function (x) { return x.cls === c.key && /^(Pendiente|Confirmada|En espera)$/.test(x.status); }).forEach(function (x) { circleSetRes_(x.id, 'Cancelada'); cMail_(x.email, cTxt_(x.lang, 'Kulinaria · clase cancelada', 'Kulinaria · class cancelled'), cTxt_(x.lang, '<p>Hola ' + x.name + ', tuvimos que cancelar <b>' + c.title + '</b> (' + cWhen_(c) + '). Disculpa la molestia; no se te cobró nada.</p>', '<p>Hi ' + x.name + ', we had to cancel <b>' + c.title + '</b> (' + cWhen_(c) + '). Sorry about that; nothing was charged.</p>'), false); });
      return circleAdminData_();
    }
    if (act === 'circle_res_set') {
      var st = String(p.status || ''); if (!/^(Pendiente|Confirmada|En espera|Cancelada)$/.test(st)) return { ok: false, error: 'bad_status' };
      var r0 = cReservas_().filter(function (x) { return x.id === String(p.id); })[0]; if (!r0) return { ok: false, error: 'no_res' };
      circleSetRes_(p.id, st, p.paid ? String(p.paid) : '');
      var cl = cClasses_().filter(function (k) { return k.key === r0.cls; })[0];
      if (cl && st !== r0.status) { r0.status = st; if (st === 'Confirmada') cMailBook_(r0, cl, 'Confirmada'); else if (st === 'Cancelada') cMail_(r0.email, cTxt_(r0.lang, 'Kulinaria · reserva cancelada', 'Kulinaria · booking cancelled'), cTxt_(r0.lang, '<p>Hola ' + r0.name + ', tu reserva de <b>' + cl.title + '</b> fue cancelada. Escríbenos si tienes dudas.</p>', '<p>Hi ' + r0.name + ', your booking for <b>' + cl.title + '</b> was cancelled. Write to us if you have questions.</p>'), false); }
      return circleAdminData_();
    }
    if (act === 'circle_coupon_redeem') {
      var rw = cFindRow_('Cupones', 1, cStr_(p.code).toUpperCase()); if (!rw) return { ok: false, error: 'unknown' };
      var chk = circleCouponCheck_({ code: p.code }); if (!chk.valid) return { ok: false, error: 'inactive' };
      var shc = cSheet_('Cupones'); shc.getRange(rw, 9).setValue((Number(shc.getRange(rw, 9).getValue()) || 0) + 1); shc.getRange(rw, 10).setValue(new Date());
      return circleAdminData_();
    }
    if (act === 'circle_coupon_revoke') { var rv = cFindRow_('Cupones', 1, cStr_(p.code).toUpperCase()); if (rv) cSheet_('Cupones').getRange(rv, 8).setValue(p.undo ? 'Activo' : 'Revocado'); return circleAdminData_(); }
    if (act === 'circle_dir_save') {
      var tab = p.tab === 'gym' ? 'Gimnasios' : 'Entrenadores', col = 1, nm = cStr_(p.name); if (!nm) return { ok: false, error: 'bad_name' };
      var rr = cFindRow_(tab, col, nm), shd = cSheet_(tab);
      var v2 = tab === 'Entrenadores' ? [nm, cStr_(p.role), cStr_(p.zone), cStr_(p.email), cStr_(p.phone), p.active === 'No' ? 'No' : 'Sí'] : [nm, cStr_(p.zone), cStr_(p.address), cStr_(p.contact), cStr_(p.email), cStr_(p.phone), p.pickup === 'No' ? 'No' : 'Sí', p.active === 'No' ? 'No' : 'Sí'];
      if (rr) shd.getRange(rr, 1, 1, v2.length).setValues([v2]); else shd.getRange(shd.getLastRow() + 1, 1, 1, v2.length).setValues([v2]);
      return circleAdminData_();
    }
    if (act === 'circle_dir_del') { var tab2 = p.tab === 'gym' ? 'Gimnasios' : 'Entrenadores', rd = cFindRow_(tab2, 1, cStr_(p.name)); if (rd) cSheet_(tab2).deleteRow(rd); return circleAdminData_(); }
    if (act === 'circle_tick') { circleTick(); return circleAdminData_(); }
  } finally { lock.releaseLock(); }
  return { ok: false, error: 'unknown' };
}
function circleAdminData_() {
  var res = cReservas_();
  return {
    ok: true,
    classes: cClasses_().map(function (c) { return { key: c.key, sport: c.sport, title: c.title, coach: c.coach, date: c.date, time: c.time, venue: c.venue, cap: c.cap, min: c.min, price: c.price, status: c.status, art: c.art, limit: c.limit, taken: cTaken_(c.key, res) }; }),
    reservas: res,
    coupons: cRows_('Cupones').map(function (r) { return { code: cStr_(r[0]), partner: cStr_(r[1]), name: cStr_(r[2]), email: cStr_(r[3]), issued: r[5] instanceof Date ? r[5].toISOString() : cStr_(r[5]), expires: cStr_(r[6]), status: cStr_(r[7]), uses: Number(r[8]) || 0, last: r[9] instanceof Date ? r[9].toISOString() : cStr_(r[9]) }; }),
    trainers: cRows_('Entrenadores').map(function (r) { return { name: cStr_(r[0]), role: cStr_(r[1]), zone: cStr_(r[2]), email: cStr_(r[3]), phone: cStr_(r[4]), active: cStr_(r[5]) || 'Sí' }; }),
    gyms: cRows_('Gimnasios').map(function (r) { return { name: cStr_(r[0]), zone: cStr_(r[1]), address: cStr_(r[2]), contact: cStr_(r[3]), email: cStr_(r[4]), phone: cStr_(r[5]), pickup: cStr_(r[6]) || 'Sí', active: cStr_(r[7]) || 'Sí' }; })
  };
}
