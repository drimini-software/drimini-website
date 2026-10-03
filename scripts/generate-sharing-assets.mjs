import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const websiteRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const mark = await readFile(join(websiteRoot, "public", "brand", "drimini-mark-v2.svg"), "utf8");
const markURL = `data:image/svg+xml;base64,${Buffer.from(mark).toString("base64")}`;
const avatar = await readFile(join(websiteRoot, "public", "favicon.svg"), "utf8");
const avatarURL = `data:image/svg+xml;base64,${Buffer.from(avatar).toString("base64")}`;

const cards = [
  {
    file: "drimini-og.png",
    eyebrow: "Independent software company · Founded 2026",
    title: "Bring us the|difficult bit.",
    footer: "Custom software · Systems · Websites",
    note: "drimini.com",
  },
  {
    file: "drimini-website-case-study-og.png",
    eyebrow: "Case study / Self-initiated work",
    title: "Building Drimini's|first website.",
    footer: "Astro · Cloudflare Pages + D1 · WCAG checks",
    note: "drimini.com/work",
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });

for (const card of cards) {
  const [firstLine, secondLine] = card.title.split("|");
  await page.setContent(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          html, body { width: 1200px; height: 630px; margin: 0; }
          body {
            overflow: hidden;
            background:
              linear-gradient(90deg, transparent calc(100% - 1px), rgba(36, 18, 46, 0.045) 1px),
              #f5efe5;
            background-size: 112px 100%;
            color: #24122e;
            font-family: Arial, "Helvetica Neue", sans-serif;
          }
          .card { position: relative; height: 100%; padding: 54px 64px 48px; border: 1px solid #24122e; }
          .top, .bottom { position: relative; z-index: 2; display: flex; align-items: center; justify-content: space-between; }
          .brand { display: flex; align-items: center; gap: 16px; font-size: 29px; font-weight: 800; letter-spacing: -1.4px; }
          .brand img { width: 45px; height: 40px; }
          .eyebrow, .bottom { font-family: Consolas, monospace; font-size: 15px; font-weight: 700; letter-spacing: 1.1px; text-transform: uppercase; }
          .eyebrow { color: #9f2f2f; }
          h1 { position: relative; z-index: 2; max-width: 930px; margin: 76px 0 0; font-size: 94px; letter-spacing: -7px; line-height: .86; }
          h1 span { display: block; color: #9f2f2f; }
          .bottom { position: absolute; right: 64px; bottom: 48px; left: 64px; padding-top: 18px; border-top: 2px solid #24122e; }
          .bottom span:last-child { color: #665d67; }
          .splice { position: absolute; right: -42px; top: 192px; width: 320px; height: 210px; transform: rotate(-8deg); }
          .splice::before, .splice::after { position: absolute; width: 205px; height: 78px; content: ""; transform: skewX(-30deg); }
          .splice::before { top: 0; left: 0; background: #ff654f; }
          .splice::after { right: 0; bottom: 0; background: #24122e; }
          .dot { position: absolute; right: 202px; top: 121px; width: 31px; height: 31px; border: 7px solid #9f2f2f; border-radius: 50%; }
        </style>
      </head>
      <body>
        <main class="card">
          <div class="top">
            <div class="brand"><img src="${markURL}" alt="" />Drimini</div>
            <div class="eyebrow">${card.eyebrow}</div>
          </div>
          <h1>${firstLine}<span>${secondLine}</span></h1>
          <div class="dot"></div>
          <div class="splice"></div>
          <div class="bottom"><span>${card.footer}</span><span>${card.note}</span></div>
        </main>
      </body>
    </html>`);

  await page.screenshot({
    path: join(websiteRoot, "public", "brand", card.file),
    type: "png",
  });
}

await page.setViewportSize({ width: 500, height: 500 });
await page.setContent(`<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <style>
        * { box-sizing: border-box; }
        html, body { width: 500px; height: 500px; margin: 0; overflow: hidden; background: #f5efe5; }
        img { display: block; width: 500px; height: 500px; }
      </style>
    </head>
    <body><img src="${avatarURL}" alt="" /></body>
  </html>`);
await page.screenshot({
  path: join(websiteRoot, "public", "brand", "drimini-github-avatar.png"),
  type: "png",
});

await browser.close();
console.log(`Generated ${cards.length} sharing cards and one GitHub avatar in public/brand/.`);
