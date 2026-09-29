/* Hands of Gold - PWA registration + "Add to Home Screen" prompt.
 * Self-contained on purpose: nothing here touches script.js or style.css.
 *
 * Two rules it obeys, so it never fights the site:
 *   1. It stays hidden while the legacy offer popup (or the cart drawer, or any
 *      other overlay) is open. That lead capture is worth more than an install.
 *   2. It sits ABOVE the sticky mobile dock instead of covering Call/Custom/Visit.
 */
(function () {
  'use strict';

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/service-worker.js').catch(function () { /* silent */ });
    });
  }

  var KEY = 'hog-install-dismissed';
  var dl = (window.dataLayer = window.dataLayer || []);

  function isDismissed() {
    try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }
  function setDismissed() {
    try { localStorage.setItem(KEY, '1'); } catch (e) { /* private mode */ }
  }

  var installed = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
                  window.navigator.standalone === true;
  if (installed || isDismissed()) { return; }

  var ua = navigator.userAgent || '';
  var isIOS = /iPad|iPhone|iPod/.test(ua) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);

  var bar = null;

  /* --- is something more important already on screen? ---
   * Must be VISIBLE, not merely present. This site keeps a product modal in the
   * DOM with aria-modal="true" at all times, so presence alone means nothing. */
  function reallyVisible(el) {
    if (!el) { return false; }
    var cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') { return false; }
    if (parseFloat(cs.opacity) < 0.1) { return false; }
    var r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  }

  function overlayOpen() {
    
    if (reallyVisible(document.querySelector('.cart-drawer.is-open'))) { return true; }

    var els = document.querySelectorAll('[aria-modal="true"], .modal, .popup, .overlay, body > div, body > section, body > aside');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el === bar || (bar && bar.contains(el)) || el.contains(bar)) { continue; }
      if (window.getComputedStyle(el).position !== 'fixed') { continue; }
      if (!reallyVisible(el)) { continue; }
      var r = el.getBoundingClientRect();
      /* a large fixed panel covering the screen = a modal worth waiting for */
      if (r.width > window.innerWidth * 0.5 && r.height > window.innerHeight * 0.4) { return true; }
    }
    return false;
  }

  /* --- clear whatever the site already sticks to the bottom ---
   * Not just the mobile dock: the EN/ES language toggle floats above it.
   * Measure every fixed bar down there and sit above the highest one. */
  function bottomInset() {
    var vh = window.innerHeight;
    var topMost = vh;
    var kids = document.body.children;
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      if (el === bar) { continue; }
      var cs = window.getComputedStyle(el);
      if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') { continue; }
      if (parseFloat(cs.opacity) < 0.1) { continue; }
      var r = el.getBoundingClientRect();
      if (r.height < 1 || r.height > vh * 0.4) { continue; }   /* a bar, not a modal */
      if (r.bottom < vh * 0.6) { continue; }                   /* bottom furniture only */
      if (r.top < topMost) { topMost = r.top; }
    }
    return topMost >= vh ? 12 : Math.round(vh - topMost) + 10;
  }

  function position() {
    if (bar) { bar.style.bottom = bottomInset() + 'px'; }
  }
  window.addEventListener('resize', position);
  window.addEventListener('orientationchange', function () { setTimeout(position, 250); });

  function build(message, buttonLabel, onClick) {
    if (bar) { return; }
    bar = document.createElement('div');
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Add Hands of Gold to your home screen');
    bar.style.cssText = [
      'position:fixed', 'left:12px', 'right:12px', 'bottom:' + bottomInset() + 'px',
      'z-index:9998',                      /* under the dock (9999), over the page */
      'display:flex', 'align-items:center', 'gap:12px',
      'padding:12px 14px', 'border-radius:14px',
      'background:rgba(15,15,16,.97)', 'border:1px solid rgba(212,175,55,.45)',
      'box-shadow:0 10px 30px rgba(0,0,0,.55)',
      'font-family:inherit', 'color:#f5f1e6',
      'transform:translateY(180%)', 'transition:transform .35s ease',
      'max-width:520px', 'margin:0 auto'
    ].join(';');

    var icon = document.createElement('img');
    icon.src = '/icon-192.png';
    icon.alt = '';
    icon.width = 40; icon.height = 40;
    icon.style.cssText = 'width:40px;height:40px;border-radius:9px;flex:0 0 auto';

    var text = document.createElement('div');
    text.style.cssText = 'flex:1 1 auto;font-size:13px;line-height:1.35';
    text.innerHTML = message;

    var close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Dismiss');
    close.textContent = '×';
    close.style.cssText = 'flex:0 0 auto;background:none;border:0;color:#9b958a;font-size:22px;line-height:1;cursor:pointer;padding:0 4px';
    close.onclick = function () { setDismissed(); hide(); };

    bar.appendChild(icon);
    bar.appendChild(text);

    if (buttonLabel) {
      var cta = document.createElement('button');
      cta.type = 'button';
      cta.textContent = buttonLabel;
      cta.style.cssText = 'flex:0 0 auto;background:linear-gradient(180deg,#e8c766,#c9a227);color:#1a1408;border:0;border-radius:9px;padding:9px 15px;font-size:13px;font-weight:700;cursor:pointer';
      cta.onclick = onClick;
      bar.appendChild(cta);
    }
    bar.appendChild(close);

    document.body.appendChild(bar);
    requestAnimationFrame(function () { position(); bar.style.transform = 'translateY(0)'; });
  }

  function hide() {
    if (!bar) { return; }
    bar.style.transform = 'translateY(180%)';
    var dead = bar;
    bar = null;
    setTimeout(function () { if (dead.parentNode) { dead.parentNode.removeChild(dead); } }, 400);
  }

  /* Wait for engagement, THEN wait for a clear screen. */
  function whenEngaged(fn) {
    var fired = false;

    var waited = 0;
    function clearThen() {
      if (isDismissed()) { return; }
      if (overlayOpen() && waited < 90000) { waited += 800; setTimeout(clearThen, 800); return; }
      if (overlayOpen()) { return; }   /* give up rather than fight the page */
      fn();
    }
    function go() {
      if (fired) { return; }
      fired = true;
      window.removeEventListener('scroll', onScroll);
      clearThen();
    }
    function onScroll() { if (window.scrollY > 600) { go(); } }

    window.addEventListener('scroll', onScroll, { passive: true });
    setTimeout(go, 25000);
  }

  /* Android / Chrome: real install prompt. */
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    whenEngaged(function () {
      build('Keep <strong>Hands of Gold</strong> one tap away on your phone.', 'Install', function () {
        hide();
        dl.push({ event: 'pwa_install_clicked' });
        deferred.prompt();
        deferred.userChoice.then(function (choice) {
          dl.push({ event: 'pwa_install_' + choice.outcome });
          if (choice.outcome === 'dismissed') { setDismissed(); }
          deferred = null;
        });
      });
      dl.push({ event: 'pwa_prompt_shown', pwa_platform: 'android' });
    });
  });

  window.addEventListener('appinstalled', function () {
    setDismissed();
    hide();
    dl.push({ event: 'pwa_installed' });
  });

  /* iOS: Safari shows no prompt of its own, so tell them where to tap. */
  if (isIOS && isSafari) {
    whenEngaged(function () {
      build(
        'Add <strong>Hands of Gold</strong> to your home screen: tap the Share button, then <strong>Add to Home Screen</strong>.',
        null, null
      );
      dl.push({ event: 'pwa_prompt_shown', pwa_platform: 'ios' });
    });
  }
})();


