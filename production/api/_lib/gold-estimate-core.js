const GOLD_FALLBACK_USD_PER_OZ = 3350;
const PRIVATE_ESTIMATE_FACTOR = 0.79;
const GRAMS_PER_DWT = 1.55517384;
const PURITY = Object.freeze({ 24: 1, 22: 0.9167, 18: 0.75, 14: 0.585, 10: 0.417 });

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const karat = Number(request.query.karat);
  const weight = Number(request.query.weight);
  const unit = request.query.unit === "dwt" ? "dwt" : "grams";
  const purity = PURITY[karat];

  if (!purity || !Number.isFinite(weight) || weight <= 0 || weight > 100000) {
    return response.status(400).json({ error: "Invalid calculator input" });
  }

  let goldPrice = GOLD_FALLBACK_USD_PER_OZ;
  try {
    const priceResponse = await fetch("https://api.gold-api.com/price/XAU", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4500)
    });
    if (priceResponse.ok) {
      const data = await priceResponse.json();
      const livePrice = Number(data.price);
      if (Number.isFinite(livePrice) && livePrice > 0) goldPrice = livePrice;
    }
  } catch (_) {
    // The calculator remains available with a conservative fallback price.
  }

  const pennyweights = unit === "dwt" ? weight : weight / GRAMS_PER_DWT;
  const estimate = pennyweights * (goldPrice / 20) * purity * PRIVATE_ESTIMATE_FACTOR;

  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  return response.status(200).json({ estimate: Math.round(estimate * 100) / 100 });
}