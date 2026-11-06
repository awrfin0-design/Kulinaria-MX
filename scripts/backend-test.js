// Offline test of backend/google-sheets/Code.gs with stubs of the Apps Script services.   node scripts/backend-test.js
const fs = require('fs'), crypto = require('crypto');
const code = fs.readFileSync(require('path').join(__dirname, '../backend/google-sheets/Code.gs'), 'utf8');
const sheets = {}, mails = [], fetched = []; let fetchReply = () => ({ data: {} });
const mkSheet = (n) => { const rows = []; const sh = { name: n, rows,
  getLastRow: () => rows.length, getLastColumn: () => Math.max(1, ...rows.map((r) => r.length)),
  getRange: (r, c, nr, nc) => {
    if (typeof r === 'string') { const noop = { setNumberFormat() { return noop; }, setFontWeight() { return noop; } }; return noop; }
    const api = { getValues: () => { const out = []; for (let i = 0; i < (nr || 1); i++) { const row = rows[r - 1 + i] || []; out.push(Array.from({ length: nc || 1 }, (_, k) => row[c - 1 + k] === undefined ? '' : row[c - 1 + k])); } return out; },
      getValue: () => { const row = rows[r - 1] || []; return row[c - 1] === undefined ? '' : row[c - 1]; },
      setValues: (v) => { v.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((x, k) => { rows[r - 1 + i][c - 1 + k] = x; }); }); return api; },
      setValue: (x) => { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = x; return api; },
      clearContent: () => { for (let i = 0; i < (nr || 1); i++) if (rows[r - 1 + i]) rows[r - 1 + i].splice(c - 1, nc || 1); for (let i = rows.length - 1; i >= 0; i--) if (rows[i] && !rows[i].some((x) => x !== undefined && x !== '')) { if (i === rows.length - 1) rows.pop(); } return api; }, setFontWeight() { return api; }, setBackground() { return api; }, setFontColor() { return api; }, setFormula() { return api; }, setNumberFormat() { return api; } };
    return api; },
  appendRow: (row) => { rows.push(row); }, deleteRow: (i) => { rows.splice(i - 1, 1); }, setFrozenRows() {}, clear() { rows.length = 0; }, clearContents() { rows.length = 0; } };
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
    formatDate: (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') },
  UrlFetchApp: { fetch: (url, opt) => { fetched.push({ url, opt }); return { getResponseCode: () => 200, getContentText: () => JSON.stringify(fetchReply(JSON.parse(opt.payload))) }; } },
  ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ create() {} }) }) }) }) } };
const fn = new Function(...Object.keys(env), code + ';return {doPost,doGet,sendWeeklyReminders,weekSet_,creditsFor_,rebuildDeliveries_,resolveOrderWeeks_,loadOrders_,loadSelections_,allowedMonday_,parseSlots_,pauseSet_,loadPauses_};')(...Object.values(env));
let fails = 0; const ok = (name, c, extra) => { console.log((c ? 'ok   ' : 'FAIL ') + name + (c ? '' : ' :: ' + (extra || ''))); if (!c) fails++; };
const J = (r) => JSON.parse(r.s);
const NOW = new Date(2026, 10, 5, 9);            // Thursday 5 Nov 2026, 09:00 (the plan below starts Monday 9 Nov)

