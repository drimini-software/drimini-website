# Website structure

Status: Implemented and extended with verified work
Last reviewed: 2026-10-03

## Purpose

The first site should help a CTO quickly answer four questions:

1. What does Drimini build?
2. Is this team suited to a difficult, consequential project?
3. How does its AI-native process retain engineering judgment and ownership?
4. What is the honest next step?

The site is also Drimini's first public product. Its speed, accessibility,
editing, and interaction quality are part of the evidence. The site must not
replace missing evidence with fabricated case studies, customers, metrics,
testimonials, team profiles, or partner logos.

## Initial site map

| Route | Job | Launch status |
| --- | --- | --- |
| `/` | Explain the offer, working approach, fit, and next step | Build now |
| `/contact` | Collect a focused project enquiry and report delivery state | Build now |
| `404` | Recover visitors with one clear route home | Build now |
| `/privacy` | Explain form collection, use, retention, and visitor choices | Build now |
| `/work` | Index verified, honestly labeled work | Published; second project prepared locally |
| `/work/drimini-website` | Explain the decisions and evidence behind Drimini's website | Published |
| `/work/release-evidence` | Present the experimental source preview and its limits | Prepared locally |

Do not create empty About, Team, Services, Careers, Blog, or Work pages to make
the company appear larger. Add a route when it has useful, verified content.

## Global navigation

The launch header should be deliberately small:

- Drimini wordmark or refined logo linking to `/`;
- in-page links to **What we build** and **How we work**, plus the **Work** index;
- primary **Contact us** link to `/contact`.

On narrow screens, prefer a compact accessible disclosure or a wrapped set of
links. Do not add a JavaScript menu if the links fit clearly without one.

The footer should repeat the home and contact links and use only confirmed legal
or social information. Domain, legal entity, headquarters, postal address,
social accounts, and copyright-owner wording remain TBD.

## Homepage sequence

### 1. Hero: make the offer legible

State the difficult-work proposition before explaining the company. The working
message is:

> Drimini designs and builds custom software, systems, and websites for teams
> with an important outcome and a difficult gap to close.

Support it with one short line about AI-native delivery and human ownership.
Use **Contact us** as the primary action and **See how we work** as the secondary
in-page action.

This is message direction, not locked final copy. The final headline should be
shorter and may be more playful, but must preserve the meaning and avoid an
unsupported speed, scale, or quality claim.

### 2. What we build: three clear capability areas

Use one compact section for the confirmed offer:

- **Custom software** — focused digital products and internal tools;
- **Systems** — software that connects or supports important technical work;
- **Websites** — purposeful web experiences built with product and engineering
  care.

Keep these descriptions broad until service packages and delivered examples are
confirmed. A short note may say that adjacent work is welcome when there is a
credible path to delivery; do not claim Drimini can do anything.

### 3. The difficult bit: describe the client situation

Reflect the audience's problem without insulting an internal team or previous
supplier. Describe the useful situation: the outcome matters, existing capacity
or specialist range is insufficient, and the client wants a compact external
team to take ownership of the gap.

This section should make a CTO feel recognized, not sold to. It should not use
fake project scenarios or imply experience that has not been documented.

### 4. How we work: show the operating loop

Present the approved process in three memorable stages:

1. **Frame** — turn an ambiguous initiative into a defensible decision and
   executable next step.
2. **Build** — ship a thin end-to-end slice, learn from use, and expand toward
   the agreed outcome.
3. **Harden** — close the production gaps justified by the actual risk and
   leave the client able to operate the result.

The three engagement shapes may form one route or stand on their own. Do not
imply that every client must purchase all three.

Explain AI as part of the work loop rather than as a decorative feature. Make
human accountability explicit. A small process artifact or cause-and-effect
interaction can support this section if it remains understandable without
motion.

### 5. Good fit: qualify plainly

Describe the current best-fit engagement:

- an established mid-market company;
- a CTO or equivalent sponsor close enough to the decision;
- a consequential software, systems, or web outcome;
- a need for ownership, technical range, and fast learning.

