/**
 * Kulinaria MX — automatic DRAFT recipes for new dishes.
 *
 * When the client adds a dish in Shopify (tagged "menu-semana", with its ingredient list and calories filled in), this script writes a draft
 * recipe for it into the "Recetas" tab: typical portions per ingredient, scaled so the portion adds up to the dish's calories, plus the
 * kitchen basics (olive oil, salt, pepper, garlic) for savoury dishes. Draft rows are marked "BORRADOR" in column G; the shopping list
 * counts them (so nothing is forgotten) and the admin page shows a warning until the chef approves them (change BORRADOR to APROBADO,
 * or edit the quantities and set APROBADO).
 *
 * These are ESTIMATES from a table of typical portions, not weighed recipes.
 *
 * Setup (once):
 *   1. Shopify admin > Settings > Apps and sales channels > Develop apps > Create an app > Configure Admin API scopes: read_products > Install > copy the Admin API access token.
 *   2. Apps Script > Project Settings > Script properties: SHOPIFY_STORE = your-store.myshopify.com   and   SHOPIFY_TOKEN = shpat_...
 *   3. Run installAutoRecipes() once (it creates a trigger that checks for new dishes every hour), or run autoDraftRecipes() by hand.
 *   Optional: AUTO_KCAL_MAIN (default: use each dish's own calories metafield).
 */

