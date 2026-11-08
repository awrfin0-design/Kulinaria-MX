// Unit cases for the allergy / dislike matcher (runs in the local preview through window.KX_TEST).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch(); const page = await (await b.newContext()).newPage();
await page.addInitScript(() => { try { sessionStorage.setItem('kx-seen', '1'); } catch (e) {} });
await page.goto('file:///home/user/Kulinaria-MX/preview/index.html#/home'); await page.waitForTimeout(800);
// [declared allergies, dish tags, dish ingredients, strict, expected flagged?, label]
const A = [
  [['octopus'], ['mariscos'], ['pulpo a la parrilla'], false, true, 'octopus (English) vs "pulpo" in the list'],
  [['pulpo'], ['mariscos'], ['pulpo'], false, true, 'pulpo vs pulpo'],
  [['pulpp'], [], ['pulpo'], false, true, 'typo "pulpp" still finds pulpo'],
  [['shellfish'], [], ['camaron', 'arroz'], false, true, 'shellfish -> shrimp'],
  [['shellfish'], [], ['pechuga de pollo'], false, false, 'shellfish does not flag chicken'],
  [['Mariscos'], [], ['calamar en su tinta'], false, true, 'mariscos -> squid'],
  [['seafood'], ['mariscos'], ['mezcla de la casa'], false, true, 'seafood vs a dish tagged mariscos'],
  [['mollusks'], [], ['almeja'], false, true, 'mollusks -> clam'],
  [['mollusks'], [], ['camaron'], false, false, 'mollusks do not include shrimp'],
  [['crustaceans'], [], ['langosta'], false, true, 'crustaceans -> lobster'],
  [['octopus'], ['mariscos'], ['mezcla de la casa'], false, true, 'octopus + dish tagged mariscos with no named member -> warn'],
  [['octopus'], ['mariscos'], ['camaron'], false, false, 'octopus + dish that names only shrimp -> not flagged (declared octopus only)'],
  [['octopus'], ['mariscos'], ['camaron'], true, true, 'octopus + strict profile -> whole family flagged'],
  [['Mariscos'], [], ['salmon'], false, false, 'shellfish allergy does not flag fish'],
  [['fish'], [], ['salmon'], false, true, 'fish -> salmon'],
  [['fish'], [], ['salsa de pescado'], false, true, 'fish -> fish sauce'],
  [['tuna'], [], ['atun sellado'], false, true, 'tuna -> atun'],
  [['Gluten'], [], ['harina de maiz'], false, false, 'corn flour is not gluten'],
  [['Gluten'], [], ['pan de masa madre'], false, true, 'sourdough bread is gluten'],
  [['wheat'], [], ['harina de trigo'], false, true, 'wheat -> wheat flour'],
  [['gluten'], [], ['tortilla de maiz'], false, false, 'corn tortilla is not gluten'],
  [['Lácteos'], [], ['leche de almendra'], false, false, 'almond milk is not dairy'],
  [['Lácteos'], [], ['queso fresco'], false, true, 'queso fresco is dairy'],
  [['dairy'], [], ['crema'], false, true, 'dairy -> cream'],
  [['milk'], [], ['leche entera'], false, true, 'milk -> leche'],
  [['lactose'], [], ['yogur griego'], false, true, 'lactose -> yogurt'],
  [['nuts'], [], ['nuez moscada'], false, false, 'nutmeg is not a nut'],
  [['nuts'], [], ['almendras fileteadas'], false, true, 'nuts -> almonds'],
  [['Frutos secos'], [], ['pistache'], false, true, 'frutos secos -> pistachio'],
  [['almond'], [], ['harina de almendra'], false, true, 'almond -> almond flour'],
  [['peanut'], [], ['mantequilla de cacahuate'], false, true, 'peanut -> peanut butter'],
  [['cashew'], ['frutos secos'], ['salsa de la casa'], false, true, 'cashew + dish tagged frutos secos'],
  [['egg'], [], ['yema'], false, true, 'egg -> yolk'],
  [['Huevo'], [], ['berenjena'], false, false, 'berenjena is not egg'],
  [['sesame'], [], ['tahini'], false, true, 'sesame -> tahini'],
  [['soy'], [], ['salsa de soya'], false, true, 'soy -> soy sauce'],
  [['kiwi'], [], ['ensalada de kiwi'], false, true, 'anything typed: exact word in the list'],
  [['Mariscos'], [], [], false, false, 'no ingredients, no tag -> nothing to flag'],
  [[], ['mariscos'], ['camaron'], false, false, 'no declared allergies -> nothing flagged'],
  [['Frutos secos'], [], ['champinones'], false, false, 'mushrooms are not pine nuts ("pinon" hides inside "champinones")'],
  [['peanut'], [], ['mantequilla'], false, false, 'plain butter is not peanut butter'],
  [['Gluten'], [], ['panela'], false, false, 'panela cheese is not bread'],
  [['Mariscos'], [], ['espinaca'], false, false, 'spinach is not seafood'],
  [['egg'], [], ['claras'], false, true, 'egg -> egg whites'],
  [['Frutos secos'], [], ['almendras'], false, true, 'plural ingredient still found']
];
const D = [
  [['onion'], ['cebolla morada'], true, 'onion -> cebolla'],
  [['Cebolla'], ['cebolla blanca'], true, 'cebolla'],
  [['Hongos'], ['champinones'], true, 'hongos -> champiñones'],
  [['mushrooms'], ['champinones'], true, 'mushrooms -> champiñones'],
  [['Picante'], ['chile serrano'], true, 'picante -> chile'],
  [['cilantro'], ['cilantro fresco'], true, 'cilantro'],
  [['Aceitunas'], ['aceitunas negras'], true, 'aceitunas'],
  [['broccoli'], ['brocoli'], true, 'broccoli -> brócoli'],
  [['Mariscos'], ['camaron'], true, 'disliking mariscos covers shrimp'],
  [['cebolla'], ['jitomate'], false, 'no false hit']
];
let bad = 0;
for (const [al, tags, ings, strict, want, label] of A) {
  const got = await page.evaluate(([al, tags, ings, strict]) => window.KX_TEST.allergyHits({ allergies: al, strict }, tags, ings).length > 0, [al, tags, ings, strict]);
  if (got !== want) { bad++; console.log('FAIL allergy:', label, '| got', got, 'want', want); }
}
for (const [dl, ings, want, label] of D) {
  const got = await page.evaluate(([dl, ings]) => window.KX_TEST.dislikeHits({ dislikes: dl }, [], ings).length > 0, [dl, ings]);
  if (got !== want) { bad++; console.log('FAIL dislike:', label, '| got', got, 'want', want); }
}
console.log(bad ? bad + ' failed of ' + (A.length + D.length) : 'all ' + (A.length + D.length) + ' matcher cases passed');
await b.close();
