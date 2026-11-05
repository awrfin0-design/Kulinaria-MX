// backend/recipes.json (the source of truth for the default recipes) -> assets/kx-recipes.js (read by the admin page)
// and backend/google-sheets/Recetas.gs (seeds the "Recetas" sheet, which the client then edits).
//   node scripts/render/build-recipes.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend/recipes.json'), 'utf8'));
const dishes = {};
for (const [handle, d] of Object.entries(src.dishes)) dishes[handle] = { title: d.title, ing: d.ing };
fs.writeFileSync(path.join(ROOT, 'assets/kx-recipes.js'),
  `/* Default recipes (per portion) for the admin shopping list. Generated from backend/recipes.json by scripts/render/build-recipes.mjs.\n   The client's own recipes live in the "Recetas" Google Sheet and override these. */\nwindow.KX_RECIPES = ${JSON.stringify({ version: src.version, dishes })};\n`);

const rows = [];
for (const [handle, d] of Object.entries(src.dishes)) for (const [n, q, u, c, w] of d.ing) rows.push([d.title, n, q, u, c, w]);
fs.writeFileSync(path.join(ROOT, 'backend/google-sheets/Recetas.gs'),
`/**
 * Kulinaria MX — "Recetas" sheet: the recipe of every dish, per PORTION. The admin page turns the orders into a shopping list with it.
 * Run seedRecetas() once (it only fills the sheet when it is empty). Then the chef edits the quantities directly in the sheet:
 *   Platillo | Ingrediente | Cantidad | Unidad (g, ml, u) | Categoría (prot, fish, veg, dairy, pantry) | Merma %
 * "Platillo" must match the product title in Shopify. Quantities below are starting estimates, not final recipes.
 */
var RECETAS_SEED = ${JSON.stringify(rows)};

function seedRecetas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Recetas') || ss.insertSheet('Recetas');
  if (sh.getLastRow() > 1) return 'Recetas ya tiene datos; no se sobrescribió.';
  sh.clear();
  sh.getRange(1, 1, 1, 6).setValues([['Platillo', 'Ingrediente', 'Cantidad por porción', 'Unidad', 'Categoría', 'Merma %']]).setFontWeight('bold').setBackground('#1B2316').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  sh.getRange(2, 1, RECETAS_SEED.length, 6).setValues(RECETAS_SEED);
  return 'Recetas creadas: ' + RECETAS_SEED.length + ' ingredientes.';
}
`);
console.log('recipes:', Object.keys(dishes).length, 'dishes,', rows.length, 'ingredient rows');
