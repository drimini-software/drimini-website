import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Server } from "node:http";
import { startStaticServer, stopStaticServer } from "./static-server";

let server: Server;

test.beforeAll(async () => {
  server = await startStaticServer();
});

test.afterAll(async () => {
  await stopStaticServer(server);
});

test("the homepage explains the offer and exposes the primary action", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Drimini");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bring us the difficult bit.");
  await expect(page.getByRole("link", { name: "Contact us" }).first()).toHaveAttribute("href", "/contact");
  await expect(page.getByRole("heading", { name: "Fast loops. Visible judgment." })).toBeVisible();
  await expect(page.locator("script")).toHaveCount(0);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/favicon.svg");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://drimini.com/",
  );
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    "content",
    "https://drimini.com/",
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://drimini.com/brand/drimini-og.png",
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );

  const markLoaded = await page.locator(".wordmark__mark").evaluate((image: HTMLImageElement) =>
    image.complete && image.naturalWidth > 0
  );
  expect(markLoaded).toBe(true);
});

test("the work pages distinguish self-initiated proof from client outcomes", async ({ page }) => {
  await page.goto("/work");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Work we can show honestly.");
  await expect(page.getByText("This is our own work, not a borrowed client story.")).toBeVisible();
  await page.getByRole("link", { name: "Read the case study" }).click();

  await expect(page).toHaveURL(/\/work\/drimini-website\/?$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Building Drimini's first website.",
  );
  await expect(page.getByText("This is Drimini's own project.")).toBeVisible();
  await expect(page.getByText(/What this does not prove: client results/)).toBeVisible();
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://drimini.com/brand/drimini-website-case-study-og.png",
  );
});

test("the contact form validates and reports a successful submission", async ({ page }) => {
  await page.goto("/contact");

  const form = page.getByRole("form");
  await expect(form).toBeVisible();
  await page.getByLabel("Name *").fill("Avery Stone");
  await page.getByLabel("Work email *").fill("avery@example.com");
  await page.getByLabel("Company *").fill("Example Systems");
  await page.getByLabel("What do you need help with? *").fill(
    "We need help replacing a brittle operational system safely.",
  );
  await page.getByLabel(/I have read the privacy notice/).check();
  await page.getByRole("button", { name: "Send project outline" }).click();

  await expect(page.getByRole("status")).toHaveText("Thanks. Your message has been received.");
  await expect(page.getByRole("button", { name: "Send project outline" })).toBeEnabled();
});

test("the contact form reports delivery failure without clearing the message", async ({ page }) => {
  await page.route("**/api/contact", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        message: "The message could not be received right now. Please try again later.",
      }),
    });
  });
  await page.goto("/contact");

  await page.getByLabel("Name *").fill("Avery Stone");
  await page.getByLabel("Work email *").fill("avery@example.com");
  await page.getByLabel("Company *").fill("Example Systems");
  const project = page.getByLabel("What do you need help with? *");
  await project.fill("We need help replacing a brittle operational system safely.");
  await page.getByLabel(/I have read the privacy notice/).check();
  await page.getByRole("button", { name: "Send project outline" }).click();

  await expect(page.getByRole("status")).toHaveText(
    "The message could not be received right now. Please try again later.",
  );
  await expect(project).toHaveValue("We need help replacing a brittle operational system safely.");
});

test("the homepage does not overflow a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const viewport = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));

  expect(viewport.documentWidth).toBeLessThanOrEqual(viewport.viewportWidth);
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
});

test("the case study does not overflow a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/work/drimini-website");

  const viewport = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));

  expect(viewport.documentWidth).toBeLessThanOrEqual(viewport.viewportWidth);
});

test("an unknown route returns the designed 404 page", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist");

  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This bit is missing.");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});

test("the homepage stays inside its first-release page-weight budgets", async ({ page }) => {
  const response = await page.goto("/");
  expect(response).not.toBeNull();

  const htmlBytes = (await response!.body()).byteLength;
  const resources = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((entry) => {
      const resource = entry as PerformanceResourceTiming;
      return {
        name: resource.name,
        decodedBodySize: resource.decodedBodySize,
      };
    })
  );
  const cssBytes = resources
    .filter(({ name }) => name.endsWith(".css"))
    .reduce((total, resource) => total + resource.decodedBodySize, 0);
  const scriptResources = resources.filter(({ name }) => /\.m?js(?:\?|$)/.test(name));

  expect(htmlBytes).toBeLessThanOrEqual(15 * 1024);
  expect(cssBytes).toBeLessThanOrEqual(25 * 1024);
  expect(scriptResources).toEqual([]);
});

for (const route of [
  "/",
  "/work",
  "/work/drimini-website",
  "/contact",
  "/contact/sent",
  "/contact/problem",
  "/privacy",
  "/404.html",
]) {
  test(`${route} has no automatically detectable accessibility violations`, async ({ page }) => {
    await page.goto(route);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(results.violations).toEqual([]);
  });
}
