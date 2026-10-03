# Website design exploration v1

Status: Implemented exploration; not a final brand system
Last reviewed: 2026-09-26

## Direction

The first implementation interprets **editorial software studio meets
experimental product lab** as a warm, type-led site with visible structure and
one sharp chromatic interruption. It should feel made by people close to the
work, not assembled from a generic agency template.

The design uses the logo concept's idea of two offset parts becoming a useful
whole. Candidate v2 redraws that idea as two flat, optically simplified SVG
modules rather than tracing the raster or its wordmark. The candidate is used in
the website header and favicon so it can be judged in context; it is not a final
or legally cleared identity.

Candidate assets:

- `public/brand/drimini-mark-v2.svg` — two-color symbol;
- `public/brand/drimini-mark-v2-one-color.svg` — single-color fallback;
- `public/favicon.svg` — small-format version on the warm canvas.
- `public/brand/drimini-og.png` — default 1200 by 630 sharing card;
- `public/brand/drimini-website-case-study-og.png` — case-study sharing card.

The PNG sharing cards are deterministic derivatives of the existing SVG mark
and website tokens. Rebuild them with `pnpm assets:social`; do not hand-edit the
generated files.

## Provisional palette

| Token | Value | Use |
| --- | --- | --- |
| Canvas | `#f5efe5` | Warm primary background |
| Paper | `#fffaf3` | Raised content surface |
| Ink | `#24122e` | Primary text and dark surfaces |
| Muted ink | `#665d67` | Supporting text on light surfaces |
| Coral | `#ff654f` | Primary accent and contact surface |
| Coral dark | `#9f2f2f` | Accessible detail text and states |
| Acid | `#d8f35a` | Small process accent, never body text |

These values are website-v1 tokens, not final company colors. Text pairings
must pass WCAG 2.2 AA before they are retained or promoted into `brand.md`.

## Typography

Version 1 deliberately uses a system sans and system mono stack. This removes a
third-party request, avoids licensing and font-loading work before a typeface is
approved, and makes layout behavior honest across platforms. Expressiveness
comes from scale, spacing, weight, and composition rather than a provisional
font download.

A later typography decision should compare self-hosted variable grotesks for
personality, language coverage, performance, licensing, and long-term
availability.

## Interaction

- No framework island is required for v1. The homepage remains JavaScript-free;
  the contact route loads one small form helper and Cloudflare Turnstile because
  they provide submission state and abuse protection.
- Links and controls have visible keyboard focus.
- Motion is not used as atmosphere. The current page communicates its process
  statically and remains complete without JavaScript.
- The contact form uses native controls, visible required states, an inline live
  region, and dedicated no-JavaScript result routes.

## First-release performance budgets

- Homepage HTML: no more than 15 KiB uncompressed.
- Loaded CSS: no more than 25 KiB uncompressed.
- Homepage client JavaScript: 0 bytes. Contact-route JavaScript is limited to
  the form helper and Turnstile.
- Fonts: no remote requests and no bundled font files in v1.

The Playwright suite enforces the HTML, CSS, and JavaScript budgets. The unused
raster concept remains in `public/brand/` as review material but is not requested
by any page.

## Copy thesis

The homepage leads with **Bring us the difficult bit.** It names the buyer's
situation without attacking an internal team or past supplier. Supporting copy
then establishes the offer, delivery loop, human accountability, qualification
signals, and a direct invitation to describe the difficult work.

The copy intentionally omits customer names, proof metrics, delivery promises,
prices, team biographies, certifications, office locations, and specialist
security claims because those facts are not yet available.

The first Work page uses Drimini's own website as inspectable proof. It labels
the project self-initiated, separates implementation evidence from client
outcomes, and states what the work does not prove.

## Review questions

- Does the aubergine/coral territory feel ownable enough to develop further?
- Is the headline confident and human without feeling glib for consequential
  technical work?
- Should the final typography feel more utilitarian, more editorial, or remain
  close to this neutral system treatment?
- Does the process diagram feel like useful evidence or merely decoration?
