// Mock Shopify store data used to render the real Liquid theme offline.
// Nothing here ships to Shopify — it only feeds scripts/render/render.mjs.
import fs from 'node:fs';
import path from 'node:path';

const TIER_PRICE = { selecto: 18000, exclusivo: 25000, signature: 32000, reserve: 39000 };   // per meal (cents)
const WEEK_PRICE = { selecto: 100000, exclusivo: 135000, signature: 170000, reserve: 205000 };   // 1-week plan (5 meals)
const mf = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }]));

const DISHES = [
  ['pollo-a-las-hierbas', 'Pollo a las hierbas con puré rústico', 'selecto', 'diario-premium', ['keto'], ['Lácteos'], ['Pollo', 'Papa', 'Mantequilla', 'Hierbas finas'], 480, 22, 'Pechuga de pollo marinada en hierbas, sellada al fuego y servida sobre puré rústico de papa.'],
  ['bowl-res-quinoa', 'Bowl de res magra y quinoa', 'selecto', 'bowls-de-la-semana', ['alto-proteina', 'sin-gluten'], [], ['Res magra', 'Quinoa', 'Aguacate', 'Cilantro'], 560, 34, 'Tiras de res magra sobre quinoa tibia, aguacate y cilantro fresco.'],
  ['salmon-costra-almendras', 'Salmón gourmet en costra de almendras', 'exclusivo', 'al-fuego-y-mar', ['keto', 'bajo-carbos'], ['Frutos secos', 'Pescado'], ['Salmón', 'Almendra', 'Eneldo', 'Espárragos', 'Jitomate cherry', 'Limón'], 520, 14, 'Lomo de salmón con costra de almendras y eneldo, espárragos asados y jitomate cherry rostizado.'],
  ['omelette-claras-espinaca', 'Omelette de claras con espinaca', 'selecto', 'desayunos-premium', ['vegetariano', 'bajo-calorias'], ['Huevo'], ['Claras', 'Espinaca', 'Champiñones'], 310, 8, 'Claras esponjosas con espinaca salteada y champiñones.'],
  ['arrachera-carbon', 'Arrachera al carbón con maíz y espárragos', 'signature', 'al-fuego-y-mar', ['alto-proteina', 'sin-gluten'], [], ['Arrachera', 'Maíz', 'Espárragos', 'Micro hierbas'], 640, 28, 'Arrachera marcada al carbón, elote desgranado y espárragos con micro hierbas.'],
  ['filete-prime', 'Filete Prime con verduras asadas', 'reserve', 'al-fuego-y-mar', ['keto', 'alto-proteina', 'sin-gluten'], [], ['Res Prime', 'Brócoli', 'Zanahoria', 'Mantequilla'], 710, 16, 'Corte Prime sellado al fuego con verduras asadas, acondicionado para recalentar sin perder su punto.'],
  ['bowl-vegano-garbanzo', 'Bowl vegano de garbanzo y tahini', 'exclusivo', 'bowls-de-la-semana', ['vegano', 'vegetariano', 'sin-gluten'], ['Ajonjolí'], ['Garbanzo', 'Tahini', 'Pepino', 'Cebolla'], 450, 52, 'Garbanzo especiado, tahini cremoso, pepino y cebolla morada encurtida.'],
  ['crema-calabaza', 'Crema de calabaza asada', 'selecto', 'sopas-y-entradas', ['vegetariano', 'sin-gluten', 'bajo-calorias'], ['Lácteos'], ['Calabaza', 'Crema', 'Semillas de calabaza', 'Tomillo'], 220, 18, 'Calabaza rostizada al fuego, crema ligera y semillas tostadas.'],
  ['brownie-proteico', 'Brownie proteico con frambuesa', 'exclusivo', 'postres-y-snacks', ['alto-proteina'], ['Huevo', 'Lácteos'], ['Cacao', 'Huevo', 'Frambuesa', 'Proteína'], 260, 14, 'Brownie de cacao oscuro con proteína y frambuesas frescas.'],
  ['batido-verde', 'Batido verde de pepino y kiwi', 'selecto', 'batidos-y-bebidas', ['vegano', 'vegetariano', 'sin-gluten', 'bajo-calorias'], [], ['Espinaca', 'Pepino', 'Kiwi', 'Limón'], 150, 20, 'Espinaca, pepino, kiwi y limón, listo para llevar.'],
  ['pasta-pollo-junior', 'Mini pasta de pollo para peques', 'selecto', 'kulinaria-junior', [], ['Gluten', 'Lácteos'], ['Pasta', 'Pollo', 'Queso', 'Jitomate'], 380, 44, 'Pasta corta con pollo desmenuzado y salsa suave de jitomate.'],
];

