import { appendFile, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkWebsite, formatHealthReport } from "./health.mjs";

const defaultDirectory = fileURLToPath(new URL("../.cache/health/", import.meta.url));
const reportNames = ["website-health.json", "website-health.txt"];

export function formatActionSummary(report) {
  const text = formatHealthReport(report).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return `### Website health\n\n<pre>${text}</pre>\n`;
}

// Fixed production target and report names: no workflow inputs or account access.
export async function runHealthActions(args = [], {
  check = checkWebsite,
  directory = defaultDirectory,
  summaryPath = process.env.GITHUB_STEP_SUMMARY,
  stdout = console.log,
  stderr = console.error,
} = {}) {
  if (args.length) {
    stderr("This workflow runner accepts no arguments. Use pnpm health for custom origins.");
    return 2;
  }
  const [jsonPath, textPath] = reportNames.map((name) => join(directory, name));
  try {
    await mkdir(directory, { recursive: true });
    // Clear only these generated files so a startup failure cannot upload old results.
    for (const path of [jsonPath, textPath]) await rm(path, { force: true });
  } catch {
    stderr("Health report files could not be prepared.");
    return 1;
  }
  let report;
  try {
    report = await check();
  } catch {
    stderr("Website checks could not complete; no health report was produced.");
    return 1;
  }
  try {
    const text = formatHealthReport(report);
    await writeFile(jsonPath, JSON.stringify(report, null, 2) + "\n", "utf8");
    await writeFile(textPath, text + "\n", "utf8");
    stdout(text);
  } catch {
    stderr("Health report files could not be written.");
    return 1;
  }
  if (summaryPath) {
    try {
      await appendFile(summaryPath, formatActionSummary(report), "utf8");
    } catch {
      stderr("The GitHub job summary could not be written; health report files are retained.");
      return 1;
    }
  }
  return report.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runHealthActions(process.argv.slice(2));
}
