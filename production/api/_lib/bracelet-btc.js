// Bitcoin mainnet address + Lightning address validation.
// CommonJS copy for the API (generated from b/btc.mjs — keep them in sync).
// No dependencies. Validates checksums so a typo can't send someone's money into the void.

const B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values) {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
  }
  return chk >>> 0;
}

function hrpExpand(hrp) {
  const out = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

function convertBits(data, from, to) {
  let acc = 0, bits = 0; const out = [], maxv = (1 << to) - 1;
  for (const v of data) {
    acc = (acc << from) | v; bits += from;
    while (bits >= to) { bits -= to; out.push((acc >> bits) & maxv); }
  }
  if (bits >= from || ((acc << (to - bits)) & maxv)) return null; // non-zero padding
  return out;
}

function checkSegwit(addr) {
  if (addr !== addr.toLowerCase() && addr !== addr.toUpperCase()) return null;
  const a = addr.toLowerCase();
  const pos = a.lastIndexOf('1');
  if (pos < 1 || pos + 7 > a.length || a.length > 90) return null;
  const hrp = a.slice(0, pos);
  if (hrp !== 'bc') return null; // mainnet only
  const data = [];
  for (const ch of a.slice(pos + 1)) { const d = B32.indexOf(ch); if (d < 0) return null; data.push(d); }
  const pm = polymod(hrpExpand(hrp).concat(data));
  const ver = data[0];
  if (ver > 16) return null;
  if (ver === 0 && pm !== 1) return null;           // bech32
  if (ver !== 0 && pm !== 0x2bc830a3) return null;  // bech32m
  const prog = convertBits(data.slice(1, -6), 5, 8);
  if (!prog || prog.length < 2 || prog.length > 40) return null;
  if (ver === 0 && prog.length !== 20 && prog.length !== 32) return null;
  if (ver === 1 && prog.length !== 32) return null;
  const type = ver === 0 ? (prog.length === 20 ? 'Native SegWit' : 'SegWit script') : ver === 1 ? 'Taproot' : 'SegWit v' + ver;
  return { address: a, type };
}

// ---- minimal synchronous SHA-256 (for base58check) ----
const K = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
function sha256(bytes) {
  const l = bytes.length, bl = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(bl);
  m.set(bytes); m[l] = 0x80;
  const dv = new DataView(m.buffer); dv.setUint32(bl - 4, (l * 8) >>> 0); dv.setUint32(bl - 8, Math.floor(l / 0x20000000));
  const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const W = new Uint32Array(64), r = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < bl; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = r(W[i-15],7) ^ r(W[i-15],18) ^ (W[i-15] >>> 3), s1 = r(W[i-2],17) ^ r(W[i-2],19) ^ (W[i-2] >>> 10);
      W[i] = (W[i-16] + s0 + W[i-7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (r(e,6) ^ r(e,11) ^ r(e,25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
      const t2 = ((r(a,2) ^ r(a,13) ^ r(a,22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0]+=a; H[1]+=b; H[2]+=c; H[3]+=d; H[4]+=e; H[5]+=f; H[6]+=g; H[7]+=h;
  }
  const out = new Uint8Array(32), odv = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) odv.setUint32(i * 4, H[i]);
  return out;
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function checkBase58(addr) {
  if (addr.length < 26 || addr.length > 35) return null;
  let n = 0n;
  for (const ch of addr) { const d = B58.indexOf(ch); if (d < 0) return null; n = n * 58n + BigInt(d); }
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n & 255n)); n >>= 8n; }
  for (const ch of addr) { if (ch === '1') bytes.unshift(0); else break; }
  if (bytes.length !== 25) return null;
  const body = new Uint8Array(bytes.slice(0, 21)), chk = bytes.slice(21);
  const h = sha256(sha256(body));
  for (let i = 0; i < 4; i++) if (h[i] !== chk[i]) return null;
  if (body[0] === 0x00) return { address: addr, type: 'Legacy' };
  if (body[0] === 0x05) return { address: addr, type: 'Nested SegWit' };
  return null; // testnet or other networks
}

/** Returns {address, type} for a valid mainnet Bitcoin address, else null. Accepts "bitcoin:" URIs. */
function parseBitcoinAddress(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim();
  if (/^bitcoin:/i.test(s)) s = s.slice(8).split('?')[0];
  if (!s) return null;
  if (/^bc1/i.test(s)) return checkSegwit(s);
  if (/^[13]/.test(s)) return checkBase58(s);
  return null;
}

/** Lightning address like name@domain.com (optional field). Returns lowercase string or null. */
function parseLightningAddress(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim().replace(/^lightning:/i, '').toLowerCase();
  if (s.length > 100) return null;
  return /^\$?[a-z0-9._+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(s) ? s : null;
}

function cleanDisplayName(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}



module.exports = { parseBitcoinAddress, parseLightningAddress, cleanDisplayName, _sha256: sha256 };