const PLAN_NAME = 'Bloque de 4 semanas (pago anticipado, entrega semanal)';
const planGroup = (tr) => [{
  name: tr('Bloque Kulinaria 4 semanas'),
  selling_plans: [{
    id: 810001, name: tr(PLAN_NAME),
    description: tr('Un pago por bloque. 4 entregas semanales.'), price_adjustments: [],
  }],
}];

function product(o) {
  const variants = o.variants || [{ id: o.id * 10, title: 'Default Title', price: o.price, available: true }];
  return {
    object_type: 'product',
    id: o.id, handle: o.handle, title: o.title, url: `/products/${o.handle}`,
    type: o.type || '', description: o.description || '', price: o.price,
    featured_image: o.image || null, variants, selected_or_first_available_variant: variants[0],
    has_only_default_variant: variants.length === 1 && variants[0].title === 'Default Title',
    requires_selling_plan: !!o.requires_selling_plan,
    selling_plan_groups: o.plans ? planGroup(o.tr || ((x) => x)) : [],
    metafields: { kulinaria: mf(o.mf || {}) },
  };
}

const ymd = (add) => new Date(Date.now() + add * 86400000).toISOString().slice(0, 10);
const WEEKS = { 'brownie-proteico': [ymd(7)], 'batido-verde': [ymd(7), ymd(14)], 'crema-calabaza': [ymd(0), ymd(7)] };   // scheduled dishes (the rest follow the tag only)

