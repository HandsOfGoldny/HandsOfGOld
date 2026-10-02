'use strict';
/* Hands of Gold — AI Jewelry Concept Studio
   Server-side image generation. The OpenAI key never leaves this function.

   POST /api/design            generate, revise or alternate a concept
   GET  /api/design?probe=1    is generation available on this deployment?
   GET  /api/design?id=HOG-... serve a stored concept image (used in lead emails)

   Env:
     OPENAI_API_KEY            required for generation
     HOG_DESIGN_DAILY_CAP      optional, default 200 — hard spend ceiling per UTC day
     HOG_DESIGN_PER_VISITOR    optional, default 3   — generations per visitor per 24h
     KV_REST_API_URL/TOKEN     optional but strongly recommended (rate limits + storage)
*/

const { command, configured } = require('./lib/redis');

const MAX_BODY_BYTES = 900 * 1024;
const {readImage}=require('../server/inspiration-image.cjs');
const CONCEPT_TTL_SECONDS = 60 * 60 * 24 * 45; // 45 days
const PER_VISITOR = Number(process.env.HOG_DESIGN_PER_VISITOR || 3);
const DAILY_CAP = Number(process.env.HOG_DESIGN_DAILY_CAP || 200);
const PROMPT_MAX = 6000;

const PIECES = ['Ring', 'Pendant', 'Nameplate', 'Bracelet', 'Chain', 'Earrings'];

/* ---------------------------------------------------------------- helpers */

function clean(v, max) {
  return String(v == null ? '' : v)
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function parseBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) throw new Error('too large');
    body = JSON.parse(body || '{}');
  }
  if(Buffer.byteLength(JSON.stringify(body||{}),'utf8')>MAX_BODY_BYTES)throw new Error('too large');
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

function visitorKey(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = fwd || req.headers['x-real-ip'] || 'unknown';
  return String(ip).slice(0, 64);
}

function conceptId() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
  let out = '';
  for (let i = 0; i < 5; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return 'HOG-CUSTOM-' + out;
}

function utcDay() {
  return new Date().toISOString().slice(0, 10);
}

/* ------------------------------------------------------- prompt building */

/* Type-specific construction guidance. Keeps the render manufacturable-looking
   instead of fantasy jewelry the bench could never actually make. */
const TYPE_RULES = {
  Ring:
    'Show the complete ring including a realistic shank of believable thickness. Stones must sit in real, ' +
    'structurally sound settings (prong, bezel, channel or pave as appropriate). Preserve any requested ' +
    'centre-stone shape exactly. Three-quarter view showing both the face and the profile of the band.',
  Pendant:
    'Show a single centred pendant, front-facing. Include a properly proportioned bail sized for a chain ' +
    'unless the description says otherwise. The silhouette must read clearly against the background. ' +
    'Do not add a chain unless the customer asked for one.',
  Nameplate:
    'The requested name, word or lettering is the central design element and must be rendered accurately, ' +
    'legibly and correctly spelled, in a jewelry-appropriate script or block letterform. Show realistic ' +
    'attachment points where the chain would connect at each end. Front-facing.',
  Bracelet:
    'Show the complete bracelet including realistic link construction and a believable working clasp. ' +
    'Present it laid in a gentle curve or open arc so the link pattern and the clasp are both visible. ' +
    'Respect the requested width and length proportions.',
  Chain:
    'Show the chain link style accurately and consistently along its length, with a realistic clasp. ' +
    'Respect the requested millimetre width and length proportions. Present it coiled or draped so the ' +
    'link geometry is clearly readable.',
  Earrings:
    'Show a matching pair, both earrings visible and consistent with each other. Include realistic posts, ' +
    'hooks, latch-backs or closures appropriate to the style.'
};

const QUALITY_RULES =
  'Professional custom-jewelry concept rendering in the style of high-end jewelry CAD visualisation or ' +
  'studio product photography. Accurate polished precious-metal appearance and reflections. Believable, ' +
  'well-cut stones in structurally correct settings. Manufacturable construction only - no floating parts, ' +
  'no impossible attachment points, no melting or organic distortion of the metal. Single piece of jewelry, ' +
  'centred composition, dark neutral luxury background, soft studio lighting, high detail, sharp focus. ' +
  'No hands, no fingers, no human model, no mannequin. No unrelated jewelry in frame. No text, no lettering ' +
  'overlays, no watermark, no logo, no brand name, no signature - except lettering that is itself part of ' +
  'the requested jewelry design.';

