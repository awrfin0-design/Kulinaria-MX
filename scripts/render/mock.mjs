// Mock Shopify store data used to render the real Liquid theme offline.
// Nothing here ships to Shopify — it only feeds scripts/render/render.mjs.
import fs from 'node:fs';
import path from 'node:path';

const TIER_PRICE = { selecto: 16000, exclusivo: 22000, signature: 28000, reserve: 34000 };
const mf = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }]));

const DISHES = [
  ['pollo-a-las-hierbas', 'Pollo a las hierbas con puré rústico', 'selecto', 'diario-premium', ['keto'], ['Lácteos'], ['Pollo', 'Papa', 'Mantequilla', 'Hierbas finas'], 480, 22, 'Pechuga de pollo marinada en hierbas, sellada al fuego y servida sobre puré rústico de papa.'],
  ['bowl-res-quinoa', 'Bowl de res magra y quinoa', 'selecto', 'bowls-de-la-semana', ['alto-proteina', 'sin-gluten'], [], ['Res magra', 'Quinoa', 'Aguacate', 'Cilantro'], 560, 34, 'Tiras de res magra sobre quinoa tibia, aguacate y cilantro fresco.'],
  ['salmon-costra-almendras', 'Salmón gourmet en costra de almendras', 'exclusivo', 'al-fuego-y-mar', ['keto', 'bajo-carbos'], ['Frutos secos', 'Pescado'], ['Salmón', 'Almendra', 'Eneldo', 'Espárragos', 'Jitomate cherry', 'Limón'], 520, 14, 'Lomo de salmón con costra de almendras y eneldo, espárragos asados y jitomate cherry rostizado.'],
  ['omelette-claras-espinaca', 'Omelette de claras con espinaca', 'selecto', 'desayunos-premium', ['vegetariano', 'bajo-calorias'], ['Huevo'], ['Claras', 'Espinaca', 'Champiñones'], 310, 8, 'Claras esponjosas con espinaca salteada y champiñones.'],
  ['arrachera-carbon', 'Arrachera al carbón con maíz y espárragos', 'signature', 'al-fuego-y-mar', ['alto-proteina', 'sin-gluten'], [], ['Arrachera', 'Maíz', 'Espárragos', 'Micro hierbas'], 640, 28, 'Arrachera marcada al carbón, elote desgranado y espárragos con micro hierbas.'],
  ['filete-prime', 'Filete Prime con verduras asadas', 'reserve', 'al-fuego-y-mar', ['keto', 'alto-proteina', 'sin-gluten'], [], ['Res Prime', 'Brócoli', 'Zanahoria', 'Mantequilla'], 710, 16, 'Corte Prime sellado al fuego con verduras asadas, acondicionado para recalentar sin perder su punto.'],
  ['bowl-vegano-garbanzo', 'Bowl vegano de garbanzo y tahini', 'exclusivo', 'bowls-de-la-semana', ['vegano', 'vegetariano', 'sin-gluten'], ['Ajonjolí'], ['Garbanzo', 'Tahini', 'Pepino', 'Cebolla'], 450, 52, 'Garbanzo especiado, tahini cremoso, pepino y cebolla morada encurtida.'],
  ['pasta-pollo-junior', 'Mini pasta de pollo para peques', 'selecto', 'kulinaria-junior', [], ['Gluten', 'Lácteos'], ['Pasta', 'Pollo', 'Queso', 'Jitomate'], 380, 44, 'Pasta corta con pollo desmenuzado y salsa suave de jitomate.'],
];

const planGroup = () => [{
  name: 'Bloque Kulinaria 4 semanas',
  selling_plans: [{
    id: 810001, name: 'Bloque de 4 semanas (pago anticipado, entrega semanal)',
    description: 'Un pago por bloque. 4 entregas semanales.', price_adjustments: [],
  }],
}];

