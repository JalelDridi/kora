// Renders docs/report/kora-plan.html to kora-plan.pdf, one 1280×720 page
// per slide. Locally it uses the installed Chrome.
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const html = fileURLToPath(
  new URL("../docs/report/kora-plan.html", import.meta.url),
);
const pdf = html.replace(/\.html$/, ".pdf");

const browser = await chromium.launch({
  channel: process.env.CI ? undefined : "chrome",
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(pathToFileURL(html).href, { waitUntil: "networkidle" });
const slides = await page.locator(".slide").count();
await page.pdf({
  path: pdf,
  width: "1280px",
  height: "720px",
  printBackground: true,
  preferCSSPageSize: true,
});
await browser.close();

console.log(`${slides} slides → ${pdf}`);
