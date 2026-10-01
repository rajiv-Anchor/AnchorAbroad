import fs from "node:fs/promises";
import { google } from "googleapis";
import { spawn } from "node:child_process";
import path from "node:path";

const payload = JSON.parse(Buffer.from(process.env.POSTER_JSON_BASE64, "base64").toString("utf8"));
await fs.mkdir("output", { recursive: true });
await fs.writeFile("output/input.json", JSON.stringify(payload, null, 2));

await new Promise((resolve, reject) => {
  const p = spawn("node", ["scripts/render.js", "output/input.json", "output/poster.png"], { stdio: "inherit" });
  p.on("exit", code => code === 0 ? resolve() : reject(new Error(`Renderer exited ${code}`)));
});

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/drive.file"] });
const drive = google.drive({ version: "v3", auth });
const fileName = `${payload.orderCode || "JOB"}_${payload.roles.map(r => r.title).join("_")}_Anchor_Abroad_Approval.png`
  .replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180);
const created = await drive.files.create({
  requestBody: { name: fileName, parents: [process.env.DRIVE_FOLDER_ID] },
  media: { mimeType: "image/png", body: (await import("node:fs")).createReadStream(path.resolve("output/poster.png")) },
  fields: "id,name,webViewLink"
});
console.log(JSON.stringify(created.data));
