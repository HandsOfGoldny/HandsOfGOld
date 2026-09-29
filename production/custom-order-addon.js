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
    addStyles();
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
