import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runHealthActions } from "../scripts/health-actions.mjs";

const temporaryRoot = new URL("../.cache/health-tests/", import.meta.url);
const report = {
  schema_version: "1", checked_at: "2026-10-11T12:00:00.000Z", origin: "https://drimini.com", ok: true,
  checks: [{ id: "home", method: "GET", url: "https://drimini.com/", outcome: "passed", problems: [], http_status: 200 }],
  scope: ["Contact rejection only; successful Turnstile verification and D1 storage are not checked."],
};

async function withDirectory(run) {
  await mkdir(temporaryRoot, { recursive: true });
  const directory = await mkdtemp(new URL("run-", temporaryRoot));
  try { await run(directory); } finally {
    assert.match(relative(fileURLToPath(temporaryRoot), directory), /^run-[a-zA-Z0-9]+$/);
    await rm(directory, { recursive: true, force: true });
  }
}

test("a successful check writes both reports and appends an escaped GitHub summary", async () => withDirectory(async (directory) => {
  const summaryPath = join(directory, "summary.md");
  await writeFile(summaryPath, "Earlier step\n");
  const output = [];
  const code = await runHealthActions([], { directory, summaryPath, check: async (...args) => {
    assert.deepEqual(args, []); // No origin override or credentials from workflow inputs.
    return report;
  }, stdout: (value) => output.push(value) });
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(await readFile(join(directory, "website-health.json"), "utf8")), report);
  assert.match(await readFile(join(directory, "website-health.txt"), "utf8"), /1\/1 checks passed/);
  const summary = await readFile(summaryPath, "utf8");
  assert.match(summary, /^Earlier step\n### Website health/);
  assert.match(summary, /<pre>Drimini website checks: PASS/);
  assert.match(summary, /successful Turnstile verification and D1 storage are not checked/);
  assert.equal(output.length, 1);
}));

test("failed probes return failure while retaining complete JSON, text, and summary results", async () => withDirectory(async (directory) => {
  const failed = structuredClone(report);
  failed.ok = false;
  failed.checks[0].outcome = "failed";
  failed.checks[0].http_status = 503;
  failed.checks[0].problems = ["Expected HTTP 200; received 503."];
  const summaryPath = join(directory, "summary.md");
  const code = await runHealthActions([], { directory, summaryPath, check: async () => failed, stdout: () => {} });
  assert.equal(code, 1);
  assert.deepEqual(JSON.parse(await readFile(join(directory, "website-health.json"), "utf8")), failed);
  assert.match(await readFile(join(directory, "website-health.txt"), "utf8"), /FAIL home \(HTTP 503\)/);
  assert.match(await readFile(summaryPath, "utf8"), /0\/1 checks passed/);
}));

test("summary text cannot become HTML or close the preformatted report", async () => withDirectory(async (directory) => {
  const hostile = structuredClone(report);
  hostile.ok = false;
  hostile.checks[0].outcome = "failed";
  hostile.checks[0].problems = ['</pre><script>alert("fixture")</script>& <img src="https://example.com">'];
  const summaryPath = join(directory, "summary.md");
  assert.equal(await runHealthActions([], { directory, summaryPath, check: async () => hostile, stdout: () => {} }), 1);
  const summary = await readFile(summaryPath, "utf8");
  assert.doesNotMatch(summary, /<script>|<img/);
  assert.match(summary, /&lt;\/pre&gt;&lt;script&gt;/);
  assert.match(summary, /&amp; &lt;img/);
  assert.equal(summary.match(/<\/pre>/g).length, 1);
}));

test("reports can be produced locally without a GitHub summary path", async () => withDirectory(async (directory) => {
  assert.equal(await runHealthActions([], { directory, summaryPath: "", check: async () => report, stdout: () => {} }), 0);
  assert.deepEqual(JSON.parse(await readFile(join(directory, "website-health.json"), "utf8")), report);
}));

test("startup failure removes previous generated reports and emits a safe error", async () => withDirectory(async (directory) => {
  for (const name of ["website-health.json", "website-health.txt"]) await writeFile(join(directory, name), "old passed result");
  await writeFile(join(directory, "unrelated.txt"), "keep this file");
  const errors = [];
  const code = await runHealthActions([], { directory, summaryPath: "", check: async () => { throw new Error("private diagnostic"); }, stderr: (value) => errors.push(value) });
  assert.equal(code, 1);
  for (const name of ["website-health.json", "website-health.txt"]) await assert.rejects(readFile(join(directory, name)), { code: "ENOENT" });
  assert.equal(await readFile(join(directory, "unrelated.txt"), "utf8"), "keep this file");
  assert.deepEqual(errors, ["Website checks could not complete; no health report was produced."]);
}));

test("report preparation failure stops before any network probe", async () => withDirectory(async (directory) => {
  const invalid = join(directory, "file");
  await writeFile(invalid, "not a directory");
  const errors = [];
  assert.equal(await runHealthActions([], { directory: invalid, summaryPath: "", check: () => assert.fail("Must not probe without a report directory"), stderr: (value) => errors.push(value) }), 1);
  assert.deepEqual(errors, ["Health report files could not be prepared."]);
}));

test("summary failure fails the run while preserving reports for the artifact step", async () => withDirectory(async (directory) => {
  const errors = [];
  assert.equal(await runHealthActions([], { directory, summaryPath: join(directory, "missing", "summary.md"), check: async () => report, stdout: () => {}, stderr: (value) => errors.push(value) }), 1);
  assert.equal(JSON.parse(await readFile(join(directory, "website-health.json"), "utf8")).ok, true);
  assert.match(await readFile(join(directory, "website-health.txt"), "utf8"), /PASS/);
  assert.deepEqual(errors, ["The GitHub job summary could not be written; health report files are retained."]);
}));

test("report write failure cannot turn healthy probes into a passing job", async () => withDirectory(async (directory) => {
  const errors = [];
  const code = await runHealthActions([], { directory, summaryPath: "", check: async () => {
    await mkdir(join(directory, "website-health.json"));
    return report;
  }, stdout: () => assert.fail("Incomplete reports must not be announced as passed"), stderr: (value) => errors.push(value) });
  assert.equal(code, 1);
  assert.deepEqual(errors, ["Health report files could not be written."]);
}));

test("workflow arguments are rejected before producing files or making requests", async () => withDirectory(async (directory) => {
  const errors = [];
  assert.equal(await runHealthActions(["--origin", "https://example.com"], { directory, check: () => assert.fail("Workflow target must be fixed"), stderr: (value) => errors.push(value) }), 2);
  assert.match(errors[0], /accepts no arguments/);
  await assert.rejects(readFile(join(directory, "website-health.json")), { code: "ENOENT" });
}));
