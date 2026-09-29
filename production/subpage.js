/* ==========================================================================
   Hands of Gold - shared service subpage lead form handler
   One file for every service page. Edit here, every page updates.

   Each page's <form> supplies its own context via data attributes:
     data-hog-form        = the service slug        (e.g. "jewelry-repair")
     data-hog-subject     = the email subject line
     data-hog-service     = human-readable service name

   Submissions use the protected server endpoint shared by all website forms.
   ========================================================================== */
(() => {
  "use strict";

  var ENDPOINT = "/api/leads";
  var STORE_PHONE = "6312646610";

  function push(evt, data) {
    try {
      window.dataLayer = window.dataLayer || [];
      var payload = { event: evt };
      for (var k in data) { if (Object.prototype.hasOwnProperty.call(data, k)) payload[k] = data[k]; }
      window.dataLayer.push(payload);
    } catch (e) { /* analytics must never break the form */ }
  }

  function setStatus(el, msg, kind) {
    if (!el) return;
    el.className = "hog-status" + (kind ? " is-" + kind : "");
    el.textContent = msg;
  }

  function initForm(form) {
    var slug    = form.getAttribute("data-hog-form") || "service";
    var subject = form.getAttribute("data-hog-subject") || "New Hands of Gold Website Lead";
    var service = form.getAttribute("data-hog-service") || "Website enquiry";

    var status  = form.querySelector(".hog-status");
    var submit  = form.querySelector(".hog-submit");
    var honey   = form.querySelector("[name='website']");
    var consent = form.querySelector("[name='contactConsent']");
    var startedAt = Date.now();
    var sent = false;

    push("service_form_view", { form_name: slug, service: service });

    var touched = false;
    form.addEventListener("input", function () {
      if (touched) return;
      touched = true;
      push("service_form_start", { form_name: slug, service: service });
    }, { once: false });

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (sent) return;

      // Honeypot: silently accept and do nothing.
      if (honey && honey.value.trim()) return;

      if (!form.reportValidity()) return;

      if (consent && !consent.checked) {
        setStatus(status, "Please accept the contact consent so we can reply to you.", "error");
        consent.focus();
        return;
      }

      // Bots typically submit instantly.
      if (Date.now() - startedAt < 1500) {
        setStatus(status, "Please take a moment to review your details, then submit again.", "error");
        startedAt = Date.now() - 1600;
        return;
      }

      var data = new FormData(form);
      var payload = {
        leadType: "service",
        website: honey ? honey.value : "",
        _subject: subject,
        _template: "table",
        service: service,
        source: "HandsOfGoldNY.com " + slug + " page",
        page: window.location.href,
        submitted_at: new Date().toLocaleString(),
        consent: "Customer agreed to be contacted by phone or email by Hands of Gold and accepted the Terms and Privacy Policy."
      };
      data.forEach(function (v, k) {
        if (k === "website" || k === "contactConsent") return;
        if (typeof v === "string" && v.trim()) payload[k] = v.trim();
      });
      try {
        var params = new URLSearchParams(window.location.search);
        payload.utm_source = params.get("utm_source") || "direct / unknown";
        payload.utm_campaign = params.get("utm_campaign") || "";
      } catch (e2) { /* URL parsing is not worth failing a lead over */ }

      if (submit) { submit.disabled = true; submit.textContent = "Sending…"; }
      setStatus(status, "Sending your request…", "");

      try {
        var res = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(payload)
        });
        var out = await res.json().catch(function () { return {}; });
        if (!res.ok || out.success !== true || !out.leadId) throw new Error(out.error || "Submission failed");

        sent = true;
        setStatus(status, "Thanks — your request reached Hands of Gold. We'll follow up by phone or email. Need us sooner? Call (631) 264-6610.", "success");
        if (submit) { submit.textContent = "Request Sent ✓"; }
        form.querySelectorAll("input, select, textarea").forEach(function (el) { el.disabled = true; });
        push("service_form_success", { form_name: slug, service: service, lead_id: out.leadId });
      } catch (err) {
        console.error("Hands of Gold service form error", err);
        setStatus(
          status,
          "We couldn't send that just now. Please call (631) 264-6610 or text us and we'll take your details directly.",
          "error"
        );
        if (submit) { submit.disabled = false; submit.textContent = submit.getAttribute("data-label") || "Send Request"; }
        push("service_form_error", { form_name: slug, service: service });
      }
    });
  }

  function initTelTracking() {
    document.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a[href^='tel:'], a[href^='sms:']") : null;
      if (!a) return;
      push(a.getAttribute("href").indexOf("sms:") === 0 ? "sms_click" : "call_click", {
        page: window.location.pathname
      });
    });
  }

  function boot() {
    document.querySelectorAll("form[data-hog-form]").forEach(initForm);
    initTelTracking();
    var y = document.getElementById("hog-year");
    if (y) y.textContent = new Date().getFullYear();
    document.querySelectorAll("[data-hog-phone]").forEach(function (el) {
      if (!el.getAttribute("href")) el.setAttribute("href", "tel:" + STORE_PHONE);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