// ------------------------------------------------------------ 1. order webhook: plan line, weekday slots (empty days kept), customer id
const dias = 'Lunes 9 nov: Pollo a las hierbas con puré rústico | Martes 10 nov:  | Miércoles 11 nov: Bowl de res magra y quinoa | Jueves 12 nov:  | Viernes 13 nov: Crema de calabaza asada';
const order = { id: 1, name: '#1001', created_at: '2026-11-04T12:00:00-06:00', updated_at: '2026-11-04T12:00:00-06:00', email: 'a@x.com', total_price: '3600.00', currency: 'MXN', financial_status: 'paid',
  customer: { id: 5, first_name: 'Ana', last_name: 'Pérez', email: 'a@x.com' },
  note_attributes: [{ name: 'plan', value: 'block' }, { name: 'nivel', value: 'selecto' }, { name: 'alergias', value: 'Mariscos' }, { name: 'dias', value: dias }, { name: 'direccion', value: 'Calle Lago 24' }, { name: 'alerta_alergias', value: 'Salmón gourmet' }],
  line_items: [{ title: 'Plan semanal Selecto', variant_title: '4 semanas', quantity: 1, price: '3600.00', properties: [{ name: 'Lunes 9 nov', value: 'Pollo a las hierbas con puré rústico' }, { name: '_platillos', value: '1× Pollo a las hierbas con puré rústico | 1× Bowl de res magra y quinoa | 1× Crema de calabaza asada' }] }] };
let r = J(fn.doPost({ parameter: { key: 'k', topic: 'orders-create' }, postData: { contents: JSON.stringify(order) } }));
ok('order webhook accepted', r.ok, JSON.stringify(r));
const row = sheets.Pedidos.rows[1];
ok('the order keeps WHICH weekdays have a meal (3 meals, Tue and Thu empty) and the customer id', JSON.stringify(JSON.parse(row[20])) === JSON.stringify(['Pollo a las hierbas con puré rústico', '', 'Bowl de res magra y quinoa', '', 'Crema de calabaza asada']) && row[21] === '5', JSON.stringify(row.slice(20)));
ok('dish rows come from the hidden _platillos property', sheets.Platillos.rows.length === 4, JSON.stringify(sheets.Platillos.rows));
ok('new-order alert e-mail sent once with the day plan and the allergy warning', mails.length === 1 && /Lunes 9 nov/.test(mails[0].body) && /PUEDEN contener sus alergias: Salmón gourmet/.test(mails[0].body), mails[0] && mails[0].body);
fn.doPost({ parameter: { key: 'k', topic: 'orders-create' }, postData: { contents: JSON.stringify(order) } });
ok('re-delivery of the same webhook does not duplicate the order or the e-mail', sheets.Pedidos.rows.length === 2 && mails.length === 1);
ok('webhook without the key is refused', J(fn.doPost({ parameter: { topic: 'orders-create' }, postData: { contents: '{}' } })).ok === false);
ok('the delivery report tabs exist after an order', !!sheets.Entregas && !!sheets.Resumen);

// ------------------------------------------------------------ 2. profile only with the signed token
const prof = { info: { name: 'Ana Pérez', email: 'a@x.com', phone: '999' }, checks: ['Mariscos'], allergies: ['Mariscos'], dislikes: ['cebolla'], diets: ['Keto'] };
ok('profile write with a wrong token is refused', J(fn.doPost({ parameter: {}, postData: { contents: JSON.stringify({ action: 'profile', cid: 5, token: 'bad', profile: prof }) } })).ok === false);
ok('profile write with the signed token works', J(fn.doPost({ parameter: {}, postData: { contents: JSON.stringify({ action: 'profile', cid: 5, token: token(5), profile: prof }) } })).ok === true);
r = J(fn.doGet({ parameter: { action: 'profile', cid: '5', token: token(5) } }));
ok('profile read returns what was saved', r.ok && r.profile.info.email === 'a@x.com' && r.profile.allergies[0] === 'Mariscos');
ok('another customer cannot read it', J(fn.doGet({ parameter: { action: 'profile', cid: '5', token: token(6) } })).ok === false);

