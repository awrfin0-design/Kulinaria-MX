/* Kulinaria MX — storefront behaviour (vanilla JS, no dependencies)
   Commerce: weekly cutoff countdown, pause locks, menu filters, allergen/dislike profile, cart (contract, referral, gift).
   Experience: light/dark theme, loading screen, particle background, full-screen menu, video (hero, scroll scrub, fire buttons),
   3D tilt, cursor photo preview, coverflow carousel. Strings come from window.KULINARIA.i18n (locales/*.json). */
(function () {
  'use strict';

  var cfg = window.KULINARIA || {};
  var TZ = cfg.timezone || 'America/Mexico_City';
  var PROFILE_KEY = 'kulinaria_profile';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;

  /* ---------- i18n: strings are injected by layout/theme.liquid from the locale files ---------- */
  var FALLBACK = {
    pauseLeft: 'Quedan {time} para pausar.', compat: 'Compatibilidad {n}%',
    notSuitable: '⚠ Según nuestros datos, incluye o puede incluir algo a lo que declaraste alergia: {list}.', dislikeHit: 'Contiene ingredientes que marcaste como "no me gustan": {list}.',
    remove: 'Quitar {name}', d: 'd', h: 'h', min: 'min', toDark: 'Activar modo oscuro', toLight: 'Activar modo claro', pause: 'Pausar video', play: 'Reproducir video'
  };
  function T(key, vars) {
    var src = (window.KULINARIA && window.KULINARIA.i18n) || {};
    var str = src[key] != null ? src[key] : FALLBACK[key] || key;
    str = String(str).replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    return String(str).replace(/\{(\w+)\}/g, function (m, n) { return vars && vars[n] != null ? vars[n] : m; });
  }
  // preview hook: the single-file preview serves media from memory
  var resolve = function (u) { return (window.KULINARIA && window.KULINARIA.resolve) ? window.KULINARIA.resolve(u) : u; };

  /* ---------- helpers ---------- */
  var norm = function (s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  };

  /* menu groups: 7 follow the dish category, 4 follow the diets of the dish (a dish can be in several) */
  var GROUPS = {
    'al-fuego': { cat: ['al-fuego-y-mar'] }, desayunos: { cat: ['desayunos-premium'] }, bowls: { cat: ['bowls-de-la-semana'] }, diario: { cat: ['diario-premium'] },
    'keto-low-carb': { diet: ['keto', 'bajo-carbos'] }, 'fit-proteina': { diet: ['alto-proteina'] }, veggie: { diet: ['vegetariano', 'vegano'] }, 'sin-gluten': { diet: ['sin-gluten', 'libre-de-gluten'] }, ligero: { diet: ['bajo-calorias'] },
    junior: { cat: ['kulinaria-junior'] }, entradas: { cat: ['sopas-y-entradas'] }, 'snacks-postres': { cat: ['postres-y-snacks', 'batidos-y-bebidas'] }
  };
  function inGroup(card, gid) {
    if (!gid || gid === 'all') return true;
    if (gid === 'seasonal') return card.getAttribute('data-seasonal') === 'true';
    var g = GROUPS[gid]; if (!g) return card.getAttribute('data-category') === gid;
    if (g.cat) return g.cat.indexOf(card.getAttribute('data-category')) > -1;
    var d = (card.getAttribute('data-diets') || '').split('|'); return g.diet.some(function (x) { return d.indexOf(x) > -1; });
  }
  /* the suggested menu of a category: the same five dishes (Mon-Fri) for every customer. Set in Theme settings > "Menús sugeridos". */
  function defaultMenu(cat) {
    var raw = ((cfg.defaultMenus || {})[cat || 'all']) || '';
    return String(raw).split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function groupForDiet(slug) { var out = ''; Object.keys(GROUPS).forEach(function (k) { if (!out && GROUPS[k].diet && GROUPS[k].diet.indexOf(slug) > -1) out = k; }); return out; }

  // Current wall-clock time in the store timezone.
  function mxNow() {
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, hour12: false, weekday: 'short',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(new Date());
    var o = {};
    parts.forEach(function (p) { o[p.type] = p.value; });
    var dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[o.weekday];
    var h = parseInt(o.hour, 10) % 24;
    return { dow: dow, minutes: h * 60 + parseInt(o.minute, 10), seconds: parseInt(o.second, 10) };
  }

  /* ---------- weekly cycle ----------
     Cycle starts Saturday at cutoff (default 10:00). Orders must be confirmed
     before the next cutoff; pause windows are offsets inside the cycle. */
  var cutoffMin = (cfg.cutoffHour != null ? cfg.cutoffHour : 10) * 60;
  function minutesUntilCutoff() {
    var n = mxNow();
    var diff = ((6 - n.dow + 7) % 7) * 1440 + (cutoffMin - n.minutes);
    if (diff <= 0) diff += 7 * 1440;
    return diff;
  }
  function minutesIntoCycle() { return 7 * 1440 - minutesUntilCutoff(); }

  function fmtCountdown(mins) {
    var d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
    var out = [];
    if (d) out.push(d + ' ' + T('d'));
    out.push(h + ' ' + T('h'));
    out.push(m + ' ' + T('min'));
    return out.join(' ');
  }

  function initCountdown() {
    var els = $$('[data-cutoff]');
    if (!els.length) return;
    var tick = function () {
      var txt = fmtCountdown(minutesUntilCutoff());
      els.forEach(function (el) {
        var out = $('[data-cutoff-value]', el) || el;
        out.textContent = txt;
      });
    };
    tick();
    setInterval(tick, 30000);
  }

  /* ---------- profile (allergies + dislikes) ---------- */
  function loadProfile() {
    var p = { allergies: [], dislikes: [], people: [] };
    try { p = Object.assign(p, JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}')); } catch (e) {}
    var c = $('#kulinaria-customer');
    if (c) {
      try {
        var d = JSON.parse(c.textContent);
        if (d.allergies && d.allergies.length) p.allergies = Array.from(new Set(p.allergies.concat(d.allergies)));
        if (d.dislikes && d.dislikes.length) p.dislikes = Array.from(new Set(p.dislikes.concat(d.dislikes)));
      } catch (e) {}
    }
    return p;
  }
  function saveProfile(p) {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (e) {}
    // Mirror to cart attributes so every order carries the kitchen-critical data.
    fetch('/cart/update.js', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attributes: {
        alergias: p.allergies.join(', '),
        no_me_gustan: p.dislikes.join(', '),
        dietas: (p.diets || []).join(', ')
      } })
    }).catch(function () {});
  }

  // Hard filter (allergies) hides / blocks; soft filter (dislikes) lowers compatibility.
  // How a dish is checked against what a client declares (no AI, just a careful vocabulary):
  //  1. the declared word is turned into one canonical Spanish name (English names, plurals and typos included: "octopus" -> "pulpo");
  //  2. a declared FAMILY (mariscos, pescado, frutos secos, lacteos, gluten...) expands to all its usual members, so "shellfish" catches shrimp, octopus, clams...;
  //  3. a declared MEMBER (octopus) also counts when the dish is tagged with its family and its ingredient list does not name a different member (the tag then most likely means it);
  //     with a strict profile (anaphylaxis / zero traces) any dish of the family is flagged;
  //  4. harmless look-alikes are excluded (corn flour is not gluten, almond milk is not dairy, nutmeg is not a nut).
  var SYN = {
    'mariscos': ['marisco', 'camaron', 'langosta', 'langostino', 'cangrejo', 'jaiba', 'centolla', 'cigala', 'bogavante', 'acocil', 'pulpo', 'calamar', 'sepia', 'chipiron', 'ostion', 'almeja', 'mejillon', 'vieira', 'callo de hacha', 'abulon', 'caracol'],
    'crustaceos': ['camaron', 'langosta', 'langostino', 'cangrejo', 'jaiba', 'centolla', 'cigala', 'bogavante', 'acocil'],
    'moluscos': ['pulpo', 'calamar', 'sepia', 'chipiron', 'ostion', 'almeja', 'mejillon', 'vieira', 'callo de hacha', 'abulon', 'caracol'],
    'cefalopodos': ['pulpo', 'calamar', 'sepia', 'chipiron'],
    'pescado': ['salmon', 'atun', 'huachinango', 'pargo', 'robalo', 'tilapia', 'bacalao', 'sardina', 'anchoa', 'trucha', 'mojarra', 'merluza', 'lenguado', 'dorado', 'mahi', 'cazon', 'surimi', 'caballa', 'arenque', 'pescado'],
    'frutos secos': ['almendra', 'nuez', 'nueces', 'pistache', 'avellana', 'anacardo', 'nuez de la india', 'macadamia', 'pecana', 'castana', 'nuez de brasil', 'pinon', 'cacahuate', 'mazapan', 'praline', 'turron', 'nogada'],
    'lacteos': ['leche', 'queso', 'crema', 'mantequilla', 'yogur', 'yogurt', 'nata', 'requeson', 'suero', 'caseina', 'lactosa', 'ghee', 'paneer', 'ricotta', 'mozzarella', 'parmesano', 'cotija', 'panela', 'manchego', 'mascarpone', 'burrata', 'helado', 'flan', 'cajeta'],
    'gluten': ['trigo', 'harina', 'pasta', 'pan', 'cebada', 'centeno', 'avena', 'cuscus', 'bulgur', 'espelta', 'seitan', 'galleta', 'empanizado', 'pan molido', 'pan rallado', 'cerveza', 'fideo', 'macarron', 'lasana', 'tempura', 'semola', 'malta', 'ravioli', 'crouton'],
    'huevo': ['huevo', 'clara', 'yema', 'mayonesa', 'merengue', 'aioli', 'omelette', 'omelet'],
    'soya': ['soya', 'soja', 'tofu', 'edamame', 'miso', 'tempeh', 'shoyu', 'tamari', 'salsa de soya'],
    'ajonjoli': ['ajonjoli', 'tahini', 'tahin', 'sesamo'],
    'cacahuate': ['cacahuate', 'mani', 'mantequilla de cacahuate'],
    'nuez': ['nuez', 'nueces', 'pecana', 'nuez de castilla'],
    'almendra': ['almendra', 'mazapan'],
    'apio': ['apio'], 'mostaza': ['mostaza'],
    'sulfitos': ['vino', 'vinagre balsamico', 'pasas', 'orejones', 'fruta seca', 'uva pasa'],
    'maiz': ['maiz', 'elote', 'esquite', 'nixtamal', 'tortilla', 'tostada', 'palomitas', 'masa']
  };
  var EXCL = {   // harmless look-alikes: an ingredient containing one of these never counts for that family
    'gluten': ['harina de maiz', 'harina de arroz', 'harina de almendra', 'harina de coco', 'harina de garbanzo', 'harina de avena sin gluten', 'sin gluten', 'libre de gluten', 'tortilla de maiz', 'pasta de arroz', 'fideo de arroz'],
    'lacteos': ['leche de coco', 'leche de almendra', 'leche de avena', 'leche de soya', 'leche vegetal', 'crema de coco', 'mantequilla de cacahuate', 'mantequilla de almendra', 'queso vegano', 'sin lactosa', 'mantequilla de cacao'],
    'frutos secos': ['nuez moscada', 'moscada', 'mantequilla de karite', 'castana de agua', 'coco'],
    'nuez': ['nuez moscada', 'moscada'],
    'huevo': ['sin huevo', 'berenjena', 'huevo vegano'],
    'soya': ['sin soya'],
    'pescado': ['sin pescado', 'salsa de pescado vegana']
  };
  // What the client types may be English or a different spelling: map it to the Spanish names used in the ingredient lists
  var ALIAS = {
    'octopus': 'pulpo', 'squid': 'calamar', 'calamari': 'calamar', 'cuttlefish': 'sepia', 'clam': 'almeja', 'clams': 'almeja', 'oyster': 'ostion', 'oysters': 'ostion', 'mussel': 'mejillon', 'mussels': 'mejillon',
    'scallop': 'vieira', 'scallops': 'vieira', 'crab': 'cangrejo', 'lobster': 'langosta', 'shrimp': 'camaron', 'shrimps': 'camaron', 'prawn': 'camaron', 'prawns': 'camaron', 'crayfish': 'langostino', 'langoustine': 'langostino', 'abalone': 'abulon', 'snail': 'caracol',
    'shellfish': 'mariscos', 'seafood': 'mariscos', 'marisco': 'mariscos', 'crustacean': 'crustaceos', 'crustaceans': 'crustaceos', 'crustaceo': 'crustaceos', 'mollusk': 'moluscos', 'mollusks': 'moluscos', 'mollusc': 'moluscos', 'molluscs': 'moluscos', 'molusco': 'moluscos', 'cephalopod': 'cefalopodos', 'cephalopods': 'cefalopodos', 'cefalopodo': 'cefalopodos',
    'fish': 'pescado', 'pescados': 'pescado', 'salmon': 'salmon', 'tuna': 'atun', 'cod': 'bacalao', 'trout': 'trucha', 'sea bass': 'robalo', 'snapper': 'huachinango', 'anchovy': 'anchoa', 'anchovies': 'anchoa', 'sardine': 'sardina', 'sardines': 'sardina', 'tilapia': 'tilapia', 'mackerel': 'caballa', 'herring': 'arenque',
    'nuts': 'frutos secos', 'tree nuts': 'frutos secos', 'tree nut': 'frutos secos', 'nut': 'frutos secos', 'fruto seco': 'frutos secos', 'frutos-secos': 'frutos secos', 'brazil nut': 'nuez de brasil',
    'peanut': 'cacahuate', 'peanuts': 'cacahuate', 'mani': 'cacahuate', 'cacahuates': 'cacahuate', 'almond': 'almendra', 'almonds': 'almendra', 'walnut': 'nuez', 'walnuts': 'nuez', 'pecan': 'pecana', 'pecans': 'pecana', 'cashew': 'anacardo', 'cashews': 'anacardo', 'pistachio': 'pistache', 'pistachios': 'pistache', 'hazelnut': 'avellana', 'hazelnuts': 'avellana', 'macadamia': 'macadamia', 'pine nut': 'pinon',
    'dairy': 'lacteos', 'lactose': 'lacteos', 'lacteo': 'lacteos', 'milk': 'leche', 'cheese': 'queso', 'cream': 'crema', 'butter': 'mantequilla', 'yogurt': 'yogur', 'whey': 'suero', 'casein': 'caseina', 'ice cream': 'helado',
    'egg': 'huevo', 'eggs': 'huevo', 'huevos': 'huevo', 'wheat': 'gluten', 'gluten': 'gluten', 'celiac': 'gluten', 'barley': 'cebada', 'rye': 'centeno', 'oats': 'avena', 'bread': 'pan', 'flour': 'harina',
    'soy': 'soya', 'soybean': 'soya', 'soybeans': 'soya', 'sesame': 'ajonjoli', 'mustard': 'mostaza', 'celery': 'apio', 'sulfite': 'sulfitos', 'sulfites': 'sulfitos', 'sulphites': 'sulfitos', 'wine': 'vino',
    'broccoli': 'brocoli', 'onion': 'cebolla', 'cilantro': 'cilantro', 'coriander': 'cilantro', 'mushroom': 'champinones', 'mushrooms': 'champinones', 'champinon': 'champinones',
    'tomato': 'jitomate', 'tomate': 'jitomate', 'avocado': 'aguacate', 'corn': 'maiz', 'pork': 'puerco', 'beef': 'res', 'chicken': 'pollo', 'garlic': 'ajo', 'pepper': 'pimiento', 'spinach': 'espinaca', 'carrot': 'zanahoria', 'strawberry': 'fresa', 'strawberries': 'fresa', 'raisins': 'pasas', 'raisin': 'pasas', 'olive': 'aceituna', 'olives': 'aceituna', 'coconut': 'coco', 'beet': 'betabel', 'beets': 'betabel', 'beetroot': 'betabel', 'spicy': 'chile', 'spicy food': 'chile', 'picante': 'chile', 'hot': 'chile', 'hongo': 'champinones', 'hongos': 'champinones', 'seta': 'champinones', 'setas': 'champinones', 'chili': 'chile', 'chile': 'chile', 'lime': 'limon', 'lemon': 'limon', 'banana': 'platano', 'pumpkin': 'calabaza', 'squash': 'calabaza', 'beans': 'frijol', 'bean': 'frijol', 'basil': 'albahaca', 'poblano chile': 'poblano', 'rice': 'arroz', 'potato': 'papa', 'potatoes': 'papa'
  };
  var MEMBER_OF = {};
  Object.keys(SYN).forEach(function (g) { SYN[g].forEach(function (m) { (MEMBER_OF[m] = MEMBER_OF[m] || []).push(g); }); });
  var singular = function (a) { return a.replace(/(ces)$/, 'z').replace(/(es)$/, '').replace(/s$/, ''); };
  var canon = function (raw) {
    var a = norm(raw).replace(/\s+/g, ' ');
    if (ALIAS[a]) return ALIAS[a];
    if (SYN[a] || MEMBER_OF[a]) return a;
    var s1 = a.replace(/s$/, ''), s2 = a.replace(/es$/, ''), s3 = singular(a);
    var c = [s1, s2, s3].filter(function (x) { return x && (ALIAS[x] || SYN[x] || MEMBER_OF[x]); })[0];
    return c ? (ALIAS[c] || c) : a;
  };
  // true when two words are the same up to one typo (only for words of 5+ letters, so short words never match by accident)
  var near = function (a, b) {
    if (a === b) return true; if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
    var i = 0, j = 0, d = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++d > 1) return false;
      if (a.length === b.length) { i++; j++; } else if (a.length > b.length) i++; else j++;
    }
    return d + (a.length - i) + (b.length - j) <= 1;
  };
  var words = function (t) { return t.split(/[^a-z0-9]+/).filter(Boolean); };
  // does ingredient `ing` name `w` (a canonical word / phrase of family `key`)?
  var named = function (ing, w, key) {
    var ex = EXCL[key] || [];
    for (var e = 0; e < ex.length; e++) if (ing.indexOf(ex[e]) > -1) return false;
    if (ing === w) return true;
    var tk = words(ing);
    if (w.length <= 4) return tk.indexOf(w) > -1 || tk.indexOf(w + 's') > -1;            // short words only as a whole word (so "pan" never matches "panela", nor "mani" "manicotti")
    // the word (or phrase) must START a word of the ingredient: "pinon" is not found inside "champiñones", but "camaron" is found in "camarones"
    var at = ing.indexOf(w);
    while (at > -1) { if (at === 0 || /[^a-z0-9]/.test(ing.charAt(at - 1))) return true; at = ing.indexOf(w, at + 1); }
    if (w.indexOf(' ') < 0 && ing.indexOf(' ') < 0 && ing.length >= 4 && w.indexOf(ing) === 0) return true;   // "almendra" listed, "almendras" declared
    if (w.indexOf(' ') < 0) { for (var k = 0; k < tk.length; k++) if (near(tk[k], w)) return true; }
    return false;
  };
  // The report says WHICH ingredient (or dish tag) clashes with WHICH declared allergy, so the card and the panel can point at it.
  function allergyCore(p, tags, ings, tagsO, ingsO) {
    var out = [], strict = !!(p && p.strict);
    ((p && p.allergies) || []).forEach(function (raw) {
      var a = canon(raw); if (!a) return;
      var ws = [a].concat(SYN[a] || []), items = [], tagItems = [];
      ings.forEach(function (i, k) { if (ws.some(function (w) { return named(i, w, a); })) items.push(ingsO[k]); });
      tags.forEach(function (t, k) { if (t === a || ws.indexOf(t) > -1) tagItems.push(tagsO[k]); });
      if (!items.length) items = tagItems.slice();             // name the ingredient when we can; the dish tag only when the list does not spell it out
      if (!items.length) {
        var fam = (MEMBER_OF[a] || []).concat(SYN[a] ? [a] : []).filter(function (g, k, arr) { return arr.indexOf(g) === k; });
        var tagged = fam.filter(function (g) { return tags.indexOf(g) > -1; });
        if (tagged.length && (strict || !tagged.some(function (g) { return (SYN[g] || []).some(function (m) { return ings.some(function (i) { return named(i, m, g); }); }); })))
          tagged.forEach(function (g) { items.push(tagsO[tags.indexOf(g)]); });
      }
      if (items.length) out.push({ raw: raw, items: items.filter(function (x, k, arr) { return arr.indexOf(x) === k; }) });
    });
    return out;
  }
  function allergyHits(p, tags, ings) { return allergyCore(p, tags, ings, tags, ings).map(function (r) { return r.raw; }); }
  function allergyReport(p, tagsO, ingsO) { return allergyCore(p, tagsO.map(norm), ingsO.map(norm), tagsO, ingsO); }
  var cap = function (s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); };
  var reportText = function (rep) { return T('warnHard', { list: rep.map(function (r) { return r.items.map(cap).join(', ') + ' (' + T('yourAllergy') + ': ' + r.raw + ')'; }).join('; ') }); };
  function dislikeText(p, tagsO, ingsO, soft) {
    var tags = tagsO.map(norm), ings = ingsO.map(norm), out = [];
    ((p && p.dislikes) || []).forEach(function (raw) {
      var d = canon(raw); if (!d) return; var ws = [d].concat(SYN[d] || []), items = [];
      ings.forEach(function (i, k) { if (ws.some(function (w) { return named(i, w, d); })) items.push(ingsO[k]); });
      tags.forEach(function (t, k) { if (t === d) items.push(tagsO[k]); });
      if (items.length) out.push(items.filter(function (x, k, arr) { return arr.indexOf(x) === k; }).map(cap).join(', ') + ' (' + T('yourDislike') + ')');
    });
    return T('dislikeHit', { list: out.length ? out.join('; ') : (soft || []).join(', ') });
  }
  function dislikeHits(p, tags, ings) {
    return ((p && p.dislikes) || []).filter(function (raw) {
      var d = canon(raw); if (!d) return false;
      var ws = [d].concat(SYN[d] || []);
      return tags.indexOf(d) > -1 || ws.some(function (w) { return ings.some(function (i) { return named(i, w, d); }); });
    });
  }
  if (location.protocol === 'file:') window.KX_TEST = { allergyHits: allergyHits, dislikeHits: dislikeHits, canon: canon };   // local preview only (used by the tests)
  // The profile that applies right now: the account holder's, or the person the order is being built for (family members have their own allergies and dislikes)
  function strictFlag(f) { var inf = (f && f.info) || {}; return inf.cross === 'estricto' || inf.severity === 'anafilaxia'; }
  function effectiveProfile() {
    // allergy and dislike warnings belong to a signed-in, onboarded account: a visitor who is not signed in never sees them (even if the browser still holds an old profile)
    if (!$('#kx-account')) return { allergies: [], dislikes: [], diets: [], people: [] };
    var p = loadProfile(), f = readFunnel(); p.strict = strictFlag(f);
    if (f && f.para && p.people) { var who = p.people.filter(function (x) { return x.id === f.para; })[0]; if (who) return { strict: p.strict, allergies: who.allergies || [], dislikes: who.dislikes || [], diets: who.diets || [], name: who.name, people: p.people }; }
    return p;
  }
  function applyProfile() {
    var p = effectiveProfile();
    var al = (p.allergies || []).map(norm), dl = (p.dislikes || []).map(norm);
    $$('[data-dish], [data-sc-dish]').forEach(function (card) {
      var tags = (card.getAttribute('data-allergens') || '').split('|').map(norm).filter(Boolean);
      var ings = (card.getAttribute('data-ingredients') || '').split('|').map(norm).filter(Boolean);
      var tagsO = (card.getAttribute('data-allergens') || '').split('|').filter(Boolean), ingsO = (card.getAttribute('data-ingredients') || '').split('|').filter(Boolean);
      var rep = allergyReport(p, tagsO, ingsO), hard = rep.map(function (r) { return r.raw; }), soft = dislikeHits(p, tags, ings);
      var compat = hard.length ? 0 : (soft.length ? Math.max(40, 100 - soft.length * 30) : 100);
      card.classList.toggle('is-warned', hard.length > 0);
      var badge = $('[data-compat]', card);
      if (badge) {
        badge.textContent = (al.length || dl.length) ? T('compat', { n: compat }) : '';
        badge.setAttribute('data-low', compat < 100 ? 'true' : 'false');
      }
      var wbox = $('[data-fn-warnbox]', card), warn = $('[data-fn-warn]', card);
      if (warn && wbox) {
        var has = hard.length || soft.length;
        wbox.hidden = !has; wbox.classList.toggle('is-hard', hard.length > 0); wbox.classList.toggle('is-soft', !hard.length && soft.length > 0);
        warn.className = 'fn-warn ' + (hard.length ? 'is-hard' : 'is-soft');
        warn.textContent = hard.length ? reportText(rep) : (soft.length ? dislikeText(p, tagsO, ingsO, soft) : '');
        if (!has) { wbox.classList.remove('is-open'); var wb0 = $('[data-fn-warnbtn]', wbox); if (wb0) wb0.setAttribute('aria-expanded', 'false'); }
      }
      card.setAttribute('data-compat-value', compat);
    });
    $$('[data-dish-detail]').forEach(function (detail) {
      var alert = $('[data-allergen-alert]', detail);
      if (!alert) return;
      var tagsO = (detail.getAttribute('data-allergens') || '').split('|').filter(Boolean), ingsO = (detail.getAttribute('data-ingredients') || '').split('|').filter(Boolean);
      var rep = allergyReport(p, tagsO, ingsO), soft = dislikeHits(p, tagsO.map(norm), ingsO.map(norm));
      alert.hidden = !(rep.length || soft.length);
      if (rep.length) {
        alert.className = 'alert alert--warn';
        alert.textContent = reportText(rep);
      } else if (soft.length) {
        alert.className = 'alert alert--ok';
        alert.textContent = dislikeText(p, tagsO, ingsO, soft);
      }
    });
  }

  /* a signed-in customer with weeks left on a plan does not buy again: every order button leads to "Mi semana" */
  function setReturning(on) {
    if (!on) return;
    document.documentElement.setAttribute('data-returning', '1');
    $$('[data-order-cta]').forEach(function (el) {
      el.setAttribute('href', '/pages/cuenta-semana');
      var label = el.getAttribute('data-returning-label') || ''; if (!label) return;
      var tn = [].slice.call(el.childNodes).filter(function (n) { return n.nodeType === 3 && n.textContent.trim(); }).pop();
      if (tn) tn.textContent = label + (el.classList.contains('btn') ? ' \u2192' : ''); else el.textContent = label;
    });
  }
  function initReturning() {
    if (!$('#kx-account')) return;
    loadCredits(function (c) { if (c && c.hasPlan && c.weeksLeft > 0) setReturning(true); });
  }
  /* phone home (cinematic scroll): a slim bar slides in once the hero has gone, so ordering is always one thumb away */
  function initHomeBar() {
    var hero = $('.hero--intro'); if (!hero || !window.IntersectionObserver || !(window.matchMedia && window.matchMedia('(max-width:760px)').matches)) return;
    if ($('.home-bar')) return;
    var bar = document.createElement('div'); bar.className = 'home-bar'; bar.setAttribute('hidden', '');
    var tx = document.documentElement.getAttribute('data-home-cta') || '', lang = (document.documentElement.lang || 'es').slice(0, 2);
    bar.innerHTML = '<span></span><a class="btn btn--gold btn--sm" href="/pages/pedido" data-order-cta></a>';
    bar.firstChild.textContent = lang === 'en' ? 'Build my order' : 'Armar mi pedido'; bar.lastChild.textContent = (lang === 'en' ? 'Continue' : 'Continuar') + ' \u2192';
    document.body.appendChild(bar);
    if (document.documentElement.getAttribute('data-returning')) { var ob = $('[data-order-cta]', bar); ob.setAttribute('href', '/pages/cuenta-semana'); ob.textContent = (lang === 'en' ? 'Choose my week' : 'Elegir mi semana') + ' \u2192'; bar.firstChild.textContent = lang === 'en' ? 'Your week is paid' : 'Tu semana está pagada'; }
    var heroGone = false, builderOn = false, paint = function () { bar.hidden = false; bar.classList.toggle('is-on', heroGone && !builderOn); };
    new IntersectionObserver(function (en) { en.forEach(function (e) { heroGone = !e.isIntersecting && e.boundingClientRect.top < 0; paint(); }); }, { threshold: 0.12 }).observe(hero);
    var builder = $('[data-funnel]');   // the order builder is itself the call to action: the bar steps aside while it is on screen
    if (builder) new IntersectionObserver(function (en) { en.forEach(function (e) { builderOn = e.isIntersecting; paint(); }); }, { threshold: 0.02 }).observe(builder);
  }
  function initOnbBanner() { $$('[data-onb-banner]').forEach(function (b) { b.hidden = isOnboarded(); }); }
  function initPw() {
    $$('[data-pw-toggle]').forEach(function (b) {
      var inp = b.parentNode.querySelector('input'); if (!inp) return;
      b.addEventListener('click', function () { var show = inp.type === 'password'; inp.type = show ? 'text' : 'password'; b.textContent = b.getAttribute(show ? 'data-t-hide' : 'data-t-show'); b.setAttribute('aria-pressed', show ? 'true' : 'false'); });
    });
  }
  function initProfileForm() { $$('[data-profile-form]').forEach(initOneProfileForm); }
  function initOneProfileForm(form) {
    var p = loadProfile();
    var tagsBox = $('[data-tags]', form), tagInput = $('[data-tag-input]', form);
    var renderTags = function () {
      $$('.tag', tagsBox).forEach(function (t) { t.remove(); });
      p.dislikes.forEach(function (d, i) {
        var t = document.createElement('span'); t.className = 'tag'; t.textContent = d + ' ';
        var x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', T('remove', { name: d })); x.textContent = '×';
        x.addEventListener('click', function () { p.dislikes.splice(i, 1); renderTags(); });
        t.appendChild(x); tagsBox.insertBefore(t, tagInput);
      });
    };
    $$('input[name="allergy"]', form).forEach(function (c) { c.checked = p.allergies.map(norm).indexOf(norm(c.value)) > -1; });
    $$('input[name="diet"]', form).forEach(function (c) { c.checked = (p.diets || []).map(norm).indexOf(norm(c.value)) > -1; });
    var other = $('[name="allergy_other"]', form);
    if (other) other.value = p.allergies.filter(function (a) {
      return !$$('input[name="allergy"]', form).some(function (c) { return norm(c.value) === norm(a); });
    }).join(', ');
    renderTags();
    var addTag = function (v) {
      v = v.trim(); if (!v) return;
      if (p.dislikes.map(norm).indexOf(norm(v)) < 0) p.dislikes.push(v);
      tagInput.value = ''; renderTags();
    };
    tagInput.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput.value); } });
    $$('[data-suggest]', form).forEach(function (b) { b.addEventListener('click', function () { addTag(b.getAttribute('data-suggest')); }); });
    // family members / other people the account orders for: each has their own allergies, dislikes and diets (same questions as for the account holder)
    var plist = $('[data-people-list]', form), editor = $('[data-person-editor]', form), openBtn = $('[data-pe-open]', form);
    if (plist && editor && openBtn) {
      if (!Array.isArray(p.people)) p.people = [];
      var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
      var persist2 = function () { saveProfile(p); pushProfile(); applyProfile(); };
      var eName = $('[data-pe-name]', editor), eOther = $('[data-pe-other]', editor), eTags = $('[data-pe-tags]', editor), eTagIn = $('[data-pe-tag-input]', editor), eTitle = $('[data-pe-title]', editor);
      var editing = '', dis = [];
      var allergyBoxes = function () { return $$('[data-pe-allergy]', editor); }, dietBoxes = function () { return $$('[data-pe-diet]', editor); };
      var paintTags = function () {
        $$('.tag', eTags).forEach(function (t) { t.remove(); });
        dis.forEach(function (d, i) {
          var t = document.createElement('span'); t.className = 'tag'; t.textContent = d + ' ';
          var x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', T('remove', { name: d }));
          x.addEventListener('click', function () { dis.splice(i, 1); paintTags(); });
          t.appendChild(x); eTags.insertBefore(t, eTagIn);
        });
      };
      var addDis = function (v) { v = String(v || '').trim(); if (!v) return; if (dis.map(norm).indexOf(norm(v)) < 0) dis.push(v); eTagIn.value = ''; paintTags(); };
      eTagIn.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addDis(eTagIn.value); } });
      $$('[data-pe-suggest]', editor).forEach(function (b) { b.addEventListener('click', function () { addDis(b.getAttribute('data-pe-suggest')); }); });
      var openEditor = function (id) {
        editing = id || '';
        var who = (p.people || []).filter(function (x) { return x.id === id; })[0] || { name: '', allergies: [], dislikes: [], diets: [] };
        eName.value = who.name || ''; dis = (who.dislikes || []).slice();
        allergyBoxes().forEach(function (c) { c.checked = (who.allergies || []).map(norm).indexOf(norm(c.value)) > -1; });
        dietBoxes().forEach(function (c) { c.checked = (who.diets || []).map(norm).indexOf(norm(c.value)) > -1; });
        eOther.value = (who.allergies || []).filter(function (a) { return !allergyBoxes().some(function (c) { return norm(c.value) === norm(a); }); }).join(', ');
        eTitle.textContent = editing ? editor.getAttribute('data-t-edit') : editor.getAttribute('data-t-new');
        paintTags(); editor.hidden = false; openBtn.hidden = true; eName.focus();
      };
      var closeEditor = function () { editor.hidden = true; openBtn.hidden = false; editing = ''; };
      var paintPeople = function () {
        plist.innerHTML = '';
        if (!p.people.length) { var li0 = document.createElement('li'); li0.className = 'text-muted'; li0.textContent = form.getAttribute('data-t-people-none') || ''; plist.appendChild(li0); return; }
        p.people.forEach(function (x, i) {
          var li = document.createElement('li');
          var chips = (x.allergies || []).map(function (a) { return '<span class="pchip pchip--al">' + esc(a) + '</span>'; }).concat((x.dislikes || []).map(function (a) { return '<span class="pchip">' + esc(a) + '</span>'; }), (x.diets || []).map(function (a) { return '<span class="pchip pchip--di">' + esc(a) + '</span>'; })).join('');
          li.innerHTML = '<div><strong>' + esc(x.name) + '</strong><div class="pchips">' + (chips || '<span class="text-muted">—</span>') + '</div></div>';
          var box = document.createElement('div'); box.className = 'people__act';
          var eb = document.createElement('button'); eb.type = 'button'; eb.className = 'btn btn--outline btn--sm'; eb.textContent = form.getAttribute('data-t-people-edit') || 'Edit'; eb.addEventListener('click', function () { openEditor(x.id); });
          var rb = document.createElement('button'); rb.type = 'button'; rb.className = 'btn btn--ghost btn--sm'; rb.textContent = editor.getAttribute('data-t-remove') || '×'; rb.addEventListener('click', function () { p.people.splice(i, 1); persist2(); paintPeople(); });
          box.appendChild(eb); box.appendChild(rb); li.appendChild(box); plist.appendChild(li);
        });
      };
      openBtn.addEventListener('click', function () { openEditor(''); });
      $('[data-pe-cancel]', editor).addEventListener('click', closeEditor);
      $('[data-pe-save]', editor).addEventListener('click', function () {
        var name = eName.value.trim(); if (!name) { eName.focus(); return; }
        if (eTagIn.value.trim()) addDis(eTagIn.value);
        var al = allergyBoxes().filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
        String(eOther.value || '').split(',').forEach(function (v) { v = v.trim(); if (v && al.map(norm).indexOf(norm(v)) < 0) al.push(v); });
        var di = dietBoxes().filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
        var rec = { id: editing || ('p' + Date.now().toString(36)), name: name, allergies: al, dislikes: dis.slice(), diets: di };
        var at = p.people.map(function (x) { return x.id; }).indexOf(rec.id);
        if (at > -1) p.people[at] = rec; else p.people.push(rec);
        persist2(); paintPeople(); closeEditor();
      });
      paintPeople();
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var al = $$('input[name="allergy"]:checked', form).map(function (c) { return c.value; });
      if (other && other.value) other.value.split(',').forEach(function (v) { if (v.trim()) al.push(v.trim()); });
      p.allergies = al;
      p.diets = $$('input[name="diet"]:checked', form).map(function (c) { return c.value; });
      saveProfile(p); applyProfile();
      var msg = $('[data-profile-msg]', form);
      if (msg) { msg.hidden = false; }
    });
  }

  /* ---------- dropdowns: a row of chips becomes one styled select (the chips stay in the page, hidden, so the filters and deep links keep working) ---------- */
  function initDropdowns() {
    $$('[data-dropdown]').forEach(function (src, idx) {
      if (src.getAttribute('data-dd-ready')) return; src.setAttribute('data-dd-ready', '1');
      var multi = src.getAttribute('data-dropdown') === 'multi', chips = $$('button.chip', src);
      if (!chips.length) return;
      var lab = src.getAttribute('data-dd-label') || '', allT = src.getAttribute('data-dd-all') || '', nT = src.getAttribute('data-dd-n') || '{n}', clrT = src.getAttribute('data-dd-clear') || '';
      var id = 'dd-' + idx, wrap = document.createElement('div'); wrap.className = 'dd' + (multi ? ' dd--multi' : '');
      var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'dd__btn'; btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', id);
      var l1 = document.createElement('span'); l1.className = 'dd__lab'; l1.textContent = lab; var l2 = document.createElement('span'); l2.className = 'dd__val'; var l3 = document.createElement('span'); l3.className = 'dd__chev'; l3.setAttribute('aria-hidden', 'true');
      if (lab) btn.appendChild(l1); btn.appendChild(l2); btn.appendChild(l3);
      var list = document.createElement('div'); list.className = 'dd__list'; list.id = id; list.setAttribute('role', 'listbox'); list.hidden = true; if (multi) list.setAttribute('aria-multiselectable', 'true'); if (lab) list.setAttribute('aria-label', lab);
      var clr = null;
      if (multi && clrT) { clr = document.createElement('button'); clr.type = 'button'; clr.className = 'dd__clear'; clr.textContent = clrT; list.appendChild(clr); }
      var opts = chips.map(function (ch) {
        var o = document.createElement('button'); o.type = 'button'; o.className = 'dd__opt'; o.setAttribute('role', 'option'); o.setAttribute('data-value', ch.getAttribute('data-value') || ch.getAttribute('data-dchip') || '');
        var tick = document.createElement('span'); tick.className = 'dd__tick'; tick.setAttribute('aria-hidden', 'true'); var t = document.createElement('span'); t.className = 'dd__t'; t.textContent = ch.textContent.trim();
        o.appendChild(tick); o.appendChild(t); list.appendChild(o);
        o.addEventListener('click', function () { ch.click(); sync(); if (!multi) close(true); });
        return o;
      });
      wrap.appendChild(btn); wrap.appendChild(list); src.parentNode.insertBefore(wrap, src); src.classList.add('dd-src'); src.setAttribute('aria-hidden', 'true'); chips.forEach(function (c) { c.tabIndex = -1; });
      var pressed = function (ch) { return ch.getAttribute('aria-pressed') === 'true'; };
      var sync = function () {
        var on = chips.filter(pressed);
        opts.forEach(function (o, k) { var p = pressed(chips[k]); o.setAttribute('aria-selected', p ? 'true' : 'false'); o.classList.toggle('is-on', p); });
        l2.textContent = multi ? (on.length === 0 ? allT : on.length === 1 ? on[0].textContent.trim() : nT.replace('{n}', on.length)) : (on[0] || chips[0]).textContent.trim();
        wrap.classList.toggle('has-value', multi ? on.length > 0 : (on[0] && chips.indexOf(on[0]) > 0));
        if (clr) clr.hidden = on.length === 0;
      };
      var isOpen = function () { return !list.hidden; };
      var open = function () {
        $$('.dd.is-open').forEach(function (w) { if (w !== wrap) { var b2 = w.querySelector('.dd__btn'); if (b2) b2.click(); } });
        list.hidden = false; wrap.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true');
        var r = btn.getBoundingClientRect(), room = window.innerHeight - r.bottom; wrap.classList.toggle('dd--up', room < 300 && r.top > room);
        var sel = list.querySelector('.dd__opt.is-on') || list.querySelector('.dd__opt'); if (sel) sel.scrollIntoView({ block: 'nearest' });
      };
      var close = function (focusBtn) { if (!isOpen()) return; list.hidden = true; wrap.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); if (focusBtn) btn.focus(); };
      btn.addEventListener('click', function () { if (isOpen()) close(false); else open(); });
      btn.addEventListener('keydown', function (e) { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!isOpen()) open(); var s = list.querySelector('.dd__opt.is-on') || list.querySelector('.dd__opt'); if (s) s.focus(); } });
      list.addEventListener('keydown', function (e) {
        var all = $$('.dd__opt', list), k = all.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); (all[Math.min(all.length - 1, k + 1)] || all[0]).focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); (all[Math.max(0, k - 1)] || all[0]).focus(); }
        else if (e.key === 'Home') { e.preventDefault(); all[0].focus(); } else if (e.key === 'End') { e.preventDefault(); all[all.length - 1].focus(); }
        else if (e.key === 'Escape') { e.preventDefault(); close(true); } else if (e.key === 'Tab') close(false);
      });
      wrap.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) { e.preventDefault(); e.stopPropagation(); close(true); } });
      if (clr) clr.addEventListener('click', function () { chips.filter(pressed).forEach(function (c) { c.click(); }); sync(); });
      document.addEventListener('click', function (e) { if (isOpen() && !wrap.contains(e.target) && !src.contains(e.target)) close(false); });
      if (window.MutationObserver) new MutationObserver(sync).observe(src, { attributes: true, attributeFilter: ['aria-pressed'], subtree: true });
      sync();
    });
  }

  /* ---------- menu filters ---------- */
  function initFilters() {
    var bar = $('[data-filters]');
    if (!bar) return;
    var state = { category: 'all', diets: [], tier: 'all', season: 'week' };
    var scope = bar.closest('section') || document;
    var run = function () {
      $$('[data-dish]', scope).forEach(function (c) {
        var okCat = inGroup(c, state.category);
        var diets = (c.getAttribute('data-diets') || '').split('|');
        var okDiet = state.diets.every(function (d) { return diets.indexOf(d) > -1; });
        var okTier = state.tier === 'all' || c.getAttribute('data-tier') === state.tier;
        var okSeason = (c.getAttribute('data-seasonal') === 'true') === (state.season === 'season');
        c.classList.toggle('is-hidden', !(okCat && okDiet && okTier && okSeason));
      });
      var vis = $$('[data-dish]:not(.is-hidden)', scope).length;
      var empty = $('[data-empty]', scope); if (empty) empty.hidden = vis > 0;
      var snote = $('[data-season-note]', scope); if (snote) snote.hidden = state.season !== 'season';
      var count = $('[data-count]', scope); if (count) count.textContent = vis;
    };
    $$('[data-filter]', bar).forEach(function (b) {
      b.addEventListener('click', function () {
        var g = b.getAttribute('data-filter'), v = b.getAttribute('data-value');
        if (g === 'diet') {
          var on = b.getAttribute('aria-pressed') !== 'true';
          b.setAttribute('aria-pressed', on);
          state.diets = state.diets.filter(function (x) { return x !== v; });
          if (on) state.diets.push(v);
        } else {
          $$('[data-filter="' + g + '"]', bar).forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
          state[g] = v;
        }
        run();
      });
    });
    var dgFirst = true;
    document.addEventListener('kx:diet', function (e) { var v = e.detail; if (!v) return; if (dgFirst) { dgFirst = false; if (/[?&](dieta|categoria)=/.test((location.search || '') + (location.hash || ''))) return; } var b = $('[data-filter="category"][data-value="' + v + '"]', bar) || $('[data-filter="category"][data-value="all"]', bar); if (b) b.click(); });
    // deep link: ?categoria=bowls&dieta=keto  (also works as #/menu?categoria=bowls)
    var deepLink = function () {
      var qs = location.search || (location.hash.indexOf('?') > -1 ? location.hash.slice(location.hash.indexOf('?')) : '');
      var q = new URLSearchParams(qs);
      if (!q.get('categoria') && !q.get('dieta')) return;
      // a new deep link replaces whatever was selected before
      $$('[data-filter="diet"][aria-pressed="true"]', bar).forEach(function (x) { x.click(); });
      var allCat = $('[data-filter="category"][data-value="all"]', bar); if (allCat) allCat.click();
      var allTier = $('[data-filter="tier"][data-value="all"]', bar); if (allTier) allTier.click();
      if (q.get('categoria')) { var cv = q.get('categoria'); if (!GROUPS[cv]) Object.keys(GROUPS).forEach(function (k) { if (GROUPS[k].cat && GROUPS[k].cat.indexOf(cv) > -1) cv = k; }); var cb = $('[data-filter="category"][data-value="' + cv + '"]', bar); if (cb) cb.click(); }
      if (q.get('dieta')) {
        var gdb = groupForDiet(q.get('dieta')), db = gdb ? $('[data-filter="category"][data-value="' + gdb + '"]', bar) : $('[data-filter="diet"][data-value="' + q.get('dieta') + '"]', bar);
        if (db && db.getAttribute('aria-pressed') !== 'true') db.click();
      }
    };
    deepLink();
    window.addEventListener('hashchange', deepLink);
    run();
  }

  /* ---------- cart ---------- */
  function initCart() {
    var form = $('[data-cart-form]');
    if (!form) return;
    var contract = $('[data-contract]', form), checkout = $('[data-checkout]', form);
    // a new account must confirm its allergy profile before it can pay (existing customers with orders are not asked again)
    var needProfile = !!$('#kx-account') && ordersCount() === 0 && !isOnboarded(), pmsg = $('[data-cart-profile]', form);
    if (pmsg) pmsg.hidden = !needProfile;
    var gate = function () { if (checkout) checkout.disabled = !(contract && contract.checked) || needProfile; };
    if (contract) { contract.addEventListener('change', gate); gate(); }

    var ref = $('[data-referral]', form), refMsg = $('[data-referral-msg]', form), giftBox = $('[data-gift]', form);
    var saved = ''; try { saved = localStorage.getItem('kulinaria_ref') || ''; } catch (e) {}
    if (ref && !ref.value && saved) ref.value = saved;
    // discount code created by the admin (Descuentos tab): kept in the form so Shopify applies it at checkout
    var disc = $('[data-discount]', form); if (disc) disc.addEventListener('input', function () { disc.value = disc.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''); });
    var showGift = function () { if (giftBox) giftBox.hidden = !(ref && ref.value.trim().length >= 3); };
    if (ref) {
      ref.addEventListener('input', function () { ref.value = ref.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''); showGift(); });
      ref.addEventListener('change', function () {
        try { localStorage.setItem('kulinaria_ref', ref.value); } catch (e) {}
        fetch('/cart/update.js', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attributes: { codigo_referencia: ref.value } }) })
          .then(function () { if (refMsg) { refMsg.hidden = !ref.value; } }).catch(function () {});
      });
      showGift();
    }
    // Welcome gift: added as a $0 line (price enforced by the automatic discount / Shopify Function).
    $$('[data-gift-add]', form).forEach(function (b) {
      b.addEventListener('click', function () {
        var checked = $('input[name="gift"]:checked', form) || $('input[name="gift"]', form);
        if (!checked) return;
        b.disabled = true;
        fetch('/cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: [{ id: parseInt(checked.value, 10), quantity: 1,
            properties: { _regalo_bienvenida: 'true', Talla: ($('[name="gift_size"]', form) || {}).value || '' } }] }) })
          .then(function () {
            var ev = new CustomEvent('kulinaria:cart-updated', { cancelable: true });
            if (document.dispatchEvent(ev)) location.reload(); else b.disabled = false;
          }).catch(function () { b.disabled = false; });
      });
    });
  }

  /* Remember a referral code typed at sign-up so the cart can pick it up. */
  function initRefSave() {
    $$('[data-ref-save]').forEach(function (i) {
      var saved = ''; try { saved = localStorage.getItem('kulinaria_ref') || ''; } catch (e) {}
      if (saved && !i.value) i.value = saved;
      i.addEventListener('input', function () {
        i.value = i.value.toUpperCase().replace(/[^A-Z0-9_]/g, '');
        try { localStorage.setItem('kulinaria_ref', i.value); } catch (e) {}
      });
    });
  }

  /* =====================================================================
     Motion layer. Progressive: the page is fully usable without it, and it
     is skipped for prefers-reduced-motion. Failsafe lives in layout/theme.liquid.
     ===================================================================== */
  var mq = function (q) { return !!(window.matchMedia && window.matchMedia(q).matches); };
  var REDUCE = mq('(prefers-reduced-motion: reduce)');
  var FINE = mq('(pointer: fine)');
  var raf = function (fn) { var queued = false; return function () { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; fn(); }); }; };

  // scroll progress bar + compact header state (the header is position:fixed: its size never moves the page)
  function initChrome() {
    var hdr = $('.site-header');
    var bar = document.createElement('div');
    bar.className = 'scroll-progress'; bar.setAttribute('aria-hidden', 'true'); document.body.appendChild(bar);
    var stuck = false;
    var update = function () {
      var y = window.scrollY, max = root.scrollHeight - window.innerHeight;
      bar.style.setProperty('--sp', max > 0 ? Math.min(1, y / max).toFixed(4) : '0');
      if (!hdr) return;
      var next = stuck ? y > 8 : y > 56;           // hysteresis: no flicker around the threshold
      if (next !== stuck) { stuck = next; hdr.classList.toggle('is-stuck', stuck); }
    };
    window.addEventListener('scroll', raf(update), { passive: true });
    update();
  }

  // headline words rise in one by one (handles <em> inside the headline)
  function initSplit() {
    $$('.hero h1, .section__head h2, .cta-banner h2, .page-head h1').forEach(function (h) {
      if (h.getAttribute('data-split')) return;
      var txt = h.textContent.replace(/\s+/g, ' ').trim();
      if (!txt) return;
      var idx = 0;
      var words = function (str, into) {
        str.split(/(\s+)/).forEach(function (w) {
          if (!w) return;
          if (/^\s+$/.test(w)) { into.appendChild(document.createTextNode(' ')); return; }
          var s = document.createElement('span'); s.className = 'w'; s.setAttribute('aria-hidden', 'true');
          var inner = document.createElement('i'); inner.style.setProperty('--i', idx++); inner.textContent = w;
          s.appendChild(inner); into.appendChild(s);
        });
      };
      var nodes = Array.prototype.slice.call(h.childNodes);
      h.setAttribute('aria-label', txt); h.setAttribute('data-split', '1'); h.classList.add('split'); h.textContent = '';
      nodes.forEach(function (n) {
        if (n.nodeType === 3) words(n.textContent, h);
        else if (n.nodeType === 1) { var el = n.cloneNode(false); words(n.textContent, el); h.appendChild(el); }
      });
    });
  }

  // staggered reveal on scroll
  function initReveal() {
    var SEL = '.card,.tier-row,.index-row,.plan-card,.accordion details,.panel,.dish,.product__info>*,.account-block,.cart-line,.footer-grid>div,' +
      '.section__head .eyebrow,.section__head .lede,.spec,.rail__nav,.filter-secondary,.fg__foot,.countdown';
    var els = $$(SEL).filter(function (e, i, a) { return a.indexOf(e) === i; });
    els.forEach(function (el) {
      if (el.classList.contains('reveal')) return;
      var idx = el.parentNode ? Array.prototype.indexOf.call(el.parentNode.children, el) : 0;
      el.style.setProperty('--d', Math.min(idx, 6) * 90 + 'ms');
      el.classList.add('reveal');
    });
    var targets = els.concat($$('.split'));
    if (!('IntersectionObserver' in window)) { targets.forEach(function (t) { t.classList.add('is-in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    whenLoaded(function () { targets.forEach(function (t) { io.observe(t); }); });
  }

  // scroll-linked custom property --p (0..1) for parallax / ring / footer wordmark
  function initScrollVars() {
    var els = $$('[data-scroll]');
    if (!els.length || REDUCE) return;
    var update = function () {
      var vh = window.innerHeight;
      els.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (!r.height || r.bottom < -300 || r.top > vh + 300) return;
        var p = el.getAttribute('data-scroll') === 'in' ? (vh - r.top) / (r.height * 1.2 + vh * 0.3) : -r.top / r.height;
        el.style.setProperty('--p', Math.max(0, Math.min(1, p)).toFixed(4));
      });
    };
    window.addEventListener('scroll', raf(update), { passive: true });
    window.addEventListener('resize', update); window.addEventListener('hashchange', function () { setTimeout(update, 60); });
    update();
  }

  // cursor spotlight on cards, fill-origin on pill buttons, plate tilt, magnetic buttons
  function initPointer() {
    if (!FINE || REDUCE) return;
    var SPOT = '.card,.tier-row,.plan-card,.dish,.panel,.index-row';
    document.addEventListener('pointermove', function (e) {
      var tgt = e.target.closest ? e.target : null; if (!tgt) return;
      var s = tgt.closest(SPOT);
      if (s) { var r = s.getBoundingClientRect(); s.style.setProperty('--mx', (e.clientX - r.left) + 'px'); s.style.setProperty('--my', (e.clientY - r.top) + 'px'); }
      var hero = tgt.closest('[data-tilt]');
      if (hero) {
        var hr = hero.getBoundingClientRect();
        hero.style.setProperty('--tx', ((e.clientX - hr.left) / hr.width - 0.5).toFixed(3)); hero.style.setProperty('--ty', ((e.clientY - hr.top) / hr.height - 0.5).toFixed(3));
      }
    }, { passive: true });
    var origin = function (e) {
      var b = e.target.closest ? e.target.closest('.btn') : null;
      if (!b || (e.relatedTarget && b.contains(e.relatedTarget))) return;
      var r = b.getBoundingClientRect();
      b.style.setProperty('--x', (e.clientX - r.left) + 'px'); b.style.setProperty('--y', (e.clientY - r.top) + 'px');
    };
    document.addEventListener('pointerover', origin); document.addEventListener('pointerout', origin);
    $$('[data-magnetic]').forEach(function (b) {
      b.addEventListener('pointermove', function (e) {
        var r = b.getBoundingClientRect();
        b.style.translate = (((e.clientX - (r.left + r.width / 2)) / r.width) * 14).toFixed(1) + 'px ' + (((e.clientY - (r.top + r.height / 2)) / r.height) * 10).toFixed(1) + 'px';
      });
      b.addEventListener('pointerleave', function () { b.style.translate = ''; });
    });
  }

  // draggable, snap-scrolling carousel with arrow buttons
  function initRail() {
    $$('[data-rail]').forEach(function (rail) {
      var track = $('.rail__track', rail), prev = $('[data-rail-prev]', rail), next = $('[data-rail-next]', rail);
      if (!track) return;
      var step = function () { var c = track.querySelector('.dish'); return c ? c.getBoundingClientRect().width + 24 : track.clientWidth * 0.8; };
      var sync = function () {
        if (prev) prev.disabled = track.scrollLeft <= 4;
        if (next) next.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 4;
      };
      if (prev) prev.addEventListener('click', function () { track.scrollBy({ left: -step() * 2, behavior: REDUCE ? 'auto' : 'smooth' }); });
      if (next) next.addEventListener('click', function () { track.scrollBy({ left: step() * 2, behavior: REDUCE ? 'auto' : 'smooth' }); });
      var cover = function () {
        if (REDUCE) return;
        var tr = track.getBoundingClientRect(), mid = tr.left + tr.width / 2;
        $$('.dish', track).forEach(function (c) {
          var r = c.getBoundingClientRect(), o = Math.max(-1.3, Math.min(1.3, (r.left + r.width / 2 - mid) / (tr.width / 2)));
          c.style.setProperty('--ry', (o * -9).toFixed(2) + 'deg'); c.style.setProperty('--sc', (1 - Math.abs(o) * 0.055).toFixed(3));
        });
      };
      track.addEventListener('scroll', raf(function () { sync(); cover(); }), { passive: true });
      window.addEventListener('resize', raf(cover)); cover();
      if ('ResizeObserver' in window) new ResizeObserver(sync).observe(track); else window.addEventListener('resize', sync);
      var down = false, moved = false, sx = 0, sl = 0;
      track.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse' || e.button !== 0) return; down = true; moved = false; sx = e.clientX; sl = track.scrollLeft; });
      window.addEventListener('pointermove', function (e) {
        if (!down) return;
        var dx = e.clientX - sx;
        if (Math.abs(dx) > 6) { moved = true; track.classList.add('is-drag'); }
        if (moved) track.scrollLeft = sl - dx;
      });
      window.addEventListener('pointerup', function () { if (down) { down = false; setTimeout(function () { track.classList.remove('is-drag'); }, 0); } });
      track.addEventListener('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
      sync();
    });
  }



  // multi-step sign-up
  function initSteps() {
    $$('[data-steps]').forEach(function (holder) {
      var steps = $$('[data-step]', holder), dots = $$('[data-step-dot]', holder), bar = $('[data-steps-bar]', holder);
      var prev = $('[data-step-prev]', holder), next = $('[data-step-next]', holder), i = 0;
      var show = function (n) {
        i = n;
        steps.forEach(function (st, k) { st.classList.toggle('is-on', k === n); });
        dots.forEach(function (d, k) { d.classList.toggle('is-on', k === n); d.classList.toggle('is-done', k < n); });
        if (bar) bar.style.transform = 'scaleX(' + ((n + 1) / steps.length) + ')';
        if (prev) prev.hidden = n === 0;
        if (next) next.hidden = n === steps.length - 1;
      };
      if (next) next.addEventListener('click', function () {
        var bad = $$('input[required]', steps[i]).filter(function (f) { return !f.checkValidity(); })[0];
        if (bad) { bad.reportValidity(); return; }
        show(i + 1);
      });
      if (prev) prev.addEventListener('click', function () { show(i - 1); });
      dots.forEach(function (d, k) { d.addEventListener('click', function () { if (k < i) show(k); }); });
      var form = holder.closest('form'), contract = $('[data-signup-contract]', holder), sub = $('[data-signup-submit]', holder);
      if (contract && sub) contract.addEventListener('change', function () { sub.disabled = !contract.checked; });
      if (form) form.addEventListener('submit', function () {
        var p = loadProfile();
        p.allergies = $$('input[name="allergy"]:checked', form).map(function (c) { return c.value; });
        var other = $('[name="allergy_other"]', form);
        if (other && other.value) other.value.split(',').forEach(function (v) { if (v.trim()) p.allergies.push(v.trim()); });
        var dl = $('[name="dislikes"]', form);
        if (dl && dl.value) p.dislikes = dl.value.split(',').map(function (v) { return v.trim(); }).filter(Boolean);
        p.diets = $$('input[name="diet"]:checked', form).map(function (c) { return c.value; });
        saveProfile(p);
      });
      show(0);
    });
  }


  /* ---------- order funnel: diet -> dishes -> plan -> categories -> your details ----------
     State lives in localStorage (kulinaria_funnel) so a returning visitor finds the same selection and details.
     On finish it writes the profile + cart attributes (these become order "additional details" and feed the spreadsheet)
     and adds the chosen dishes to the cart. */
  var FUNNEL_KEY = 'kulinaria_funnel';
  /* ---------- account profile: asked once (onboarding), stored in the browser and in the Google Sheet (signed per customer) ---------- */
  var ONB_KEY = 'kulinaria_onboarded';
  function acct() { var a = $('#kx-account'); return a && a.getAttribute('data-endpoint') && a.getAttribute('data-token') ? { url: a.getAttribute('data-endpoint'), cid: a.getAttribute('data-cid'), token: a.getAttribute('data-token') } : null; }
  function ordersCount() {
    var a = $('#kx-account'), n = a ? parseInt(a.getAttribute('data-orders'), 10) || 0 : 0;
    try { if (location.protocol === 'file:' && localStorage.getItem('kx-test-orders') != null) n = parseInt(localStorage.getItem('kx-test-orders'), 10) || 0; } catch (e) {}   // local preview only
    return n;
  }
  // The questionnaire answers (profile, onboarded flag, saved details) are tied to the account that gave them. A guest, a first-time account or a different person
  // on the same browser always starts blank; a returning customer gets their answers back from the server (pullProfile).
  function bindIdentity() {
    try {
      if (location.protocol === 'file:' && !localStorage.getItem('kx-test-identity')) return;       // local preview keeps its test fixtures
      var a = $('#kx-account'), cid = a ? String(a.getAttribute('data-cid') || '') : '', stored = localStorage.getItem('kx_cid') || '';
      var wipe = function () {
        localStorage.removeItem(PROFILE_KEY); localStorage.removeItem(ONB_KEY); sessionStorage.removeItem('kx_pulled'); Object.keys(localStorage).forEach(function (k) { if (k.indexOf('kx_last_order') === 0) localStorage.removeItem(k); });
        var f = JSON.parse(localStorage.getItem(FUNNEL_KEY) || 'null');
        if (f) { f.info = {}; f.allergies = []; f.para = ''; f.mods = f.mods || []; localStorage.setItem(FUNNEL_KEY, JSON.stringify(f)); }
      };
      if (!cid) { if (stored || localStorage.getItem(ONB_KEY) || localStorage.getItem(PROFILE_KEY)) { wipe(); localStorage.removeItem('kx_cid'); } return; }
      if (stored !== cid) { wipe(); localStorage.setItem('kx_cid', cid); }
    } catch (e) {}
  }
  function isOnboarded() { try { return !!localStorage.getItem(ONB_KEY); } catch (e) { return false; } }
  // A brand-new account (no orders, no saved profile) is taken to the questionnaire right after signing in, once per visit.
  // Existing paying customers are never interrupted: they go straight to choosing their week.
  function guardOnboarding() {
    var a = $('#kx-account'), ob = $('[data-onboarding]'); if (!a || isOnboarded() || (ob && !ob.closest('[hidden]'))) return;
    try { if (sessionStorage.getItem('kx_ob_asked')) return; sessionStorage.setItem('kx_ob_asked', '1'); } catch (e) { return; }
    var l = $('[data-kx-onb]', a); if (l && l.getAttribute('href')) window.location.href = l.getAttribute('href');
  }
  function readFunnel() { try { return JSON.parse(localStorage.getItem(FUNNEL_KEY) || 'null') || { v: 2 }; } catch (e) { return { v: 2 }; } }
  function profileBlob() { var f = readFunnel(), p = loadProfile(); return { info: f.info || {}, checks: f.allergies || [], allergies: p.allergies || [], dislikes: p.dislikes || [], diets: p.diets || [], people: p.people || [], at: Date.now() }; }
  function pushProfile() {
    var a = acct(); if (!a) return;
    try { fetch(a.url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'profile', cid: a.cid, token: a.token, profile: profileBlob() }) }); } catch (e) {}
  }
  function pullProfile() {
    var a = acct(); if (!a) { guardOnboarding(); return; }
    try { if (sessionStorage.getItem('kx_pulled') || localStorage.getItem(ONB_KEY)) { guardOnboarding(); return; } sessionStorage.setItem('kx_pulled', '1'); } catch (e) { return; }
    fetch(a.url + (a.url.indexOf('?') > -1 ? '&' : '?') + 'action=profile&cid=' + encodeURIComponent(a.cid) + '&token=' + encodeURIComponent(a.token))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok || !d.profile || !d.profile.info) { guardOnboarding(); return; }
        var f = readFunnel(); f.v = 2; f.info = Object.assign({}, d.profile.info, f.info || {}); f.allergies = d.profile.checks || [];
        try { localStorage.setItem(FUNNEL_KEY, JSON.stringify(f)); localStorage.setItem(PROFILE_KEY, JSON.stringify({ allergies: d.profile.allergies || [], dislikes: d.profile.dislikes || [], diets: d.profile.diets || [], people: d.profile.people || [] })); localStorage.setItem(ONB_KEY, '1'); } catch (e) {}
        location.reload();
      }).catch(function () { guardOnboarding(); });
  }
  /* ---------- clear cart (cart page and header menu) ---------- */
  function initClearCart() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-cart-clear]'); if (!b) return;
      e.preventDefault();
      var ask = b.getAttribute('data-confirm'); if (ask && !window.confirm(ask)) return;
      b.disabled = true;
      var done = function () { try { var f = JSON.parse(localStorage.getItem(FUNNEL_KEY) || 'null'); if (f) { f.days = []; f.qty = {}; f.sent = false; f.step = 0; localStorage.setItem(FUNNEL_KEY, JSON.stringify(f)); } } catch (x) {} window.location.reload(); };
      try { fetch('/cart/clear.js', { method: 'POST', headers: { Accept: 'application/json' } }).then(done, done); } catch (x) { done(); }
    });
  }

  /* ---------- account hub (own page): week summary and profile summary ---------- */
  function initAccountHub() {
    var hw = $('[data-hub-week]'), hp = $('[data-hub-profile]'); if (!hw && !hp) return;
    var fill = function (tpl, o) { return String(tpl).replace(/\[(\w+)\]/g, function (m, k) { return o[k] != null ? o[k] : m; }); };
    if (hw) {
      var main = $('[data-hub-week-main]', hw);
      loadCredits(function (c) {
        if (!c || !c.hasPlan) { main.textContent = main.getAttribute('data-t-none'); return; }
        var e = ''; try { var q = String(c.endsOn).split('-'); e = new Intl.DateTimeFormat(cfg.lang === 'en' ? 'en-US' : 'es-MX', { timeZone: TZ, day: 'numeric', month: 'short' }).format(new Date(+q[0], +q[1] - 1, +q[2], 12)); } catch (x) {}
        main.textContent = c.pausedFrom ? '⏸' : fill(main.getAttribute('data-t-some'), { w: c.weeksLeft, t: c.weeksTotal, e: e || '—' });
      });
    }
    if (hp) {
      var body = $('[data-hub-profile-body]', hp), p = loadProfile(), rows = [];
      var row = function (k, list) { if (list && list.length) rows.push('<div><b>' + hp.getAttribute('data-t-' + k) + '</b>' + list.map(function (x) { return String(x).replace(/[&<>]/g, ''); }).join(', ') + '</div>'); };
      row('allergies', p.allergies); row('dislikes', p.dislikes); row('diets', p.diets);
      if (p.people && p.people.length) row('people', p.people.map(function (x) { return x.name; }));
      body.innerHTML = rows.length ? rows.join('') : '<p class="text-muted" style="margin:0">' + hp.getAttribute('data-t-none') + '</p>';
    }
  }

  /* ---------- home: nutritional-focus chips filter the dishes shown right below them ---------- */
  /* ---------- "what kind of diet are you after?": asked before any dish list; remembered, shown as a one-line bar with "change" ---------- */
  function initDietGate() {
    var KEY = 'kx_dietpick', scopes = $$('[data-dgate-scope]'); if (!scopes.length) return;
    var get = function () { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } };
    var put = function (v) { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch (e) {} };
    var labelOf = function (v) { var b = $('[data-dg-pick="' + v + '"]'); return b ? b.getAttribute('data-dg-label') : ''; };
    var paint = function (v) {
      scopes.forEach(function (sc) {
        var asking = !v, g = $('[data-dgate]', sc), bar = $('[data-dgbar]', sc), nm = $('[data-dg-name]', sc);
        sc.setAttribute('data-dg', asking ? 'ask' : 'on'); if (g) g.hidden = !asking; if (bar) bar.hidden = asking; if (nm) nm.textContent = labelOf(v);
      });
      document.dispatchEvent(new CustomEvent('kx:diet', { detail: v }));
    };
    document.addEventListener('click', function (e) {
      var p = e.target.closest && e.target.closest('[data-dg-pick]');
      if (p) { var v = p.getAttribute('data-dg-pick'); put(v); paint(v); return; }
      if (e.target.closest && e.target.closest('[data-dg-change]')) { put(''); paint(''); }
    });
    var linked = /[?&](dieta|categoria)=/.test((location.search || '') + (location.hash || ''));   // a deep link already says what to show
    paint(get() || (linked ? 'all' : ''));
  }

  function initDietChips() {
    var root = $('[data-dchips]'); if (!root) return;
    var scope = root.closest('section'), grid = $('[data-dc-grid]', scope), cnt = $('[data-dc-count]', scope), empty = $('[data-dc-empty]', scope), body = $('[data-dc-body]', scope), ask = $('[data-dc-ask]', scope);
    var run = function () {
      var all = $('[data-dchip="all"][aria-pressed="true"]', root), on = $$('[data-dchip][aria-pressed="true"]', root).map(function (b) { return b.getAttribute('data-dchip'); }).filter(function (x) { return x !== 'all'; }), n = 0;
      var open = !!all || on.length > 0;                                   // first choose, then see: the dishes stay hidden until a diet (or "all") is picked
      if (body) body.hidden = !open; if (ask) ask.hidden = open;
      $$('[data-dish]', grid).forEach(function (c) { var d = (c.getAttribute('data-diets') || '').split('|'), ok = on.every(function (x) { return d.indexOf(x) > -1; }); c.classList.toggle('is-hidden', !ok); if (ok) n++; });
      if (cnt) cnt.textContent = String(cnt.getAttribute('data-t') || '').replace('[n]', n);
      if (empty) empty.hidden = n > 0;
    };
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-dchip]'); if (!b) return;
      var on = b.getAttribute('aria-pressed') !== 'true', isAll = b.getAttribute('data-dchip') === 'all';
      if (on) $$('[data-dchip]', root).forEach(function (x) { if (isAll ? x !== b : x.getAttribute('data-dchip') === 'all') x.setAttribute('aria-pressed', 'false'); });   // "all" and a specific diet exclude each other
      b.setAttribute('aria-pressed', on ? 'true' : 'false'); run();
    });
    run();
  }

  /* ---------- requests (ambassador code, events, contact): the form still e-mails the store, and a copy goes to the sheet and the admin page ("Solicitudes") ---------- */
  function initLeads() {
    $$('[data-lead-wrap]').forEach(function (w) {
      var form = $('form', w), ep = w.getAttribute('data-endpoint'); if (!form || !ep) return;
      form.addEventListener('submit', function () {
        try {
          var f = {};
          $$('input[name],select[name],textarea[name]', form).forEach(function (x) { var m = /^contact\[(.+)\]$/.exec(x.name); if (!m || (x.type === 'checkbox' && !x.checked)) return; f[m[1]] = x.value; });
          fetch(ep, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'lead', kind: w.getAttribute('data-kind') || 'general', name: f.name, email: f.email, phone: f.phone, fields: f }) });
        } catch (e) {}
      });
    });
  }

  /* ---------- header account menu: initial in a circle, one drop-down (who is signed in, shortcuts, language, cart summary, sign out) ---------- */
  function initAccountMenu() {
    var root = $('[data-acct]'); if (!root) return;
    var btn = $('[data-acct-btn]', root), pop = $('[data-acct-pop]', root), dot = $('[data-acct-dot]', root), todo = $('[data-acct-todo]', root);
    var count = $('[data-acct-count]', root), total = $('[data-acct-total]', root), txt = $('[data-acct-cart-text]', root);
    var signedIn = btn.classList.contains('is-in');
    if (signedIn && !isOnboarded()) { if (dot) dot.hidden = false; if (todo) todo.hidden = false; }
    var setOpen = function (on) { pop.hidden = !on; btn.setAttribute('aria-expanded', on ? 'true' : 'false'); root.classList.toggle('is-open', on); };
    var paintCart = function (c) {
      var n = c.item_count || 0;
      if (count) { count.hidden = !n; count.textContent = n; }
      if (total) total.textContent = n ? money0(c.total_price / 100) : '';
      if (txt) txt.textContent = !n ? txt.getAttribute('data-t-empty') : n === 1 ? txt.getAttribute('data-t-one') : String(txt.getAttribute('data-t-many') || '').replace('[n]', n);
    };
    var money0 = function (v) { try { return new Intl.NumberFormat(cfg.lang === 'en' ? 'en-US' : 'es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v); } catch (e) { return '$' + Math.round(v); } };
    var refresh = function () { try { fetch('/cart.js', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(paintCart).catch(function () {}); } catch (e) {} };
    btn.addEventListener('click', function (e) { e.stopPropagation(); var on = pop.hidden; setOpen(on); if (on) refresh(); });
    document.addEventListener('click', function (e) { if (!pop.hidden && !root.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pop.hidden) { setOpen(false); btn.focus(); } });
    root.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.acct__links a, .acct__todo, .acct__cart a, .acct__out')) setOpen(false); });
  }

  /* ---------- dish detail panel: clicking a dish card opens the full breakdown (photo, description, nutrition, ingredients, allergens) in a side panel ---------- */
  function initDishPanel() {
    var panel = $('[data-dish-panel]'); if (!panel) return;
    var content = $('[data-dp-content]', panel), pick = $('[data-dp-pick]', panel), full = $('[data-dp-full]', panel), sheet = $('.dish-panel__sheet', panel), last = null, current = null, timer = 0;
    var flagPanel = function (card) {
      var p = effectiveProfile(), tagsO = (card.getAttribute('data-allergens') || '').split('|').filter(Boolean), ingsO = (card.getAttribute('data-ingredients') || '').split('|').filter(Boolean);
      var rep = allergyReport(p, tagsO, ingsO), soft = dislikeHits(p, tagsO.map(norm), ingsO.map(norm));
      $$('[data-dd-ing] li', content).forEach(function (li) {
        var raw = li.getAttribute('data-ing') || '', hit = rep.filter(function (r) { return r.items.indexOf(raw) > -1; }), sf = soft.filter(function (d) { var c = canon(d); return c && (norm(raw).indexOf(c) > -1 || named(norm(raw), c, c)); });
        if (hit.length) { li.classList.add('is-flag'); var s = document.createElement('small'); s.textContent = T('yourAllergy') + ': ' + hit.map(function (r) { return r.raw; }).join(', '); li.appendChild(s); li.title = T('ingFlag'); }
        else if (sf.length) { li.classList.add('is-soft'); li.title = T('ingSoft'); }
      });
      var fl = $('[data-dd-flag]', content);
      if (fl) { if (rep.length) { fl.hidden = false; fl.className = 'dd__flag is-hard'; fl.textContent = reportText(rep); } else if (soft.length) { fl.hidden = false; fl.className = 'dd__flag is-soft'; fl.textContent = dislikeText(p, tagsO, ingsO, soft); } else fl.hidden = true; }
    };
    var open = function (card) {
      var det = $('[data-dish-detail]', card); if (!det) return;
      content.innerHTML = det.innerHTML; var cp = $('[data-fn-price]', card), dp = $('.dd__price', content); if (cp && dp && dp.firstChild) dp.firstChild.textContent = cp.textContent; full.setAttribute('href', det.getAttribute('data-url') || '#'); sheet.setAttribute('aria-label', det.getAttribute('data-title') || '');
      flagPanel(card); current = card; var btn = $('[data-pick]', card); pick.hidden = !(card.hasAttribute('data-fn-dish') && btn && !card.classList.contains('is-blocked'));
      last = document.activeElement; clearTimeout(timer); panel.hidden = false; document.documentElement.classList.add('has-dish-panel');
      content.scrollTop = 0; sheet.scrollTop = 0;
      requestAnimationFrame(function () { requestAnimationFrame(function () { panel.classList.add('is-open'); }); }); sheet.focus({ preventScroll: true });
    };
    var close = function () {
      if (panel.hidden) return; panel.classList.remove('is-open'); document.documentElement.classList.remove('has-dish-panel');
      timer = setTimeout(function () { panel.hidden = true; content.innerHTML = ''; }, REDUCE ? 0 : 320);
      if (last && last.focus) { try { last.focus({ preventScroll: true }); } catch (e) {} }
    };
    document.addEventListener('click', function (e) {
      var t = e.target; if (!t || !t.closest) return;
      if (t.closest('[data-dp-close]')) { close(); return; }
      if (t.closest('[data-dp-pick]')) { var b = current && $('[data-pick]', current); close(); if (b) b.click(); return; }
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      var wbtn = t.closest('[data-fn-warnbtn]');
      if (wbtn) { e.preventDefault(); var bx = wbtn.closest('[data-fn-warnbox]'), on = !bx.classList.contains('is-open'); $$('[data-fn-warnbox].is-open').forEach(function (x) { x.classList.remove('is-open'); var b3 = $('[data-fn-warnbtn]', x); if (b3) b3.setAttribute('aria-expanded', 'false'); }); bx.classList.toggle('is-open', on); wbtn.setAttribute('aria-expanded', on ? 'true' : 'false'); return; }
      if (!t.closest('[data-fn-warnbox]')) $$('[data-fn-warnbox].is-open').forEach(function (x) { x.classList.remove('is-open'); });
      var hit = t.closest('.dish__media, .dish__title a, .dish__go, .fn-dish__media, .fn-dish__title');
      if (!hit) { var cc = t.closest('[data-has-detail]'); if (cc && !t.closest('a, button, input, select, textarea, label, .fn-warnbox, .fn-note, .fn-mods, [data-fn-note]')) hit = cc; }
      if (!hit || t.closest('[data-pick], button')) return;
      var card = hit.closest('[data-has-detail]'); if (!card) return;
      e.preventDefault(); open(card);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) close(); });
  }

  /* ---------- plan credits: weeks left, meals planned and which weeks can still be chosen (asked from the Sheet; signed-in customers only) ---------- */
  function mxIso(d) { try { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); } catch (e) { return ''; } }
  function firstOpenOffset() { var n = mxNow(), d = ((1 - n.dow + 7) % 7) || 7; if (n.dow === 0 || (n.dow === 6 && n.minutes >= cutoffMin)) d += 7; return d; }
  function fallbackCredits() {   // no backend reachable (local preview): an existing customer is treated as having a 4-week plan
    var n = ordersCount(), off = firstOpenOffset(), ed = [];
    if (n > 0) for (var k = 0; k < 3; k++) ed.push(mxIso(new Date(Date.now() + (off + 7 * k) * 86400000)));
    return { ok: true, hasPlan: n > 0, plan: n > 0 ? 'block' : '', weeksLeft: n > 0 ? 3 : 0, weeksTotal: n > 0 ? 4 : 0, mealsPlanned: 0, mealsMax: n > 0 ? 20 : 0, endsOn: ed[2] || '', editable: ed, fallback: true };
  }
  function loadCredits(cb, fresh) {
    try { if (location.protocol === 'file:') { var o = localStorage.getItem('kx-test-credits'); if (o) { cb(JSON.parse(o)); return; } } } catch (e) {}   // local preview only
    var a = acct(); if (!a) { cb(fallbackCredits()); return; }
    try { var c = JSON.parse(sessionStorage.getItem('kx_credits') || 'null'); if (!fresh && c && Date.now() - c.t < 60000) { cb(c.c); return; } } catch (e) {}
    fetch(a.url + (a.url.indexOf('?') > -1 ? '&' : '?') + 'action=credits&cid=' + encodeURIComponent(a.cid) + '&token=' + encodeURIComponent(a.token))
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.ok && typeof j.hasPlan === 'boolean') { try { sessionStorage.setItem('kx_credits', JSON.stringify({ t: Date.now(), c: j })); } catch (e) {} cb(j); } else cb(null); })
      .catch(function () { cb(null); });
  }

  /* ---------- request dialog (whole site): href="dialog:<kind>~<what>" opens a form with the fields of that kind; it goes to the sheet (Solicitudes) ---------- */
  function initHeroDialog() {
    var dlg = $('[data-hx-dialog]'); if (!dlg) return;
    var form = $('[data-hxd-form]', dlg), okBox = $('[data-hxd-ok]', dlg), title = $('[data-hxd-title]', dlg), chip = $('[data-hxd-chip]', dlg), sub = $('[data-hxd-sub]', dlg), err = $('[data-hxd-err]', dlg), go = $('[data-hxd-go]', dlg);
    var kind = '', what = '', member = false, code = '', ckey = '';
    var LEAD = { evento: 'carta' };
    var show = function (on) { dlg.hidden = !on; document.documentElement.classList.toggle('hx-dlg-open', on); document.dispatchEvent(new CustomEvent('kx:hxdlg')); if (on) { var f = $('[name=name]', dlg); if (f) setTimeout(function () { f.focus(); }, 30); } };
    var pick = function (name, text) { var s = $('select[name="' + name + '"]', dlg); if (!s || !text) return; var t = norm(text); for (var i = 0; i < s.options.length; i++) { var o = norm(s.options[i].text); if (o && (o.indexOf(t) === 0 || t.indexOf(o) === 0)) { s.selectedIndex = i; return; } } };
    var couponCode = function () { var a = acct(), c = a ? parseInt(a.cid, 10) : 0; return 'KMAG-' + ((c || 0) ? c.toString(36).toUpperCase().slice(-5) : 'XXXXX'); };
    // availability calendar for private events (busy dates come from the theme settings; the last days before today are closed too)
    var cal = $('[data-hxd-cal]', dlg), calIn = cal && $('input[name=fecha]', cal), calGrid = cal && $('[data-hxd-calgrid]', cal), calLbl = cal && $('[data-hxd-callbl]', cal), calPick = cal && $('[data-hxd-calpick]', cal);
    var busyOf = function () { return (dlg.getAttribute('data-busy') || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); }, lead = parseInt(dlg.getAttribute('data-lead'), 10); if (isNaN(lead)) lead = 3;
    var WD = (dlg.getAttribute('data-wd') || 'L,M,M,J,V,S,D').split(','), MN = (dlg.getAttribute('data-months') || '').split(','), calY = 0, calM = 0;
    var isoOf = function (y, m, d) { return y + '-' + (m + 1 < 10 ? '0' : '') + (m + 1) + '-' + (d < 10 ? '0' : '') + d; };
    var drawCal = function () {
      if (!calGrid) return;
      var first = new Date(calY, calM, 1), pad = (first.getDay() + 6) % 7, days = new Date(calY, calM + 1, 0).getDate(), today = new Date(), t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + lead), html = '', busyList = busyOf();
      WD.forEach(function (w) { html += '<span class="hxd__wd">' + w + '</span>'; });
      for (var p = 0; p < pad; p++) html += '<span></span>';
      for (var d = 1; d <= days; d++) {
        var iso = isoOf(calY, calM, d), off = new Date(calY, calM, d) < t0 || busyList.indexOf(iso) > -1, on = calIn && calIn.value === iso;
        html += '<button type="button" class="hxd__day' + (off ? ' is-busy' : ' is-free') + (on ? ' is-on' : '') + '" data-d="' + iso + '"' + (off ? ' disabled' : '') + ' aria-pressed="' + (on ? 'true' : 'false') + '">' + d + '</button>';
      }
      calGrid.innerHTML = html; if (calLbl) calLbl.textContent = (MN[calM] || '') + ' ' + calY;
      var prev = $('[data-hxd-calnav="-1"]', cal); if (prev) prev.disabled = (calY === today.getFullYear() && calM <= today.getMonth());
    };
    if (cal) cal.addEventListener('click', function (e) {
      var nav = e.target.closest('[data-hxd-calnav]'), day = e.target.closest('.hxd__day');
      if (nav && !nav.disabled) { calM += parseInt(nav.getAttribute('data-hxd-calnav'), 10); if (calM < 0) { calM = 11; calY--; } if (calM > 11) { calM = 0; calY++; } drawCal(); return; }
      if (day && !day.disabled) {
        calIn.value = day.getAttribute('data-d'); var q = calIn.value.split('-'), lbl = parseInt(q[2], 10) + ' ' + (MN[parseInt(q[1], 10) - 1] || '') + ' ' + q[0];
        if (calPick) calPick.textContent = dlg.getAttribute('data-t-chosen') + ' ' + lbl; drawCal();
      }
    });
    var open = function (k, w) {
      kind = k || 'consulta'; what = (w || '').trim();
      $$('.hxd__g', dlg).forEach(function (g) { g.hidden = g.getAttribute('data-for').split(' ').indexOf(kind) < 0; });
      if (title) title.textContent = dlg.getAttribute('data-t-' + kind) || dlg.getAttribute('data-t-consulta') || '';
      if (sub) sub.textContent = dlg.getAttribute('data-s-' + kind) || '';
      if (chip) { chip.textContent = what; chip.hidden = !what; }
      $$('[data-min-today]', dlg).forEach(function (i) { i.min = mxIso(new Date()); });
      if (cal) { var nw = new Date(); calY = nw.getFullYear(); calM = nw.getMonth(); calIn.value = ''; if (calPick) calPick.textContent = dlg.getAttribute('data-t-pick') || ''; drawCal(); }
      if (kind === 'sede') { var sd = $('[name=sede]', dlg); if (sd) sd.value = what; }
      if (kind === 'consulta') pick('objetivo', what); if (kind === 'evento') pick('tipo_evento', what); if (kind === 'entrenador') { var s = $('select[name=entrenador]', dlg); if (s) s.value = what; }
      var gatedKinds = (dlg.getAttribute('data-gated') || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean), needM = kind !== 'cupon' && gatedKinds.indexOf(kind) > -1, gateBox = $('[data-hxd-gate]', dlg);
      if (gateBox) gateBox.hidden = true;
      var cp = kind === 'cupon', cpBox = $('[data-hxd-coupon]', dlg), cpLock = $('[data-hxd-couponlock]', dlg);
      var apply = function () {
        if (!cp) { $$('[data-hxd-common]', dlg).forEach(function (x) { x.hidden = false; }); if (go) go.hidden = false; return; }
        code = couponCode(); var cd = $('[data-hxd-code]', dlg); if (cd) cd.textContent = code;
        if (member && !apply.asked) { apply.asked = true; var ac2 = acct() || (location.protocol === 'file:' ? { cid: '1', token: 'test' } : null), epc = dlg.getAttribute('data-endpoint'); if (ac2 && epc) fetch(epc + (epc.indexOf('?') > -1 ? '&' : '?') + 'action=coupon&cid=' + encodeURIComponent(ac2.cid) + '&token=' + encodeURIComponent(ac2.token) + '&partner=' + encodeURIComponent(norm(what).replace(/^cupon\s+/, '').split(' ')[0] || 'magnate') + '&lang=' + (cfg.lang === 'en' ? 'en' : 'es')).then(function (r) { return r.json(); }).then(function (j) { if (j && j.ok && j.code) { code = j.code; if (cd) cd.textContent = code; } }).catch(function () {}); }
        if (cpBox) cpBox.hidden = !member; if (cpLock) cpLock.hidden = member;
        $$('[data-hxd-common]', dlg).forEach(function (x) { x.hidden = !member; }); if (go) { go.hidden = !member; go.textContent = dlg.getAttribute('data-t-cupsend') || go.textContent; }
      };
      var applyNeed = function () {
        var lock = !member; if (gateBox) gateBox.hidden = !lock;
        $$('.hxd__g', dlg).forEach(function (g) { g.hidden = lock || g.getAttribute('data-for').split(' ').indexOf(kind) < 0; });
        $$('[data-hxd-common]', dlg).forEach(function (x) { x.hidden = lock; }); if (go) go.hidden = lock;
      };
      if (cp) { member = false; apply(); loadCredits(function (c) { member = !!(c && c.hasPlan && c.plan === 'block' && c.weeksLeft > 0); apply(); }); }
      else if (needM) { member = false; applyNeed(); loadCredits(function (c) { member = !!(c && c.hasPlan && c.plan === 'block' && c.weeksLeft > 0); applyNeed(); }); }
      else apply();
      if (form) form.hidden = false; if (okBox) okBox.hidden = true; if (err) err.hidden = true; show(true);
    };
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href^="dialog:"]');
      if (a) { e.preventDefault(); var v = a.getAttribute('href').slice(7).split('~'); open(v[0], v.slice(1).join('~')); return; }
      if (e.target.closest && e.target.closest('[data-hxd-close]') && !dlg.hidden) show(false);
    });
    document.addEventListener('kx:open-dialog', function (e) { var d = e.detail || {}; ckey = d.key || ''; open(d.kind, d.what); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !dlg.hidden) show(false); });
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = ($('[name=name]', form).value || '').trim(), email = ($('[name=email]', form).value || '').trim();
      if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !$('[name=consent]', form).checked) { if (err) { err.textContent = dlg.getAttribute('data-t-err'); err.hidden = false; } return; }
      if (kind === 'evento' && calIn && !calIn.value) { if (err) { err.textContent = dlg.getAttribute('data-t-date'); err.hidden = false; } return; }
      if (kind === 'clase' && ((($('[name=apellido]', form) || {}).value || '').trim().length < 2 || name.length < 2)) { if (err) { err.textContent = dlg.getAttribute('data-t-last'); err.hidden = false; } return; }
      var fields = { tipo: kind, interes: what, origen: location.hash.replace(/^#\//, '') || location.pathname };
      $$('.hxd__g:not([hidden]) [name]', dlg).forEach(function (x) { if ((x.value || '').trim()) fields[x.name] = x.value.trim(); });
      if (($('[name=notas]', form).value || '').trim()) fields.notas = $('[name=notas]', form).value.trim();
      if (kind === 'cupon') fields.cupon = code;
      var ep = dlg.getAttribute('data-endpoint');
      if (kind === 'clase' && ep && ckey) {                  // a real booking: the sheet answers with the state (pending / waiting list / full)
        var ac = acct() || {}, q = { action: 'book', cid: ac.cid || '', token: ac.token || '', cls: ckey, last: (($('[name=apellido]', form) || {}).value || '').trim(), seats: ($('[name=lugares]', form) || {}).value || '1', name: name, email: email, phone: ($('[name=phone]', form).value || '').trim(), lang: cfg.lang === 'en' ? 'en' : 'es' };
        if (go) go.disabled = true;
        fetch(ep + (ep.indexOf('?') > -1 ? '&' : '?') + Object.keys(q).map(function (k) { return k + '=' + encodeURIComponent(q[k]); }).join('&'))
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (go) go.disabled = false;
            if (!j || !j.ok) { if (err) { err.textContent = dlg.getAttribute('data-t-err'); err.hidden = false; } return; }
            var msg = $('p', okBox); if (msg) msg.textContent = dlg.getAttribute(j.state === 'En espera' ? 'data-t-bk-wait' : (j.state === 'Confirmada' ? 'data-t-bk-conf' : 'data-t-bk-pend')) || dlg.getAttribute('data-t-sent') || '';
            form.hidden = true; if (okBox) okBox.hidden = false;
            document.dispatchEvent(new CustomEvent('kx:hxd-sent', { detail: { kind: kind, what: what, state: j.state } })); document.dispatchEvent(new CustomEvent('kx:circle-refresh'));
          }).catch(function () { if (go) go.disabled = false; if (err) { err.textContent = dlg.getAttribute('data-t-err'); err.hidden = false; } });
        return;
      }
      try { if (ep) fetch(ep, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'lead', lang: cfg.lang === 'en' ? 'en' : 'es', cid: (acct() || {}).cid || '', token: (acct() || {}).token || '', kind: LEAD[kind] || kind, name: name, email: email, phone: ($('[name=phone]', form).value || '').trim(), fields: fields }) }); } catch (x) {}
      form.hidden = true; if (okBox) okBox.hidden = false;
      document.dispatchEvent(new CustomEvent('kx:hxd-sent', { detail: { kind: kind, what: what } }));
    });
  }

  /* ---------- private circle (classes): everybody can preview; booking needs an active 4-week block ---------- */
  function initCircle() {
    var root = $('[data-circle]'); if (!root) return;
    var gate = $('[data-circle-gate]', root), welcome = $('[data-circle-welcome]', root), cards = $$('.circle__card', root), pills = $$('[data-sport]', $('[data-circle-filters]', root));
    var member = false;
    var T = function (k, rep) { var s = root.getAttribute('data-t-' + k) || ''; if (rep) Object.keys(rep).forEach(function (r) { s = s.split('[' + r + ']').join(rep[r]); }); return s; };
    var live = {};   // class key -> live data from the sheet
    var SPORTS = ['padel', 'tenis', 'ciclismo', 'basketball', 'running', 'funcional'], SN = (root.getAttribute('data-sports') || '').split('|');
    var ep = root.getAttribute('data-endpoint'), esc2 = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var whenOf = function (c) { try { var d = new Date(c.date + 'T' + (c.time || '09:00') + ':00'), s = new Intl.DateTimeFormat(cfg.lang === 'en' ? 'en-US' : 'es-MX', { weekday: 'short', day: 'numeric', month: 'short' }).format(d).replace('.', ''); return s.charAt(0).toUpperCase() + s.slice(1); } catch (e) { return c.date; } };
    var statusOf = function (c) {
      if (c.status === 'Cancelada') return { cls: 'is-cancel', txt: T('cancelled') };
      if (c.status === 'Confirmada') return { cls: 'is-ok', txt: T('confirmed') };
      var need = Math.max(0, c.min - c.taken); return { cls: 'is-pend', txt: need ? T('need', { n: need }) : T('pending', { m: c.min }) };
    };
    var cardHtml = function (c) {
      var sp = SPORTS.indexOf(c.sport) > -1 ? c.sport : 'funcional', tpl = root.getAttribute('data-art-tpl') || '', img = c.art && tpl ? tpl.replace('photo-hs-tenis.webp', 'photo-' + c.art + '.webp') : '', st = statusOf(c);
      var spots = c.full ? T('full') + (c.waiting ? ' · ' + T('wait-n', { n: c.waiting }) : '') : T('left', { n: c.left });
      return '<article class="circle__card" data-sport="' + esc2(sp) + '" data-key="' + esc2(c.key) + '" data-class="' + esc2(c.title) + '" data-when="' + esc2(whenOf(c) + ' ' + c.time) + '" data-venue="' + esc2(c.venue) + '">'
        + '<div class="circle__top"><span class="circle__av">' + (img ? '<img src="' + esc2(img) + '" alt="" loading="lazy" width="60" height="60">' : '<svg viewBox="0 0 48 48" aria-hidden="true"><use href="#cs-' + esc2(sp) + '"/></svg>') + '</span><div class="circle__tt"><span class="circle__sport">' + esc2(SN[SPORTS.indexOf(sp)] || sp) + '</span><h3>' + esc2(c.title) + '</h3></div></div>'
        + '<dl class="circle__meta"><div><dt>' + esc2(root.getAttribute('data-t-host') || 'Coach') + '</dt><dd>' + esc2(c.coach) + '</dd></div><div><dt>' + esc2(root.getAttribute('data-t-date') || 'Fecha') + '</dt><dd>' + esc2(whenOf(c)) + '</dd></div><div><dt>' + esc2(root.getAttribute('data-t-time') || 'Hora') + '</dt><dd>' + esc2(c.time) + '</dd></div><div><dt>' + esc2(root.getAttribute('data-t-venue') || 'Sede') + '</dt><dd>' + esc2(c.venue) + '</dd></div></dl>'
        + '<span class="circle__spots circle__live ' + st.cls + '">' + esc2(st.txt) + '</span><span class="circle__spots">' + esc2(spots) + '</span>'
        + '<button class="circle__book" type="button" data-circle-book' + (c.status === 'Cancelada' ? ' disabled' : '') + '><span class="circle__booklbl">' + esc2(root.getAttribute('data-t-book') || 'Reservar') + ' · ' + (c.price ? esc2(money0(c.price)) : esc2(T('no-pay'))) + '</span><span class="circle__locklbl"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#cs-lock"/></svg>' + esc2(root.getAttribute('data-t-locked') || '') + '</span></button>'
        + '<span class="circle__lock" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="#cs-lock"/></svg></span></article>';
    };
    var money0 = function (n) { try { return new Intl.NumberFormat(cfg.lang === 'en' ? 'en-US' : 'es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n); } catch (e) { return '$' + n; } };
    var rebuild = function (list) {
      var grid = $('[data-circle-grid]', root); if (!grid || !list.length) return;
      live = {}; list.forEach(function (c) { live[c.key] = c; });
      grid.innerHTML = list.map(cardHtml).join('');
      cards = $$('.circle__card', root);
      var used = {}; list.forEach(function (c) { used[c.sport] = 1; });
      var fl = $('[data-circle-filters]', root); if (fl) { $$('[data-sport]', fl).forEach(function (p) { var s = p.getAttribute('data-sport'); p.hidden = s !== 'all' && !used[s]; }); var all = $('[data-circle-all]', fl); if (all) all.textContent = list.length; }
      pills = $$('[data-sport]', fl);
      var on = pills.filter(function (x) { return x.classList.contains('is-on'); })[0]; if (on && on.getAttribute('data-sport') !== 'all') on.click();
      paint();
    };
    var fetchLive = function () {
      var ep = root.getAttribute('data-endpoint'); if (!ep) return;
      fetch(ep + (ep.indexOf('?') > -1 ? '&' : '?') + 'action=classes').then(function (r) { return r.json(); }).then(function (j) { if (j && j.ok && j.classes && j.classes.length) rebuild(j.classes); }).catch(function () {});
    };
    var paint = function () {
      root.classList.toggle('is-member', member); root.classList.toggle('is-locked', !member);
      if (gate) gate.hidden = member; if (welcome) welcome.hidden = !member;
      cards.forEach(function (c) { var b = $('[data-circle-book]', c); if (b) { b.setAttribute('aria-disabled', member ? 'false' : 'true'); b.tabIndex = member ? 0 : -1; } });
    };
    paint(); fetchLive(); document.addEventListener('kx:circle-refresh', fetchLive);
    loadCredits(function (c) { member = !!(c && c.hasPlan && c.plan === 'block' && c.weeksLeft > 0); paint(); });
    var pickSport = function (sp, hit) {
      var p0 = pills.filter(function (x) { return x.getAttribute('data-sport') === sp; })[0]; if (!p0) return;
      p0.click(); if (hit) { var c0 = cards.filter(function (c) { return !c.hidden; })[0]; if (c0) { c0.classList.add('is-hit'); setTimeout(function () { c0.classList.remove('is-hit'); }, 2600); var g0 = $('[data-circle-filters]', root); if (g0) setTimeout(function () { g0.scrollIntoView({ block: 'start', behavior: REDUCE ? 'auto' : 'smooth' }); }, 120); } }
    };
    pills.forEach(function (p) {
      p.addEventListener('click', function () {
        var sp = p.getAttribute('data-sport');
        pills.forEach(function (x) { var on = x === p; x.classList.toggle('is-on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); });
        cards.forEach(function (c) { c.hidden = !(sp === 'all' || c.getAttribute('data-sport') === sp); });
      });
    });
    document.addEventListener('kx:hxd-sent', function (e) { if (!e.detail || e.detail.kind !== 'clase') return; cards.forEach(function (c) { if ((e.detail.what || '').indexOf(c.getAttribute('data-class')) === 0) { c.classList.add('is-sent'); var l = $('.circle__booklbl', c); if (l) l.textContent = root.getAttribute('data-t-sent') || '✓'; var bb = $('[data-circle-book]', c); if (bb) bb.setAttribute('aria-disabled', 'true'); } }); });
    try { var qs0 = location.search || (location.hash.indexOf('?') > -1 ? location.hash.slice(location.hash.indexOf('?')) : ''), sp0 = new URLSearchParams(qs0).get('deporte'); if (sp0) pickSport(sp0, true); } catch (e0) {}
    root.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-circle-book]'); if (!b) return;
      var card = b.closest('.circle__card');
      if (!member) { if (gate) { gate.hidden = false; gate.classList.remove('is-nudge'); void gate.offsetWidth; gate.classList.add('is-nudge'); gate.scrollIntoView({ block: 'center', behavior: REDUCE ? 'auto' : 'smooth' }); } return; }
      if (card.classList.contains('is-sent')) return;
      document.dispatchEvent(new CustomEvent('kx:open-dialog', { detail: { kind: 'clase', key: card.getAttribute('data-key') || '', what: card.getAttribute('data-class') + ' · ' + card.getAttribute('data-when') + ' · ' + card.getAttribute('data-venue') + ' · $' + root.getAttribute('data-price') } }));
    });
  }

  /* ---------- "Mi semana": signed-in customers choose up to 5 meals per covered week; empty days are not delivered ---------- */
  function initMyWeek() {
    var root = $('[data-myweek]'); if (!root) return;
    var T_ = function (k) { return root.getAttribute('data-t-' + k) || ''; };
    var fill = function (tpl, o) { return String(tpl).replace(/\{(\w+)\}/g, function (m, k) { return o[k] != null ? o[k] : m; }); };
    var lang = cfg.lang === 'en' ? 'en-US' : 'es-MX';
    var money = function (n) { try { return new Intl.NumberFormat(lang, { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n); } catch (e) { return '$' + Math.round(n); } };
    var fmt = function (d) { try { return new Intl.DateTimeFormat(lang, { timeZone: TZ, day: 'numeric', month: 'short' }).format(d); } catch (e) { return ''; } };
    var isoDate = function (iso, add) { var p = String(iso).split('-'); return new Date(+p[0], +p[1] - 1, +p[2] + (add || 0), 12); };
    if (!$('#kx-account')) return;                                  // signed out: the page shows the sign-in notice and keeps everything else hidden
    var TIERS = ['selecto', 'exclusivo', 'signature', 'reserve'], rank = function (t) { var r = TIERS.indexOf(t); return r < 0 ? 0 : r; };
    var dayNames = (T_('days') || 'Lun,Mar,Mié,Jue,Vie').split(',');
    var upg = function (n) { return +root.getAttribute('data-upg-' + n) || 70 * n; };
    var dishes = $$('[data-mw-dishes] li', root).map(function (li) { return { handle: li.getAttribute('data-handle'), pid: li.getAttribute('data-pid'), title: li.getAttribute('data-title'), label: li.getAttribute('data-label') || li.getAttribute('data-title'), tier: li.getAttribute('data-tier'), al: (li.getAttribute('data-allergens') || '').split('|').filter(Boolean), ing: (li.getAttribute('data-ingredients') || '').split('|').filter(Boolean) }; });
    var prof = loadProfile(); prof.strict = strictFlag(readFunnel());
    var warnOf = function (d) { return allergyHits(prof, d.al.map(norm), d.ing.map(norm)); };
    var level = function (d) { return d ? Math.max(0, Math.min(3, rank(d.tier))) : 0; };   // every plan starts at the Selecto base
    var byTitle = function (t) { return dishes.filter(function (d) { return d.title === t; })[0]; };
    var body = $('[data-mw-body]', root), buy = $('[data-mw-buy]', root), card = $('[data-mw-credit]', root), planner = $('[data-mw-planner]', root), noneOpen = $('[data-mw-none]', root);
    var weekSel = $('[data-mw-week]', root), box = $('[data-mw-days]', root), up = $('[data-mw-up]', root), msg = $('[data-mw-msg]', root), save = $('[data-mw-save]', root), skip = $('[data-mw-skip]', root);
    var a = acct(), days = ['', '', '', '', ''], credits = null, keepMsg = '';
    var say = function (m, bad) { msg.hidden = !m; msg.textContent = m || ''; msg.classList.toggle('alert--warn', !!bad); msg.classList.toggle('alert--ok', !bad); };
    var extra = function () { var s = 0; days.forEach(function (t) { var l = level(byTitle(t)); if (l) s += upg(l); }); return s; };
    var meals = function () { return days.filter(Boolean).length; };
    var paint = function () {
      var w = weekSel.value;
      $$('select[data-mw-day]', box).forEach(function (s) { s.value = days[+s.getAttribute('data-mw-day')] || ''; });
      $$('label', box).forEach(function (l, i) { l.textContent = w ? (dayNames[i] || '') + ' ' + fmt(isoDate(w, i)) : (dayNames[i] || ''); });
      var ex = extra(); up.hidden = !ex; up.textContent = ex ? fill(T_('up-total'), { p: money(ex) }) : '';
      var flagged = []; days.forEach(function (t) { var d = byTitle(t); if (d && warnOf(d).length && flagged.indexOf(d.label) < 0) flagged.push(d.label); });
      var wn = $('[data-mw-warn]', root); if (wn) { wn.hidden = !flagged.length; wn.textContent = flagged.length ? fill(T_('warn'), { list: flagged.join(', ') }) : ''; }
      var cnt = $('[data-mw-count]', root); if (cnt) cnt.textContent = fill(T_('count'), { n: meals() });
    };
    for (var i = 0; i < 5; i++) (function (i) {
      var li = document.createElement('li'), lab = document.createElement('label'), sel = document.createElement('select'), id = 'mw-day-' + i;
      sel.className = 'select'; sel.id = id; sel.setAttribute('data-mw-day', i); lab.setAttribute('for', id);
      var o0 = document.createElement('option'); o0.value = ''; o0.textContent = T_('day-empty'); sel.appendChild(o0);
      dishes.forEach(function (d) { var op = document.createElement('option'), l = level(d); op.value = d.title; op.textContent = (warnOf(d).length ? '⚠ ' : '') + d.label + (l ? ' · ' + fill(T_('up-badge'), { p: money(upg(l)) }) : ''); sel.appendChild(op); });
      sel.addEventListener('change', function () { days[i] = sel.value; say(''); paint(); });
      li.appendChild(lab); li.appendChild(sel); box.appendChild(li);
    })(i);
    var buildWeeks = function () {
      var keep = weekSel.value; weekSel.innerHTML = '';
      ((credits && credits.editable) || []).forEach(function (w) { var o = document.createElement('option'); o.value = w; o.textContent = fill(T_('week-opt'), { a: fmt(isoDate(w)), b: fmt(isoDate(w, 4)) }); weekSel.appendChild(o); });
      if (keep && $$('option', weekSel).some(function (x) { return x.value === keep; })) weekSel.value = keep;
    };
    var slotsOf = function (s) { var out = (s && s.slots) ? s.slots.slice(0, 5) : []; if (!out.length) (s && s.items || []).forEach(function (it) { for (var j = 0; j < (+it.qty || 1); j++) out.push(it.title); }); while (out.length < 5) out.push(''); return out; };
    var padFive = function (a) { var o = []; for (var i = 0; i < 5; i++) o.push(a[i] || ''); return o; };
    var loadWeek = function () {
      var w = weekSel.value; days = ['', '', '', '', '']; say(keepMsg || ''); keepMsg = ''; paint(); if (!w) return;
      var done = function (sel, prev) {
        if (sel) days = slotsOf(sel); else if (prev) { days = slotsOf(prev); if (meals()) say(T_('prev'), false); }
        else { var dm = defaultMenu((readFunnel() || {}).cat).map(function (h) { var d0 = dishes.filter(function (d) { return d.handle === h; })[0]; return d0 ? d0.title : ''; }); if (dm.some(Boolean)) { days = padFive(dm); say(T_('dflt'), false); } }
        days = days.map(function (t) { return byTitle(t) ? t : ''; }); paint();
      };
      if (a) fetch(a.url + (a.url.indexOf('?') > -1 ? '&' : '?') + 'action=week&cid=' + encodeURIComponent(a.cid) + '&token=' + encodeURIComponent(a.token) + '&week=' + encodeURIComponent(w))
        .then(function (r) { return r.json(); }).then(function (j) { if (j && j.ok) done(j.selection, j.previous); }).catch(function () {});
    };
    var show = function (c) {
      credits = c; var ok = !!(c && c.hasPlan), open = ok && c.editable && c.editable.length;
      buy.hidden = ok; card.hidden = !ok; planner.hidden = !open; noneOpen.hidden = !(ok && !open);
      if (!ok) {
        $('[data-mw-buy-text]', root).textContent = c === null ? T_('credits-error') : (c.expired ? T_('buy-expired') : T_('buy-none'));
        $('[data-mw-buy-cta]', root).hidden = c === null;
        return;
      }
      $('[data-mw-s-weeks]', root).textContent = c.weeksLeft + ' / ' + c.weeksTotal;
      $('[data-mw-s-meals]', root).textContent = c.mealsPlanned + ' / ' + c.mealsMax;
      $('[data-mw-s-ends]', root).textContent = c.endsOn ? fmt(isoDate(c.endsOn)) : '—';
      buildWeeks(); if (open) loadWeek();
    };
    var refresh = function (fresh) { loadCredits(show, fresh); };
    weekSel.addEventListener('change', loadWeek);
    var submit = function () {
      var w = weekSel.value; if (!w) return;
      var ex = extra(), n = meals(), label = fmt(isoDate(w)) + ' – ' + fmt(isoDate(w, 4));
      var ok = function () { keepMsg = n ? fill(T_('saved'), { n: n, d: label }) : fill(T_('skipped'), { d: label }); say(keepMsg, false); refresh(true); };
      var proceed = function () {
        if (!ex) { ok(); return; }
        // the difference of the higher-tier dishes is paid for that week: one line per upgrade level
        var lines = [];
        for (var lv = 1; lv <= 3; lv++) {
          var names = days.filter(function (t) { return level(byTitle(t)) === lv; }), vid = parseInt(root.getAttribute('data-upv-' + lv), 10);
          if (names.length && vid) { var p = {}; p[T_('prop-upgrade')] = names.join(', '); p._semana = w; lines.push({ id: vid, quantity: names.length, properties: p }); }
        }
        say(fill(T_('saved-pay'), { p: money(ex) }), false);
        if (!lines.length) return;
        fetch('/cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: lines }) })
          .then(function () { var c = $('[data-mw-cart]', root); window.location.href = (c && c.getAttribute('href')) || '/cart'; }, function () { say(T_('error'), true); });
      };
      if (!a) { proceed(); return; }
      fetch(a.url + (a.url.indexOf('?') > -1 ? '&' : '?') + 'action=weekset&cid=' + encodeURIComponent(a.cid) + '&token=' + encodeURIComponent(a.token) + '&week=' + encodeURIComponent(w) + '&upgrade=' + ex + '&days=' + encodeURIComponent(days.join('|')))
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.ok === false) {
            say(j.error === 'closed' ? T_('closed') : j.error === 'no_plan' ? T_('err-noplan') : j.error === 'not_covered' ? T_('err-notcovered') : T_('error'), true);
            if (j.error === 'closed' || j.error === 'not_covered') refresh(true);
            return;
          }
          proceed();
        })
        .catch(function () { say(T_('error'), true); });
    };
    save.addEventListener('click', submit);
    skip.addEventListener('click', function () { days = ['', '', '', '', '']; paint(); submit(); });
    refresh(false);
    var firstOpen = mxIso(new Date(Date.now() + firstOpenOffset() * 86400000));
    var roll = function () { var f = mxIso(new Date(Date.now() + firstOpenOffset() * 86400000)); if (f !== firstOpen) { firstOpen = f; say(fill(T_('rolled'), { d: fmt(isoDate(f)) }), false); refresh(true); } };
    setInterval(roll, 15000); document.addEventListener('visibilitychange', function () { if (!document.hidden) roll(); });
  }

  /* ---------- "Pausar entregas": pause some weeks or everything until the customer resumes; the plan simply ends later ---------- */
  function initMyPause() {
    var root = $('[data-mypause]'); if (!root || !$('#kx-account')) return;
    var T_ = function (k) { return root.getAttribute('data-t-' + k) || ''; };
    var fill = function (tpl, o) { return String(tpl).replace(/\{(\w+)\}/g, function (m, k) { return o[k] != null ? o[k] : m; }); };
    var lang = cfg.lang === 'en' ? 'en-US' : 'es-MX';
    var fmt = function (d) { try { return new Intl.DateTimeFormat(lang, { timeZone: TZ, day: 'numeric', month: 'short' }).format(d); } catch (e) { return ''; } };
    var isoDate = function (iso, add) { var p = String(iso).split('-'); return new Date(+p[0], +p[1] - 1, +p[2] + (add || 0), 12); };
    var none = $('[data-mp-none]', root), main = $('[data-mp-main]', root), st = $('[data-mp-status]', root), ends = $('[data-mp-ends]', root);
    var start = $('[data-mp-start]', root), len = $('[data-mp-len]', root), resumeBox = $('[data-mp-resume]', root), from = $('[data-mp-from]', root), msg = $('[data-mp-msg]', root);
    var a = acct(), credits = null;
    var say = function (m, bad) { msg.hidden = !m; msg.textContent = m || ''; msg.classList.toggle('alert--warn', !!bad); msg.classList.toggle('alert--ok', !bad); };
    var wk = function (w) { return fmt(isoDate(w)); };
    var fill2 = function (sel, vals, label) { sel.innerHTML = ''; vals.forEach(function (v) { var o = document.createElement('option'); o.value = v; o.textContent = label(v); sel.appendChild(o); }); };
    /* local preview (no backend): pauses live in this browser only */
    var LOCAL = 'kx_pause_local';
    var readLocal = function () { try { return JSON.parse(localStorage.getItem(LOCAL) || 'null') || { weeks: [], from: '' }; } catch (e) { return { weeks: [], from: '' }; } };
    var withLocal = function (c) {
      if (!c || c.ok === false || a) return c;
      var l = readLocal(), open = firstOpenMonday(), weeks = (l.weeks || []).filter(function (w) { return w >= open; }).sort();
      return Object.assign({}, c, { nextOpen: open, paused: weeks, pausedFrom: l.from && l.from >= open ? l.from : (l.from ? open : ''), endsOn: l.from ? '' : c.endsOn });
    };
    var firstOpenMonday = function () { return mxIso(new Date(Date.now() + firstOpenOffset() * 86400000)); };
    var show = function (c0) {
      var c = withLocal(c0); credits = c;
      if (c === null) { none.hidden = false; main.hidden = true; $('[data-mp-none-text]', root).textContent = T_('error-load'); return; }
      var ok = !!c.hasPlan; none.hidden = ok; main.hidden = !ok; if (!ok) { $('[data-mp-none-text]', root).textContent = $('[data-mp-none-text]', root).getAttribute('data-orig') || $('[data-mp-none-text]', root).textContent; return; }
      var open = c.nextOpen || firstOpenMonday(), weeks = [], k;
      for (k = 0; k < 12; k++) weeks.push(mxIso(isoDate(open, 7 * k)));
      var keepS = start.value; fill2(start, weeks, function (w) { return fill(T_('week-opt'), { a: wk(w), b: fmt(isoDate(w, 4)) }); }); if (keepS && weeks.indexOf(keepS) > -1) start.value = keepS;
      var keepL = len.value; len.innerHTML = '';
      [1, 2, 3, 4, 'open'].forEach(function (n) { var o = document.createElement('option'); o.value = n; o.textContent = n === 'open' ? T_('len-open') : n === 1 ? T_('len-1') : fill(T_('len-n'), { n: n }); len.appendChild(o); }); if (keepL) len.value = keepL;
      var paused = c.paused || [];
      st.textContent = c.pausedFrom ? fill(T_('st-open'), { d: wk(c.pausedFrom) }) : paused.length ? fill(T_('st-weeks'), { list: paused.map(wk).join(', ') }) : T_('st-active');
      st.classList.toggle('is-paused', !!(c.pausedFrom || paused.length));
      ends.textContent = c.endsOn ? fill(T_('st-ends'), { d: wk(c.endsOn) }) : (c.pausedFrom ? T_('st-ends-open') : '');
      resumeBox.hidden = !(c.pausedFrom || paused.length);
      if (!resumeBox.hidden) {
        var lastP = c.pausedFrom ? weeks[weeks.length - 1] : paused[paused.length - 1], res = [], d = 0, w2;
        do { w2 = mxIso(isoDate(open, 7 * d)); res.push(w2); d++; } while (w2 < lastP && d < 60);
        res.push(mxIso(isoDate(open, 7 * d)));
        fill2(from, res, function (w) { return fill(T_('week-opt'), { a: wk(w), b: fmt(isoDate(w, 4)) }); });
      }
    };
    var call = function (params, onOk) {
      if (!a) { onOk(localCall(params)); return; }
      var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
      fetch(a.url + (a.url.indexOf('?') > -1 ? '&' : '?') + 'action=pause&cid=' + encodeURIComponent(a.cid) + '&token=' + encodeURIComponent(a.token) + '&' + q)
        .then(function (r) { return r.json(); }).then(function (j) { onOk(j); }).catch(function () { onOk({ ok: false, error: 'net' }); });
    };
    var localCall = function (p) {
      var l = readLocal();
      if (p.mode === 'weeks') p.weeks.split('|').forEach(function (w) { if (l.weeks.indexOf(w) < 0) l.weeks.push(w); });
      else if (p.mode === 'from') l.from = p.week;
      else if (p.mode === 'resume') { var out = []; l.weeks.forEach(function (w) { if (w < p.week) out.push(w); }); if (l.from && l.from < p.week) { var d = 0, x; while ((x = mxIso(isoDate(l.from, 7 * d))) < p.week && d < 60) { out.push(x); d++; } } l.weeks = out; l.from = ''; }
      try { localStorage.setItem(LOCAL, JSON.stringify(l)); } catch (e) {}
      return Object.assign({}, fallbackCredits(), { ok: true });
    };
    var done = function (j, okMsg) {
      if (!j || j.ok === false) { say(j && j.error === 'closed' ? T_('err-closed') : j && j.error === 'no_plan' ? T_('err-noplan') : T_('err'), true); return; }
      try { sessionStorage.removeItem('kx_credits'); } catch (e) {}
      show(j); say(okMsg(j), false);
    };
    $('[data-mp-pause]', root).addEventListener('click', function () {
      var w = start.value, n = len.value; if (!w) return;
      if (n === 'open') { call({ mode: 'from', week: w }, function (j) { done(j, function () { return fill(T_('done-open'), { d: wk(w) }); }); }); return; }
      var list = []; for (var k = 0; k < +n; k++) list.push(mxIso(isoDate(w, 7 * k)));
      call({ mode: 'weeks', weeks: list.join('|') }, function (j) { done(j, function (c) { return fill(T_('done'), { n: list.length === 1 ? T_('len-1') : fill(T_('len-n'), { n: list.length }), list: list.map(wk).join(', '), d: c.endsOn ? wk(c.endsOn) : '—' }); }); });
    });
    $('[data-mp-resume-go]', root).addEventListener('click', function () {
      var w = from.value; if (!w) return;
      call({ mode: 'resume', week: w }, function (j) { done(j, function () { return fill(T_('resumed'), { d: wk(w) }); }); });
    });
    loadCredits(show, true);
  }

  function initOnboarding() {
    var root = $('[data-onboarding]'); if (!root) return;
    var form = $('[data-ob-form]', root), welcome = $('[data-ob-welcome]', root), err = $('[data-ob-error]', form);
    var steps = $$('[data-ob-step]', form), dots = $$('.ob-dots li', form), nextB = $('[data-ob-next]', form), prevB = $('[data-ob-prev]', form), saveB = $('[data-ob-save]', form);
    var fields = $$('[data-ob]', form), acs = $$('[data-ob-allergy]', form), dts = $$('[data-ob-diet]', form), grps = $$('[data-ob-group]', form), cons = $$('[data-ob-consent]', form);
    var cn = root.getAttribute('data-customer-name'), ce = root.getAttribute('data-customer-email');
    var f0 = readFunnel(), info = f0.info || {}, prof = loadProfile(), step = 0, maxStep = 0;
    if (ce && !info.email) info.email = ce; if (cn && !info.name) info.name = cn;
    fields.forEach(function (x) { var iv = info[x.getAttribute('data-ob')]; x.value = iv != null && iv !== '' ? iv : (x.defaultValue || ''); });
    acs.forEach(function (c) { c.checked = (f0.allergies || prof.allergies || []).map(norm).indexOf(norm(c.value)) > -1; });
    dts.forEach(function (c) { c.checked = (prof.diets || []).map(norm).indexOf(norm(c.value)) > -1; });
    grps.forEach(function (c) { c.checked = String(info[c.getAttribute('data-ob-group')] || '').split(', ').indexOf(c.value) > -1; });
    var show = function () {
      steps.forEach(function (s, k) { s.classList.toggle('is-on', k === step); }); dots.forEach(function (d, k) { d.classList.toggle('is-on', k === step); d.classList.toggle('is-done', k < step); });
      maxStep = Math.max(maxStep, step); if (typeof syncDots === 'function') syncDots();
      prevB.hidden = step === 0; nextB.hidden = step === steps.length - 1; saveB.hidden = step !== steps.length - 1;
      var cnt = $('[data-ob-count]', form), bar = $('[data-ob-bar]', form), tt = dots[step] ? $('.ob-dots__t', dots[step]) : null;
      if (cnt) cnt.textContent = (root.getAttribute('data-t-stepof') || '[n] / [t]').replace('[n]', step + 1).replace('[t]', steps.length) + (tt ? '  ·  ' + tt.textContent : '');
      if (bar) bar.style.width = ((step + 1) / steps.length * 100) + '%';
      if (step === steps.length - 1) renderReview();
    };
    var say = function (m) { err.hidden = !m; err.textContent = m || ''; };
    var val = function (k) { var x = $('[data-ob="' + k + '"]', form); return x ? x.value.trim() : ''; };
    var hello = function () { var h = $('[data-ob-hello]', root), n = (val('name') || info.name || '').split(' ')[0]; if (h && n) h.textContent = (root.getAttribute('data-t-welcome') || 'Bienvenido, {n}').replace('[n]', n).replace('{n}', n); };
    var done = isOnboarded();
    var edit = /[?&]edit=1/.test(location.search + '&' + (location.hash.split('?')[1] || ''));
    var forward = function () {                       // paying customers skip the questionnaire and go straight to choosing their week
      if (root.closest('[hidden]') || !ce || /[?&]edit=1/.test(location.search + '&' + (location.hash.split('?')[1] || '')) || ordersCount() === 0 || !isOnboarded()) return false;
      var wl = $('[data-ob-week]', root); if (wl && wl.getAttribute('href')) { window.location.href = wl.getAttribute('href'); return true; } return false;
    };
    window.addEventListener('hashchange', function () { setTimeout(forward, 60); });
    if (forward()) return;
    if (done && !edit && ce) { form.hidden = true; welcome.hidden = false; hello(); }
    // ---- segmented radios (one answer), counters, removable tag boxes
    var segs = $$('[data-ob-seg]', form);
    segs.forEach(function (g) { var v = info[g.getAttribute('data-ob-seg')]; $$('input', g).forEach(function (r) { r.checked = !!v && r.value === v; }); });
    $$('[data-ob-count-btn]', form).forEach(function (b) {
      b.addEventListener('click', function () {
        var inp = $('[data-ob="' + b.getAttribute('data-ob-count-btn') + '"]', form); if (!inp) return;
        var mn = +inp.min || 0, mx = +inp.max || 99, v = (parseInt(inp.value, 10) || 0) + (+b.getAttribute('data-d'));
        inp.value = Math.max(mn, Math.min(mx, v));
      });
    });
    if (!val('dislikes') && prof.dislikes && prof.dislikes.length) { var hd = $('[data-ob="dislikes"]', form); if (hd) hd.value = prof.dislikes.join(', '); }
    if (prof.allergies && prof.allergies.length) {                 // editing later: every saved allergy shows as a tick or a removable tag
      var known = acs.map(function (c) { return norm(c.value); }), mine = prof.allergies.map(norm);
      acs.forEach(function (c) { c.checked = mine.indexOf(norm(c.value)) > -1; });
      var hao = $('[data-ob="allergy_other"]', form); if (hao) hao.value = prof.allergies.filter(function (a) { return known.indexOf(norm(a)) < 0; }).join(', ');
    }
    if (prof.dislikes && prof.dislikes.length) { var hdl = $('[data-ob="dislikes"]', form); if (hdl) hdl.value = prof.dislikes.join(', '); }
    var tagBoxes = $$('[data-ob-tags]', form).map(function (box) {
      var hid = $('[data-ob="' + box.getAttribute('data-ob-tags') + '"]', box), wrap = $('.tag-input', box), inp = $('[data-ob-tag-input]', box);
      var list = function () { return hid.value.split(',').map(function (v) { return v.trim(); }).filter(Boolean); };
      var paint = function () {
        $$('.tag', wrap).forEach(function (t) { t.remove(); });
        list().forEach(function (d) {
          var t = document.createElement('span'); t.className = 'tag'; t.textContent = d;
          var x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', T('remove', { name: d })); x.textContent = '×';
          x.addEventListener('click', function () { hid.value = list().filter(function (v) { return norm(v) !== norm(d); }).join(', '); paint(); });
          t.appendChild(x); wrap.insertBefore(t, inp);
        });
        $$('[data-ob-suggest]', box).forEach(function (b) { b.classList.toggle('is-active', list().map(norm).indexOf(norm(b.getAttribute('data-ob-suggest'))) > -1); });
      };
      var add = function (v) { v = String(v || '').replace(/\s*,\s*/g, ' ').trim(); if (!v) return; if (list().map(norm).indexOf(norm(v)) < 0) hid.value = list().concat(v).join(', '); inp.value = ''; paint(); };
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(inp.value); } else if (e.key === 'Backspace' && !inp.value) { var l = list(); l.pop(); hid.value = l.join(', '); paint(); } });
      inp.addEventListener('blur', function () { add(inp.value); });
      $$('[data-ob-suggest]', box).forEach(function (b) { b.addEventListener('click', function () { var v = b.getAttribute('data-ob-suggest'); if (list().map(norm).indexOf(norm(v)) > -1) { hid.value = list().filter(function (x) { return norm(x) !== norm(v); }).join(', '); paint(); } else add(v); }); });
      paint(); return paint;
    });
    $$('input[type="text"],input[type="email"],input[type="tel"],input[type="number"],input[type="date"]', form).forEach(function (i) {
      if (i.hasAttribute('data-ob-tag-input')) return;
      i.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); if (!nextB.hidden) nextB.click(); } });
    });
    // review: every answer, section by section, each with an Edit button that jumps back
    var textOf = function (n) { return (n.textContent || '').trim(); };
    var reviewRows = function (st) {
      var rows = [], cur = '';
      Array.prototype.forEach.call(st.children, function (n) {
        if (n.tagName === 'LEGEND') return;
        if (n.classList.contains('label')) { cur = textOf(n); return; }
        var take = function (label, vals) { vals = vals.filter(Boolean); if (vals.length) rows.push([label, vals.join(', ')]); };
        var fieldRow = function (fd) {
          var lb = $('label', fd), inp = $('[data-ob]', fd); if (!lb || !inp) return;
          take(textOf(lb), [inp.tagName === 'SELECT' ? (inp.value ? textOf(inp.options[inp.selectedIndex]) : '') : inp.value.trim()]);
        };
        if (n.classList.contains('pills')) take(cur, $$('input:checked', n).map(function (i) { return textOf(i.nextElementSibling); }));
        else if (n.hasAttribute('data-ob-seg')) take(cur, $$('input:checked', n).map(function (i) { return textOf(i.nextElementSibling); }));
        else if (n.hasAttribute('data-ob-tags')) take(cur, $('[data-ob]', n).value.split(',').map(function (v) { return v.trim(); }));
        else if (n.classList.contains('ob-people')) take(cur, $$('.counter', n).map(function (c) { return textOf($('span', c)) + ' ' + $('input', c).value; }));
        else if (n.classList.contains('field')) fieldRow(n);
        else if (n.classList.contains('form-grid')) $$('.field', n).forEach(fieldRow);
      });
      return rows;
    };
    var renderReview = function () {
      var box = $('[data-ob-review]', form); if (!box) return; box.innerHTML = '';
      steps.slice(0, steps.length - 1).forEach(function (st, k) {
        var sec = document.createElement('section'); sec.className = 'review__sec';
        var head = document.createElement('div'); head.className = 'review__h';
        var h = document.createElement('h4'); h.textContent = textOf($('legend', st)); head.appendChild(h);
        var eb = document.createElement('button'); eb.type = 'button'; eb.className = 'text-link'; eb.textContent = root.getAttribute('data-t-edit') || 'Edit';
        eb.addEventListener('click', function () { step = k; say(''); show(); }); head.appendChild(eb); sec.appendChild(head);
        var rows = reviewRows(st), dl = document.createElement('dl');
        if (!rows.length) { var e = document.createElement('p'); e.className = 'text-muted'; e.textContent = root.getAttribute('data-t-empty') || ''; sec.appendChild(e); }
        rows.forEach(function (r) { var dt = document.createElement('dt'); dt.textContent = r[0]; var dd = document.createElement('dd'); dd.textContent = r[1]; dl.appendChild(dt); dl.appendChild(dd); });
        if (rows.length) sec.appendChild(dl); box.appendChild(sec);
      });
    };
    dots.forEach(function (d, k) { var go = function () { if (k <= maxStep && k !== step) { say(''); step = k; show(); } }; d.setAttribute('role', 'button'); d.addEventListener('click', go); d.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }); });
    var syncDots = function () { dots.forEach(function (d, k) { d.tabIndex = k <= maxStep ? 0 : -1; d.setAttribute('aria-current', k === step ? 'step' : 'false'); }); };
    var stepOk = function (k) {
      if (k === 0 && !(val('name') && /.+@.+\..+/.test(val('email')) && val('phone').replace(/\D/g, '').length >= 8)) { say(root.getAttribute('data-t-need')); return false; }
      if (k === 1 && !(val('street') && val('cluster') && val('city') && /^\d{5}$/.test(val('zip').replace(/\s/g, '')))) { say(root.getAttribute('data-t-need-addr')); return false; }
      if (k === 1) {                                                   // we only deliver inside the service area (postal-code prefixes set in the theme settings)
        var pre = String(root.getAttribute('data-zip-prefixes') || '72').split(',').map(function (x) { return x.trim(); }).filter(Boolean), zp = val('zip').replace(/\s/g, '');
        if (pre.length && !pre.some(function (x) { return zp.indexOf(x) === 0; })) { say(root.getAttribute('data-t-out')); return false; }
      }
      return true;
    };
    nextB.addEventListener('click', function () {
      if (!stepOk(step)) return;
      say(''); step = Math.min(steps.length - 1, step + 1); show();
    });
    prevB.addEventListener('click', function () { step = Math.max(0, step - 1); show(); });
    var editB = $('[data-ob-edit]', root); if (editB) editB.addEventListener('click', function () { welcome.hidden = true; form.hidden = false; step = 0; tagBoxes.forEach(function (f2) { f2(); }); show(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      for (var sk = 0; sk < 2; sk++) { if (!stepOk(sk)) { step = sk; show(); return; } }
      if (cons.length && !cons.every(function (c) { return c.checked; })) { step = steps.length - 1; show(); say(root.getAttribute('data-t-need-consent')); return; }
      var f = readFunnel(); f.v = 2; f.info = f.info || {}; fields.forEach(function (x) { f.info[x.getAttribute('data-ob')] = x.value.trim(); });
      var gnames = {}; grps.forEach(function (c) { var g = c.getAttribute('data-ob-group'); gnames[g] = gnames[g] || []; if (c.checked) gnames[g].push(c.value); }); Object.keys(gnames).forEach(function (g) { f.info[g] = gnames[g].join(', '); });
      segs.forEach(function (g) { var c = $('input:checked', g); f.info[g.getAttribute('data-ob-seg')] = c ? c.value : ''; });
      f.info.consent = new Date().toISOString().slice(0, 10);
      if (f.info.ref) { try { localStorage.setItem('kulinaria_ref', f.info.ref); } catch (x) {} }
      f.allergies = acs.filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
      var other = val('allergy_other').split(',').map(function (v) { return v.trim(); }).filter(Boolean);
      var p = loadProfile(); p.allergies = Array.from(new Set(f.allergies.concat(other))); p.dislikes = val('dislikes').split(',').map(function (v) { return v.trim(); }).filter(Boolean);
      p.diets = dts.filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
      try { localStorage.setItem(FUNNEL_KEY, JSON.stringify(f)); localStorage.setItem(ONB_KEY, '1'); } catch (x) {}
      saveProfile(p); pushProfile();
      form.hidden = true; welcome.hidden = false; hello(); window.scrollTo({ top: 0, behavior: REDUCE ? 'auto' : 'smooth' });
    });
    show();
  }

  function initFunnel() {
    // the home funnel carries the phone-only "teaser" class: on larger screens it must behave as the full one-frame order builder
    var wide = window.matchMedia ? window.matchMedia('(min-width:761px)') : null;
    var syncTeaser = function () { $$('[data-funnel][data-phone-teaser]').forEach(function (h) { h.classList.toggle('funnel--teaser', !(wide && wide.matches)); }); };
    syncTeaser(); if (wide && wide.addEventListener) wide.addEventListener('change', syncTeaser);
    $$('[data-funnel]').forEach(function (holder) {
      var MEALS = +holder.getAttribute('data-meals') || 5, WEEKS = +holder.getAttribute('data-weeks') || 4;
      var st = { plan: 'block', tier: 'selecto', cat: 'all', diet: 'all', qty: {}, days: [], info: {}, allergies: [], step: 0, remembered: false, renew: true };
      try { var saved = JSON.parse(localStorage.getItem(FUNNEL_KEY) || 'null'); if (saved && saved.v === 2) { st = Object.assign(st, saved); st.tier = 'selecto'; st.remembered = !!(saved.info && (saved.info.name || saved.info.email)); } } catch (e) {}
      if (st.cat && st.cat !== 'all' && st.cat !== 'seasonal' && !GROUPS[st.cat]) st.cat = 'all';
      var RULES_KEY = 'kx-rules-ok';
      st.rulesOk = false;                                         // read from its own key only (never from the saved selection)
      try { if (localStorage.getItem(RULES_KEY)) st.rulesOk = true; } catch (e) {}
      var acctOn = !!$('#kx-account'), kxGuide = false; try { kxGuide = location.protocol === 'file:' && localStorage.getItem('kx-test-guide') === '1'; } catch (e) {}
      if (!acctOn) st.rulesOk = (location.protocol === 'file:' && !kxGuide);          // a guest always starts at the sign-in screen (the local preview skips it for tests)
      else if (kxGuide) st.rulesOk = false;                                          // signed in: the instructions once, then straight to plan + diet
      st.sv = 4;
      // steps 1 and 2 before the builder: sign in, then the questionnaire (shown until both are done; the local preview can skip it for tests)
      var gate = $('[data-fn-gate]', holder), signedIn = !!$('#kx-account'), onbDone = isOnboarded(), skipGate = false;
      try { skipGate = location.protocol === 'file:' && localStorage.getItem('kx-test-gate') !== '1'; } catch (e) {}
      if (gate && !skipGate && (!signedIn || !onbDone)) {
        gate.hidden = false; holder.classList.add('is-gated');
        var g1 = $('[data-fn-gate-s1]', gate), g2 = $('[data-fn-gate-s2]', gate);
        if (g1) g1.classList.toggle('is-done', signedIn); g2.classList.toggle('is-done', signedIn && onbDone); g2.classList.toggle('is-wait', !signedIn);
        var a1 = $('[data-fn-gate-a1]', gate), a2 = $('[data-fn-gate-a2]', gate); if (a1) a1.hidden = signedIn; var gn = $('[data-fn-gate-note]', gate); if (gn) gn.hidden = signedIn; if (a2) a2.hidden = !signedIn || onbDone;
        var c1 = g1 ? $('[data-fn-chip]', g1) : null, c2 = $('[data-fn-chip]', g2); if (c1) c1.textContent = signedIn ? gate.getAttribute('data-t-done') : gate.getAttribute('data-t-todo'); if (c2) c2.textContent = !signedIn ? gate.getAttribute('data-t-wait') : (onbDone ? gate.getAttribute('data-t-done') : gate.getAttribute('data-t-todo'));
      }
      var startAtPlan = false; try { startAtPlan = location.protocol === 'file:' && !!sessionStorage.getItem('kx-test-start') && !!st.rulesOk; } catch (e) {}   // local preview only (test hook)
      var savedStep = +st.step || 0, savedReach = +st.reach || 0;           // what the visitor had reached when they left (saved with the order in progress)
      var REACH_KEY = 'kx_reach';
      st.reach = 0; try { st.reach = parseInt(sessionStorage.getItem(REACH_KEY), 10) || 0; } catch (e) {}
      var forceGuide = false; try { forceGuide = location.protocol === 'file:' && localStorage.getItem('kx-test-guide') === '1'; } catch (e) {}   // local preview only (test hook)
      if (st.rulesOk && !forceGuide) {                                       // a returning client already knows the guide: resume, never restart
        st.reach = Math.max(st.reach, savedReach, 1);
        st.step = Math.max(1, Math.min(savedStep, st.reach));
      } else st.step = 0;
      if (startAtPlan) st.step = 1;
      if (st.step === 2) st.step = st.reach >= 3 ? 3 : 1;                 // the menu step is merged into "your week"
      st.planChosen = st.reach >= 2;
      if (startAtPlan) { st.reach = 3; st.planChosen = true; }                          // local preview only (test hook)
      var setReach = function (n) { if (n > st.reach) { st.reach = n; try { sessionStorage.setItem(REACH_KEY, String(n)); } catch (e) {} } persist(); };
      var T_ = function (k) { return holder.getAttribute('data-t-' + k) || ''; };
      var steps = $$('[data-fn-step]', holder), dots = $$('[data-fn-dot]', holder), bar = $('[data-fn-bar]', holder);
      var next = $('[data-fn-next]', holder), prev = $('[data-fn-prev]', holder), finish = $('[data-fn-finish]', holder), err = $('[data-fn-error]', holder);
      var dishes = $$('[data-fn-dish]', holder), tierBtns = $$('[data-tier-choice]', holder);
      var TIERS = ['selecto', 'exclusivo', 'signature', 'reserve'], rank = function (t) { var r = TIERS.indexOf(t); return r < 0 ? 0 : r; };
      var dayNames = (T_('days') || 'Lun,Mar,Mié,Jue,Vie').split(','), daysBox = $('[data-fn-days]', holder);
      var blankDays = function () { var a = []; for (var j = 0; j < MEALS; j++) a.push(''); return a; };
      var lab = function (d) { return d.getAttribute('data-label') || d.getAttribute('data-title'); };
      var byPid = function (id) { return dishes.filter(function (d) { return d.getAttribute('data-pid') === id; })[0]; };
      var upg = function (n) { return +holder.getAttribute('data-upg-' + n) || 70 * n; };
      var levelOf = function (d) { return d ? Math.max(0, Math.min(3, rank(d.getAttribute('data-tier')) - rank(st.tier))) : 0; };
      // first visit with an old selection (quantities) -> turn it into day slots
      if (!Array.isArray(st.days) || st.days.length !== MEALS) { var seq = []; Object.keys(st.qty || {}).forEach(function (k) { for (var j = 0; j < st.qty[k]; j++) seq.push(k); }); st.days = blankDays().map(function (x, j) { return seq[j] || ''; }); }
      if (typeof st.active !== 'number' || st.active < 0 || st.active >= MEALS) st.active = Math.max(0, st.days.indexOf(''));
      if (!Array.isArray(st.days2) || st.days2.length !== MEALS) st.days2 = blankDays();      // the 2nd course of each day (a meal has two courses)
      if (st.course !== 1) st.course = 0;
      if (st.perDay !== 2) st.perDay = st.days2.some(function (p) { return !!p; }) ? 2 : 1;
      if (st.perDay === 1) st.course = 0;
      var eligible = function (d) { return !!d && rank(d.getAttribute('data-tier')) >= rank(st.tier); };
      var dayLevel = function (i) { return Math.max(levelOf(byPid(st.days[i])) || 0, levelOf(byPid(st.days2[i])) || 0); };
      var curSlot = function () { return st.course ? st.days2 : st.days; };
      var upgradeExtra = function () { var sum = 0; for (var i0 = 0; i0 < MEALS; i0++) { var l = dayLevel(i0); if (l) sum += upg(l); } return sum; };      // the extra is paid per week, when that week is chosen
      // the first delivery is the coming Monday; orders after Saturday 10:00 (cut-off) start the Monday after
      var firstMonday = function () { var n = mxNow(), d = ((1 - n.dow + 7) % 7) || 7; if (n.dow === 0 || (n.dow === 6 && n.minutes >= cutoffMin)) d += 7; return d; };
      var dateOf = function (i) { try { return new Intl.DateTimeFormat(cfg.lang === 'en' ? 'en-US' : 'es-MX', { timeZone: TZ, day: 'numeric', month: 'short' }).format(new Date(Date.now() + (firstMonday() + i) * 86400000)); } catch (e) { return ''; } };
      var dayShort = function (i) { return (dayNames[i] || ('#' + (i + 1))).slice(0, 3) + ' ' + dateOf(i); };
      var dayLabel = function (i) { return (dayNames[i] || ('#' + (i + 1))) + ' ' + dateOf(i); };
      var money = function (n) {
        try { return new Intl.NumberFormat(cfg.lang === 'en' ? 'en-US' : 'es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n); } catch (e) { return '$' + Math.round(n); }
      };
      var tierEl = function () { return $('[data-tier-choice="' + st.tier + '"]', holder) || tierBtns[0]; };
      var priceOf = function (btn, plan) { return +btn.getAttribute(plan === 'block' ? 'data-block' : 'data-week') || 0; };
      var count = function () { return st.days.filter(Boolean).length; };
      /* per-day tweaks: ingredients to leave out + a free note, saved with the order lines (kitchen sees them) */
      if (!Array.isArray(st.mods) || st.mods.length !== MEALS) st.mods = blankDays().map(function () { return { off: [], note: '' }; });
      var modsKey = '', modsOpen = -1, sumOpen = -1;
      if (!st.cardNotes || typeof st.cardNotes !== 'object') st.cardNotes = {};
      var cardNote = function (pid) { return st.cardNotes[pid] || (st.cardNotes[pid] = { off: [], note: '' }); };
      var syncCardToDay = function (pid, day) { var c = st.cardNotes[pid]; if (c && (c.off.length || c.note)) st.mods[day] = { off: c.off.slice(), note: c.note }; };
      var closeNotes = function (except) { $$('[data-fn-note].is-open', holder).forEach(function (b) { if (b === except) return; var p = $('[data-fn-note-box]', b); if (p) p.hidden = true; b.classList.remove('is-open'); }); };
      document.addEventListener('click', function (e) { closeNotes(e.target.closest ? e.target.closest('[data-fn-note]') : null); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeNotes(null); });
      var buildNotes = function () {
        $$('[data-fn-note]', holder).forEach(function (box) {
          if (box.getAttribute('data-built')) return; box.setAttribute('data-built', '1');
          var d = box.closest('[data-fn-dish]'), pid = d.getAttribute('data-pid'), chips = $('[data-fn-note-chips]', box), inp = $('[data-fn-note-in]', box), pane = $('[data-fn-note-box]', box), t = $('[data-fn-note-t]', box);
          var ing = (d.getAttribute('data-ingredients') || '').split('|').map(function (x) { return x.trim(); }).filter(Boolean), c0 = cardNote(pid);
          ing.forEach(function (name) {
            var b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = fill(T_('mods-without'), { i: name }); b.setAttribute('aria-pressed', c0.off.indexOf(name) > -1 ? 'true' : 'false');
            b.addEventListener('click', function () { var c = cardNote(pid), k = c.off.indexOf(name); if (k > -1) c.off.splice(k, 1); else c.off.push(name); b.setAttribute('aria-pressed', k > -1 ? 'false' : 'true'); if (st.days[st.active] === pid) syncCardToDay(pid, st.active); persist(); render(); });
            chips.appendChild(b);
          });
          inp.value = c0.note || '';
          inp.addEventListener('input', function () { cardNote(pid).note = inp.value; if (st.days[st.active] === pid) syncCardToDay(pid, st.active); persist(); render(); });
          var dn = document.createElement('button'); dn.type = 'button'; dn.className = 'fn-note__done'; dn.textContent = T_('mods-done');
          dn.addEventListener('click', function (e) { e.stopPropagation(); pane.hidden = true; box.classList.remove('is-open'); }); pane.appendChild(dn);
          t.addEventListener('click', function (e) { e.stopPropagation(); pane.hidden = !pane.hidden; box.classList.toggle('is-open', !pane.hidden); });
          box.addEventListener('click', function (e) { e.stopPropagation(); });
        });
      };
      var modsOf = function (i) { return st.mods[i] || (st.mods[i] = { off: [], note: '' }); };
      var modsText = function (i) { var m = st.mods[i]; if (!m) return ''; var parts = (m.off || []).map(function (x) { return fill(T_('mods-without'), { i: x }); }); if (m.note) parts.push(m.note); return parts.join(', '); };
      var renderMods = function () {
        var box = $('[data-fn-mods]', holder); if (!box) return;
        var dish = st.days[st.active] && byPid(st.days[st.active]);
        if (!dish || modsOpen !== st.active) { box.hidden = true; modsKey = ''; return; }
        var key = st.active + '|' + dish.getAttribute('data-pid') + '|' + st.step; box.hidden = false;
        if (key === modsKey) return; modsKey = key;
        var m = modsOf(st.active);
        var ing = (dish.getAttribute('data-ingredients') || '').split('|').map(function (x) { return x.trim(); }).filter(Boolean);
        box.innerHTML = '';
        var xb = document.createElement('button'); xb.type = 'button'; xb.className = 'fn-mods__x'; xb.setAttribute('aria-label', T_('mods-done')); xb.textContent = '\u00d7'; xb.addEventListener('click', function () { modsOpen = -1; render(); }); box.appendChild(xb);
        var h = document.createElement('p'); h.className = 'fn-mods__t'; h.textContent = fill(T_('mods-title'), { d: dayLabel(st.active), p: lab(dish) }); box.appendChild(h);
        if (ing.length) {
          var hint = document.createElement('p'); hint.className = 'fn-mods__h'; hint.textContent = T_('mods-hint'); box.appendChild(hint);
          var chips = document.createElement('div'); chips.className = 'fn-mods__chips';
          ing.forEach(function (name) {
            var b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = name; b.setAttribute('aria-pressed', m.off.indexOf(name) > -1 ? 'true' : 'false');
            b.addEventListener('click', function () { var k = m.off.indexOf(name); if (k > -1) m.off.splice(k, 1); else m.off.push(name); b.setAttribute('aria-pressed', k > -1 ? 'false' : 'true'); persist(); render(); });
            chips.appendChild(b);
          });
          box.appendChild(chips);
        }
        var lb = document.createElement('label'); lb.className = 'fn-mods__note'; var sp = document.createElement('span'); sp.textContent = T_('mods-note'); lb.appendChild(sp);
        var inp = document.createElement('input'); inp.type = 'text'; inp.className = 'input'; inp.maxLength = 140; inp.value = m.note || ''; inp.placeholder = T_('mods-ph'); inp.setAttribute('data-fn-mods-note', '');
        inp.addEventListener('input', function () { m.note = inp.value; persist(); render(); }); lb.appendChild(inp); box.appendChild(lb);
        var w = document.createElement('p'); w.className = 'fn-mods__w'; w.textContent = T_('mods-warn'); box.appendChild(w);
        var dn = document.createElement('button'); dn.type = 'button'; dn.className = 'btn btn--outline btn--sm'; dn.textContent = T_('mods-done'); dn.addEventListener('click', function () { modsOpen = -1; render(); }); box.appendChild(dn);
      };
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modsOpen > -1) { modsOpen = -1; render(); } });
      var PKEYS = ['days', 'days2', 'mods', 'cardNotes', 'qty', 'perDay', 'course', 'active', 'cat', 'catPicked', 'presetCat'], switching = false;
      var pKey = function () { return st.para || 'yo'; };
      var saveMine = function () { if (switching) return; try { st.people = st.people && typeof st.people === 'object' ? st.people : {}; var o = {}; PKEYS.forEach(function (k) { o[k] = st[k] === undefined ? null : JSON.parse(JSON.stringify(st[k])); }); st.people[pKey()] = o; } catch (e) {} };
      var persist = function () { saveMine(); try { localStorage.setItem(FUNNEL_KEY, JSON.stringify(Object.assign({ v: 2 }, st))); } catch (e) {} };
      var lastKey = function () { var a0 = acct(); return 'kx_last_order' + (a0 ? '_' + a0.cid : ''); };
      var say = function (msg) { if (!err) return; err.hidden = !msg; err.textContent = msg || ''; };
      var fill = function (tpl, o) { return String(tpl).replace(/\{(\w+)\}/g, function (m, k) { return o[k] != null ? o[k] : m; }); };
      var planTotal = function () { return priceOf(tierEl(), st.plan) + upgradeExtra(); };

      // the week strip: five day buttons that fill with the chosen dish; the dish cards below assign to the active day
      var weekBox = $('[data-fn-week]', holder);
      var buildWeek = function () {
        if (!weekBox || weekBox.children.length === MEALS) return;
        weekBox.innerHTML = '';
        for (var i = 0; i < MEALS; i++) {
          var li = document.createElement('li'), b = document.createElement('button'), x = document.createElement('span');
          b.type = 'button'; b.className = 'fn-day'; b.setAttribute('data-fn-day-btn', i);
          b.innerHTML = '<i class="fn-day__thumb" aria-hidden="true"><b class="fn-day__h1"></b><b class="fn-day__h2"></b></i><span class="fn-day__d"></span><span class="fn-day__dish"></span><span class="fn-day__dish2" hidden></span><span class="fn-day__ing"></span>';
          x.className = 'fn-day__x'; x.setAttribute('data-fn-day-x', i); x.setAttribute('role', 'button'); x.tabIndex = 0; x.textContent = '×'; x.hidden = true;
          var ed = document.createElement('span'); ed.className = 'fn-day__e'; ed.setAttribute('data-fn-day-edit', i); ed.setAttribute('role', 'button'); ed.tabIndex = 0; ed.textContent = '✎'; ed.hidden = true;
          var x2 = document.createElement('span'); x2.className = 'fn-day__x2'; x2.setAttribute('data-fn-day2-x', i); x2.setAttribute('role', 'button'); x2.tabIndex = 0; x2.textContent = '×'; x2.hidden = true;
          li.appendChild(b); li.appendChild(x); li.appendChild(x2); li.appendChild(ed); weekBox.appendChild(li);
        }
      };
      var macroOf = function (pid) { var d = pid && byPid(pid); if (!d) return null; return { k: +d.getAttribute('data-kcal') || 0, p: +d.getAttribute('data-protein') || 0, c: +d.getAttribute('data-carbs') || 0, f: +d.getAttribute('data-fat') || 0, fi: +d.getAttribute('data-fiber') || 0, su: +d.getAttribute('data-sugar') || 0, so: +d.getAttribute('data-sodium') || 0, ca: +d.getAttribute('data-calcium') || 0, fe: +d.getAttribute('data-iron') || 0, k2: +d.getAttribute('data-potassium') || 0, mg: +d.getAttribute('data-magnesium') || 0, vc: +d.getAttribute('data-vitc') || 0, va: +d.getAttribute('data-vita') || 0 }; };
      var dayMacros = function (i) { var t = { k: 0, p: 0, c: 0, f: 0, n: 0 }; [st.days[i], st.days2[i]].forEach(function (pid) { var m = macroOf(pid); if (m) { t.k += m.k; t.p += m.p; t.c += m.c; t.f += m.f; t.n++; } }); return t; };
      var paintMacros = function () {
        var box = $('[data-fn-macros]', holder); if (!box) return;
        var t = dayMacros(st.active), wk = 0; for (var i1 = 0; i1 < MEALS; i1++) wk += dayMacros(i1).k;
        var set = function (k, v) { var e = $('[data-fn-m="' + k + '"]', box); if (e) e.textContent = v; };
        var nz = t.n > 0, fmt = function (n) { return Math.round(n).toLocaleString(cfg.lang === 'en' ? 'en-US' : 'es-MX'); };
        set('kcal', nz ? fmt(t.k) : '—'); set('p', nz ? Math.round(t.p) + ' g' : '—'); set('c', nz ? Math.round(t.c) + ' g' : '—'); set('f', nz ? Math.round(t.f) + ' g' : '—'); set('wk', wk ? fmt(wk) : '—');
        var tot = t.p * 4 + t.c * 4 + t.f * 9 || 1;
        ['p', 'c', 'f'].forEach(function (k) { var u = $('[data-fn-mb="' + k + '"]', box); if (u) u.style.flexGrow = nz ? String(Math.max(0.0001, (k === 'f' ? t.f * 9 : (k === 'p' ? t.p : t.c) * 4) / tot)) : '0'; });
        var dayEl = $('[data-fn-macros-day]', box); if (dayEl) dayEl.textContent = dayShort(st.active);
        var hint = $('[data-fn-macros-hint]', box); if (hint) hint.hidden = nz;
        box.classList.toggle('is-empty', !nz);
      };
      var paintWeek = function () {
        buildWeek(); if (!weekBox) return;
        $$('[data-fn-day-btn]', weekBox).forEach(function (b) {
          var i = +b.getAttribute('data-fn-day-btn'), d = st.days[i] && byPid(st.days[i]), li = b.parentNode, x = $('[data-fn-day-x]', li);
          $('.fn-day__d', b).textContent = dayShort(i);
          var dish = $('.fn-day__dish', b), thumb = $('.fn-day__thumb', b), lv = levelOf(d);
          var lvDay = dayLevel(i); dish.textContent = d ? lab(d) + (lvDay ? ' · +' + money(upg(lvDay)) : '') : '—';
          var d2 = st.days2[i] && byPid(st.days2[i]), dsh2 = $('.fn-day__dish2', b), x2e = $('[data-fn-day2-x]', li); dsh2.hidden = !d2; dsh2.textContent = d2 ? '+ ' + lab(d2) : ''; if (x2e) { x2e.hidden = !d2; x2e.setAttribute('aria-label', fill(T_('clear-day'), { d: dayLabel(i) })); }
          var ingEl = $('.fn-day__ing', b); if (ingEl) { var ig = d ? (d.getAttribute('data-ingredients') || '').split('|').map(function (x) { return x.trim(); }).filter(Boolean) : [], mt0 = d ? modsText(i) : ''; ingEl.textContent = (ig.length ? ig.slice(0, 7).join(' · ') : '') + (mt0 ? '  ✎ ' + mt0 : ''); }
          var img = d && $('img', d); thumb.style.backgroundImage = img ? 'url("' + (img.currentSrc || img.src) + '")' : '';
          var im2 = d2 && $('img', d2), h1 = $('.fn-day__h1', thumb), h2 = $('.fn-day__h2', thumb); thumb.classList.toggle('is-split', st.perDay === 2); thumb.classList.toggle('has-h1', !!d); thumb.classList.toggle('has-h2', !!d2);
          if (h1) h1.style.backgroundImage = img ? 'url("' + (img.currentSrc || img.src) + '")' : ''; if (h2) h2.style.backgroundImage = im2 ? 'url("' + (im2.currentSrc || im2.src) + '")' : '';
          b.classList.toggle('is-set', !!d); b.classList.toggle('is-active', i === st.active); b.classList.toggle('has-warn', !!(d && d.classList.contains('is-warned')));
          b.setAttribute('aria-pressed', i === st.active ? 'true' : 'false');
          b.setAttribute('aria-label', dayLabel(i) + ': ' + (d ? lab(d) : T_('day-empty')));
          x.hidden = !d; x.setAttribute('aria-label', fill(T_('clear-day'), { d: dayLabel(i) }));
          var ed = $('[data-fn-day-edit]', li); if (ed) { ed.hidden = !d; ed.classList.toggle('has-note', !!(d && modsText(i))); ed.setAttribute('aria-label', fill(T_('mods-edit'), { d: dayLabel(i) })); }
        });
      };

      // order memory: "repeat my last order" fills the week with what was confirmed last time (only dishes that are on this week's menu)
      var repeatBtn = $('[data-fn-repeat]', holder), lastOrder = null;
      try { lastOrder = JSON.parse(localStorage.getItem(lastKey()) || 'null'); } catch (e) {}
      var repeatPool = function () { return lastOrder && Array.isArray(lastOrder.days) ? lastOrder.days.map(function (pid) { return pid && eligible(byPid(pid)) ? pid : ''; }) : []; };
      if (repeatBtn && repeatPool().some(Boolean)) repeatBtn.hidden = false;
      if (repeatBtn) repeatBtn.addEventListener('click', function () {
        var pool = repeatPool();
        if (!pool.some(Boolean)) { say(repeatBtn.getAttribute('data-t-none')); return; }
        st.days = blankDays().map(function (x, k) { return pool[k] || ''; }); st.days2 = blankDays(); st.qty = {}; st.days.forEach(function (p) { if (p) st.qty[p] = (st.qty[p] || 0) + 1; });
        st.mods = blankDays().map(function (x, k) { var m = lastOrder.mods && lastOrder.mods[k]; return m && pool[k] ? { off: (m.off || []).slice(), note: m.note || '' } : { off: [], note: '' }; });
        st.active = Math.max(0, st.days.indexOf('')); if (st.active < 0) st.active = 0; if (daysBox) daysBox.removeAttribute('data-built');
        persist(); render(); say(repeatBtn.getAttribute('data-t-done'));
      });
      // phone planner (app deck): the bar button picks the card that is in the middle of the row for the active day
      var barPick = $('[data-fn-barpick]', holder);
      if (barPick) barPick.addEventListener('click', function () {
        var rail = $('.step[data-fn-step="3"] [data-fn-grid]', holder); if (!rail) return;
        var mid = rail.getBoundingClientRect().left + rail.clientWidth * 0.4, best = null, bd = 1e9;
        $$('[data-fn-dish]:not(.is-hidden)', rail).forEach(function (c) { var r = c.getBoundingClientRect(), dd = Math.abs(r.left + r.width / 2 - mid); if (dd < bd && !c.classList.contains('is-blocked')) { bd = dd; best = c; } });
        var pb = best && $('[data-pick]', best); if (pb) pb.click();
      });
      /* guided tour of the planner (coach marks): shown the first time the planner opens, and again from "Ver guía" */
      var tourEl = null, tourI = 0, TOUR_KEY = 'kx-tour-planner';
      var tourSteps = function () {
        var phone = window.matchMedia && window.matchMedia('(max-width:760px)').matches;
        return [
          { sel: '.step[data-fn-step="3"] [data-fn-week]', t: 'tour-1' },
          phone ? { sel: '.funnel__aside [data-fn-barpick]', t: 'tour-2m' } : { sel: '.step[data-fn-step="3"] [data-fn-grid] [data-fn-dish]:not(.is-hidden)', t: 'tour-2' },
          { sel: phone ? '.funnel__aside' : '.funnel__aside .funnel__total', t: 'tour-4' }
        ];
      };
      var tourClose = function (remember) { if (tourEl) { tourEl.remove(); tourEl = null; } if (remember) { try { localStorage.setItem(TOUR_KEY, '1'); } catch (x) {} } window.removeEventListener('resize', tourPlace); };
      var tourPlace = function () {
        if (!tourEl) return; var steps3 = tourSteps(), st3 = steps3[tourI], tg = $(st3.sel, holder); if (!tg) return;
        var r = tg.getBoundingClientRect(), pad = 6, sp = $('.fn-tour__spot', tourEl), bb = $('.fn-tour__bubble', tourEl);
        sp.style.cssText = 'left:' + (r.left - pad) + 'px;top:' + (r.top - pad) + 'px;width:' + (r.width + pad * 2) + 'px;height:' + (r.height + pad * 2) + 'px';
        bb.style.maxWidth = Math.min(340, window.innerWidth - 24) + 'px';
        var bh = bb.offsetHeight, bw = bb.offsetWidth, below = window.innerHeight - r.bottom, above = r.top, top, left;
        if (r.right + bw + 28 <= window.innerWidth && r.height > 100) {           // room beside a tall target (a card): put the note next to it
          left = r.right + 18; top = Math.min(Math.max(10, r.top + 10), window.innerHeight - bh - 10);
        } else {
          if (below >= bh + 20) top = r.bottom + 12;
          else if (above >= bh + 20) top = r.top - bh - 12;
          else top = (r.top + r.height / 2 > window.innerHeight / 2) ? 12 : window.innerHeight - bh - 12;
          left = Math.min(Math.max(12, r.left + r.width / 2 - bw / 2), window.innerWidth - bw - 12);
        }
        bb.style.top = top + 'px'; bb.style.left = left + 'px';
      };
      var tourShow = function () {
        if (!tourEl) return; var arr = tourSteps(), st3 = arr[tourI], tg = $(st3.sel, holder);
        if (!tg) { if (tourI < arr.length - 1) { tourI++; tourShow(); } else tourClose(true); return; }
        tg.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        $('.fn-tour__text', tourEl).textContent = T_(st3.t);
        $('.fn-tour__count', tourEl).textContent = (tourI + 1) + ' / ' + arr.length;
        $('.fn-tour__next', tourEl).textContent = tourI === arr.length - 1 ? T_('tour-done') : T_('tour-next');
        window.requestAnimationFrame(tourPlace);
      };
      var startTour = function (force) {
        if (tourEl) return;
        if (!force) { try { if (localStorage.getItem(TOUR_KEY)) return; } catch (x) {} if (navigator.webdriver) return; }
        if (st.reach < 3) return;
        st.step = 3; persist(); render();
        tourI = 0; tourEl = document.createElement('div'); tourEl.className = 'fn-tour';
        tourEl.innerHTML = '<div class="fn-tour__spot"></div><div class="fn-tour__bubble" role="dialog" aria-live="polite"><p class="fn-tour__text"></p><div class="fn-tour__row"><span class="fn-tour__count"></span><button type="button" class="fn-tour__skip"></button><button type="button" class="btn btn--gold btn--sm fn-tour__next"></button></div></div>';
        $('.fn-tour__skip', tourEl).textContent = T_('tour-skip');
        $('.fn-tour__skip', tourEl).addEventListener('click', function () { tourClose(true); });
        $('.fn-tour__next', tourEl).addEventListener('click', function () { if (tourI >= tourSteps().length - 1) { tourClose(true); return; } tourI++; tourShow(); });
        document.body.appendChild(tourEl); window.addEventListener('resize', tourPlace);
        window.setTimeout(tourShow, 120);
      };
      var tourArmed = false;
      /* rules step: the button unlocks only after reading to the end and ticking "I understand" */
      var rulesBox = $('[data-fn-rules]', holder), rRail = $('[data-fn-rules-rail]', holder), rChk = $('[data-fn-rules-check]', holder), rBtn = $('[data-fn-rules-next]', holder), rHint = $('[data-fn-rules-hint]', holder), rulesRead = !!st.rulesOk, rulesSeenEnd = false;
      var rulesState = function () {
        if (!rulesBox) return;
        if (st.rulesOk || rulesSeenEnd) rulesRead = true;
        if (!rulesRead && rRail) { var atEnd = rRail.scrollWidth > rRail.clientWidth + 4 && rRail.scrollLeft + rRail.clientWidth >= rRail.scrollWidth - 14; if (atEnd) rulesRead = true; }
        if (rChk) rChk.disabled = !rulesRead;                      // never ticked for the visitor: they tick it once they are done
        if (rBtn) rBtn.disabled = !(rulesRead && rChk && rChk.checked);
        if (rHint) rHint.hidden = rulesRead;
        rulesBox.classList.toggle('is-read', rulesRead);
      };
      if (rulesBox) {
        var lastCard = $('[data-fn-rules-last]', holder);
        if (lastCard && rRail && window.IntersectionObserver) new IntersectionObserver(function (en) { en.forEach(function (e) { if (e.isIntersecting && e.intersectionRatio > 0.6 && st.step === 0) { rulesSeenEnd = true; rulesState(); } }); }, { root: rRail, threshold: [0.6, 1] }).observe(lastCard);
        if (rRail) rRail.addEventListener('scroll', function () { window.requestAnimationFrame(rulesState); }, { passive: true });
        $$('[data-fn-rules-arrow]', holder).forEach(function (ar) { ar.addEventListener('click', function () { if (rRail) rRail.scrollBy({ left: (+ar.getAttribute('data-fn-rules-arrow')) * Math.max(220, rRail.clientWidth * 0.8), behavior: REDUCE ? 'auto' : 'smooth' }); }); });
        // phone: the tick and the button are the last slide of the row; desktop: they sit under the row
        var endBox = $('[data-fn-rules-end]', holder), slot = $('[data-fn-rules-slot]', holder), phoneMq = window.matchMedia ? window.matchMedia('(max-width:760px)') : null;
        var placeEnd = function () { if (!endBox || !slot) return; if (phoneMq && phoneMq.matches) slot.appendChild(endBox); else rulesBox.appendChild(endBox); };
        placeEnd(); if (phoneMq && phoneMq.addEventListener) phoneMq.addEventListener('change', placeEnd);
        // dots under the row on the phone
        var dotsBox = document.createElement('div'); dotsBox.className = 'fn-rules__dots'; dotsBox.setAttribute('aria-hidden', 'true');
        if (rRail) { $$('.fn-rcard', rRail).forEach(function () { dotsBox.appendChild(document.createElement('i')); }); $('.fn-rules__carousel', holder).appendChild(dotsBox);
          var paintDots = function () { var cards = $$('.fn-rcard', rRail), w = cards[0] ? cards[0].getBoundingClientRect().width + 12 : 1, k = Math.min(cards.length - 1, Math.round(rRail.scrollLeft / Math.max(1, w))); $$('i', dotsBox).forEach(function (d, n) { d.classList.toggle('on', n === k); });
            var pvA = $('[data-fn-rules-arrow="-1"]', holder), nxA = $('[data-fn-rules-arrow="1"]', holder);
            if (pvA) pvA.style.visibility = rRail.scrollLeft < 8 ? 'hidden' : 'visible'; if (nxA) nxA.style.visibility = rRail.scrollLeft + rRail.clientWidth >= rRail.scrollWidth - 8 ? 'hidden' : 'visible'; };
          rRail.addEventListener('scroll', function () { window.requestAnimationFrame(paintDots); }, { passive: true }); paintDots();
          var finalCard = $('[data-fn-rules-final]', holder);
          if (finalCard && window.IntersectionObserver) new IntersectionObserver(function (en) { en.forEach(function (e) { if (e.isIntersecting && e.intersectionRatio > 0.6 && st.step === 0) { rulesSeenEnd = true; rulesState(); } }); }, { root: rRail, threshold: [0.6, 1] }).observe(finalCard);
        }
        if (rChk) rChk.addEventListener('change', rulesState);
        if (rBtn) rBtn.addEventListener('click', function () { st.rulesOk = true; try { localStorage.setItem(RULES_KEY, '1'); } catch (x) {} setReach(1); persist(); go(1); });
      }
      var fixTopGap = function () {
        try {
          if (!(window.matchMedia && window.matchMedia('(max-width:760px)').matches)) { holder.style.paddingTop = ''; return; }
          var hdr = document.querySelector('.site-header'), stg = $('.funnel__stage', holder); if (!hdr || !stg || holder.classList.contains('funnel--teaser')) return;
          holder.style.paddingTop = '';
          var gap = stg.getBoundingClientRect().top - hdr.getBoundingClientRect().bottom;
          if (gap > 16) holder.style.paddingTop = Math.max(0, (parseFloat(getComputedStyle(holder).paddingTop) || 0) - (gap - 6)) + 'px';
        } catch (x) {}
      };
      window.addEventListener('resize', fixTopGap); window.setTimeout(fixTopGap, 80); window.setTimeout(fixTopGap, 700);
      var render = function () {
        if (typeof ensureV2 === 'function') ensureV2();
        // dishes of a lower tier or blocked by the profile cannot stay in the plan; slots are the source of truth
        st.days = st.days.map(function (p) { return p && eligible(byPid(p)) ? p : ''; });
        st.days2 = st.days2.map(function (p, k) { return p && st.days[k] && eligible(byPid(p)) ? p : ''; });
        st.qty = {}; st.days.concat(st.days2).forEach(function (p) { if (p) st.qty[p] = (st.qty[p] || 0) + 1; });
        paintWeek();
        $$('[data-plan-choice]', holder).forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-plan-choice') === st.plan ? 'true' : 'false'); });
        tierBtns.forEach(function (b) {
          b.setAttribute('aria-checked', b === tierEl() ? 'true' : 'false');
          var pr = $('[data-fn-tier-price]', b), sub = $('[data-fn-tier-sub]', b), meal = +b.getAttribute('data-meal') || 0;
          var total = priceOf(b, st.plan), n = st.plan === 'block' ? MEALS * WEEKS : MEALS;
          if (pr) { pr.firstChild.nodeValue = money(total); if (sub) sub.textContent = n + ' · ' + money(Math.round(total / n)) + ' ' + T_('per-meal'); }
        });
        var csel = $('[data-fn-cat]', holder); if (csel) csel.value = st.cat; var dsel = $('[data-fn-diet]', holder); if (dsel) dsel.value = st.diet;
        var n = count(), full = n >= MEALS, shown = 0;
        dishes.forEach(function (d) {
          var show = rank(d.getAttribute('data-tier')) >= rank(st.tier) && (!st.pickTier || d.getAttribute('data-tier') === st.pickTier) && inGroup(d, st.cat) && (st.diet === 'all' || (d.getAttribute('data-diets') || '').split('|').indexOf(st.diet) > -1);
          d.classList.toggle('is-hidden', !show); if (show) shown++;
          var q = st.qty[d.getAttribute('data-pid')] || 0;
          // the per-meal price follows the chosen plan: 4-week block = block price / 20 meals, 1-week plan = week price / 5 meals (so 5 meals add up to the plan price)
          var prEl = $('[data-fn-price]', d), pmv = +d.getAttribute(st.plan === 'week' ? 'data-pm-week' : 'data-pm-block'); if (prEl && pmv) prEl.textContent = money(pmv);
          var upEl = $('[data-fn-up]', d), lv = levelOf(d); if (upEl) { upEl.hidden = !lv; upEl.textContent = lv ? fill(T_('up-badge'), { p: money(upg(lv)) }) : ''; }
          d.classList.toggle('is-picked', q > 0);
          var cb = $('[data-fn-count]', d); if (cb) { cb.hidden = q === 0; cb.textContent = '×' + q; }
          var pick = $('[data-pick]', d);
          if (pick) { pick.hidden = false; pick.disabled = false; pick.textContent = curSlot()[st.active] === d.getAttribute('data-pid') ? T_('picked') : T_('pick'); }
          if (pick) { pick.classList.toggle('is-on', curSlot()[st.active] === d.getAttribute('data-pid')); pick.setAttribute('aria-label', pick.textContent); }
        });
        var e1 = $('[data-fn-empty]', holder); if (e1) e1.hidden = shown > 0;
        // meter + summary
        var prm = $('[data-fn-prompt]', holder); if (prm) prm.textContent = st.course === 1 ? fill(T_('pick2-for'), { d: dayLabel(st.active) }) : (n === MEALS ? T_('all-done') : fill(T_('pick-for'), { d: dayLabel(st.active) }));
        $$('[data-fn-perday]', holder).forEach(function (pb) { var on = +pb.getAttribute('data-fn-perday') === st.perDay; pb.classList.toggle('is-on', on); pb.setAttribute('aria-pressed', on ? 'true' : 'false'); });
        var cg = $('[data-fn-course-group]', holder); if (cg) cg.hidden = st.perDay !== 2; var stp = cg && cg.closest('.step'); if (stp) stp.setAttribute('data-perday', st.perDay);
        $$('[data-fn-course]', holder).forEach(function (cb) { var on = +cb.getAttribute('data-fn-course') === st.course; cb.classList.toggle('is-on', on); cb.setAttribute('aria-pressed', on ? 'true' : 'false'); });
        paintMacros();
        var mn = $('[data-fn-meter-n]', holder); if (mn) mn.textContent = n;
        var mb = $('[data-fn-meter-bar]', holder); if (mb) mb.style.transform = 'scaleX(' + Math.min(1, n / MEALS) + ')';
        var meter = $('[data-fn-meter]', holder); if (meter) meter.classList.toggle('is-full', full);
        var sp = $('[data-fn-s-plan]', holder); if (sp) sp.textContent = st.plan === 'block' ? T_('block-name') : T_('week-name');
        var stier = $('[data-fn-s-tier]', holder); if (stier) stier.textContent = tierEl().getAttribute('data-name');
        var sm = $('[data-fn-s-meals]', holder); if (sm) sm.textContent = n + ' / ' + MEALS;
        var list = $('[data-fn-s-list]', holder);
        if (list) {
          list.innerHTML = '';
          st.days.forEach(function (pid, i) {
            var d = pid && byPid(pid); if (!d) return; var l = dayLevel(i), s2 = st.days2[i] && byPid(st.days2[i]);
            var li = document.createElement('li'); li.innerHTML = '<span></span><b></b><em class="fn-s-ing"></em><i class="fn-s-edit" role="button" tabindex="0" data-fn-day-edit="' + i + '">✎</i>'; li.firstChild.textContent = dayLabel(i) + ' · ' + lab(d) + (s2 ? ' + ' + lab(s2) : ''); $('b', li).textContent = l ? '+' + money(upg(l)) : '';
            var ingS = (d.getAttribute('data-ingredients') || '').split('|').map(function (x) { return x.trim(); }).filter(Boolean), mt = modsText(i);
            $('.fn-s-ing', li).textContent = (ingS.length ? ingS.slice(0, 9).join(' · ') : '') + (mt ? '  —  ✎ ' + mt : '');
            if (i === sumOpen) li.classList.add('is-open'); li.classList.add('fn-s-item');
            li.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-fn-day-edit]')) return; sumOpen = sumOpen === i ? -1 : i; render(); });
            list.appendChild(li);
          });
        }
        var fst = $('[data-fn-first]', holder); if (fst) fst.textContent = fill(T_('first'), { d: dateOf(0) });
        $$('[data-fn-budget]', holder).forEach(function (bud) {
          var wk = st.plan === 'block' ? Math.round(priceOf(tierEl(), 'block') / 4) : priceOf(tierEl(), 'week'), exb = upgradeExtra();
          bud.innerHTML = '';
          var isAside = bud.classList.contains('fn-budget--aside'), smallUi = isAside || (window.matchMedia && window.matchMedia('(max-width:760px)').matches);
          var bt = document.createElement('span'); bt.textContent = (smallUi ? fill(T_('budget-short'), { w: money(wk) }) : fill(T_('budget'), { w: money(wk), t: money(planTotal() - exb) })) + ' ' + (exb ? fill(T_('budget-x'), { x: money(exb) }) : T_('budget-ok')) + ' ';
          var bl = document.createElement('button'); bl.type = 'button'; bl.className = 'text-link'; bl.textContent = T_('how-open'); bl.setAttribute('data-fn-how-open', '');
          var tg2 = document.createElement('button'); tg2.type = 'button'; tg2.className = 'text-link'; tg2.textContent = T_('tour-guide'); tg2.setAttribute('data-fn-tour-open', '');
          bud.appendChild(bt); bud.appendChild(bl); if (!isAside) bud.appendChild(tg2);
        });
        var upl = $('[data-fn-s-up]', holder); if (upl) { var ex = upgradeExtra(); upl.hidden = !ex; upl.textContent = ex ? fill(T_('up-total'), { p: money(ex), t: money(planTotal() - ex) }) : ''; }
        var emp = $('[data-fn-s-empty]', holder); if (emp) emp.hidden = n > 0;
        var cnt = $('[data-fn-s-count]', holder); if (cnt) cnt.textContent = n ? fill(T_('meals'), { n: n, t: MEALS }) : '';
        var tot = $('[data-fn-s-total]', holder); if (tot) tot.textContent = money(grandTotal());
        var sb = $('[data-fn-s-block]', holder); if (sb) { sb.hidden = false; sb.textContent = st.plan === 'block' ? fill(T_('weeks-x'), { p: money(priceOf(tierEl(), st.plan) / WEEKS), w: WEEKS }) : fill(T_('per-week'), { p: money(planTotal()) }); }
        var sc = $('[data-fn-stepcount]', holder);
        if (sc) {
          var items = [{ k: 'in', s: 0, lab: (dots[0] && dots[0].textContent.replace(/^\s*\d+/, '').trim()) || '' }, { k: 'how', s: 0, lab: T_('s-how') }, { k: 'plan', s: 1, lab: (dots[1] && dots[1].textContent.replace(/^\s*\d+/, '').trim()) || '' }, { k: 'week', s: 3, lab: (dots[3] && dots[3].textContent.replace(/^\s*\d+/, '').trim()) || '' }];
          var pos = st.step === 3 ? 3 : (st.step === 0 ? (acctOn ? 1 : 0) : 2);
          sc.innerHTML = '<span class="fn-sc__n">' + esc(T_('step-of').replace('{n}', pos + 1).replace('{t}', 4)) + '</span><span class="fn-sc__steps">' + items.map(function (it, k2) {
            var done = k2 < pos, on = k2 === pos;
            return '<button type="button" class="fn-sc__s' + (done ? ' is-done' : '') + (on ? ' is-on' : '') + '" data-fn-step-jump="' + it.s + '" data-fn-kind="' + it.k + '"' + (on ? ' aria-current="step"' : '') + '>' + (done ? '&#10003; ' : '') + esc(it.lab) + '</button>';
          }).join('') + '</span>';
        }
        var rn = $('[data-fn-renew]', holder); if (rn) { var hasPlan = !!tierEl().getAttribute('data-selling-plan'); rn.hidden = !(hasPlan && st.plan === 'block'); var box = $('[data-fn-renew-box]', holder); if (box) box.checked = st.renew; }
        buildNotes();
        renderMods();
        holder.setAttribute('data-step', steps[st.step].getAttribute('data-fn-step'));
        if (typeof rulesState === 'function') window.setTimeout(rulesState, 60);
        if (st.step === 3 && !tourArmed && !holder.classList.contains('is-gated')) { tourArmed = true; window.setTimeout(function () { startTour(false); }, 600); }
        // stepper
        steps.forEach(function (s, k) { s.classList.toggle('is-on', k === st.step); });
        paintCats(); paintPresets(); paintWk(); paintPicker();
        dots.forEach(function (d, k) { d.classList.toggle('is-on', k === st.step); d.classList.toggle('is-done', k < st.step); d.classList.toggle('is-locked', k > st.reach); d.setAttribute('aria-disabled', k > st.reach ? 'true' : 'false'); });
        if (bar) bar.style.transform = 'scaleX(' + (((st.step === 3 ? 4 : (st.step === 0 ? (acctOn ? 2 : 1) : 3)) / 4)) + ')';
        var last = st.step === steps.length - 1;
        if (prev) prev.hidden = st.step === 0;
        if (next) { next.hidden = last; next.disabled = (st.step === 1 && !st.catPicked); }
        var phoneUi = window.matchMedia && window.matchMedia('(max-width:760px)').matches, bp = $('[data-fn-barpick]', holder), deckMode = !!(bp && phoneUi && st.step === 3 && n < MEALS);
        if (bp) { bp.hidden = !deckMode; if (deckMode) bp.textContent = fill(T_('pick-day'), { d: dayLabel(st.active) }); }
        holder.classList.toggle('is-deck', deckMode);
        if (finish) { finish.hidden = !last || deckMode; finish.classList.toggle('is-disabled', n < 1); finish.setAttribute('aria-disabled', n < 1 ? 'true' : 'false'); var fl = holder.getAttribute(ce ? 'data-t-finish' : 'data-t-finish-guest'); if (fl && finish.textContent.trim() !== fl) finish.textContent = fl; }
        var rem = $('[data-fn-remembered]', holder); if (rem) { rem.hidden = !(st.remembered && st.step === 2); rem.textContent = T_('remembered'); }
      };

      // the page keeps scrolling normally; changing step brings the top of the funnel back into view if needed
      var top = $('.funnel__top', holder);
      /* step 2: diet cards (step 1) and ready-made weekly menus (step 2) */
      var presetBox = $('[data-fn-presets]', holder), presetSets = [], esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
      var paintCats = function () {
        var gn = $('[data-fn-go-next]', holder); if (gn) gn.disabled = !st.catPicked;
        $$('[data-cat-choice]', holder).forEach(function (b) { var on = !!st.catPicked && b.getAttribute('data-cat-choice') === st.cat; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
      };
      var buildPresetSets = function () {
        var fixed = defaultMenu(st.cat).map(function (h) { return dishes.filter(function (d) { return d.getAttribute('data-handle') === h; })[0]; });
        if (fixed.length >= MEALS && fixed.slice(0, MEALS).every(Boolean)) return [fixed.slice(0, MEALS)];
        var okd = function (d) { return !d.hasAttribute('data-seasonal'); };                    // fallback (table missing a dish): fixed order, same for everyone
        var byName = function (a, b) { return a.getAttribute('data-handle') > b.getAttribute('data-handle') ? 1 : -1; };
        var inG = dishes.filter(function (d) { return okd(d) && inGroup(d, st.cat); }).sort(function (a, b) { return rank(a.getAttribute('data-tier')) - rank(b.getAttribute('data-tier')) || byName(a, b); });
        if (!inG.length) inG = dishes.filter(okd).sort(byName);
        if (!inG.length) return [[]];
        var out = []; for (var i = 0; i < MEALS; i++) out.push(inG[i % inG.length]);
        return [out];
      };
      var paintPresets = function () {
        if (!presetBox || st.step !== 2) return;
        var grid = $('[data-fn-presets-grid]', presetBox); if (!grid) return;
        var cb = $('[data-cat-choice="' + st.cat + '"] strong', holder), cname = cb ? cb.textContent : '';
        var sub = $('[data-fn-presets-sub]', presetBox); if (sub) sub.textContent = (presetBox.getAttribute('data-t-sub') || '').replace('[c]', cname);
        var okd = function (d) { return !d.hasAttribute('data-seasonal') && !d.classList.contains('is-warned'); };
        var pool = dishes.filter(function (d) { return okd(d) && inGroup(d, st.cat); });
        if (pool.length < 2) pool = pool.concat(dishes.filter(function (d) { return okd(d) && pool.indexOf(d) < 0 && rank(d.getAttribute('data-tier')) === 0; }));
        pool.sort(function (a, b) { return rank(a.getAttribute('data-tier')) - rank(b.getAttribute('data-tier')) || (a.getAttribute('data-title') > b.getAttribute('data-title') ? 1 : -1); });
        if (!pool.length) { grid.innerHTML = ''; presetSets = []; return; }
        var h = Math.ceil(pool.length / 2), mk = function (list) { var a = []; for (var i = 0; i < MEALS; i++) a.push(list[i % list.length]); return a; };
        presetSets = [mk(pool), mk(pool.slice(h).concat(pool.slice(0, h)))];
        grid.innerHTML = presetSets.map(function (set, n) {
          var k = 0, p = 0; set.forEach(function (d) { k += +d.getAttribute('data-kcal') || 0; p += +d.getAttribute('data-protein') || 0; });
          var days = set.map(function (d, i) { var im = $('img', d), src = im ? (im.currentSrc || im.src) : ''; return '<li><i style="background-image:url(&quot;' + esc(src) + '&quot;)"></i><b>' + esc(dayNames[i] || '') + '</b><span>' + esc(lab(d)) + '</span></li>'; }).join('');
          return '<article class="fn-preset"><header><strong>' + esc(cname + ' ' + (n + 1)) + '</strong><span>' + esc((presetBox.getAttribute('data-t-kcal') || '').replace('[k]', Math.round(k / MEALS))) + ' · ' + esc((presetBox.getAttribute('data-t-prot') || '').replace('[p]', Math.round(p / MEALS))) + '</span></header><ol class="fn-preset__days">' + days + '</ol><button class="btn btn--gold" type="button" data-fn-preset-pick="' + n + '">' + esc(presetBox.getAttribute('data-t-pick') || '') + '</button></article>';
        }).join('');
      };
      var applyPreset = function (list) {
        st.days = blankDays().map(function (x, k) { return list[k] ? list[k].getAttribute('data-pid') : ''; }); st.days2 = blankDays(); st.perDay = 1; st.course = 0; st.mods = blankDays().map(function () { return { off: [], note: '' }; }); st.cardNotes = {}; st.qty = {};
        st.days.forEach(function (p) { if (p) st.qty[p] = (st.qty[p] || 0) + 1; }); st.active = 0; if (daysBox) daysBox.removeAttribute('data-built');
        setReach(3); go(3);
      };
      holder.addEventListener('click', function (e) {
        var t = e.target; if (!t || !t.closest) return;
        var cb = t.closest('[data-cat-choice]');
        if (cb) { st.cat = cb.getAttribute('data-cat-choice'); st.catPicked = true; try { localStorage.setItem('kx_dietpick', st.cat); } catch (x) {} persist(); render(); return; }
        if (t.closest('[data-fn-how-go]')) { st.rulesOk = true; try { localStorage.setItem(RULES_KEY, '1'); } catch (x) {} setReach(1); persist(); go(1); return; }
        var ca = t.closest('[data-fn-cats-arrow]');
        if (ca) { var rail = $('[data-fn-cats]', holder); if (rail) rail.scrollBy({ left: (+ca.getAttribute('data-fn-cats-arrow')) * Math.max(200, rail.clientWidth * 0.7), behavior: REDUCE ? 'auto' : 'smooth' }); return; }
        var pb = t.closest('[data-fn-preset-pick]');
        if (pb) { applyPreset(presetSets[+pb.getAttribute('data-fn-preset-pick')] || []); return; }
        if (t.closest('[data-fn-preset-empty]')) { applyPreset([]); return; }
        if (t.closest('[data-fn-go-next]')) { if (next && !next.disabled) next.click(); else say(T_('locked')); return; }
        if (t.closest('[data-fn-go-prev]') && prev) prev.click();
      });
      /* "have your own diet?": quote request with a real file upload (the sheet backend stores it and drafts a plan) */
      var ownBox = $('[data-fn-own-modal]', holder.parentNode), ownForm = ownBox && $('[data-fn-own-form]', ownBox), ownOk = ownBox && $('[data-fn-own-ok]', ownBox);
      var ownShow = function (on) { if (!ownBox) return; ownBox.hidden = !on; document.documentElement.classList.toggle('fn-own-open', on); if (on) { var f0 = $('input[type=file]', ownBox); if (f0) f0.focus(); } };
      if (ownBox && ownForm) {
        var ownFile = $('input[type=file]', ownForm), ownName = $('[data-own-file-name]', ownForm), ownErr = $('[data-own-err]', ownForm), ownLabel = ownName ? ownName.textContent : '';
        var ownMsg = function (m) { if (ownErr) { ownErr.textContent = m || ''; ownErr.hidden = !m; } };
        if (ownFile) ownFile.addEventListener('change', function () { var f = ownFile.files && ownFile.files[0]; if (ownName) ownName.textContent = f ? f.name : ownLabel; ownMsg(''); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !ownBox.hidden) ownShow(false); });
        ownBox.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-own-close]')) ownShow(false); });
        ownForm.addEventListener('submit', function (e) {
          e.preventDefault();
          var f = ownFile && ownFile.files && ownFile.files[0], name = ($('[name=name]', ownForm).value || '').trim(), email = ($('[name=email]', ownForm).value || '').trim();
          var okType = f && /^(application\/pdf|image\/jpeg|image\/png)$/.test(f.type) && f.size <= 5 * 1024 * 1024;
          if (!okType || !name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !$('[name=consent]', ownForm).checked) { ownMsg(ownBox.getAttribute('data-t-err')); return; }
          var ep = ownBox.getAttribute('data-endpoint'), btn = $('.fn-own__go', ownForm), btnTxt = btn.textContent; btn.disabled = true; btn.textContent = ownBox.getAttribute('data-t-sending') || '…';
          var rd = new FileReader();
          rd.onload = function () {
            var data = String(rd.result || '').split(',')[1] || '';
            try { if (ep) fetch(ep, { method: 'POST', mode: 'no-cors', keepalive: false, headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'diet_quote', name: name, email: email, phone: ($('[name=phone]', ownForm).value || '').trim(), plan: $('[name=plan]', ownForm).value, notes: ($('[name=notes]', ownForm).value || '').trim(), file: { name: f.name, type: f.type, data: data } }) }); } catch (x) {}
            ownForm.hidden = true; if (ownOk) ownOk.hidden = false; btn.disabled = false; btn.textContent = btnTxt;
          };
          rd.onerror = function () { ownMsg(ownBox.getAttribute('data-t-err')); btn.disabled = false; btn.textContent = btnTxt; };
          rd.readAsDataURL(f);
        });
      }
      holder.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-fn-own]') && ownBox) { if (ownForm) ownForm.hidden = false; if (ownOk) ownOk.hidden = true; ownShow(true); } });
      /* "your week": five big day cards (1 or 2 plates a day), an upgrade / swap pop-up, warnings kept */
      var wkRoot = $('[data-fn-wk]', holder), wkBox = $('[data-fn-wk-cards]', holder), picker = $('[data-fn-picker]', holder), pickerTitle = $('[data-fn-picker-title]', holder);
      var WT = function (k) { return wkRoot ? (wkRoot.getAttribute('data-t-' + k) || '') : ''; }, tierNames = WT('tiers').split(',');
      var tierOf = function (d) { return d ? d.getAttribute('data-tier') || 'selecto' : 'selecto'; };
      /* ===== week board v2: day cards, weekend add-ons, side dishes, customise pop-up, group catalogue, tally summary ===== */
      var W2 = {}; try { W2 = JSON.parse((wkRoot && wkRoot.getAttribute('data-w2')) || '{}'); } catch (e) {}
      var w2 = function (k, rep) { var s = W2[k] || ''; if (rep) Object.keys(rep).forEach(function (r) { s = s.split('[' + r + ']').join(rep[r]); }); return s; };
      var weNames = (W2.days_we || 'Sábado,Domingo').split(',');
      var CATS = $$('[data-cat-choice]', holder).map(function (b) { return { id: b.getAttribute('data-cat-choice'), name: (($('strong', b) || {}).textContent || '').trim() }; }).filter(function (c) { return c.id && c.id !== 'all' && c.id !== 'seasonal'; });
      var catName = function (id) { var c = CATS.filter(function (x) { return x.id === id; })[0]; return c ? c.name : id; };
      var QUICK = ['al-fuego', 'keto-low-carb', 'sin-gluten', 'veggie'].filter(function (id) { return CATS.some(function (c) { return c.id === id; }); });
      var ORDER = ['al-fuego', 'keto-low-carb', 'sin-gluten', 'veggie', 'fit-proteina', 'ligero', 'bowls', 'desayunos', 'diario', 'entradas', 'junior', 'snacks-postres'];
      var grpOfDish = function (d) { for (var k = 0; k < ORDER.length; k++) if (inGroup(d, ORDER[k])) return ORDER[k]; return ''; };
      var dishPrice = function (d) { return d ? (+d.getAttribute('data-price') || 0) : 0; };
      var COMPS = ['ensalada', 'sopa', 'postre'];
      var ensureV2 = function () {
        if (!Array.isArray(st.comp) || st.comp.length !== MEALS) st.comp = blankDays();
        if (!Array.isArray(st.we) || st.we.length !== 2) st.we = [{ on: false, pid: '' }, { on: false, pid: '' }];
        if (!Array.isArray(st.xt)) st.xt = [];
        if (!Array.isArray(st.compPid) || st.compPid.length !== MEALS) st.compPid = blankDays();
        if (!Array.isArray(st.compMods) || st.compMods.length !== MEALS) st.compMods = blankDays().map(function () { return { off: [], note: '' }; });
        if (st.viewFor !== st.cat || !st.view || !CATS.some(function (c) { return c.id === st.view; })) { st.view = (st.cat && st.cat !== 'all' && CATS.some(function (c) { return c.id === st.cat; })) ? st.cat : (QUICK[0] || 'al-fuego'); st.viewFor = st.cat; st.vtier = 'selecto'; }
        if (!st.vtier) st.vtier = 'selecto';
        if (typeof st.tgt !== 'string') st.tgt = '';
        if (st.days2.some(Boolean)) st.perDay = 2;
      };
      var extraTotal = function () { var s = 0; (st.we || []).forEach(function (w) { var d = w.on && w.pid && byPid(w.pid); if (d) s += dishPrice(d); }); (st.xt || []).forEach(function (p) { s += dishPrice(byPid(p)); }); return s; };
      var grandTotal = function () { return planTotal() + extraTotal(); };
      var svgS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>';
      var slotHtml = function (i, c) {
        var pid = c ? st.days2[i] : st.days[i], d = pid && byPid(pid), key = i + ':' + c;
        if (!d) return c ? '' : '<div class="fn-wk__slot is-empty"><button class="fn-wk__add" type="button" data-bd-focus="' + i + ':0">' + esc(WT('add1')) + '</button></div>';
        var im = $('img', d), src = im ? (im.currentSrc || im.src) : '', lv = rank(tierOf(d)), extra = lv ? upg(lv) : 0, m = macroOf(pid) || { k: 0, p: 0, c: 0, f: 0 };
        var wb = $('[data-fn-warnbox]', d), mt = !c ? modsText(i) : '';
        return '<div class="fn-wk__slot' + (d.classList.contains('is-warned') ? ' has-warn' : '') + (extra ? ' is-up' : '') + (c ? ' is-second' : '') + '">'
          + '<div class="fn-wk__top"><strong class="fn-wk__name">' + esc(lab(d)) + '</strong>' + (c ? '<button class="fn-wk__ed fn-wk__ed--x" type="button" data-wk-clear="' + key + '" aria-label="×">×</button>' : '<button class="fn-wk__ed' + (mt ? ' has-note' : '') + '" type="button" data-bd-cust="' + i + '" aria-label="' + esc(WT('edit')) + '">' + svgS + '</button>') + '</div>'
          + '<span class="fn-wk__m">' + esc(m.k + ' ' + WT('kcal') + ' · ' + WT('mp').charAt(0) + ' ' + m.p + ' · ' + WT('mc').charAt(0) + ' ' + m.c + ' · ' + WT('mf').charAt(0) + ' ' + m.f) + '</span>'
          + '<span class="fn-wk__tier fn-wk__tier--' + tierOf(d) + '">' + esc(tierNames[lv] || '') + (extra ? ' · +' + esc(money(extra)) : '') + '</span>'
          + '<div class="fn-wk__img"><button class="fn-wk__imgb" type="button" data-wk-img="' + key + '" aria-label="' + esc(lab(d)) + '" style="background-image:url(&quot;' + esc(src) + '&quot;)"></button>' + (wb ? wb.outerHTML : '') + '<i class="fn-wk__k" aria-hidden="true">K</i></div>'
          + (mt ? '<span class="fn-wk__note">✎ ' + esc(mt) + '</span>' : '')
          + '<div class="fn-wk__btns">' + (lv < 3 ? '<button class="fn-wk__up" type="button" data-bd-up="' + key + '">★ ' + esc(WT('up')) + '</button>' : '<span class="fn-wk__max">★ ' + esc(WT('max')) + '</span>') + '<button class="fn-wk__swap" type="button" data-bd-focus="' + key + '">' + esc(WT('swap')) + '</button></div>'
          + '</div>';
      };
      var compName = function (k, i) { var d = i != null && st.compPid && st.compPid[i] && byPid(st.compPid[i]); if (d) return lab(d); return k ? w2(k === 'ensalada' ? 'comp1' : k === 'sopa' ? 'comp2' : 'comp3') : ''; };
      var cardHtml = function (i) {
        var d = st.days[i] && byPid(st.days[i]), g = d ? grpOfDish(d) : '', lbl = dayLabel(i), sp = lbl.indexOf(' '), dn = sp > 0 ? lbl.slice(0, sp) : lbl, dd = sp > 0 ? lbl.slice(sp + 1) : '', ck = st.comp[i];
        return '<li class="fn-wk__card' + (i === st.active && !st.tgt ? ' is-active' : '') + '" data-day="' + i + '">'
          + '<button type="button" class="fn-wk__grp" data-bd-grp="' + i + '" aria-haspopup="listbox" aria-expanded="false" title="' + esc(w2('grp_pick')) + '">' + esc(catName(g || st.view)) + ' <i aria-hidden="true">&#9662;</i></button>'
          + '<span class="fn-bd__menu fn-wk__gmenu" data-bd-gmenu="' + i + '" role="listbox" hidden>' + CATS.map(function (c) { return '<button type="button" role="option" class="' + ((g || st.view) === c.id ? 'is-on' : '') + '" data-bd-gpick="' + i + ':' + c.id + '">' + esc(c.name) + '</button>'; }).join('') + '</span>'
          + '<h4><b>' + esc(dn) + '</b> <small>' + esc(dd) + '</small></h4>' + slotHtml(i, 0) + slotHtml(i, 1)
          + (d ? '<div class="fn-wk__foot"><button type="button" class="fn-wk__comp' + (ck ? ' is-set' : '') + '" data-bd-comp="' + i + '">' + esc(ck ? w2('comp_set', { c: compName(ck, i) }) : w2('comp')) + '</button>' + (st.days2[i] ? '' : '<button type="button" class="fn-wk__add2" data-bd-add2="' + i + '">' + esc(w2('add2')) + '</button>') + '</div>' : '')
          + '</li>';
      };
      var bellS = '<svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" aria-hidden="true"><path d="M12 2a6 6 0 0 0-6 6v3.6L4 15v1h16v-1l-2-3.4V8a6 6 0 0 0-6-6zm-2.2 16a2.2 2.2 0 0 0 4.4 0z"/></svg>';
      var weHtml = function (k) {
        var w = st.we[k], d = w.pid && byPid(w.pid), nm = weNames[k] || '';
        if (!w.on) return '<li class="fn-we is-off"><button type="button" class="fn-we__wake" data-we-on="' + k + '"><span class="fn-we__ico">' + bellS + '</span><b>' + esc(w2('we_on', { d: nm })) + '</b><small>' + esc(w2('we_hint')) + '</small></button></li>';
        var h = '<li class="fn-we is-on' + (st.tgt === 'we' + k ? ' is-active' : '') + '" data-we="' + k + '"><span class="fn-wk__grp fn-wk__grp--we">' + esc(w2('we_deliv')) + '</span><h4><b>' + esc(nm) + '</b> <button class="fn-we__x" type="button" data-we-off="' + k + '" aria-label="' + esc(w2('we_off')) + '">×</button></h4>';
        if (!d) return h + '<div class="fn-wk__slot is-empty"><button class="fn-wk__add" type="button" data-bd-focus="we' + k + '">' + esc(w2('we_pick')) + '</button></div></li>';
        var im = $('img', d), src = im ? (im.currentSrc || im.src) : '', m = macroOf(w.pid) || { k: 0, p: 0, c: 0, f: 0 }, lv = rank(tierOf(d));
        return h + '<div class="fn-wk__slot"><div class="fn-wk__top"><strong class="fn-wk__name">' + esc(lab(d)) + '</strong></div><span class="fn-wk__m">' + esc(m.k + ' ' + WT('kcal') + ' · ' + WT('mp').charAt(0) + ' ' + m.p) + '</span>'
          + '<span class="fn-wk__tier fn-wk__tier--' + tierOf(d) + '">' + esc(w2('we_extra')) + ' · ' + esc(money(dishPrice(d))) + '</span>'
          + '<div class="fn-wk__img"><button class="fn-wk__imgb" type="button" data-bd-focus="we' + k + '" aria-label="' + esc(lab(d)) + '" style="background-image:url(&quot;' + esc(src) + '&quot;)"></button><i class="fn-wk__k" aria-hidden="true">K</i></div>'
          + '<div class="fn-wk__btns"><button class="fn-wk__swap" type="button" data-bd-focus="we' + k + '">' + esc(WT('swap')) + '</button></div></div></li>';
      };
      var cutText = function () {
        var h = Math.floor(cutoffMin / 60), mn = cutoffMin % 60, h12 = h % 12 || 12, es = cfg.lang !== 'en';
        return (es ? 'Sáb ' : 'Sat ') + h12 + ':' + (mn < 10 ? '0' : '') + mn + (h < 12 ? ' AM' : ' PM');
      };
      var clockS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
      var topHtml = function () {
        var pills = QUICK.map(function (id) { return '<button type="button" class="fn-bd__pill' + (st.view === id ? ' is-on' : '') + '" data-bd-view="' + id + '" aria-pressed="' + (st.view === id ? 'true' : 'false') + '">' + esc(catName(id)) + '</button>'; }).join('');
        var rest = CATS.filter(function (c) { return QUICK.indexOf(c.id) < 0; });
        var restOn = rest.some(function (c) { return c.id === st.view; });
        var menu = rest.map(function (c) { return '<button type="button" role="option" class="' + (st.view === c.id ? 'is-on' : '') + '" data-bd-view="' + c.id + '">' + esc(c.name) + '</button>'; }).join('');
        var groups = {}; st.days.forEach(function (p) { var d = p && byPid(p); if (d) groups[grpOfDish(d)] = 1; });
        var mixed = Object.keys(groups).length > 1;
        return '<div class="fn-bd__pills" role="group">' + pills + '<span class="fn-bd__more"><button type="button" class="fn-bd__pill fn-bd__pill--more' + (restOn ? ' is-on' : '') + '" data-bd-more aria-haspopup="listbox" aria-expanded="false">' + esc(restOn ? catName(st.view) : w2('all')) + ' <i aria-hidden="true">&#9662;</i></button><span class="fn-bd__menu" data-bd-menu role="listbox" hidden>' + menu + '</span></span></div>'
          + '<p class="fn-bd__info">' + clockS + '<span>' + esc(w2('info', { t: cutText() })) + '</span></p><p class="fn-bd__note">' + esc(w2('note')) + '</p>'
          + '<div class="fn-bd__titlebar"><h4>' + esc(w2('h1')) + ' <em>' + esc(mixed ? w2('h_mix') : w2('h_rec')) + '</em></h4><p>' + esc(w2('sub')) + '</p></div>';
      };
      var tgtLabel = function () { if (st.tgt) return weNames[+st.tgt.slice(2)] || ''; var l = dayLabel(st.active); return l.split(' ')[0] + (st.course === 1 ? ' · +1' : ''); };
      var ctHtml = function () {
        var cat = st.view, all = dishes.filter(function (d) { return inGroup(d, cat) && eligible(d); }), tiers = ['selecto', 'exclusivo', 'signature', 'reserve'];
        var cnt0 = function (t) { return all.filter(function (d) { return tierOf(d) === t; }).length; }; if (!cnt0(st.vtier)) { var ft = tiers.filter(function (t) { return cnt0(t); })[0]; if (ft) st.vtier = ft; }
        var tabs = tiers.map(function (t, n) { var cnt = all.filter(function (d) { return tierOf(d) === t; }).length; return '<button type="button" class="fn-ct__tab' + (st.vtier === t ? ' is-on' : '') + '" data-ct-tier="' + t + '">' + esc(tierNames[n] || t) + ' <b>' + cnt + '</b>' + (n ? ' <small>(+' + esc(money(upg(n))) + ')</small>' : '') + '</button>'; }).join('');
        var cur = st.tgt ? st.we[+st.tgt.slice(2)].pid : (st.course === 1 ? st.days2[st.active] : st.days[st.active]);
        var list = all.filter(function (d) { return tierOf(d) === st.vtier; });
        var items = list.map(function (d) {
          var im = $('img', d), src = im ? (im.currentSrc || im.src) : '', pid = d.getAttribute('data-pid'), m = macroOf(pid) || { k: 0 }, lv = rank(tierOf(d)), blocked = d.classList.contains('is-blocked');
          var price = st.tgt ? money(dishPrice(d)) : (lv ? w2('cat_up', { p: money(upg(lv)) }) : '');
          return '<button type="button" class="fn-ct__d' + (cur === pid ? ' is-on' : '') + (d.classList.contains('is-warned') ? ' has-warn' : '') + '"' + (blocked ? ' disabled' : '') + ' data-ct-pick="' + pid + '"><span class="fn-ct__im" style="background-image:url(&quot;' + esc(src) + '&quot;)"></span><span class="fn-ct__n">' + esc(lab(d)) + '</span><span class="fn-ct__k">' + m.k + ' ' + esc(WT('kcal')) + (price ? ' · <b>' + esc(price) + '</b>' : '') + '</span></button>';
        }).join('');
        return '<div class="fn-ct__head"><h4>' + esc(w2('cat_t', { g: catName(cat) })) + '</h4><div class="fn-ct__tabs" role="group">' + tabs + '</div></div><p class="fn-ct__for">' + esc(w2('cat_for', { d: tgtLabel() })) + '</p><div class="fn-ct__rail" data-ct-rail>' + (items || '<p class="fn-ct__none">' + esc(w2('cat_none')) + '</p>') + '</div>';
      };
      var assignDish = function (pid) {
        if (st.tgt) { var k = +st.tgt.slice(2); st.we[k].pid = st.we[k].pid === pid ? '' : pid; }
        else if (st.course === 1) { if (!st.days[st.active]) { say(T_('need-first')); return; } st.days2[st.active] = st.days2[st.active] === pid ? '' : pid; }
        else { if (st.days[st.active] !== pid) st.mods[st.active] = { off: [], note: '' }; syncCardToDay(pid, st.active); st.days[st.active] = pid; if (st.active + 1 < MEALS && !st.days[st.active + 1]) st.active += 1; }
        say(''); persist(); render();
      };
      var wkTabs = $('[data-fn-wk-tabs]', holder), wkTabsOn = function (i) { if (!wkTabs) return; $$('[data-wk-tab]', wkTabs).forEach(function (b) { var on = +b.getAttribute('data-wk-tab') === i; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); }); };
      if (wkBox && wkTabs) {
        wkBox.addEventListener('scroll', function () { window.requestAnimationFrame(function () { var c = wkBox.children[0]; if (!c) return; var w = c.getBoundingClientRect().width + 14, i = Math.max(0, Math.min(MEALS - 1, Math.round(wkBox.scrollLeft / Math.max(1, w)))); wkTabsOn(i); }); }, { passive: true });
        wkTabs.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-wk-tab]'); if (!b) return; var i = +b.getAttribute('data-wk-tab'), c = wkBox.children[i]; wkTabsOn(i); if (c && wkBox.scrollTo) wkBox.scrollTo({ left: c.offsetLeft - wkBox.offsetLeft - 4, behavior: REDUCE ? 'auto' : 'smooth' }); });
      }
      var paintWk = function () {
        if (!wkBox || st.step !== 3) return;
        if (wkTabs && !wkTabs.children.length) { wkTabs.innerHTML = dayNames.slice(0, MEALS).map(function (n, i) { return '<button type="button" role="tab" data-wk-tab="' + i + '">' + esc(n) + '</button>'; }).join(''); wkTabsOn(0); }
        ensureV2(); var fin0 = $('[data-fn-finish]', holder); if (fin0 && W2.review && fin0.textContent !== W2.review) fin0.textContent = W2.review;
        var h = '';
        for (var i = 0; i < MEALS; i++) h += cardHtml(i);
        h += weHtml(0) + weHtml(1);
        var keepX = wkBox.scrollLeft; wkBox.innerHTML = h; wkBox.scrollLeft = keepX;
        var topEl = $('[data-fn-bd-top]', holder); if (topEl) { var oldMenu = $('[data-bd-menu]', topEl), wasOpen = oldMenu && !oldMenu.hidden; topEl.innerHTML = topHtml(); if (wasOpen) { var nm2 = $('[data-bd-menu]', topEl); if (nm2) nm2.hidden = false; } }
        var ctEl = $('[data-fn-ct]', holder);
        if (!ctEl) { ctEl = document.createElement('section'); ctEl.className = 'fn-ct'; ctEl.setAttribute('data-fn-ct', ''); wkBox.parentNode.insertBefore(ctEl, wkBox.nextSibling); }
        var rail0 = $('[data-ct-rail]', ctEl), kx = rail0 ? rail0.scrollLeft : 0; ctEl.innerHTML = ctHtml(); var rail1 = $('[data-ct-rail]', ctEl); if (rail1) rail1.scrollLeft = kx;
        var dnm = $('[data-fn-diet-name]', holder), pnm = $('[data-fn-plan-name]', holder), cbn = $('[data-cat-choice="' + st.cat + '"] strong', holder);
        if (dnm) dnm.textContent = cbn ? cbn.textContent : '';
        if (pnm) { var dep = priceOf(tierEl(), st.plan); pnm.textContent = st.plan === 'block' ? WT('plan-block').replace('[t]', money(dep)).replace('[w]', money(Math.round(dep / 4))) : WT('plan-week').replace('[t]', money(dep)); }
        var dm = $('[data-fn-dietmenu]', holder);
        if (dm && !dm.children.length) dm.innerHTML = $$('[data-cat-choice]', holder).map(function (b) { var sm = $('small', b); return '<button type="button" role="option" data-fn-diet-pick="' + esc(b.getAttribute('data-cat-choice')) + '"><strong>' + esc($('strong', b).textContent) + '</strong>' + (sm ? '<small>' + esc(sm.textContent) + '</small>' : '') + '</button>'; }).join('');
        if (dm) $$('[data-fn-diet-pick]', dm).forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-fn-diet-pick') === st.cat); });
        var nu = $('[data-fn-wk-nutri]', holder);
        if (nu) {
          var tk = 0, tp = 0, tc = 0, tf = 0, nd = 0; for (var q = 0; q < MEALS; q++) { var dmx = dayMacros(q); if (dmx.n) { tk += dmx.k; tp += dmx.p; tc += dmx.c; tf += dmx.f; nd++; } }
          nu.hidden = !nd;
          if (nd) { var av = function (x) { return Math.round(x / nd).toLocaleString(cfg.lang === 'en' ? 'en-US' : 'es-MX'); };
            nu.innerHTML = '<h4>' + esc(WT('nutri-t')) + '</h4><dl><div><dt>' + esc(WT('nutri-day')) + '</dt><dd><b>' + av(tk) + '</b> ' + esc(WT('kcal')) + '</dd></div><div><dt>' + esc(WT('mp')) + '</dt><dd><b>' + av(tp) + '</b> g</dd></div><div><dt>' + esc(WT('mc')) + '</dt><dd><b>' + av(tc) + '</b> g</dd></div><div><dt>' + esc(WT('mf')) + '</dt><dd><b>' + av(tf) + '</b> g</dd></div><div><dt>' + esc(WT('nutri-week')) + '</dt><dd><b>' + Math.round(tk).toLocaleString(cfg.lang === 'en' ? 'en-US' : 'es-MX') + '</b> ' + esc(WT('kcal')) + '</dd></div></dl>'; }
        }
      };
      var paintPicker = function () {
        if (!picker) return;
        var dn = dayLabel(st.active).split(' ')[0]; picker.setAttribute('data-mode', st.pickTier || pickUp ? 'up' : 'swap');
        if (pickerTitle) pickerTitle.textContent = ((st.pickTier || pickUp) ? WT('pkup') : (st.course === 1 ? WT('pk2') : WT('pk'))).replace('[d]', dn);
        $$('[data-pick-tier]', picker).forEach(function (b) { var on = (b.getAttribute('data-pick-tier') || '') === (st.pickTier || ''); b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      };
      var pickCatBefore = null, pickUp = false;
      var openPicker = function (i, c, tier) {
        if (!picker) return;
        st.active = i; st.course = c ? 1 : 0; st.pickTier = tier || ''; pickCatBefore = st.cat; pickUp = !!tier; st.cat = 'all'; persist();
        picker.hidden = false; holder.classList.add('is-picking'); document.documentElement.classList.add('fn-pick-open');
        var gr = $('[data-fn-grid]', picker); if (gr) gr.scrollLeft = 0; render();
      };
      var closePicker = function () {
        if (!picker || picker.hidden) return;
        picker.hidden = true; holder.classList.remove('is-picking'); document.documentElement.classList.remove('fn-pick-open'); st.pickTier = ''; pickUp = false; st.course = 0; if (pickCatBefore) { st.cat = pickCatBefore; pickCatBefore = null; } persist(); render();
      };
      holder.addEventListener('click', function (e) {
        var t = e.target; if (!t || !t.closest) return;
        var sw = t.closest('[data-wk-swap]'), up = t.closest('[data-wk-up]');
        if (sw || up) {
          var kk = (sw || up).getAttribute(sw ? 'data-wk-swap' : 'data-wk-up').split(':'), ii = +kk[0], cc = +kk[1];
          var cur = byPid(cc ? st.days2[ii] : st.days[ii]), nxt = ['exclusivo', 'signature', 'reserve'][Math.min(2, rank(tierOf(cur)))];
          openPicker(ii, cc, up ? (cur ? nxt : 'exclusivo') : ''); return;
        }
        var im = t.closest('[data-wk-img]');
        if (im && !t.closest('[data-fn-warnbox]')) { var k2 = im.getAttribute('data-wk-img').split(':'), d2 = byPid(+k2[1] ? st.days2[+k2[0]] : st.days[+k2[0]]), mb = d2 && $('.fn-dish__media', d2); if (mb) mb.click(); return; }
        var ed = t.closest('[data-wk-edit]');
        if (ed) { var eb = $('[data-fn-day-edit="' + ed.getAttribute('data-wk-edit') + '"]', holder); if (eb) eb.click(); return; }
        var cl = t.closest('[data-wk-clear]');
        if (cl) { var k3 = cl.getAttribute('data-wk-clear').split(':'); st.days2[+k3[0]] = ''; st.active = +k3[0]; persist(); render(); return; }
        var pt = t.closest('[data-pick-tier]');
        if (pt) { st.pickTier = pt.getAttribute('data-pick-tier') || ''; persist(); render(); return; }
        if (t.closest('[data-fn-picker-close]')) { closePicker(); return; }
        if (t.closest('[data-pick]') && picker && !picker.hidden) { setTimeout(closePicker, 0); return; }
        var dop = t.closest('[data-fn-diet-open]'), dmenu = $('[data-fn-dietmenu]', holder);
        if (dop && dmenu) { var open2 = dmenu.hidden; dmenu.hidden = !open2; dop.setAttribute('aria-expanded', open2 ? 'true' : 'false'); return; }
        var dpk = t.closest('[data-fn-diet-pick]');
        if (dpk) {
          var nid = dpk.getAttribute('data-fn-diet-pick'), dm2 = $('[data-fn-dietmenu]', holder), cur = st.cat;
          if (dm2) { dm2.hidden = true; var o3 = $('[data-fn-diet-open]', holder); if (o3) o3.setAttribute('aria-expanded', 'false'); }
          if (nid === cur) return;
          var ids = function (set) { return (set || []).map(function (d) { return d ? d.getAttribute('data-pid') : ''; }).join('|'); }, mine = st.days.join('|') + '|' + st.days2.filter(Boolean).join('|');
          var dflt = ids(buildPresetSets()[0]) + '|';
          if (mine !== dflt && st.days.some(Boolean) && !window.confirm(WT('swap-confirm'))) return;
          st.cat = nid; st.catPicked = true; st.presetCat = nid; try { localStorage.setItem('kx_dietpick', nid); } catch (x2) {}
          applyPreset(buildPresetSets()[0] || []); return;
        }
        var sj = t.closest('[data-fn-step-jump]');
        if (sj) { var n2 = +sj.getAttribute('data-fn-step-jump'), kd = sj.getAttribute('data-fn-kind'); if ((kd === 'in' && acctOn) || (kd === 'how' && !acctOn) || (n2 === st.step && (kd === 'plan' || kd === 'week' || (kd === 'in' && !acctOn) || (kd === 'how' && acctOn)))) return; go(n2); return; }
        var sb = t.closest('[data-fn-sum-toggle]');
        if (sb) { var asd = sb.closest('.funnel__aside'); if (asd) { var on2 = asd.classList.toggle('is-open'); sb.setAttribute('aria-expanded', on2 ? 'true' : 'false'); } }
      });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (picker && !picker.hidden) closePicker(); var dmE = $('[data-fn-dietmenu]', holder); if (dmE && !dmE.hidden) dmE.hidden = true; } });
      document.addEventListener('click', function (e) { var dmC = $('[data-fn-dietmenu]', holder); if (dmC && !dmC.hidden && !(e.target.closest && e.target.closest('[data-fn-dietmenu],[data-fn-diet-open]'))) dmC.hidden = true; });
      var go = function (n) {
        n = Math.max(0, Math.min(steps.length - 1, n)); if (n > st.reach) { say(T_('locked')); return; } var moved = n !== st.step; st.step = n; say(''); persist(); render();
        if (moved && top) {
          var r = top.getBoundingClientRect(), hdr = (parseFloat(getComputedStyle(root).getPropertyValue('--hdr')) || 72) + 8;
          if (r.top < hdr || r.top > window.innerHeight * 0.5) window.scrollTo({ top: r.top + window.scrollY - hdr, behavior: REDUCE ? 'auto' : 'smooth' });
        }
      };

      // choices
      $$('[data-plan-choice]', holder).forEach(function (b) { b.addEventListener('click', function () { st.plan = b.getAttribute('data-plan-choice'); st.planChosen = true; persist(); render(); }); });
      tierBtns.forEach(function (b) {
        b.addEventListener('click', function () {
          var t = b.getAttribute('data-tier-choice');
          if (t !== st.tier) { st.tier = t; if (daysBox) daysBox.removeAttribute('data-built'); }            // render() drops slots that no longer fit the tier
          persist(); render(); setTimeout(function () { go(3); }, REDUCE ? 0 : 280);
        });
      });
      $$('[data-cat]', holder).forEach(function (b) { b.addEventListener('click', function () { st.cat = b.getAttribute('data-cat'); persist(); render(); }); });
      $$('[data-diet]', holder).forEach(function (b) { b.addEventListener('click', function () { st.diet = b.getAttribute('data-diet'); persist(); render(); }); });
      var catSel = $('[data-fn-cat]', holder), dietSel = $('[data-fn-diet]', holder);
      if (catSel) catSel.addEventListener('change', function () { st.cat = catSel.value; persist(); render(); var gr = $('[data-fn-grid]', holder); if (gr) gr.scrollLeft = 0; });
      if (dietSel) dietSel.addEventListener('change', function () { st.diet = dietSel.value; persist(); render(); var gr = $('[data-fn-grid]', holder); if (gr) gr.scrollLeft = 0; });
      var renewBox = $('[data-fn-renew-box]', holder); if (renewBox) renewBox.addEventListener('change', function () { st.renew = renewBox.checked; persist(); });
      holder.addEventListener('click', function (e) {
        var xb = e.target.closest ? e.target.closest('[data-fn-day-x]') : null;
        var x2b = e.target.closest ? e.target.closest('[data-fn-day2-x]') : null;
        if (x2b) { var x2i = +x2b.getAttribute('data-fn-day2-x'); st.days2[x2i] = ''; st.active = x2i; say(''); persist(); render(); return; }
        var pdb = e.target.closest ? e.target.closest('[data-fn-perday]') : null;
        if (pdb) { st.perDay = +pdb.getAttribute('data-fn-perday') === 2 ? 2 : 1; if (st.perDay === 1) { st.days2 = blankDays(); st.course = 0; st.qty = {}; st.days.forEach(function (p) { if (p) st.qty[p] = (st.qty[p] || 0) + 1; }); } say(''); persist(); render(); return; }
        var cbtn = e.target.closest ? e.target.closest('[data-fn-course]') : null;
        if (cbtn) { st.course = +cbtn.getAttribute('data-fn-course') === 1 ? 1 : 0; say(''); persist(); render(); return; }
        if (xb) { var xi = +xb.getAttribute('data-fn-day-x'); st.days[xi] = ''; st.days2[xi] = ''; st.active = xi; say(''); persist(); render(); return; }
        var eb = e.target.closest ? e.target.closest('[data-fn-day-edit]') : null;
        if (eb) { var ei = +eb.getAttribute('data-fn-day-edit'); st.active = ei; modsOpen = modsOpen === ei ? -1 : ei; modsKey = ''; if (st.reach >= 3) st.step = 3; persist(); render(); return; }
        var db = e.target.closest ? e.target.closest('[data-fn-day-btn]') : null;
        if (db) { st.active = +db.getAttribute('data-fn-day-btn'); persist(); render(); return; }
        if (e.target.closest && e.target.closest('[data-fn-how-open]')) { go(0); return; }
        var seb = e.target.closest ? e.target.closest('[data-fn-season]') : null;
        if (seb) { var sv = seb.getAttribute('data-fn-season'); holder.setAttribute('data-season', sv); $$('[data-fn-season]', holder).forEach(function (x) { x.setAttribute('aria-pressed', String(x === seb)); x.classList.toggle('is-on', x === seb); }); var scg = $('[data-fn-sc-grid]', holder); if (scg) scg.scrollLeft = 0; return; }
        if (e.target.closest && e.target.closest('[data-fn-newplan]')) { try { sessionStorage.setItem('kx_newplan', '1'); } catch (x) {} holder.classList.remove('is-returning'); var rr = $('[data-fn-returning]', holder); if (rr) rr.hidden = true; return; }
        if (e.target.closest && e.target.closest('[data-fn-sc-next]')) { setReach(3); go(3); return; }
        if (e.target.closest && e.target.closest('[data-fn-prev-sc]')) { go(1); return; }
        if (e.target.closest && e.target.closest('[data-fn-tour-open]')) { startTour(true); return; }
        var sa = e.target.closest ? e.target.closest('[data-fn-sc-arrow]') : null;
        if (sa) { var sg = $('[data-fn-sc-grid]', holder); if (sg) sg.scrollBy({ left: (+sa.getAttribute('data-fn-sc-arrow')) * Math.max(220, sg.clientWidth * 0.8), behavior: REDUCE ? 'auto' : 'smooth' }); return; }
        var ar = e.target.closest ? e.target.closest('[data-fn-arrow]') : null;
        if (ar) { var gr = $('[data-fn-grid]', holder); if (gr) gr.scrollBy({ left: (+ar.getAttribute('data-fn-arrow')) * Math.max(220, gr.clientWidth * 0.8), behavior: REDUCE ? 'auto' : 'smooth' }); return; }
        var d = e.target.closest ? e.target.closest('[data-fn-dish]') : null; if (!d) return;
        var id = d.getAttribute('data-pid');
        if (!e.target.closest('[data-pick]')) return;
        if (st.course === 1) {                                                     // 2nd course of the active day (the meal's second "tiempo")
          if (!st.days[st.active]) { say(T_('need-first')); return; }
          st.days2[st.active] = st.days2[st.active] === id ? '' : id; say(''); persist(); render(); return;
        }
        if (st.days[st.active] !== id) { st.mods[st.active] = { off: [], note: '' }; modsOpen = -1; }
        syncCardToDay(id, st.active);
        st.days[st.active] = id;
        for (var o = 1; o <= MEALS; o++) { var k = (st.active + o) % MEALS; if (!st.days[k]) { st.active = k; break; } }   // move on to the next empty day
        say(''); persist(); render();
      });
      /* ---- week board v2: interactions, pop-ups and the tally summary ---- */
      var mkModal = function (cls) {
        var m = document.createElement('div'); m.className = 'fn-md ' + (cls || ''); m.hidden = true; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
        m.innerHTML = '<div class="fn-md__bg" data-md-close></div><div class="fn-md__box" data-md-box></div>'; document.body.appendChild(m);
        m.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-md-close]')) mdShow(m, false); });
        return m;
      };
      var mdShow = function (m, on) { m.hidden = !on; document.documentElement.classList.toggle('fn-md-open', !!document.querySelector('.fn-md:not([hidden])')); if (on) { var b = $('button, input', m); } };
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $$('.fn-md:not([hidden])').forEach(function (m) { mdShow(m, false); }); });
      var mdCust = null, mdComp = null, mdSum = null;
      var openCust = function (i) {
        var d = st.days[i] && byPid(st.days[i]); if (!d) return; mdCust = mdCust || mkModal('fn-md--cust');
        var box = $('[data-md-box]', mdCust), cur = modsOf(i), draft = { off: (cur.off || []).slice(), note: cur.note || '' };
        var im = $('img', d), src = im ? (im.currentSrc || im.src) : '', m = macroOf(st.days[i]) || { k: 0, p: 0, c: 0, f: 0 };
        var ings = (d.getAttribute('data-ingredients') || '').split('|').map(function (x) { return x.trim(); }).filter(Boolean);
        var lbl = dayLabel(i).split(' ')[0];
        box.innerHTML = '<button class="fn-md__x" type="button" data-md-close aria-label="' + esc(w2('close_x')) + '">&times;</button>'
          + '<div class="fn-md__row"><div class="fn-md__ph"><span style="background-image:url(&quot;' + esc(src) + '&quot;)"></span><button type="button" data-md-sheet>' + esc(w2('sheet_new')) + '</button></div>'
          + '<div class="fn-md__tt"><h3>' + esc(w2('cust_t')) + '</h3><p>' + esc(lbl + ' · ' + lab(d)) + '</p><span class="fn-md__chip">' + m.k + ' ' + esc(w2('kcal')) + ' · P ' + m.p + ' · C ' + m.c + ' · G ' + m.f + '</span><button type="button" class="fn-md__link" data-md-sheet>' + esc(w2('cust_sheet')) + ' &rarr;</button></div></div>'
          + (ings.length ? '<h4 class="fn-md__h">' + esc(w2('cust_rm')) + '</h4><div class="fn-md__chips">' + ings.map(function (n) { return '<button type="button" class="fn-md__ing' + (draft.off.indexOf(n) > -1 ? ' is-off' : '') + '" data-md-ing="' + esc(n) + '" aria-pressed="' + (draft.off.indexOf(n) > -1 ? 'true' : 'false') + '">' + esc(n) + ' <i aria-hidden="true">×</i></button>'; }).join('') + '</div>' : '')
          + '<h4 class="fn-md__h">' + esc(w2('cust_note')) + '</h4><input class="fn-md__in" type="text" maxlength="160" data-md-note placeholder="' + esc(w2('cust_ph')) + '" value="' + esc(draft.note) + '">'
          + '<button class="fn-md__go" type="button" data-md-save>' + esc(w2('cust_save')) + '</button><button class="fn-md__cancel" type="button" data-md-close>' + esc(w2('cust_cancel')) + '</button>';
        box.onclick = function (e) {
          var t = e.target; if (!t.closest) return;
          var ing = t.closest('[data-md-ing]'); if (ing) { var n = ing.getAttribute('data-md-ing'), k = draft.off.indexOf(n); if (k > -1) draft.off.splice(k, 1); else draft.off.push(n); ing.classList.toggle('is-off', k < 0); ing.setAttribute('aria-pressed', k < 0 ? 'true' : 'false'); return; }
          if (t.closest('[data-md-sheet]')) { mdShow(mdCust, false); var mb = $('.fn-dish__media', d); if (mb) mb.click(); return; }
          if (t.closest('[data-md-save]')) { draft.note = ($('[data-md-note]', box).value || '').trim(); st.mods[i] = { off: draft.off, note: draft.note }; mdShow(mdCust, false); persist(); render(); }
        };
        mdShow(mdCust, true);
        var f = $('[data-md-note]', box); if (f && window.innerWidth > 760) setTimeout(function () { f.focus(); }, 40);
      };
      /* ---- carousel pop-up ("Elige tu platillo" / "Elige tu complemento"): category tabs, the chosen plate big in the middle, the ones around it small ---- */
      var mdCr = null, crKey = null;
      var itemOf = function (d) { var im = $('img', d), pid = d.getAttribute('data-pid'), m = macroOf(pid) || { k: 0, p: 0, c: 0, f: 0 }; return { pid: pid, d: d, title: lab(d), src: im ? (im.currentSrc || im.src) : '', k: m.k, p: m.p, ings: (d.getAttribute('data-ingredients') || '').split('|').map(function (x) { return x.trim(); }).filter(Boolean), tier: tierOf(d), warn: d.classList.contains('is-warned') }; };
      var openCr = function (cfg) {
        mdCr = mdCr || mkModal('fn-md--cr'); var box = $('[data-md-box]', mdCr);
        var tab = cfg.tab || (cfg.tabs.filter(function (t) { return t.items.length; })[0] || cfg.tabs[0]).id, idx = 0, drafts = {};
        var curTab = function () { return cfg.tabs.filter(function (t) { return t.id === tab; })[0]; };
        var draftOf = function (it) { return drafts[it.pid || it.title] || (drafts[it.pid || it.title] = cfg.draftFor ? cfg.draftFor(it) : { off: [], note: '' }); };
        var place = function () { var t0 = curTab(), k = t0.items.map(function (x) { return x.pid; }).indexOf(cfg.sel); idx = k > -1 ? k : 0; };
        place();
        var paint = function () {
          var T0 = curTab(), items = T0.items; idx = Math.max(0, Math.min(items.length - 1, idx));
          var tabsH = cfg.tabs.map(function (t) { return '<button type="button" class="fn-cr__tab' + (t.id === tab ? ' is-on' : '') + '" data-cr-tab="' + esc(t.id) + '">' + esc(t.label) + ' (' + t.items.length + ')</button>'; }).join('');
          var small = function (it, dir) { return it ? '<button type="button" class="fn-cr__n fn-cr__n--' + dir + '" data-cr-go="' + dir + '"><span class="fn-cr__nim" style="background-image:url(&quot;' + esc(it.src) + '&quot;)"></span><b>' + esc(it.title) + '</b><small>' + it.k + ' ' + esc(w2('kcal')) + '</small></button>' : '<span class="fn-cr__n fn-cr__n--' + dir + ' is-empty"></span>'; };
          var it = items[idx], center = '';
          if (it) {
            var dr = draftOf(it), price = cfg.price ? cfg.price(it) : '';
            center = '<div class="fn-cr__c"><div class="fn-cr__ph"><span style="background-image:url(&quot;' + esc(it.src) + '&quot;)"></span>' + (it.d ? '<button type="button" data-cr-sheet>' + esc(w2('sheet_new')) + '</button>' : '') + '</div>'
              + '<h4>' + esc(it.title) + '</h4>' + (it.k ? '<span class="fn-md__chip">' + it.k + ' ' + esc(w2('kcal')) + (it.p ? ' · P ' + it.p : '') + (price ? ' · ' + esc(price) : '') + '</span>' : '')
              + (it.d ? '<button type="button" class="fn-md__link" data-cr-sheet>' + esc(w2('cust_sheet')) + ' &rarr;</button>' : '')
              + (cfg.custom && it.ings.length ? '<p class="fn-cr__h">' + esc(w2('cust_rm')) + '</p><div class="fn-md__chips">' + it.ings.map(function (n) { return '<button type="button" class="fn-md__ing' + (dr.off.indexOf(n) > -1 ? ' is-off' : '') + '" data-cr-ing="' + esc(n) + '">' + esc(n) + ' <i aria-hidden="true">×</i></button>'; }).join('') + '</div>' : '')
              + (cfg.custom ? '<p class="fn-cr__h">' + esc(w2('cust_note')) + '</p><input class="fn-md__in" type="text" maxlength="160" data-cr-note placeholder="' + esc(w2('cust_ph')) + '" value="' + esc(dr.note) + '">' : '') + '</div>';
          } else center = '<div class="fn-cr__c"><p class="fn-ct__none">' + esc(w2('cat_none')) + '</p></div>';
          box.innerHTML = '<button class="fn-md__x" type="button" data-md-close aria-label="' + esc(w2('close_x')) + '">&times;</button><h3 class="fn-cr__t">' + esc(cfg.title) + '</h3><p class="fn-cr__s">' + esc(cfg.sub || '') + '</p><div class="fn-cr__tabs" role="tablist">' + tabsH + '</div>'
            + '<div class="fn-cr__stage" data-cr-stage><button type="button" class="fn-cr__a fn-cr__a--l" data-cr-go="prev" aria-label="‹"' + (idx <= 0 ? ' disabled' : '') + '>&lsaquo;</button>' + small(items[idx - 1], 'prev') + center + small(items[idx + 1], 'next') + '<button type="button" class="fn-cr__a fn-cr__a--r" data-cr-go="next" aria-label="›"' + (idx >= items.length - 1 ? ' disabled' : '') + '>&rsaquo;</button></div>'
            + '<button class="fn-md__go" type="button" data-cr-ok' + (it ? '' : ' disabled') + '>' + esc(cfg.ok) + '</button>' + (cfg.none ? '<button class="fn-md__cancel" type="button" data-cr-none>' + esc(cfg.none) + '</button>' : '') + '<button class="fn-md__cancel" type="button" data-md-close>' + esc(w2('cust_cancel')) + '</button>';
        };
        box.onclick = function (e) {
          var t = e.target; if (!t.closest) return; var items = curTab().items;
          var tb = t.closest('[data-cr-tab]'); if (tb) { tab = tb.getAttribute('data-cr-tab'); idx = 0; place(); paint(); return; }
          var go = t.closest('[data-cr-go]'); if (go) { var dir = go.getAttribute('data-cr-go'); idx += dir === 'next' ? 1 : -1; paint(); return; }
          var ing = t.closest('[data-cr-ing]'); if (ing) { var d0 = draftOf(items[idx]), n = ing.getAttribute('data-cr-ing'), k = d0.off.indexOf(n); if (k > -1) d0.off.splice(k, 1); else d0.off.push(n); ing.classList.toggle('is-off', k < 0); return; }
          if (t.closest('[data-cr-sheet]')) { var it0 = items[idx]; if (it0 && it0.d) { mdShow(mdCr, false); var mb = $('.fn-dish__media', it0.d); if (mb) mb.click(); } return; }
          if (t.closest('[data-cr-none]')) { mdShow(mdCr, false); if (cfg.onNone) cfg.onNone(); return; }
          if (t.closest('[data-cr-ok]')) { var it1 = items[idx]; if (!it1) return; var dd = draftOf(it1), nf = $('[data-cr-note]', box); if (nf) dd.note = (nf.value || '').trim(); mdShow(mdCr, false); cfg.onOk(it1, dd, tab); }
        };
        box.oninput = function (e) { var nf = e.target.closest && e.target.closest('[data-cr-note]'); if (nf) { var it2 = curTab().items[idx]; if (it2) draftOf(it2).note = nf.value; } };
        // swipe the plates on a phone
        var sx = null; box.onpointerdown = function (e) { if (e.target.closest && e.target.closest('input,button')) return; sx = e.clientX; };
        box.onpointerup = function (e) { if (sx === null) return; var dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 40) { idx += dx < 0 ? 1 : -1; paint(); } };
        crKey = function (e) { if (mdCr.hidden) return; if (e.key === 'ArrowRight') { idx++; paint(); } if (e.key === 'ArrowLeft') { idx--; paint(); } };
        paint(); mdShow(mdCr, true);
      };
      document.addEventListener('keydown', function (e) { if (crKey) crKey(e); });
      var openDishPicker = function () {
        var group = st.view, all = dishes.filter(function (d) { return inGroup(d, group) && eligible(d) && !d.classList.contains('is-blocked'); }), tiers = ['selecto', 'exclusivo', 'signature', 'reserve'];
        var weekend = !!st.tgt, second = !weekend && st.course === 1, day = st.active, k = weekend ? +st.tgt.slice(2) : 0;
        var cur = weekend ? st.we[k].pid : (second ? st.days2[day] : st.days[day]);
        var tabs = tiers.map(function (t, n) { return { id: t, label: (tierNames[n] || t) + (n && !weekend ? ' +' + money(upg(n)) : ''), items: all.filter(function (d) { return tierOf(d) === t; }).map(itemOf) }; });
        openCr({ title: w2('pk_t'), sub: tgtLabel() + ' • ' + catName(group), tabs: tabs, tab: st.vtier, sel: cur, custom: !weekend && !second, ok: w2('pk_ok'),
          price: function (it) { return weekend ? money(dishPrice(it.d)) : (rank(it.tier) ? '+' + money(upg(rank(it.tier))) : ''); },
          draftFor: function (it) { var m = !weekend && !second && st.days[day] === it.pid ? modsOf(day) : null; return { off: m ? (m.off || []).slice() : [], note: m ? m.note || '' : '' }; },
          onOk: function (it, dr, tabId) { st.vtier = tabId; var dayAt = day; assignDish(it.pid); if (!weekend && !second && (dr.off.length || dr.note)) { st.mods[dayAt] = { off: dr.off.slice(), note: dr.note }; persist(); render(); } } });
      };
      var openComp = function (i) {
        var KIND_RE = { ensalada: /ensalada|salad/i, sopa: /sopa|crema|caldo|soup|bisque/i, postre: /postre|brownie|pastel|galleta|dessert|helado/i };
        var pool = dishes.filter(function (d) { return !d.classList.contains('is-blocked') && (inGroup(d, 'entradas') || inGroup(d, 'snacks-postres')); });
        var tabs = COMPS.map(function (kd) { var its = pool.filter(function (d) { return KIND_RE[kd].test(lab(d)) || KIND_RE[kd].test(d.getAttribute('data-title') || ''); }).map(itemOf); if (!its.length) its = [{ pid: '', title: compName(kd), src: '', k: 0, p: 0, ings: [], synth: true, kind: kd }]; its.forEach(function (x) { x.kind = kd; }); return { id: kd, label: compName(kd), items: its }; });
        openCr({ title: w2('comp_t'), sub: dayLabel(i).split(' ')[0] + ' • ' + (st.days[i] && byPid(st.days[i]) ? lab(byPid(st.days[i])) : ''), tabs: tabs, tab: st.comp[i] || '', sel: st.compPid[i] || '', custom: true, ok: w2('comp_ok'), none: w2('comp_none'),
          draftFor: function (it) { var m = st.compPid[i] === it.pid && st.compMods[i] ? st.compMods[i] : null; return { off: m ? (m.off || []).slice() : [], note: m ? m.note || '' : '' }; },
          onNone: function () { st.comp[i] = ''; st.compPid[i] = ''; st.compMods[i] = { off: [], note: '' }; persist(); render(); },
          onOk: function (it, dr) { st.comp[i] = it.kind; st.compPid[i] = it.pid || ''; st.compMods[i] = { off: dr.off.slice(), note: dr.note }; persist(); render(); } });
      };
      var openCompOld = function (i) {
        mdComp = mdComp || mkModal('fn-md--comp'); var box = $('[data-md-box]', mdComp), ck = st.comp[i];
        box.innerHTML = '<button class="fn-md__x" type="button" data-md-close aria-label="' + esc(w2('close_x')) + '">&times;</button><h3>' + esc(w2('comp_t')) + '</h3><p class="fn-md__s">' + esc(w2('comp_s')) + '</p><div class="fn-md__opts">'
          + COMPS.map(function (k) { return '<button type="button" class="fn-md__opt' + (ck === k ? ' is-on' : '') + '" data-comp="' + k + '"><b>' + esc(compName(k)) + '</b><small>' + esc(money(0)) + '</small></button>'; }).join('')
          + '<button type="button" class="fn-md__opt fn-md__opt--none' + (!ck ? ' is-on' : '') + '" data-comp=""><b>' + esc(w2('comp_none')) + '</b></button></div>';
        box.onclick = function (e) { var b = e.target.closest && e.target.closest('[data-comp]'); if (!b) return; st.comp[i] = b.getAttribute('data-comp'); mdShow(mdComp, false); persist(); render(); };
        mdShow(mdComp, true);
      };
      /* tally summary: every day, the level breakdown, weekend dishes and extra snacks, then the final confirmation */
      var sumXOpen = false;
      var dayLine = function (i) {
        var d = st.days[i] && byPid(st.days[i]); if (!d) return '';
        var parts = [esc(catName(grpOfDish(d))) + ' • ' + esc(lab(d)) + ' <em>[' + esc(tierNames[rank(tierOf(d))] || '') + (rank(tierOf(d)) ? ' +' + esc(money(upg(rank(tierOf(d))))) : '') + ']</em>'];
        var d2 = st.days2[i] && byPid(st.days2[i]); if (d2) parts.push('+ ' + esc(lab(d2)) + ' <em>[' + esc(tierNames[rank(tierOf(d2))] || '') + ']</em>');
        if (st.comp[i]) parts.push('+ ' + esc(compName(st.comp[i], i)));
        var mt = modsText(i); if (mt) parts.push('<span class="fn-sm__mod">✎ ' + esc(mt) + '</span>');
        var im = $('img', d), src = im ? (im.currentSrc || im.src) : '';
        return '<li class="fn-sm__day"><h5>' + esc(dayLabel(i).split(' ')[0]) + '</h5><div><span class="fn-sm__ph" style="background-image:url(&quot;' + esc(src) + '&quot;)"></span><p>' + parts.join(' ') + '</p></div></li>';
      };
      // micronutrients: daily average of the weekday plates against the daily reference value (only the ones the dish sheets include)
      var MICRO = [['fi', 'mi_fi', 'g', 28, 1], ['su', 'mi_su', 'g', 50, 1], ['so', 'mi_so', 'mg', 2300, 0], ['ca', 'mi_ca', 'mg', 1000, 0], ['fe', 'mi_fe', 'mg', 18, 1], ['k2', 'mi_k', 'mg', 3500, 0], ['mg', 'mi_mg', 'mg', 400, 0], ['vc', 'mi_vc', 'mg', 90, 1], ['va', 'mi_va', 'mcg', 900, 0]];
      var microHtml = function (tot, we, nd) {
        var rowsM = MICRO.map(function (m) { var v = nd ? (tot[m[0]] - we[m[0]]) / nd : 0; return v > 0 ? { n: w2(m[1]), v: v, u: m[2], vd: Math.round(v / m[3] * 100), dec: m[4] } : null; }).filter(Boolean);
        if (!rowsM.length) return '<p class="fn-sm__fine">' + esc(w2('micro_none')) + '</p>';
        return '<div class="fn-sm__micro"><h5>' + esc(w2('micro_t')) + ' · ' + esc(w2('micro_vd')) + '</h5><ul>' + rowsM.map(function (r) { return '<li><span>' + esc(r.n) + '</span><b>' + (r.dec ? r.v.toFixed(1) : Math.round(r.v)) + ' ' + r.u + '</b><i class="fn-sm__vd"><u style="width:' + Math.min(100, r.vd) + '%"></u></i><em>' + r.vd + '%</em></li>'; }).join('') + '</ul></div>';
      };
      var nutriHtml = function () {
        var rows = [], T0 = { k: 0, p: 0, c: 0, f: 0, fi: 0, su: 0, so: 0, ca: 0, fe: 0, k2: 0, mg: 0, vc: 0, va: 0 }, tot = Object.assign({}, T0), nd = 0, have = { fi: false, su: false, so: false };
        var add = function (a, m) { Object.keys(T0).forEach(function (k) { a[k] += m[k] || 0; }); };
        var lbl = function (x) { return Math.round(x).toLocaleString(cfg.lang === 'en' ? 'en-US' : 'es-MX'); };
        for (var i = 0; i < MEALS; i++) { var row = Object.assign({}, T0), n = 0; [st.days[i], st.days2[i]].forEach(function (p) { var m = p && macroOf(p); if (m) { add(row, m); n++; } }); if (n) { rows.push({ n: dayLabel(i).split(' ')[0], r: row }); add(tot, row); nd++; } }
        var we = Object.assign({}, T0), wn = 0; st.we.forEach(function (w) { var m = w.on && w.pid && macroOf(w.pid); if (m) { add(we, m); wn++; } });
        if (wn) { rows.push({ n: w2('nut_we'), r: we }); add(tot, we); }
        if (!rows.length) return '';
        rows.forEach(function (x) { ['fi', 'su', 'so'].forEach(function (k) { if (x.r[k] > 0) have[k] = true; }); });
        var cols = [['k', 'kcal'], ['p', w2('nut_p') + ' g'], ['c', w2('nut_c') + ' g'], ['f', w2('nut_f') + ' g']].concat(have.fi ? [['fi', w2('nut_fiber')]] : [], have.su ? [['su', w2('nut_sugar')]] : [], have.so ? [['so', w2('nut_sodium')]] : []);
        var cell = function (x, k) { return '<td>' + lbl(x[k]) + '</td>'; };
        var body = rows.map(function (x) { return '<tr><th>' + esc(x.n) + '</th>' + cols.map(function (c) { return cell(x.r, c[0]); }).join('') + '</tr>'; }).join('');
        var avg = {}; Object.keys(T0).forEach(function (k) { avg[k] = nd ? (tot[k] - we[k]) / nd : 0; });
        var kP = tot.p * 4, kC = tot.c * 4, kF = tot.f * 9, kS = (kP + kC + kF) || 1, pc = function (v) { return Math.round(v / kS * 100); };
        return '<section class="fn-sm__nut"><h4>' + esc(w2('nut_t')) + '</h4><div class="fn-sm__tw"><table><thead><tr><th>' + esc(w2('nut_day')) + '</th>' + cols.map(function (c) { return '<th>' + esc(c[1]) + '</th>'; }).join('') + '</tr></thead><tbody>' + body
          + '</tbody><tfoot><tr><th>' + esc(w2('nut_avg')) + '</th>' + cols.map(function (c) { return cell(avg, c[0]); }).join('') + '</tr><tr class="is-total"><th>' + esc(w2('nut_total')) + '</th>' + cols.map(function (c) { return cell(tot, c[0]); }).join('') + '</tr></tfoot></table></div>'
          + '<p class="fn-sm__split"><b>' + esc(w2('nut_split')) + '</b><i class="fn-sm__bar"><u style="width:' + pc(kP) + '%"></u><u style="width:' + pc(kC) + '%"></u><u style="width:' + pc(kF) + '%"></u></i><span>' + esc(w2('nut_p')) + ' ' + pc(kP) + '% · ' + esc(w2('nut_c')) + ' ' + pc(kC) + '% · ' + esc(w2('nut_f')) + ' ' + pc(kF) + '%</span></p>'
          + microHtml(tot, we, nd)
          + '<p class="fn-sm__fine">' + esc(w2('nut_note')) + (have.fi || have.su || have.so ? '' : ' ' + esc(w2('nut_micro'))) + '</p></section>';
      };
      var openSum = function () {
        ensureV2(); mdSum = mdSum || mkModal('fn-md--sum'); var box = $('[data-md-box]', mdSum);
        var n = count(), lines = [], dh = '';
        for (var i = 0; i < MEALS; i++) dh += dayLine(i);
        var wen = 0;
        st.we.forEach(function (w, k) { var d = w.on && w.pid && byPid(w.pid); if (!d) return; wen++; var im = $('img', d), src = im ? (im.currentSrc || im.src) : ''; dh += '<li class="fn-sm__day fn-sm__day--we"><h5>' + esc(weNames[k]) + ' <small>[' + esc(w2('we_deliv')) + ']</small></h5><div><span class="fn-sm__ph" style="background-image:url(&quot;' + esc(src) + '&quot;)"></span><p>' + esc(lab(d)) + ' <em>[' + esc(w2('we_extra')) + ' ' + esc(money(dishPrice(d))) + ']</em></p></div></li>'; });
        var base = priceOf(tierEl(), st.plan), wk = st.plan === 'block' ? Math.round(base / WEEKS) : base;
        lines.push('<li><span>' + esc(st.plan === 'block' ? w2('sm_plan_block') : w2('sm_plan_week')) + (st.plan === 'block' ? ' <small>(' + esc(money(wk)) + ')</small>' : '') + '</span><b>' + esc(money(base)) + '</b></li>');
        lines.push('<li class="is-sub"><span>' + esc(w2('sm_week')) + ': ' + n + ' / ' + MEALS + '</span><b>' + esc(w2('sm_inc')) + '</b></li>');
        for (var lv = 1; lv <= 3; lv++) { var c = 0; for (var q = 0; q < MEALS; q++) if (dayLevel(q) === lv) c++; if (c) lines.push('<li><span>' + c + '× ' + esc(tierNames[lv] || '') + ' <small>(+' + esc(money(upg(lv))) + ')</small></span><b>' + esc(money(c * upg(lv))) + '</b></li>'); }
        lines.push('<li class="is-sub"><span>' + esc(w2('sm_comp')) + '</span><b>' + esc(money(0)) + '</b></li>');
        st.we.forEach(function (w, k) { var d = w.on && w.pid && byPid(w.pid); if (d) lines.push('<li><span>' + esc(weNames[k]) + ' · ' + esc(lab(d)) + '</span><b>' + esc(money(dishPrice(d))) + '</b></li>'); });
        var xh = st.xt.map(function (p, k) { var d = byPid(p); return d ? '<li><span>1× ' + esc(lab(d)) + '</span><b>' + esc(money(dishPrice(d))) + '</b><button type="button" data-sm-xdel="' + k + '" aria-label="' + esc(w2('sm_remove')) + '">×</button></li>' : ''; }).join('');
        var snacks = dishes.filter(function (d) { return inGroup(d, 'snacks-postres') && !d.classList.contains('is-blocked'); });
        var pickX = sumXOpen ? '<div class="fn-sm__xpick">' + (snacks.length ? '' : '<p class="fn-ct__none">' + esc(w2('cat_none')) + '</p>') + snacks.map(function (d) { var im = $('img', d), src = im ? (im.currentSrc || im.src) : ''; return '<button type="button" data-sm-xadd="' + d.getAttribute('data-pid') + '"><span style="background-image:url(&quot;' + esc(src) + '&quot;)"></span><b>' + esc(lab(d)) + '</b><small>' + esc(money(dishPrice(d))) + '</small></button>'; }).join('') + '</div>' : '';
        box.innerHTML = '<button class="fn-sm__back" type="button" data-md-close>&lsaquo; ' + esc(w2('sm_back')) + '</button><header class="fn-sm__head"><h3>' + esc(w2('sm_t')) + '</h3><p>' + esc(w2('sm_s')) + '</p></header>'
          + '<div class="fn-sm__grid"><section class="fn-sm__days"><h4>' + esc(w2('sm_detail', { n: n + wen })) + '</h4><ul>' + dh + '</ul>' + nutriHtml() + '</section>'
          + '<aside class="fn-sm__break"><h4>' + esc(w2('sm_break')) + '</h4><ul class="fn-sm__lines">' + lines.join('') + '</ul>'
          + '<h5>' + esc(w2('sm_x')) + '</h5><ul class="fn-sm__lines fn-sm__lines--x">' + (xh || '<li class="is-sub"><span>' + esc(w2('sm_none')) + '</span></li>') + '</ul>'
          + '<button class="fn-sm__xadd" type="button" data-sm-xtoggle>' + esc(w2('sm_xadd')) + '</button>' + pickX
          + '<p class="fn-sm__close"><span>' + esc(w2('sm_close')) + '</span><b>' + esc(cutText()) + '</b></p>'
          + '<p class="fn-sm__total"><span>' + esc(w2('sm_total')) + '</span><b>' + esc(money(grandTotal())) + '</b></p>'
          + '<button class="fn-md__go fn-sm__go" type="button" data-sm-go>' + esc(w2('sm_confirm')) + '</button></aside></div>';
        box.onclick = function (e) {
          var t = e.target; if (!t.closest) return;
          var xa = t.closest('[data-sm-xadd]'); if (xa) { st.xt.push(xa.getAttribute('data-sm-xadd')); persist(); render(); openSum(); return; }
          var xd = t.closest('[data-sm-xdel]'); if (xd) { st.xt.splice(+xd.getAttribute('data-sm-xdel'), 1); persist(); render(); openSum(); return; }
          if (t.closest('[data-sm-xtoggle]')) { sumXOpen = !sumXOpen; openSum(); return; }
          if (t.closest('[data-sm-go]')) { mdShow(mdSum, false); var nb = $('[data-fn-finish]', holder); if (nb) { nb.setAttribute('data-sm-ok', '1'); nb.click(); } }
        };
        mdShow(mdSum, true);
      };
      // the main button of the week step first shows the tally; its own confirm button then places the order
      holder.addEventListener('click', function (e) {
        var nb = e.target.closest && e.target.closest('[data-fn-finish]');
        if (!nb || st.step !== 3 || holder.classList.contains('is-gated')) return;
        if (nb.getAttribute('data-sm-ok')) { nb.removeAttribute('data-sm-ok'); return; }
        e.preventDefault(); e.stopImmediatePropagation(); if (count() < 1) { say(T_('need-meals')); return; } sumXOpen = false; openSum();
      }, true);
      holder.addEventListener('click', function (e) {
        var t = e.target; if (!t || !t.closest) return;
        var gb = t.closest('[data-bd-grp]');
        if (gb) { var gi = gb.getAttribute('data-bd-grp'); $$('[data-bd-gmenu]', holder).forEach(function (m) { var open = m.getAttribute('data-bd-gmenu') === gi && m.hidden; m.hidden = !open; }); gb.setAttribute('aria-expanded', 'true'); return; }
        var gp = t.closest('[data-bd-gpick]');
        if (gp) { var gv = gp.getAttribute('data-bd-gpick').split(':'); st.tgt = ''; st.course = 0; st.active = +gv[0]; st.view = gv[1]; st.viewFor = st.cat; st.vtier = 'selecto'; persist(); render(); var ctg = $('[data-fn-ct]', holder); if (ctg && ctg.scrollIntoView) ctg.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'nearest' }); return; }
        var v = t.closest('[data-bd-view]'); if (v) { st.view = v.getAttribute('data-bd-view'); st.vtier = st.vtier || 'selecto'; var mn = $('[data-bd-menu]', holder); if (mn) mn.hidden = true; persist(); render(); return; }
        var mo = t.closest('[data-bd-more]'); if (mo) { var mn2 = $('[data-bd-menu]', holder); if (mn2) { mn2.hidden = !mn2.hidden; mo.setAttribute('aria-expanded', mn2.hidden ? 'false' : 'true'); } return; }
        var tt = t.closest('[data-ct-tier]'); if (tt) { st.vtier = tt.getAttribute('data-ct-tier'); persist(); render(); return; }
        var cp = t.closest('[data-ct-pick]'); if (cp) { assignDish(cp.getAttribute('data-ct-pick')); return; }
        var fo = t.closest('[data-bd-focus]');
        if (fo) { var kk = fo.getAttribute('data-bd-focus'); if (/^we/.test(kk)) { st.tgt = kk; } else { var pp = kk.split(':'); st.tgt = ''; st.active = +pp[0]; st.course = +pp[1] === 1 ? 1 : 0; } persist(); render(); openDishPicker(); return; }
        var ub = t.closest('[data-bd-up]');
        if (ub) { var u2 = ub.getAttribute('data-bd-up').split(':'), ui = +u2[0], uc = +u2[1], cd = byPid(uc ? st.days2[ui] : st.days[ui]), nx = ['exclusivo', 'signature', 'reserve'][Math.min(2, rank(tierOf(cd)))]; st.tgt = ''; st.active = ui; st.course = uc; st.vtier = nx; st.view = cd ? (grpOfDish(cd) || st.view) : st.view; persist(); render(); openDishPicker(); return; }
        var cu = t.closest('[data-bd-cust]'); if (cu) { st.active = +cu.getAttribute('data-bd-cust'); openCust(st.active); return; }
        var cm = t.closest('[data-bd-comp]'); if (cm) { openComp(+cm.getAttribute('data-bd-comp')); return; }
        var a2 = t.closest('[data-bd-add2]'); if (a2) { st.tgt = ''; st.active = +a2.getAttribute('data-bd-add2'); st.course = 1; persist(); render(); openDishPicker(); return; }
        var wo = t.closest('[data-we-on]'); if (wo) { var wk = +wo.getAttribute('data-we-on'); st.we[wk].on = true; st.tgt = 'we' + wk; persist(); render(); openDishPicker(); return; }
        var wf = t.closest('[data-we-off]'); if (wf) { var wk2 = +wf.getAttribute('data-we-off'); st.we[wk2] = { on: false, pid: '' }; if (st.tgt === 'we' + wk2) st.tgt = ''; persist(); render(); return; }
        var cardEl = t.closest('.fn-wk__card'); if (cardEl && !t.closest('button')) { st.tgt = ''; st.course = 0; st.active = +cardEl.getAttribute('data-day'); persist(); render(); return; }
        var weEl = t.closest('.fn-we.is-on'); if (weEl && !t.closest('button')) { st.tgt = 'we' + weEl.getAttribute('data-we'); persist(); render(); }
      });
      document.addEventListener('click', function (e) { if (!(e.target.closest && e.target.closest('[data-bd-grp],[data-bd-gmenu]'))) $$('[data-bd-gmenu]', holder).forEach(function (m) { m.hidden = true; }); var mn3 = $('[data-bd-menu]', holder); if (mn3 && !mn3.hidden && !(e.target.closest && e.target.closest('[data-bd-menu],[data-bd-more]'))) mn3.hidden = true; });
      var reset = $('[data-fn-reset]', holder);
      if (reset) reset.addEventListener('click', function () { st.qty = {}; st.days = blankDays(); st.days2 = blankDays(); st.course = 0; st.active = 0; if (daysBox) daysBox.removeAttribute('data-built'); st.cat = 'all'; st.diet = 'all'; st.tier = 'selecto'; st.plan = 'block'; st.step = 0; st.comp = null; st.we = null; st.xt = []; st.tgt = ''; persist(); render(); });

      // details
      var fields = $$('[data-info]', holder), checks = $$('[data-allergy]', holder), ref = $('[data-fn-ref]', holder);
      fields.forEach(function (f) { f.value = (st.info && st.info[f.getAttribute('data-info')]) || ''; f.addEventListener('input', function () { st.info = st.info || {}; st.info[f.getAttribute('data-info')] = f.value; persist(); }); });
      checks.forEach(function (c) { c.checked = (st.allergies || []).map(norm).indexOf(norm(c.value)) > -1; c.addEventListener('change', function () { st.allergies = checks.filter(function (x) { return x.checked; }).map(function (x) { return x.value; }); persist(); }); });
      var cn = holder.getAttribute('data-customer-name'), ce = holder.getAttribute('data-customer-email');
      if (ce) { st.info = st.info || {}; if (!st.info.email) st.info.email = ce; if (!st.info.name && cn) st.info.name = cn; fields.forEach(function (f) { var v = st.info[f.getAttribute('data-info')]; if (v && !f.value) f.value = v; }); }
      // asked once at onboarding: show a summary instead of the form
      var fbox = $('[data-fn-fields]', holder), fsum = $('[data-fn-saved]', holder), have = false;
      try { have = !!localStorage.getItem(ONB_KEY); } catch (e) {}
      if (have && fbox && fsum && st.info && st.info.name && st.info.email && st.info.phone) {
        fbox.hidden = true; fsum.hidden = false; var ft = $('[data-fn-saved-text]', fsum);
        if (ft) ft.textContent = [st.info.name, st.info.email, st.info.phone, [st.info.street, st.info.cluster, st.info.zip].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
      }
      if (ref) { var rs = ''; try { rs = localStorage.getItem('kulinaria_ref') || ''; } catch (e) {} if (rs) ref.value = rs; }

      if (next) next.addEventListener('click', function () {
        if (st.step === 1 && !st.catPicked) { say(T_('locked')); return; }
        if (st.step === 1) st.planChosen = true;
        if (st.step === 1) {                                                  // diet + plan chosen: open the week with a ready-made menu for that diet
          if (st.presetCat !== st.cat || !st.days.some(Boolean)) { var ps = buildPresetSets(); st.presetCat = st.cat; applyPreset(ps[0] || []); return; }
          setReach(3); go(3); return;
        }
        setReach(st.step + 1); go(st.step + 1);
      });
      if (prev) prev.addEventListener('click', function () { go(st.step === 3 ? 1 : st.step - 1); });
      dots.forEach(function (d, k) { d.setAttribute('role', 'button'); d.tabIndex = 0; d.addEventListener('click', function () { go(k); }); d.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(k); } }); });

      // arriving from a dish page (…/pedido?dish=handle): that dish is already in the plan, at its tier
      try {
        var q = (location.search + '&' + (location.hash.split('?')[1] || '')).match(/[?&]dish=([\w-]+)/);
        if (q) {
          var pre = dishes.filter(function (d) { return d.getAttribute('data-handle') === q[1]; })[0];
          if (pre) { st.days = blankDays(); st.days2 = blankDays(); st.course = 0; st.days[0] = pre.getAttribute('data-pid'); st.active = 1; if (daysBox) daysBox.removeAttribute('data-built'); if (st.reach >= 3) st.step = 3; persist(); }
        }
      } catch (e) {}

      // finish: the details live in the account (onboarding). Here we only need a signed-in, onboarded customer; then the PLAN goes in the cart.
      if (finish) finish.addEventListener('click', function (e) {
        e.preventDefault();
        if (count() < 1) { say(T_('need-meals')); go(3); return; }
        persist();
        var lnk = function (sel) { var a = $(sel, holder); return a && a.getAttribute('href'); };
        var onb = false; try { onb = !!localStorage.getItem(ONB_KEY); } catch (x) {}
        var i = st.info || {}, tb = tierEl();
        var guest = !ce;   // signed out: the order is built and put in the cart, then sign-in brings the visitor back to the cart
        if (!guest && ordersCount() === 0 && (!onb || !i.name || !i.email || !i.phone)) { window.location.href = lnk('[data-fn-onb]') || '/pages/bienvenida'; return; }
        i = { name: i.name || cn || '', email: i.email || ce || '', phone: i.phone || '', street: i.street, cluster: i.cluster, zip: i.zip, allergy_other: i.allergy_other, dislikes: i.dislikes };
        var p = effectiveProfile(), warned = [], paraName = p.name || '', paraId = st.para || 'yo';
        st.days.concat(st.days2).forEach(function (pid) { var d = byPid(pid), t = d && d.getAttribute('data-title'); if (d && d.classList.contains('is-warned') && warned.indexOf(t) < 0) warned.push(t); });
        var list = dishes.filter(function (d) { return st.qty[d.getAttribute('data-pid')]; }).map(function (d) { return st.qty[d.getAttribute('data-pid')] + '× ' + d.getAttribute('data-title'); }).join(' | ');
        var cl = function (k) { return (i[k] || '').trim(); };
        var attrs = {
          nombre: i.name, correo: i.email, telefono: i.phone, direccion: [i.street, i.num, i.cluster, i.city, i.zip].filter(Boolean).join(', ') + (i.refs ? ' · ' + i.refs : '') + (i.access ? ' · ' + i.access : ''), calle: cl('street'), cluster: cl('cluster'), cp: cl('zip'),
          dias: st.days.map(function (q, k) { var d = byPid(q), d2 = byPid(st.days2[k]); return (dayNames[k] || k + 1) + ': ' + (d ? d.getAttribute('data-title') : '') + (d && d2 ? ' + ' + d2.getAttribute('data-title') : ''); }).join(' | '),
          alergias: (p.allergies || []).join(', '), no_me_gustan: (p.dislikes || []).join(', '), dietas: (p.diets || []).join(', '), alerta_alergias: warned.join(' | '),
          plan: st.plan, nivel: st.tier, pedido_embudo: list
        };
        // what the kitchen must know beyond the allergen list (from the questionnaire): severity, traces, health conditions, spice, portion, household, delivery window
        var ficha = [i.severity && 'Severidad: ' + i.severity, i.cross && 'Trazas: ' + i.cross, i.conditions && 'Condiciones: ' + i.conditions, i.spice && 'Picante: ' + i.spice, i.portion && 'Porción: ' + i.portion, (i.adults || i.kids) && 'Personas: ' + (i.adults || 1) + ' adultos + ' + (i.kids || 0) + ' niños', i.window && 'Horario: ' + i.window, i.goal && 'Objetivo: ' + i.goal + (i.kcal ? ' ' + i.kcal + ' kcal' : '')].filter(Boolean).join(' · ');
        if (ficha) attrs.ficha_cocina = ficha;
        var rc = ''; try { rc = localStorage.getItem('kulinaria_ref') || ''; } catch (x) {} if (rc) attrs.codigo_referencia = rc;
        var props = {}; props[T_('prop-meals')] = String(count()); props[T_('prop-tier')] = tb.getAttribute('data-name'); props[T_('prop-length')] = st.plan === 'block' ? T_('length-block') : T_('length-week');
        st.days.forEach(function (q, k) { var dd = byPid(q), d2c = byPid(st.days2[k]); if (dd) props[dayLabel(k)] = dd.getAttribute('data-title') + (d2c ? ' + ' + d2c.getAttribute('data-title') : ''); });
        props['_platillos'] = list; props['_para'] = paraId; if (paraName) { props[T_('prop-for') || 'Para'] = paraName; props['_para_nombre'] = paraName; }
        var notesAll = st.days.map(function (q, k) { var tx = q ? modsText(k) : ''; return tx ? dayLabel(k) + ': ' + tx : ''; }).filter(Boolean).join(' | '); if (notesAll) { props[T_('prop-notes')] = notesAll; props['_notas'] = notesAll; }
        props['_dias'] = attrs.dias; props['_alergias'] = attrs.alergias || '-'; props['_no_me_gustan'] = attrs.no_me_gustan || '-'; props['_dietas'] = attrs.dietas || '-'; props['_alerta'] = attrs.alerta_alergias || '-';
        var line = { id: parseInt(tb.getAttribute(st.plan === 'block' ? 'data-variant-block' : 'data-variant-week'), 10), quantity: 1, properties: props };
        var sp = tb.getAttribute('data-selling-plan'); if (st.plan === 'block' && st.renew && sp) line.selling_plan = parseInt(sp, 10);
        var lines = [line];
        ensureV2();
        var compTxt = st.comp.map(function (ck, k) { return ck ? dayLabel(k).split(' ')[0] + ': ' + compName(ck, k) + (st.compMods[k] && (st.compMods[k].off.length || st.compMods[k].note) ? ' (' + (st.compMods[k].off.map(function (x) { return 'sin ' + x; }).concat(st.compMods[k].note ? [st.compMods[k].note] : [])).join(', ') + ')' : '') : ''; }).filter(Boolean).join(' | '); if (compTxt) { props[w2('sm_comp').split(' (')[0]] = compTxt; props['_complementos'] = compTxt; }
        st.we.forEach(function (w, k) {
          var dd = w.on && w.pid && byPid(w.pid), vid = dd && parseInt(dd.getAttribute('data-vid'), 10); if (!dd || !vid) return;
          var pr = {}; pr[weNames[k] + ' (' + w2('we_deliv') + ')'] = dd.getAttribute('data-title'); pr['_extra'] = 'fin-de-semana'; pr['_para'] = paraId; lines.push({ id: vid, quantity: 1, properties: pr });
          props[weNames[k]] = dd.getAttribute('data-title') + ' (' + w2('we_extra') + ')';
        });
        var xc = {}; st.xt.forEach(function (p) { xc[p] = (xc[p] || 0) + 1; });
        Object.keys(xc).forEach(function (p) { var dd = byPid(p), vid = dd && parseInt(dd.getAttribute('data-vid'), 10); if (!dd || !vid) return; var pr = { '_extra': 'snack', '_para': paraId }; lines.push({ id: vid, quantity: xc[p], properties: pr }); });
        var xl = []; st.we.forEach(function (w) { var dd = w.on && w.pid && byPid(w.pid); if (dd) xl.push('1× ' + dd.getAttribute('data-title')); }); Object.keys(xc).forEach(function (p) { var dd = byPid(p); if (dd) xl.push(xc[p] + '× ' + dd.getAttribute('data-title')); });
        if (xl.length) { props['_platillos'] = (props['_platillos'] ? props['_platillos'] + ' | ' : '') + xl.join(' | '); props['_extras'] = xl.join(' | '); }
        for (var lvl = 1; lvl <= 3; lvl++) {
          var names = []; st.days.forEach(function (q, k) { if (dayLevel(k) !== lvl) return; var c1 = byPid(q), c2 = byPid(st.days2[k]), top = (c1 && levelOf(c1) === lvl) ? c1 : c2; if (top) names.push(top.getAttribute('data-title')); });
          var vid = parseInt(holder.getAttribute('data-upv-' + lvl), 10);
          if (names.length && vid) { var up = {}; up[T_('prop-upgrade')] = names.join(', '); up['_para'] = paraId; lines.push({ id: vid, quantity: names.length, properties: up }); }
        }
        st.sent = true; persist();
        try { localStorage.setItem(lastKey(), JSON.stringify({ plan: st.plan, days: st.days, mods: st.mods, at: Date.now() })); } catch (x) {}
        var go2 = function () { window.location.href = guest ? (lnk('[data-fn-login]') || '/pages/bienvenida').replace(/(return_url|return_to)=[^&]*/g, '$1=' + encodeURIComponent(finish.getAttribute('href') || '/cart')) : finish.getAttribute('href'); };
        // the cart can hold one plan per person: this person's earlier plan is replaced, the others stay
        fetch('/cart.js', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).catch(function () { return { items: [] }; })
          .then(function (c) { var upd = {}; ((c && c.items) || []).forEach(function (it) { var pr = it.properties || {}; if (pr._para === undefined || pr._para === paraId) upd[it.key] = 0; }); return fetch('/cart/update.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates: upd, attributes: attrs }) }); })
          .then(function () { return fetch('/cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: lines }) }); })
          .then(go2, go2);
      });

      // customers who already have a plan see their balance here; everyone else just sees the plans (the plan cards ARE the purchase of credits)
      if (ce) loadCredits(function (c) {
        var ret = $('[data-fn-returning]', holder);
        if (ret && c && c.hasPlan && c.weeksLeft > 0) {
          var endsR = ''; try { var pr = String(c.endsOn).split('-'); endsR = new Intl.DateTimeFormat(cfg.lang === 'en' ? 'en-US' : 'es-MX', { timeZone: TZ, day: 'numeric', month: 'short' }).format(new Date(+pr[0], +pr[1] - 1, +pr[2], 12)); } catch (e) {}
          var rtxt = $('[data-fn-returning-text]', ret); if (rtxt) rtxt.textContent = fill(T_('credit'), { w: c.weeksLeft, t: c.weeksTotal, e: endsR }).split('. ')[0] + '.';
          var asked = false; try { asked = !!sessionStorage.getItem('kx_newplan'); } catch (e) {}
          if (!asked) { ret.hidden = false; holder.classList.add('is-returning'); }
        }
        var box = $('[data-fn-credit]', holder); if (!box || !c || !c.hasPlan) return;
        var ends = ''; try { var p = String(c.endsOn).split('-'); ends = new Intl.DateTimeFormat(cfg.lang === 'en' ? 'en-US' : 'es-MX', { timeZone: TZ, day: 'numeric', month: 'short' }).format(new Date(+p[0], +p[1] - 1, +p[2], 12)); } catch (e) {}
        $('[data-fn-credit-text]', box).textContent = fill(T_('credit'), { w: c.weeksLeft, t: c.weeksTotal, e: ends }); box.hidden = false;
      });
      // who the order is for: the account holder or a family member (own allergies, dislikes and diets)
      var paraSel = $('[data-fn-para]', holder);
      if (paraSel) {
        var buildPara = function () {
          var pp = loadProfile(); paraSel.innerHTML = '';
          var o0 = document.createElement('option'); o0.value = ''; o0.textContent = T_('para-me'); paraSel.appendChild(o0);
          (pp.people || []).forEach(function (x) { var o = document.createElement('option'); o.value = x.id; o.textContent = x.name; paraSel.appendChild(o); });
          if (st.para && !(pp.people || []).some(function (x) { return x.id === st.para; })) st.para = '';
          paraSel.value = st.para || ''; var wrap = paraSel.closest('[data-fn-para-wrap]'); if (wrap) wrap.hidden = false;
        };
        buildPara();
        var who = $('[data-fn-who]', holder), addA = $('[data-fn-para-wrap] a', holder);
        var paintWho = function () {
          if (!who) return;
          var pp = loadProfile(), people = pp.people || [];
          who.hidden = false;
          who.innerHTML = '<span class="fn-who__l">' + esc(who.getAttribute('data-t-for') || '') + '</span>' + [{ id: '', name: T_('para-me') }].concat(people).map(function (x) { return '<button type="button" class="fn-who__b' + ((st.para || '') === (x.id || '') ? ' is-on' : '') + '" data-fn-who-pick="' + esc(x.id || '') + '">' + esc(x.name) + '</button>'; }).join('') + (addA ? '<a class="fn-who__add" href="' + esc(addA.getAttribute('href') || '#') + '">+ ' + esc(who.getAttribute('data-t-add') || '') + '</a>' : '');
        };
        var switchPerson = function (id) {
          if ((st.para || '') === (id || '')) return;
          saveMine(); switching = true; st.para = id || ''; persist(); applyProfile();
          var mem = (st.people || {})[pKey()];
          if (mem) { PKEYS.forEach(function (k) { if (mem[k] !== null && mem[k] !== undefined) st[k] = JSON.parse(JSON.stringify(mem[k])); }); }
          else {                                                                  // a person with no week yet starts from the default menu of the diet that is selected
            st.days2 = blankDays(); st.perDay = 1; st.course = 0; st.active = 0; st.qty = {}; st.cardNotes = {}; st.mods = blankDays().map(function () { return { off: [], note: '' }; });
            var ps = buildPresetSets(), set = ps[0] || []; st.days = blankDays().map(function (x, k) { return set[k] ? set[k].getAttribute('data-pid') : ''; }); st.presetCat = st.cat;
          }
          st.qty = {}; st.days.concat(st.days2).forEach(function (p) { if (p) st.qty[p] = (st.qty[p] || 0) + 1; });
          if (daysBox) daysBox.removeAttribute('data-built');
          switching = false; paraSel.value = st.para || ''; persist(); applyProfile(); paintWho(); render();
        };
        paraSel.addEventListener('change', function () { switchPerson(paraSel.value); });
        holder.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-fn-who-pick]'); if (b) switchPerson(b.getAttribute('data-fn-who-pick')); });
        paintWho();
      }
      var gridEl = $('[data-fn-grid]', holder);
      var scGrid = $('[data-fn-sc-grid]', holder), scCount = $('[data-fn-sc-count]', holder);
      var scUpdate = function () { if (!scGrid || !scCount) return; var cards = [].filter.call(scGrid.children, function (c) { return !c.classList.contains('is-dg-off') && c.offsetParent !== null; }), n = cards.length; if (!n) return; var w = cards[0].getBoundingClientRect().width + 12, i = Math.min(n - 1, Math.round(scGrid.scrollLeft / Math.max(1, w))); scCount.textContent = (i + 1) + ' / ' + n; };
      if (scGrid) { scGrid.addEventListener('scroll', function () { window.requestAnimationFrame(scUpdate); }, { passive: true }); scUpdate(); }
      document.addEventListener('kx:diet', function (e) { var v = e.detail; if (!v) return; $$('[data-sc-dish]', holder).forEach(function (c) { c.classList.toggle('is-dg-off', !inGroup(c, v)); }); if (scGrid) scGrid.scrollLeft = 0; st.cat = v; persist(); render(); scUpdate(); });
      var arrows = function () { if (!gridEl) return; var pv = $('[data-fn-arrow="-1"]', holder), nx = $('[data-fn-arrow="1"]', holder); if (pv) pv.hidden = gridEl.scrollLeft < 8; if (nx) nx.hidden = gridEl.scrollLeft + gridEl.clientWidth >= gridEl.scrollWidth - 8; };
      if (gridEl) { gridEl.addEventListener('scroll', arrows, { passive: true }); window.addEventListener('resize', arrows); }
      var recPaint = function () { var tb0 = tierEl(), sp0 = tb0 && tb0.getAttribute('data-selling-plan'), kind = st.plan === 'week' ? 'week' : (sp0 && st.renew ? 'auto' : 'manual'); $$('[data-fn-rec]', holder).forEach(function (p) { p.hidden = p.getAttribute('data-fn-rec') !== kind; }); };
      holder.addEventListener('click', function () { setTimeout(recPaint, 30); }); recPaint();
      applyProfile();
      render();
      // the order was sent to the cart earlier: if the cart has been emptied since (items removed, cart cleared), the next order starts from a fresh list
      if (st.sent) { try { var tcart = null; try { if (location.protocol === 'file:') tcart = localStorage.getItem('kx-test-cart'); } catch (e0) {} (tcart ? Promise.resolve(JSON.parse(tcart)) : fetch('/cart.js', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); })).then(function (c) { if (c && !c.item_count) { st.days = blankDays(); st.days2 = blankDays(); st.course = 0; st.qty = {}; st.active = 0; st.step = st.rulesOk ? 1 : 0; st.sent = false; persist(); render(); } }).catch(function () {}); } catch (e1) {} }
      // ?plan=block / ?plan=week (from the "Get started" buttons of the plans page): the plan is already chosen, go straight to the meals
      try {
        var qs0 = location.search || (location.hash.indexOf('?') > -1 ? location.hash.slice(location.hash.indexOf('?')) : ''), qp = new URLSearchParams(qs0).get('plan');
        if ((qp === 'block' || qp === 'week') && !holder.classList.contains('funnel--teaser')) { var pb = $('[data-plan-choice="' + qp + '"]', holder); if (pb) { st.plan = qp; st.planChosen = true; if (st.reach >= 1) pb.click(); else { persist(); render(); } } }
      } catch (e0) {}
      setTimeout(arrows, 60); holder.addEventListener('click', function () { setTimeout(arrows, 80); });
      var rollKey = dateOf(0);
      var roll = function () { var k = dateOf(0); if (k !== rollKey) { rollKey = k; say(fill(T_('rolled'), { d: k })); render(); } };
      setInterval(roll, 15000); document.addEventListener('visibilitychange', function () { if (!document.hidden) roll(); });
    });
  }


  // the client wants the logo wherever the word "Kulinaria" appears in the copy (accessible name kept for screen readers)
  var initWordmarkScan = function () {};
  function initWordmark() {
    var L = cfg.logos; if (!L) return;
    var SKIP = /^(SCRIPT|STYLE|TEXTAREA|INPUT|SELECT|OPTION|TITLE|NOSCRIPT|SVG|IMG|BUTTON)$/;
    var re = /Kulinaria/g;
    var make = function () {
      var w = document.createElement('span'); w.className = 'wordmark';
      var vh = document.createElement('span'); vh.className = 'visually-hidden'; vh.textContent = 'Kulinaria'; w.appendChild(vh);
      [['wm-ink', L.ink], ['wm-cream', L.cream], ['wm-gold', L.gold], ['wm-fuego', L.fuego || L.gold]].forEach(function (x) {
        var i = document.createElement('img'); i.className = x[0]; i.alt = ''; i.setAttribute('aria-hidden', 'true'); i.decoding = 'async'; i.src = resolve(x[1]); w.appendChild(i);
      });
      return w;
    };
    var scan = function (rootEl) {
      var walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          if (!re.test(n.nodeValue)) { re.lastIndex = 0; return NodeFilter.FILTER_REJECT; } re.lastIndex = 0;
          var p = n.parentNode; if (!p || SKIP.test(p.nodeName) || p.closest('.wordmark,.logo,.footer-mega,[data-no-wordmark],a.sitemap__top,.page-head__crumbs,.loader,.site-footer__legal,.footer-bottom,.countdown')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      var nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(function (n) {
        var parts = n.nodeValue.split('Kulinaria'), frag = document.createDocumentFragment();
        parts.forEach(function (t, i) { if (t) frag.appendChild(document.createTextNode(t)); if (i < parts.length - 1) frag.appendChild(make()); });
        n.parentNode.replaceChild(frag, n);
      });
    };
    scan(document.body);
    initWordmarkScan = function () { scan(document.body); };
    document.addEventListener('kx:scan', function () { scan(document.body); });
  }

  /* =====================================================================
     Experience layer: theme, loader, particles, menu, video, tilt, peek
     ===================================================================== */
  function whenLoaded(fn) {
    if (root.classList.contains('is-loaded')) { fn(); return; }
    var mo = new MutationObserver(function () { if (root.classList.contains('is-loaded')) { mo.disconnect(); fn(); } });
    mo.observe(root, { attributes: true, attributeFilter: ['class'] });
  }

  function initLoader() {
    if (!root.classList.contains('has-loader')) return;
    var t0 = performance.now(), pct = $('[data-loader-pct]'), bar = $('[data-loader-bar]'), done = false, MIN = 1300, MAX = 2600;
    var finish = function () {
      if (done) return; done = true;
      root.classList.add('is-loaded');
      try { sessionStorage.setItem('kx-seen', '1'); } catch (e) {}
    };
    var tick = function () {
      var el = performance.now() - t0, v = Math.min(100, Math.round(100 * Math.min(1, el / MIN)));
      if (pct) pct.textContent = v; if (bar) bar.style.transform = 'scaleX(' + (v / 100) + ')';
      if (!done) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // ready = markup parsed and the first-screen image decoded (or the safety timeout), not "every asset downloaded"
    var hero = $('.hero__media--light img, .hero__media--dark img, .page-head__bg img');
    var ready = function () {
      var wait = Math.max(0, MIN - (performance.now() - t0));
      setTimeout(finish, wait);
    };
    var imgReady = hero && !hero.complete ? new Promise(function (r) { hero.addEventListener('load', r, { once: true }); hero.addEventListener('error', r, { once: true }); }) : Promise.resolve();
    Promise.race([imgReady, new Promise(function (r) { setTimeout(r, MAX - 600); })]).then(ready);
    setTimeout(finish, MAX);
  }

  var THEMES = ['fuego', 'llama'], THEME_COLOR = { llama: '#FFFFFF', fuego: '#0E0E0E' };
  function paintTheme(t) {
    root.setAttribute('data-theme', t);
    $$('[data-theme-pick]').forEach(function (d) { d.classList.toggle('on', d.getAttribute('data-theme-pick') === t); });
    var meta = $('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', THEME_COLOR[t] || THEME_COLOR.fuego);
    document.dispatchEvent(new CustomEvent('kx:theme', { detail: t }));
  }
  function setTheme(t, persist) {
    if (persist) { try { localStorage.setItem('kx-theme', t); } catch (e) {} }
    if (!persist || REDUCE || !document.startViewTransition) {
      root.classList.add('is-theming'); paintTheme(t);
      requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.remove('is-theming'); }); });
      return;
    }
    // one cross-fade of a snapshot: instant, no re-layout flicker
    root.classList.add('is-theming');
    var vt = document.startViewTransition(function () { paintTheme(t); });
    var done = function () { root.classList.remove('is-theming'); };
    vt.finished.then(done, done);
  }
  function initTheme() {
    var cur = function () { var i = THEMES.indexOf(root.getAttribute('data-theme')); return i < 0 ? 0 : i; };
    setTheme(THEMES[cur()], false);
    var step = function (d) { setTheme(THEMES[(cur() + d + THEMES.length) % THEMES.length], true); };
    $$('[data-theme-next]').forEach(function (b) { b.addEventListener('click', function () { step(1); }); });
    $$('[data-theme-prev]').forEach(function (b) { b.addEventListener('click', function () { step(-1); }); });
    $$('[data-theme-pick]').forEach(function (d) { d.addEventListener('click', function () { setTheme(d.getAttribute('data-theme-pick'), true); }); });
    $$('[data-theme-toggle]').forEach(function (b) { b.addEventListener('click', function () { step(1); }); });
    // swipe the label like a carousel
    $$('.tc__stage').forEach(function (st) {
      var x0 = null;
      st.addEventListener('pointerdown', function (e) { x0 = e.clientX; });
      st.addEventListener('pointerup', function (e) { if (x0 === null) return; var dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 24) step(dx < 0 ? 1 : -1); });
    });
  }

  // slow flowing waves of light behind everything: black <-> orange (Fuego) and white <-> orange (Llama). WebGL, low resolution, ~30 fps, paused when hidden.
  function initWave() {
    var cv = $('[data-wave]'); if (!cv) return;
    var gl = null; try { gl = cv.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' }) || cv.getContext('experimental-webgl'); } catch (e) {}
    if (!gl) return;
    var vs = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
    var fs = 'precision mediump float;uniform vec2 R;uniform float T;uniform vec3 A;uniform vec3 B;uniform vec3 C;uniform float K;' +
      'void main(){vec2 p=gl_FragCoord.xy/R.y;float t=T*.11;vec2 q=p*1.25;' +
      'for(int i=1;i<4;i++){float f=float(i);q+=vec2(.55/f*sin(f*q.y*1.7+t*1.3+f),.55/f*cos(f*q.x*1.5-t+f*1.7));}' +
      'float w=.5+.5*sin(q.x*1.6+q.y*1.1+t);' +
      'float bands=.5+.5*sin((q.x+q.y)*8.0-t*2.0);' +
      'float g=smoothstep(.12,.95,w);' +
      'vec3 col=mix(A,B,g*K);col=mix(col,C,smoothstep(.7,1.,w)*K*.6);col+=(B-A)*bands*.03*K*g;' +
      'gl_FragColor=vec4(col,1.);}';
    var sh = function (type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    var v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, fs); if (!v || !f) return;
    var pr = gl.createProgram(); gl.attachShader(pr, v); gl.attachShader(pr, f); gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
    gl.useProgram(pr);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var uR = gl.getUniformLocation(pr, 'R'), uT = gl.getUniformLocation(pr, 'T'), uA = gl.getUniformLocation(pr, 'A'), uB = gl.getUniformLocation(pr, 'B'), uC = gl.getUniformLocation(pr, 'C'), uK = gl.getUniformLocation(pr, 'K');
    var PAL = {
      fuego: { a: [.055, .055, .055], b: [1, .384, 0], c: [1, .54, .24], k: .24 },
      llama: { a: [1, 1, 1], b: [1, .86, .74], c: [1, .5, .16], k: .55 }
    };
    var cur = null, tgt = PAL.fuego, last = 0, t0 = performance.now(), raf = 0, running = false;
    var pal = function () { return PAL[root.getAttribute('data-theme')] || PAL.fuego; };
    var mix = function (x, y, k) { return x + (y - x) * k; };
    var fade = function () { if (!cur) { cur = { a: tgt.a.slice(), b: tgt.b.slice(), c: tgt.c.slice(), k: tgt.k }; return; } for (var i = 0; i < 3; i++) { cur.a[i] = mix(cur.a[i], tgt.a[i], .08); cur.b[i] = mix(cur.b[i], tgt.b[i], .08); cur.c[i] = mix(cur.c[i], tgt.c[i], .08); } cur.k = mix(cur.k, tgt.k, .08); };
    var size = function () {
      var sc = window.innerWidth < 761 ? 0.3 : 0.34, w = Math.max(160, Math.round(window.innerWidth * sc)), h = Math.max(120, Math.round(window.innerHeight * sc));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
    };
    var draw = function (now) {
      tgt = pal(); fade(); size();
      gl.uniform2f(uR, cv.width, cv.height); gl.uniform1f(uT, REDUCE ? 4 : (now - t0) / 1000);
      gl.uniform3fv(uA, cur.a); gl.uniform3fv(uB, cur.b); gl.uniform3fv(uC, cur.c); gl.uniform1f(uK, cur.k);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    var loop = function (now) {
      raf = 0; if (!running) return;
      if (now - last > 33) { last = now; draw(now); }
      raf = requestAnimationFrame(loop);
    };
    var start = function () { if (running || REDUCE) return; running = true; raf = requestAnimationFrame(loop); };
    var stop = function () { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; };
    document.documentElement.classList.add('has-wave');
    draw(performance.now()); draw(performance.now());
    window.addEventListener('resize', function () { draw(performance.now()); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
    document.addEventListener('kx:theme', function () { if (REDUCE) { for (var i = 0; i < 12; i++) draw(performance.now()); } });
    start();
  }

  // gold dust drifting over the wood background
  function initParticles() {
    var c = $('[data-particles]'); if (!c || !c.getContext) return;
    var ctx = c.getContext('2d'), W = 0, H = 0, dpr = Math.min(2, window.devicePixelRatio || 1), ps = [], mx = -999, my = -999, running = false;
    var dark = function () { return root.getAttribute('data-theme') === 'fuego'; };
    var size = function () { W = c.clientWidth; H = c.clientHeight; c.width = W * dpr; c.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    var make = function (fresh) { return { x: Math.random() * W, y: fresh ? Math.random() * H : H + 20, r: 0.7 + Math.random() * 2.1, vy: 0.12 + Math.random() * 0.4, ph: Math.random() * 6.28, a: 0.25 + Math.random() * 0.6 }; };
    var N = function () { return Math.max(18, Math.min(72, Math.round(window.innerWidth / 24))); };
    var frame = function (t) {
      ctx.clearRect(0, 0, W, H);
      var d = dark();
      ctx.globalCompositeOperation = d ? 'lighter' : 'source-over';
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        p.y -= p.vy; p.x += Math.sin(t / 1800 + p.ph) * 0.25;
        var dx = p.x - mx, dy = p.y - my, dd = dx * dx + dy * dy;
        if (dd < 14400) { var f = (1 - dd / 14400) * 1.6; p.x += (dx / 120) * f; p.y += (dy / 120) * f; }
        if (p.y < -20) ps[i] = make(false);
        var tw = 0.55 + 0.45 * Math.sin(t / 700 + p.ph), a = p.a * tw;
        if (d) {
          var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
          g.addColorStop(0, 'rgba(255,224,150,' + a + ')'); g.addColorStop(1, 'rgba(255,200,90,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 5, 0, 6.283); ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(79,99,48,' + (a * 0.5) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
        }
      }
      if (running) requestAnimationFrame(frame);
    };
    var start = function () { if (running || REDUCE) return; running = true; requestAnimationFrame(frame); };
    size(); for (var i = 0; i < N(); i++) ps.push(make(true));
    window.addEventListener('resize', function () { size(); while (ps.length < N()) ps.push(make(true)); ps.length = Math.min(ps.length, N()); });
    window.addEventListener('pointermove', function (e) { mx = e.clientX; my = e.clientY; }, { passive: true });
    document.addEventListener('visibilitychange', function () { running = false; if (!document.hidden) start(); });
    if (REDUCE) frame(0); else start();
  }

  // full-screen menu (the "Más" button and the mobile burger)
  function initMenu() {
    var ov = $('#menu-overlay'); if (!ov) return;
    var openers = $$('[data-menu-open]'), last = null;
    var focusables = function () { return $$('a[href],button:not([disabled]),input,select', ov).filter(function (e) { return e.offsetParent !== null; }); };
    var open = function () {
      last = document.activeElement; ov.hidden = false; document.body.classList.add('menu-open');
      requestAnimationFrame(function () { requestAnimationFrame(function () { ov.classList.add('is-open'); }); });
      openers.forEach(function (b) { b.setAttribute('aria-expanded', 'true'); });
      var cl = $('[data-menu-close]', ov); if (cl) cl.focus();
    };
    var close = function () {
      if (ov.hidden) return;
      ov.classList.remove('is-open'); document.body.classList.remove('menu-open');
      openers.forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
      setTimeout(function () { if (!ov.classList.contains('is-open')) ov.hidden = true; }, 760);
      if (last && last.focus) last.focus();
    };
    openers.forEach(function (b) { b.addEventListener('click', function () { if (ov.hidden) open(); else close(); }); });
    $$('[data-menu-close]', ov).forEach(function (b) { b.addEventListener('click', close); });
    ov.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a[href]')) close(); });
    document.addEventListener('keydown', function (e) {
      if (ov.hidden) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'Tab') {
        var f = focusables(); if (!f.length) return;
        var first = f[0], lastEl = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
      }
    });
    window.addEventListener('hashchange', close);
  }

  /* ---------- video ---------- */
  var SAVE = !!(navigator.connection && navigator.connection.saveData);
  function loadVideo(v) {
    if (v.getAttribute('data-ready')) return;
    v.setAttribute('data-ready', '1'); v.src = resolve(v.getAttribute('data-video-src')); v.load();
  }
  function playVideo(v) { loadVideo(v); var p = v.play(); if (p && p.catch) p.catch(function () {}); }

  function initVideos() {
    var vids = $$('video[data-video-src]').filter(function (v) { return !v.hasAttribute('data-scrub'); });
    vids.forEach(function (v) { v.addEventListener('playing', function () { v.classList.add('is-on'); }); });
    vids.forEach(function (v) { if (v.hasAttribute('data-once')) v.addEventListener('ended', function () { v.classList.add('is-done'); }); });
    var hero = $('[data-hero]'), paused = false;
    var tg = hero && $('[data-media-toggle]', hero);
    if (REDUCE || SAVE) { if (tg) tg.hidden = true; return; }   // poster frames only
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var v = e.target;
        if (e.isIntersecting) { if (!(paused && hero && hero.contains(v))) playVideo(v); }
        else if (!v.paused) v.pause();
      });
    }, { threshold: 0.15 });
    vids.forEach(function (v) { io.observe(v); });
    if (tg) tg.addEventListener('click', function () {
      paused = !paused; tg.setAttribute('aria-pressed', paused ? 'true' : 'false'); tg.setAttribute('aria-label', paused ? T('play') : T('pause'));
      $$('video', hero).forEach(function (v) { if (paused) v.pause(); else if (v.offsetParent !== null) playVideo(v); });
    });
  }

  /* hero: a 3D cube. Item 1 is the intro VIDEO (it stays until it has played once); then the cube turns through the highlights (events, trainers, partners, notices...) every few seconds, and comes back to the video */
  function initHeroCarousel() {
    var hero = $('[data-hero]'), cube = hero && $('[data-hero-cube]', hero); if (!cube) return;
    var box = cube.parentNode, faces = $$('.hero__face', cube), n = faces.length; if (n < 3) return;     // faces[0] = the video, the rest = highlights
    var dots = $$('[data-hs-dot]', hero), dur = Math.max(3, Math.min(12, +cube.getAttribute('data-interval') || 4)) * 1000;
    var video = $('[data-hero-video]', hero), tg = $('[data-media-toggle]', hero), canPlay = !!video && !REDUCE && !SAVE;
    var cur = 0, timer = 0, held = false, away = false, userPaused = false, busy = false, vidSafe = 0, videoDone = false;   // the intro video is shown ONCE; after it the loop is the highlights only
    var wrapIdx = function (k) { if (cur > 0 || videoDone) { if (k < 1) return n - 1; if (k > n - 1) return 1; return k; } return ((k % n) + n) % n; };
    $$('img', cube).forEach(function (im) { im.loading = 'eager'; });
    hero.classList.add('is-carousel');
    var size = function () { box.style.setProperty('--hc-w', Math.round(box.getBoundingClientRect().width) + 'px'); };
    size(); window.addEventListener('resize', size);
    // the carousel is as tall as its tallest slide (never shorter than the screen): nothing is hidden or cut on laptops
    var fitT = 0, hs = [];
    var setH = function (k) { if (hs[k]) box.style.setProperty('--hc-h', hs[k] + 'px'); };
    var fit = function () {
      box.style.removeProperty('--hc-h'); var def = box.offsetHeight; hs = [def];
      hero.classList.add('hx-measure');
      faces.forEach(function (f, x) { if (x > 0) hs[x] = Math.max(def, Math.ceil(f.offsetHeight + 6)); });
      hero.classList.remove('hx-measure');
      setH(cur);
    };
    var fitSoon = function () { clearTimeout(fitT); fitT = setTimeout(fit, 120); };
    fit(); window.addEventListener('resize', fitSoon); window.addEventListener('load', fitSoon);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitSoon);
    $$('img', cube).forEach(function (im) { if (!im.complete) im.addEventListener('load', fitSoon); });
    document.addEventListener('kx:lang', fitSoon);
    var mark = function () {
      faces.forEach(function (f, x) { if (x === cur) f.removeAttribute('aria-hidden'); else f.setAttribute('aria-hidden', 'true'); });
      dots.forEach(function (d, x) { d.classList.toggle('is-on', x === cur); if (x === cur) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
    };
    var vidMs = function () { return ((video && video.duration && isFinite(video.duration)) ? video.duration : 12) * 1000; };
    var restartBar = function () { hero.style.setProperty('--hs-dur', (cur === 0 && canPlay ? vidMs() : dur) + 'ms'); hero.classList.remove('hs-run'); void hero.offsetWidth; if (!REDUCE) hero.classList.add('hs-run'); };
    var turn = function (k, dir) {                                   // dir 1: the cube turns left (next); -1: back
      k = wrapIdx(k); if (busy || k === cur) return false;
      var from = faces[cur], to = faces[k];
      if (REDUCE) { from.classList.remove('is-cur'); to.classList.add('is-cur'); cur = k; mark(); setH(cur); return true; }
      busy = true; size(); if (hs.length) box.style.setProperty('--hc-h', Math.max(hs[cur] || 0, hs[k] || 0) + 'px');
      var rot = dir > 0 ? 'rot-next' : 'rot-prev';
      from.classList.add('is-out'); to.classList.add(dir > 0 ? 'is-nxt' : 'is-prv'); void cube.offsetWidth; cube.classList.add(rot);
      var fb = 0, done = function () {
        clearTimeout(fb); cube.removeEventListener('transitionend', onEnd);
        cube.style.transition = 'none';
        from.classList.remove('is-cur', 'is-out'); to.classList.remove('is-nxt', 'is-prv'); to.classList.add('is-cur');
        cube.classList.remove(rot); void cube.offsetWidth; cube.style.transition = '';
        setH(cur); busy = false;
      };
      var onEnd = function (e) { if (e.target === cube && e.propertyName === 'transform') done(); };
      cube.addEventListener('transitionend', onEnd); fb = setTimeout(done, 1500);
      cur = k; mark();
      if (from === faces[0] && !videoDone) { videoDone = true; if (dots[0]) dots[0].hidden = true; }
      if (k === 0 && canPlay) { try { video.currentTime = 0; } catch (e) {} playVideo(video); }      // back to the video: it plays again from the start
      return true;
    };
    var tick = function () {
      clearTimeout(timer); clearTimeout(vidSafe);
      var pause = held || away || userPaused || REDUCE || document.documentElement.classList.contains('hx-dlg-open');
      if (pause) { hero.classList.remove('hs-run'); return; }
      restartBar();
      if (cur === 0 && canPlay) {                                  // the video item lasts until the video has played once (safety: its length + 2s)
        vidSafe = setTimeout(function () { next(); }, vidMs() + 2000);
        return;
      }
      timer = setTimeout(next, dur + 900);                         // dur on screen + the turn itself
    };
    var next = function () { if (turn(cur + 1, 1)) tick(); else if (!busy) tick(); };
    var go = function (k, dir) { if (turn(k, dir)) tick(); };
    if (canPlay) {
      video.loop = false; video.removeAttribute('loop');
      video.addEventListener('ended', function () { if (cur === 0) next(); });
      video.addEventListener('error', function () { if (cur === 0) next(); });
      video.addEventListener('playing', function () { if (cur === 0) tick(); });
      setTimeout(function () { if (cur === 0 && (video.paused || video.readyState < 2)) next(); }, 9000);    // autoplay blocked / still loading: never leave the hero static
    } else setTimeout(function () { if (cur === 0) next(); }, 600);
    mark(); tick();
    document.addEventListener('kx:hxdlg', function () { tick(); });
    var hold = function (v) { held = v; tick(); };
    // no pause on a resting mouse (it would freeze the hero); only keyboard focus inside it pauses, and a touch holds it for a moment
    hero.addEventListener('focusin', function (e) { try { if (e.target.matches && e.target.matches(':focus-visible')) hold(true); } catch (x) {} }); hero.addEventListener('focusout', function () { hold(false); });
    hero.addEventListener('touchstart', function () { held = true; clearTimeout(timer); clearTimeout(vidSafe); clearTimeout(box._th); box._th = setTimeout(function () { held = false; tick(); }, 4000); }, { passive: true });
    document.addEventListener('visibilitychange', function () { away = document.hidden; tick(); });
    if (window.IntersectionObserver) new IntersectionObserver(function (en) { away = !en[0].isIntersecting; tick(); }, { threshold: 0.25 }).observe(hero);
    hero.addEventListener('click', function (e) {
      var t = e.target; if (!t || !t.closest) return;
      if (t.closest('[data-hs-next]')) go(cur + 1, 1); else if (t.closest('[data-hs-prev]')) go(cur - 1, -1);
      else { var d = t.closest('[data-hs-dot]'); if (d) { var k = +d.getAttribute('data-hs-dot'); go(k, k >= cur ? 1 : -1); } }
    });
    hero.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') go(cur + 1, 1); else if (e.key === 'ArrowLeft') go(cur - 1, -1); });
    var x0 = null;
    cube.addEventListener('pointerdown', function (e) { x0 = e.clientX; });
    cube.addEventListener('pointerup', function (e) { if (x0 == null) return; var dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 48) go(cur + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1); });
    if (tg) tg.addEventListener('click', function () { userPaused = tg.getAttribute('aria-pressed') === 'true'; tick(); });
  }

  // video that scrubs with the scroll position
  function initBand() {
    var b = $('[data-band]'); if (!b) return;
    var v = $('[data-scrub]', b), lines = $$('.band__line', b);
    if (REDUCE || root.classList.contains('no-motion') || !v) return;
    b.classList.add('is-scrubbing');
    var near = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { loadVideo(v); near.disconnect(); } }, { rootMargin: '900px 0px' });
    near.observe(b);
    var update = raf(function () {
      var r = b.getBoundingClientRect(), vh = window.innerHeight, span = r.height - vh;
      if (span <= 0) return;
      var p = Math.max(0, Math.min(1, -r.top / span));
      b.style.setProperty('--p', p.toFixed(4));
      if (v.readyState >= 1 && v.duration) {
        var t = p * (v.duration - 0.05);
        if (Math.abs(v.currentTime - t) > 0.04) { if (v.fastSeek) v.fastSeek(t); else v.currentTime = t; }
      }
      lines.forEach(function (l, i) { l.classList.toggle('is-on', p >= 0.1 + i * (0.7 / Math.max(1, lines.length))); });
    });
    window.addEventListener('scroll', update, { passive: true }); window.addEventListener('resize', update);
    v.addEventListener('loadedmetadata', update); update();
  }

  // any pill button / circle-arrow link ignites with a fire loop on hover / focus
  function initFire() {
    return;   // the hover fire video is off: a video blended over the page can escape its clip on some GPUs and paints white streaks over the site
    var url = (cfg.media || {}).fire;
    if (!url || REDUCE || SAVE || !FINE) return;
    var start = function (b) {
      var host = b.querySelector('.arrow-link__c') || b;
      if (!b._fx) {
        var fx = document.createElement('span'); fx.className = 'btn__fx'; fx.setAttribute('aria-hidden', 'true');
        var v = document.createElement('video'); v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto'; v.src = resolve(url);
        fx.appendChild(v); host.appendChild(fx); b._fx = v;
      }
      b.classList.add('is-fx'); var p = b._fx.play(); if (p && p.catch) p.catch(function () {});
    };
    var stop = function (b) {
      b.classList.remove('is-fx');
      setTimeout(function () { if (b._fx && !b.classList.contains('is-fx')) b._fx.pause(); }, 700);
    };
    var pick = function (e) { var b = e.target.closest ? e.target.closest('.btn,.arrow-link') : null; return b && !b.classList.contains('btn--ghost') && !b.disabled ? b : null; };
    document.addEventListener('pointerover', function (e) { var b = pick(e); if (b && !(e.relatedTarget && b.contains(e.relatedTarget))) start(b); });
    document.addEventListener('pointerout', function (e) { var b = pick(e); if (b && !(e.relatedTarget && b.contains(e.relatedTarget))) stop(b); });
    document.addEventListener('focusin', function (e) { var b = pick(e); if (b) start(b); });
    document.addEventListener('focusout', function (e) { var b = pick(e); if (b) stop(b); });
  }

  // 3D tilt with moving glare
  function initTilt() {
    if (!FINE || REDUCE) return;
    var active = null;
    var reset = function (el) { el.classList.remove('is-tilting'); el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); };
    document.addEventListener('pointermove', function (e) {
      var el = e.target.closest ? e.target.closest('[data-tilt-card]') : null;
      if (active && active !== el) reset(active);
      active = el; if (!el) return;
      var r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      var m = el.classList.contains('dish__media') ? 6 : 5;
      el.style.setProperty('--ry', ((px - 0.5) * m * 2).toFixed(2) + 'deg'); el.style.setProperty('--rx', ((0.5 - py) * m * 2).toFixed(2) + 'deg');
      el.style.setProperty('--gx', (px * 100).toFixed(1) + '%'); el.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
      el.classList.add('is-tilting');
    }, { passive: true });
    document.addEventListener('pointerleave', function () { if (active) reset(active); active = null; });
  }

  // editorial index: a photo follows the cursor
  function initPeek() {
    if (!FINE || REDUCE) return;
    var rows = $$('.index-row[data-peek]'); if (!rows.length) return;
    var el = document.createElement('div'); el.className = 'peek'; el.setAttribute('aria-hidden', 'true');
    var img = new Image(); img.alt = ''; el.appendChild(img); document.body.appendChild(el);
    var tx = 0, ty = 0, cx = 0, cy = 0, on = false;
    var loop = function () {
      cx += (tx - cx) * 0.16; cy += (ty - cy) * 0.16;
      var tilt = Math.max(-8, Math.min(8, (tx - cx) * 0.06));
      el.style.transform = 'translate3d(' + (cx + 36).toFixed(1) + 'px,' + (cy - 130).toFixed(1) + 'px,0) rotate(' + tilt.toFixed(2) + 'deg)';
      if (on || Math.abs(tx - cx) > 0.5) requestAnimationFrame(loop);
    };
    rows.forEach(function (r) {
      r.addEventListener('pointerenter', function (e) {
        img.src = resolve(r.getAttribute('data-peek')); tx = cx = e.clientX; ty = cy = e.clientY;
        if (!on) { on = true; requestAnimationFrame(loop); } el.classList.add('is-on');
      });
      r.addEventListener('pointermove', function (e) { tx = e.clientX; ty = e.clientY; });
      r.addEventListener('pointerleave', function () { on = false; el.classList.remove('is-on'); });
    });
  }


  // bottom sheet (phone): the glowing "i" buttons open the pricing explanation
  function initSheets() {
    var open = null;
    var close = function () { if (!open) return; open.classList.remove('is-open'); open.setAttribute('aria-hidden', 'true'); root.classList.remove('sheet-open'); var b = open._from; open = null; if (b && b.focus) b.focus(); };
    document.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-sheet]') : null;
      if (t) { var el = document.getElementById('sheet-' + t.getAttribute('data-sheet')); if (!el) return; e.preventDefault(); el._from = t; open = el; el.classList.add('is-open'); el.setAttribute('aria-hidden', 'false'); root.classList.add('sheet-open'); var p = $('.sheet__panel', el); if (p) p.focus(); return; }
      if (open && e.target.closest('[data-sheet-close]')) close();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }


  // burger menu (phone): every group can open its sub-pages as cards
  function initSitemapToggles() {
    $$('.sitemap__group').forEach(function (g) {
      var sub = $('.sitemap__sub', g); if (!sub || $('.sitemap__tog', g)) return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'sitemap__tog'; b.setAttribute('aria-expanded', 'false');
      b.setAttribute('aria-label', (cfg.lang === 'en' ? 'Show pages: ' : 'Ver páginas: ') + ($('.sitemap__top', g) ? $('.sitemap__top', g).textContent.replace(/^\d+/, '').trim() : ''));
      b.innerHTML = '<i></i><i></i>';
      b.addEventListener('click', function () { var o = g.classList.toggle('is-open'); b.setAttribute('aria-expanded', o ? 'true' : 'false'); });
      g.appendChild(b);
    });
  }


  // carousels (phone): like an Instagram post, one item at a time with dots and a "1 / 5" counter
  function initSwipeDots() {
    if (!initSwipeDots.bound) { initSwipeDots.bound = true; var t; window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(initSwipeDots, 150); }); window.addEventListener('load', initSwipeDots); window.addEventListener('hashchange', function () { setTimeout(initSwipeDots, 200); }); }
    $$('.fg__list, .rail__track').forEach(function (row) {
      if (row.getAttribute('data-dots')) return;
      var kids = function () { return [].slice.call(row.children).filter(function (c) { return c.getBoundingClientRect().width > 0; }); };
      if (kids().length < 2 || row.scrollWidth <= row.clientWidth + 2) return;
      row.setAttribute('data-dots', '1');
      var d = document.createElement('div'); d.className = 'swipe-dots'; d.setAttribute('aria-hidden', 'true');
      var n = kids().length; for (var i = 0; i < n; i++) d.appendChild(document.createElement('i'));
      var cnt = document.createElement('span'); cnt.className = 'swipe-n'; d.appendChild(cnt);
      row.parentNode.insertBefore(d, row.nextSibling);
      var paint = function () {
        var k = kids(); if (!k.length) return;
        var step = k.length > 1 ? (k[1].offsetLeft - k[0].offsetLeft) || k[0].getBoundingClientRect().width : 1;
        var idx = Math.max(0, Math.min(k.length - 1, Math.round(row.scrollLeft / Math.max(1, step))));
        [].forEach.call(d.querySelectorAll('i'), function (dot, j) { dot.className = j === idx ? 'on' : ''; });
        cnt.textContent = (idx + 1) + ' / ' + k.length;
      };
      row.addEventListener('scroll', raf(paint), { passive: true }); paint();
    });
  }

  // each init runs on its own: one failing module must never stop the others (e.g. the logo wordmark)
  var run = function (fn) { try { fn(); } catch (e) { if (window.console) console.warn('[kulinaria] ' + (fn.name || 'init') + ' failed', e); } };
  document.addEventListener('DOMContentLoaded', function () {
    [bindIdentity, initWordmark, initSheets, initSitemapToggles, initSwipeDots, initLoader, initTheme, initWave, initParticles, initMenu, initCountdown, initSteps, initFunnel, initOnboarding, initPw, pullProfile, initReturning, initHomeBar, initOnbBanner, initMyWeek, initMyPause, initDishPanel, initAccountMenu, initClearCart, initLeads, initAccountHub, initDietChips, initFilters, initDropdowns, initProfileForm, initCart, initRefSave, applyProfile, initDietGate,
      initSplit, initReveal, initChrome, initScrollVars, initPointer, initRail, initVideos, initBand, initHeroCarousel, initHeroDialog, initCircle, initFire, initTilt, initPeek].forEach(run);
    document.documentElement.classList.add('motion-ready');
    window.addEventListener('load', function () { run(initWordmarkScan); });
  });
})();
