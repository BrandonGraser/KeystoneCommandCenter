import { access, readFile } from "node:fs/promises";
import { getBootstrap } from "../src/db.mjs";

const required = [
  "public/index.html",
  "public/styles.css",
  "public/app.js",
  "server.mjs",
  "src/db.mjs",
  "src/importer.mjs",
  "src/xlsx.mjs"
];

for (const file of required) {
  await access(file);
}

const html = await readFile("public/index.html", "utf8");
for (const asset of ["/styles.css", "/app.js"]) {
  if (!html.includes(asset)) {
    throw new Error(`index.html does not reference ${asset}`);
  }
}

const bootstrap = getBootstrap();
if (!Array.isArray(bootstrap.assignees) || bootstrap.assignees.length !== 3) {
  throw new Error("Assignees were not initialized.");
}

console.log("Build validation passed.");
