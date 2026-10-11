import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const canonicalOrigin = "https://drimini.com";
const maxResponseBytes = 2 * 1024 * 1024;
const defaultTimeoutMs = 8000;
const parallelRequests = 3;

export const usage = `Drimini website smoke checks

Usage:
  pnpm health
  pnpm --silent health --json
  pnpm --silent health --origin https://drimini-website.pages.dev --json
  pnpm health --timeout-ms 12000

Checks public pages, declared headers, sharing images, the 404 page, contact
rejection, and production www redirects. Custom origins skip www checks.
The contact probe is an empty POST without Origin or enquiry fields, which the
existing handler rejects before spam verification or storage. No enquiry is
submitted. This does not verify successful Turnstile or D1 operation.

Exit codes: 0 checks passed; 1 checks failed; 2 invalid arguments.
This is a single run; scheduling and alerts are not configured.`;

export function parseHealthArguments(args) {
  const options = { origin: canonicalOrigin, timeoutMs: defaultTimeoutMs, json: false, help: false };
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (seen.has(flag)) throw new Error("Duplicate health option.");
    seen.add(flag);
    if (flag === "--json") options.json = true;
    else if (flag === "--help" || flag === "-h") options.help = true;
    else if (flag === "--origin") {
      const value = args[++index];
      let target;
      try { target = new URL(value); } catch { throw new Error("Origin must be an HTTP or HTTPS origin."); }
      if (!["http:", "https:"].includes(target.protocol) || target.username || target.password || target.pathname !== "/" || target.search || target.hash) {
        throw new Error("Origin must use HTTP or HTTPS with no credentials, path, query, or fragment.");
      }
      options.origin = target.origin;
    } else if (flag === "--timeout-ms") {
      const value = args[++index];
      if (!/^\d+$/.test(value ?? "") || Number(value) < 100 || Number(value) > 30000) {
        throw new Error("Timeout must be an integer from 100 to 30000 milliseconds.");
      }
      options.timeoutMs = Number(value);
    } else throw new Error("Unknown health option. Use --help for usage.");
  }
  return options;
}

// Compare deployment headers with the same public file shipped to Pages.
export const declaredHeaders = {};
let globalBlock = false;
for (const line of readFileSync(new URL("../public/_headers", import.meta.url), "utf8").split(/\r?\n/)) {
  if (!line.trim()) continue;
  if (!/^\s/.test(line)) { globalBlock = line.trim() === "/*"; continue; }
  const separator = line.indexOf(":");
  if (globalBlock && separator > 0) declaredHeaders[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
}

function normalizedHeader(name, value) {
  if (name === "content-security-policy") {
    return value.split(";").map((directive) => directive.trim().split(/\s+/)).filter(([name]) => name)
      .map(([name, ...sources]) => [name.toLowerCase(), ...sources.sort()].join(" ")).sort().join(";");
  }
  if (name === "permissions-policy") return value.replace(/\s/g, "").split(",").sort().join(",");
  return value.trim().toLowerCase();
}

function headerProblems(response) {
  const problems = [];
  for (const [name, expected] of Object.entries(declaredHeaders)) {
    const actual = response.headers.get(name);
    if (actual === null || normalizedHeader(name, actual) !== normalizedHeader(name, expected)) problems.push(`Declared ${name} header is missing or differs.`);
  }
  return problems;
}

function attributes(tag) {
  const values = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    values[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4];
  }
  return values;
}

function headElements(html) {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
  const head = withoutComments.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)?.[1] ?? "";
  return {
    title: head.match(/<title\b[^>]*>([^<]*)<\/title\s*>/i)?.[1]?.trim(),
    links: [...head.matchAll(/<link\b[^>]*>/gi)].map(([tag]) => attributes(tag)),
    metas: [...head.matchAll(/<meta\b[^>]*>/gi)].map(([tag]) => attributes(tag)),
    language: attributes(withoutComments.match(/<html\b[^>]*>/i)?.[0] ?? "").lang,
  };
}

