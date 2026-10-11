import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { handleContactRequest } from "../functions/api/contact.ts";
import { checkWebsite, declaredHeaders, formatHealthReport, parseHealthArguments, runHealth } from "../scripts/health.mjs";

const production = "https://drimini.com";
const pages = new Map([
  ["/", ["Drimini", "drimini-og.png"]],
  ["/contact/", ["Contact us — Drimini", "drimini-og.png"]],
  ["/privacy/", ["Privacy notice — Drimini", "drimini-og.png"]],
  ["/work/", ["Work — Drimini", "drimini-og.png"]],
  ["/work/drimini-website/", ["Drimini website case study — Drimini", "drimini-website-case-study-og.png"]],
  ["/work/release-evidence/", ["Release Evidence experimental project — Drimini", "release-evidence-og.png"]],
]);
const image = readFileSync(new URL("../public/brand/drimini-og.png", import.meta.url));

function pageHtml(path) {
  const [title, name] = pages.get(path);
  return `<html lang="en"><head><title>${title}</title><link rel="canonical" href="${production}${path}"><meta property="og:image" content="${production}/brand/${name}"></head><body></body></html>`;
}

function healthyResponse(input) {
  const url = new URL(input);
  if (url.hostname === "www.drimini.com") return new Response(null, { status: 301, headers: { location: `${production}${url.pathname}${url.search}` } });
  if (pages.has(url.pathname)) return new Response(pageHtml(url.pathname), { headers: { ...declaredHeaders, "content-type": "text/html; charset=utf-8" } });
  if (url.pathname.startsWith("/brand/")) return new Response(image, { headers: { "content-type": "image/png" } });
  if (url.pathname === "/api/contact") return Response.json({ ok: false, message: "Request rejected." }, { status: 403, headers: { "cache-control": "no-store" } });
  assert.equal(url.pathname, "/__drimini-health-missing__");
  return new Response('<html lang="en"><head><title>Page not found — Drimini</title><meta name="robots" content="noindex, nofollow"></head></html>', { status: 404, headers: { ...declaredHeaders, "content-type": "text/html" } });
}

function replaceResponse(response, { content, status, headers = {} }) {
  const modified = new Headers(response.headers);
  for (const [name, value] of Object.entries(headers)) {
    if (value === null) modified.delete(name);
    else modified.set(name, value);
  }
  return new Response(content, { status: status ?? response.status, headers: modified });
}

async function changedCheck(path, change) {
  const report = await checkWebsite({ fetcher: async (url) => {
    const response = healthyResponse(url);
    return new URL(url).pathname === path ? change(response) : response;
  } });
  assert.equal(report.ok, false);
  return report.checks.find((check) => new URL(check.url).pathname === path);
}

test("the production run covers the routes, image files, missing page, contact rejection, and both redirects", async () => {
  assert.deepEqual(Object.keys(declaredHeaders).sort(), ["content-security-policy", "permissions-policy", "referrer-policy", "x-content-type-options"]);
  const calls = [];
  const report = await checkWebsite({ fetcher: async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect, "manual");
    assert.equal(options.credentials, "omit");
    assert.equal(new Headers(options.headers).has("authorization"), false);
    return healthyResponse(url);
  } });
  assert.equal(report.ok, true);
  assert.equal(report.checks.length, 13);
  assert.equal(calls.length, 13);
  assert.equal(new Set(calls.map(({ url }) => url)).size, 13);
  assert.equal(report.schema_version, "1");
  assert.ok(Number.isFinite(Date.parse(report.checked_at)));
  assert.deepEqual(report.checks.map(({ outcome }) => outcome), Array(13).fill("passed"));
  assert.match(report.scope.join(" "), /successful Turnstile verification and D1 storage are not checked/);
  assert.match(formatHealthReport(report), /13\/13 checks passed/);
});

test("the checker contact probe is rejected by the real handler before body parsing, configuration, spam verification, or storage", async () => {
  let probes = 0;
  const unused = () => assert.fail("Contact rejection must not access downstream services");
  const report = await checkWebsite({ fetcher: async (url, options) => {
    if (options.method !== "POST") {
      assert.equal(options.method, "GET");
      assert.equal(options.body, undefined);
      return healthyResponse(url);
    }
    probes++;
    assert.equal(url, `${production}/api/contact`);
    assert.equal(options.body, "");
    const request = new Request(url, options);
    assert.equal(request.headers.has("origin"), false);
    assert.equal(request.headers.get("accept"), "application/json");
    request.formData = unused;
    return handleContactRequest(request, new Proxy({}, { get: unused }), unused, unused);
  } });
  assert.equal(report.ok, true);
  assert.equal(probes, 1);
});

