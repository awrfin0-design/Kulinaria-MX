/* Kulinaria MX — storefront behaviour (vanilla JS, no dependencies)
   Modules: nav, weekly cutoff countdown, pause locks, menu filters,
   allergen/dislike profile (hard + soft filters), cart (contract, referral, gift). */
(function () {
  'use strict';

  var cfg = window.KULINARIA || {};
  var TZ = cfg.timezone || 'America/Mexico_City';
  var PROFILE_KEY = 'kulinaria_profile';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

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
    if (d) out.push(d + ' d');
    out.push(h + ' h');
    out.push(m + ' min');
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
        if (left) left.textContent = locked ? '' : 'Quedan ' + fmtCountdown(deadline - into) + ' para pausar.';
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
        badge.textContent = (al.length || dl.length) ? 'Compatibilidad ' + compat + '%' : '';
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
        alert.textContent = 'No apto para tu perfil: contiene ' + hit.join(', ') + '.';
      } else if (soft.length) {
        alert.className = 'alert alert--ok';
        alert.textContent = 'Contiene ingredientes que marcaste como "no me gustan": ' + soft.join(', ') + '.';
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
        var x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', 'Quitar ' + d); x.textContent = '×';
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

  /* ---------- nav ---------- */
  function initNav() {
    var t = $('[data-nav-toggle]'), n = $('[data-nav]');
    if (!t || !n) return;
    t.addEventListener('click', function () {
      var open = n.classList.toggle('is-open');
      t.setAttribute('aria-expanded', open);
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
      var nav = $('[data-nav]'), navOpen = !!(nav && nav.classList.contains('is-open'));
      var hide = hdr.classList.contains('is-hidden');
      if (REDUCE || navOpen) hide = false;
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
    targets.forEach(function (t) { io.observe(t); });
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
        var pl = $('.plate', hero), hr = hero.getBoundingClientRect();
        if (pl) { pl.style.setProperty('--tx', ((e.clientX - hr.left) / hr.width - 0.5).toFixed(3)); pl.style.setProperty('--ty', ((e.clientY - hr.top) / hr.height - 0.5).toFixed(3)); }
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
      track.addEventListener('scroll', raf(sync), { passive: true });
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

  document.addEventListener('DOMContentLoaded', function () {
    initNav(); initCountdown(); initPauseLocks(); initFilters(); initProfileForm(); initCart(); initRefSave(); applyProfile();
    initSplit(); initReveal(); initChrome(); initScrollVars(); initPointer(); initRail();
    document.documentElement.classList.add('motion-ready');
  });
})();
