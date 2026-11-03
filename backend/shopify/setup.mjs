// Configures a Shopify store for the Kulinaria theme through the Admin GraphQL API.
//   node backend/shopify/setup.mjs            -> dry run: prints everything it would create
//   node backend/shopify/setup.mjs --apply    -> creates it (skips anything that already exists)
//
// Env: SHOPIFY_STORE=your-store.myshopify.com  SHOPIFY_ADMIN_TOKEN=shpat_...   (custom app, see backend/README.md for scopes)
//      WEBHOOK_URL=https://script.google.com/macros/s/XXXX/exec   WEBHOOK_KEY=<same value as the Apps Script property>
// It creates: customer + product metafield definitions, the three collections, every page of the sitemap with its template,
// the nested main-menu (the burger sitemap) and the three webhooks that feed the Google Sheet.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');
const STORE = process.env.SHOPIFY_STORE, TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const API = '2025-01';
const pages = JSON.parse(fs.readFileSync(path.join(HERE, '../../scripts/render/pages.json'), 'utf8'));   // [handle, template, title]
const menu = JSON.parse(fs.readFileSync(path.join(HERE, 'menu.json'), 'utf8'));

async function gql(query, variables = {}) {
  const res = await fetch(`https://${STORE}/admin/api/${API}/graphql.json`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN }, body: JSON.stringify({ query, variables }) });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}
const log = (...a) => console.log(APPLY ? '[apply]' : '[dry-run]', ...a);
async function run(label, query, variables, errPath) {
  log(label);
  if (!APPLY) return;
  const data = await gql(query, variables);
  const errs = data[errPath]?.userErrors || [];
  const real = errs.filter((e) => !/taken|already|exists/i.test(e.message));
  if (real.length) console.error('   !', label, JSON.stringify(real));
  else if (errs.length) console.log('   (already exists)');
}

if (APPLY && (!STORE || !TOKEN)) { console.error('Set SHOPIFY_STORE and SHOPIFY_ADMIN_TOKEN'); process.exit(1); }

// ---------------------------------------------------------------- metafield definitions (read by the theme with metafields.kulinaria.<key>)
const DEFS = [
  ['CUSTOMER', 'allergies', 'Alergias', 'list.single_line_text_field'], ['CUSTOMER', 'dislikes', 'Ingredientes que no me gustan', 'list.single_line_text_field'],
  ['CUSTOMER', 'diets', 'Dietas', 'list.single_line_text_field'], ['CUSTOMER', 'referral_code', 'Código de referencia propio', 'single_line_text_field'],
  ['CUSTOMER', 'referrals_paid', 'Referidos con bloque pagado', 'number_integer'], ['CUSTOMER', 'wallet_balance', 'Saldo del monedero (MXN)', 'number_decimal'],
  ['PRODUCT', 'tier', 'Nivel (selecto|exclusivo|signature|reserve)', 'single_line_text_field'], ['PRODUCT', 'category', 'Categoría (slug)', 'single_line_text_field'],
  ['PRODUCT', 'allergens', 'Alérgenos', 'list.single_line_text_field'], ['PRODUCT', 'ingredients', 'Ingredientes', 'list.single_line_text_field'],
  ['PRODUCT', 'diets', 'Dietas (slugs)', 'list.single_line_text_field'], ['PRODUCT', 'calories', 'Calorías (kcal)', 'number_integer'], ['PRODUCT', 'carbs', 'Carbohidratos (g)', 'number_integer'],
];
for (const [owner, key, name, type] of DEFS) {
  await run(`metafield ${owner.toLowerCase()}.kulinaria.${key}`,
    `mutation($d: MetafieldDefinitionInput!){ metafieldDefinitionCreate(definition:$d){ userErrors{ message } } }`,
    { d: { name, namespace: 'kulinaria', key, type, ownerType: owner, access: { storefront: 'PUBLIC_READ' } } }, 'metafieldDefinitionCreate');
}

// ---------------------------------------------------------------- collections
for (const [title, handle, templateSuffix] of [['Menú semanal', 'menu-semanal', null], ['Kulinaria Store', 'kulinaria-store', 'store'], ['Regalos de bienvenida', 'regalos-de-bienvenida', null]]) {
  await run(`collection ${handle}`, `mutation($i: CollectionInput!){ collectionCreate(input:$i){ userErrors{ message } } }`, { i: { title, handle, ...(templateSuffix ? { templateSuffix } : {}) } }, 'collectionCreate');
}

// ---------------------------------------------------------------- pages (handle = route, template = page.<suffix>.json)
for (const [handle, template, title] of pages) {
  const suffix = template.replace(/^page\./, '');
  await run(`page /pages/${handle} (template ${suffix})`, `mutation($p: PageCreateInput!){ pageCreate(page:$p){ userErrors{ message } } }`,
    { p: { title, handle, templateSuffix: suffix === 'page' ? null : suffix, body: '', isPublished: true } }, 'pageCreate');
}
await run('page /pages/perfil (template profile)', `mutation($p: PageCreateInput!){ pageCreate(page:$p){ userErrors{ message } } }`,
  { p: { title: 'Mi perfil de alergias', handle: 'perfil', templateSuffix: 'profile', body: '', isPublished: true } }, 'pageCreate');

// ---------------------------------------------------------------- navigation: nested main-menu = the sitemap behind the burger
const toItems = (links) => links.map((l) => ({ title: l.title, type: 'HTTP', url: l.url, items: toItems(l.links || []) }));
await run('menu main-menu (' + menu.length + ' groups, ' + menu.reduce((n, g) => n + (g.links || []).length, 0) + ' subpages)',
  `mutation($t: String!, $h: String!, $items: [MenuItemCreateInput!]!){ menuCreate(title:$t, handle:$h, items:$items){ userErrors{ message } } }`,
  { t: 'Menú principal', h: 'main-menu', items: toItems(menu) }, 'menuCreate');

// ---------------------------------------------------------------- webhooks -> Google Sheet
if (process.env.WEBHOOK_URL && process.env.WEBHOOK_KEY) {
  for (const [topic, tag] of [['CUSTOMERS_CREATE', 'customers-create'], ['CUSTOMERS_UPDATE', 'customers-update'], ['ORDERS_CREATE', 'orders-create']]) {
    await run(`webhook ${topic}`, `mutation($t: WebhookSubscriptionTopic!, $s: WebhookSubscriptionInput!){ webhookSubscriptionCreate(topic:$t, webhookSubscription:$s){ userErrors{ message } } }`,
      { t: topic, s: { callbackUrl: `${process.env.WEBHOOK_URL}?key=${encodeURIComponent(process.env.WEBHOOK_KEY)}&topic=${tag}`, format: 'JSON' } }, 'webhookSubscriptionCreate');
  }
} else log('webhooks skipped (set WEBHOOK_URL and WEBHOOK_KEY)');
console.log(APPLY ? 'Done.' : 'Dry run only. Re-run with --apply to create everything.');