function buildPrompt(spec) {
  const bits = [];
  bits.push('Create a photorealistic professional jewelry concept rendering of a custom ' + spec.piece.toLowerCase() + '.');

  const made = [];
  if (spec.metal) made.push('crafted in polished ' + spec.metal);
  if (spec.stones && !/^no stones/i.test(spec.stones)) made.push('set with ' + spec.stones.toLowerCase());
  else if (spec.stones) made.push('in metal only, with no stones');
  if (made.length) bits.push('It is ' + made.join(' and ') + '.');

  if (spec.size) bits.push('Approximate size and proportions: ' + spec.size + '.');
  if (spec.notes) bits.push("Customer's description of the design: " + spec.notes);

  if (spec.revision) {
    bits.push('Revise that design as follows, keeping everything else about it the same: ' + spec.revision);
  }
  if (spec.alternate) {
    bits.push(
      'Produce a different interpretation of the same brief - vary the styling, proportions and detailing ' +
      'while keeping the same piece type, metal, stones and overall intent.'
    );
  }

  if (TYPE_RULES[spec.piece]) bits.push(TYPE_RULES[spec.piece]);
  bits.push(QUALITY_RULES);

  return bits.join(' ').slice(0, PROMPT_MAX);
}

function buildSummary(spec) {
  return [spec.piece, spec.metal, spec.stones, spec.size, spec.budget].filter(Boolean).join(' · ');
}

/* --------------------------------------------------------- rate limiting */

/* Per-instance fallback so an unconfigured KV still cannot be hammered from a
   single warm function instance. Not a substitute for Redis. */
const memory = { day: utcDay(), total: 0, visitors: new Map() };

function memoryCheck(key) {
  const today = utcDay();
  if (memory.day !== today) { memory.day = today; memory.total = 0; memory.visitors.clear(); }
  const used = memory.visitors.get(key) || 0;
  if (memory.total >= DAILY_CAP) return { ok: false, reason: 'daily' };
  if (used >= PER_VISITOR) return { ok: false, reason: 'visitor', remaining: 0 };
  memory.visitors.set(key, used + 1);
  memory.total += 1;
  return { ok: true, remaining: Math.max(0, PER_VISITOR - used - 1) };
}

function memoryRefund(key) {
  const used = memory.visitors.get(key) || 0;
  if (used > 0) memory.visitors.set(key, used - 1);
  if (memory.total > 0) memory.total -= 1;
}

async function takeSlot(key) {
  if (!configured()) return memoryCheck(key);
  const day = utcDay();
  const visitorK = 'hog:design:v:' + day + ':' + key;
  const globalK = 'hog:design:g:' + day;
  try {
    const total = await command('INCR', globalK);
    if (total === 1) await command('EXPIRE', globalK, 60 * 60 * 26);
    if (total > DAILY_CAP) {
      await command('DECR', globalK);
      return { ok: false, reason: 'daily' };
    }
    const used = await command('INCR', visitorK);
    if (used === 1) await command('EXPIRE', visitorK, 60 * 60 * 24);
    if (used > PER_VISITOR) {
      await command('DECR', visitorK);
      await command('DECR', globalK);
      return { ok: false, reason: 'visitor', remaining: 0 };
    }
    return { ok: true, remaining: Math.max(0, PER_VISITOR - used) };
  } catch (e) {
    console.error('[hog-design-ratelimit]', e.message);
    return memoryCheck(key); // never hard-fail a customer on a Redis blip
  }
}

/* A generation that failed technically should not burn the customer's attempt. */
async function refundSlot(key) {
  if (!configured()) return memoryRefund(key);
  const day = utcDay();
  try {
    await command('DECR', 'hog:design:v:' + day + ':' + key);
    await command('DECR', 'hog:design:g:' + day);
  } catch (e) {
    console.error('[hog-design-refund]', e.message);
  }
}

/* -------------------------------------------------------------- storage */

async function storeConcept(id, record) {
  if (!configured()) return false;
  try {
    await command('SET', 'hog:concept:' + id, JSON.stringify(record), 'EX', String(CONCEPT_TTL_SECONDS));
    return true;
  } catch (e) {
    console.error('[hog-design-store]', e.message);
    return false;
  }
}

async function readConcept(id) {
  if (!configured()) return null;
  try {
    const raw = await command('GET', 'hog:concept:' + id);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('[hog-design-read]', e.message);
    return null;
  }
}

/* ------------------------------------------------------- image provider */

const {generateImage,MODEL,IMAGE_MODEL}=require('./lib/design-provider');

