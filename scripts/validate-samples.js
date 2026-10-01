import fs from "node:fs/promises";
import { validatePoster } from "./schema.js";

for (const name of ["bakery.json", "pizza-two-role.json", "oman-four-role.json"]) {
  const raw = JSON.parse(await fs.readFile(new URL(`../examples/${name}`, import.meta.url), "utf8"));
  validatePoster(raw);
  console.log(`validated: ${name}`);
}