// ------------------------------------------------------------ 3. credits: weeks left, meals planned, which weeks can still be chosen
let cr = fn.creditsFor_(5, NOW);
ok('credits: an active 4-week plan has 4 weeks left and the weeks 2-4 can be chosen', cr.hasPlan && cr.plan === 'block' && cr.weeksLeft === 4 && cr.weeksTotal === 4 && cr.editable.join() === '2026-11-16,2026-11-23,2026-11-30' && cr.endsOn === '2026-11-30', JSON.stringify(cr));
ok('credits: meals planned = 3 per week (the first week repeats automatically) of 20', cr.mealsPlanned === 12 && cr.mealsMax === 20, JSON.stringify(cr));
ok('credits over the web need the signed token', J(fn.doGet({ parameter: { action: 'credits', cid: '5', token: 'bad' } })).ok === false && J(fn.doGet({ parameter: { action: 'credits', cid: '5', token: token(5) } })).hasPlan === true);
ok('a customer who never paid has no plan', fn.creditsFor_(77, NOW).hasPlan === false);

// ------------------------------------------------------------ 4. weekly choices
const set = (cid, week, days, up, now) => fn.weekSet_(cid, token(cid), { week, days, upgrade: up || 0, now: (now || NOW).toISOString() });
const Z = 'Crema de calabaza asada', B = 'Bowl de res magra y quinoa', P = 'Pollo a las hierbas con puré rústico', F = 'Filete Prime con verduras asadas';
ok('a customer WITHOUT a paid plan cannot save a week', set(77, '2026-11-16', [P, '', '', '', ''], 0).error === 'no_plan');
ok('week 1 comes with the order and cannot be changed in "Mi semana"', set(5, '2026-11-09', [P, P, P, P, P], 0).error === 'not_covered');
ok('a week after the plan ends is not covered', set(5, '2026-12-07', [P, '', '', '', ''], 0).error === 'not_covered');
ok('a date that is not a Monday is refused', set(5, '2026-11-17', [P], 0).ok === false);
ok('a week whose Saturday cut-off has passed is refused by the server', set(5, '2026-11-16', [P, '', '', '', ''], 0, new Date(2026, 10, 14, 11)).error === 'closed');
let s = set(5, '2026-11-16', [P, '', B, '', Z], 0);
ok('three meals on Monday, Wednesday and Friday are accepted (not 5 required) and confirmed', s.ok && s.status === 'Confirmada' && s.meals === 3, JSON.stringify(s));
s = set(5, '2026-11-23', ['', '', '', '', ''], 0);
ok('a whole week can be skipped on purpose', s.ok && s.meals === 0, JSON.stringify(s));
ok('a wrong token cannot save a week', J(fn.doGet({ parameter: { action: 'weekset', cid: '5', token: 'bad', week: '2026-11-30', days: 'x' } })).ok === false);
const planOrder = () => fn.loadOrders_().filter((o) => o.isPlan)[0];
const wk = fn.resolveOrderWeeks_(planOrder(), fn.loadSelections_());
ok('resolver: week 1 = the order, week 2 = chosen, week 3 = skipped, week 4 = repeats the last non-empty choice', wk.map((w) => w.src).join() === 'pedido,elegida,saltada,automática' && wk[2].items.length === 0 && JSON.stringify(wk[3].slots) === JSON.stringify([P, '', B, '', Z]), JSON.stringify(wk.map((w) => [w.week, w.src])));
r = J(fn.doGet({ parameter: { action: 'week', cid: '5', token: token(5), week: '2026-11-16' } }));
ok('week read returns the saved choice with the weekday positions', r.ok && JSON.stringify(r.selection.slots) === JSON.stringify([P, '', B, '', Z]), JSON.stringify(r));
r = J(fn.doGet({ parameter: { action: 'week', cid: '5', token: token(5), week: '2026-11-30' } }));
ok('an unchosen week offers the previous non-empty choice', r.ok && r.selection === null && r.previous && r.previous.week === '2026-11-16' && r.previous.slots[2] === B, JSON.stringify(r));
// an upgrade waits for payment, and the order webhook with the hidden _semana property confirms it
s = set(5, '2026-11-30', [F, '', '', '', ''], 210);
ok('a week with a higher-tier dish waits for payment', s.status === 'Pendiente de pago');
ok('a week that is still unpaid is not counted for the kitchen yet (it keeps the automatic choice)', fn.resolveOrderWeeks_(planOrder(), fn.loadSelections_())[3].src === 'automática');
fn.doPost({ parameter: { key: 'k', topic: 'orders-create' }, postData: { contents: JSON.stringify(Object.assign({}, order, { id: 2, name: '#1002', line_items: [{ title: 'Mejora de platillo', variant_title: '+3 niveles', quantity: 1, price: '210.00', properties: [{ name: 'Mejora', value: F }, { name: '_semana', value: '2026-11-30' }] }] })) } });
ok('an upgrade-only order (leftover plan attributes in its cart) is NOT counted as a second plan', fn.loadOrders_().filter((o) => o.isPlan).length === 1 && fn.creditsFor_(5, NOW).weeksTotal === 4);
ok('paying the upgrade confirms that week (Pagada) and the kitchen now sees it', fn.resolveOrderWeeks_(planOrder(), fn.loadSelections_())[3].src === 'elegida');

