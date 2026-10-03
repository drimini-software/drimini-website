# Website

Status: Deployed and production contact path verified at `https://drimini.com`
Last reviewed: 2026-10-03

This directory contains the Drimini website application. The website is the
company's first project and should serve as early evidence of its AI-native,
modern product-development approach.

The implementation uses Astro 7.3.5, strict TypeScript, native CSS, static
output, Node.js 24 LTS, and pnpm 12.6.0. The homepage ships without browser
JavaScript; the contact route uses a small form helper, Cloudflare Turnstile,
and a Cloudflare D1-backed enquiry inbox. Enquiries are reviewed through the
authenticated Cloudflare D1 console or the local `pnpm inbox` command. There is
no public admin route and no Cloudflare Zero Trust subscription dependency.
The stack choice is recorded in `../decisions/2026-09-26-website-stack.md`, the
information architecture is in `structure.md`, and provisional visual and copy
choices are in `design-v1.md`. Deployment, inbox operation, failure handling,
and rollback are in `RUNBOOK.md`.

The public Work section contains one deliberately labeled self-initiated case
study at `/work/drimini-website`. It explains the website's decisions and
verified operating evidence without presenting the build as client work. The
default and case-study Open Graph cards live in `public/brand/` and are generated
from the existing SVG mark and website design tokens.

Versions are pinned in `package.json` and `pnpm-lock.yaml`. `drimini.com` is
owned, added to Cloudflare, and configured as the site's canonical origin. The
production build is deployed to Cloudflare Pages and the custom domain is active
at `https://drimini.com`.
The separate future DNS-only VPN hostname and VPN VPS are outside the website
runtime; this boundary is recorded in
`../decisions/2026-09-26-hosting-and-vpn-boundary.md`.

## Local setup

Requirements: Node.js 24 LTS and Corepack.

```powershell
corepack enable
pnpm install
pnpm exec playwright install chromium
pnpm dev
```

The browser installation is required only for the Playwright suite. Copy
`.env.example` to `.env` for local build-time values and `.dev.vars.example` to
`.dev.vars` only when running the Pages Function locally. Never commit real
secrets.

## Contact configuration

Build-time variable:

- `PUBLIC_TURNSTILE_SITE_KEY` — public Turnstile widget key. Local and automated
  builds may use Cloudflare's published test key; production must use a real key
  whose hostname list includes `drimini.com`.

Pages Function runtime variables and secrets:

- `TURNSTILE_SECRET_KEY` — secret used for server-side token verification.

Pages resource binding:

- `CONTACT_DB` — D1 database containing the `contact_enquiries` table.

The public endpoint deliberately returns a visible failure if Turnstile or D1
is missing. `public/_routes.json` restricts Pages Functions to `/api/contact`,
so normal static page requests do not consume the Functions quota.

## Production contact setup

1. Keep the existing `drimini-contact` database bound to the Pages project as
   `CONTACT_DB`; apply any later migrations before deploying code that needs
   them.
2. Retain the production `TURNSTILE_SECRET_KEY` and build with the production
   `PUBLIC_TURNSTILE_SITE_KEY`.
3. Deploy, submit one clearly labeled test enquiry, find it with
   `pnpm inbox list`, inspect it with `pnpm inbox show <id>`, and exercise read,
   archive, restore, and permanent deletion.
4. Retain the verified Cloudflare rate-limiting rule for `/api/contact` and the
   Pages Functions fail-closed setting. Configure production failure observation.

The old SMTP variables are not used. Email begins only when a person copies the
visitor's address from the enquiry and replies through VK WorkSpace.

Current Cloudflare state verified on 2026-10-03:

- `drimini-contact` exists in D1's EEUR region;
- migration `0001_contact_enquiries.sql` is applied and the table/index exist;
- the production deployment is live at `drimini-website.pages.dev` and has the
  `CONTACT_DB` binding;
- the production Turnstile secret remains configured;
- obsolete `SMTP_USERNAME` and `CONTACT_TO_EMAIL` Pages secrets were deleted;
- production and preview Functions are configured to fail closed;
- `https://drimini.com`, `/contact/`, and `/privacy/` return the production
  pages with the expected canonical metadata and security headers;
