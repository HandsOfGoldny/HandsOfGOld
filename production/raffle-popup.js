/* Hands of Gold — Monthly Giveaway popup  (v3: honeypot + timing check + polite auto-open)
   Drop in site root, add before </body>:  <script src="/raffle-popup.js" defer></script>
   Auto-opens once per session, not while a form is in use, not after close. Posts to /api/leads as leadType giveaway_YYYYMM.
   ------------------------------------------------------------------ */
(function () {
  'use strict';

  /* ---- EDIT THESE EACH MONTH ---- */
  var PRIZE      = 'a lightweight 14K gold bracelet';
  var PRIZE_NOTE = 'Valued under $200. Entries close September 30, 2026 at 11:59 p.m. Eastern. Winner drawn within five business days afterward.';
  var RULES_URL  = '/giveaway-rules.html';
  /* ------------------------------- */

  var MIN_SECONDS = 3;          // faster than this = bot
  var CYCLE = '202609';
  var CLOSE_AT = Date.parse('2026-10-01T00:00:00-04:00');
  var expired = Date.now() >= CLOSE_AT;
  var ENDPOINT = '/api/leads';

  var css = ''
    + '.hog-gw-veil{position:fixed;inset:0;background:rgba(8,11,18,.78);backdrop-filter:blur(3px);'
    + 'display:flex;align-items:center;justify-content:center;padding:20px;z-index:9999;opacity:0;transition:opacity .35s ease}'
    + '.hog-gw-veil.in{opacity:1}'
    + '.hog-gw{position:relative;width:100%;max-width:430px;background:linear-gradient(168deg,#0A2E73 0%,#061A3A 62%,#080B12 100%);'
    + 'border:1px solid #C79638;border-radius:14px;padding:34px 30px 26px;color:#F6F3EC;'
    + 'box-shadow:0 26px 70px rgba(0,0,0,.6),0 0 0 1px rgba(199,150,56,.25);'
    + 'box-sizing:border-box;max-height:calc(100dvh - 40px);transform:translateY(14px) scale(.97);transition:transform .4s cubic-bezier(.2,.8,.3,1);overflow:auto}'
    + '.hog-gw-veil.in .hog-gw{transform:none}'
    + '.hog-gw:before{content:"";position:absolute;top:0;left:-60%;width:60%;height:100%;pointer-events:none;'
    + 'background:linear-gradient(105deg,transparent,rgba(214,173,92,.30),transparent);animation:hogSheen 1.5s ease-out .35s 1 forwards}'
    + '@keyframes hogSheen{to{left:130%}}'
    + '.hog-gw-x{position:absolute;top:10px;right:12px;background:none;border:0;color:rgba(246,243,236,.55);'
    + 'font-size:26px;line-height:1;cursor:pointer;padding:6px}'
    + '.hog-gw-x:hover{color:#C79638}'
    + '.hog-gw-kicker{color:#C79638;font-size:12.5px;letter-spacing:.09em;margin:0 0 8px}'
    + '.hog-gw h2{font-family:"Bodoni Moda",Georgia,serif;font-size:30px;line-height:1.14;margin:0 0 10px;font-weight:600}'
    + '.hog-gw p.sub{font-size:14.5px;line-height:1.5;color:rgba(246,243,236,.82);margin:0 0 18px}'
    + '.hog-gw input[type=text],.hog-gw input[type=email],.hog-gw input[type=tel]{width:100%;box-sizing:border-box;'
    + 'background:rgba(246,243,236,.06);border:1px solid rgba(255,255,255,.14);border-radius:8px;'
    + 'color:#F6F3EC;font-size:15px;padding:12px 13px;margin-bottom:10px}'
    + '.hog-gw input::placeholder{color:rgba(246,243,236,.45)}'
    + '.hog-gw input:focus{outline:2px solid #C79638;outline-offset:1px;border-color:#C79638}'
    /* honeypot: off-screen, never visible, never focusable */
    + '.hog-gw-hp{position:absolute!important;left:-9999px!important;top:auto!important;'
    + 'width:1px!important;height:1px!important;overflow:hidden!important;opacity:0!important}'
    + '.hog-gw-consent{display:flex;gap:9px;align-items:flex-start;font-size:12.5px;line-height:1.45;'
    + 'color:rgba(246,243,236,.72);margin:4px 0 16px}'
    + '.hog-gw-consent input{margin-top:2px;accent-color:#C79638;flex:0 0 auto}'
    + '.hog-gw button.go{width:100%;background:#C79638;color:#080B12;border:0;border-radius:8px;'
    + 'font-size:16px;font-weight:700;padding:14px;cursor:pointer;transition:background .2s}'
    + '.hog-gw button.go:hover{background:#D6AD5C}'
    + '.hog-gw button.go:disabled{opacity:.6;cursor:default}'
    + '.hog-gw-fine{font-size:11.5px;color:rgba(246,243,236,.5);margin:13px 0 0;line-height:1.5}'
    + '.hog-gw-fine a{color:rgba(199,150,56,.9)}'
    + '.hog-gw-err{color:#F08C8C;font-size:13px;margin:0 0 10px;display:none}'
    + '.hog-gw-done{text-align:center;padding:12px 0 6px}'
    + '.hog-gw-done h2{margin-bottom:8px}'
    + '@media (prefers-reduced-motion:reduce){.hog-gw-veil,.hog-gw{transition:none}.hog-gw:before{display:none}}';

  css += 'body .hog-gw-veil .hog-gw h2{color:#F6F3EC!important}'
    + 'body .hog-gw-veil .hog-gw .hog-gw-kicker,body .hog-gw-veil .hog-gw a{color:#E7BC67!important}'
    + 'body .hog-gw-veil .hog-gw .hog-gw-fine{color:#D0D4DC!important}'
    + 'body .hog-gw-veil .hog-gw input:not([type=checkbox]){background:#102440!important;color:#fff!important;border-color:#8591A3!important}'
    + 'body .hog-gw-veil .hog-gw input::placeholder{color:#CFD5E0!important;opacity:1!important}'
    + 'body .hog-gw-veil .hog-gw .hog-gw-err{color:#FFB7B7!important}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var veil = document.createElement('div');
  veil.className = 'hog-gw-veil';
  veil.setAttribute('role', 'dialog');
  veil.setAttribute('aria-modal', 'true');
  veil.setAttribute('aria-labelledby', 'hogGwTitle');
  veil.innerHTML = ''
    + '<div class="hog-gw">'
    + '<button class="hog-gw-x" aria-label="Close">&times;</button>'
    + '<p class="hog-gw-kicker">Hands of Gold Giveaways</p>'
    + '<h2 id="hogGwTitle">Win ' + PRIZE + '</h2>'
    + '<p class="sub">' + PRIZE_NOTE + ' One entry per person, free to enter.</p>'
    + '<p class="hog-gw-err" role="alert"></p>'
    + '<form novalidate autocomplete="on">'
    + '<input type="text" name="name" aria-label="Your name" placeholder="Your name" autocomplete="name" required>'
    + '<input type="email" name="email" aria-label="Email" placeholder="Email" autocomplete="email" required>'
    + '<input type="tel" name="phone" aria-label="Phone" placeholder="Phone (so we can reach you if you win)" autocomplete="tel">'
    /* --- honeypot: humans never see or tab into this --- */
    + '<div class="hog-gw-hp" aria-hidden="true">'
    + '<label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label>'
    + '</div>'
    + '<label class="hog-gw-consent"><input type="checkbox" name="consent" required>'
    + '<span>I am 18+, a New York resident, and agree to the <a href="' + RULES_URL + '">official rules</a>. Hands of Gold may contact me about my entry.</span></label>'
    + '<button type="submit" class="go">Enter the Free Giveaway</button>'
    + '</form>'
    + '<p class="hog-gw-fine">No purchase necessary. Must be 18+ and a New York resident. '
    + '<a href="' + RULES_URL + '">Official rules</a></p>'
    + '</div>';

  if (expired) {
    veil.querySelector('.hog-gw').innerHTML = '<button class="hog-gw-x" aria-label="Close">&times;</button>' +
      '<p class="hog-gw-kicker">Hands of Gold Giveaways</p>' +
      '<h2 id="hogGwTitle">This giveaway has closed</h2>' +
      '<p class="sub">Entries for the 14K gold bracelet closed September 30, 2026. Visit us at 494 Oak Street in Copiague to ask about upcoming giveaways.</p>' +
      '<p class="hog-gw-fine"><a href="' + RULES_URL + '">Official rules</a></p>';
  }

  var shown = false, lastFocus = null, openedAt = 0, closeTimer = null;

  function open(force) {
    if (shown && !force) return;
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    if (veil.parentNode) { veil.classList.add('in'); document.addEventListener('keydown', onKey); var field = veil.querySelector('input[name="name"]'); if (field) field.focus(); return; }
    shown = true;
    openedAt = Date.now();
    lastFocus = document.activeElement;
    document.body.appendChild(veil);
    requestAnimationFrame(function () { veil.classList.add('in'); });
    var f = veil.querySelector('.hog-gw-x');
    if (f) f.focus();
    document.addEventListener('keydown', onKey);
    push('giveaway_view');
  }

  function close() {
    veil.classList.remove('in');
    document.removeEventListener('keydown', onKey);
    closeTimer = setTimeout(function () { if (veil.parentNode) veil.parentNode.removeChild(veil); closeTimer = null; }, 350);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
    if (e.key !== 'Tab') return;
    var focusable = Array.prototype.filter.call(veil.querySelectorAll('button, input, a[href]'), function (el) {
      return !el.disabled && el.tabIndex >= 0 && el.offsetParent !== null;
    });
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (!first) return;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function push(ev) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: ev, cycle: CYCLE });
  }

  veil.addEventListener('click', function (e) {
    if (e.target === veil || e.target.classList.contains('hog-gw-x')) close();
  });

  var entryForm = veil.querySelector('form');
  if (entryForm) entryForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target;
    var err  = veil.querySelector('.hog-gw-err');
    var btn  = form.querySelector('button.go');
    var name = form.elements.namedItem('name').value.trim();
    var mail = form.elements.namedItem('email').value.trim();
    var elapsed = (Date.now() - openedAt) / 1000;

    err.style.display = 'none';
    if (Date.now() >= CLOSE_AT) { err.textContent = 'Entries closed September 30, 2026.'; err.style.display = 'block'; return; }
    if (form.elements.namedItem('website').value.trim()) { err.textContent = 'We could not accept this entry. Please call 631-264-6610.'; err.style.display = 'block'; return; }
    if (elapsed < MIN_SECONDS) { err.textContent = 'Please take a moment to review your entry, then try again.'; err.style.display = 'block'; return; }
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) {
      err.textContent = 'Add your name and a valid email to enter.';
      err.style.display = 'block'; return;
    }
    if (!form.consent.checked) {
      err.textContent = 'Please confirm your eligibility and agreement to the official rules.';
      err.style.display = 'block'; return;
    }

    btn.disabled = true; btn.textContent = 'Entering…';

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadType: 'giveaway_' + CYCLE,
        name: name, email: mail, phone: form.phone.value.trim(),
        offer: PRIZE, offer_terms: PRIZE_NOTE, page: location.pathname, consent: true,
        website: '',                          // honeypot, always empty from a human
        elapsed: Math.round(elapsed)          // server re-checks this
      })
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok || data.success !== true || !data.leadId) throw new Error('Entry not accepted');
        return data;
      });
    }).then(function () {
      push('giveaway_entry');
      veil.querySelector('.hog-gw').innerHTML =
        '<button class="hog-gw-x" aria-label="Close">&times;</button><div class="hog-gw-done"><h2 id="hogGwTitle">You\'re entered!</h2>' +
        '<p class="sub">The winner will be drawn within five business days after September 30. We will contact the winner by email or the phone number provided. One entry per person.</p></div>';
      veil.querySelector('.hog-gw-x').focus();
      setTimeout(close, 3200);
    }).catch(function () {
      btn.disabled = false; btn.textContent = 'Enter the Free Giveaway';
      err.textContent = 'That didn\'t go through. Try again, or call 631-264-6610.';
      err.style.display = 'block';
    });
  });

  window.addEventListener('hog:open-giveaway', function () { if (Date.now() < CLOSE_AT) open(true); });

  /* v3 auto-open rules: never after the close date, never while a visitor is
     using a form on the page (gold calculator, text-me, lead forms), and at
     most once per browser session. The "Enter now" banner still opens it. */
  if (expired) return;
  var SEEN_KEY = 'hogGwSeen_' + CYCLE;
  function seen() { try { return sessionStorage.getItem(SEEN_KEY) === '1'; } catch (x) { return false; } }
  function markSeen() { try { sessionStorage.setItem(SEEN_KEY, '1'); } catch (x) {} }
  if (seen()) return;
  var busy = false;
  document.addEventListener('focusin', function (e) {
    var t = e.target;
    if (t && !veil.contains(t) && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) busy = true;
  });
  function autoOpen() {
    if (busy || shown || seen() || Date.now() >= CLOSE_AT) return;
    markSeen();
    open(false);
  }
  setTimeout(autoOpen, 8000);
  window.addEventListener('scroll', function onScroll() {
    var h = document.documentElement;
    var pct = h.scrollTop / ((h.scrollHeight - h.clientHeight) || 1);
    if (pct > 0.3) { window.removeEventListener('scroll', onScroll); autoOpen(); }
  }, { passive: true });
})();