// keyword -> {kcal per 100 g (or per 100 ml), g = typical portion, u = unit, cat, w = waste %, role}
// role: prot | carb | veg | fat | spice | fixed (pieces, never scaled)
var ING_TABLE = [
  ['pechuga de pollo', { k: 165, g: 180, u: 'g', cat: 'prot', w: 8, role: 'prot' }], ['pollo', { k: 165, g: 180, u: 'g', cat: 'prot', w: 8, role: 'prot' }],
  ['res prime', { k: 250, g: 200, u: 'g', cat: 'prot', w: 5, role: 'prot' }], ['filete', { k: 250, g: 200, u: 'g', cat: 'prot', w: 5, role: 'prot' }], ['arrachera', { k: 230, g: 200, u: 'g', cat: 'prot', w: 10, role: 'prot' }],
  ['res', { k: 190, g: 150, u: 'g', cat: 'prot', w: 8, role: 'prot' }], ['cerdo', { k: 240, g: 170, u: 'g', cat: 'prot', w: 8, role: 'prot' }], ['pavo', { k: 135, g: 170, u: 'g', cat: 'prot', w: 8, role: 'prot' }],
  ['salmon', { k: 208, g: 180, u: 'g', cat: 'fish', w: 5, role: 'prot' }], ['atun', { k: 130, g: 170, u: 'g', cat: 'fish', w: 5, role: 'prot' }], ['huachinango', { k: 110, g: 180, u: 'g', cat: 'fish', w: 8, role: 'prot' }],
  ['pescado', { k: 120, g: 180, u: 'g', cat: 'fish', w: 8, role: 'prot' }], ['camaron', { k: 100, g: 130, u: 'g', cat: 'fish', w: 12, role: 'prot' }], ['tofu', { k: 80, g: 150, u: 'g', cat: 'prot', w: 0, role: 'prot' }],
  ['claras', { k: 52, g: 180, u: 'g', cat: 'dairy', w: 0, role: 'prot' }], ['huevo', { k: 78, g: 1, u: 'u', cat: 'dairy', w: 0, role: 'fixed', kcalPiece: 78 }],
  ['garbanzo', { k: 360, g: 60, u: 'g', cat: 'pantry', w: 0, role: 'carb' }], ['lenteja', { k: 350, g: 60, u: 'g', cat: 'pantry', w: 0, role: 'carb' }], ['frijol', { k: 340, g: 60, u: 'g', cat: 'pantry', w: 0, role: 'carb' }],
  ['quinoa', { k: 360, g: 70, u: 'g', cat: 'pantry', w: 0, role: 'carb' }], ['arroz', { k: 360, g: 70, u: 'g', cat: 'pantry', w: 0, role: 'carb' }], ['pasta', { k: 360, g: 70, u: 'g', cat: 'pantry', w: 0, role: 'carb' }],
  ['avena', { k: 380, g: 25, u: 'g', cat: 'pantry', w: 0, role: 'carb' }], ['papa', { k: 77, g: 150, u: 'g', cat: 'veg', w: 15, role: 'carb' }], ['camote', { k: 86, g: 150, u: 'g', cat: 'veg', w: 15, role: 'carb' }],
  ['elote', { k: 86, g: 80, u: 'g', cat: 'veg', w: 5, role: 'carb' }], ['maiz', { k: 86, g: 80, u: 'g', cat: 'veg', w: 5, role: 'carb' }],
  ['aguacate', { k: 160, g: 50, u: 'g', cat: 'veg', w: 30, role: 'fat' }], ['mantequilla', { k: 717, g: 15, u: 'g', cat: 'dairy', w: 0, role: 'fat' }], ['crema', { k: 195, g: 40, u: 'ml', cat: 'dairy', w: 0, role: 'fat' }],
  ['queso', { k: 350, g: 20, u: 'g', cat: 'dairy', w: 0, role: 'fat' }], ['leche', { k: 60, g: 30, u: 'ml', cat: 'dairy', w: 0, role: 'fat' }], ['tahini', { k: 595, g: 25, u: 'g', cat: 'pantry', w: 0, role: 'fat' }],
  ['almendra', { k: 575, g: 25, u: 'g', cat: 'pantry', w: 0, role: 'fat' }], ['nuez', { k: 650, g: 20, u: 'g', cat: 'pantry', w: 0, role: 'fat' }], ['semillas', { k: 560, g: 10, u: 'g', cat: 'pantry', w: 0, role: 'fat' }],
  ['cacao', { k: 228, g: 25, u: 'g', cat: 'pantry', w: 0, role: 'carb' }], ['proteina', { k: 380, g: 20, u: 'g', cat: 'pantry', w: 0, role: 'prot' }], ['endulzante', { k: 0, g: 8, u: 'g', cat: 'pantry', w: 0, role: 'spice' }],
  ['calabaza', { k: 26, g: 250, u: 'g', cat: 'veg', w: 25, role: 'veg' }], ['espinaca', { k: 23, g: 60, u: 'g', cat: 'veg', w: 10, role: 'veg' }], ['brocoli', { k: 34, g: 70, u: 'g', cat: 'veg', w: 15, role: 'veg' }],
  ['zanahoria', { k: 41, g: 70, u: 'g', cat: 'veg', w: 12, role: 'veg' }], ['esparrago', { k: 20, g: 70, u: 'g', cat: 'veg', w: 15, role: 'veg' }], ['pepino', { k: 15, g: 70, u: 'g', cat: 'veg', w: 10, role: 'veg' }],
  ['jitomate', { k: 18, g: 70, u: 'g', cat: 'veg', w: 4, role: 'veg' }], ['champinon', { k: 22, g: 60, u: 'g', cat: 'veg', w: 8, role: 'veg' }], ['cebolla', { k: 40, g: 25, u: 'g', cat: 'veg', w: 10, role: 'veg' }],
  ['lechuga', { k: 15, g: 60, u: 'g', cat: 'veg', w: 12, role: 'veg' }], ['kiwi', { k: 61, g: 80, u: 'g', cat: 'veg', w: 15, role: 'veg' }], ['frambuesa', { k: 52, g: 40, u: 'g', cat: 'veg', w: 5, role: 'veg' }],
  ['fresa', { k: 32, g: 60, u: 'g', cat: 'veg', w: 8, role: 'veg' }], ['mango', { k: 60, g: 100, u: 'g', cat: 'veg', w: 40, role: 'veg' }], ['platano', { k: 89, g: 80, u: 'g', cat: 'veg', w: 30, role: 'veg' }],
  ['limon', { k: 29, g: 15, u: 'g', cat: 'veg', w: 0, role: 'spice' }], ['cilantro', { k: 23, g: 5, u: 'g', cat: 'veg', w: 15, role: 'spice' }], ['eneldo', { k: 43, g: 3, u: 'g', cat: 'veg', w: 10, role: 'spice' }],
  ['tomillo', { k: 100, g: 1, u: 'g', cat: 'veg', w: 0, role: 'spice' }], ['romero', { k: 130, g: 1, u: 'g', cat: 'veg', w: 0, role: 'spice' }], ['hierbas', { k: 40, g: 3, u: 'g', cat: 'pantry', w: 0, role: 'spice' }],
  ['comino', { k: 375, g: 1, u: 'g', cat: 'pantry', w: 0, role: 'spice' }], ['ajo', { k: 149, g: 3, u: 'g', cat: 'veg', w: 10, role: 'spice' }], ['caldo', { k: 4, g: 150, u: 'ml', cat: 'pantry', w: 0, role: 'spice' }]
];
var STAPLES = [['Aceite de oliva', 8, 'ml', 'pantry', 0, 8.8], ['Sal', 2, 'g', 'pantry', 0, 0], ['Pimienta negra', 0.5, 'g', 'pantry', 0, 0], ['Ajo', 3, 'g', 'veg', 10, 1.5]];   // [name, qty, unit, cat, waste, kcal per unit]