function pageProblems(response, content, check) {
  const problems = headerProblems(response);
  if (response.status !== check.expectedStatus) problems.push(`Expected HTTP ${check.expectedStatus}; received ${response.status}.`);
  if (!/^text\/html(?:;|$)/i.test(response.headers.get("content-type") ?? "")) problems.push("Expected an HTML response.");
  const head = headElements(content.toString("utf8"));
  if (head.title !== check.title) problems.push("Page title differs from the expected route.");
  if (head.language !== "en") problems.push("Expected the English HTML language declaration.");
  const canonical = head.links.filter((link) => link.rel?.toLowerCase().split(/\s+/).includes("canonical"));
  const robots = head.metas.filter((meta) => meta.name?.toLowerCase() === "robots");
  if (check.kind === "missing") {
    if (!robots.some((meta) => meta.content?.toLowerCase().split(/[\s,]+/).includes("noindex"))) problems.push("The missing-page response must declare noindex.");
    if (canonical.length !== 0) problems.push("The missing-page response must not declare a canonical URL.");
  } else {
    let correctCanonical = false;
    if (canonical.length === 1) {
      try {
        const value = new URL(canonical[0].href);
        correctCanonical = value.origin === canonicalOrigin && !value.username && !value.password && value.pathname.replace(/\/$/, "") === check.path.replace(/\/$/, "") && !value.search && !value.hash;
      } catch { /* Invalid or missing canonical URL. */ }
    }
    if (!correctCanonical) problems.push("Expected one canonical URL for this route on drimini.com.");
    if (robots.some((meta) => meta.content?.toLowerCase().split(/[\s,]+/).includes("noindex"))) problems.push("A public page unexpectedly declares noindex.");
    const images = head.metas.filter((meta) => meta.property?.toLowerCase() === "og:image");
    if (images.length !== 1 || images[0].content !== canonicalOrigin + check.image) problems.push("Sharing-image metadata differs from the expected route.");
  }
  return problems;
}

export function buildHealthChecks(origin = canonicalOrigin) {
  const pages = [
    ["home", "/", "Drimini", "drimini-og.png"],
    ["contact", "/contact/", "Contact us — Drimini", "drimini-og.png"],
    ["privacy", "/privacy/", "Privacy notice — Drimini", "drimini-og.png"],
    ["work", "/work/", "Work — Drimini", "drimini-og.png"],
    ["website-case-study", "/work/drimini-website/", "Drimini website case study — Drimini", "drimini-website-case-study-og.png"],
    ["release-evidence", "/work/release-evidence/", "Release Evidence experimental project — Drimini", "release-evidence-og.png"],
  ].map(([id, path, title, image]) => ({ id, kind: "page", path, title, image: `/brand/${image}`, expectedStatus: 200, method: "GET", url: origin + path }));
  const images = ["drimini-og.png", "drimini-website-case-study-og.png", "release-evidence-og.png"]
    .map((name) => ({ id: `image:${name}`, kind: "image", method: "GET", url: `${origin}/brand/${name}` }));
  const checks = [...pages, ...images,
    { id: "missing-page", kind: "missing", expectedStatus: 404, title: "Page not found — Drimini", method: "GET", url: `${origin}/__drimini-health-missing__` },
    { id: "contact-rejection", kind: "contact", method: "POST", url: `${origin}/api/contact` },
  ];
  if (origin === canonicalOrigin) {
    for (const protocol of ["https", "http"]) {
      const suffix = "/contact/?health=redirect&value=a%2Fb";
      checks.push({ id: `www:${protocol}`, kind: "redirect", method: "GET", url: `${protocol}://www.drimini.com${suffix}`, destination: canonicalOrigin + suffix });
    }
  }
  return checks;
}

class ResponseTooLarge extends Error {}

async function boundedBody(response) {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > maxResponseBytes) {
    await response.body?.cancel();
    throw new ResponseTooLarge();
  }
  const chunks = [];
  let total = 0;
  if (response.body) {
    for await (const chunk of response.body) {
      total += chunk.byteLength;
      if (total > maxResponseBytes) throw new ResponseTooLarge();
      chunks.push(chunk);
    }
  }
  return Buffer.concat(chunks, total);
}

