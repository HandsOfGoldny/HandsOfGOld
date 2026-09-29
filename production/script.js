
(() => {
  "use strict";

  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  });

  let latestGoldPrice = null;

  const PRICE_CACHE_KEY = "hog_metal_prices_v1";
  function readCache() {
    try { return JSON.parse(localStorage.getItem(PRICE_CACHE_KEY) || "{}"); } catch (e) { return {}; }
  }
  function writeCache(symbol, price) {
    try {
      const c = readCache();
      c[symbol] = { price: price, at: Date.now() };
      localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify(c));
    } catch (e) { /* private mode */ }
  }
  // Fallback so the gold calculator always returns a number if the feed is down.
  // Review this figure periodically; the on-page copy already states the estimate
  // is non-binding and confirmed in store.
  const GOLD_FALLBACK_USD_PER_OZ = 3350;

  async function loadMetal(symbol, elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    function apply(price, stale) {
      el.textContent = money.format(price) + "/oz";
      if (symbol === "XAU") {
        latestGoldPrice = price;
        const calcLive = document.getElementById("calc-live-gold");
        if (calcLive) calcLive.textContent = money.format(price) + "/oz" + (stale ? " (last known)" : "");
      }
    }
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(`https://api.gold-api.com/price/${symbol}`, { cache: "no-store", signal: ctrl.signal });
      clearTimeout(timer);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const price = Number(d.price);
      if (!Number.isFinite(price)) throw new Error("No price");
      apply(price, false);
      writeCache(symbol, price);
      return d;
    } catch (e) {
      console.warn("Metal price error", symbol, e);
      const cached = readCache()[symbol];
      if (cached && Number.isFinite(cached.price)) {
        apply(cached.price, true);
        return { price: cached.price, stale: true };
      }
      if (symbol === "XAU" && !Number.isFinite(latestGoldPrice)) {
        latestGoldPrice = GOLD_FALLBACK_USD_PER_OZ;
      }
      return null;
    }
  }

  async function updateMetals() {
    const updated = document.getElementById("metals-updated");
    const results = await Promise.all([
      loadMetal("XAU", "price-gold"),
      loadMetal("XAG", "price-silver"),
      loadMetal("XPT", "price-platinum")
    ]);
    const ticker = document.querySelector(".metals-ticker");
    const anyLive = results.some(Boolean);
    if (ticker) ticker.hidden = !anyLive;   // absence reads as clean; failure text reads as broken
    if (updated && anyLive) {
      const stale = results.some(r => r && r.stale);
      updated.textContent = stale
        ? "Last known prices"
        : `Updated ${new Date().toLocaleTimeString([], {hour:"numeric", minute:"2-digit"})}`;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const year = document.getElementById("year");
    if (year) year.textContent = new Date().getFullYear();

    updateMetals();
    setInterval(updateMetals, 5 * 60 * 1000);

    // Smooth in-page navigation
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener("click", e => {
        const id = a.getAttribute("href");
        if (!id || id === "#") return;
        const target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({behavior:"smooth", block:"start"});
      });
    });

    // Gold-buying calculator: payout logic stays on the server.
    const calcButton = document.getElementById("gold-calc-button");
    const weightInput = document.getElementById("gold-weight");
    const weightUnitInput = document.getElementById("gold-weight-unit");
    const karatInput = document.getElementById("gold-karat");
    const calcResult = document.getElementById("gold-calc-result");
    let calculationTimer = null;
    async function calculateGoldOffer() {
      const rawWeight = Number(weightInput?.value || 0);
      const weightUnit = weightUnitInput?.value || "grams";
      const karat = Number(karatInput?.value || 0);
      if (!calcResult) return;
      if (!Number.isFinite(rawWeight) || rawWeight <= 0 || !Number.isFinite(karat)) {
        calcResult.textContent = "$0.00";
        return;
      }
      calcResult.textContent = "Calculating…";
      try {
        const params = new URLSearchParams({ karat: String(karat), weight: String(rawWeight), unit: weightUnit });
        const response = await fetch(`/api/gold-estimate?${params}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!Number.isFinite(data.estimate)) throw new Error("Invalid estimate");
        calcResult.textContent = money.format(data.estimate);
      } catch (error) {
        console.warn("Gold estimate unavailable", error);
        calcResult.textContent = "Call for estimate";
      }
    }

    calcButton?.addEventListener("click", calculateGoldOffer);
    weightInput?.addEventListener("input", () => {
      clearTimeout(calculationTimer);
      calculationTimer = setTimeout(calculateGoldOffer, 350);
    });
    weightUnitInput?.addEventListener("change", calculateGoldOffer);
    karatInput?.addEventListener("change", calculateGoldOffer);


    // Custom jewelry builder
    const choiceGroups = document.querySelectorAll("[data-choice-group]");
    const budgetSelect = document.getElementById("custom-budget");
    const sizeInput = document.getElementById("custom-size");
    const notesInput = document.getElementById("custom-notes");
    const customSummary = document.getElementById("custom-summary");
    const copyButton = document.getElementById("copy-custom-design");
    const copyStatus = document.getElementById("custom-copy-status");

    function selectedValue(groupName) {
      return document.querySelector(`[data-choice-group="${groupName}"] .custom-choice.is-selected`)?.dataset.value || "";
    }

    function buildCustomText() {
      const parts = [
        selectedValue("piece"),
        selectedValue("metal"),
        selectedValue("stones"),
        budgetSelect?.value || ""
      ].filter(Boolean);
      const size = sizeInput?.value?.trim();
      const notes = notesInput?.value?.trim();
      let text = parts.join(" · ");
      if (size) text += ` · Size/Dimensions: ${size}`;
      if (notes) text += ` · Notes: ${notes}`;
      return text;
    }

    function refreshCustomSummary() {
      if (customSummary) customSummary.textContent = buildCustomText();
    }

    choiceGroups.forEach(group => {
      group.querySelectorAll(".custom-choice").forEach(button => {
        button.addEventListener("click", () => {
          group.querySelectorAll(".custom-choice").forEach(b => b.classList.remove("is-selected"));
          button.classList.add("is-selected");
          refreshCustomSummary();
        });
      });
    });
    budgetSelect?.addEventListener("change", refreshCustomSummary);
    sizeInput?.addEventListener("input", refreshCustomSummary);
    notesInput?.addEventListener("input", refreshCustomSummary);

    copyButton?.addEventListener("click", async () => {
      const text = `Hands of Gold custom jewelry request: ${buildCustomText()}`;
      try {
        await navigator.clipboard.writeText(text);
        if (copyStatus) copyStatus.textContent = "Design details copied to your device. They have not been sent to Hands of Gold. Call us and paste or read the request when you are ready.";
      } catch {
        if (copyStatus) copyStatus.textContent = text;
      }
    });
    refreshCustomSummary();

    // Catalog filters
    const filters = document.querySelectorAll(".catalog-filter");
    const cards = document.querySelectorAll(".catalog-product-card");
    filters.forEach(button => {
      button.addEventListener("click", () => {
        filters.forEach(b => b.classList.remove("is-active"));
        button.classList.add("is-active");
        const filter = button.dataset.filter;
        cards.forEach(card => {
          card.hidden = !(filter === "all" || card.dataset.category === filter);
        });
      });
    });

    // Lead form: makes the CTA usable without a missing backend.
    const form = document.getElementById("lead-form");
    if (form) {
      form.addEventListener("submit", e => {
        e.preventDefault();
        const status = document.getElementById("lead-status");
        if (!form.reportValidity()) return;
        const name = document.getElementById("lead-name")?.value?.trim() || "Customer";
        if (status) status.textContent = `Thanks, ${name}. Please call (631) 264-6610 to claim your offer.`;
      });
    }
  });
})();


// V17 robust mobile navigation
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("nav-toggle") || document.querySelector(".nav-toggle");
  const nav = document.getElementById("site-nav") || document.querySelector(".site-nav");
  const body = document.body;

  if (!toggle || !nav) return;

  toggle.setAttribute("aria-expanded", "false");

  const closeMenu = () => {
    body.classList.remove("nav-open");
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  };

  const openMenu = () => {
    body.classList.add("nav-open");
    nav.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
  };

  toggle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const isOpen = body.classList.contains("nav-open") || nav.classList.contains("is-open");
    isOpen ? closeMenu() : openMenu();
  });

  nav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => closeMenu());
  });

  document.addEventListener("click", (event) => {
    if (!nav.contains(event.target) && !toggle.contains(event.target)) {
      closeMenu();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 980) closeMenu();
  });
});


// ===== HOG Custom Jewelry Studio: submit custom jewelry request =====
(() => {
  "use strict";
  const MARKER = "hog-custom-order-v1";
  function selectedValue(groupName) {
    return document.querySelector(`[data-choice-group="${groupName}"] .custom-choice.is-selected`)?.dataset.value || "";
  }
  function addStyles() {
    if (document.getElementById(MARKER + "-styles")) return;
    const style = document.createElement("style");
    style.id = MARKER + "-styles";
    style.textContent = `
      .home-page .custom-order-contact{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.8rem;padding:1.15rem;border:1px solid rgba(22,21,26,.10);border-radius:16px;background:#faf9f7;}
      .home-page .custom-order-contact h3{grid-column:1/-1;margin:0;color:#16151a!important;}
      .home-page .custom-order-contact label span{display:block;margin-bottom:.4rem;font-weight:800;color:#16151a!important;}
      .home-page .custom-order-contact input{width:100%;min-height:48px;padding:.7rem .8rem;border:1px solid rgba(22,21,26,.14);border-radius:11px;background:#fff;color:#16151a;}
      .home-page .custom-order-consent{grid-column:1/-1;display:flex;align-items:flex-start;gap:.55rem;padding:.7rem .8rem;border-radius:11px;border:1px solid rgba(185,138,55,.22);background:#fff;color:#57534c;font-size:.78rem;line-height:1.45;}
      .home-page .custom-order-consent input{width:17px;height:17px;min-height:0;flex:0 0 auto;margin-top:.12rem;accent-color:#b98a37;}
      .home-page .custom-order-consent a{color:#9a7129!important;text-decoration:underline;text-underline-offset:2px;}
      .home-page .custom-order-submit-row{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:.65rem;align-items:center;}
      .home-page .custom-order-status{grid-column:1/-1;min-height:1.25rem;margin:0;font-size:.84rem;font-weight:700;color:#57534c!important;}
      .home-page .custom-order-status.is-success{color:#76551d!important;}.home-page .custom-order-status.is-error{color:#9a3428!important;}
      .home-page .custom-contact-button{background:#635bff!important;border-color:#635bff!important;color:#fff!important;}
      .home-page .custom-contact-button:hover{background:#5148e5!important;border-color:#5148e5!important;color:#fff!important;}
      .home-page .custom-order-note{grid-column:1/-1;margin:-.25rem 0 0;color:#70685d!important;font-size:.78rem;line-height:1.45;}
      @media(max-width:760px){.home-page .custom-order-contact{grid-template-columns:1fr}.home-page .custom-order-contact h3,.home-page .custom-order-consent,.home-page .custom-order-submit-row,.home-page .custom-order-status,.home-page .custom-order-note{grid-column:auto}.home-page .custom-order-submit-row .button{width:100%}}
    `;
    document.head.appendChild(style);
  }
  document.addEventListener("DOMContentLoaded", () => {
    const builder = document.getElementById("custom-builder");
    if (!builder || builder.dataset.customOrderEnhanced === "1") return;
    builder.dataset.customOrderEnhanced = "1";
    const privacyNotice = builder.querySelector(".custom-builder-consent");
    const summaryBox = builder.querySelector(".custom-builder-summary");
    if (!summaryBox) return;
    const panel = document.createElement("div");
    panel.className = "custom-order-contact";
    panel.innerHTML = `
      <h3>4. Send your custom request</h3>
      <label><span>Name</span><input id="custom-order-name" type="text" autocomplete="name" required></label>
      <label><span>Email</span><input id="custom-order-email" type="email" autocomplete="email" required></label>
      <label><span>Phone</span><input id="custom-order-phone" type="tel" autocomplete="tel" required></label>
      <label class="custom-order-consent"><input id="custom-order-consent" type="checkbox" required><span>I agree to the <a href="terms.html" target="_blank" rel="noopener">Terms</a> and <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a> and consent to Hands of Gold contacting me by phone or email about this custom jewelry request.</span></label>
      <div class="custom-order-submit-row"><button class="button button-primary" id="submit-custom-order" type="button">Submit Custom Order Request</button><a class="button custom-contact-button" href="tel:6312646610">Call About Your Design</a></div>
      <p class="custom-order-note">Submitting a request does not finalize the order. Hands of Gold will review the design, specifications and final price. We will contact you to confirm purchase details.</p>
      <p class="custom-order-status" id="custom-order-status" role="status" aria-live="polite"></p>`;
    if (privacyNotice) privacyNotice.before(panel); else summaryBox.before(panel);
    if (privacyNotice) privacyNotice.innerHTML = `<span><strong>Privacy note:</strong> Your selections stay on your device until you choose <strong>Submit Custom Order Request</strong>. If you submit, Hands of Gold receives your contact information and the custom jewelry details shown in your request so we can follow up. <strong>Copy Design Details</strong> still only copies the summary on your device. Do not enter payment card numbers, government ID numbers, or other sensitive information in the notes. <a href="privacy.html">Privacy Policy</a> · <a href="terms.html">Terms</a></span>`;
    const submit = document.getElementById("submit-custom-order");
    const status = document.getElementById("custom-order-status");
    submit?.addEventListener("click", async () => {
      const nameEl = document.getElementById("custom-order-name"), emailEl = document.getElementById("custom-order-email"), phoneEl = document.getElementById("custom-order-phone"), consentEl = document.getElementById("custom-order-consent");
      const invalid = [nameEl,emailEl,phoneEl].find(el => !el?.checkValidity());
      if (invalid) { invalid.reportValidity(); invalid.focus(); return; }
      if (!consentEl?.checked) { if(status){status.className="custom-order-status is-error";status.textContent="Please accept the contact consent before submitting your custom request.";} consentEl?.focus(); return; }
      const budget=document.getElementById("custom-budget")?.value||"", size=document.getElementById("custom-size")?.value?.trim()||"", notes=document.getElementById("custom-notes")?.value?.trim()||"", summary=document.getElementById("custom-summary")?.textContent?.trim()||"";
      const payload={leadType:"custom_jewelry",_subject:"NEW CUSTOM JEWELRY REQUEST — HandsOfGoldNY.com",_template:"table",name:nameEl.value.trim(),email:emailEl.value.trim(),phone:phoneEl.value.trim(),piece:selectedValue("piece"),metal:selectedValue("metal"),stones:selectedValue("stones"),budget,size_dimensions:size||"Not provided",design_notes:notes||"Not provided",request_summary:summary,source:"HandsOfGoldNY.com Custom Jewelry Studio",page:window.location.href,submitted_at:new Date().toLocaleString(),consent:"Customer agreed to be contacted by phone or email about this custom jewelry request and accepted Terms/Privacy."};
      submit.disabled=true;submit.textContent="Sending…";if(status){status.className="custom-order-status";status.textContent="Sending your custom jewelry request…";}
      try { const response=await fetch("/api/leads",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(payload)}); const data=await response.json().catch(()=>({})); if(!response.ok||data.success!==true||!data.leadId) throw new Error(data.error||"Submission failed"); if(status){status.className="custom-order-status is-success";status.textContent="Request sent ✓ Hands of Gold received your custom jewelry details. We will contact you to review your design and confirm the purchase details.";} submit.textContent="Request Sent ✓"; window.dataLayer=window.dataLayer||[];window.dataLayer.push({event:"custom_order_request_success",piece:selectedValue("piece"),budget}); }
      catch(err){console.error("Custom order submission error",err);if(status){status.className="custom-order-status is-error";status.textContent="We couldn't send the request yet. Please try again or call (631) 264-6610.";}submit.disabled=false;submit.textContent="Submit Custom Order Request";}
    });
  });
})();

/* HOG Mobile Upgrade — 2026-08-28
   Mobile-only presentation + navigation. Does not replace product media or desktop layout. */
(() => {
  "use strict";
  const MOBILE_MAX = 760;
  const isMobile = () => window.matchMedia(`(max-width:${MOBILE_MAX}px)`).matches;

  function addStyles() {
    if (document.getElementById("hog-mobile-upgrade-css")) return;
    const style = document.createElement("style");
    style.id = "hog-mobile-upgrade-css";
    style.textContent = `
      .hog-mobile-dock,.hog-mobile-review-proof,.mobile-offer-toggle{display:none;}
      @media(max-width:${MOBILE_MAX}px){
        html{scroll-padding-bottom:78px;}
        body.home-page{padding-bottom:68px!important;}

        /* 1. Compact spot-price row */
        .home-page .metals-ticker{min-height:42px!important;position:relative!important;}
        .home-page .metals-ticker-inner{min-height:42px!important;display:block!important;padding:.35rem 0!important;}
        .home-page .metals-label,.home-page .metals-updated{display:none!important;}
        .home-page .metals-prices{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:.3rem!important;width:100%!important;}
        .home-page .metal-chip{min-height:32px!important;padding:.2rem .18rem!important;border-radius:8px!important;display:flex!important;flex-direction:row!important;gap:.25rem!important;font-size:.55rem!important;letter-spacing:.02em!important;text-transform:none!important;white-space:nowrap!important;}
        .home-page .metal-chip strong{font-size:.72rem!important;margin:0!important;min-width:0!important;}

        /* 2. App-like header: logo | call | menu */
        .home-page .site-header,.home-page .site-header.scrolled{position:sticky!important;top:0!important;z-index:70!important;padding:.25rem 0!important;min-height:58px!important;}
        .home-page .nav-wrap{display:grid!important;grid-template-columns:1fr auto auto!important;gap:.5rem!important;min-height:58px!important;}
        .home-page .brand{min-width:0!important;gap:0!important;}
        .home-page .brand-copy{display:none!important;}
        .home-page .brand-logo,.home-page header img[alt*="Hands of Gold"]{width:52px!important;height:52px!important;border-radius:11px!important;}
        .home-page .header-phone{width:44px!important;height:44px!important;border:1px solid var(--line)!important;border-radius:50%!important;align-items:center!important;justify-content:center!important;background:#fff!important;margin:0!important;overflow:hidden!important;}
        .home-page .header-phone::before{content:"☎";font-size:1.25rem;color:var(--gold-deep);line-height:1;}
        .home-page .header-phone-number,.home-page .header-phone-note{display:none!important;}
        .home-page .nav-toggle{width:44px!important;height:44px!important;margin:0!important;border-radius:12px!important;background:#fff!important;}
        .home-page .nav-toggle span{background:#18130e!important;width:21px!important;height:2px!important;}
        .home-page .nav-panel{top:calc(100% + .35rem)!important;left:.55rem!important;right:.55rem!important;}

        /* 3. Tight trust + reputation proof */
        .home-page .trust-band-inner{display:grid!important;grid-template-columns:repeat(2,1fr)!important;gap:.2rem .55rem!important;padding:.4rem .65rem!important;text-align:center!important;}
        .home-page .trust-band-inner span{font-size:.55rem!important;letter-spacing:.06em!important;}
        .home-page .trust-band-inner span::before{display:none!important;}
        .hog-mobile-review-proof{display:flex;align-items:center;justify-content:center;gap:.45rem;padding:.58rem .75rem;background:#fff;border-bottom:1px solid rgba(22,21,26,.08);color:#16151a;font-size:.77rem;font-weight:850;text-align:center;}
        .hog-mobile-review-proof .stars{color:#b98a37;letter-spacing:.08em;white-space:nowrap;}

        /* 4. Financing is compact; 10% form expands only on demand */
        .home-page .payment-options-strip{padding:.75rem 0!important;}
        .home-page .payment-options-split{display:block!important;}
        .home-page .payment-pane-leasing{gap:.45rem!important;}
        .home-page .payment-options-eyebrow{display:none!important;}
        .home-page .payment-options-title{font-size:1.2rem!important;text-align:center!important;}
        .home-page .payment-options-subtitle{font-size:.72rem!important;line-height:1.35!important;text-align:center!important;margin:.3rem auto 0!important;}
        .home-page .payment-options-actions{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:.35rem!important;}
        .home-page .payment-options-split .payment-option-button{min-width:0!important;min-height:46px!important;padding:.35rem!important;border-radius:10px!important;}
        .home-page .pay-btn-logo{height:20px!important;max-width:92px!important;}
        .home-page .payment-options-terms{display:none!important;}
        .mobile-offer-toggle{display:flex!important;width:100%;min-height:44px;margin-top:.55rem;align-items:center;justify-content:center;border:1px solid #b98a37;border-radius:999px;background:#b98a37;color:#fff;font-weight:900;cursor:pointer;}
        .home-page .payment-pane-offer{display:none!important;padding:0!important;margin-top:.65rem!important;border:0!important;}
        .home-page .payment-pane-offer.mobile-open{display:block!important;}
        .home-page .offer-form{padding:.8rem;border:1px solid rgba(255,255,255,.14);border-radius:14px;background:rgba(255,255,255,.05);}
        .home-page .offer-form-fields{grid-template-columns:1fr!important;gap:.35rem!important;}
        .home-page .offer-field input{min-height:42px!important;}
        .home-page .offer-consent{font-size:.64rem!important;}
        .home-page .offer-submit{min-height:44px!important;font-size:.9rem!important;}

        /* 5. Product area feels like a mobile shop */
        .home-page .curated-catalog-section{padding:1.35rem 0 2rem!important;}
        .home-page .curated-catalog-heading{display:block!important;margin-bottom:.65rem!important;text-align:center!important;}
        .home-page .curated-catalog-heading .eyebrow{margin-bottom:.2rem!important;font-size:.6rem!important;}
        .home-page .fire-stock-heading{font-size:1.8rem!important;margin:.1rem 0!important;}
        .home-page .curated-catalog-heading>p{font-size:.72rem!important;line-height:1.35!important;margin:.25rem auto .55rem!important;max-width:34ch!important;}
        .home-page .catalog-filter-row{margin:0 0 .75rem!important;padding-bottom:.1rem!important;}
        .home-page .catalog-filter{min-height:34px!important;padding:.35rem .65rem!important;font-size:.7rem!important;}
        .home-page .catalog-product-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:.55rem!important;}
        .home-page .catalog-product-card{border-radius:12px!important;}
        .home-page .catalog-product-image{aspect-ratio:1/1!important;}
        .home-page .catalog-product-copy{padding:.6rem!important;}
        .home-page .catalog-product-meta{font-size:.52rem!important;letter-spacing:.04em!important;}
        .home-page .catalog-product-meta span:last-child{display:none!important;}
        .home-page .catalog-product-copy h3{font-size:.88rem!important;line-height:1.2!important;margin:.28rem 0 .45rem!important;min-height:2.4em;}
        .home-page .catalog-product-copy p{display:none!important;}
        .home-page .catalog-product-footer{display:block!important;padding-top:.45rem!important;font-size:.65rem!important;}
        .home-page .catalog-product-footer>span{display:none!important;}
        .home-page .catalog-product-footer a{display:block!important;text-align:center!important;padding:.35rem;border-radius:8px;background:var(--paper);font-size:.66rem!important;}
        .home-page .curated-catalog-footer{display:none!important;}

        /* 6. Custom Studio closer to shopping + compact controls */
        .home-page .piece-builder-section{padding:1.8rem 0!important;}
        .home-page .piece-builder-section .section-header{margin-bottom:.8rem!important;}
        .home-page .piece-builder-section .section-header h2{font-size:1.85rem!important;}
        .home-page .piece-builder-section .section-header p:last-child{font-size:.78rem!important;line-height:1.4!important;}
        .home-page .custom-builder{gap:.6rem!important;}
        .home-page .custom-builder-step,.home-page .custom-builder-summary{padding:.8rem!important;border-radius:12px!important;}
        .home-page .custom-builder-step h3{font-size:.92rem!important;margin-bottom:.5rem!important;}
        .home-page .custom-choice-grid{flex-wrap:nowrap!important;overflow-x:auto!important;gap:.35rem!important;scrollbar-width:none;}
        .home-page .custom-choice-grid::-webkit-scrollbar{display:none;}
        .home-page .custom-choice{flex:0 0 auto!important;padding:.5rem .72rem!important;font-size:.76rem!important;}
        .home-page .custom-builder-fields{gap:.55rem!important;}
        .home-page .custom-builder-fields input,.home-page .custom-builder-fields select,.home-page .custom-builder-fields textarea{padding:.62rem .68rem!important;font-size:.85rem!important;}
        .home-page .custom-builder-fields textarea{min-height:84px!important;}
        .home-page .custom-builder-consent{font-size:.66rem!important;line-height:1.35!important;padding:.6rem!important;}
        .home-page .custom-order-contact{padding:.8rem!important;gap:.5rem!important;border-radius:12px!important;}
        .home-page .custom-order-contact h3{font-size:1rem!important;}
        .home-page .custom-order-submit-row{display:grid!important;grid-template-columns:1fr!important;}
        .home-page .custom-order-submit-row .button{min-height:46px!important;font-size:.82rem!important;}
        .home-page .custom-order-note{font-size:.7rem!important;}

        /* 7. Sell gold and service cards trim vertical space */
        .home-page .gold-calculator-section{padding:1.8rem 0!important;}
        .home-page .gold-calculator-layout{gap:1rem!important;}
        .home-page .gold-calculator-copy h2{font-size:1.65rem!important;}
        .home-page .gold-calculator-copy>p{font-size:.78rem!important;line-height:1.45!important;}
        .home-page .sell-gold-instore{margin-top:.8rem!important;padding-top:.8rem!important;}
        .home-page .gold-calculator-card{padding:.9rem!important;border-radius:14px!important;}
        .home-page .gold-calculator-result{padding:.75rem!important;}
        .home-page .gold-calculator-note{font-size:.7rem!important;}
        .home-page .gold-calculator-actions{display:none!important;}
        .home-page .quick-services-section{padding:1.2rem 0!important;}
        .home-page .quick-services-pair{gap:.6rem!important;}
        .home-page .repair-feature-card,.home-page .engraving-feature-card{padding:.85rem!important;border-radius:14px!important;}
        .home-page .repair-feature-card h2,.home-page .engraving-feature-card h2{font-size:1.15rem!important;}
        .home-page .service-lead{font-size:.78rem!important;line-height:1.4!important;margin-bottom:.5rem!important;}
        .home-page .service-highlight-strip{gap:.25rem!important;margin-bottom:.45rem!important;}
        .home-page .service-highlight-strip span{padding:.28rem .42rem!important;font-size:.62rem!important;}
        .home-page .service-note{display:none!important;}
        .home-page .service-cta-row{display:none!important;}
        .home-page .engraving-ad-layout{display:grid!important;grid-template-columns:1fr 92px!important;gap:.55rem!important;align-items:center!important;}
        .home-page .engraving-ad-image{width:92px!important;height:92px!important;aspect-ratio:1/1!important;object-fit:cover!important;border-radius:10px!important;}

        /* 8. Contact and policies move toward the bottom and get smaller */
        .home-page .home-contact-band{padding:1rem 0!important;}
        .home-page .home-contact-band .eyebrow{display:none!important;}
        .home-page .home-contact-phone{font-size:1.45rem!important;margin-bottom:.2rem!important;}
        .home-page .home-contact-address{font-size:.9rem!important;}
        .home-page .home-contact-actions{display:none!important;}
        .home-page .store-policies-section{padding:.8rem 0!important;}
        .home-page .store-policies-card{padding:.8rem!important;}
        .home-page .store-policies-card h2{font-size:1.1rem!important;margin-bottom:.3rem!important;}
        .home-page .store-policies-card>p{font-size:.7rem!important;}
        .home-page .policy-action-row{gap:.35rem!important;margin-top:.5rem!important;}
        .home-page .policy-action-row .button{min-height:36px!important;padding:.4rem .55rem!important;font-size:.66rem!important;width:auto!important;}

        /* 9. Reviews and location */
        .home-page .reviews-section{padding:1.5rem 0!important;}
        .home-page .review-proof-stars{font-size:1rem!important;margin-bottom:.3rem!important;}
        .home-page .review-proof-heading h2{font-size:1.55rem!important;}
        .home-page .review-proof-heading>p{font-size:.72rem!important;}
        .home-page .review-card{padding:.8rem!important;}
        .home-page .review-card h3{font-size:.9rem!important;margin-bottom:.35rem!important;}
        .home-page .review-card p{font-size:.75rem!important;line-height:1.45!important;}
        .home-page .reviews-controls{display:none!important;}
        .home-page .visit-section{padding:1.4rem 0!important;}
        .home-page .visit-content h2{font-size:1.65rem!important;}
        .home-page .visit-highlight-address{font-size:1rem!important;}
        .home-page .visit-highlight-hours{font-size:.85rem!important;}
        .home-page .visit-cards{display:none!important;}
        .home-page .visit-actions{display:none!important;}

        /* 10. Persistent mobile actions */
        .hog-mobile-dock{position:fixed;display:grid;grid-template-columns:repeat(3,1fr);left:0;right:0;bottom:0;z-index:9999;height:62px;padding:5px max(7px,env(safe-area-inset-left)) calc(5px + env(safe-area-inset-bottom));background:rgba(255,255,255,.97);border-top:1px solid rgba(22,21,26,.10);box-shadow:0 -8px 24px rgba(22,21,26,.09);backdrop-filter:blur(10px);}
        .hog-mobile-dock a{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;color:#2a251e;font-size:.62rem;font-weight:850;text-decoration:none;border-radius:9px;}
        .hog-mobile-dock a:active{background:#f0e4cd;}
        .hog-mobile-dock b{font-size:1rem;line-height:1.1;color:#9a7129;}
        .home-page .sitewide-privacy-disclosure{padding-bottom:6px!important;}
      }
    `;
    document.head.appendChild(style);
  }

  function addReviewProof() {
    if (document.querySelector(".hog-mobile-review-proof")) return;
    const trust = document.querySelector(".trust-band");
    if (!trust) return;
    const proof = document.createElement("a");
    proof.className = "hog-mobile-review-proof";
    proof.href = "#reviews";
    proof.innerHTML = '<span class="stars">★★★★★</span><span>230+ 5-star Google reviews</span>';
    trust.insertAdjacentElement("afterend", proof);
  }

  function addOfferToggle() {
    const pane = document.querySelector(".payment-pane-offer");
    const leasing = document.querySelector(".payment-pane-leasing");
    if (!pane || !leasing || document.querySelector(".mobile-offer-toggle")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mobile-offer-toggle";
    button.textContent = "Offer Removed";
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", () => {
      const open = pane.classList.toggle("mobile-open");
      button.setAttribute("aria-expanded", String(open));
      button.textContent = open ? "Offer Removed" : "Offer Removed";
      if (open) pane.querySelector("input")?.focus({preventScroll:true});
    });
    leasing.appendChild(button);
  }

  function addMobileDock() {
    if (document.querySelector(".hog-mobile-dock")) return;
    const dock = document.createElement("nav");
    dock.className = "hog-mobile-dock";
    dock.setAttribute("aria-label", "Quick actions");
    dock.innerHTML = `
      <a href="tel:6312646610" aria-label="Call Hands of Gold"><b>☎</b><span>Call</span></a>
      <a href="#build-your-ideas" aria-label="Open Custom Jewelry Studio"><b>◆</b><span>Custom</span></a>
      <a href="https://www.google.com/maps/search/?api=1&query=494+Oak+Street+Copiague+NY+11726" target="_blank" rel="noreferrer" aria-label="Get directions to Hands of Gold"><b>⌖</b><span>Visit</span></a>`;
    document.body.appendChild(dock);
  }

  function reorderMobileSections() { return; }

  function initMobileUpgrade() {
    addMobileDock();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initMobileUpgrade);
  else initMobileUpgrade();

  let lastMobile = isMobile();
  window.addEventListener("resize", () => {
    const now = isMobile();
    if (now && !lastMobile) reorderMobileSections();
    lastMobile = now;
  }, {passive:true});
})();

// ===== HOG catalog cleanup: remove Diamond Tennis Bracelet Stack =====
(() => {
  "use strict";
  function removeDiamondTennisStack() {
    document.querySelectorAll(".catalog-product-card").forEach(card => {
      const title = card.querySelector("h3")?.textContent?.trim();
      const video = card.querySelector('source[src*="diamond-tennis-bracelets-video.mp4"]');
      if (title === "Diamond Tennis Bracelet Stack" || video) card.remove();
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", removeDiamondTennisStack);
  } else {
    removeDiamondTennisStack();
  }
})();


// ===== HOG review count sync: 230+ five-star Google reviews =====
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("h1,h2,h3,p,span,a").forEach(el => {
    if (el.children.length === 0 && /222\+\s*5-star Google reviews/i.test(el.textContent || "")) {
      el.textContent = (el.textContent || "").replace(/222\+/g, "230+");
    }
  });
});
// ===== HOG Desktop Upgrade: hero + Custom Studio priority + remove duplicate contact band =====
(() => {
  "use strict";
  const DESKTOP_MIN = 761;

  function addDesktopStyles() {
    if (document.getElementById("hog-desktop-upgrade-css")) return;
    const style = document.createElement("style");
    style.id = "hog-desktop-upgrade-css";
    style.textContent = `
      .hog-desktop-hero{display:none;}
      @media(min-width:${DESKTOP_MIN}px){
        /* Desktop-only. Mobile layout remains controlled by HOG Mobile Upgrade. */
        .hog-desktop-hero{
          display:block;
          position:relative;
          overflow:hidden;
          min-height:390px;
          background:#111;
          border-bottom:1px solid rgba(185,138,55,.24);
        }
        .hog-desktop-hero-media{
          position:absolute;
          inset:0;
          overflow:hidden;
        }
        .hog-desktop-hero-media video,
        .hog-desktop-hero-media img{
          width:100%;
          height:100%;
          object-fit:cover;
          object-position:58% 50%;
          display:block;
          filter:brightness(.80) saturate(.95);
        }
        .hog-desktop-hero-media::after{
          content:"";
          position:absolute;
          inset:0;
          background:
            linear-gradient(90deg,rgba(8,11,18,.62) 0%,rgba(8,11,18,.40) 42%,rgba(8,11,18,.14) 72%,rgba(8,11,18,.08) 100%),
            linear-gradient(0deg,rgba(8,11,18,.20),transparent 52%);
          pointer-events:none;
        }
        .hog-desktop-hero-inner{
          position:relative;
          z-index:2;
          min-height:390px;
          display:flex;
          align-items:center;
          padding-top:32px;
          padding-bottom:32px;
          align-items:flex-end;
        }
        .hog-desktop-hero-copy{
          width:min(680px,58%);
          color:#fff;
          text-shadow:0 2px 18px rgba(6,9,15,.55),0 1px 3px rgba(6,9,15,.45);
        }
        .hog-desktop-hero-eyebrow{
          margin:0 0 12px;
          color:#e2bf7f;
          font-size:.78rem;
          font-weight:900;
          letter-spacing:.16em;
          text-transform:uppercase;
        }
        .hog-desktop-hero .hog-desktop-hero-h1{
          margin:0;
          max-width:12ch;
          color:#fff;
          font-size:clamp(2rem,3.4vw,3.4rem);
          line-height:1.02;
          letter-spacing:-.045em;
        }
        .hog-desktop-hero-lead{
          max-width:620px;
          margin:20px 0 0;
          color:rgba(255,255,255,.86);
          font-size:1.05rem;
          line-height:1.65;
        }
        .hog-desktop-hero-actions{
          display:flex;
          flex-wrap:wrap;
          gap:10px;
          margin-top:26px;
        }
        .hog-desktop-hero-actions .button{
          min-width:170px;
          min-height:50px;
          justify-content:center;
        }
        .hog-desktop-hero .hog-hero-secondary{
          border-color:rgba(255,255,255,.55)!important;
          background:rgba(255,255,255,.08)!important;
          color:#fff!important;
          backdrop-filter:blur(6px);
        }
        .hog-desktop-hero .hog-hero-secondary:hover{
          background:#fff!important;
          color:#1d1812!important;
        }
        .hog-desktop-review-proof{
          display:inline-flex;
          align-items:center;
          gap:10px;
          margin-top:24px;
          padding:10px 15px;
          border:1px solid rgba(226,191,127,.34);
          border-radius:999px;
          background:rgba(15,13,11,.48);
          color:#fff;
          text-decoration:none;
          backdrop-filter:blur(8px);
          font-size:.9rem;
          font-weight:800;
        }
        .hog-desktop-review-proof .stars{
          color:#e2bf7f;
          letter-spacing:.08em;
        }
        .hog-desktop-review-proof strong{color:#fff;}

        /* Remove duplicate mid-page contact band on desktop only. */
        .home-page .home-contact-band{
          display:none!important;
        }

        /* The Custom Jewelry Studio follows inventory immediately on desktop. */
        .home-page #build-your-ideas{
          border-top:1px solid rgba(22,21,26,.08);
        }

        /* Let the financing area breathe after the hero without becoming another hero. */
        .home-page #payment-options{
          border-top:0!important;
        }
      }
      @media(min-width:761px) and (max-width:1050px){
        .hog-desktop-hero{min-height:340px;}
        .hog-desktop-hero-inner{min-height:340px;}
        .hog-desktop-hero-copy{width:72%;}
        .hog-desktop-hero h1{font-size:clamp(2.8rem,6vw,4.8rem);}
      }

      /* Mobile: surface the H1 only - no video, no buttons, no extra requests.
         Google indexes mobile-first, so the heading must be visible on phones. */
      @media(max-width:760px){
        .hog-desktop-hero{
          display:block;
          position:relative;
          padding:20px 0 16px;
          background:#0f0f10;
          border-bottom:1px solid rgba(226,191,127,.18);
        }
        .hog-desktop-hero-media,
        .hog-desktop-hero-media video,
        .hog-desktop-hero-lead,
        .hog-desktop-hero-actions,
        .hog-desktop-review-proof{display:none!important;}
        .hog-desktop-hero-inner{
          display:block;
          min-height:0;
          padding-top:0;
          padding-bottom:0;
        }
        .hog-desktop-hero-copy{width:auto;color:#fff;}
        .hog-desktop-hero-eyebrow{
          margin:0 0 7px;
          color:#e2bf7f;
          font-size:.64rem;
          font-weight:900;
          letter-spacing:.16em;
          text-transform:uppercase;
        }
        .hog-desktop-hero h1{
          margin:0;
          max-width:none;
          color:#fff;
          font-size:1.45rem;
          line-height:1.22;
          letter-spacing:-.02em;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function addDesktopHero() {
    if (document.querySelector(".hog-desktop-hero")) return;
    const trust = document.querySelector(".trust-band");
    if (!trust) return;

    /* ---------------------------------------------------------------
       HERO BACKGROUND VIDEO
       Change the filename below to swap the clip behind the headline.
       It must be a file that exists in your new-media folder.
       --------------------------------------------------------------- */
    const HERO_IMAGE = "new-media/hero-diamond-studs-landscape.png";

    const hero = document.createElement("section");
    hero.className = "hog-desktop-hero";
    hero.setAttribute("aria-label", "Hands of Gold jewelry showroom");
    hero.innerHTML = `
      <div class="hog-desktop-hero-media" aria-hidden="true">
        <img src="${HERO_IMAGE}" alt="" fetchpriority="high" decoding="async">
      </div>
      <div class="container hog-desktop-hero-inner">
        <div class="hog-desktop-hero-copy">
          <p class="hog-desktop-hero-eyebrow">Hands of Gold Jewelry & Repairs</p>
          <div class="hog-desktop-hero-actions">
            <a class="button button-primary" href="#featured-products">Shop In Stock</a>
            <a class="button hog-hero-secondary" href="#build-your-ideas">Create Custom</a>
            <a class="button hog-hero-secondary" href="#sell-watches-gold">Sell Gold</a>
          </div>
          <a class="hog-desktop-review-proof" href="#reviews" aria-label="See Hands of Gold Google reviews">
            <span class="stars">★★★★★</span>
            <span><strong>230+</strong> 5-star Google reviews</span>
          </a>
        </div>
      </div>`;
    trust.insertAdjacentElement("afterend", hero);
  }

  function moveCustomStudioDesktop() {
    if (!window.matchMedia(`(min-width:${DESKTOP_MIN}px)`).matches) return;
    const catalog = document.getElementById("featured-products");
    const custom = document.getElementById("build-your-ideas");
    if (catalog && custom && catalog.nextElementSibling !== custom) {
      catalog.insertAdjacentElement("afterend", custom);
    }
  }

  function initDesktopUpgrade() { return; }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDesktopUpgrade);
  } else {
    initDesktopUpgrade();
  }

  let desktop = window.matchMedia(`(min-width:${DESKTOP_MIN}px)`).matches;
  window.addEventListener("resize", () => {
    const now = window.matchMedia(`(min-width:${DESKTOP_MIN}px)`).matches;
    if (now && !desktop) moveCustomStudioDesktop();
    desktop = now;
  }, {passive:true});
})();
// ===== HOG Site Polish: catalog, performance, desktop conversion polish =====
(() => {
  "use strict";
  const DESKTOP_MIN = 761;

  function addPolishStyles() {
    if (document.getElementById("hog-site-polish-css")) return;
    const style = document.createElement("style");
    style.id = "hog-site-polish-css";
    style.textContent = `
      @media(min-width:${DESKTOP_MIN}px){
        /* Slimmer financing + welcome offer */
        .home-page #payment-options{
          padding:1.05rem 0!important;
        }
        .home-page #payment-options .payment-options-inner{
          gap:1rem!important;
          align-items:stretch!important;
        }
        .home-page #payment-options .payment-options-split{
          grid-template-columns:minmax(0,1.25fr) minmax(360px,.75fr)!important;
        }
        .home-page #payment-options .payment-pane{
          padding:1rem 1.1rem!important;
          border-radius:16px!important;
        }
        .home-page #payment-options .payment-options-copy{
          margin-bottom:.6rem!important;
        }
        .home-page #payment-options .payment-options-eyebrow{
          margin-bottom:.25rem!important;
        }
        .home-page #payment-options .payment-options-title{
          font-size:1.45rem!important;
          line-height:1.1!important;
        }
        .home-page #payment-options .payment-options-subtitle{
          margin:.35rem 0 0!important;
          font-size:.78rem!important;
          line-height:1.45!important;
        }
        .home-page #payment-options .payment-options-actions{
          gap:.45rem!important;
        }
        .home-page #payment-options .payment-option-button{
          min-height:52px!important;
          padding:.45rem .7rem!important;
        }
        .home-page #payment-options .payment-options-terms{
          margin-top:.45rem!important;
          font-size:.68rem!important;
        }
        .home-page #payment-options .offer-form{
          padding:.15rem!important;
        }
        .home-page #payment-options .offer-form-eyebrow{
          margin-bottom:.15rem!important;
        }
        .home-page #payment-options .offer-form-title{
          font-size:1.35rem!important;
          margin-bottom:.25rem!important;
        }
        .home-page #payment-options .offer-form-copy{
          font-size:.75rem!important;
          line-height:1.35!important;
          margin-bottom:.5rem!important;
        }
        .home-page #payment-options .offer-form-fields{
          gap:.4rem!important;
        }
        .home-page #payment-options .offer-field span{
          font-size:.65rem!important;
        }
        .home-page #payment-options .offer-field input{
          min-height:39px!important;
          padding:.5rem .6rem!important;
        }
        .home-page #payment-options .offer-consent{
          margin:.5rem 0!important;
          font-size:.62rem!important;
          line-height:1.35!important;
        }
        .home-page #payment-options .offer-submit{
          min-height:42px!important;
          padding:.55rem .8rem!important;
        }

        /* Cleaner desktop product cards */
        .home-page .catalog-product-card{
          transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease;
        }
        .home-page .catalog-product-card:hover{
          transform:translateY(-3px);
          box-shadow:0 14px 34px rgba(22,21,26,.08);
          border-color:rgba(185,138,55,.34)!important;
        }
        .home-page .catalog-product-footer a{
          font-weight:800!important;
          text-decoration:none!important;
        }

        /* True 2-column Custom Jewelry Studio */
        .home-page #build-your-ideas .custom-builder.hog-custom-desktop-layout{
          display:grid!important;
          grid-template-columns:minmax(0,1.18fr) minmax(380px,.82fr)!important;
          gap:1rem 1.2rem!important;
          align-items:start!important;
        }
        .home-page #build-your-ideas .hog-custom-left,
        .home-page #build-your-ideas .hog-custom-right{
          min-width:0;
        }
        .home-page #build-your-ideas .hog-custom-left{
          display:grid;
          gap:.85rem;
        }
        .home-page #build-your-ideas .hog-custom-right{
          display:grid;
          gap:.85rem;
          position:sticky;
          top:112px;
        }
        .home-page #build-your-ideas .hog-custom-left .custom-builder-step,
        .home-page #build-your-ideas .hog-custom-right .custom-order-contact,
        .home-page #build-your-ideas .hog-custom-right .custom-builder-summary{
          margin:0!important;
        }
        .home-page #build-your-ideas .hog-custom-right .custom-order-contact{
          grid-template-columns:1fr 1fr!important;
        }
        .home-page #build-your-ideas .hog-custom-right .custom-order-contact h3,
        .home-page #build-your-ideas .hog-custom-right .custom-order-consent,
        .home-page #build-your-ideas .hog-custom-right .custom-order-submit-row,
        .home-page #build-your-ideas .hog-custom-right .custom-order-note,
        .home-page #build-your-ideas .hog-custom-right .custom-order-status{
          grid-column:1/-1!important;
        }
        .home-page #build-your-ideas .hog-custom-right .custom-order-submit-row{
          display:grid!important;
          grid-template-columns:1fr!important;
        }
        .home-page #build-your-ideas .hog-custom-right .custom-order-submit-row .button{
          width:100%!important;
          justify-content:center!important;
        }
        .home-page #build-your-ideas .hog-custom-right .custom-builder-consent{
          font-size:.72rem!important;
          line-height:1.4!important;
        }

        /* Reviews: strong proof left, 3 review cards visible right */
        .home-page #reviews > .container{
          display:grid!important;
          grid-template-columns:280px minmax(0,1fr)!important;
          gap:1.25rem 2rem!important;
          align-items:start!important;
        }
        .home-page #reviews .review-proof-heading{
          grid-column:1!important;
          grid-row:1!important;
          text-align:left!important;
          position:sticky;
          top:112px;
          margin:0!important;
        }
        .home-page #reviews .review-proof-heading h2{
          font-size:2.15rem!important;
          line-height:1.02!important;
        }
        .home-page #reviews .review-proof-stars{
          justify-content:flex-start!important;
        }
        .home-page #reviews .reviews-shell{
          grid-column:2!important;
          grid-row:1!important;
          min-width:0!important;
          margin:0!important;
        }
        .home-page #reviews .section-cta{
          grid-column:2!important;
          margin-top:0!important;
        }
        .home-page #reviews .reviews-track{
          gap:.75rem!important;
          scroll-snap-type:x mandatory!important;
        }
        .home-page #reviews .review-card{
          flex:0 0 calc((100% - 1.5rem)/3)!important;
          min-width:0!important;
          scroll-snap-align:start!important;
          padding:1rem!important;
        }
        .home-page #reviews .review-card p{
          font-size:.82rem!important;
          line-height:1.5!important;
        }

        /* Smaller, cleaner desktop footer */
        .home-page .site-footer{
          padding-top:1.8rem!important;
        }
        .home-page .footer-grid{
          gap:1.2rem!important;
          padding-top:.5rem!important;
          padding-bottom:1.1rem!important;
        }
        .home-page .footer-brand p,
        .home-page .footer-column p,
        .home-page .footer-column a{
          font-size:.78rem!important;
          line-height:1.45!important;
        }
        .home-page .footer-logo{
          max-width:74px!important;
        }
        .home-page .footer-bottom{
          padding-top:.7rem!important;
          padding-bottom:.7rem!important;
          font-size:.72rem!important;
        }
      }

      @media(max-width:1080px) and (min-width:761px){
        .home-page #reviews > .container{
          grid-template-columns:230px minmax(0,1fr)!important;
          gap:1.2rem!important;
        }
        .home-page #reviews .review-card{
          flex-basis:calc((100% - .75rem)/2)!important;
        }
        .home-page #build-your-ideas .custom-builder.hog-custom-desktop-layout{
          grid-template-columns:minmax(0,1fr) minmax(340px,.9fr)!important;
        }
      }

      @media(max-width:760px){
        /* Wrappers preserve the mobile layout rather than changing it. */
        .home-page #build-your-ideas .hog-custom-left,
        .home-page #build-your-ideas .hog-custom-right{
          display:contents!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function fixPendantCategory() {
    const row = document.querySelector(".catalog-filter-row");
    if (!row) return;

    // Reclassify products whose visible type is Pendant.
    document.querySelectorAll(".catalog-product-card").forEach(card => {
      const type = card.querySelector(".catalog-product-meta span:first-child")?.textContent?.trim().toLowerCase() || "";
      const title = card.querySelector("h3")?.textContent?.toLowerCase() || "";
      if (type === "pendant" || title.includes("pendant")) {
        card.dataset.category = "pendant";
      }
    });

    if (row.querySelector('[data-filter="pendant"]')) return;
    const button = document.createElement("button");
    button.className = "catalog-filter";
    button.dataset.filter = "pendant";
    button.type = "button";
    button.textContent = "Pendants";

    const chain = row.querySelector('[data-filter="chain"]');
    if (chain) chain.insertAdjacentElement("beforebegin", button);
    else row.appendChild(button);

    button.addEventListener("click", () => {
      row.querySelectorAll(".catalog-filter").forEach(b => b.classList.remove("is-active"));
      button.classList.add("is-active");
      document.querySelectorAll(".catalog-product-card").forEach(card => {
        card.hidden = card.dataset.category !== "pendant";
      });
    });
  }

  function improveProductActions() {
    document.querySelectorAll(".catalog-product-card").forEach(card => {
      const action = card.querySelector(".catalog-product-footer a");
      if (action) {
        action.textContent = "Ask About This Piece →";
        const title = card.querySelector("h3")?.textContent?.trim();
        if (title) action.setAttribute("aria-label", `Call Hands of Gold about ${title}`);
      }
    });
  }

  function optimizeVideoPlayback() {
    if (!("IntersectionObserver" in window)) return;
    const videos = [...document.querySelectorAll(".catalog-product-card video")];
    if (!videos.length) return;

    videos.forEach(video => {
      video.dataset.hogAutoVideo = "1";
      video.muted = true;
      video.setAttribute("playsinline", "");
      // Do not change any video files; only control playback.
    });

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const video = entry.target;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.18) {
          const p = video.play();
          if (p && typeof p.catch === "function") p.catch(() => {});
        } else {
          video.pause();
        }
      });
    }, {threshold:[0,0.18,0.55]});

    videos.forEach(video => observer.observe(video));
  }

  function buildDesktopCustomLayout() {
    const builder = document.getElementById("custom-builder");
    if (!builder || builder.dataset.hogTwoColumn === "1") return;

    const steps = [...builder.querySelectorAll(":scope > .custom-builder-step")];
    const contact = builder.querySelector(":scope > .custom-order-contact");
    const consent = builder.querySelector(":scope > .custom-builder-consent");
    const summary = builder.querySelector(":scope > .custom-builder-summary");
    if (!steps.length || !summary) return;

    const left = document.createElement("div");
    const right = document.createElement("div");
    left.className = "hog-custom-left";
    right.className = "hog-custom-right";

    steps.forEach(step => left.appendChild(step));
    if (contact) right.appendChild(contact);
    if (consent) right.appendChild(consent);
    right.appendChild(summary);

    builder.append(left, right);
    builder.classList.add("hog-custom-desktop-layout");
    builder.dataset.hogTwoColumn = "1";
  }

  function syncReviewCount() {
    document.querySelectorAll("h1,h2,h3,p,span,a").forEach(el => {
      if (el.children.length === 0 && /222\+\s*5-star Google reviews/i.test(el.textContent || "")) {
        el.textContent = (el.textContent || "").replace(/222\+/g, "230+");
      }
    });
  }

  function initPolish() {
    fixPendantCategory();
    improveProductActions();
    buildDesktopCustomLayout();
    syncReviewCount();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPolish);
  } else {
    initPolish();
  }
})();
// ===== HOG Full Conversion Upgrade: search, product details, inquiry, Spanish, FAQ, analytics =====
(() => {
  "use strict";
  const STORE_PHONE = "6312646610";
  const clean = s => (s || "").replace(/\s+/g, " ").trim();
  const ga = (event, params={}) => {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({event, ...params});
  };

  function addStyles() {
    if (document.getElementById("hog-full-conversion-css")) return;
    const style = document.createElement("style");
    style.id = "hog-full-conversion-css";
    style.textContent = `
      .hog-shop-tools,.hog-product-modal,.hog-language-toggle,.hog-faq-section,.hog-process-section,.hog-service-proof,.hog-seo-links{font-family:inherit}
      .hog-shop-tools{margin:0 0 1rem;padding:.85rem;border:1px solid rgba(22,21,26,.09);border-radius:16px;background:#fff;box-shadow:0 8px 24px rgba(22,21,26,.04)}
      .hog-shop-tools-top{display:grid;grid-template-columns:minmax(220px,1fr) auto;gap:.7rem;align-items:center}
      .hog-search-wrap{position:relative}
      .hog-search-wrap input{width:100%;min-height:46px;padding:.7rem 2.8rem .7rem .9rem;border:1px solid rgba(22,21,26,.13);border-radius:999px;background:#faf9f7;color:#16151a;font:inherit}
      .hog-search-wrap b{position:absolute;right:1rem;top:50%;transform:translateY(-50%);font-size:1rem;color:#9a7129}
      .hog-quick-filters{display:flex;flex-wrap:wrap;gap:.4rem}
      .hog-quick-filter{min-height:40px;padding:.45rem .75rem;border:1px solid rgba(22,21,26,.12);border-radius:999px;background:#fff;color:#2d2924;font:inherit;font-size:.75rem;font-weight:800;cursor:pointer}
      .hog-quick-filter.is-active{background:#1a1713;color:#fff;border-color:#1a1713}
      .hog-shop-tools-meta{display:flex;justify-content:space-between;gap:1rem;margin-top:.6rem;color:#6f685f;font-size:.72rem}
      .hog-product-card-badges{position:absolute;left:.55rem;top:.55rem;z-index:3;display:flex;gap:.3rem;flex-wrap:wrap;pointer-events:none}
      .hog-product-badge{padding:.26rem .45rem;border-radius:999px;background:rgba(255,255,255,.94);border:1px solid rgba(22,21,26,.08);font-size:.56rem;font-weight:900;letter-spacing:.035em;text-transform:uppercase;color:#2d2924;box-shadow:0 3px 12px rgba(22,21,26,.06)}
      .hog-product-badge.gold{background:#b98a37;color:#fff;border-color:#b98a37}
      .hog-card-inquiry-row{display:grid;grid-template-columns:1fr 1fr;gap:.35rem;margin-top:.45rem}
      .hog-card-inquiry-row a,.hog-card-inquiry-row button{min-height:34px;border-radius:8px;border:1px solid rgba(22,21,26,.11);background:#fff;color:#2d2924;font:inherit;font-size:.62rem;font-weight:850;display:flex;align-items:center;justify-content:center;text-decoration:none;cursor:pointer}
      .hog-card-inquiry-row a:hover,.hog-card-inquiry-row button:hover{border-color:#b98a37;color:#9a7129}
      .hog-product-modal{position:fixed;inset:0;z-index:10020;display:none}
      .hog-product-modal.is-open{display:block}
      .hog-product-modal-overlay{position:absolute;inset:0;background:rgba(10,9,8,.74);backdrop-filter:blur(5px)}
      .hog-product-modal-card{position:relative;z-index:2;width:min(960px,calc(100% - 32px));max-height:calc(100vh - 40px);overflow:auto;margin:20px auto;background:#fff;border-radius:20px;box-shadow:0 24px 80px rgba(0,0,0,.28)}
      .hog-product-modal-close{position:absolute;right:12px;top:12px;z-index:4;width:40px;height:40px;border:0;border-radius:50%;background:rgba(255,255,255,.94);font-size:1.4rem;cursor:pointer}
      .hog-product-modal-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(320px,.95fr)}
      .hog-product-modal-media{min-height:520px;background:#f5f2ed;display:flex;align-items:center;justify-content:center;overflow:hidden}
      .hog-product-modal-media img,.hog-product-modal-media video{width:100%;height:100%;max-height:620px;object-fit:cover}
      .hog-product-modal-copy{padding:2rem}
      .hog-product-modal-copy h2{font-size:2rem;line-height:1.05;margin:.2rem 0 .7rem}
      .hog-product-modal-desc{color:#5f584f;line-height:1.55}
      .hog-product-modal-meta{display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin:1rem 0}
      .hog-product-modal-meta span{padding:.65rem;border-radius:10px;background:#f7f5f1;font-size:.76rem;font-weight:800}
      .hog-product-modal-actions{display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-top:1rem}
      .hog-product-modal-actions a{min-height:46px;display:flex;align-items:center;justify-content:center;text-decoration:none}
      .hog-modal-finance{grid-column:1/-1}
      .hog-language-toggle{position:fixed;right:18px;bottom:82px;z-index:68;display:flex;border:1px solid rgba(22,21,26,.12);border-radius:999px;background:#fff;box-shadow:0 8px 24px rgba(22,21,26,.10);overflow:hidden}
      .hog-language-toggle button{border:0;background:#fff;padding:.5rem .7rem;font:inherit;font-size:.68rem;font-weight:900;cursor:pointer}
      .hog-language-toggle button.is-active{background:#1a1713;color:#fff}
      .hog-process-section,.hog-faq-section,.hog-service-proof{padding:2.5rem 0}
      .hog-process-card,.hog-faq-card,.hog-service-proof-card{border:1px solid rgba(22,21,26,.09);border-radius:18px;background:#fff;padding:1.3rem}
      .hog-process-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:.55rem;margin-top:1rem}
      .hog-process-step{padding:.9rem .7rem;border-radius:12px;background:#f8f6f2;min-height:110px}
      .hog-process-step b{display:block;color:#9a7129;font-size:.72rem;margin-bottom:.3rem}
      .hog-process-step strong{display:block;font-size:.9rem;line-height:1.2}
      .hog-process-step span{display:block;color:#6f685f;font-size:.7rem;line-height:1.35;margin-top:.35rem}
      .hog-faq-grid{display:grid;grid-template-columns:1fr 1fr;gap:.6rem;margin-top:1rem}
      .hog-faq-grid details{border:1px solid rgba(22,21,26,.08);border-radius:12px;background:#faf9f7;padding:.75rem .85rem}
      .hog-faq-grid summary{font-weight:850;cursor:pointer}
      .hog-faq-grid p{font-size:.78rem;line-height:1.5;color:#625c54}
      .hog-seo-links{margin-top:1rem;display:flex;flex-wrap:wrap;gap:.45rem}
      .hog-seo-links a{font-size:.72rem;font-weight:800;color:#8a6525;text-decoration:none;padding:.38rem .55rem;border:1px solid rgba(185,138,55,.22);border-radius:999px}
      .hog-service-proof-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.7rem;margin-top:1rem}
      .hog-service-proof-item{padding:1rem;border-radius:12px;background:#f8f6f2}
      .hog-service-proof-item strong{display:block;margin-bottom:.35rem}
      .hog-service-proof-item span{font-size:.76rem;line-height:1.45;color:#655e55}
      @media(max-width:900px){
        .hog-process-grid{grid-template-columns:repeat(3,1fr)}
        .hog-product-modal-grid{grid-template-columns:1fr}
        .hog-product-modal-media{min-height:460px}
        .hog-faq-grid{grid-template-columns:1fr}
        .hog-service-proof-grid{grid-template-columns:1fr}
      }
      @media(max-width:760px){
        .hog-shop-tools{padding:.65rem;margin-bottom:.7rem}
        .hog-shop-tools-top{grid-template-columns:1fr}
        .hog-quick-filters{overflow-x:auto;flex-wrap:nowrap;padding-bottom:.15rem}
        .hog-quick-filter{flex:0 0 auto}
        .hog-shop-tools-meta{font-size:.64rem}
        .hog-card-inquiry-row{grid-template-columns:1fr}
        .hog-product-modal-card{width:calc(100% - 14px);margin:7px auto;max-height:calc(100vh - 14px);border-radius:14px}
        .hog-product-modal-copy{padding:1rem}
        .hog-product-modal-copy h2{font-size:1.5rem}
        .hog-product-modal-actions{grid-template-columns:1fr}
        .hog-modal-finance{grid-column:auto}
        .hog-language-toggle{right:8px;bottom:72px}
        .hog-process-section,.hog-faq-section,.hog-service-proof{padding:1.4rem 0}
        .hog-process-grid{grid-template-columns:1fr 1fr}
        .hog-process-step{min-height:96px}
      }
    `;
    document.head.appendChild(style);
  }

  function collectProducts() {
    return [...document.querySelectorAll(".catalog-product-card")].map((card, i) => {
      const title = clean(card.querySelector("h3")?.textContent);
      const desc = clean(card.querySelector(".catalog-product-copy > p")?.textContent);
      const type = clean(card.querySelector(".catalog-product-meta span:first-child")?.textContent);
      const state = clean(card.querySelector(".catalog-product-meta span:last-child")?.textContent);
      const category = card.dataset.category || type.toLowerCase();
      return {card, title, desc, type, state, category, index:i};
    });
  }

  function inferAvailability(p) {
    if (/available to order/i.test(p.state)) return "Made to Order";
    if (/video/i.test(p.state)) return "In Store";
    return "Ask for Availability";
  }

  function markMerchandising(products) {
    const newArrivalWords = /new|arrival|exclusive/i;
    const bestWords = /cuban|figaro|heart|hoop|iced|initial|picture/i;
    products.forEach((p, i) => {
      const image = p.card.querySelector(".catalog-product-image");
      if (image && getComputedStyle(image).position === "static") image.style.position = "relative";
      p.card.dataset.hogSearch = clean(`${p.title} ${p.desc} ${p.type} ${p.category}`).toLowerCase();
      p.card.dataset.hogAvailability = inferAvailability(p);
      p.card.dataset.hogNew = newArrivalWords.test(p.title) || i < 6 ? "1" : "0";
      p.card.dataset.hogBest = bestWords.test(p.title) && i < 24 ? "1" : "0";
      if (!p.card.querySelector(".hog-product-card-badges") && image) {
        const badges = document.createElement("div");
        badges.className = "hog-product-card-badges";
        const avail = document.createElement("span");
        avail.className = "hog-product-badge";
        avail.textContent = p.card.dataset.hogAvailability;
        badges.appendChild(avail);
        if (p.card.dataset.hogNew === "1") {
          const badge = document.createElement("span");
          badge.className = "hog-product-badge gold";
          badge.textContent = "New";
          badges.appendChild(badge);
        } else if (p.card.dataset.hogBest === "1") {
          const badge = document.createElement("span");
          badge.className = "hog-product-badge gold";
          badge.textContent = "Popular";
          badges.appendChild(badge);
        }
        image.appendChild(badges);
      }
    });
  }

  function addShopTools() {
    const filters = document.querySelector("#featured-products .catalog-filter-row");
    if (!filters || document.querySelector(".hog-shop-tools")) return;
    const box = document.createElement("div");
    box.className = "hog-shop-tools";
    box.innerHTML = `
      <div class="hog-shop-tools-top">
        <label class="hog-search-wrap">
          <input id="hog-product-search" type="search" placeholder="Search rings, Cuban, pendants, hearts..." autocomplete="off" aria-label="Search jewelry">
          <b>⌕</b>
        </label>
        <div class="hog-quick-filters" aria-label="Quick product filters">
          <button class="hog-quick-filter is-active" type="button" data-hog-view="all">All</button>
          <button class="hog-quick-filter" type="button" data-hog-view="new">New Arrivals</button>
          <button class="hog-quick-filter" type="button" data-hog-view="best">Popular</button>
          <button class="hog-quick-filter" type="button" data-hog-view="instore">In Store</button>
          <button class="hog-quick-filter" type="button" data-hog-view="order">Made to Order</button>
        </div>
      </div>
      <div class="hog-shop-tools-meta">
        <span id="hog-product-count">Browse our jewelry selection</span>
        <span>Need help? Call or text us about any piece.</span>
      </div>`;
    filters.insertAdjacentElement("beforebegin", box);

    const search = box.querySelector("#hog-product-search");
    const count = box.querySelector("#hog-product-count");
    let activeView = "all";

    function apply() {
      const q = clean(search.value).toLowerCase();
      const cards = collectProducts();
      let visible = 0;
      cards.forEach(p => {
        const searchMatch = !q || p.card.dataset.hogSearch.includes(q);
        let viewMatch = true;
        if (activeView === "new") viewMatch = p.card.dataset.hogNew === "1";
        if (activeView === "best") viewMatch = p.card.dataset.hogBest === "1";
        if (activeView === "instore") viewMatch = p.card.dataset.hogAvailability === "In Store";
        if (activeView === "order") viewMatch = p.card.dataset.hogAvailability === "Made to Order";
        p.card.hidden = !(searchMatch && viewMatch);
        if (!p.card.hidden) visible++;
      });
      count.textContent = `${visible} ${visible === 1 ? "piece" : "pieces"} shown`;
    }

    search.addEventListener("input", () => {
      apply();
      ga("catalog_search", {search_term:clean(search.value).toLowerCase() || "none"});
    });

    box.querySelectorAll("[data-hog-view]").forEach(btn => {
      btn.addEventListener("click", () => {
        box.querySelectorAll("[data-hog-view]").forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        activeView = btn.dataset.hogView;
        document.querySelectorAll(".catalog-filter").forEach(b => b.classList.remove("is-active"));
        apply();
        ga("catalog_filter_used", {filter:activeView});
      });
    });

    apply();
  }

  function ensureModal() {
    let modal = document.querySelector(".hog-product-modal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "hog-product-modal";
    modal.setAttribute("aria-hidden","true");
    modal.innerHTML = `
      <div class="hog-product-modal-overlay" data-hog-close="1"></div>
      <div class="hog-product-modal-card" role="dialog" aria-modal="true" aria-label="Jewelry details">
        <button class="hog-product-modal-close" type="button" aria-label="Close product details" data-hog-close="1">×</button>
        <div class="hog-product-modal-grid">
          <div class="hog-product-modal-media"></div>
          <div class="hog-product-modal-copy">
            <p class="eyebrow">Hands of Gold Jewelry</p>
            <h2></h2>
            <p class="hog-product-modal-desc"></p>
            <div class="hog-product-modal-meta">
              <span class="hog-modal-type"></span>
              <span class="hog-modal-availability"></span>
              <span>Price: Call for current price</span>
              <span>Store: Copiague, NY</span>
            </div>
            <p style="font-size:.76rem;line-height:1.5;color:#6b645b">Metal, weight, dimensions, stone details, sizing and exact availability vary by piece. Call or text us and we’ll confirm the current item details before purchase.</p>
            <div class="hog-product-modal-actions">
              <a class="button button-primary hog-modal-call" href="tel:${STORE_PHONE}">Call About This Piece</a>
              <a class="button button-secondary hog-modal-text" href="#">Text About This Piece</a>
              <a class="button button-secondary hog-modal-finance" href="#payment-options">View Payment Options</a>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll("[data-hog-close]").forEach(el => el.addEventListener("click", closeProductModal));
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeProductModal(); });
    return modal;
  }

  function openProductModal(p) {
    const modal = ensureModal();
    const media = modal.querySelector(".hog-product-modal-media");
    media.innerHTML = "";
    const sourceMedia = p.card.querySelector(".catalog-product-image img, .catalog-product-image video");
    let modalVideo = null;
    if (sourceMedia) {
      const clone = sourceMedia.cloneNode(true);
      if (clone.tagName === "VIDEO") {
        // Card videos are click-to-play: initClickToPlay() moves each
        // <source src> into data-src so nothing downloads until tapped.
        // The clone inherits that stripped markup, so the real file has to be
        // put back or the modal shows an empty player. This was the bug.
        clone.querySelectorAll("source").forEach(function (sc) {
          const d = sc.getAttribute("data-src");
          if (d && !sc.getAttribute("src")) sc.setAttribute("src", d);
        });
        clone.controls = true;
        clone.loop = true;
        clone.muted = true;
        clone.setAttribute("muted", "");
        clone.playsInline = true;
        clone.setAttribute("playsinline", "");
        clone.setAttribute("preload", "auto");
        clone.removeAttribute("autoplay"); // we call play() by hand once visible
        modalVideo = clone;
      }
      media.appendChild(clone);
    }
    modal.querySelector("h2").textContent = p.title;
    modal.querySelector(".hog-product-modal-desc").textContent = p.desc || "Ask Hands of Gold for details on this piece.";
    modal.querySelector(".hog-modal-type").textContent = `Type: ${p.type || p.category}`;
    modal.querySelector(".hog-modal-availability").textContent = "Availability: Call to confirm";
    const smsText = encodeURIComponent(`Hi Hands of Gold, I'm interested in: ${p.title}`);
    modal.querySelector(".hog-modal-text").href = `sms:${STORE_PHONE}?body=${smsText}`;
    modal.querySelector(".hog-modal-call").onclick = () => ga("product_call_click", {product_name:p.title});
    modal.querySelector(".hog-modal-text").onclick = () => ga("product_text_click", {product_name:p.title, source:"modal"});
    document.dispatchEvent(new CustomEvent('hog:product-open', {detail: {card: p.card, modal: modal}}));
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden","false");
    document.documentElement.style.overflow = "hidden";

    // Play only after the modal is on screen. Chrome and Safari refuse
    // playback for a video sitting inside a hidden container, and nothing
    // retries it later, which is why the old code silently did nothing.
    if (modalVideo) {
      modalVideo.load();
      requestAnimationFrame(function () {
        const pr = modalVideo.play();
        if (pr && pr.catch) pr.catch(function () {
          modalVideo.controls = true; // blocked: leave the user a play button
        });
      });
    }
  }

  function closeProductModal() {
    const modal = document.querySelector(".hog-product-modal");
    if (!modal || !modal.classList.contains("is-open")) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden","true");
    document.documentElement.style.overflow = "";
    modal.querySelectorAll("video").forEach(v => v.pause());
    // Empty the media pane so the clip stops downloading in the background.
    const closedMedia = modal.querySelector(".hog-product-modal-media");
    if (closedMedia) closedMedia.innerHTML = "";
  }

  function addInquiryActions(products) {
    products.forEach(p => {
      const footer = p.card.querySelector(".catalog-product-footer");
      if (!footer || p.card.querySelector(".hog-card-inquiry-row")) return;
      const row = document.createElement("div");
      row.className = "hog-card-inquiry-row";
      row.innerHTML = `<button type="button" class="hog-view-piece">View Details</button>`;
      footer.insertAdjacentElement("afterend", row);
      row.querySelector(".hog-view-piece").addEventListener("click", () => {
        openProductModal(p);
        ga("product_detail_open", {product_name:p.title, category:p.category});
      });
    });
  }

  function addLanguageToggle() {
    if (document.querySelector(".hog-language-toggle")) return;
    const toggle = document.createElement("div");
    toggle.className = "hog-language-toggle";
    toggle.setAttribute("aria-label","Language");
    toggle.innerHTML = `<button class="is-active" data-lang="en" type="button">EN</button><button data-lang="es" type="button">ES</button>`;
    document.body.appendChild(toggle);

    const translations = {
      "Products":"Productos","Payment Options":"Opciones de Pago","Custom Jewelry":"Joyería Personalizada",
      "Sell Gold / Gold Calculator":"Vender Oro / Calculadora","Repairs":"Reparaciones","Engraving":"Grabado","Visit":"Visítanos",
      "Shop In Stock":"Comprar en Inventario","Create Custom":"Crear Personalizado","Sell Gold":"Vender Oro",
      "IN STOCK NOW":"EN INVENTARIO AHORA","All Items":"Todos","Bracelets":"Pulseras","Rings":"Anillos","Chains":"Cadenas",
      "Earrings":"Aretes","Pendants":"Dijes","Create Your Jewelry":"Crea Tu Joya",
      "See what your gold may be worth.":"Vea cuánto podría valer su oro.","Please visit our physical location.":"Visite nuestra tienda física."
    };
    const targets = () => [...document.querySelectorAll(".site-nav a,.hog-desktop-hero-actions a,.fire-stock-heading,.catalog-filter,.piece-builder-section h2,.gold-calculator-copy h2,.visit-content h2")];

    targets().forEach(el => {
      const text = clean(el.textContent);
      if (translations[text]) el.dataset.hogEnglish = text;
    });

    toggle.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => {
        const lang = btn.dataset.lang;
        toggle.querySelectorAll("button").forEach(b => b.classList.toggle("is-active", b === btn));
        targets().forEach(el => {
          const en = el.dataset.hogEnglish;
          if (!en) return;
          el.textContent = lang === "es" ? translations[en] : en;
        });
        document.documentElement.lang = lang === "es" ? "es" : "en";
        ga("language_toggle", {language:lang});
      });
    });
  }

  function addCustomProcess() {
    const custom = document.getElementById("build-your-ideas");
    if (!custom || document.querySelector(".hog-process-section")) return;
    const section = document.createElement("section");
    section.className = "hog-process-section";
    section.innerHTML = `
      <div class="container"><div class="hog-process-card">
        <p class="eyebrow">How Custom Jewelry Works</p>
        <h2 style="margin:.15rem 0 0">From your idea to the finished piece.</h2>
        <div class="hog-process-grid">
          <div class="hog-process-step"><b>01</b><strong>Your Idea</strong><span>Tell us what you want to create.</span></div>
          <div class="hog-process-step"><b>02</b><strong>Design / CAD</strong><span>We develop the design and specifications.</span></div>
          <div class="hog-process-step"><b>03</b><strong>Approval</strong><span>You review the design before production.</span></div>
          <div class="hog-process-step"><b>04</b><strong>Order Details</strong><span>We confirm pricing and purchase details with you.</span></div>
          <div class="hog-process-step"><b>05</b><strong>Production</strong><span>Your piece is made, finished and inspected.</span></div>
          <div class="hog-process-step"><b>06</b><strong>Pickup</strong><span>Complete your purchase and collect the finished piece.</span></div>
        </div>
        <p style="margin:.8rem 0 0;font-size:.72rem;color:#6f685f">Exact design process, production time, pricing and payment options depend on the custom project and are confirmed by Hands of Gold.</p>
      </div></div>`;
    custom.insertAdjacentElement("afterend", section);
  }

  function addServiceProof() {
    const services = document.querySelector(".quick-services-section");
    if (!services || document.querySelector(".hog-service-proof")) return;
    const section = document.createElement("section");
    section.className = "hog-service-proof";
    section.innerHTML = `
      <div class="container"><div class="hog-service-proof-card">
        <p class="eyebrow">More Than a Jewelry Store</p>
        <h2 style="margin:.15rem 0 0">Shop, create, repair, engrave and sell gold in one place.</h2>
        <div class="hog-service-proof-grid">
          <div class="hog-service-proof-item"><strong>Repairs</strong><span>Ring sizing, chains, clasps, watch batteries and service. Many straightforward repairs can be completed quickly; turnaround varies by job.</span></div>
          <div class="hog-service-proof-item"><strong>Laser Engraving</strong><span>Names, dates, initials, logos, coordinates and memorial text on many common jewelry and metal surfaces.</span></div>
          <div class="hog-service-proof-item"><strong>Sell Gold</strong><span>Use the online calculator for a non-binding estimate, then visit the store for testing, weighing and an actual offer.</span></div>
        </div>
      </div></div>`;
    services.insertAdjacentElement("afterend", section);
  }

  function addFAQ() {
    const visit = document.getElementById("visit");
    if (!visit || document.querySelector(".hog-faq-section")) return;
    const section = document.createElement("section");
    section.className = "hog-faq-section";
    section.innerHTML = `
      <div class="container"><div class="hog-faq-card">
        <p class="eyebrow">Frequently Asked Questions</p>
        <h2 style="margin:.15rem 0 0">Before you visit Hands of Gold.</h2>
        <div class="hog-faq-grid">
          <details><summary>Do you make custom jewelry?</summary><p>Yes. Use the Custom Jewelry Studio to send your idea. Final design, specifications, price, production time and approval are confirmed directly by Hands of Gold.</p></details>
          <details><summary>What happens after I submit a custom request?</summary><p>Hands of Gold reviews your design and contacts you to confirm specifications, pricing and next steps. Submitting a request does not finalize an order or final price.</p></details>
          <details><summary>Can I finance jewelry?</summary><p>The site links to participating third-party financing or lease-to-own providers. Applications, eligibility, approvals and terms are handled by those providers.</p></details>
          <details><summary>Do you repair jewelry and watches?</summary><p>Yes. Services include common jewelry repairs, ring sizing, chain and clasp work, watch batteries and watch service. Turnaround depends on the repair and parts required.</p></details>
          <details><summary>Can you engrave jewelry?</summary><p>Yes. We offer laser engraving for many metals and can discuss names, dates, initials, logos, coordinates and other personal text.</p></details>
          <details><summary>Can I sell gold to Hands of Gold?</summary><p>Yes. The website calculator provides a non-binding estimate. Actual purchase price is determined in store after testing and weighing.</p></details>
          <details><summary>Are all items on the website physically in stock?</summary><p>No. Product cards are labeled as In Store, Made to Order, or Ask for Availability. Call or text us to confirm the specific piece before visiting.</p></details>
          <details><summary>Do you speak Spanish?</summary><p>Yes — Hablamos Español. You can call or visit the store for help in Spanish.</p></details>
        </div>
        <div class="hog-seo-links">
          <a href="custom-jewelry.html">Custom Jewelry</a><a href="jewelry-repair.html">Jewelry Repair</a><a href="sell-gold.html">Sell Gold</a>
          <a href="engraving.html">Laser Engraving</a><a href="engagement-rings.html">Engagement Rings</a><a href="cuban-chains.html">Cuban Chains</a>
        </div>
      </div></div>`;
    visit.insertAdjacentElement("beforebegin", section);
  }

  function trackCoreActions() {
    document.addEventListener("click", e => {
      const a = e.target.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href") || "";
      if (href.includes("snapfinance.com")) ga("financing_provider_click",{provider:"snap"});
      if (href.includes("acima.com")) ga("financing_provider_click",{provider:"acima"});
      if (href.includes("approve.me")) ga("financing_provider_click",{provider:"progressive"});
      if (href.includes("google.com/maps")) ga("directions_click",{location:"store"});
      if (href.startsWith("sms:")) ga("sms_click",{location:a.className || "unlabeled"});
    });
    document.getElementById("gold-calc-button")?.addEventListener("click", () => ga("gold_calculator_completed"));
    document.querySelector("#custom-builder")?.addEventListener("click", e => {
      if (e.target.closest?.(".custom-choice")) ga("custom_studio_interaction");
    }, {once:true});
  }

  function init() {
    const products = collectProducts();
    markMerchandising(products);
    addShopTools();
    addInquiryActions(products);
    ensureModal();
    trackCoreActions();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
// ===== HOG Classic Cuban Collection integration =====
(() => {
  "use strict";
  function addClassicCubanEntryPoints(){
    if (document.querySelector('[data-hog-classic-cuban-link="1"]')) return;

    // Desktop/mobile navigation entry.
    const nav=document.querySelector(".site-nav");
    if(nav){
      const a=document.createElement("a");
      a.href="classic-cuban-collection.html";
      a.textContent="Monaci Cubans";
      a.dataset.hogClassicCubanLink="1";
      const products=nav.querySelector('a[href="#featured-products"]');
      if(products) products.insertAdjacentElement("afterend",a); else nav.prepend(a);
    }

    // Homepage merchandising block removed Aug 2026 at Julio's request.
    // Entry points to the Monaci page remain in the nav and the footer.

    // Footer discovery.
    const connect=[...document.querySelectorAll(".footer-column")].find(el=>/Connect/i.test(el.querySelector("h3")?.textContent||""));
    if(connect && !connect.querySelector('[href="classic-cuban-collection.html"]')){
      const link=document.createElement("a");link.href="classic-cuban-collection.html";link.textContent="Monaci Cuban Collection";connect.prepend(link);
    }
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",addClassicCubanEntryPoints);
  else addClassicCubanEntryPoints();
})();

// ===== HOG performance: catalog clips are click-to-play =====
// Nothing downloads until a customer asks for it. Each card shows a still frame
// with a play control; the rest of the card still dials the store, which is what
// the surrounding tel: link is for.
(() => {
  "use strict";

  function addStyles(){
    if (document.getElementById("hog-ctp-css")) return;
    const st=document.createElement("style");
    st.id="hog-ctp-css";
    st.textContent=`
      .hog-ctp-wrap{position:relative;display:block;width:100%;height:100%}
      .hog-ctp-btn{
        position:absolute;right:12px;bottom:12px;left:auto;top:auto;transform:none;
        width:48px;height:48px;border-radius:50%;border:0;cursor:pointer;
        background:rgba(17,17,17,.62);backdrop-filter:blur(3px);
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 4px 18px rgba(0,0,0,.34);z-index:3;padding:0;
        transition:background .15s ease, transform .15s ease;
      }
      .hog-ctp-btn:hover{background:rgba(185,138,55,.92);transform:scale(1.06)}
      .hog-ctp-btn:focus-visible{outline:3px solid #e2bf7f;outline-offset:3px}
      .hog-ctp-btn svg{width:20px;height:20px;fill:#fff;margin-left:3px}
      .hog-ctp-btn.is-playing{width:38px;height:38px;background:rgba(17,17,17,.45);opacity:0;pointer-events:auto}
      .hog-ctp-wrap:hover .hog-ctp-btn.is-playing{opacity:1}
      .hog-ctp-btn.is-playing svg{margin-left:0}
      @media (max-width:560px){.hog-ctp-btn{right:9px;bottom:9px;width:42px;height:42px}}
      @media (prefers-reduced-motion: reduce){.hog-ctp-btn{transition:none}}
    `;
    document.head.appendChild(st);
  }

  /* ----------------------------------------------------------------
     AUTOPLAY_IN_VIEW
     false (default) = catalog clips stay click-to-play. Nothing downloads
                       until the customer taps. Fastest page, least data.
     true            = each clip loads and plays (muted) when it scrolls
                       onto the screen, and pauses when it scrolls off.
                       Only two or three ever load at once, so the page
                       still feels alive without pulling every MP4 at once.
     Change the one word below to switch. Nothing else needs editing.
     ---------------------------------------------------------------- */
  const AUTOPLAY_IN_VIEW = false;

  const PLAY  = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  const PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

  function catalogVideos(){
    // Product clips only. The hero background video is ambience and must keep
    // playing on its own - it is deliberately excluded here.
    return [...document.querySelectorAll("video")].filter(function(v){
      return !v.closest(".hog-desktop-hero") && !v.closest(".hog-mobile-hero");
    });
  }

  function initClickToPlay(){
    addStyles();
    const vids=catalogVideos();
    if(!vids.length) return;

    vids.forEach(function(v){
      if (v.dataset.hogCtp === "1") return;
      v.dataset.hogCtp = "1";

      // belt and braces: never let a source load on its own
      v.querySelectorAll("source").forEach(function(sc){
        if (sc.getAttribute("src") && !sc.getAttribute("data-src")){
          sc.setAttribute("data-src", sc.getAttribute("src"));
          sc.removeAttribute("src");
        }
      });
      v.removeAttribute("autoplay");
      v.setAttribute("preload","none");
      v.muted=true; v.loop=true;
      v.setAttribute("playsinline","");

      const host=v.parentElement;
      if(!host) return;
      host.classList.add("hog-ctp-wrap");

      const btn=document.createElement("button");
      btn.type="button";
      btn.className="hog-ctp-btn";
      btn.innerHTML=PLAY;
      const label=(host.closest(".catalog-product-card")||{}).querySelector
        ? (host.closest(".catalog-product-card").querySelector("h3")||{}).textContent : "";
      btn.setAttribute("aria-label", "Play video" + (label ? ": "+label.trim() : ""));

      btn.addEventListener("click", function(e){
        // the card sits inside a tel: link - do not dial when the play control is used
        e.preventDefault();
        e.stopPropagation();

        if (v.dataset.hogLoaded !== "1"){
          v.dataset.hogLoaded="1";
          v.querySelectorAll("source").forEach(function(sc){
            const d=sc.getAttribute("data-src");
            if(d) sc.setAttribute("src", d);
          });
          v.load();
        }
        if (v.paused){
          const pr=v.play();
          if(pr && pr.catch) pr.catch(function(){});
          btn.classList.add("is-playing");
          btn.innerHTML=PAUSE;
          btn.setAttribute("aria-label","Pause video");
          try{window.dataLayer=window.dataLayer||[];window.dataLayer.push({event:"catalog_video_play",video:label||"unlabelled"});}catch(err){}
        } else {
          v.pause();
          btn.classList.remove("is-playing");
          btn.innerHTML=PLAY;
          btn.setAttribute("aria-label","Play video");
        }
      });

      host.appendChild(btn);
    });

    // stop anything that scrolls out of view, so nothing plays unseen
    if ("IntersectionObserver" in window){
      const io=new IntersectionObserver(function(entries){
        entries.forEach(function(e){
          const v=e.target;
          const b=v.parentElement && v.parentElement.querySelector(".hog-ctp-btn");

          if(e.isIntersecting){
            if(!AUTOPLAY_IN_VIEW) return;
            // Load this one clip on demand, then play it muted.
            if(v.dataset.hogLoaded!=="1"){
              v.dataset.hogLoaded="1";
              v.querySelectorAll("source").forEach(function(sc){
                const d=sc.getAttribute("data-src");
                if(d && !sc.getAttribute("src")) sc.setAttribute("src", d);
              });
              v.load();
            }
            if(v.paused){
              const pr=v.play();
              if(pr && pr.catch) pr.catch(function(){});
              if(b){b.classList.add("is-playing"); b.innerHTML=PAUSE; b.setAttribute("aria-label","Pause video");}
            }
            return;
          }

          if(v.dataset.hogLoaded==="1" && !v.paused){
            v.pause();
            if(b){b.classList.remove("is-playing"); b.innerHTML=PLAY; b.setAttribute("aria-label","Play video");}
          }
        });
      },{threshold:AUTOPLAY_IN_VIEW ? [0,0.25] : 0});
      vids.forEach(function(v){ io.observe(v); });
      // the hero is not observed - it is meant to keep running
    }
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", initClickToPlay);
  else initClickToPlay();
  // catalog cards can be injected after load; pick those up too
  window.addEventListener("load", initClickToPlay);
})();

/* HOG — phone and text click tracking (homepage)
   The homepage carries 123 tel: links and had no click tracking at all;
   subpage.js does this for the service pages but is not loaded on index.html.
   Calls are the primary conversion here, so they must be measurable. */
(() => {
  "use strict";
  document.addEventListener("click", function (e) {
    const a = e.target && e.target.closest ? e.target.closest("a[href^='tel:'], a[href^='sms:']") : null;
    if (!a) return;
    const href = a.getAttribute("href") || "";
    const card = a.closest(".catalog-product-card");
    const h3 = card && card.querySelector("h3");
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: href.indexOf("sms:") === 0 ? "sms_click" : "call_click",
        page: window.location.pathname,
        link_location: card ? "product_card" : (a.closest("header") ? "header" : "page"),
        product: h3 ? h3.textContent.trim() : ""
      });
    } catch (err) { /* tracking must never break a phone call */ }
  }, true);
})();


// ===== HOG Mobile Hero Video Reliability =====
(() => {
  "use strict";
  function startHeroVideo() {
    const video = document.querySelector('.future-mobile-hero video');
    if (!video) return;
    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.autoplay = true;
    video.loop = true;
    video.preload = 'auto';
    const attempt = () => {
      const play = video.play();
      if (play && typeof play.catch === 'function') play.catch(() => {});
    };
    if (video.readyState >= 2) attempt();
    else video.addEventListener('canplay', attempt, { once: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) attempt(); });
    ['touchstart','pointerdown','scroll'].forEach(evt => window.addEventListener(evt, attempt, {once:true, passive:true}));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startHeroVideo);
  else startHeroVideo();
})();