/* -------------------------------------------------------------- handler */

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');

  /* ---- GET: availability probe, or serve a stored concept image -------- */
  if (req.method === 'GET') {
    const url = new URL(req.url, 'https://local');
    if (url.searchParams.get('probe')) {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      return res.status(200).json({
        available: Boolean(process.env.OPENAI_API_KEY),
        storage: configured(),
        /* whether the customer can be emailed a copy of their concept */
        mail: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL),
        perVisitor: PER_VISITOR, model: MODEL, imageModel: IMAGE_MODEL
      });
    }
    const id = clean(url.searchParams.get('id'), 40).toUpperCase();
    if (!/^HOG-CUSTOM-[A-Z0-9]{5}$/.test(id)) {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      return res.status(400).json({ error: 'Invalid concept id.' });
    }
    const record = await readConcept(id);
    if (!record || !record.b64) {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      return res.status(404).json({ error: 'That concept is no longer available.' });
    }
    const ext = String(record.mime || '').indexOf('png') >= 0 ? 'png' : 'webp';
    res.setHeader('Content-Type', record.mime || 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Disposition', 'inline; filename="' + id + '.' + ext + '"');
    return res.status(200).send(Buffer.from(record.b64, 'base64'));
  }

  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('[hog-design] OPENAI_API_KEY is not set on this deployment.');
    return res.status(503).json({
      error: 'Design previews are not available right now. Please call Hands of Gold at (631) 264-6610.',
      unavailable: true
    });
  }

  let body;
  try { body = parseBody(req); }
  catch (_) { return res.status(400).json({ error: 'Invalid request.' }); }

  if (clean(body.website, 200)) return res.status(400).json({ error: 'Invalid request.' }); // honeypot

  const rawPiece = clean(body.piece, 40);
  const spec = {
    piece: PIECES.indexOf(rawPiece) >= 0 ? rawPiece : 'Ring',
    metal: body.metal==='Not sure yet'?'':clean(body.metal, 60),
    stones: body.stones==='Not sure yet'?'':clean(body.stones, 60),
    budget: clean(body.budget, 40),
    size: clean(body.size, 160),
    notes: clean(body.notes, 900),
    revision: clean(body.revision, 400),
    alternate: body.mode === 'alternate'
  };

  /* An empty brief produces a generic stock-looking piece and wastes a paid call. */
  if (!spec.notes && !spec.size && !spec.revision) {
    return res.status(400).json({
      error: 'Add a short description of your idea first so the concept reflects your design.'
    });
  }

  let reference = null;
  try{reference=readImage(body.referenceImage);}catch(e){return res.status(400).json({error:e.message});}
  if(body.mode === 'revise') {
    const referenceId=clean(body.referenceConceptId,40).toUpperCase();
    if(!/^HOG-CUSTOM-[A-Z0-9]{5}$/.test(referenceId))return res.status(400).json({error:'Choose an existing concept to edit first.'});
    reference=await readConcept(referenceId);
    if(!reference?.b64)return res.status(400).json({error:'That original concept is no longer available. Please generate a new design.'});
  }
  const key = visitorKey(req);
  const slot = await takeSlot(key);
  if (!slot.ok) {
    if (slot.reason === 'daily') {
      return res.status(429).json({
        error: 'Our design studio has reached its limit for today. Please call Hands of Gold at (631) 264-6610 and we will design with you directly.'
      });
    }
    return res.status(429).json({
      error: 'You have used all ' + PER_VISITOR + ' concepts for now. Send your favourite design to Hands of Gold, or call (631) 264-6610 to keep going with a jeweler.',
      remaining: 0
    });
  }

  const prompt = buildPrompt(spec)+(reference?' Use the supplied image as inspiration. Follow the written brief where it differs. Do not duplicate third-party logos or branded designs.':'');

  try {
    const image = await generateImage(prompt, reference);
    const id = conceptId();
    const summary = buildSummary(spec);

    /* Only design information is stored. No name, email, phone or payment data
       reaches this function or the image provider. */
    const stored = await storeConcept(id, {
      b64: image.b64,
      mime: image.mime,
      summary: summary,
      piece: spec.piece,
      metal: spec.metal,
      stones: spec.stones,
      budget: spec.budget,
      size: spec.size,
      notes: spec.notes,
      revision: spec.revision,
      model: image.model, image_model: image.imageModel,
      created_at: new Date().toISOString()
    });

    console.log('[hog-design]', JSON.stringify({
      conceptId: id, piece: spec.piece, metal: spec.metal, stones: spec.stones,
      budget: spec.budget, model: image.model, stored: stored, mode: body.mode || 'create'
    }));

    return res.status(200).json({
      ok: true,
      conceptId: id,
      image: 'data:' + image.mime + ';base64,' + image.b64,
      imageUrl: stored ? '/api/design?id=' + id : '',
      summary: summary,
      remaining: slot.remaining
    });
  } catch (error) {
    /* Technical failure - give the attempt back rather than punishing the customer. */
    await refundSlot(key);
    console.error('[hog-design] generation failed', error && error.stack ? error.stack : error);
    return res.status(502).json({
      error: 'We could not create your preview this time. Please try again, or call Hands of Gold at (631) 264-6610.'
    });
  }
};