function product(o) {
  const variants = o.variants || [{ id: o.id * 10, title: 'Default Title', price: o.price, available: true }];
  return {
    object_type: 'product',
    id: o.id, handle: o.handle, title: o.title, url: `/products/${o.handle}`,
    type: o.type || '', description: o.description || '', price: o.price,
    featured_image: null, variants, selected_or_first_available_variant: variants[0],
    has_only_default_variant: variants.length === 1 && variants[0].title === 'Default Title',
    requires_selling_plan: !!o.requires_selling_plan,
    selling_plan_groups: o.plans ? planGroup() : [],
    metafields: { kulinaria: mf(o.mf || {}) },
  };
}

export function makeStore(ROOT) {
  const dishes = DISHES.map((d, i) => product({
    id: 7100 + i, handle: d[0], title: d[1], price: TIER_PRICE[d[2]], description: `<p>${d[9]}</p>`, type: d[3], plans: true,
    mf: { tier: d[2], category: d[3], diets: d[4], allergens: d[5], ingredients: d[6], calories: d[7], carbs: d[8] },
  }));
  const bloque = product({ id: 7200, handle: 'bloque-4-semanas', title: 'Bloque Kulinaria · 4 semanas', price: 64000, requires_selling_plan: true, plans: true,
    description: '<p>Suscripción renovable de 4 semanas con entrega semanal. Un solo pago por bloque.</p>' });
  const prueba = product({ id: 7201, handle: 'semana-de-prueba', title: 'Semana de prueba', price: 18400,
    description: '<p>Una sola semana para conocer el servicio, con 15% de recargo frente al precio del bloque.</p>' });
  const playera = product({ id: 7300, handle: 'playera-oficial-kulinaria', title: 'Playera Oficial Kulinaria', price: 39900,
    description: '<p>Playera premium con selector de tallas.</p>',
    variants: ['S', 'M', 'L', 'XL'].map((s, i) => ({ id: 73000 + i, title: s, price: 39900, available: true })) });
  const shaker = product({ id: 7301, handle: 'vaso-mezclador-premium', title: 'Vaso mezclador (shaker) premium Kulinaria', price: 29900,
    description: '<p>Shaker oficial para tus batidos.</p>' });
  const products = [...dishes, bloque, prueba, playera, shaker];

  const collections = {
    'menu-semanal': { title: 'Menú semanal', handle: 'menu-semanal', url: '/collections/menu-semanal',
      description: '<p>Un menú rotativo de 8 a 10 platillos. Confirma antes del sábado a las 10:00 AM.</p>', products: dishes, products_count: dishes.length },
    'kulinaria-store': { title: 'Kulinaria Store', handle: 'kulinaria-store', url: '/collections/kulinaria-store',
      description: '<p>Línea Fit Apparel: playera oficial y vaso mezclador premium.</p>', products: [playera, shaker], products_count: 2 },
    'regalos-de-bienvenida': { title: 'Regalos de bienvenida', handle: 'regalos-de-bienvenida', url: '/collections/regalos-de-bienvenida',
      description: '', products: [playera, shaker], products_count: 2 },
  };

  const pages = Object.fromEntries([
    ['planes', 'Planes'], ['nosotros', 'Nosotros'], ['filosofia', 'Filosofía'], ['embajadores', 'Embajadores'],
    ['carta-kulinaria', 'Carta Kulinaria'], ['ayuda', 'Ayuda y legales'], ['perfil', 'Mi perfil de alergias'],
  ].map(([handle, title]) => [handle, { handle, title, url: `/pages/${handle}`, content: '' }]));

  const link = (title, url) => ({ title, url, current: false });
  const linklists = {
    'main-menu': { handle: 'main-menu', links: [link('Menú', '/collections/menu-semanal'), link('Planes', '/pages/planes'), link('Carta Kulinaria', '/pages/carta-kulinaria'), link('Embajadores', '/pages/embajadores'), link('Store', '/collections/kulinaria-store'), link('Nosotros', '/pages/nosotros')] },
    footer: { handle: 'footer', links: [link('Menú semanal', '/collections/menu-semanal'), link('Planes', '/pages/planes'), link('Carta Kulinaria', '/pages/carta-kulinaria'), link('Kulinaria Store', '/collections/kulinaria-store'), link('Embajadores', '/pages/embajadores')] },
    ayuda: { handle: 'ayuda', links: [link('Nosotros', '/pages/nosotros'), link('Filosofía', '/pages/filosofia'), link('Ayuda y legales', '/pages/ayuda'), link('Mi perfil de alergias', '/pages/perfil')] },
  };

  // Theme settings: schema defaults + a few "store owner" values.
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/settings_schema.json'), 'utf8'));
  const settings = {};
  for (const grp of schema) for (const s of grp.settings || []) if (s.id && s.default !== undefined) settings[s.id] = s.default;
  Object.assign(settings, {
    plans_url: '/pages/planes',
    contract_page: pages.ayuda,
    welcome_gift_collection: collections['regalos-de-bienvenida'],
    instagram_url: 'https://www.instagram.com/', tiktok_url: 'https://www.tiktok.com/', facebook_url: 'https://www.facebook.com/',
    subscription_portal_url: '/account',
  });

  const addr = { first_name: 'Ramón', last_name: 'Chavez', address1: 'Calle Lago 24, Lote 12', address2: 'Clúster Las Lomas, caseta norte', city: 'Mérida', zip: '97000', phone: '+52 000 000 0000', country: 'Mexico' };
  const order = {
    name: '#1001', created_at: '2026-10-24', financial_status_label: 'Pagado', fulfillment_status_label: 'Entregado',
    total_price: 128000, line_items_subtotal_price: 128000, total_discounts: 0, customer_url: '/account/orders/1001',
    shipping_address: addr,
    line_items: dishes.slice(0, 2).map((d, i) => ({ title: d.title, quantity: 5 - i, final_line_price: d.price * (5 - i),
      selling_plan_allocation: { selling_plan: { name: 'Bloque de 4 semanas (pago anticipado, entrega semanal)' } } })),
  };
  const customer = {
    id: 6543210987, first_name: 'Ramón', last_name: 'Chavez', email: 'ramon@ejemplo.com',
    default_address: addr, addresses: [addr], orders: [order], new_address: {},
    metafields: { kulinaria: mf({ referral_code: 'RAMON10', referrals_paid: 3, wallet_balance: 150, allergies: [], dislikes: [] }) },
  };

  const item = (p, q, i) => ({
    key: `k${i}`, url: p.url, image: null, product: p, variant: p.variants[0], quantity: q, properties: {},
    original_line_price: p.price * q, final_line_price: p.price * q, url_to_remove: `/cart/change?line=${i + 1}&quantity=0`,
    selling_plan_allocation: { selling_plan: { name: 'Bloque de 4 semanas (pago anticipado, entrega semanal)' } },
  });
  const items = [item(dishes[1], 5, 0), item(dishes[2], 5, 1)];
  const total = items.reduce((a, i) => a + i.final_line_price, 0);
  const cart = { items, item_count: 10, total_discount: 0, items_subtotal_price: total, total_price: total, attributes: {}, currency: { iso_code: 'MXN' } };

  const search = { performed: true, terms: 'salmón', results: [dishes[2]] };

  const routes = { root_url: '/', cart_url: '/cart', cart_add_url: '/cart/add', account_url: '/account', account_login_url: '/account/login',
    account_register_url: '/account/register', account_logout_url: '/account/logout', account_addresses_url: '/account/addresses',
    search_url: '/search', collections_url: '/collections' };

  return {
    products, dishes, collections, pages, linklists, order, customer, cart, search,
    globals: {
      shop: { name: 'Kulinaria MX' }, settings, routes, linklists, collections, pages, cart, customer, search,
      request: { locale: { iso_code: 'es' } }, content_for_header: '',
    },
  };
}
