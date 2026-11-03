// Creates the 11 sample dishes (title, card text, price, tier/category/diets/allergens/ingredients/calories/carbs) in your store.
//   node backend/shopify/seed-dishes.mjs            -> dry run
//   node backend/shopify/seed-dishes.mjs --apply    -> creates the products, tags them "menu-semana" and adds them to the menu collection
// Env: SHOPIFY_STORE, SHOPIFY_ADMIN_TOKEN (scopes: write_products), optional IMAGE_BASE_URL (public folder that serves photo-dish-N.webp)
// Run backend/shopify/setup.mjs first (it creates the metafield definitions and the collections).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');
const STORE = process.env.SHOPIFY_STORE, TOKEN = process.env.SHOPIFY_ADMIN_TOKEN, IMG = process.env.IMAGE_BASE_URL;
const dishes = JSON.parse(fs.readFileSync(path.join(HERE, 'dishes.json'), 'utf8'));
async function gql(query, variables = {}) {
  const r = await fetch(`https://${STORE}/admin/api/2025-01/graphql.json`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN }, body: JSON.stringify({ query, variables }) });
  const j = await r.json(); if (j.errors) throw new Error(JSON.stringify(j.errors)); return j.data;
}
if (APPLY && (!STORE || !TOKEN)) { console.error('Set SHOPIFY_STORE and SHOPIFY_ADMIN_TOKEN'); process.exit(1); }
let collectionId = null;
if (APPLY) { const d = await gql('{ collectionByHandle(handle: "menu-semanal") { id } }'); collectionId = d.collectionByHandle?.id; }
for (const d of dishes) {
  console.log(APPLY ? '[apply]' : '[dry-run]', d.title, `$${d.price}`, d.metafields.tier, d.metafields.category);
  if (!APPLY) continue;
  const mf = (key, type, value) => ({ namespace: 'kulinaria', key, type, value: typeof value === 'string' ? value : JSON.stringify(value) });
  const created = await gql(`mutation($p: ProductCreateInput!){ productCreate(product:$p){ product{ id variants(first:1){ nodes{ id } } } userErrors{ message } } }`, { p: {
    title: d.title, handle: d.handle, descriptionHtml: `<p>${d.description}</p>`, productType: d.type, status: 'ACTIVE', tags: ['menu-semana'],
    metafields: [mf('tier', 'single_line_text_field', d.metafields.tier), mf('category', 'single_line_text_field', d.metafields.category), mf('card_description', 'single_line_text_field', d.card_description),
      mf('allergens', 'list.single_line_text_field', d.metafields.allergens), mf('ingredients', 'list.single_line_text_field', d.metafields.ingredients), mf('diets', 'list.single_line_text_field', d.metafields.diets),
      mf('calories', 'number_integer', String(d.metafields.calories)), mf('carbs', 'number_integer', String(d.metafields.carbs))] } });
  const prod = created.productCreate.product;
  if (!prod) { console.error('  !', JSON.stringify(created.productCreate.userErrors)); continue; }
  await gql(`mutation($id: ID!, $v: [ProductVariantsBulkInput!]!){ productVariantsBulkUpdate(productId:$id, variants:$v){ userErrors{ message } } }`, { id: prod.id, v: [{ id: prod.variants.nodes[0].id, price: String(d.price) }] });
  if (IMG) await gql(`mutation($p: ProductUpdateInput!, $m: [CreateMediaInput!]){ productUpdate(product:$p, media:$m){ userErrors{ message } } }`, { p: { id: prod.id }, m: [{ originalSource: `${IMG.replace(/\/$/, '')}/${d.image}`, mediaContentType: 'IMAGE', alt: d.title }] });
  if (collectionId) await gql(`mutation($id: ID!, $p: [ID!]!){ collectionAddProducts(id:$id, productIds:$p){ userErrors{ message } } }`, { id: collectionId, p: [prod.id] });
}
console.log(APPLY ? 'Done.' : 'Dry run only. Re-run with --apply.');
