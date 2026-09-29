'use strict';

function creds() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
  return { url: url.replace(/\/$/, ''), token };
}

function configured() {
  const { url, token } = creds();
  return Boolean(url && token);
}

async function command(...args) {
  const { url, token } = creds();
  if (!url || !token) throw new Error('Lead database is not configured.');
  const response = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(5000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error || `Database request failed (${response.status})`);
  return data.result;
}

module.exports = { command, configured };