- `/work/`, `/work/drimini-website/`, and both Open Graph images are live on
  the custom domain with their expected disclosure and sharing metadata;
- the live contact endpoint rejects an invalid Turnstile token with HTTP 400,
  and the remote D1 inbox remains empty after that check;
- a labeled human submission was stored once, inspected, marked read, archived,
  restored, and permanently deleted; the inbox was confirmed empty afterward;
- the founder owns a once-per-business-day inbox check and monthly retention
  review; neither creates a public response-time promise;
- `www.drimini.com` redirects HTTP and HTTPS permanently to the apex while
  preserving the path and query string;
- the `/api/contact` rate-limit rule returns HTTP 429 after a burst and resets
  after its configured 10-second mitigation period;
- Cloudflare Access is deliberately not used because the enquiry review path
  does not need a public web interface or a paid Zero Trust setup.

## Commands

- `pnpm dev` — run the Astro development server;
- `pnpm dev:cloudflare` — build and run static assets plus Pages Functions;
- `pnpm build` — create the production site in `dist/`;
- `pnpm build:test` — build with deterministic test spam protection;
- `pnpm preview` — serve the production build locally;
- `pnpm check` — run Astro and TypeScript diagnostics;
- `pnpm check:functions` — compile the Pages Functions with Wrangler;
- `pnpm assets:social` — rebuild the deterministic 1200 by 630 sharing cards;
- `pnpm test:functions` — run server-side validation and delivery unit tests;
- `pnpm inbox list` — list open enquiries in the remote D1 database through
  the authenticated Wrangler session;
- `pnpm inbox --help` — show the available review and deletion commands;
- `pnpm test` — build, then run function, behavior, and accessibility tests;
- `pnpm test:e2e` — run Playwright against an existing current `dist/` build.

## Offer and audience

The core service categories are custom software, systems, and websites. The
company may take on unusual adjacent work enabled by AI, but website copy should
express that as openness and range rather than an unbounded “anything” claim.

The primary reader is a CTO or equivalent technical decision-maker.

Primary call to action: **Contact us**.

## Contact boundary

The call to action leads to a real project-enquiry form. A same-origin
Cloudflare Pages Function validates submissions, verifies Turnstile, and stores
the accepted fields in D1. There is no public review interface or admin API.
The owner reviews and manages enquiries using the authenticated Cloudflare D1
console or the narrow local `pnpm inbox` command. The implementation and
data-flow decisions are recorded in
`../decisions/2026-09-26-contact-intake.md` and
`../decisions/2026-10-02-local-d1-enquiry-review.md`.

The production channel is live and fails visibly; it never reports a message as
received unless D1 accepts the insert. The successful human Turnstile and D1
lifecycle check is complete. Release operations still require failure
observation. Free-plan limits are hard service limits rather than
permission to bill overages: if a relevant daily limit is exhausted, the contact
endpoint fails until Cloudflare resets it. Static pages remain available.

The edge controls are live. Future DNS or Rulesets changes require Cloudflare
dashboard access or a separate narrowly scoped token because the active Wrangler
profile cannot read or write those APIs. Exact settings are in `RUNBOOK.md`.

### Contact form fields

- Name — required
- Work email — required
- Company — required
- Role/title — optional
- What do you need help with? — required, long text
- Approximate timeline — optional
- Approximate budget range — optional
- Acknowledgement of the privacy notice — required before submission

Do not require a phone number or ask visitors to submit passwords, production
credentials, regulated data, or other sensitive material. Use accessible
labels, clear validation, spam protection, and a submission status that does
not leak recipient or infrastructure details.

## Remaining implementation decisions

- founder review of the v1 homepage and contact copy;
- final logo assets, brand color tokens, and typography;
- performance budgets after the visual assets are known;
- analytics, if a measured need and privacy approach justify it;
- production failure monitoring configuration;
- legal review and final controller details for the privacy notice once the
  company structure and jurisdiction are known.

The accessibility target is WCAG 2.2 AA. SEO uses semantic HTML, descriptive
page titles and summaries, crawlable static output, and canonical URLs rooted at
`https://drimini.com`. No analytics or other tracking should ship by default.

Use `company/` and relevant files in `products/` as the factual source for
website content. Never commit environment secrets.
