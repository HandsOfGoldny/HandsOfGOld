Hands of Gold - Classic Cuban Collection + Pricing Engine

THIS IS A CUMULATIVE PATCH ON TOP OF THE FULL CONVERSION UPGRADE.

COPY INTO YOUR CURRENT FULL WEBSITE FOLDER:
- script.js                         (replace current script.js)
- classic-cuban-collection.html     (new)
- classic-cuban.css                 (new)
- classic-cuban.js                  (new)
- classic-cuban-data.js             (new)
- classic-cuban-pricing.js          (new)
- sitemap.xml                       (replace current sitemap.xml)
- classic-cuban-media/              (new folder; 79 catalog crops)

DO NOT replace:
- index.html
- style.css
- any existing image/video/media folders

WHAT IT DOES
- Adds "Classic Cubans" to main navigation.
- Adds a premium "Build Your Cuban" homepage block.
- Adds an interactive Classic Cuban Collection page.
- Bracelet / Necklace selector.
- Width selector.
- Length selector.
- Karat selector.
- Uses exact catalog SKU and exact source weights.
- 18K / 21K / 22K are disabled when the catalog supplies no weight.
- Loads live XAU gold price.
- Retail pricing engine supports:
    A) spotPlus  - (live gold spot per gram + set amount) x weight   <-- IN USE
    B) markup    - live metal (melt) value + markup % + labor/gram + flat fee
    C) perGram   - fixed store retail price per gram by karat
- Retail price is LIVE (Aug 28 2026). The active rule is the Hands of Gold
  store rule: gold SPOT price per gram PLUS $45 per gram, times the catalog
  weight. It is spot-based, NOT melt-based - karat purity is not applied to
  the rate, so 10K and 14K use the same $/gram and a 10K piece comes out
  cheaper only because it weighs less. Only 10K and 14K are priced; every
  other karat shows "Call for current price". If the live gold feed fails,
  no price is shown at all.
- Text This Configuration button.
- Shareable URL preserving type/width/length/karat.
- Catalog gallery with 79 source configurations.
- SEO copy + FAQ schema + CollectionPage schema.
- Updated sitemap.

HOW TO CHANGE CUSTOMER RETAIL PRICES
Edit only classic-cuban-pricing.js. Nothing else needs to change.

  spotPlusPerGram: 45      <- the store's margin per gram. Change this number
                              and nothing else to raise or lower every price.
  spotPlusKarats: ["10K","14K"]
                           <- karats allowed to show a computed price.
  maxAutoPrice: null       <- optional ceiling. Set a number (e.g. 25000) and
                              anything above it shows "Call for current price"
                              instead of a live figure.
  retailEnabled: false     <- turns all displayed prices off instantly.

To go back to a melt-based rule, set mode: "markup" and fill in markupPercent
and laborPerGram. To use a fixed rate that ignores the live gold price, set
mode: "perGram" and fill in retailPerGram.

SOURCE
All sizes, SKUs and weights come from the 12-page Classic Cuban PDF supplied
in this chat. Some source weights are unusual/non-monotonic across lengths;
they are preserved exactly rather than silently corrected. Because price is
driven by weight, this makes a few longer pieces price BELOW a shorter piece
of the same width. Known cases (14K): 5mm 7.5in vs 8in; 6mm 7in vs 7.5in;
8mm 7.5in vs 8in; 8mm 8.25in vs 8.5in; 9mm 7in vs 7.5in vs 8in;
11mm necklace 18in vs 20in; 15mm necklace 20in vs 22in.
