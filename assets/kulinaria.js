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
      $$('[data-add]', detail).forEach(function (b) { b.disabled = hit.length > 0; });
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

  // scroll progress bar, sticky/auto-hiding header, --hdr / --stick offsets
  function initChrome() {
    var root = document.documentElement, hdr = $('.site-header');
    var bar = document.createElement('div');
    bar.className = 'scroll-progress'; bar.setAttribute('aria-hidden', 'true'); document.body.appendChild(bar);
    var last = window.scrollY;
    var measure = function () { if (hdr) root.style.setProperty('--hdr', hdr.offsetHeight + 'px'); };
    var update = function () {
      var y = window.scrollY, max = root.scrollHeight - window.innerHeight;
      bar.style.setProperty('--sp', max > 0 ? Math.min(1, y / max).toFixed(4) : '0');
      if (!hdr) return;
      hdr.classList.toggle('is-stuck', y > 24);
      var hide = hdr.classList.contains('is-hidden');
      if (REDUCE || document.body.classList.contains('menu-open')) hide = false;
      else if (y > 280 && y > last + 6) hide = true;
      else if (y < last - 6 || y <= 280) hide = false;
      hdr.classList.toggle('is-hidden', hide);
      root.style.setProperty('--stick', hide ? '0px' : hdr.offsetHeight + 'px');
      last = y;
    };
    window.addEventListener('scroll', raf(update), { passive: true });
    window.addEventListener('resize', function () { measure(); update(); });
    measure(); update();
  }

  // headline words rise in one by one
  function initSplit() {
    $$('.hero h1, .section__head h2, .cta-banner h2').forEach(function (h) {
      if (h.children.length || h.getAttribute('data-split')) return;
      var txt = h.textContent.replace(/\s+/g, ' ').trim();
      if (!txt) return;
      h.setAttribute('aria-label', txt); h.setAttribute('data-split', '1'); h.classList.add('split'); h.textContent = '';
      txt.split(' ').forEach(function (w, i, arr) {
        var s = document.createElement('span'); s.className = 'w'; s.setAttribute('aria-hidden', 'true');
        var inner = document.createElement('i'); inner.style.setProperty('--i', i); inner.textContent = w;
        s.appendChild(inner); h.appendChild(s);
        if (i < arr.length - 1) h.appendChild(document.createTextNode(' '));
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
    var t0 = performance.now();
    var done = function () {
      setTimeout(function () {
        root.classList.add('is-loaded');
        try { sessionStorage.setItem('kx-seen', '1'); } catch (e) {}
      }, Math.max(0, 1400 - (performance.now() - t0)));
    };
    if (document.readyState === 'complete') done(); else window.addEventListener('load', done);
  }

  function setTheme(t, persist) {
    root.setAttribute('data-theme', t);
    if (persist) { try { localStorage.setItem('kx-theme', t); } catch (e) {} }
    $$('[data-theme-toggle]').forEach(function (b) {
      b.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
      b.setAttribute('aria-label', t === 'dark' ? T('toLight') : T('toDark'));
    });
    var meta = $('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', t === 'dark' ? '#1F160F' : '#F6EFE0');
    document.dispatchEvent(new CustomEvent('kx:theme', { detail: t }));
  }
  function initTheme() {
    setTheme(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light', false);
    $$('[data-theme-toggle]').forEach(function (b) {
      b.addEventListener('click', function () { setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true); });
    });
  }

  // gold dust drifting over the wood background
  function initParticles() {
    var c = $('[data-particles]'); if (!c || !c.getContext) return;
    var ctx = c.getContext('2d'), W = 0, H = 0, dpr = Math.min(2, window.devicePixelRatio || 1), ps = [], mx = -999, my = -999, running = false;
    var dark = function () { return root.getAttribute('data-theme') === 'dark'; };
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
          ctx.fillStyle = 'rgba(176,126,38,' + (a * 0.55) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
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
    if (REDUCE || SAVE) return;   // poster frames only
    var hero = $('[data-hero]'), slides = hero ? $$('[data-slide]', hero) : [], paused = false, timer = null, cur = 0;
    var vis = new Map();
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var v = e.target; vis.set(v, e.isIntersecting);
        var inHero = hero && hero.contains(v);
        if (e.isIntersecting) {
          if (inHero && (paused || !v.closest('[data-slide]').classList.contains('is-on'))) { if (!v.getAttribute('data-ready')) loadVideo(v); return; }
          playVideo(v); if (v.hasAttribute('data-ambient')) v.classList.add('is-on');
        } else if (!v.paused) v.pause();
      });
    }, { threshold: 0.15 });
    vids.forEach(function (v) { io.observe(v); });

    if (slides.length > 1) {
      var show = function (i) {
        slides.forEach(function (sl, k) {
          var on = k === i; sl.classList.toggle('is-on', on);
          var v = $('video', sl); if (!v) return;
          if (on && !paused) playVideo(v); else if (!on) setTimeout(function () { if (!sl.classList.contains('is-on')) v.pause(); }, 1900);
        });
        cur = i;
      };
      var next = function () { show((cur + 1) % slides.length); };
      timer = setInterval(next, 7500);
      var tg = $('[data-media-toggle]', hero);
      if (tg) tg.addEventListener('click', function () {
        paused = !paused; tg.setAttribute('aria-pressed', paused ? 'true' : 'false'); tg.setAttribute('aria-label', paused ? T('play') : T('pause'));
        $$('video', hero).forEach(function (v) { if (paused) v.pause(); else if (v.closest('[data-slide]').classList.contains('is-on')) playVideo(v); });
        if (paused) clearInterval(timer); else timer = setInterval(next, 7500);
      });
    } else {
      var tg1 = hero && $('[data-media-toggle]', hero);
      if (tg1) tg1.addEventListener('click', function () {
        paused = !paused; tg1.setAttribute('aria-pressed', paused ? 'true' : 'false'); tg1.setAttribute('aria-label', paused ? T('play') : T('pause'));
        $$('video', hero).forEach(function (v) { if (paused) v.pause(); else playVideo(v); });
      });
    }
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

  // any pill button ignites with a fire loop on hover / focus
  function initFire() {
    var url = (cfg.media || {}).fire;
    if (!url || REDUCE || SAVE || !FINE) return;
    var start = function (b) {
      if (!b._fx) {
        var fx = document.createElement('span'); fx.className = 'btn__fx'; fx.setAttribute('aria-hidden', 'true');
        var v = document.createElement('video'); v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto'; v.src = resolve(url);
        fx.appendChild(v); b.appendChild(fx); b._fx = v;
      }
      b.classList.add('is-fx'); var p = b._fx.play(); if (p && p.catch) p.catch(function () {});
    };
    var stop = function (b) {
      b.classList.remove('is-fx');
      setTimeout(function () { if (b._fx && !b.classList.contains('is-fx')) b._fx.pause(); }, 700);
    };
    var pick = function (e) { var b = e.target.closest ? e.target.closest('.btn') : null; return b && !b.classList.contains('btn--ghost') && !b.disabled ? b : null; };
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

  document.addEventListener('DOMContentLoaded', function () {
    initLoader(); initTheme(); initParticles(); initMenu();
    initCountdown(); initPauseLocks(); initFilters(); initProfileForm(); initCart(); initRefSave(); applyProfile();
    initSplit(); initReveal(); initChrome(); initScrollVars(); initPointer(); initRail();
    initVideos(); initBand(); initFire(); initTilt(); initPeek();
    document.documentElement.classList.add('motion-ready');
  });
})();
