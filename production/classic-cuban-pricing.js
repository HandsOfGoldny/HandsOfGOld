window.HOG_CLASSIC_CUBAN_PRICING = {
  // Prices are intentionally OFF. The page shows specifications only and
  // asks the customer to call. Set this back to true to show prices again -
  // the spot + $45/gram rule below is preserved and ready.
  retailEnabled: false,

  // ---------------------------------------------------------------
  // HANDS OF GOLD RETAIL RULE
  //
  //   price = (live gold spot price per gram + $45) x catalog weight
  //
  // The per-gram rate is built on the SPOT price of gold, not on melt
  // value. Karat purity is deliberately NOT applied to the rate, so the
  // same $/gram applies to 10K and 14K. A 10K piece still comes out
  // cheaper than the same size in 14K because it weighs less.
  //
  // To change the store's margin, edit spotPlusPerGram and nothing else.
  // ---------------------------------------------------------------
  mode: "spotPlus",

  spotPlusPerGram: 45,

  // Only these karats get a computed price. Anything else shows
  // "Call for current price" rather than a guessed number.
  spotPlusKarats: ["10K", "14K"],

  flatFee: 0,
  roundTo: 5,

  // Optional safety rail: pieces priced above this show "Call for
  // current price" instead of a live number. Set to null to disable.
  maxAutoPrice: null,

  // --- legacy modes, unused while mode is "spotPlus" ---
  markupPercent: 0,
  laborPerGram: 45,
  retailPerGram: { "10K": null, "14K": null }
};
