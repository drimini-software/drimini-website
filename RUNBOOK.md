# Website operations runbook

Status: Production; contact path verified
Last reviewed: 2026-10-11
Operational owner: Founder (name TBD)

This runbook covers the public Cloudflare Pages site and the contact-form D1
database. It does not cover the independent VPN VPS or its hostname.

## Production resources

- Pages project: `drimini-website`
- Canonical hostname: `https://drimini.com`
- D1 database: `drimini-contact`
- Pages D1 binding: `CONTACT_DB`
- Public contact endpoint: `/api/contact`
- Local review command: `pnpm inbox`
- Migration directory: `migrations/`

There is no public admin page or enquiry-reading API. Review access uses the
Cloudflare dashboard or an authenticated local Wrangler session. Do not record
credentials, Turnstile secrets, mailbox passwords, or submitted enquiry data in
this repository or in release evidence.

## First production setup

1. Authenticate Wrangler with the Cloudflare account that owns the Pages
   project.
2. Confirm `drimini-contact` exists and that `wrangler.jsonc` binds it as
   `CONTACT_DB`.
3. Apply pending schema changes with
   `wrangler d1 migrations apply drimini-contact --remote`.
4. Retain the production `TURNSTILE_SECRET_KEY` and build with the production
   `PUBLIC_TURNSTILE_SITE_KEY`.
5. Confirm `public/_routes.json` includes only `/api/contact` so static page
   requests do not consume the Functions quota.
6. Build, test, and deploy the Pages project.
7. Keep the Pages Functions setting on fail closed. In **Security rules > Rate
   limiting rules**, add `drimini-contact-rate-limit`: match URI Path equal to
   `/api/contact`, count by IP, and block after 5 requests in 10 seconds for 10
   seconds. The Free plan currently permits one rule, a 10-second counting
   period, a 10-second mitigation period, and Path but not Method in this
   expression. The path is therefore the complete match.
8. Configure a way for the owner to notice repeated contact failures.
9. Create the permanent `www` redirect in the `drimini.com` zone:
   - add a proxied `A` record named `www` pointing to the reserved placeholder
     `192.0.2.1` so Cloudflare can receive redirect-only traffic;
   - under **Rules > Redirect Rules**, create a Single Redirect matching
     `(http.host eq "www.drimini.com")`;
   - use dynamic target
     `concat("https://drimini.com", http.request.uri.path)`, status `301`, and
     preserve the query string;
   - verify both HTTP and HTTPS while preserving a sample path and query.

Cloudflare's current rate-limit availability is documented at
<https://developers.cloudflare.com/waf/rate-limiting-rules/>. The redirect-only
DNS and rule pattern follows
<https://developers.cloudflare.com/fundamentals/manage-domains/redirect-domain/>.

## Current edge audit

Checked on 2026-10-03:

- the `drimini.com` zone is active;
- the Pages project has `drimini.com` active and no `www` custom domain;
- `www.drimini.com` has a proxied CNAME to `drimini.com`; redirect-only traffic
  does not require it to be attached as a Pages custom domain;
- HTTP and HTTPS requests to `www.drimini.com` return `301` to the apex while
  preserving a tested path and query string;
- a harmless burst against `/api/contact` produced HTTP `429`, and the endpoint
  returned to its normal response after the 10-second mitigation period;
- the current Wrangler OAuth profile can read Pages and zone metadata but gets
  HTTP 403 from DNS and Rulesets APIs, so configuration changes require the
  dashboard or a separate narrowly scoped token;
- do not paste a Cloudflare token into this repository or chat.

This design requires no card and no Cloudflare Zero Trust subscription. On the
Cloudflare Free plan, Functions and D1 have daily hard limits. If a relevant
limit is exhausted, the contact endpoint returns an error until the limit resets
at midnight UTC; it must never claim that an unstored message was received.
Static Pages asset requests remain outside the Functions quota.