// ------------------------------------------------------------ 5. delivery report + summary (which days we deliver, totals)
fn.rebuildDeliveries_(NOW);
const ent = sheets.Entregas.rows.slice(1).filter((x) => x[1] === 'Ana Pérez' || x[1] === 'Ana' || x[1]);
const byWeek = {}; ent.forEach((x) => { byWeek[x[0]] = x; });
ok('Entregas: one row per customer and delivery week (4 weeks)', Object.keys(byWeek).length === 4, Object.keys(byWeek).join());
ok('Entregas: week 1 delivers Monday, Wednesday and Friday', byWeek['2026-11-09'][9] === 'Lunes, Miércoles, Viernes' && byWeek['2026-11-09'][10] === 3, JSON.stringify(byWeek['2026-11-09']));
ok('Entregas: the skipped week says there is nothing to deliver', /sin entregas/.test(byWeek['2026-11-23'][9]) && byWeek['2026-11-23'][10] === 0 && byWeek['2026-11-23'][12] === 'saltada', JSON.stringify(byWeek['2026-11-23']));
ok('Entregas: shows address, phone and allergies for the courier and the kitchen', byWeek['2026-11-16'][3] === 'Calle Lago 24' && byWeek['2026-11-16'][11] === 'Mariscos');
const res = sheets.Resumen.rows.map((x) => x.join('|')).join('\n');
ok('Resumen: has a block for next week with deliveries and meals per weekday', /Próxima semana · lunes 2026-11-09/.test(res) && /Lunes\|1\|1/.test(res) && /Martes\|0\|0/.test(res) && /Miércoles\|1\|1/.test(res) && /Total de comidas\|\|3/.test(res), res.slice(0, 400));
ok('Resumen: lists the dishes to cook per weekday with totals', new RegExp('^' + P + '\\|1\\|0\\|0\\|0\\|0\\|1$', 'm').test(res));
ok('Resumen: totals for all weeks and active plans', /Planes activos \(clientes\)\|1/.test(res) && /2026-11-23\|1\|0\|1\|0/.test(res), res.slice(-300));
const adm = J(fn.doGet({ parameter: { action: 'admin', key: 'adm' } }));
ok('admin export: every order carries what to cook each delivery week (skipped week is empty)', adm.ok && adm.orders[0].byWeek['2026-11-23'].length === 0 && adm.orders[0].byWeek['2026-11-16'].length === 3 && adm.orders[0].cid === '5', JSON.stringify(adm.orders[0].byWeek).slice(0, 200));

