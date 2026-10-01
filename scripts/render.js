import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { validatePoster } from "./schema.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const inputPath = path.resolve(process.argv[2] || path.join(root, "examples", "bakery.json"));
const outputPath = path.resolve(process.argv[3] || path.join(root, "output", "poster.png"));
const templatePath = path.join(root, "templates", "poster.html");

const raw = JSON.parse(await fs.readFile(inputPath, "utf8"));
if (!raw.logoUrl) {
  const logo = await fs.readFile(path.join(root, "assets", "anchor-abroad-logo.png"));
  raw.logoUrl = `data:image/png;base64,${logo.toString("base64")}`;
}
const data = validatePoster(raw);
const template = await fs.readFile(templatePath, "utf8");
const html = template.replace("__POSTER_DATA__", JSON.stringify(data).replace(/</g, "\\u003c"));
await fs.mkdir(path.dirname(outputPath), { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const poster = page.locator("#poster");
  await poster.screenshot({ path: outputPath, animations: "disabled" });
  console.log(outputPath);
} finally {
  await browser.close();
}
