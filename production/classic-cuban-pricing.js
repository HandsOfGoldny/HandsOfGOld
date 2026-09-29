window.HOG_CLASSIC_CUBAN_PRICING = {
  // Prices are ON. If the live gold feed is down, the page falls back to
  // "Call for current price" instead of showing a guessed number.
  retailEnabled: true,

  // ---------------------------------------------------------------
  // HANDS OF GOLD RETAIL RULE (confirmed by Julio, Sep 2026)
  //
  //   price per gram = (live gold spot per gram x karat purity) + $45
  //   price          = price per gram x catalog weight
  //
  //   14K purity = 0.585   10K purity = 0.417
  //   Example: spot $4,319.20/oz -> $138.87/g pure
  //            14K: 138.87 x 0.585 = $81.24 + $45 = $126.24/g
  //            4.34 g bracelet = $547.88 -> shown as $550 (rounded to $5)
  //
  // This is mode "melt": metal value + laborPerGram x weight.
  // To change the store's margin, edit laborPerGram and nothing else.
  // ---------------------------------------------------------------
  mode: "melt",

  laborPerGram: 45,
  markupPercent: 0,
  flatFee: 0,
  roundTo: 5,

  // Optional safety rail: pieces priced above this show "Call for
  // current price" instead of a live number. Set to null to disable.
  maxAutoPrice: null,

  // A price shown on the page is good for this many minutes, then it
  // expires and the customer must refresh. Buy Now charges the price shown.
  quoteMinutes: 25,

  // Gold's record high used in the "gold is down" note on the page.
  // Real record: $5,589/oz on Jan 28 2026. Kept at 5500 so the claim
  // "over $5,500" and the % below it are always conservative.
  recordHighRef: 5500,

  // --- unused while mode is "melt" ---
  spotPlusPerGram: 45,
  spotPlusKarats: ["10K", "14K"],
  retailPerGram: { "10K": null, "14K": null }
};
