// Monaci "Buy Now" checkout (Sep 2026).
//
// GET  /api/checkout?probe=1  -> { available: true|false }
//      The Buy Now button only appears when STRIPE_SECRET_KEY is set in Vercel.
// POST /api/checkout          body: { sku, karat, quotedPrice, quotedAt }
//      -> { url } (Stripe Checkout page) or an error.
//
// The price is ALWAYS recomputed here on the server from the live gold spot
// and the catalog weight. The browser's number is only used to honor the price
// the customer saw, and only when it is within 1.5% of the live price.
// A tampered price can never be charged.
//
// Pickup only: no shipping address is collected.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const TROY_OZ_GRAMS = 31.1034768;
const PURITY = { "10K": 0.417, "14K": 0.585, "18K": 0.75, "21K": 0.875, "22K": 0.9167 };
// Copiague, NY combined rate (NYS 4% + Suffolk 4.375% + MCTD 0.375%).
const TAX_RATE = Number(process.env.SALES_TAX_RATE || 0.0875);
const HONOR_TOLERANCE = 0.015;

let cache = null;
function loadCatalog() {
  if (cache) return cache;
  const read = (f) => fs.readFileSync(path.join(process.cwd(), f), "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(read("classic-cuban-data.js"), sandbox);
  vm.runInNewContext(read("classic-cuban-pricing.js"), sandbox);
  cache = {
    products: sandbox.window.HOG_CLASSIC_CUBAN_PRODUCTS || [],
    pricing: sandbox.window.HOG_CLASSIC_CUBAN_PRICING || {}
  };
  return cache;
}

function safeIso(ms) { try { return Number.isFinite(ms) ? new Date(ms).toISOString() : ""; } catch { return ""; } }

function roundTo(v, r) { r = Number(r) || 1; return Math.round(v / r) * r; }

async function liveSpot() {
  const r = await fetch("https://api.gold-api.com/price/XAU", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(4500)
  });
  if (!r.ok) throw new Error("gold feed");
  const d = await r.json();
  const p = Number(d.price);
  if (!Number.isFinite(p) || p <= 0) throw new Error("gold value");
  return p;
}

function siteOrigin(req) {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").toLowerCase();
  if (/^(www\.)?handsofgoldny\.com$/.test(host) || /^[a-z0-9-]+\.vercel\.app$/.test(host)) {
    return "https://" + host;
  }
  return "https://www.handsofgoldny.com";
}

function form(obj, prefix = "", out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) continue;
    if (typeof v === "object") form(v, key, out);
    else out.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(v)));
  }
  return out.join("&");
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const key = process.env.STRIPE_SECRET_KEY;

  if (req.method === "GET") {
    return res.status(200).json({ available: Boolean(key) });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!key) return res.status(503).json({ error: "Online checkout is not set up yet. Please call (631) 264-6610." });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const sku = String(body.sku || "");
  const karat = String(body.karat || "");

  const { products, pricing } = loadCatalog();
  if (!pricing.retailEnabled) return res.status(503).json({ error: "Online pricing is paused. Please call (631) 264-6610." });

  const p = products.find((x) => x.sku === sku);
  const weight = p ? Number(p.weights?.[karat]) : NaN;
  const purity = PURITY[karat];
  if (!p || !purity || !Number.isFinite(weight) || weight <= 0) {
    return res.status(400).json({ error: "That piece isn't available online. Please call (631) 264-6610." });
  }

  let spot;
  try { spot = await liveSpot(); }
  catch { return res.status(503).json({ error: "The live gold price is unavailable right now. Please call (631) 264-6610." }); }

  const labor = Number(pricing.laborPerGram) || 0;
  const serverPrice = roundTo((spot / TROY_OZ_GRAMS) * purity * weight + labor * weight + (Number(pricing.flatFee) || 0), pricing.roundTo);
  const cap = Number(pricing.maxAutoPrice);
  if (Number.isFinite(cap) && cap > 0 && serverPrice > cap) {
    return res.status(400).json({ error: "Please call (631) 264-6610 for this piece." });
  }

  // The 25-minute window is enforced by the page itself (the price and the
  // Buy Now button disappear when it runs out). Here we only honor a quoted
  // price that is within 1.5% of the live price; customers' device clocks can
  // be wrong, so the server does not trust the browser's timestamp.
  const quoted = Number(body.quotedPrice);
  const quotedAt = Number(body.quotedAt);
  const close = Number.isFinite(quoted) && quoted > 0 && Math.abs(quoted - serverPrice) <= serverPrice * HONOR_TOLERANCE;

  if (!close) {
    // Gold moved or the quote is stale: tell the page the new price, charge nothing.
    return res.status(409).json({ error: "price_changed", price: serverPrice, spot });
  }
  const price = quoted;

  const priceCents = Math.round(price * 100);
  const taxCents = Math.round(price * TAX_RATE * 100);
  const kind = p.type === "bracelet" ? "Bracelet" : "Necklace";
  const name = `Monaci Cuban ${kind} ${p.widthMm}mm x ${p.lengthIn}in ${karat}`;
  const origin = siteOrigin(req);
  const back = `${origin}/classic-cuban-collection.html?type=${encodeURIComponent(p.type)}&width=${p.widthMm}&length=${p.lengthIn}&karat=${encodeURIComponent(karat)}`;

  const params = {
    mode: "payment",
    success_url: `${origin}/order-confirmed.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: back,
    billing_address_collection: "required",
    phone_number_collection: { enabled: true },
    customer_creation: "always",
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    line_items: {
      0: {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: priceCents,
          product_data: {
            name,
            description: `SKU ${p.sku} · ${weight.toFixed(2)} g ${karat} · In-store pickup at 494 Oak St, Copiague NY`
          }
        }
      },
      1: {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: taxCents,
          product_data: { name: `NY sales tax (${(TAX_RATE * 100).toFixed(3).replace(/0+$/, "")}%)` }
        }
      }
    },
    custom_text: {
      submit: { message: "In-store pickup only at 494 Oak St, Copiague, NY. Bring a photo ID that matches this card. We'll call you when it's ready." }
    },
    metadata: {
      sku: p.sku, karat, weight_g: weight, price_usd: price, tax_usd: (taxCents / 100).toFixed(2),
      spot_usd_oz: spot.toFixed(2), server_price_usd: serverPrice,
      quoted_at: safeIso(quotedAt), fulfillment: "in-store pickup"
    },
    payment_intent_data: {
      description: `${name} (SKU ${p.sku}) - pickup`,
      metadata: { sku: p.sku, karat, price_usd: price, fulfillment: "in-store pickup" }
    }
  };

  let session;
  try {
    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: form(params),
      signal: AbortSignal.timeout(9000)
    });
    session = await r.json();
    if (!r.ok || !session.url) {
      console.error("[checkout] stripe error", session && session.error && session.error.message);
      return res.status(502).json({ error: "Checkout couldn't start. Please call (631) 264-6610." });
    }
  } catch (e) {
    console.error("[checkout] stripe request failed", e && e.message);
    return res.status(502).json({ error: "Checkout couldn't start. Please call (631) 264-6610." });
  }

  return res.status(200).json({ url: session.url });
}
