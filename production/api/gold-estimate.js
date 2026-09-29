// Router kept at 12 functions (Hobby plan limit).
// - /api/gold-estimate            -> the original sell-gold estimate (unchanged, now in _lib)
// - /api/checkout (rewrite, op=checkout) -> Monaci Buy Now checkout
import estimate from "./_lib/gold-estimate-core.js";
import checkout from "./_lib/checkout.js";

export default async function handler(request, response) {
  if (request.query && request.query.op === "checkout") return checkout(request, response);
  return estimate(request, response);
}