function normIng_(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
function lookupIng_(name) {
  var n = normIng_(name), best = null, bestLen = 0;
  ING_TABLE.forEach(function (e) { if (n.indexOf(e[0]) > -1 && e[0].length > bestLen) { best = e[1]; bestLen = e[0].length; } });
  return best;
}
function roundQty_(q, unit) {
  if (unit === 'u') return Math.max(1, Math.round(q));
  if (q >= 20) return Math.round(q / 5) * 5;
  if (q >= 5) return Math.round(q);
  return Math.max(0.5, Math.round(q * 2) / 2);
}

/**
 * dish = { title, ingredients: [names], kcal: number|0, category: 'postres-y-snacks' ... }  ->  { rows: [[Platillo, Ingrediente, Cantidad, Unidad, Categoría, Merma %, Estado]], kcal, unknown: [names] }
 */
function draftRecipe_(dish) {
  var savoury = !/postre|bebida|batido|snack/.test(String(dish.category || ''));
  var items = [], unknown = [], seen = {};
  (dish.ingredients || []).forEach(function (name) {
    var e = lookupIng_(name);
    if (!e) { unknown.push(name); e = { k: 40, g: 70, u: 'g', cat: 'veg', w: 10, role: 'veg' }; }
    items.push({ name: name, e: e, qty: e.g });
    seen[normIng_(name)] = 1;
  });
  var staples = [];
  if (savoury) STAPLES.forEach(function (s) { if (!items.some(function (i) { return normIng_(i.name).indexOf(normIng_(s[0])) > -1 || normIng_(s[0]).indexOf(normIng_(i.name)) > -1; })) staples.push({ name: s[0], qty: s[1], unit: s[2], cat: s[3], w: s[4], kcal: s[5] * s[1] }); });
  var kcalOf = function (i) { return i.e.role === 'fixed' ? (i.e.kcalPiece || 0) * i.qty : i.e.k * i.qty / 100; };
  var fixed = staples.reduce(function (a, s) { return a + s.kcal; }, 0), scalable = 0;
  items.forEach(function (i) { if (i.e.role === 'spice' || i.e.role === 'fixed') fixed += kcalOf(i); else scalable += kcalOf(i); });
  var target = +dish.kcal || 0, f = 1;
  if (target > 0 && scalable > 0) f = Math.max(0.55, Math.min(1.6, (target - fixed) / scalable));
  items.forEach(function (i) { if (i.e.role !== 'spice' && i.e.role !== 'fixed') i.qty = i.qty * f; });
  var rows = [], total = fixed - fixed;
  items.forEach(function (i) { var q = roundQty_(i.qty, i.e.u); i.qty = q; total += kcalOf(i); rows.push([dish.title, i.name, q, i.e.u, i.e.cat, i.e.w, 'BORRADOR']); });
  staples.forEach(function (s) { total += s.kcal; rows.push([dish.title, s.name, s.qty, s.unit, s.cat, s.w, 'BORRADOR']); });
  return { rows: rows, kcal: Math.round(total), unknown: unknown, factor: f };
}

/** Reads the dishes from Shopify and drafts a recipe for every one that has none in "Recetas". Safe to run many times. */
function autoDraftRecipes() {
  var props = PropertiesService.getScriptProperties(), store = props.getProperty('SHOPIFY_STORE'), token = props.getProperty('SHOPIFY_TOKEN');
  if (!store || !token) return 'Falta SHOPIFY_STORE o SHOPIFY_TOKEN en Script properties.';
  var q = '{ products(first: 100, query: "tag:menu-semana") { nodes { title productType ing: metafield(namespace: "kulinaria", key: "ingredients") { value } kcal: metafield(namespace: "kulinaria", key: "calories") { value } cat: metafield(namespace: "kulinaria", key: "category") { value } } } }';
  var res = UrlFetchApp.fetch('https://' + store + '/admin/api/2025-01/graphql.json', { method: 'post', contentType: 'application/json', headers: { 'X-Shopify-Access-Token': token }, payload: JSON.stringify({ query: q }), muteHttpExceptions: true });
  var data = JSON.parse(res.getContentText());
  if (!data.data) return 'Shopify respondió con un error: ' + res.getContentText().slice(0, 200);
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName('Recetas') || ss.insertSheet('Recetas');
  if (sh.getLastRow() < 1) sh.getRange(1, 1, 1, 7).setValues([['Platillo', 'Ingrediente', 'Cantidad por porción', 'Unidad', 'Categoría', 'Merma %', 'Estado']]).setFontWeight('bold');
  sh.getRange(1, 7).setValue('Estado');
  var have = {};
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) { have[normIng_(r[0])] = 1; });
  var added = [];
  data.data.products.nodes.forEach(function (p) {
    if (have[normIng_(p.title)]) return;
    var ings = []; try { ings = JSON.parse(p.ing && p.ing.value || '[]'); } catch (e) {}
    if (!ings.length) return;                                   // nothing to deduce from yet
    var d = draftRecipe_({ title: p.title, ingredients: ings, kcal: p.kcal && +p.kcal.value, category: (p.cat && p.cat.value) || p.productType });
    sh.getRange(sh.getLastRow() + 1, 1, d.rows.length, 7).setValues(d.rows);
    added.push(p.title + ' (' + d.kcal + ' kcal' + (d.unknown.length ? '; sin dato: ' + d.unknown.join(', ') : '') + ')');
  });
  return added.length ? 'Borradores creados: ' + added.join(' | ') : 'No hay platillos nuevos sin receta.';
}

function installAutoRecipes() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'autoDraftRecipes') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('autoDraftRecipes').timeBased().everyHours(1).create();
  return 'Listo: se revisarán platillos nuevos cada hora.';
}