test("preview targets retain production canonicals and explicitly skip production www redirects", async () => {
  const origin = "https://drimini-website.pages.dev";
  const report = await checkWebsite({ origin, fetcher: async (url) => {
    assert.equal(new URL(url).origin, origin);
    return healthyResponse(url);
  } });
  assert.equal(report.ok, true);
  assert.equal(report.checks.length, 11);
  assert.match(report.scope.join(" "), /www redirects skipped/);
});

test("wrong pages and indexing metadata fail even when HTTP 200 is returned", async (t) => {
  const cases = [
    ["fallback homepage", () => pageHtml("/"), /title differs/],
    ["wrong canonical host", () => pageHtml("/contact/").replace('href="https://drimini.com', 'href="https://example.com'), /canonical URL/],
    ["canonical credentials", () => pageHtml("/contact/").replace('href="https://drimini.com', 'href="https://user:password@drimini.com'), /canonical URL/],
    ["duplicate canonical", () => pageHtml("/contact/").replace("</head>", '<link rel="canonical" href="https://drimini.com/contact/"></head>'), /canonical URL/],
    ["commented canonical", () => pageHtml("/contact/").replace(/<link[^>]+>/, (tag) => `<!--${tag}-->`), /canonical URL/],
    ["canonical with query", () => pageHtml("/contact/").replace('/contact/"', '/contact/?tracking=1"'), /canonical URL/],
    ["unexpected noindex", () => pageHtml("/contact/").replace("</head>", '<meta name="robots" content="NOINDEX, follow"></head>'), /unexpectedly declares noindex/],
    ["wrong sharing card", () => pageHtml("/contact/").replace("drimini-og.png", "wrong.png"), /Sharing-image metadata/],
    ["wrong language", () => pageHtml("/contact/").replace('lang="en"', 'lang="fr"'), /English HTML language/],
  ];
  for (const [name, content, expected] of cases) await t.test(name, async () => {
    const check = await changedCheck("/contact/", (response) => replaceResponse(response, { content: content() }));
    assert.match(check.problems.join(" "), expected);
  });
});

test("deployments must retain the declared header policy, allowing equivalent directive ordering", async () => {
  const report = await checkWebsite({ fetcher: async (url) => {
    const response = healthyResponse(url);
    if (response.headers.has("content-security-policy")) {
      response.headers.set("content-security-policy", declaredHeaders["content-security-policy"].split(";").reverse().join("; "));
      response.headers.set("permissions-policy", "microphone=(), camera=(), geolocation=()");
    }
    return response;
  } });
  assert.equal(report.ok, true);
  for (const headers of [{ "content-security-policy": "default-src *" }, { "x-content-type-options": null }]) {
    const check = await changedCheck("/", (response) => replaceResponse(response, { content: pageHtml("/"), headers }));
    assert.match(check.problems.join(" "), /Declared .* header is missing or differs/);
  }
});

test("the missing route must be a non-indexable 404 rather than a fallback page", async () => {
  const check = await changedCheck("/__drimini-health-missing__", () => healthyResponse(`${production}/`));
  assert.match(check.problems.join(" "), /Expected HTTP 404/);
  assert.match(check.problems.join(" "), /must declare noindex/);
  assert.match(check.problems.join(" "), /must not declare a canonical/);
});

test("image probes reject redirects, wrong content, and incorrect card dimensions", async (t) => {
  const wrongDimensions = Buffer.from(image);
  wrongDimensions.writeUInt32BE(600, 16);
  for (const [name, content, status, headers, expected] of [
    ["redirect", "", 302, {}, /Expected HTTP 200/],
    ["HTML", "<html></html>", 200, { "content-type": "text/html" }, /Expected an image\/png/],
    ["truncated", image.subarray(0, 20), 200, {}, /PNG sharing image/],
    ["dimensions", wrongDimensions, 200, {}, /1200 by 630/],
  ]) await t.test(name, async () => {
    const check = await changedCheck("/brand/drimini-og.png", (response) => replaceResponse(response, { content, status, headers }));
    assert.match(check.problems.join(" "), expected);
  });
});

test("a working contact rejection requires the status, JSON shape, and no-store response", async (t) => {
  for (const [name, content, status, headers, expected] of [
    ["static fallback", pageHtml("/contact/"), 200, { "content-type": "text/html" }, /Expected HTTP 403/],
    ["false success", '{"ok":true,"message":"Stored"}', 403, {}, /explicit failed contact response/],
    ["malformed JSON", "invalid", 403, {}, /explicit failed contact response/],
    ["missing cache rule", '{"ok":false,"message":"Rejected"}', 403, { "cache-control": null }, /must declare no-store/],
  ]) await t.test(name, async () => {
    const check = await changedCheck("/api/contact", (response) => replaceResponse(response, { content, status, headers }));
    assert.match(check.problems.join(" "), expected);
  });
});

