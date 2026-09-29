(function () {
  'use strict';

  if (document.getElementById('hog-ai-chat-root')) return;

  var history = [];
  var busy = false;

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function linkify(text) {
    var safe = escapeHtml(text);
    return safe.replace(/(https:\/\/[^\s<]+)/g, function (url) {
      var clean = url.replace(/[.,;:!?)]$/, '');
      var tail = url.slice(clean.length);
      return '<a href="' + clean + '" target="_blank" rel="noopener noreferrer">' + clean + '</a>' + tail;
    });
  }

  function pageContext() {
    function t(id) {
      var el = document.getElementById(id);
      return el ? (el.textContent || '').trim() : '';
    }
    return {
      pageTitle: document.title || '',
      path: location.pathname || '/',
      productTitle: t('cc-product-title') || document.body.getAttribute('data-product-title') || '',
      sku: t('cc-sku') || document.body.getAttribute('data-product-slug') || '',
      width: t('cc-width'),
      length: t('cc-length-result'),
      karat: t('cc-karat'),
      weight: t('cc-weight'),
      displayedPrice: t('cc-retail-price')
    };
  }

  var root = document.createElement('div');
  root.id = 'hog-ai-chat-root';
  root.innerHTML =
    '<section class="hog-ai-panel" id="hog-ai-panel" aria-label="Hands of Gold AI assistant">' +
      '<header class="hog-ai-header">' +
        '<div><p class="hog-ai-title">Hands of Gold Assistant</p><p class="hog-ai-status">AI assistant · English / Español</p></div>' +
        '<button class="hog-ai-close" id="hog-ai-close" type="button" aria-label="Close chat">&times;</button>' +
      '</header>' +
      '<div class="hog-ai-messages" id="hog-ai-messages" role="log" aria-live="polite" aria-relevant="additions"></div>' +
      '<div class="hog-ai-quick-row" aria-label="Quick questions">' +
        '<button class="hog-ai-quick" type="button" data-prompt="What are your store hours?">Store hours</button>' +
        '<button class="hog-ai-quick" type="button" data-prompt="Tell me about custom jewelry.">Custom jewelry</button>' +
        '<button class="hog-ai-quick" type="button" data-prompt="What financing options do you offer?">Financing</button>' +
        '<button class="hog-ai-quick" type="button" data-prompt="How do I purchase a Monaci Cuban piece?">Shop Monaci</button>' +
      '</div>' +
      '<div>' +
        '<form class="hog-ai-form" id="hog-ai-form">' +
          '<input class="hog-ai-input" id="hog-ai-input" maxlength="700" autocomplete="off" placeholder="Ask about jewelry, repairs, Monaci..." aria-label="Message Hands of Gold AI assistant" />' +
          '<button class="hog-ai-send" id="hog-ai-send" type="submit">Send</button>' +
        '</form>' +
        '<p class="hog-ai-safety">AI can make mistakes. Do not send card, bank, SSN, password, or other sensitive information.</p>' +
      '</div>' +
    '</section>' +
    '<button class="hog-ai-launcher" id="hog-ai-launcher" type="button" aria-controls="hog-ai-panel" aria-expanded="false">' +
      '<span class="hog-ai-launcher-icon" aria-hidden="true">✦</span>' +
      '<span class="hog-ai-launcher-label">Chat with Hands of Gold</span>' +
    '</button>';

  document.body.appendChild(root);

  var panel = document.getElementById('hog-ai-panel');
  var launcher = document.getElementById('hog-ai-launcher');
  var closeButton = document.getElementById('hog-ai-close');
  var messagesEl = document.getElementById('hog-ai-messages');
  var form = document.getElementById('hog-ai-form');
  var input = document.getElementById('hog-ai-input');
  var send = document.getElementById('hog-ai-send');

  function addMessage(role, text, extraClass) {
    var item = document.createElement('div');
    item.className = 'hog-ai-message hog-ai-message--' + role + (extraClass ? ' ' + extraClass : '');
    item.innerHTML = linkify(text);
    messagesEl.appendChild(item);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return item;
  }

  function setOpen(open) {
    panel.classList.toggle('is-open', open);
    launcher.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) setTimeout(function () { input.focus(); }, 50);
  }

  function localAnswer(prompt) {
    var p = prompt.toLowerCase();
    if (/hours|open|close|horario|hora/.test(p)) {
      return 'We are open Monday-Saturday 10 AM-7 PM and Sunday 1 PM-5 PM. Hands of Gold is at 494 Oak St, Copiague, NY 11726.';
    }
    if (/address|location|where are|direccion|dirección|ubicacion|ubicación/.test(p)) {
      return 'Hands of Gold Jewelry and Repairs is at 494 Oak St, Copiague, NY 11726. You can call us at (631) 264-6610.';
    }
    if (/monaci|cuban/.test(p)) {
      return 'Browse the Monaci catalog, then call or text (631) 264-6610 with your selected piece or SKU. We will confirm availability, the full purchase price, and payment options.';
    }
    return '';
  }

  async function ask(prompt) {
    prompt = String(prompt || '').trim();
    if (!prompt || busy) return;

    setOpen(true);
    addMessage('user', prompt);
    history.push({ role: 'user', content: prompt });
    history = history.slice(-10);
    input.value = '';

    var instant = localAnswer(prompt);
    if (instant) {
      addMessage('assistant', instant);
      history.push({ role: 'assistant', content: instant });
      history = history.slice(-10);
      return;
    }

    busy = true;
    send.disabled = true;
    var typing = addMessage('assistant', 'Thinking...', 'hog-ai-typing');

    try {
      var response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, context: pageContext() })
      });
      var data = await response.json().catch(function () { return {}; });
      typing.remove();

      if (!response.ok || !data.reply) {
        throw new Error(data.error || 'AI service unavailable');
      }

      addMessage('assistant', data.reply);
      history.push({ role: 'assistant', content: data.reply });
      history = history.slice(-10);
    } catch (error) {
      if (typing && typing.parentNode) typing.remove();
      addMessage('assistant', 'I cannot reach the AI service right now. Please call Hands of Gold at (631) 264-6610 and we will help you.');
      if (window.console && console.warn) console.warn('[hog-ai-chat]', error);
    } finally {
      busy = false;
      send.disabled = false;
      input.focus();
    }
  }

  launcher.addEventListener('click', function () { setOpen(!panel.classList.contains('is-open')); });
  closeButton.addEventListener('click', function () { setOpen(false); });
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    ask(input.value);
  });
  root.querySelectorAll('.hog-ai-quick').forEach(function (button) {
    button.addEventListener('click', function () { ask(button.getAttribute('data-prompt')); });
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && panel.classList.contains('is-open')) setOpen(false);
  });

  addMessage('assistant', 'Hi! I’m the Hands of Gold AI assistant. Ask me about custom jewelry, repairs, Cuban chains, financing, store hours, or purchasing a Monaci piece. También hablo español.');
})();
