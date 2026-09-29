HANDS OF GOLD AI ASSISTANT — V2 FIX
===================================

Why v1 failed
-------------
The UI and /api/chat Vercel Function deployed correctly, but the live function returned HTTP 503
because the raw REST implementation expected AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN in process.env.
The old model id inclusionai/ling-3.0-tiny-free is also no longer in Vercel's current model list.

What v2 changes
---------------
1. ai-chat.css        - floating black/gold chat box styling (unchanged)
2. ai-chat.js         - chat UI and Monaci handoff (unchanged)
3. api/chat.js        - now uses the official Vercel AI SDK with project OIDC authentication
4. package.json       - installs the "ai" package used by the server-side function

Model
-----
Default model: inclusionai/ling-3.0-flash-fin-free
Vercel AI Gateway currently lists this language model with pricing input $0 / output $0.

Authentication
--------------
No AI secret is stored in the website or browser JavaScript.
On Vercel, the AI SDK uses project OIDC authentication for AI Gateway when a model string is used.
This avoids requiring a manually created AI_GATEWAY_API_KEY for the deployed website.

Pages enabled
-------------
- index.html
- cuban-chains.html
- classic-cuban-collection.html
- custom-jewelry.html
- engagement-rings.html
- engraving.html
- jewelry-repair.html
- sell-gold.html
- returns.html

Monaci behavior
---------------
On classic-cuban-collection.html, the chat sends the currently displayed product title,
SKU, width, length, karat, catalog weight, and displayed price to the server-side assistant.
It may repeat those exact displayed values but is instructed not to invent or recalculate prices.

Purchasing a piece
------------------
Customers contact the store with their selected piece or SKU to confirm availability, the full price, and payment options.

Media safety
------------
No existing image/video/media file was rewritten, recompressed, or intentionally changed.
