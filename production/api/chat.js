'use strict';

// Current free text model listed by Vercel AI Gateway.
const MODEL = 'inclusionai/ling-3.0-flash-fin-free';
const MAX_MESSAGES = 10;
const MAX_MESSAGE_CHARS = 1200;

const BUSINESS_FACTS = `
You are the website AI assistant for Hands of Gold Jewelry and Repairs.

BUSINESS FACTS YOU MAY STATE AS FACT:
- Business: Hands of Gold Jewelry and Repairs, a family-run jewelry store serving Copiague, New York since 1983.
- Address: 494 Oak St, Copiague, NY 11726.
- Phone: (631) 264-6610.
- Hours: Monday-Saturday 10:00 AM-7:00 PM. Sunday 1:00 PM-5:00 PM.
- The store speaks English and Spanish.
- Services include custom jewelry, jewelry repair, ring resizing, engraving, watch batteries/repairs, diamond sales, engagement rings, gold buying, jewelry cleaning/restoration, and Cuban chains.
- Financing/leasing options shown on the site include Snap Finance, Acima, and Progressive Leasing. Never promise approval, limits, rates, or terms; direct customers to the relevant application/provider or the store for current details.
- For Monaci Cuban purchases, direct customers to the catalog and ask them to call or text (631) 264-6610 with the selected piece or SKU.
- The store confirms availability, the full purchase price, and payment options. Only offer the purchase and contact steps listed here. Do not invent payment amounts, checkout links, or requirements, even if a customer mentions an older offer.
- Customers should never send card numbers, bank information, Social Security numbers, passwords, or other highly sensitive information in this chat.

SALES AND ACCURACY RULES:
- Help the visitor move toward a useful next step: browse the relevant page, ask about purchasing a Monaci piece, call the store, or visit the store.
- Never invent inventory, product availability, metal weight, diamond specifications, live gold prices, repair quotes, or jewelry prices.
- If CURRENT PAGE CONTEXT contains a selected Monaci configuration or displayed price, you may repeat that exact information. Do not calculate a different price.
- If you do not know something, say so briefly and recommend calling (631) 264-6610.
- Do not process payments inside chat. Direct purchase questions to the store.
- Do not provide legal, tax, investment, medical, or credit advice.
- Match the visitor's language. If they write Spanish, answer Spanish; otherwise answer English unless they request another language.
- Keep answers concise and sales-friendly, normally 2-5 short sentences.
- Use plain text only. Do not use Markdown headings, tables, code fences, or decorative formatting.
- You are an AI assistant for Hands of Gold, not a human salesperson. Never pretend you personally checked the physical store or spoke to staff.
`;

function cleanText(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanContext(context) {
  if (!context || typeof context !== 'object') return 'No additional page context.';
  const pairs = [];
  const allowed = ['pageTitle', 'path', 'productTitle', 'sku', 'width', 'length', 'karat', 'weight', 'displayedPrice'];
  for (const key of allowed) {
    const value = cleanText(context[key], 180);
    if (value) pairs.push(`${key}: ${value}`);
  }
  return pairs.length ? pairs.join('\n') : 'No additional page context.';
}

function conversationText(messages) {
  return messages.map((m) => `${m.role === 'assistant' ? 'ASSISTANT' : 'CUSTOMER'}: ${m.content}`).join('\n');
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  if (!body || typeof body !== 'object') body = {};

  const rawMessages = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
  const messages = rawMessages
    .map((m) => ({
      role: m && m.role === 'assistant' ? 'assistant' : 'user',
      content: cleanText(m && m.content, MAX_MESSAGE_CHARS)
    }))
    .filter((m) => m.content);

  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'Please send a message.' });
  }

  const pageContext = cleanContext(body.context);
  const prompt = `${BUSINESS_FACTS}\nCURRENT PAGE CONTEXT:\n${pageContext}\n\nCONVERSATION SO FAR:\n${conversationText(messages)}\n\nRespond now as the Hands of Gold website AI assistant.`;

  try {
    // Important: using the AI SDK with a model string lets Vercel authenticate
    // AI Gateway with project OIDC on deployed Vercel Functions. No browser key
    // or manually stored AI_GATEWAY_API_KEY is required for the Vercel deployment.
    const { generateText } = await import('ai');
    const result = await generateText({
      model: MODEL,
      prompt
    });

    const reply = cleanText(result && result.text, 2200);
    if (!reply) {
      console.error('[hog-ai-chat] empty AI response');
      return res.status(502).json({
        error: 'I did not get a usable answer. Please call Hands of Gold at (631) 264-6610.'
      });
    }

    return res.status(200).json({ reply, model: MODEL });
  } catch (error) {
    console.error('[hog-ai-chat] AI SDK request failed', error && error.stack ? error.stack : error);
    return res.status(502).json({
      error: 'I cannot reach the AI service right now. Please call Hands of Gold at (631) 264-6610.'
    });
  }
};