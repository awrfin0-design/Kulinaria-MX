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
    notSuitable: 'No apto para tu perfil: contiene {list}.', dislikeHit: 'Contiene ingredientes que marcaste como "no me gustan": {list}.',
    remove: 'Quitar {name}', d: 'd', h: 'h', min: 'min', toDark: 'Activar modo oscuro', toLight: 'Activar modo claro', pause: 'Pausar video', play: 'Reproducir video'
  };
  function T(key, vars) {
    var src = (window.KULINARIA && window.KULINARIA.i18n) || {};
    var str = src[key] != null ? src[key] : FALLBACK[key] || key;
    return String(str).replace(/\{(\w+)\}/g, function (m, n) { return vars && vars[n] != null ? vars[n] : m; });
  }
  // preview hook: the single-file preview serves media from memory
  var resolve = function (u) { return (window.KULINARIA && window.KULINARIA.resolve) ? window.KULINARIA.resolve(u) : u; };

  /* ---------- helpers ---------- */
  var norm = function (s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  };

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

  /* Pause locks: <button data-pause-lock data-lock-day="2" data-lock-hour="10"> ...
     lock-day is the weekday of the deadline (0=Sun..6=Sat) inside the Sat->Fri cycle. */
  function initPauseLocks() {
    var btns = $$('[data-pause-lock]');
    if (!btns.length) return;
    var apply = function () {
      var into = minutesIntoCycle();
      btns.forEach(function (b) {
        var day = parseInt(b.getAttribute('data-lock-day'), 10);
        var hour = parseInt(b.getAttribute('data-lock-hour'), 10);
        var dayOffset = (day - 6 + 7) % 7; // days after Saturday
        var deadline = dayOffset * 1440 + hour * 60 - cutoffMin;
        if (deadline < 0) deadline += 7 * 1440;
        var locked = into >= deadline;
        b.disabled = locked;
        b.setAttribute('aria-disabled', locked ? 'true' : 'false');
        var msg = b.parentNode.querySelector('[data-lock-msg]');
        if (msg) {
          msg.hidden = !locked;
        }
        var left = b.parentNode.querySelector('[data-lock-left]');
        if (left) left.textContent = locked ? '' : T('pauseLeft', { time: fmtCountdown(deadline - into) });
      });
    };
    apply();
    setInterval(apply, 30000);
  }

  /* ---------- profile (allergies + dislikes) ---------- */
  function loadProfile() {
    var p = { allergies: [], dislikes: [] };
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
  function applyProfile() {
    var p = loadProfile();
    var al = p.allergies.map(norm), dl = p.dislikes.map(norm);
    $$('[data-dish]').forEach(function (card) {
      var tags = (card.getAttribute('data-allergens') || '').split('|').map(norm).filter(Boolean);
      var ings = (card.getAttribute('data-ingredients') || '').split('|').map(norm).filter(Boolean);
      var hard = al.some(function (a) { return tags.indexOf(a) > -1 || ings.indexOf(a) > -1; });
      var soft = dl.filter(function (d) { return ings.some(function (i) { return i.indexOf(d) > -1; }) || tags.indexOf(d) > -1; });
      var compat = hard ? 0 : (soft.length ? Math.max(40, 100 - soft.length * 30) : 100);
      card.classList.toggle('is-blocked', hard);
      var badge = $('[data-compat]', card);
      if (badge) {
        badge.textContent = (al.length || dl.length) ? T('compat', { n: compat }) : '';
        badge.setAttribute('data-low', compat < 100 ? 'true' : 'false');
      }
      $$('button[type="submit"],[data-add]', card).forEach(function (b) { b.disabled = hard; });
      card.setAttribute('data-compat-value', compat);
    });
    $$('[data-dish-detail]').forEach(function (detail) {
      var alert = $('[data-allergen-alert]', detail);
      if (!alert) return;
      var tags = (detail.getAttribute('data-allergens') || '').split('|').map(norm).filter(Boolean);
      var ings = (detail.getAttribute('data-ingredients') || '').split('|').map(norm).filter(Boolean);
      var hit = al.filter(function (a) { return tags.indexOf(a) > -1 || ings.indexOf(a) > -1; });
      var soft = dl.filter(function (d) { return ings.some(function (i) { return i.indexOf(d) > -1; }); });
      alert.hidden = !(hit.length || soft.length);
      $$('[data-add]', detail).forEach(function (b) { b.disabled = hit.length > 0; if (b.tagName === 'A') { b.setAttribute('aria-disabled', hit.length > 0 ? 'true' : 'false'); b.style.pointerEvents = hit.length > 0 ? 'none' : ''; b.style.opacity = hit.length > 0 ? '.45' : ''; } });
      if (hit.length) {
        alert.className = 'alert alert--warn';
        alert.textContent = T('notSuitable', { list: hit.join(', ') });
      } else if (soft.length) {
        alert.className = 'alert alert--ok';
        alert.textContent = T('dislikeHit', { list: soft.join(', ') });
      }
    });
  }

  function initProfileForm() {
    var form = $('[data-profile-form]');
    if (!form) return;
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

  /* ---------- menu filters ---------- */
  function initFilters() {
    var bar = $('[data-filters]');
    if (!bar) return;
    var state = { category: 'all', diets: [], tier: 'all' };
    var scope = bar.closest('section') || document;
    var run = function () {
      $$('[data-dish]', scope).forEach(function (c) {
        var okCat = state.category === 'all' || c.getAttribute('data-category') === state.category;
        var diets = (c.getAttribute('data-diets') || '').split('|');
        var okDiet = state.diets.every(function (d) { return diets.indexOf(d) > -1; });
        var okTier = state.tier === 'all' || c.getAttribute('data-tier') === state.tier;
        c.classList.toggle('is-hidden', !(okCat && okDiet && okTier));
      });
      var vis = $$('[data-dish]:not(.is-hidden)', scope).length;
      var empty = $('[data-empty]', scope); if (empty) empty.hidden = vis > 0;
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
    // deep link: ?categoria=bowls&dieta=keto  (also works as #/menu?categoria=bowls)
    var deepLink = function () {
      var qs = location.search || (location.hash.indexOf('?') > -1 ? location.hash.slice(location.hash.indexOf('?')) : '');
      var q = new URLSearchParams(qs);
      if (!q.get('categoria') && !q.get('dieta')) return;
      // a new deep link replaces whatever was selected before
      $$('[data-filter="diet"][aria-pressed="true"]', bar).forEach(function (x) { x.click(); });
      var allCat = $('[data-filter="category"][data-value="all"]', bar); if (allCat) allCat.click();
      var allTier = $('[data-filter="tier"][data-value="all"]', bar); if (allTier) allTier.click();
      if (q.get('categoria')) { var cb = $('[data-filter="category"][data-value="' + q.get('categoria') + '"]', bar); if (cb) cb.click(); }
      if (q.get('dieta')) {
        var db = $('[data-filter="diet"][data-value="' + q.get('dieta') + '"]', bar);
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
    var gate = function () { if (checkout) checkout.disabled = !(contract && contract.checked); };
    if (contract) { contract.addEventListener('change', gate); gate(); }

    var ref = $('[data-referral]', form), refMsg = $('[data-referral-msg]', form), giftBox = $('[data-gift]', form);
    var saved = ''; try { saved = localStorage.getItem('kulinaria_ref') || ''; } catch (e) {}
    if (ref && !ref.value && saved) ref.value = saved;
    var showGift = function () { if (giftBox) giftBox.hidden = !(ref && ref.value.trim().length >= 3); };
    if (ref) {
      ref.addEventListener('input', function () { ref.value = ref.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''); showGift(); });
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
      '.section__head .eyebrow,.section__head .lede,.spec,.rail__nav,.filter-sticky,.filter-secondary,.fg__foot,.countdown';
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
  function initFunnel() {
    $$('[data-funnel]').forEach(function (holder) {
      var MEALS = +holder.getAttribute('data-meals') || 5, WEEKS = +holder.getAttribute('data-weeks') || 4;
      var st = { plan: 'block', tier: 'selecto', cat: 'all', diet: 'all', qty: {}, days: [], info: {}, allergies: [], step: 0, remembered: false, renew: true };
      try { var saved = JSON.parse(localStorage.getItem(FUNNEL_KEY) || 'null'); if (saved && saved.v === 2) { st = Object.assign(st, saved); st.remembered = !!(saved.info && (saved.info.name || saved.info.email)); } } catch (e) {}
      var T_ = function (k) { return holder.getAttribute('data-t-' + k) || ''; };
      var steps = $$('[data-fn-step]', holder), dots = $$('[data-fn-dot]', holder), bar = $('[data-fn-bar]', holder);
      var next = $('[data-fn-next]', holder), prev = $('[data-fn-prev]', holder), finish = $('[data-fn-finish]', holder), err = $('[data-fn-error]', holder);
      var dishes = $$('[data-fn-dish]', holder), tierBtns = $$('[data-tier-choice]', holder);
      var TIERS = ['selecto', 'exclusivo', 'signature', 'reserve'], rank = function (t) { var r = TIERS.indexOf(t); return r < 0 ? 0 : r; };
      var dayNames = (T_('days') || 'Lun,Mar,Mié,Jue,Vie').split(','), daysBox = $('[data-fn-days]', holder);
      var blankDays = function () { var a = []; for (var j = 0; j < MEALS; j++) a.push(''); return a; };
      var byPid = function (id) { return dishes.filter(function (d) { return d.getAttribute('data-pid') === id; })[0]; };
      var upg = function (n) { return +holder.getAttribute('data-upg-' + n) || 70 * n; };
      var levelOf = function (d) { return d ? Math.max(0, Math.min(3, rank(d.getAttribute('data-tier')) - rank(st.tier))) : 0; };
      // first visit with an old selection (quantities) -> turn it into day slots
      if (!Array.isArray(st.days) || st.days.length !== MEALS) { var seq = []; Object.keys(st.qty || {}).forEach(function (k) { for (var j = 0; j < st.qty[k]; j++) seq.push(k); }); st.days = blankDays().map(function (x, j) { return seq[j] || ''; }); }
      var eligible = function (d) { return !!d && rank(d.getAttribute('data-tier')) >= rank(st.tier) && !d.classList.contains('is-blocked'); };
      var upgradeExtra = function () { var sum = 0; st.days.forEach(function (p) { var l = levelOf(byPid(p)); if (l) sum += upg(l); }); return sum * (st.plan === 'block' ? WEEKS : 1); };
      var money = function (n) {
        try { return new Intl.NumberFormat(cfg.lang === 'en' ? 'en-US' : 'es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n); } catch (e) { return '$' + Math.round(n); }
      };
      var tierEl = function () { return $('[data-tier-choice="' + st.tier + '"]', holder) || tierBtns[0]; };
      var priceOf = function (btn, plan) { return +btn.getAttribute(plan === 'block' ? 'data-block' : 'data-week') || 0; };
      var count = function () { return st.days.filter(Boolean).length; };
      var persist = function () { try { localStorage.setItem(FUNNEL_KEY, JSON.stringify(Object.assign({ v: 2 }, st))); } catch (e) {} };
      var say = function (msg) { if (!err) return; err.hidden = !msg; err.textContent = msg || ''; };
      var fill = function (tpl, o) { return String(tpl).replace(/\{(\w+)\}/g, function (m, k) { return o[k] != null ? o[k] : m; }); };
      var planTotal = function () { return priceOf(tierEl(), st.plan) + upgradeExtra(); };

      var buildDays = function () {
        if (!daysBox) return;
        var key = st.tier + '|' + dishes.length; if (daysBox.getAttribute('data-built') === key) return;
        daysBox.setAttribute('data-built', key); daysBox.innerHTML = '';
        var opts = dishes.filter(eligible);
        for (var i = 0; i < MEALS; i++) {
          (function (i) {
            var li = document.createElement('li'), lab = document.createElement('label'), sel = document.createElement('select'), id = 'fn-day-' + i + '-' + Math.random().toString(36).slice(2, 6);
            sel.className = 'select'; sel.id = id; sel.setAttribute('data-fn-day', i); lab.setAttribute('for', id); lab.textContent = dayNames[i] || ('#' + (i + 1));
            var o0 = document.createElement('option'); o0.value = ''; o0.textContent = T_('day-empty'); sel.appendChild(o0);
            opts.forEach(function (d) { var o = document.createElement('option'), l = levelOf(d); o.value = d.getAttribute('data-pid'); o.textContent = d.getAttribute('data-title') + (l ? ' · ' + fill(T_('up-badge'), { p: money(upg(l)) }) : ''); sel.appendChild(o); });
            sel.addEventListener('change', function () { st.days[i] = sel.value; say(''); persist(); render(); });
            li.appendChild(lab); li.appendChild(sel); daysBox.appendChild(li);
          })(i);
        }
      };

      var render = function () {
        // dishes of a lower tier or blocked by the profile cannot stay in the plan; slots are the source of truth
        st.days = st.days.map(function (p) { return p && eligible(byPid(p)) ? p : ''; });
        st.qty = {}; st.days.forEach(function (p) { if (p) st.qty[p] = (st.qty[p] || 0) + 1; });
        buildDays(); if (daysBox) $$('select[data-fn-day]', daysBox).forEach(function (sel) { sel.value = st.days[+sel.getAttribute('data-fn-day')] || ''; sel.closest('li').classList.toggle('is-set', !!sel.value); });
        $$('[data-plan-choice]', holder).forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-plan-choice') === st.plan ? 'true' : 'false'); });
        tierBtns.forEach(function (b) {
          b.setAttribute('aria-checked', b === tierEl() ? 'true' : 'false');
          var pr = $('[data-fn-tier-price]', b), sub = $('[data-fn-tier-sub]', b), meal = +b.getAttribute('data-meal') || 0;
          var total = priceOf(b, st.plan), n = st.plan === 'block' ? MEALS * WEEKS : MEALS;
          if (pr) { pr.firstChild.nodeValue = money(total); if (sub) sub.textContent = n + ' · ' + money(Math.round(total / n)) + ' ' + T_('per-meal'); }
        });
        $$('[data-cat]', holder).forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-cat') === st.cat ? 'true' : 'false'); });
        $$('[data-diet]', holder).forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-diet') === st.diet ? 'true' : 'false'); });
        var n = count(), full = n >= MEALS, shown = 0;
        dishes.forEach(function (d) {
          var show = rank(d.getAttribute('data-tier')) >= rank(st.tier) && (st.cat === 'all' || d.getAttribute('data-category') === st.cat) && (st.diet === 'all' || (d.getAttribute('data-diets') || '').split('|').indexOf(st.diet) > -1);
          d.classList.toggle('is-hidden', !show); if (show) shown++;
          var q = st.qty[d.getAttribute('data-pid')] || 0;
          var upEl = $('[data-fn-up]', d), lv = levelOf(d); if (upEl) { upEl.hidden = !lv; upEl.textContent = lv ? fill(T_('up-badge'), { p: money(upg(lv)) }) : ''; }
          d.classList.toggle('is-picked', q > 0);
          var ctl = $('[data-fn-qty]', d), out = $('[data-q-out]', d), pick = $('[data-pick]', d), plus = $('[data-q-plus]', d);
          if (ctl) ctl.hidden = q === 0; if (out) out.textContent = q;
          if (pick) { pick.hidden = q > 0; pick.disabled = full && q === 0 || d.classList.contains('is-blocked'); }
          if (plus) plus.disabled = full;
        });
        var e1 = $('[data-fn-empty]', holder); if (e1) e1.hidden = shown > 0;
        // meter + summary
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
            var d = pid && byPid(pid); if (!d) return; var l = levelOf(d);
            var li = document.createElement('li'); li.innerHTML = '<span></span><b></b>'; li.firstChild.textContent = (dayNames[i] || '') + ' · ' + d.getAttribute('data-title'); li.lastChild.textContent = l ? '+' + money(upg(l)) : '';
            list.appendChild(li);
          });
        }
        var upl = $('[data-fn-s-up]', holder); if (upl) { var ex = upgradeExtra(); upl.hidden = !ex; upl.textContent = ex ? fill(T_('up-total'), { p: money(ex) }) : ''; }
        var emp = $('[data-fn-s-empty]', holder); if (emp) emp.hidden = n > 0;
        var cnt = $('[data-fn-s-count]', holder); if (cnt) cnt.textContent = n ? fill(T_('meals'), { n: n, t: MEALS }) : '';
        var tot = $('[data-fn-s-total]', holder); if (tot) tot.textContent = money(planTotal());
        var sb = $('[data-fn-s-block]', holder); if (sb) { sb.hidden = false; sb.textContent = st.plan === 'block' ? fill(T_('weeks-x'), { p: money(planTotal() / WEEKS), w: WEEKS }) : fill(T_('per-week'), { p: money(planTotal()) }); }
        var sc = $('[data-fn-stepcount]', holder); if (sc) sc.textContent = T_('step-of').replace('{n}', st.step + 1).replace('{t}', steps.length) + ' · ' + ((dots[st.step] && dots[st.step].textContent.replace(/^\s*\d+/, '').trim()) || '');
        var rn = $('[data-fn-renew]', holder); if (rn) { var hasPlan = !!tierEl().getAttribute('data-selling-plan'); rn.hidden = !(hasPlan && st.plan === 'block'); var box = $('[data-fn-renew-box]', holder); if (box) box.checked = st.renew; }
        // stepper
        steps.forEach(function (s, k) { s.classList.toggle('is-on', k === st.step); });
        dots.forEach(function (d, k) { d.classList.toggle('is-on', k === st.step); d.classList.toggle('is-done', k < st.step); });
        if (bar) bar.style.transform = 'scaleX(' + ((st.step + 1) / steps.length) + ')';
        var last = st.step === steps.length - 1;
        if (prev) prev.hidden = st.step === 0;
        if (next) { next.hidden = last; next.disabled = (st.step === 2 && n !== MEALS); }
        if (finish) finish.hidden = !last;
        var rem = $('[data-fn-remembered]', holder); if (rem) { rem.hidden = !(st.remembered && st.step === 3); rem.textContent = T_('remembered'); }
      };

      // the page keeps scrolling normally; changing step brings the top of the funnel back into view if needed
      var top = $('.funnel__top', holder);
      var go = function (n) {
        n = Math.max(0, Math.min(steps.length - 1, n)); var moved = n !== st.step; st.step = n; say(''); persist(); render();
        if (moved && top) {
          var r = top.getBoundingClientRect(), hdr = (parseFloat(getComputedStyle(root).getPropertyValue('--hdr')) || 72) + 8;
          if (r.top < hdr || r.top > window.innerHeight * 0.5) window.scrollTo({ top: r.top + window.scrollY - hdr, behavior: REDUCE ? 'auto' : 'smooth' });
        }
      };

      // choices
      $$('[data-plan-choice]', holder).forEach(function (b) { b.addEventListener('click', function () { st.plan = b.getAttribute('data-plan-choice'); persist(); render(); setTimeout(function () { go(1); }, REDUCE ? 0 : 280); }); });
      tierBtns.forEach(function (b) {
        b.addEventListener('click', function () {
          var t = b.getAttribute('data-tier-choice');
          if (t !== st.tier) { st.tier = t; if (daysBox) daysBox.removeAttribute('data-built'); }            // render() drops slots that no longer fit the tier
          persist(); render(); setTimeout(function () { go(2); }, REDUCE ? 0 : 280);
        });
      });
      $$('[data-cat]', holder).forEach(function (b) { b.addEventListener('click', function () { st.cat = b.getAttribute('data-cat'); persist(); render(); }); });
      $$('[data-diet]', holder).forEach(function (b) { b.addEventListener('click', function () { st.diet = b.getAttribute('data-diet'); persist(); render(); }); });
      var renewBox = $('[data-fn-renew-box]', holder); if (renewBox) renewBox.addEventListener('change', function () { st.renew = renewBox.checked; persist(); });
      holder.addEventListener('click', function (e) {
        var d = e.target.closest ? e.target.closest('[data-fn-dish]') : null; if (!d) return;
        var id = d.getAttribute('data-pid');
        var isPick = e.target.closest('[data-pick]'), isPlus = e.target.closest('[data-q-plus]'), isMinus = e.target.closest('[data-q-minus]');
        if (!isPick && !isPlus && !isMinus) return;
        if (isMinus) { var at = st.days.lastIndexOf(id); if (at > -1) st.days[at] = ''; }
        else { if (isPick && d.classList.contains('is-blocked')) return; var free = st.days.indexOf(''); if (free < 0) { say(T_('full')); return; } st.days[free] = id; }
        say(''); persist(); render();
      });
      var reset = $('[data-fn-reset]', holder);
      if (reset) reset.addEventListener('click', function () { st.qty = {}; st.days = blankDays(); if (daysBox) daysBox.removeAttribute('data-built'); st.cat = 'all'; st.diet = 'all'; st.tier = 'selecto'; st.plan = 'block'; st.step = 0; persist(); render(); });

      // details
      var fields = $$('[data-info]', holder), checks = $$('[data-allergy]', holder), ref = $('[data-fn-ref]', holder);
      fields.forEach(function (f) { f.value = (st.info && st.info[f.getAttribute('data-info')]) || ''; f.addEventListener('input', function () { st.info = st.info || {}; st.info[f.getAttribute('data-info')] = f.value; persist(); }); });
      checks.forEach(function (c) { c.checked = (st.allergies || []).map(norm).indexOf(norm(c.value)) > -1; c.addEventListener('change', function () { st.allergies = checks.filter(function (x) { return x.checked; }).map(function (x) { return x.value; }); persist(); }); });
      var cn = holder.getAttribute('data-customer-name'), ce = holder.getAttribute('data-customer-email');
      if (ce) { st.info = st.info || {}; if (!st.info.email) st.info.email = ce; if (!st.info.name && cn) st.info.name = cn; fields.forEach(function (f) { var v = st.info[f.getAttribute('data-info')]; if (v && !f.value) f.value = v; }); }
      if (ref) { var rs = ''; try { rs = localStorage.getItem('kulinaria_ref') || ''; } catch (e) {} if (rs) ref.value = rs; }

      if (next) next.addEventListener('click', function () {
        if (st.step === 2 && count() !== MEALS) { say(T_('need-meals')); return; }
        go(st.step + 1);
      });
      if (prev) prev.addEventListener('click', function () { go(st.step - 1); });
      dots.forEach(function (d, k) { d.addEventListener('click', function () { if (k < st.step || (k > st.step && (k <= 2 || count() === MEALS))) go(k); }); });

      // arriving from a dish page (…/pedido?dish=handle): that dish is already in the plan, at its tier
      try {
        var q = (location.search + '&' + (location.hash.split('?')[1] || '')).match(/[?&]dish=([\w-]+)/);
        if (q) {
          var pre = dishes.filter(function (d) { return d.getAttribute('data-handle') === q[1]; })[0];
          if (pre) { st.tier = pre.getAttribute('data-tier'); st.days = blankDays(); st.days[0] = pre.getAttribute('data-pid'); if (daysBox) daysBox.removeAttribute('data-built'); st.step = 1; persist(); }
        }
      } catch (e) {}

      // finish: save the profile + attributes, put the PLAN in the cart (one line; the chosen dishes travel as line properties), continue to the cart
      if (finish) finish.addEventListener('click', function (e) {
        e.preventDefault();
        var i = st.info || {}, tb = tierEl();
        if (!i.name || !i.email || !i.phone) { say(T_('need-info')); return; }
        if (count() !== MEALS) { say(T_('need-meals')); go(2); return; }
        var cbox = $('[data-fn-contract]', holder); if (cbox && !cbox.checked) { say(T_('need-contract')); return; }
        var p = loadProfile();
        var other = (i.allergy_other || '').split(',').map(function (v) { return v.trim(); }).filter(Boolean);
        p.allergies = Array.from(new Set((st.allergies || []).concat(other)));
        p.dislikes = (i.dislikes || '').split(',').map(function (v) { return v.trim(); }).filter(Boolean);
        p.diets = st.diet === 'all' ? [] : [st.diet];
        try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (x) {}
        var list = dishes.filter(function (d) { return st.qty[d.getAttribute('data-pid')]; }).map(function (d) { return st.qty[d.getAttribute('data-pid')] + '× ' + d.getAttribute('data-title'); }).join(' | ');
        var cl = function (k) { return (i[k] || '').trim(); };
        var attrs = {
          nombre: i.name, correo: i.email, telefono: i.phone, direccion: [i.street, i.cluster, i.zip].filter(Boolean).join(', '), calle: cl('street'), cluster: cl('cluster'), cp: cl('zip'), contrato_aceptado: 'sí',
          dias: st.days.map(function (p, k) { var d = byPid(p); return (dayNames[k] || k + 1) + ': ' + (d ? d.getAttribute('data-title') : ''); }).join(' | '),
          alergias: p.allergies.join(', '), no_me_gustan: p.dislikes.join(', '), dietas: p.diets.join(', '), plan: st.plan, nivel: st.tier,
          codigo_referencia: (ref && ref.value) || '', pedido_embudo: list
        };
        if (ref && ref.value) { try { localStorage.setItem('kulinaria_ref', ref.value); } catch (x) {} }
        var props = {}; props[T_('prop-meals')] = String(MEALS); props[T_('prop-tier')] = tb.getAttribute('data-name'); props[T_('prop-length')] = st.plan === 'block' ? T_('length-block') : T_('length-week');
        st.days.forEach(function (p, k) { var dd = byPid(p); if (dd) props[dayNames[k] || String(k + 1)] = dd.getAttribute('data-title'); });
        props['_platillos'] = list;
        var line = { id: parseInt(tb.getAttribute(st.plan === 'block' ? 'data-variant-block' : 'data-variant-week'), 10), quantity: 1, properties: props };
        var sp = tb.getAttribute('data-selling-plan'); if (st.plan === 'block' && st.renew && sp) line.selling_plan = parseInt(sp, 10);
        var lines = [line];
        for (var lvl = 1; lvl <= 3; lvl++) {
          var names = []; st.days.forEach(function (p) { var dd = byPid(p); if (dd && levelOf(dd) === lvl) names.push(dd.getAttribute('data-title')); });
          var vid = parseInt(holder.getAttribute('data-upv-' + lvl), 10);
          if (names.length && vid) { var up = {}; up[T_('prop-upgrade')] = names.join(', '); lines.push({ id: vid, quantity: names.length * (st.plan === 'block' ? WEEKS : 1), properties: up }); }
        }
        st.remembered = true; persist();
        var go2 = function () { window.location.href = finish.getAttribute('href'); };
        fetch('/cart/clear.js', { method: 'POST' })
          .then(function () { return fetch('/cart/update.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attributes: attrs }) }); })
          .then(function () { return fetch('/cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: lines }) }); })
          .then(go2, go2);
      });

      applyProfile();
      render();
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

  var THEMES = ['light', 'dark', 'fuego'], THEME_COLOR = { light: '#F5F4EC', dark: '#0D0C0A', fuego: '#0E0E0E' };
  function paintTheme(t) {
    root.setAttribute('data-theme', t);
    $$('[data-theme-pick]').forEach(function (d) { d.classList.toggle('on', d.getAttribute('data-theme-pick') === t); });
    var meta = $('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', THEME_COLOR[t] || THEME_COLOR.light);
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

  // gold dust drifting over the wood background
  function initParticles() {
    var c = $('[data-particles]'); if (!c || !c.getContext) return;
    var ctx = c.getContext('2d'), W = 0, H = 0, dpr = Math.min(2, window.devicePixelRatio || 1), ps = [], mx = -999, my = -999, running = false;
    var dark = function () { var t = root.getAttribute('data-theme'); return t === 'dark' || t === 'fuego'; };
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
    [initWordmark, initSheets, initSitemapToggles, initSwipeDots, initLoader, initTheme, initParticles, initMenu, initCountdown, initSteps, initFunnel, initPauseLocks, initFilters, initProfileForm, initCart, initRefSave, applyProfile,
      initSplit, initReveal, initChrome, initScrollVars, initPointer, initRail, initVideos, initBand, initFire, initTilt, initPeek].forEach(run);
    document.documentElement.classList.add('motion-ready');
    window.addEventListener('load', function () { run(initWordmarkScan); });
  });
})();
