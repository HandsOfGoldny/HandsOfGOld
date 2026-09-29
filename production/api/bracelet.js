// Hands of Gold — NFC bracelet profile API (Vercel Node function)
//
// Public:
//   GET  /api/bracelet?i=ID                        -> public profile (what a tap shows)
// Owner (needs the 16-char owner code from the card in the box):
//   POST {action:"check", i, code}                 -> unlock edit form, returns current settings
//   POST {action:"save",  i, code, address, lightning, name, show}
// Staff (needs STAFF_ACCESS_CODE env var, used by /b/admin.html):
//   POST {action:"admin-add",     staff, rows:[{id, hash, batch}]}
//   POST {action:"admin-reset",   staff, i, hash}
//   POST {action:"admin-disable", staff, i}   /  "admin-enable"
//   POST {action:"admin-list",    staff}
//
// Storage: the site's existing Vercel KV / Upstash Redis (KV_REST_API_URL + KV_REST_API_TOKEN).
// Keys: "bracelet:<ID>" -> JSON row, set "bracelets:all" -> all IDs.
// Hands of Gold never holds keys or funds — only a public receiving address.

const crypto = require('node:crypto');
const { parseBitcoinAddress, parseLightningAddress, cleanDisplayName } = require('./_lib/bracelet-btc.js');

const KV_URL = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const STAFF = process.env.STAFF_ACCESS_CODE || '';

const ID_RE = /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const MAX_FAILS = 8;          // wrong owner codes before a lockout
const LOCK_MINUTES = 15;
const SHOW = new Set(['off', 'balance', 'received']);

async function kv(...cmd) {
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`kv ${cmd[0]} ${r.status} ${j.error || ''}`);
  return j.result;
}
const key = (id) => `bracelet:${id}`;
async function getRow(id) { const v = await kv('GET', key(id)); return v ? JSON.parse(v) : null; }
async function putRow(row) { await kv('SET', key(row.id), JSON.stringify(row)); return row; }

