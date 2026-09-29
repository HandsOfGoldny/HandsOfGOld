(()=>{'use strict';
const deadline=Date.parse('2026-10-01T00:00:00-04:00');const banner=document.getElementById('giveaway-banner');
function update(){if(banner)banner.hidden=Date.now()>=deadline;}
update();const remaining=deadline-Date.now();if(remaining>0)setTimeout(update,Math.min(remaining,2147483647));document.addEventListener('visibilitychange',update);
document.querySelectorAll('[data-open-giveaway]').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();update();if(Date.now()<deadline)window.dispatchEvent(new Event('hog:open-giveaway'));}));
})();

/* ---- Gold calculator add-on: 'Text me this estimate' + tracking (added 2026-09-28; source: gold-estimate-capture.js). Safe to coexist with the GTM copy. ---- */
(function () {
  "use strict";

  var RESULT_ID = "gold-calc-result";
  var SETTLE_MS = 1500;          // wait for typing to stop before counting a calculation
  var STORE_PHONE = "(631) 264-6610";

  function push(evt, data) {
    try {
      window.dataLayer = window.dataLayer || [];
      var payload = { event: evt };
      for (var k in data) { if (Object.prototype.hasOwnProperty.call(data, k)) payload[k] = data[k]; }
      window.dataLayer.push(payload);
    } catch (e) { /* analytics must never break the page */ }
  }

  function parseMoney(text) {
    var n = Number(String(text || "").replace(/[^0-9.]/g, ""));
    return isFinite(n) ? n : 0;
  }

  function readInputs() {
    var karat = document.getElementById("gold-karat");
    var weight = document.getElementById("gold-weight");
    var unit = document.getElementById("gold-weight-unit");
    return {
      karat: karat ? karat.value : "",
      karatLabel: karat && karat.selectedOptions && karat.selectedOptions[0] ? karat.selectedOptions[0].textContent.trim() : "",
      weight: weight ? weight.value : "",
      unit: unit ? unit.value : ""
    };
  }

  function injectStyles() {
    if (document.getElementById("hog-gec-styles")) return;
    var css =
      ".hog-gec{margin-top:12px;font-family:inherit;color:#F6F3EC}" +
      ".hog-gec-toggle{background:none;border:0;padding:0;color:#D6AD5C;font:inherit;font-size:.95rem;font-weight:600;text-decoration:underline;text-underline-offset:3px;cursor:pointer}" +
      ".hog-gec-toggle:hover,.hog-gec-toggle:focus-visible{color:#C79638}" +
      ".hog-gec-panel{margin-top:10px;padding:14px;border:1px solid rgba(255,255,255,.14);border-radius:9px;background:#061A3A}" +
      ".hog-gec-panel[hidden]{display:none}" +
      ".hog-gec-note{margin:0 0 10px;font-size:.88rem;line-height:1.45;color:rgba(246,243,236,.85)}" +
      ".hog-gec-row{display:flex;flex-wrap:wrap;gap:8px}" +
      ".hog-gec-row input[type=text],.hog-gec-row input[type=tel]{flex:1 1 180px;min-width:0;padding:10px 12px;border-radius:12px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;font:inherit;font-size:1rem}" +
      ".hog-gec-consent{display:flex;gap:8px;align-items:flex-start;margin:10px 0;font-size:.82rem;line-height:1.4;color:rgba(246,243,236,.85)}" +
      ".hog-gec-consent a{color:#D6AD5C}" +
      /* override site-wide label/checkbox styles that otherwise inflate the checkbox */
      ".hog-gec .hog-gec-consent{display:flex!important;flex-direction:row!important;gap:10px;align-items:flex-start;text-align:left;grid-template-columns:none!important}" +
      ".hog-gec .hog-gec-consent input[type=checkbox]{width:18px!important;height:18px!important;min-width:18px;flex:0 0 18px;margin:2px 0 0!important;padding:0!important;accent-color:#C79638}" +
      ".hog-gec .hog-gec-consent span{flex:1 1 auto;font-weight:400!important;font-size:.82rem}" +
      ".hog-gec-submit{padding:10px 16px;border-radius:12px;border:1px solid #C79638;background:#C79638;color:#080B12;font:inherit;font-weight:700;cursor:pointer}" +
      ".hog-gec-submit[disabled]{opacity:.6;cursor:default}" +
      ".hog-gec-status{margin:8px 0 0;font-size:.9rem;min-height:1.2em}" +
      ".hog-gec-status.is-success{color:#D6AD5C}" +
      ".hog-gec-status.is-error{color:#fca5a5}" +
      ".hog-gec-hp{position:absolute!important;left:-9999px!important;width:1px;height:1px;overflow:hidden}";
    var style = document.createElement("style");
    style.id = "hog-gec-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function buildUI(resultBox) {
    var wrap = document.createElement("div");
    wrap.className = "hog-gec";
    wrap.hidden = true; // only appears once there is a real estimate
    wrap.innerHTML =
      '<button type="button" class="hog-gec-toggle" aria-expanded="false" aria-controls="hog-gec-panel">Text me this estimate</button>' +
      '<form class="hog-gec-panel" id="hog-gec-panel" hidden novalidate>' +
        '<p class="hog-gec-note">We\'ll text you this estimate and our hours. This is a non-binding estimate, not a held price. Offers are based on the live gold spot price at the moment you come in and change with the market. Your actual offer is made in store after testing and weighing.</p>' +
        '<div class="hog-gec-row">' +
          '<input type="text" name="name" autocomplete="given-name" placeholder="First name" aria-label="First name" required>' +
          '<input type="tel" name="phone" autocomplete="tel" inputmode="tel" placeholder="Mobile number" aria-label="Mobile number" required>' +
        '</div>' +
        '<div class="hog-gec-hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>' +
        '<label class="hog-gec-consent"><input type="checkbox" name="contactConsent" required> ' +
          '<span>I agree to be contacted by Hands of Gold by text or phone about this estimate and accept the <a href="/terms.html" target="_blank" rel="noopener">Terms</a> and <a href="/privacy.html" target="_blank" rel="noopener">Privacy Policy</a>. Msg &amp; data rates may apply.</span>' +
        '</label>' +
        '<button type="submit" class="hog-gec-submit">Text it to me</button>' +
        '<p class="hog-gec-status" role="status" aria-live="polite"></p>' +
      '</form>';
    resultBox.insertAdjacentElement("afterend", wrap);
    return wrap;
  }

  function init() {
    var result = document.getElementById(RESULT_ID);
    if (!result) return;
    if (window.__hogGecLoaded) return; // never load twice (e.g. site file + Tag Manager)
    window.__hogGecLoaded = true;
    var resultBox = result.closest(".gold-calculator-result") || result.parentElement;
    if (!resultBox) return;

    injectStyles();
    var ui = buildUI(resultBox);
    var toggle = ui.querySelector(".hog-gec-toggle");
    var form = ui.querySelector("form");
    var status = ui.querySelector(".hog-gec-status");
    var submit = ui.querySelector(".hog-gec-submit");

    var lastCounted = "";
    var settleTimer = null;
    var current = { estimate: 0, text: "" };
    var sent = false;

    function onResultChange() {
      var text = (result.textContent || "").trim();
      var amount = parseMoney(text);
      var isReal = /\$/.test(text) && amount > 0;
      current = { estimate: amount, text: text };
      ui.hidden = !isReal && !sent;

      clearTimeout(settleTimer);
      if (!isReal) return;
      settleTimer = setTimeout(function () {
        var inp = readInputs();
        var key = inp.karat + "|" + inp.weight + "|" + inp.unit + "|" + amount;
        if (key === lastCounted) return;
        lastCounted = key;
        push("gold_estimate_calculated", {
          gold_karat: inp.karatLabel || inp.karat,
          gold_weight: inp.weight,
          gold_unit: inp.unit,
          estimate_value: Math.round(amount)
        });
      }, SETTLE_MS);
    }

    new MutationObserver(onResultChange).observe(result, { childList: true, characterData: true, subtree: true });

    toggle.addEventListener("click", function () {
      var open = form.hidden;
      form.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      if (open) {
        push("gold_estimate_text_open", { estimate_value: Math.round(current.estimate) });
        var first = form.querySelector("input[name=name]");
        if (first) first.focus();
      }
    });

    function setStatus(msg, kind) {
      status.className = "hog-gec-status" + (kind ? " is-" + kind : "");
      status.textContent = msg;
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (sent) return;
      var name = form.elements.name.value.trim();
      var phone = form.elements.phone.value.trim();
      var digits = phone.replace(/\D/g, "");
      if (!name) { setStatus("Please add your first name.", "error"); return; }
      if (digits.length < 10) { setStatus("Please enter a 10-digit mobile number.", "error"); return; }
      if (!form.elements.contactConsent.checked) { setStatus("Please check the box so we can text you.", "error"); return; }
      if (!(current.estimate > 0)) { setStatus("Run the calculator first, then we can text you the number.", "error"); return; }

      var inp = readInputs();
      var utmSource = "direct / unknown", utmCampaign = "";
      try {
        var q = new URLSearchParams(window.location.search);
        utmSource = q.get("utm_source") || utmSource;
        utmCampaign = q.get("utm_campaign") || "";
      } catch (e1) {}
      var payload = {
        leadType: "service",
        website: form.elements.website.value,
        _subject: "Gold estimate text request - " + current.text,
        _template: "table",
        service: "Sell Gold - text me my calculator estimate",
        name: name,
        phone: phone,
        message: "Please text this customer their gold calculator estimate: " + current.text +
                 " for " + inp.weight + " " + inp.unit + " of " + (inp.karatLabel || inp.karat) +
                 " (calculated " + new Date().toLocaleString() + "). Estimate only - not a held price; final offer is based on spot price at time of sale, after testing and weighing.",
        estimate: current.text,
        gold_karat: inp.karatLabel || inp.karat,
        gold_weight: inp.weight + " " + inp.unit,
        source: "HandsOfGoldNY.com gold calculator (text me this estimate)",
        page: window.location.href,
        referrer: document.referrer || "",
        utm_source: utmSource,
        utm_campaign: utmCampaign,
        submitted_at: new Date().toLocaleString(),
        consent: "Customer agreed to be contacted by text or phone by Hands of Gold about this estimate and accepted the Terms and Privacy Policy."
      };

      submit.disabled = true;
      submit.textContent = "Sending\u2026";
      setStatus("", "");
      fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload)
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (out) {
          if (!res.ok || out.success !== true || !out.leadId) throw new Error(out.error || "failed");
          return out;
        });
      }).then(function (out) {
        sent = true;
        setStatus("Got it, " + name + " - we'll text you shortly. Final offers are based on the spot price when you come in.", "success");
        submit.textContent = "Sent \u2713";
        Array.prototype.forEach.call(form.elements, function (el) { el.disabled = true; });
        push("gold_estimate_text_request", { estimate_value: Math.round(current.estimate), lead_id: out.leadId });
      }).catch(function () {
        submit.disabled = false;
        submit.textContent = "Text it to me";
        setStatus("That didn't go through. Please try again, or call us at " + STORE_PHONE + ".", "error");
      });
    });

    onResultChange();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
