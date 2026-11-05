const fs = require('fs');
const code = fs.readFileSync('' + require('path').join(__dirname, '../backend/google-sheets/RecetasAuto.gs') + '', 'utf8');
const { draftRecipe_ } = new Function(code + ';return {draftRecipe_};')();
const dishes = [
  ['Pollo a las hierbas con puré rústico', ['Pollo', 'Papa', 'Mantequilla', 'Hierbas finas'], 480, 'diario-premium'],
  ['Bowl de res magra y quinoa', ['Res magra', 'Quinoa', 'Aguacate', 'Cilantro'], 560, 'bowls-de-la-semana'],
  ['Salmón gourmet en costra de almendras', ['Salmón', 'Almendra', 'Eneldo', 'Espárragos', 'Jitomate cherry', 'Limón'], 520, 'al-fuego-y-mar'],
  ['Omelette de claras con espinaca', ['Claras', 'Espinaca', 'Champiñones'], 310, 'desayunos-premium'],
  ['Arrachera al carbón con maíz y espárragos', ['Arrachera', 'Maíz', 'Espárragos', 'Micro hierbas'], 640, 'al-fuego-y-mar'],
  ['Filete Prime con verduras asadas', ['Res Prime', 'Brócoli', 'Zanahoria', 'Mantequilla'], 710, 'al-fuego-y-mar'],
  ['Bowl vegano de garbanzo y tahini', ['Garbanzo', 'Tahini', 'Pepino', 'Cebolla'], 450, 'bowls-de-la-semana'],
  ['Crema de calabaza asada', ['Calabaza', 'Crema', 'Semillas de calabaza', 'Tomillo'], 220, 'sopas-y-entradas'],
  ['Brownie proteico con frambuesa', ['Cacao', 'Huevo', 'Frambuesa', 'Proteína'], 260, 'postres-y-snacks'],
  ['Batido verde de pepino y kiwi', ['Espinaca', 'Pepino', 'Kiwi', 'Limón'], 150, 'batidos-y-bebidas'],
  ['Mini pasta de pollo para peques', ['Pasta', 'Pollo', 'Queso', 'Jitomate'], 380, 'kulinaria-junior']];
let bad = 0;
dishes.forEach(([title, ing, kcal, category]) => {
  const d = draftRecipe_({ title, ingredients: ing, kcal, category });
  const off = Math.abs(d.kcal - kcal) / kcal;
  const grams = d.rows.filter((r) => r[3] === 'g').reduce((a, r) => a + r[2], 0);
  const flag = off > 0.12 || d.unknown.length || d.rows.some((r) => !(r[2] > 0)) ? 'CHECK' : 'ok   ';
  if (flag === 'CHECK') bad++;
  console.log(flag, title.padEnd(42), 'target', kcal, 'draft', d.kcal, 'x' + d.factor.toFixed(2), 'rows', d.rows.length, 'unknown:', d.unknown.join(',') || '-', '|', d.rows.map((r) => r[1] + ' ' + r[2] + r[3]).join(', ').slice(0, 110));
});
console.log(bad ? bad + ' to review' : 'all drafts within 12% of the dish calories, no unknown ingredients');