State boundaries positively. Do not publish unsupported budget, duration,
industry-specialist, certification, geography, or availability claims.
Cybersecurity can be described as an area Drimini is interested in, not as an
established specialization.

### 6. Work we can show

Link to the website case study as live self-initiated work and Release Evidence
as an experimental open-source project. Keep both distinct from client work.
Describe only inspectable decisions, implementation, operations, and validation
status; do not translate an internal result into a customer outcome.

### 7. Closing contact invitation

End with a concise invitation to discuss the work. The **Contact us** action
goes to `/contact`. Nearby copy should ask for the outcome, difficult gap, and
enough context to begin a useful conversation without promising a response time.

## Contact route

The contact page provides a low-friction project enquiry:

- collect only the required fields in `README.md` and keep timeline and budget
  as optional free-text context rather than invented service tiers;
- submit to the same-origin `/api/contact` function and show honest pending,
  success, and failure states;
- validate on both client and server, while treating server validation as
  authoritative;
- use Turnstile and a honeypot for initial abuse control, with production rate
  limiting configured at Cloudflare;
- link the required privacy acknowledgement to `/privacy`;
- warn people not to send credentials, regulated data, or sensitive material;
- store accepted fields in the bound D1 database only after server validation;
- expose no public admin or enquiry-reading API; review D1 through an
  authenticated Cloudflare account or local Wrangler session;
- avoid CRM, scheduling, analytics, file uploads, or automatic email.

Production activation requires the domain, D1 database and migration, an inbox
owner, Turnstile keys, rate limiting, failure monitoring, and final legal
review. Missing storage configuration must fail visibly rather than silently
discarding information.

## Visual composition

Use the approved direction as a system rather than decorating a conventional
agency template:

- an editorial grid with generous type, strong alignment, and compact technical
  annotations;
- a warm light or distinctive chromatic canvas with one vivid accent family;
- interface-native details and real build artifacts when they exist;
- the logo concept's offset **splice** as a possible compositional behavior, not
  a repeated wallpaper motif;
- motion only to explain state, construction, or cause and effect;
- a single-column reading order on small screens, with no loss of meaning when
  motion is reduced or disabled.

The raster logo, its gradients, colors, and letterforms are still exploratory.
Do not sample them into final tokens or recreate the raster as a production SVG
without a separate logo refinement pass.

## Content and component map

Keep the component system proportional to the two-page site:

```text
BaseLayout
├── SiteHeader
├── main
│   ├── Hero
│   ├── CapabilityList
│   ├── ProblemStatement
│   ├── WorkingLoop
│   ├── FitChecklist
│   └── ContactCallout
└── SiteFooter

ContactPage
├── ContactForm
├── ContactStatus
└── UsefulContext

```

Start with page-local content. Move copy into a typed data module only when it
is reused or benefits from validation. Do not add a CMS or content collection
for two mostly static pages.

## Work routes

The work index contains two self-initiated projects and must not imply a client
relationship:

- Drimini's website and contact system is a live case study. It can report
  verified architecture, operational checks, accessibility testing, and live
  status, while stating that these do not prove client results, market demand,
  or unobserved scale.
- Release Evidence is an experimental open-source project. It can report the
  working scanner and local review workflow, repository link, privacy boundary,
  and automated checks, while stating that independent validation, stable
  releases, product demand, and commercial availability remain absent.

## Launch checks

- Every page has one clear `h1`, a descriptive title, and a useful meta
  description.
- Heading order, landmarks, link purpose, focus states, keyboard operation, form
  errors, and submission states are reviewed manually.
- Text and meaningful controls meet WCAG 2.2 AA contrast targets.
- Layout is checked at narrow mobile, wide mobile, tablet, laptop, and large
  desktop widths without device-specific assumptions.
- Reduced motion is respected and the page remains complete with JavaScript
  unavailable.
- The main routes pass Playwright smoke tests and automated axe checks, while
  recognizing that automation is not a complete accessibility audit.
- Production output contains no client-side secrets, hidden collection
  behavior, analytics, trackers, unsupported claims, or unconfirmed contact and
  legal details.
- Performance budgets are set during implementation and checked against the
  finished assets rather than invented before the visual system exists.
