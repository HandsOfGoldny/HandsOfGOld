# Production website

The current live website source is in `production/`. It was recovered byte-for-byte from Vercel production deployment `dpl_8muN6SXAMXpqRxv2PNHvazgnV2dY` before the September 29, 2026 copy cleanup. The root-level website is the older GitHub version and is retained for history.

Deploy from `production/` to the existing Vercel project `handsofgoldny` in team `hands-of-gold`. Vercel currently has no Git repository integration. Do not deploy the older repository root.

The Monaci collection retains its existing Stripe purchase flow and pricing rules. `/api/checkout` is routed through `api/gold-estimate.js` to the existing checkout implementation. The legacy `reserve.js` file remains inert for compatibility with cached pages.

## Astra rebuild review — October 2, 2026

The `astra-integrated-rebuild` branch adds the cinematic homepage, Astra Studio and inquiry routing while retaining the static HTML/Vercel function architecture. It preserves all 39 catalog entries, Monaci checkout, gift cards, financing provider links, service pages, business details and the existing staff inbox. The live Grillz page, missing from the GitHub snapshot, was recovered from the public website with its assets.

New inspiration images are validated raster files, stored separately for up to 45 days, attached to staff email when Resend is configured, and accessible through staff authentication. All Astra requests are inquiries marked `staff_review_required`; no order or appointment is confirmed. AI guidance and generated concepts are advisory. Julio/staff must confirm prices, dates, repair assessments, finance approval and customer commitments.

The retired free text model was replaced with `inclusionai/ling-3.1-flash-free`, verified in the provider catalog on October 2. `HOG_ASTRA_TEXT_MODEL` can override it. Image generation retains the existing provider and limits. New routing and inspiration access share existing functions so the deployment fits the current hosting plan.

Validation: `node tests/astra-rebuild.cjs` uses fake storage/email services and sends no external customer messages. It checks structured leads, inspiration attachments, consent, rate limits, origin restrictions, staff authentication, commitment escalation, local links, all 39 catalog entries and checkout routing. Desktop/mobile browser checks cover navigation, upload, live brief recognition and error recovery.

The production deployment inspected before this work was `dpl_HQX5WGpKuH7PPALsng6kd3DGnSZj`. Preview deployments are separate. Their image-generation key is absent, so concept creation cannot be tested there without configuring it. The existing production image service reported available. Preview availability is shown honestly in the Studio. Customer-copy email also reported unconfigured; staff delivery keeps its existing fallback.

**Julio approval is required before production publication.** After approval, deploy from `production/` using production environment settings rather than promoting a preview that lacks production-only keys. Preserve all existing secrets and verify image generation, staff delivery and checkout before completing release. No pricing, financing, purchase or return policy changes are included.