// ------------------------------------------------------------ 6. reminders (fixed dates; rows seeded by hand)
sheets.Selecciones.rows.length = 1;
sheets.Selecciones.rows.push(['5', 'a@x.com', '2026-11-16', '[]', '', 0, 'Confirmada', new Date(), '[]'], ['5', 'a@x.com', '2026-11-23', '[]', '', 210, 'Pendiente de pago', new Date(), '[]']);
mails.length = 0;
fn.sendWeeklyReminders(new Date(2026, 10, 12, 9)); const m1 = mails.length;
fn.sendWeeklyReminders(new Date(2026, 10, 26, 9)); const m2 = mails.length - m1;
fn.sendWeeklyReminders(new Date(2026, 10, 25, 9)); const m3 = mails.length - m1 - m2;
fn.sendWeeklyReminders(new Date(2026, 11, 10, 9)); const m4 = mails.length - m1 - m2 - m3;
ok('reminders: none if the next week is already chosen, one when it is not, none on other weekdays or after the plan ends', m1 === 0 && m2 === 1 && m3 === 0 && m4 === 0, [m1, m2, m3, m4].join());
ok('reminder e-mail links to Mi semana and says it is the last week when it is', mails[0] && /kulinariamx.com\/pages\/cuenta-semana/.test(mails[0].body) && /última semana/.test(mails[0].body) && mails[0].to === 'a@x.com', mails[0] && mails[0].body);
// ------------------------------------------------------------ 7. pauses: paused Mondays are not delivered and the plan ends later
const pause = (body, cid, now) => fn.pauseSet_(cid == null ? 5 : cid, token(cid == null ? 5 : cid), Object.assign({ now: (now || NOW).toISOString() }, body));
ok('pause needs the signed token', fn.pauseSet_(5, 'bad', { mode: 'weeks', weeks: ['2026-11-16'] }).error === 'forbidden');
ok('a customer without a plan cannot pause', pause({ mode: 'weeks', weeks: ['2026-11-16'] }, 77).error === 'no_plan');
ok('a week whose cut-off has passed cannot be paused', pause({ mode: 'weeks', weeks: ['2026-11-09'] }, 5, new Date(2026, 10, 7, 11)).error === 'closed');
ok('only Mondays can be paused', pause({ mode: 'weeks', weeks: ['2026-11-17'] }).ok === false);
let pr = pause({ mode: 'weeks', weeks: ['2026-11-16'] });
ok('pausing one week keeps the weeks left and pushes the end of the plan one week later', pr.ok && pr.weeksLeft === 4 && pr.endsOn === '2026-12-07' && pr.paused.join() === '2026-11-16', JSON.stringify(pr));
fn.rebuildDeliveries_(NOW);
const rows7 = sheets.Entregas.rows.slice(1).map((x) => x[0]);
ok('Entregas: the paused Monday disappears and the extra week appears at the end', rows7.indexOf('2026-11-16') < 0 && rows7.indexOf('2026-12-07') >= 0, rows7.join());
ok('Resumen counts the customers on pause', sheets.Resumen.rows.some((x) => /en pausa/.test(String(x[0]))));
ok('a paused week can no longer be chosen in Mi semana', set(5, '2026-11-16', [P, '', '', '', ''], 0).error === 'not_covered');
pr = pause({ mode: 'resume', week: '2026-11-16' });
ok('resuming gives the week back', pr.ok && pr.paused.length === 0 && pr.endsOn === '2026-11-30', JSON.stringify(pr));
pr = pause({ mode: 'from', week: '2026-11-23' });
ok('an open pause from a Monday: the plan has no end date and the remaining weeks wait', pr.ok && pr.pausedFrom === '2026-11-23' && pr.endsOn === '' && pr.weeksLeft === 4 && pr.hasPlan, JSON.stringify(pr));
fn.rebuildDeliveries_(NOW);
ok('Entregas stops at the pause', Math.max(...sheets.Entregas.rows.slice(1).map((x) => Date.parse(x[0]) || 0)) === Date.parse('2026-11-16'));
mails.length = 0; fn.sendWeeklyReminders(new Date(2026, 10, 26, 9));
ok('no reminder e-mails while paused', mails.length === 0);
pr = pause({ mode: 'resume', week: '2026-12-07' });
ok('resuming after an open pause: the weeks before are paused, the plan ends after the pause', pr.ok && pr.paused.join() === '2026-11-23,2026-11-30' && pr.pausedFrom === '' && pr.endsOn === '2026-12-14', JSON.stringify(pr));
pause({ mode: 'resume', week: '2026-11-09' });
ok('resume from the first open week clears everything', fn.creditsFor_(5, NOW).paused.length === 0 && fn.creditsFor_(5, NOW).endsOn === '2026-11-30');