const normId = (v) => String(v || '').trim().toUpperCase();
const normCode = (v) => String(v || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
const hashCode = (id, code) => crypto.createHash('sha256').update(`${id}:${code}`).digest('hex');
function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function publicView(row) {
  const active = row.status === 'active';
  return {
    id: row.id, status: row.status, name: row.display_name || '',
    address: active ? row.btc_address : null,
    lightning: active ? row.lightning_address : null,
    show: active ? row.show_stat || 'off' : 'off',
  };
}

// Owner code check with lockout. Returns {row} or {status, error}.
async function verifyOwner(id, code) {
  const row = await getRow(id);
  if (!row || row.status === 'disabled') return { status: 404, error: 'Bracelet not found.' };
  if (row.locked_until && new Date(row.locked_until) > new Date()) {
    return { status: 429, error: `Too many wrong codes. Try again in ${LOCK_MINUTES} minutes.` };
  }
  if (!safeEq(hashCode(id, normCode(code)), row.claim_hash || '')) {
    const fails = (row.failed_attempts || 0) + 1;
    const lock = fails >= MAX_FAILS;
    row.failed_attempts = lock ? 0 : fails;
    if (lock) row.locked_until = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
    await putRow(row);
    return { status: lock ? 429 : 403, error: lock ? `Too many wrong codes. Try again in ${LOCK_MINUTES} minutes.` : 'That code doesn\'t match this bracelet. Check the card that came in the box.' };
  }
  if (row.failed_attempts || row.locked_until) { row.failed_attempts = 0; row.locked_until = null; await putRow(row); }
  return { row };
}

// Staff code check, with a global 10-tries-per-15-minutes limit against guessing.
async function verifyStaff(given) {
  if (!STAFF) return { status: 500, error: 'STAFF_ACCESS_CODE is not set in Vercel.' };
  const fails = Number(await kv('GET', 'bracelets:adminfails')) || 0;
  if (fails >= 10) return { status: 429, error: 'Too many wrong staff codes. Wait 15 minutes.' };
  if (!safeEq(String(given || ''), STAFF)) {
    await kv('INCR', 'bracelets:adminfails'); await kv('EXPIRE', 'bracelets:adminfails', 900);
    return { status: 403, error: 'Wrong staff code.' };
  }
  return {};
}

async function handleAdmin(body, res) {
  const s = await verifyStaff(body.staff);
  if (s.error) return res.status(s.status).json({ error: s.error });

  if (body.action === 'admin-list') {
    const ids = (await kv('SMEMBERS', 'bracelets:all')) || [];
    if (!ids.length) return res.status(200).json({ ok: true, rows: [] });
    const vals = await kv('MGET', ...ids.map(key));
    const rows = vals.filter(Boolean).map((v) => {
      const r = JSON.parse(v);
      return { id: r.id, status: r.status, batch: r.batch, name: r.display_name || '', address: r.btc_address || '', created_at: r.created_at, claimed_at: r.claimed_at };
    }).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return res.status(200).json({ ok: true, rows });
  }

  if (body.action === 'admin-add') {
    const rows = Array.isArray(body.rows) ? body.rows.slice(0, 500) : [];
    if (!rows.length) return res.status(400).json({ error: 'No bracelets to add.' });
    const now = new Date().toISOString();
    let added = 0; const skipped = [];
    for (const r of rows) {
      const id = normId(r.id);
      if (!ID_RE.test(id) || !HASH_RE.test(String(r.hash))) { skipped.push(id || '?'); continue; }
      const row = { id, claim_hash: r.hash, status: 'unclaimed', show_stat: 'off', batch: String(r.batch || '').slice(0, 60), created_at: now, failed_attempts: 0 };
      const ok = await kv('SET', key(id), JSON.stringify(row), 'NX'); // never overwrite an existing bracelet
      if (ok) { await kv('SADD', 'bracelets:all', id); added++; } else skipped.push(id);
    }
    return res.status(200).json({ ok: true, added, skipped });
  }

  const id = normId(body.i);
  if (!ID_RE.test(id)) return res.status(400).json({ error: 'Invalid bracelet ID.' });
  const row = await getRow(id);
  if (!row) return res.status(404).json({ error: 'Bracelet not found.' });

  if (body.action === 'admin-reset') {
    if (!HASH_RE.test(String(body.hash))) return res.status(400).json({ error: 'Bad code hash.' });
    Object.assign(row, { claim_hash: body.hash, failed_attempts: 0, locked_until: null });
    await putRow(row);
    return res.status(200).json({ ok: true });
  }
  if (body.action === 'admin-disable' || body.action === 'admin-enable') {
    row.status = body.action === 'admin-disable' ? 'disabled' : (row.btc_address ? 'active' : 'unclaimed');
    await putRow(row);
    return res.status(200).json({ ok: true, status: row.status });
  }
  return res.status(400).json({ error: 'Unknown action.' });
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!KV_URL || !KV_TOKEN) return res.status(500).json({ error: 'Bracelet service is not configured.' });

  try {
    if (req.method === 'GET') {
      const id = normId(req.query.i || req.query.id);
      if (!ID_RE.test(id)) return res.status(400).json({ error: 'Invalid bracelet link.' });
      const row = await getRow(id);
      if (!row || row.status === 'disabled') return res.status(404).json({ error: 'Bracelet not found.' });
      return res.status(200).json(publicView(row));
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (String(body.action || '').startsWith('admin-')) return handleAdmin(body, res);

    const id = normId(body.i);
    if (!ID_RE.test(id)) return res.status(400).json({ error: 'Invalid bracelet ID.' });
    if (normCode(body.code).length !== 16) return res.status(400).json({ error: 'The owner code is 16 characters (letters and numbers).' });

    const v = await verifyOwner(id, body.code);
    if (v.error) return res.status(v.status).json({ error: v.error });
    const row = v.row;

    if (body.action === 'check') {
      return res.status(200).json({
        ok: true, status: row.status, name: row.display_name || '', address: row.btc_address || '',
        lightning: row.lightning_address || '', show: row.show_stat || 'off',
      });
    }

    if (body.action === 'save') {
      const btc = parseBitcoinAddress(body.address || '');
      if (!btc) return res.status(400).json({ error: 'That Bitcoin address isn\'t valid. Copy it straight from your wallet\'s Receive screen.' });
      let lightning = null;
      if (body.lightning && String(body.lightning).trim()) {
        lightning = parseLightningAddress(body.lightning);
        if (!lightning) return res.status(400).json({ error: 'Lightning address should look like name@wallet.com — or leave it blank.' });
      }
      const now = new Date().toISOString();
      Object.assign(row, {
        status: 'active', btc_address: btc.address, lightning_address: lightning,
        display_name: cleanDisplayName(body.name) || null,
        show_stat: SHOW.has(body.show) ? body.show : 'off',
        updated_at: now, claimed_at: row.claimed_at || now,
      });
      await putRow(row);
      return res.status(200).json({ ok: true, type: btc.type, profile: publicView(row) });
    }

    return res.status(400).json({ error: 'Unknown action.' });
  } catch (err) {
    console.error('[bracelet]', err);
    return res.status(502).json({ error: 'Bracelet service is temporarily unavailable. Please try again.' });
  }
}

module.exports = handler;
