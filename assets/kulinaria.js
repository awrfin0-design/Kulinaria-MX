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
    var alert = $('[data-allergen-alert]');
    if (alert) {
      var card = $('[data-dish-detail]');
      if (card && (al.length || dl.length)) {
        var tags = (card.getAttribute('data-allergens') || '').split('|').map(norm);
        var ings = (card.getAttribute('data-ingredients') || '').split('|').map(norm);
        var hit = al.filter(function (a) { return tags.indexOf(a) > -1 || ings.indexOf(a) > -1; });
        var soft = dl.filter(function (d) { return ings.some(function (i) { return i.indexOf(d) > -1; }); });
        alert.hidden = !(hit.length || soft.length);
        if (hit.length) {
          alert.className = 'alert alert--warn';
          alert.textContent = 'No apto para tu perfil: contiene ' + hit.join(', ') + '.';
          $$('[data-add]').forEach(function (b) { b.disabled = true; });
        } else if (soft.length) {
          alert.className = 'alert alert--ok';
          alert.textContent = 'Contiene ingredientes que marcaste como "no me gustan": ' + soft.join(', ') + '.';
        }
      }
    }
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
    // deep link: ?categoria=bowls&dieta=keto
    var q = new URLSearchParams(location.search);
    if (q.get('categoria')) { var cb = $('[data-filter="category"][data-value="' + q.get('categoria') + '"]', bar); if (cb) cb.click(); }
    if (q.get('dieta')) { var db = $('[data-filter="diet"][data-value="' + q.get('dieta') + '"]', bar); if (db) db.click(); }
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
        var checked = $('input[name="gift"]:checked', form);
        if (!checked) return;
        b.disabled = true;
        fetch('/cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: [{ id: parseInt(checked.value, 10), quantity: 1,
            properties: { _regalo_bienvenida: 'true', Talla: ($('[name="gift_size"]', form) || {}).value || '' } }] }) })
          .then(function () { location.reload(); }).catch(function () { b.disabled = false; });
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

  document.addEventListener('DOMContentLoaded', function () {
    initNav(); initCountdown(); initPauseLocks(); initFilters(); initProfileForm(); initCart(); initRefSave(); applyProfile();
  });
})();