/* Labor Day 2026 campaign removed 2026-09-08 at Julio's request. */

/* =====================================================================
   HOG VIP LIST — evergreen lead capture popup (added 2026-09-08)
   Not tied to any campaign. It keeps working after Labor Day expires.

   >>> THE OFFER IS THE ONE LINE BELOW. Change it to whatever you are
   >>> willing to honour at the counter, or set it to '' to run this as
   >>> a plain "first look at new arrivals" list with no promise.
   ===================================================================== */
(function () {
  'use strict';

  /* DISABLED 2026-09-14 — replaced by the monthly giveaway popup in
     /raffle-popup.js. Two popups on the same triggers is worse than none.
     To bring the VIP list back, delete the single return below. */
  return;

  var OFFER = 'Free professional cleaning & inspection on your next visit';
  var LEAD_TYPE = 'vip_list';

  var SUBMITTED = 'hog_vip_joined';       // never ask again
  var DISMISSED = 'hog_vip_dismissed_at'; // ask again after 30 days
  var DISMISS_DAYS = 30;

  /* Pages where a popup would be wrong. */
  var BLOCKED = ['/staff', '/offline', '/order-confirmed', '/reserved', '/passport-'];
  var path = location.pathname.toLowerCase();
  for (var i = 0; i < BLOCKED.length; i++) {
    if (path.indexOf(BLOCKED[i]) === 0 || path.indexOf(BLOCKED[i]) > -1) { return; }
  }

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }

  if (get(SUBMITTED) === '1') { return; }
  var when = parseInt(get(DISMISSED) || '0', 10);
  if (when && (Date.now() - when) < DISMISS_DAYS * 864e5) { return; }

  var box = null, lastFocus = null, shown = false;

  function build() {
    box = document.createElement('div');
    box.className = 'hog-vip';
    box.id = 'hog-vip';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'hog-vip-title');
    box.setAttribute('aria-hidden', 'true');
    box.innerHTML =
      '<div class="hog-vip-scrim" data-vip-close></div>' +
      '<div class="hog-vip-card">' +
        '<button type="button" class="hog-vip-x" aria-label="Close" data-vip-close>&times;</button>' +
        '<p class="hog-vip-eyebrow">Hands of Gold &middot; Since 1983</p>' +
        '<h2 id="hog-vip-title">See new pieces first.</h2>' +
        '<p class="hog-vip-copy">Join the list and we will let you know when new gold lands in the case' +
          (OFFER ? '. <strong>' + OFFER + '</strong>, on us.' : '.') + '</p>' +
        '<form class="hog-vip-form" id="hog-vip-form" novalidate>' +
          '<label>Name<input type="text" id="hog-vip-name" name="name" autocomplete="name" required></label>' +
          '<label>Email<input type="email" id="hog-vip-email" name="email" autocomplete="email" required></label>' +
          '<label>Phone<input type="tel" id="hog-vip-phone" name="phone" autocomplete="tel" required></label>' +
          '<div class="hog-vip-hp" aria-hidden="true"><label>Website<input type="text" id="hog-vip-website" tabindex="-1" autocomplete="off"></label></div>' +
          '<label class="hog-vip-consent"><input type="checkbox" id="hog-vip-consent" required>' +
            '<span>Yes, Hands of Gold may contact me by phone or email. I accept the ' +
            '<a href="/terms.html">Terms</a> and <a href="/privacy.html">Privacy Policy</a>.</span></label>' +
          '<button type="submit" class="hog-vip-submit" id="hog-vip-submit">Join the List</button>' +
          '<p class="hog-vip-status" id="hog-vip-status" aria-live="polite"></p>' +
        '</form>' +
        '<button type="button" class="hog-vip-no" data-vip-close>No thanks</button>' +
        '<p class="hog-vip-fine">We use your details only to contact you about Hands of Gold. ' +
          'No card numbers or ID numbers, please. 494 Oak St, Copiague NY &middot; (631) 264-6610</p>' +
      '</div>';
    document.body.appendChild(box);

    box.addEventListener('click', function (e) {
      if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-vip-close')) { close(true); }
    });
    document.addEventListener('keydown', onKey);
    box.querySelector('#hog-vip-form').addEventListener('submit', submit);
  }

  function onKey(e) {
    if (!box || !box.classList.contains('is-open')) { return; }
    if (e.key === 'Escape') { close(true); return; }
    if (e.key !== 'Tab') { return; }
    var f = box.querySelectorAll('button, input, a[href]');
    if (!f.length) { return; }
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function open() {
    if (shown || !box) { return; }
    shown = true;
    lastFocus = document.activeElement;
    box.classList.add('is-open');
    box.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
    var n = box.querySelector('#hog-vip-name');
    if (n) { n.focus(); }
    try { window.dataLayer = window.dataLayer || []; window.dataLayer.push({event: 'vip_popup_shown'}); } catch (e) {}
  }

  function close(remember) {
    if (!box) { return; }
    box.classList.remove('is-open');
    box.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
    if (remember) { set(DISMISSED, String(Date.now())); }
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }

  async function submit(e) {
    e.preventDefault();
    var form = e.target;
    var status = box.querySelector('#hog-vip-status');
    var btn = box.querySelector('#hog-vip-submit');
    if (box.querySelector('#hog-vip-website').value.trim()) { return; }   /* bot */
    if (!form.reportValidity()) { return; }

    var name = box.querySelector('#hog-vip-name').value.trim();
    btn.disabled = true;
    btn.textContent = 'Adding you…';
    status.className = 'hog-vip-status';
    status.textContent = '';

    var q = new URLSearchParams(location.search);
    var body = {
      leadType: LEAD_TYPE,
      name: name,
      email: box.querySelector('#hog-vip-email').value.trim(),
      phone: box.querySelector('#hog-vip-phone').value.trim(),
      offer: OFFER || 'VIP list — new arrivals',
      source: 'HandsOfGoldNY.com VIP list popup',
      page: location.href,
      referrer: document.referrer || '',
      utm_source: q.get('utm_source') || 'direct / unknown',
      utm_campaign: q.get('utm_campaign') || '',
      submitted_at: new Date().toLocaleString(),
      consent: 'Customer agreed to be contacted by phone or email and accepted Terms/Privacy.'
    };

    try {
      var r = await fetch('/api/leads', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
        body: JSON.stringify(body)
      });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok || d.success !== true || !d.leadId) { throw new Error(d.error || 'failed'); }
      set(SUBMITTED, '1');
      status.className = 'hog-vip-status is-success';
      status.textContent = 'You are on the list, ' + name + '. Mention it in store to claim.';
      btn.textContent = 'Added ✓';
      try { window.dataLayer = window.dataLayer || []; window.dataLayer.push({event: 'vip_list_signup', lead_type: LEAD_TYPE}); } catch (e2) {}
      setTimeout(function () { close(false); }, 2600);
    } catch (err) {
      status.className = 'hog-vip-status is-error';
      status.textContent = "That did not go through. Please try again, or call (631) 264-6610.";
      btn.disabled = false;
      btn.textContent = 'Join the List';
    }
  }

  /* Wait for genuine engagement, and never fight another overlay. */
  function armed() {
    var other = document.querySelector('.lead-popup.is-open, .hog-ldpop.is-open, [aria-modal="true"].is-open');
    if (other && other !== box) { return false; }
    return true;
  }
  function maybeOpen() {
    if (shown) { return; }
    if (!armed()) { setTimeout(maybeOpen, 1500); return; }
    open();
  }

  function start() {
    build();

    /* A visitor who clicks a nav link jumps straight past 30% of the page in
       one animated scroll. Without a dwell floor the popup lands in their face
       the moment they arrive at the section they asked for, which is the worst
       possible first impression. Nothing may fire for the first 12 seconds. */
    var MIN_DWELL = 12000;
    var landed = Date.now();
    var scrolledEnough = false;

    var t = setTimeout(maybeOpen, 20000);

    function ready() {
      if (Date.now() - landed < MIN_DWELL) { return false; }
      return true;
    }
    function tryOpen() {
      if (!ready()) { setTimeout(tryOpen, 1500); return; }
      clearTimeout(t);
      maybeOpen();
    }
    function onScroll() {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      if (h > 0 && (window.scrollY / h) > 0.3 && !scrolledEnough) {
        scrolledEnough = true;
        window.removeEventListener('scroll', onScroll);
        tryOpen();
      }
    }
    window.addEventListener('scroll', onScroll, {passive: true});
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', start); }
  else { start(); }
})();