// ------------------------------------------------------------ 8. discount codes (admin)
const dq = (o) => J(fn.doGet({ parameter: Object.assign({ key: 'adm' }, o) }));
ok('discounts need the admin key', J(fn.doGet({ parameter: { action: 'discounts', key: 'x' } })).error === 'forbidden');
ok('without the Shopify token the admin gets a clear error', dq({ action: 'discounts' }).error === 'no_token');
props.SHOPIFY_STORE = 'x.myshopify.com'; props.SHOPIFY_TOKEN = 'shpat_x';
fetchReply = () => ({ data: { discountCodeBasicCreate: { codeDiscountNode: { id: 'gid://shopify/DiscountCodeNode/9' }, userErrors: [] } } });
ok('bad code / value / uses are refused before calling Shopify', dq({ action: 'discount_new', code: 'a b', kind: 'percent', value: 10, uses: 5 }).error === 'bad_code' && dq({ action: 'discount_new', code: 'HOLA10', kind: 'percent', value: 120, uses: 5 }).error === 'bad_value' && dq({ action: 'discount_new', code: 'HOLA10', kind: 'percent', value: 10, uses: 0 }).error === 'bad_uses' && fetched.length === 0);
r = dq({ action: 'discount_new', code: 'hola10', kind: 'percent', value: '10', uses: '25', ends: '2026-12-31' });
const sent = JSON.parse(fetched[0].opt.payload).variables.d;
ok('a percent code is created with the usage limit, the percentage as a fraction, once per customer', r.ok && r.code === 'HOLA10' && sent.code === 'HOLA10' && sent.usageLimit === 25 && sent.customerGets.value.percentage === 0.1 && sent.appliesOncePerCustomer === true && /^2026-12-31T/.test(sent.endsAt) && fetched[0].opt.headers['X-Shopify-Access-Token'] === 'shpat_x', JSON.stringify(r) + JSON.stringify(sent));
dq({ action: 'discount_new', code: 'MENOS200', kind: 'amount', value: '200', uses: '3' });
ok('a fixed-amount code sends the amount', JSON.parse(fetched[1].opt.payload).variables.d.customerGets.value.discountAmount.amount === 200);
fetchReply = () => ({ data: { discountNodes: { nodes: [{ id: 'gid://shopify/DiscountCodeNode/9', discount: { __typename: 'DiscountCodeBasic', status: 'ACTIVE', title: 'HOLA10', usageLimit: 25, asyncUsageCount: 4, endsAt: null, codes: { nodes: [{ code: 'HOLA10' }] }, customerGets: { value: { __typename: 'DiscountPercentage', percentage: 0.1 } } } }] } } });
r = dq({ action: 'discounts' });
ok('the list shows code, uses so far and the limit', r.ok && r.discounts[0].code === 'HOLA10' && r.discounts[0].uses === 4 && r.discounts[0].limit === 25 && r.discounts[0].value === 10 && r.discounts[0].kind === 'percent', JSON.stringify(r));
fetchReply = () => ({ data: { discountCodeDeactivate: { userErrors: [] } } });
ok('a code can be switched off', dq({ action: 'discount_off', id: 'gid://shopify/DiscountCodeNode/9' }).ok && dq({ action: 'discount_off', id: 'x' }).error === 'bad_id');
fetchReply = () => ({ data: { discountCodeBasicCreate: { codeDiscountNode: null, userErrors: [{ message: 'Code must be unique' }] } } });
ok('Shopify errors (duplicate code) reach the admin', /unique/.test(dq({ action: 'discount_new', code: 'HOLA10', kind: 'percent', value: 10, uses: 5 }).detail));
console.log(fails ? fails + ' FAILED' : 'all backend checks passed'); process.exit(fails ? 1 : 0);