test("www checks reject temporary redirects and loss of the canonical host, path, or query", async () => {
  for (const [status, location] of [[302, `${production}/contact/?health=redirect&value=a%2Fb`], [301, `${production}/`], [301, "https://example.com/contact/?health=redirect&value=a%2Fb"], [301, `${production}/contact/`], [301, null]]) {
    const report = await checkWebsite({ fetcher: async (url) => new URL(url).hostname === "www.drimini.com"
      ? new Response(null, { status, headers: location ? { location } : {} }) : healthyResponse(url) });
    assert.equal(report.ok, false);
    assert.equal(report.checks.filter(({ outcome }) => outcome === "failed").length, 2);
  }
});

test("network failure preserves other results and does not print raw errors or response content", async () => {
  const report = await checkWebsite({ fetcher: async (url) => {
    if (url === `${production}/`) throw new Error("private upstream diagnostic");
    return healthyResponse(url);
  } });
  assert.equal(report.ok, false);
  assert.equal(report.checks.filter(({ outcome }) => outcome === "passed").length, 12);
  assert.equal(report.checks[0].id, "home");
  assert.match(report.checks[0].problems.join(" "), /Network request/);
  assert.doesNotMatch(JSON.stringify(report), /private upstream diagnostic/);
  assert.match(formatHealthReport(report), /FAIL home/);
});

test("both declared and streamed oversized responses are bounded", async () => {
  for (const response of [
    new Response("", { headers: { "content-length": String(2 * 1024 * 1024 + 1) } }),
    new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024));
      controller.enqueue(new Uint8Array(1024 * 1024 + 1));
      controller.close();
    } })),
  ]) {
    const check = await changedCheck("/", () => response);
    assert.match(check.problems.join(" "), /2 MiB read limit/);
  }
});

test("the timeout bounds both receiving headers and reading a stalled response body", async (t) => {
  for (const stage of ["headers", "body"]) await t.test(stage, async () => {
    const server = createServer(async (request, response) => {
      if (request.url === "/") {
        if (stage === "body") { response.writeHead(200, { "content-type": "text/html" }); response.write("<html>"); }
        return; // Intentionally stall until the client cancels.
      }
      const fixture = healthyResponse(`http://localhost${request.url}`);
      response.writeHead(fixture.status, Object.fromEntries(fixture.headers));
      response.end(Buffer.from(await fixture.arrayBuffer()));
    });
    try {
      await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
      const origin = `http://127.0.0.1:${server.address().port}`;
      const report = await checkWebsite({ origin, timeoutMs: 1000 });
      assert.equal(report.ok, false);
      assert.match(report.checks[0].problems.join(" "), /1000 ms timeout/);
      assert.equal(report.checks.filter(({ outcome }) => outcome === "passed").length, 10);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test("requests use bounded concurrency and preserve report ordering despite varying completion times", async () => {
  let active = 0;
  let maximum = 0;
  const report = await checkWebsite({ fetcher: async (url) => {
    active++;
    maximum = Math.max(maximum, active);
    await delay(url === `${production}/` ? 35 : 5);
    active--;
    return healthyResponse(url);
  } });
  assert.equal(report.ok, true);
  assert.equal(maximum, 3);
  assert.deepEqual(report.checks.slice(0, 3).map(({ id }) => id), ["home", "contact", "privacy"]);
});

test("CLI validates origins and limits before any request and exposes useful exit codes", async () => {
  for (const args of [["--origin"], ["--origin", "https://user:password@example.com"], ["--origin", "ftp://example.com"], ["--origin", "https://example.com/path"], ["--origin", "https://example.com?query=1"], ["--timeout-ms", "99"], ["--timeout-ms", "30001"], ["--timeout-ms", "1.5"], ["--timeout-ms"], ["--json", "--json"], ["--unknown"]]) {
    const errors = [];
    const exit = await runHealth(args, { fetcher: () => assert.fail("Invalid arguments must not make requests"), stderr: (value) => errors.push(value) });
    assert.equal(exit, 2);
    assert.equal(errors.length, 1);
    assert.doesNotMatch(errors[0], /password/);
  }
  assert.equal(parseHealthArguments(["--origin", "http://localhost:8080/", "--timeout-ms", "12000"]).origin, "http://localhost:8080");
  const output = [];
  assert.equal(await runHealth(["--help"], { fetcher: () => assert.fail("Help must not make requests"), stdout: (value) => output.push(value) }), 0);
  assert.match(output.pop(), /Exit codes: 0/);
  assert.equal(await runHealth(["--json"], { fetcher: healthyResponse, stdout: (value) => output.push(value) }), 0);
  assert.equal(JSON.parse(output.pop()).ok, true);
  assert.equal(await runHealth([], { fetcher: () => { throw new Error("offline"); }, stdout: (value) => output.push(value) }), 1);
  assert.match(output.pop(), /0\/13 checks passed/);
});