export function makeStore(ROOT, lang = 'es', tr = (x) => x) {
  const IMG = (n, alt) => ({ src: `assets/photo-dish-${n}.webp`, alt });
  const IMG_OF = { 'pasta-pollo-junior': 7, 'crema-calabaza': 8, 'brownie-proteico': 9, 'batido-verde': 10 };
  const dishes = DISHES.map((d, i) => product({
    id: 7100 + i, handle: d[0], title: tr(d[1]), price: TIER_PRICE[d[2]], description: `<p>${tr(d[9])}</p>`, type: d[3], plans: true, tr, image: IMG(IMG_OF[d[0]] ?? i, tr(d[1])),
    mf: { tier: d[2], category: d[3], diets: d[4], allergens: d[5], ingredients: d[6], calories: d[7], carbs: d[8], protein: Math.round(d[7] * 0.28 / 4), fat: Math.round(d[7] * 0.3 / 9), fiber: 4, ...(WEEKS[d[0]] ? { weeks: WEEKS[d[0]] } : {}) },
  }));
  // seasonal staples (collection "temporada"): limited-edition dishes that the season allows
  const SEASONAL = [
    ['chiles-en-nogada', 'Chiles en nogada de temporada', 'signature', ['Nuez', 'Lácteos'], ['Chile poblano', 'Res', 'Nuez de Castilla', 'Granada'], 690, 48, 'Chile poblano relleno de picadillo, bañado en nogada y granada. Solo en temporada.', 'Septiembre', 6],
    ['pan-calabaza-especias', 'Pan de calabaza con especias', 'exclusivo', ['Gluten', 'Huevo'], ['Calabaza', 'Canela', 'Moscada', 'Avena'], 320, 38, 'Pan húmedo de calabaza de otoño con canela y nuez moscada.', 'Otoño', 10],
  ];
  const seasonal = SEASONAL.map((d, i) => product({ id: 7600 + i, handle: d[0], title: tr(d[1]), price: TIER_PRICE[d[2]], description: `<p>${tr(d[7])}</p>`, type: 'temporada', plans: true, tr, image: IMG(d[9], tr(d[1])),
    mf: { tier: d[2], category: 'temporada', diets: [], allergens: d[3], ingredients: d[4], calories: d[5], carbs: d[6], protein: Math.round(d[5] * 0.28 / 4), fat: Math.round(d[5] * 0.3 / 9), fiber: 4, season: tr(d[8]) } }));
  const TIER_NAME = { selecto: 'Selecto', exclusivo: 'Exclusivo', signature: 'Signature', reserve: 'Reserve' };
  const planProducts = Object.keys(TIER_PRICE).map((t, i) => product({ id: 7200 + i, handle: `plan-semanal-${t}`, title: tr(`Plan semanal ${TIER_NAME[t]}`), type: 'plan', plans: true, tr,
    price: WEEK_PRICE[t], description: tr('<p>5 comidas por semana, de lunes a viernes. Disponible por 1 semana o por 4 semanas.</p>'), image: { src: 'assets/photo-containers.webp', alt: '' },
    variants: [{ id: 72000 + i * 10, title: tr('1 semana'), price: WEEK_PRICE[t], available: true }, { id: 72001 + i * 10, title: tr('4 semanas'), price: TIER_PRICE[t] * 20, available: true }],
    mf: { tier: t, meal_price: TIER_PRICE[t] / 100 } }));
  const playera = product({ id: 7300, handle: 'playera-oficial-kulinaria', title: tr('Playera Oficial Kulinaria'), price: 39900,
    description: tr('<p>Playera premium con selector de tallas.</p>'),
    variants: ['S', 'M', 'L', 'XL'].map((s, i) => ({ id: 73000 + i, title: s, price: 39900, available: true })) });
  const shaker = product({ id: 7301, handle: 'vaso-mezclador-premium', title: tr('Vaso mezclador (shaker) premium Kulinaria'), price: 29900,
    description: tr('<p>Shaker oficial para tus batidos.</p>') });
  const mejora = product({ id: 7400, handle: 'mejora-de-platillo', title: tr('Mejora de platillo'), type: 'mejora', price: 7000,
    variants: [1, 2, 3].map((n) => ({ id: 74000 + n, title: `+${n}`, price: 7000 * n, available: true })) });
  const products = [...dishes, ...seasonal, ...planProducts, playera, shaker];
  const all_products = Object.fromEntries([...products, mejora].map((p) => [p.handle, p]));

  const collections = {
    'menu-semanal': { title: tr('Especiales de la semana'), handle: 'menu-semanal', url: '/collections/menu-semanal',
      description: tr('<p>Un menú rotativo de 8 a 10 platillos. Confirma antes del sábado a las 10:00 AM.</p>'), products: dishes, products_count: dishes.length },
    'temporada': { title: tr('De temporada'), handle: 'temporada', url: '/collections/temporada', description: '', products: seasonal, products_count: seasonal.length },
    'planes-semanales': { title: tr('Planes semanales'), handle: 'planes-semanales', url: '/collections/planes-semanales', description: '', products: planProducts, products_count: 4 },
    'kulinaria-store': { title: 'Kulinaria Store', handle: 'kulinaria-store', url: '/collections/kulinaria-store',
      description: tr('<p>Línea Fit Apparel: playera oficial y vaso mezclador premium.</p>'), products: [playera, shaker], products_count: 2 },
    'regalos-de-bienvenida': { title: tr('Regalos de bienvenida'), handle: 'regalos-de-bienvenida', url: '/collections/regalos-de-bienvenida',
      description: '', products: [playera, shaker], products_count: 2 },
  };

  const PAGE_LIST = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/render/pages.json'), 'utf8'));
  const pages = Object.fromEntries([...PAGE_LIST.map(([handle, , title]) => [handle, title]), ['perfil', 'Mi perfil de alergias'], ['bienvenida', 'Bienvenida']]
    .map(([handle, title]) => [handle, { handle, title: tr(title), url: `/pages/${handle}`, content: '' }]));

  const link = (title, url, links = []) => ({ title: tr(title), url, current: false, links: links.map(([t, u]) => ({ title: tr(t), url: u, current: false, links: [] })) });
  const pg = (h) => ['/pages/' + h];
  const sub = (...hs) => hs.map((h) => [pages[h].title, '/pages/' + h]).map(([t, u]) => [Object.keys(pages).find((k) => '/pages/' + k === u) && PAGE_LIST.find(([k]) => '/pages/' + k === u)[2], u]);
  const linklists = {
    'main-menu': { handle: 'main-menu', links: [
      link('Especiales de la semana', '/collections/menu-semanal', [['Calendario del menú', '/pages/calendario'], ['Armar mi pedido', '/pages/pedido'], ['Mi perfil de alergias', '/pages/perfil']]),
      link('Planes', '/pages/planes', sub('plan-bloque', 'plan-prueba', 'niveles-y-precios', 'ciclo-y-politicas')),
      link('Registro y checkout', '/account/register', [['Crear cuenta', '/account/register'], ...sub('checkout', 'confirmacion'), ['Iniciar sesión', '/account/login']]),
      link('Mi cuenta', '/account', [...sub('cuenta-semana', 'cuenta-pausas', 'cuenta-monedero', 'cuenta-perfil', 'cuenta-referidos', 'cuenta-pedidos', 'cuenta-entregas'), ['Direcciones', '/account/addresses']]),
      link('Embajadores', '/pages/embajadores', sub('embajadores-entrenadores', 'embajadores-clientes', 'embajadores-gimnasios', 'embajadores-directorio', 'embajadores-reglas', 'embajadores-solicitar')),
      link('Carta Kulinaria', '/pages/carta-kulinaria', sub('carta-chef-privado', 'carta-cenas-romanticas', 'carta-galeria', 'carta-cotizacion')),
      link('Kulinaria Store', '/collections/kulinaria-store', [['Playera Oficial Kulinaria', '/products/playera-oficial-kulinaria'], ['Vaso mezclador (shaker) premium Kulinaria', '/products/vaso-mezclador-premium']]),
      link('Nosotros', '/pages/nosotros', sub('nosotros-historia', 'nosotros-equipo', 'nosotros-calidad')),
      link('Filosofía', '/pages/filosofia'),
      link('Ayuda y legales', '/pages/ayuda', [...sub('terminos', 'privacidad'), ['Mi perfil de alergias', '/pages/perfil']]),
    ] },
    footer: { handle: 'footer', links: [link('Especiales de la semana', '/collections/menu-semanal'), link('Planes', '/pages/planes'), link('Carta Kulinaria', '/pages/carta-kulinaria'), link('Kulinaria Store', '/collections/kulinaria-store'), link('Embajadores', '/pages/embajadores')] },
    ayuda: { handle: 'ayuda', links: [link('Nosotros', '/pages/nosotros'), link('Filosofía', '/pages/filosofia'), link('Ayuda y legales', '/pages/ayuda'), link('Mi perfil de alergias', '/pages/perfil')] },
  };

  // Theme settings: schema defaults + a few "store owner" values.
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/settings_schema.json'), 'utf8'));
  const settings = {};
  for (const grp of schema) for (const s of grp.settings || []) if (s.id && s.default !== undefined) settings[s.id] = typeof s.default === 'string' ? tr(s.default) : s.default;
  Object.assign(settings, {
    plans_url: '/pages/planes',
    contract_page: pages.ayuda,
    welcome_gift_collection: collections['regalos-de-bienvenida'],
    instagram_url: 'https://www.instagram.com/kulinariamx', whatsapp_number: '525650399656', tiktok_url: 'https://www.tiktok.com/', facebook_url: 'https://www.facebook.com/',
    subscription_portal_url: '',
    admin_emails: 'ramon@ejemplo.com', admin_endpoint: '',
  });

  const addr = { first_name: 'Ramón', last_name: 'Chavez', address1: 'Calle Lago 24, Lote 12', address2: 'Clúster Las Lomas, caseta norte', city: 'Mérida', zip: '97000', phone: '+52 000 000 0000', country: 'Mexico' };
  const order = {
    name: '#1001', created_at: '2026-10-24', financial_status_label: tr('Pagado'), fulfillment_status_label: tr('Entregado'),
    total_price: 128000, line_items_subtotal_price: 128000, total_discounts: 0, customer_url: '/account/orders/1001',
    shipping_address: addr,
    line_items: dishes.slice(0, 2).map((d, i) => ({ title: d.title, quantity: 5 - i, final_line_price: d.price * (5 - i),
      selling_plan_allocation: { selling_plan: { name: tr(PLAN_NAME) } } })),
  };
  const customer = {
    orders_count: 1,
    id: 6543210987, first_name: 'Ramón', last_name: 'Chavez', email: 'ramon@ejemplo.com',
    default_address: addr, addresses: [addr], orders: [order], new_address: {},
    metafields: { kulinaria: mf({ referral_code: 'RAMON10', referrals_paid: 3, wallet_balance: 150, allergies: [], dislikes: [] }) },
  };

  const item = (p, q, i) => ({
    key: `k${i}`, url: p.url, image: p.featured_image, product: p, variant: p.variants[0], quantity: q, properties: {},
    original_line_price: p.price * q, final_line_price: p.price * q, url_to_remove: `/cart/change?line=${i + 1}&quantity=0`,
    selling_plan_allocation: { selling_plan: { name: tr(PLAN_NAME) } },
  });
  const plan4 = planProducts[1], v4 = plan4.variants[1];
  const planLine = { ...item(plan4, 1, 0), variant: v4, original_line_price: v4.price, final_line_price: v4.price,
    properties: { [tr('Comidas por semana')]: '5', [tr('Nivel')]: 'Selecto', [tr('Duración')]: tr('4 semanas'), 'Lunes 9 nov': 'Bowl de res magra y quinoa', 'Martes 10 nov': 'Bowl de res magra y quinoa', 'Miércoles 11 nov': 'Salmón gourmet en costra de almendras', 'Jueves 12 nov': 'Salmón gourmet en costra de almendras', 'Viernes 13 nov': 'Salmón gourmet en costra de almendras', _platillos: '2× Bowl de res magra y quinoa | 3× Salmón gourmet en costra de almendras' } };
  const items = [planLine];
  const total = items.reduce((a, i) => a + i.final_line_price, 0);
  const cart = { items, item_count: 1, total_discount: 0, items_subtotal_price: total, total_price: total, attributes: {}, currency: { iso_code: 'MXN' } };

  const search = { performed: true, terms: tr('salmón'), results: [dishes[2]] };

  const routes = { root_url: '/', cart_url: '/cart', cart_add_url: '/cart/add', account_url: '/account', account_login_url: '/account/login',
    account_register_url: '/account/register', account_logout_url: '/account/logout', account_addresses_url: '/account/addresses',
    search_url: '/search', collections_url: '/collections' };

  return {
    products, dishes, collections, pages, linklists, order, customer, cart, search,
    globals: {
      shop: { name: 'Kulinaria MX' }, all_products, settings, routes, linklists, collections, pages, cart, customer, search,
      request: { locale: { iso_code: lang } }, content_for_header: '',
      localization: { available_languages: [{ iso_code: 'es', endonym_name: 'Español' }, { iso_code: 'en', endonym_name: 'English' }], language: { iso_code: lang }, country: { iso_code: 'MX' } },
    },
  };
}
