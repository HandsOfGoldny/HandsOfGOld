/* Hands of Gold — bot guard for /api/leads
   Paste this block at the TOP of your existing handler, right after you parse
   the request body and BEFORE anything writes to Supabase.

   Client-side checks can be bypassed by posting straight to the endpoint.
   This is the check that actually holds.
   ------------------------------------------------------------------ */

// --- assumes you already have something like:  const body = req.body  ---

// 1. Honeypot. Every real form on the site sends website as an empty string.
//    Anything non-empty is a bot that filled in a field it couldn't see.
if (body.website && String(body.website).trim() !== '') {
  return res.status(200).json({ ok: true });   // pretend success, write nothing
}

// 2. Timing. Humans do not complete a form in under 3 seconds.
if (typeof body.elapsed === 'number' && body.elapsed < 3) {
  return res.status(200).json({ ok: true });
}

// 3. Required fields, server side. Don't trust the browser to have checked.
const nm = String(body.name  || '').trim();
const em = String(body.email || '').trim();
if (!nm || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
  return res.status(400).json({ error: 'invalid' });
}

// 4. Obvious junk patterns seen in scraped/bot submissions.
if (nm.length > 80 || em.length > 120) {
  return res.status(400).json({ error: 'invalid' });
}
if (/https?:\/\//i.test(nm) || /https?:\/\//i.test(String(body.details || ''))) {
  return res.status(200).json({ ok: true });   // link spam, silently dropped
}

// 5. Simple per-IP rate limit (in-memory; resets when the function cold-starts).
//    Good enough to stop a script hammering the endpoint. For something
//    stronger, back this with a Supabase table or Upstash.
const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
globalThis.__hogHits = globalThis.__hogHits || new Map();
const nowMs  = Date.now();
const window = 60 * 60 * 1000;               // one hour
const hits   = (globalThis.__hogHits.get(ip) || []).filter(t => nowMs - t < window);
if (hits.length >= 3) {
  return res.status(429).json({ error: 'slow down' });
}
hits.push(nowMs);
globalThis.__hogHits.set(ip, hits);

// --- your existing Supabase insert continues below ---