## Release verification

Run locally from `website/`:

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm check:functions
pnpm test
```

After deployment:

1. Run `pnpm health` and require a passing report for deployed pages, headers,
   sharing images, the 404 route, contact rejection, and permanent `www`
   redirects. For a preview, use `pnpm health --origin <preview-origin>`;
   production redirects are explicitly skipped.
2. Submit one clearly labeled test enquiry through the public form.
3. Run `pnpm inbox list`, then `pnpm inbox show <id>`, and confirm the row has
   the expected fields but no stored IP address, user agent, or Turnstile token.
4. Run `pnpm inbox read <id>`, `archive`, and `restore`, checking the result
   after each action.
5. Remove the test with `pnpm inbox delete <id> --confirm-delete`.
6. Confirm invalid Turnstile and missing-field submissions do not create rows.
7. Verify production security headers and the permanent `www` redirect.

Do not use a real prospective client's details for the release test.

## Public-route smoke checks

Run `pnpm health` after deployment or while investigating an availability or
routing problem. It requires no account access and submits no enquiry: its
single empty contact POST omits Origin, so the Function rejects it before spam
verification or storage. All other probes are GET requests. It does not verify
successful Turnstile verification, the D1 binding, quotas, migrations, or inbox
availability. A passing report does not replace the contact lifecycle check.

Use `pnpm --silent health --json` for machine-readable results. To retain a
local report in PowerShell:

```powershell
New-Item -ItemType Directory -Force .cache | Out-Null
pnpm --silent health --json | Set-Content -Encoding UTF8 .cache/health.json
$healthExit = $LASTEXITCODE
# Inspect health.json and the native exit code before treating the run as passed.
$healthExit
```

Use `pnpm.cmd` if PowerShell execution policy prevents running `pnpm.ps1`.
Exit code `1` means a check failed; `2` means invalid arguments. The default
timeout is 8000 ms per request; `--timeout-ms 12000` allows a longer connection
budget without weakening HTTPS verification. Responses are limited to 2 MiB
and three requests run concurrently. Redirects are inspected without following
their destinations. Do not run bursts against the rate-limited contact route.

On failure, use the reported check ID and reason to inspect the corresponding
route, Pages deployment, `public/_headers`, or zone redirect rule. An unexpected
contact response can mean the Function route is missing or rate-limited; inspect
logs and edge status before changing its rejection behavior. A network or
timeout failure can be local to the checking machine; compare with a separate
trusted connection. Fix the cause or roll back a faulty deployment, then rerun.
Do not lower expected headers or disable certificate verification to obtain a
passing report.

The live production run passed all 13 checks on 2026-10-11. Each report remains
a point-in-time check. The separate workflow below schedules repeat runs after
publication; alert delivery and observation of actual storage failures remain
unconfigured. Regression tests run in the existing local and hosted test suite
without requesting the production site.

## Scheduled public checks

`.github/workflows/health.yml` defines **Website health**. Publishing it to
the official repository's `main` branch enables the schedule at 00:17, 06:17,
12:17, and 18:17 UTC. Changes to the workflow, Node version, health scripts, or
declared headers also trigger a check on `main`. For a check after manual Pages
deployment, use **Actions → Website health → Run workflow**, choosing `main`.
Forks and other branches skip the job. The workflow does not deploy the site.

The job runs `node scripts/health-actions.mjs` with a fixed production target
and no arguments, Cloudflare secrets, dependency installation, or account
access. The runner retains `.cache/health/website-health.json` and
`.cache/health/website-health.txt` and writes an escaped job summary. It clears
only those generated reports before a new attempt to avoid showing stale results
after startup failure. Its exit code preserves failed probes; report or summary
write errors also fail the run.

The final upload step runs even after failure and retains only those two files
for 14 days. It uses a run/attempt-specific artifact name and fails if no report
files exist. Artifacts and logs contain public probe metadata, with no enquiry
data, raw response bodies, or credentials. The hidden-files option applies to
the explicit report paths only. Official actions are pinned to immutable commits.

When a job fails:

1. Read the **Website health** summary and probe step log. If startup, report
   writing, or artifact upload failed, distinguish that failure from failed site
   probes. A missing report is not evidence that the website is down.
2. Download the run's `website-health-<run-id>-<attempt>` artifact and inspect
   the failed check IDs and reasons. Use the public-route failure guidance above.
3. If the checked source expectations changed before the manual Pages deployment,
   inspect the source/deployment mismatch rather than weakening the checker.
4. Fix the cause, deploy or roll back when appropriate, then run the workflow
   again on `main`. Avoid bursts against the contact route.

Always check when the last run actually finished. GitHub may delay or drop
scheduled runs under load and disables schedules in public repositories after
60 days without activity. Re-enable a disabled workflow and verify a new run;
do not assume that an old passing badge means a recent probe occurred. See
GitHub's [schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
The schedule provides repeated public-route observation; email, chat, and other
alert delivery have not been configured or verified. Successful Turnstile and
D1 operation still need the separate contact lifecycle check.

## Routine enquiry operation

- The founder checks the inbox once each business day while the contact form is
  active. This is an internal operating cadence, not a public response-time
  promise. Arrange a named backup before any absence that would break it.
- Run `pnpm inbox list` to see `new` and `read` enquiries; run
  `pnpm inbox all` to include archived enquiries.
- Run `pnpm inbox show <id>` before acting on a specific enquiry.
- Reply manually through VK WorkSpace. The website sends no acknowledgement or
  response email.
- Permanently delete enquiries when they are no longer needed for evaluation,
  the business conversation, a resulting relationship, or an applicable legal
  obligation.
- Review all stored enquiries monthly so archival does not become indefinite
  retention. Record the review privately without copying enquiry content into
  this repository.
- Handle correction and deletion requests promptly after verifying which
  enquiry the requester means. Do not ask them to resend sensitive data.

Once per week, review Pages Functions errors and D1 usage in Cloudflare. Review
them immediately after a reported form failure or unexpected inbox error.

## Failure handling

### Public form returns a failure

1. Check the Pages Function logs for `Contact persistence failed`; the log does
   not contain the submitted fields.
2. Verify that the `CONTACT_DB` binding exists in the active Pages environment.
3. Verify the migration is applied to the bound database.
4. Check Functions and D1 availability and daily quota in Cloudflare.
5. Verify the Turnstile secret and hostname/action configuration.

Keep the endpoint fail closed. Do not change a storage failure into a success
response or silently discard the submission.

### `pnpm inbox` fails

1. Run `pnpm exec wrangler whoami` and log in again if needed.
2. Confirm the authenticated account owns `drimini-contact`.
3. Verify the database name, migration, and D1 availability or quota.
4. Do not expose an unauthenticated admin route as a workaround.

### D1 contains an unintended update or deletion

Identify the correct restore point first. D1 Time Travel restores the database
in place and can overwrite later changes, so use it only after understanding
the impact. Cloudflare documents recovery at
<https://developers.cloudflare.com/d1/reference/time-travel/>.

## Rollback

- Roll the Pages site back to a previously verified deployment through the
  Cloudflare deployment history when a website release is faulty.
- The initial migration is additive. Do not automatically roll the D1 database
  backward when rolling back static assets or Functions.
- Before any destructive schema recovery, export what can be safely retained
  and record the intended restore point without copying enquiry content into
  repository notes.
- If contact intake must be stopped, allow the endpoint to return its visible
  failure state. Do not present a successful submission state while storage is
  disabled.

## Ownership still required

To complete the production operating boundary, record outside public website
copy:

- release approver;
- Cloudflare/DNS incident owner;
- who may restore D1 or roll back Pages;
- the applicable privacy controller details after legal review.