async function executeCheck(check, fetcher, timeoutMs) {
  const result = { id: check.id, method: check.method, url: check.url, outcome: "failed", problems: [] };
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const response = await fetcher(check.url, {
      method: check.method, redirect: "manual", credentials: "omit", signal,
      headers: { Accept: check.kind === "contact" ? "application/json" : check.kind === "image" ? "image/png" : "text/html", "User-Agent": "Drimini-Website-Health/1" },
      ...(check.kind === "contact" ? { body: "" } : {}),
    });
    result.http_status = response.status;
    if (check.kind === "redirect") {
      if (![301, 308].includes(response.status)) result.problems.push(`Expected a permanent redirect; received HTTP ${response.status}.`);
      let destination;
      try { destination = new URL(response.headers.get("location"), check.url).href; } catch { /* Missing or invalid location. */ }
      if (destination !== check.destination) result.problems.push("Redirect must preserve path and query on the canonical HTTPS origin.");
      await response.body?.cancel();
    } else {
      const content = await boundedBody(response);
      if (check.kind === "page" || check.kind === "missing") result.problems.push(...pageProblems(response, content, check));
      else if (check.kind === "image") {
        if (response.status !== 200) result.problems.push(`Expected HTTP 200; received ${response.status}.`);
        if (!/^image\/png(?:;|$)/i.test(response.headers.get("content-type") ?? "")) result.problems.push("Expected an image/png response.");
        const png = content.length >= 24 && content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && content.toString("ascii", 12, 16) === "IHDR";
        if (!png || content.readUInt32BE(16) !== 1200 || content.readUInt32BE(20) !== 630) result.problems.push("Expected a PNG sharing image measuring 1200 by 630.");
      } else {
        if (response.status !== 403) result.problems.push(`Expected HTTP 403 for an empty request without Origin; received ${response.status}.`);
        if (!/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "")) result.problems.push("Expected a JSON rejection from the contact Function.");
        if (!response.headers.get("cache-control")?.toLowerCase().split(",").map((value) => value.trim()).includes("no-store")) result.problems.push("Contact rejection must declare no-store.");
        let body;
        try { body = JSON.parse(content.toString("utf8")); } catch { /* Reject malformed response. */ }
        if (body?.ok !== false || typeof body.message !== "string" || !body.message.trim()) result.problems.push("Expected an explicit failed contact response.");
      }
    }
  } catch (error) {
    result.problems.push(signal.aborted ? `Request exceeded the ${timeoutMs} ms timeout.` : error instanceof ResponseTooLarge ? "Response exceeds the 2 MiB read limit." : "Network request or response stream failed.");
  }
  result.outcome = result.problems.length === 0 ? "passed" : "failed";
  return result;
}

export async function checkWebsite({ origin = canonicalOrigin, timeoutMs = defaultTimeoutMs, fetcher = fetch } = {}) {
  const checks = buildHealthChecks(origin);
  const results = new Array(checks.length);
  let next = 0;
  await Promise.all(Array.from({ length: parallelRequests }, async () => {
    while (next < checks.length) {
      const index = next++;
      results[index] = await executeCheck(checks[index], fetcher, timeoutMs);
    }
  }));
  return {
    schema_version: "1", checked_at: new Date().toISOString(), origin,
    ok: results.every((result) => result.outcome === "passed"), checks: results,
    scope: [
      "Single public-route smoke check; no scheduling or alerts configured.",
      "Contact rejection only; successful Turnstile verification and D1 storage are not checked.",
      ...(origin === canonicalOrigin ? [] : ["Production www redirects skipped for a custom origin."]),
    ],
  };
}

export function formatHealthReport(report) {
  const failures = report.checks.filter((check) => check.outcome === "failed");
  const lines = [`Drimini website checks: ${report.ok ? "PASS" : "FAIL"}`, `Target: ${report.origin}`, `Checked: ${report.checked_at}`, ""];
  for (const check of report.checks) {
    lines.push(`${check.outcome === "passed" ? "PASS" : "FAIL"} ${check.id}${check.http_status ? ` (HTTP ${check.http_status})` : ""}`);
    for (const problem of check.problems) lines.push(`  ${problem}`);
  }
  lines.push("", `${report.checks.length - failures.length}/${report.checks.length} checks passed.`, ...report.scope);
  return lines.join("\n");
}

export async function runHealth(args = process.argv.slice(2), { fetcher = fetch, stdout = console.log, stderr = console.error } = {}) {
  let options;
  try { options = parseHealthArguments(args); } catch (error) { stderr(error.message); return 2; }
  if (options.help) { stdout(usage); return 0; }
  const report = await checkWebsite({ ...options, fetcher });
  stdout(options.json ? JSON.stringify(report, null, 2) : formatHealthReport(report));
  return report.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await runHealth();
