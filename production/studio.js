/* ==========================================================================
   Hands of Gold — AI Jewelry Concept Studio (frontend)

   Upgrades the EXISTING Custom Jewelry Studio in place. It does not rebuild
   the builder, rename any selector, or remove any current control.

   Safety properties:
   - If /api/design reports that generation is unavailable (no OPENAI_API_KEY
     on the deployment), this file adds nothing to the page at all and the
     studio behaves exactly as it does today. Nothing visibly breaks.
   - No API key, provider name or endpoint secret exists in this file.
   - Customer name, email and phone are never sent to the image generator.
     They only travel with the lead, to /api/leads, on deliberate submit.

   Load AFTER script.js.
   ========================================================================== */
(function () {
  'use strict';

  var API = '/api/design';
  var LEADS = '/api/leads';
  var PHONE = '(631) 264-6610';

  var state = {
    busy: false,
    concept: null,      // { id, image, imageUrl, summary }
    history: [],        // session-only, in memory
    remaining: null,
    spinTimer: null
  };

  /* ------------------------------------------------------------- helpers */

  function $(id) { return document.getElementById(id); }

  function selectedValue(group) {
    var el = document.querySelector('[data-choice-group="' + group + '"] .custom-choice.is-selected');
    return el ? (el.dataset.value || '') : '';
  }

  function currentSpec() {
    var size = $('custom-size');
    var notes = $('custom-notes');
    var budget = $('custom-budget');
    return {
      piece: selectedValue('piece'),
      metal: selectedValue('metal'),
      stones: selectedValue('stones'),
      budget: budget ? budget.value : '',
      size: size ? size.value.trim() : '',
      notes: notes ? notes.value.trim() : ''
    };
  }

  function track(event, extra) {
    try {
      window.dataLayer = window.dataLayer || [];
      var payload = { event: event };
      if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) payload[k] = extra[k];
      window.dataLayer.push(payload);
    } catch (_) { /* analytics must never break the studio */ }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------------------------------------------------- the panel */

  var PLACEHOLDER_SVG =
    '<svg viewBox="0 0 64 64" fill="none" stroke="#C79638" stroke-width="1.2" ' +
    'stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M20 8h24l12 14-24 34L8 22z"/>' +
    '<path d="M8 22h48"/><path d="M20 8l-6 14 18 34"/><path d="M44 8l6 14-18 34"/>' +
    '<path d="M26 22h12"/></svg>';

  function panelMarkup() {
    return '' +
      '<div class="hog-studio-inner">' +
        '<div class="hog-studio-head">' +
          '<p class="hog-studio-eyebrow">Your AI Concept</p>' +
          '<p class="hog-studio-remaining" id="hog-studio-remaining"></p>' +
        '</div>' +

        '<div class="hog-studio-stage" id="hog-studio-stage">' +
          '<div class="hog-studio-placeholder" id="hog-studio-placeholder">' +
            PLACEHOLDER_SVG +
            '<strong>Your design will appear here</strong>' +
            '<span>Choose your options and describe your idea, then generate an AI concept.</span>' +
          '</div>' +
        '</div>' +

        '<button class="hog-studio-btn hog-studio-btn-gold hog-studio-generate" ' +
          'id="hog-studio-generate" type="button">Generate My Design</button>' +

        '<p class="hog-studio-status" id="hog-studio-status" role="status" aria-live="polite"></p>' +

        '<div class="hog-studio-result" id="hog-studio-result" hidden>' +
          '<div class="hog-studio-caption">' +
            '<strong>AI Concept Preview</strong>' +
            '<span class="hog-studio-id" id="hog-studio-id"></span>' +
          '</div>' +
          '<p class="hog-studio-summary" id="hog-studio-summary"></p>' +
          '<p class="hog-studio-disclaimer">Concept image for visualization only. Final dimensions, ' +
            'stone counts, weights, construction, pricing and CAD may change after review by Hands of Gold.</p>' +

          '<div class="hog-studio-actions">' +
            '<button class="hog-studio-btn hog-studio-btn-gold" id="hog-studio-send" type="button">' +
              'Send This Design to Hands of Gold</button>' +
            '<div class="hog-studio-actions-row">' +
              '<button class="hog-studio-btn" id="hog-studio-changes" type="button">Make Changes</button>' +
              '<button class="hog-studio-btn" id="hog-studio-another" type="button">Create Another Concept</button>' +
            '</div>' +
            '<a class="hog-studio-btn" href="tel:6312646610" id="hog-studio-call">Call to Start</a>' +
          '</div>' +

          '<div class="hog-studio-revise">' +
            '<label for="hog-studio-revision">What would you change?</label>' +
            '<textarea id="hog-studio-revision" rows="2" maxlength="400" ' +
              'placeholder="Make the bail larger · Add more diamonds · Make the ring wider · Use emeralds instead"></textarea>' +
            '<button class="hog-studio-btn" id="hog-studio-update" type="button">Update My Design</button>' +
          '</div>' +
        '</div>' +

        '<div class="hog-studio-history" id="hog-studio-history" hidden>' +
          '<strong>Your concepts</strong>' +
          '<div class="hog-studio-thumbs" id="hog-studio-thumbs"></div>' +
        '</div>' +
      '</div>';
  }

  /* ------------------------------------------------------ stage rendering */

  var LOADING_LINES = [
    'Building your metal and stone combination…',
    'Refining your custom jewelry concept…',
    'Preparing your preview…'
  ];

  function showPlaceholder() {
    var stage = $('hog-studio-stage');
    if (!stage) return;
    stage.innerHTML =
      '<div class="hog-studio-placeholder">' + PLACEHOLDER_SVG +
      '<strong>Your design will appear here</strong>' +
      '<span>Choose your options and describe your idea, then generate an AI concept.</span></div>';
  }

  function showLoading() {
    var stage = $('hog-studio-stage');
    if (!stage) return;
    stage.innerHTML =
      '<div class="hog-studio-loading">' +
        '<div class="hog-studio-spinner"></div>' +
        '<strong>Creating your Hands of Gold concept…</strong>' +
        '<span id="hog-studio-loadline">' + esc(LOADING_LINES[0]) + '</span>' +
      '</div>';
    var i = 0;
    clearInterval(state.spinTimer);
    state.spinTimer = setInterval(function () {
      i = (i + 1) % LOADING_LINES.length;
      var line = $('hog-studio-loadline');
      if (line) line.textContent = LOADING_LINES[i];
    }, 2600);
  }

  function stopLoading() {
    clearInterval(state.spinTimer);
    state.spinTimer = null;
  }

  function showImage(src, alt) {
    var stage = $('hog-studio-stage');
    if (!stage) return;
    stage.innerHTML = '<img src="' + esc(src) + '" alt="' + esc(alt) + '" loading="eager" decoding="async">';
  }

  /* The preview panel is never left blank on failure. */
  function showError(message) {
    var stage = $('hog-studio-stage');
    if (!stage) return;
    stage.innerHTML =
      '<div class="hog-studio-error">' +
        '<strong>' + esc(message || "We couldn't create your preview this time.") + '</strong>' +
        '<div class="hog-studio-error-actions">' +
          '<button class="hog-studio-btn hog-studio-btn-gold" id="hog-studio-retry" type="button">Try Again</button>' +
          '<a class="hog-studio-btn" href="tel:6312646610">Call Hands of Gold</a>' +
        '</div>' +
      '</div>';
    var retry = $('hog-studio-retry');
    if (retry) retry.addEventListener('click', function () { generate('create'); });
  }

  function setStatus(text, kind) {
    var el = $('hog-studio-status');
    if (!el) return;
    el.className = 'hog-studio-status' + (kind ? ' is-' + kind : '');
    el.textContent = text || '';
  }

  function setRemaining(n) {
    if (typeof n !== 'number') return;
    state.remaining = n;
    var el = $('hog-studio-remaining');
    if (!el) return;
    el.textContent = n > 0 ? (n + (n === 1 ? ' concept left' : ' concepts left')) : 'No concepts left';
  }

  /* ------------------------------------------------------------- history */

  function renderHistory() {
    var wrap = $('hog-studio-history');
    var thumbs = $('hog-studio-thumbs');
    if (!wrap || !thumbs) return;
    if (state.history.length < 2) { wrap.hidden = true; return; }
    wrap.hidden = false;
    thumbs.innerHTML = '';
    state.history.forEach(function (concept, index) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hog-studio-thumb';
      btn.title = 'Version ' + (index + 1) + ' — ' + concept.id;
      btn.setAttribute('aria-label', 'Use version ' + (index + 1) + ', concept ' + concept.id);
      btn.setAttribute('aria-current', state.concept && state.concept.id === concept.id ? 'true' : 'false');
      btn.innerHTML = '<img src="' + esc(concept.image) + '" alt="Concept version ' + (index + 1) + '">';
      btn.addEventListener('click', function () { selectConcept(concept); });
      thumbs.appendChild(btn);
    });
  }

  function selectConcept(concept) {
    state.concept = concept;
    showImage(concept.image, 'AI concept of your custom ' + (concept.piece || 'jewelry') + ' design');
    var idEl = $('hog-studio-id'), sumEl = $('hog-studio-summary'), result = $('hog-studio-result');
    if (idEl) idEl.textContent = 'Concept ID: ' + concept.id;
    if (sumEl) sumEl.textContent = concept.summary;
    if (result) result.hidden = false;
    renderHistory();
    reflectConceptOnLeadForm();
  }

  /* ------------------------------------------------------------ generate */

  function generate(mode) {
    if (state.busy) return;                       // no duplicate / double-click requests
    var spec = currentSpec();
    var revisionEl = $('hog-studio-revision');
    var revision = mode === 'revise' && revisionEl ? revisionEl.value.trim() : '';

    if (mode === 'revise' && !revision) {
      setStatus('Tell us what you would change first.', 'error');
      if (revisionEl) revisionEl.focus();
      return;
    }
    if (!spec.notes && !spec.size) {
      setStatus('Describe your idea first so the concept matches what you want.', 'error');
      var notes = $('custom-notes');
      if (notes) { notes.focus(); notes.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      return;
    }

    state.busy = true;
    var generateBtn = $('hog-studio-generate');
    var updateBtn = $('hog-studio-update');
    var anotherBtn = $('hog-studio-another');
    [generateBtn, updateBtn, anotherBtn].forEach(function (b) { if (b) b.disabled = true; });
    if (generateBtn) generateBtn.textContent = 'Creating…';

    setStatus('');
    showLoading();
    track(mode === 'revise' ? 'custom_design_revision'
        : mode === 'alternate' ? 'custom_design_alternate'
        : 'custom_design_generated_attempt', { piece: spec.piece, budget: spec.budget });

    var body = {
      piece: spec.piece, metal: spec.metal, stones: spec.stones,
      budget: spec.budget, size: spec.size, notes: spec.notes,
      revision: revision, mode: mode,
      referenceConceptId: mode === 'revise' && state.concept ? state.concept.id : ''
    };

    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (response) {
        return response.json().catch(function () { return {}; })
          .then(function (data) { return { ok: response.ok, data: data }; });
      })
      .then(function (out) {
        stopLoading();
        if (!out.ok || !out.data || !out.data.ok) {
          var message = (out.data && out.data.error) || "We couldn't create your preview this time.";
          showError(message);
          track('custom_design_generation_failed', { piece: spec.piece });
          if (out.data && typeof out.data.remaining === 'number') setRemaining(out.data.remaining);
          return;
        }
        var concept = {
          id: out.data.conceptId,
          image: out.data.image,
          imageUrl: out.data.imageUrl || '',
          summary: out.data.summary,
          piece: spec.piece,
          revision: revision
        };
        state.history.push(concept);
        selectConcept(concept);
        setRemaining(out.data.remaining);
        setStatus('');
        if (revisionEl) revisionEl.value = '';
        track('custom_design_generated', {
          piece: spec.piece, budget: spec.budget, concept_id: concept.id, mode: mode
        });
      })
      .catch(function (error) {
        stopLoading();
        console.error('[hog-studio]', error);
        showError("We couldn't reach the design studio. Please try again, or call " + PHONE + '.');
        track('custom_design_generation_failed', { piece: spec.piece });
      })
      .then(function () {
        state.busy = false;
        [generateBtn, updateBtn, anotherBtn].forEach(function (b) { if (b) b.disabled = false; });
        if (generateBtn) generateBtn.textContent = state.concept ? 'Generate My Design' : 'Generate My Design';
      });
  }

  /* -------------------------------------------- lead form + concept glue */

  /* Retitle the existing submit button once a concept exists, and make sure
     the concept travels with the lead. The submit button and its id are left in place. */
  function reflectConceptOnLeadForm() {
    var submit = $('submit-custom-order');
    if (submit && state.concept && submit.textContent.indexOf('Sent') === -1) {
      submit.textContent = 'Send My Design to Hands of Gold';
    }
  }

  function sendConceptToStore() {
    var panel = document.querySelector('.custom-order-contact');
    if (!panel) { window.location.href = 'tel:6312646610'; return; }
    track('custom_design_send_clicked', {
      concept_id: state.concept ? state.concept.id : ''
    });
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var name = $('custom-order-name');
    if (name) setTimeout(function () { name.focus({ preventScroll: true }); }, 420);
  }

  /* Replaces the inline submit handler that posts straight to formsubmit.co
     with one that posts to /api/leads — the site's own lead pipeline, which
     returns a lead id and stores the lead. Same fields, plus the concept. */
  function rebindLeadSubmit() {
    var original = $('submit-custom-order');
    if (!original || original.dataset.hogStudioBound === '1') return;

    var submit = original.cloneNode(true);
    submit.dataset.hogStudioBound = '1';
    original.parentNode.replaceChild(submit, original);

    submit.addEventListener('click', function (event) {
      event.preventDefault();
      var name = $('custom-order-name'), email = $('custom-order-email'),
          phone = $('custom-order-phone'), consent = $('custom-order-consent'),
          status = $('custom-order-status');

      var invalid = [name, email, phone].filter(Boolean).find(function (el) { return !el.checkValidity(); });
      if (invalid) { invalid.reportValidity(); invalid.focus(); return; }
      if (consent && !consent.checked) {
        if (status) {
          status.className = 'custom-order-status is-error';
          status.textContent = 'Please accept the contact consent before sending your design.';
        }
        consent.focus();
        return;
      }

      var spec = currentSpec();
      var summaryEl = $('custom-summary');
      var payload = {
        leadType: 'custom_jewelry',
        name: name ? name.value.trim() : '',
        email: email ? email.value.trim() : '',
        phone: phone ? phone.value.trim() : '',
        piece: spec.piece,
        metal: spec.metal,
        stones: spec.stones,
        budget: spec.budget,
        size_dimensions: spec.size || 'Not provided',
        design_notes: spec.notes || 'Not provided',
        request_summary: summaryEl ? summaryEl.textContent.trim() : '',
        source: 'HandsOfGoldNY.com Custom Jewelry Studio',
        page: window.location.href,
        submitted_at: new Date().toISOString(),
        consent: 'Customer accepted Terms/Privacy and consented to contact about this custom jewelry request.'
      };

      if (state.concept) {
        payload.concept_id = state.concept.id;
        payload.concept_image_url = state.concept.imageUrl
          ? (window.location.origin + state.concept.imageUrl)
          : 'Not stored — ask the customer for Concept ID ' + state.concept.id;
        if (state.concept.revision) payload.revision_notes = state.concept.revision;
      }

      submit.disabled = true;
      submit.textContent = 'Sending…';
      if (status) { status.className = 'custom-order-status'; status.textContent = 'Sending your design to Hands of Gold…'; }

      fetch(LEADS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (response) {
          return response.json().catch(function () { return {}; })
            .then(function (data) { if (!response.ok || data.success !== true || !data.leadId) throw new Error(data.error || 'Submission failed'); return data; });
        })
        .then(function (data) {
          if (status) {
            status.className = 'custom-order-status is-success';
            status.textContent = 'Design sent ✓ Hands of Gold has your request'
              + (state.concept ? ' and your concept ' + state.concept.id : '')
              + '. Reference ' + data.leadId + '. We will follow up by phone or email.';
          }
          submit.textContent = 'Design Sent ✓';
          track('custom_design_lead_submitted', {
            piece: spec.piece, budget: spec.budget, lead_id: data.leadId,
            concept_id: state.concept ? state.concept.id : ''
          });
        })
        .catch(function (error) {
          console.error('[hog-studio-lead]', error);
          if (status) {
            status.className = 'custom-order-status is-error';
            status.textContent = "We couldn't deliver the design. Please try again or call " + PHONE + '.';
          }
          submit.disabled = false;
          submit.textContent = state.concept ? 'Send My Design to Hands of Gold' : 'Submit Custom Order Request';
        });
    });

  }

  /* ------------------------------------------------------------- privacy */

  /* The existing note says selections stay on the device. That stops being
     accurate the moment Generate My Design sends them off for rendering, so
     the studio's own disclosure is corrected here. The site-wide privacy
     policy page is not touched. */
  function updatePrivacyNotice() {
    var note = document.querySelector('#custom-builder .custom-builder-consent');
    if (!note || note.dataset.hogStudioPrivacy === '1') return;
    note.dataset.hogStudioPrivacy = '1';
    note.innerHTML =
      '<span><strong>Privacy note:</strong> When you choose <strong>Generate My Design</strong>, ' +
      'your jewelry selections and design description are sent to our service providers so the concept ' +
      'image can be created. Your name, email and phone number are <strong>not</strong> sent to the image ' +
      'generator. We receive your contact details only when you choose <strong>Send My Design to Hands of ' +
      'Gold</strong>. Custom pricing, availability, specifications and production are confirmed only after ' +
      'review. Please do not enter payment card numbers, government ID numbers or other sensitive ' +
      'information in the notes. <a href="privacy.html">Privacy Policy</a> · <a href="terms.html">Terms</a>' +
      '<br><small><strong>Nota de privacidad:</strong> Al generar un concepto, sus selecciones y su ' +
      'descripción se envían a nuestros proveedores para crear la imagen. Su nombre, correo y teléfono no ' +
      'se envían al generador de imágenes. Recibimos sus datos de contacto solo cuando usted decide ' +
      'enviarnos el diseño.</small></span>';
  }

  /* ---------------------------------------------------------------- init */

  function mountPanel() {
    var builder = $('custom-builder');
    if (!builder || builder.dataset.hogStudioMounted === '1') return false;

    var panel = document.createElement('section');
    panel.id = 'hog-studio';
    panel.setAttribute('aria-label', 'AI jewelry concept preview');
    panel.innerHTML = panelMarkup();

    /* Desktop: script.js reorganises the builder into .hog-custom-left /
       .hog-custom-right, so sit in the right column and the two-column layout
       is preserved. Mobile: those wrappers still exist but are display:contents,
       and appending there would push the preview below the contact form. Put it
       directly under the description field instead - controls first, concept
       immediately underneath. */
    var desktop = window.matchMedia('(min-width:761px)').matches;
    var left = builder.querySelector('.hog-custom-left');
    var right = builder.querySelector('.hog-custom-right');
    var fields = builder.querySelector('.custom-builder-fields');
    var summary = builder.querySelector('.custom-builder-summary');

    if (desktop && right && left) {
      /* Rebalance the two columns into a proper configurator.

         script.js puts the contact form, privacy note and summary in the right
         column, which left it 1695px tall against a 935px left column - a
         760px dead gap - and buried the concept panel underneath all of it.

         Controls belong together on the left (the contact form is step 4, and
         its own stylesheet already lays it out in 3 columns when it is not
         squeezed into the narrow right column). The right column then carries
         only the concept and the summary, and stays pinned while the customer
         works down the options. Nothing is renamed or removed - the same
         nodes, with the same ids and listeners, are re-parented. */
      right.insertBefore(panel, right.firstChild);

      var contact = builder.querySelector('.custom-order-contact');
      var consent = builder.querySelector('.custom-builder-consent');
      if (contact) left.appendChild(contact);
      if (consent) left.appendChild(consent);

      builder.classList.add('hog-studio-active');
    } else if (fields) {
      fields.after(panel);
    } else if (summary) {
      summary.after(panel);
    } else {
      builder.appendChild(panel);
    }

    /* Fold the existing "Your Custom Request" box into the concept panel so
       there is one card, not two. The node is moved, not rebuilt: #custom-summary
       keeps updating live from script.js, and Copy Design Details / Call to Start
       keep their original ids and listeners. */
    var inner = panel.querySelector('.hog-studio-inner');
    /* Sits under the image and the Generate button, not above them - the
       concept is the thing the customer came to see, so it leads. */
    var anchor = panel.querySelector('.hog-studio-status');
    if (summary && inner && anchor) {
      anchor.insertAdjacentElement('afterend', summary);
      summary.classList.add('hog-studio-request');
      builder.classList.add('hog-studio-merged');
    }

    /* Keep the original controls and their listeners inside one studio. */
    var workspace = document.createElement('div');
    workspace.className = 'hog-studio-workspace';
    var tools = document.createElement('div');
    tools.className = 'hog-studio-tools';
    tools.setAttribute('aria-label', 'Design options');
    var preview = document.createElement('div');
    preview.className = 'hog-studio-preview';
    Array.from(inner.children).forEach(function (node) { preview.appendChild(node); });
    builder.querySelectorAll('.custom-builder-step').forEach(function (node) { tools.appendChild(node); });
    workspace.appendChild(tools);
    workspace.appendChild(preview);
    inner.appendChild(workspace);
    builder.insertBefore(panel, builder.firstChild);
    builder.classList.add('hog-studio-unified');
    panel.querySelector('.hog-studio-eyebrow').textContent = 'Your Design Studio';
    builder.dataset.hogStudioMounted = '1';

    $('hog-studio-generate').addEventListener('click', function () { generate('create'); });
    $('hog-studio-update').addEventListener('click', function () { generate('revise'); });
    $('hog-studio-another').addEventListener('click', function () { generate('alternate'); });
    $('hog-studio-send').addEventListener('click', sendConceptToStore);
    $('hog-studio-changes').addEventListener('click', function () {
      var notes = $('custom-notes');
      if (notes) { notes.scrollIntoView({ behavior: 'smooth', block: 'center' }); notes.focus({ preventScroll: true }); }
    });

    var started = false;
    builder.addEventListener('click', function () {
      if (started) return;
      started = true;
      track('custom_studio_started', {});
    }, { once: false });

    return true;
  }

  function start() {
    if (!$('custom-builder')) return;

    /* Ask the deployment whether generation is switched on. If it is not,
       nothing is added to the page and the studio stays exactly as it is. */
    fetch(API + '?probe=1', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (info) {
        if (!info || !info.available) return;
        if (!mountPanel()) return;
        updatePrivacyNotice();
        rebindLeadSubmit();
        if (typeof info.perVisitor === 'number') setRemaining(info.perVisitor);
      })
      .catch(function () { /* endpoint missing or offline — leave the studio untouched */ });
  }

  /* script.js injects the contact panel and the desktop two-column layout on
     DOMContentLoaded. Run after it so both are already in place. */
  function boot() {
    setTimeout(start, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
