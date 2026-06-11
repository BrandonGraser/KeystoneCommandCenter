import { access, readFile } from "node:fs/promises";

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

console.log("Build validation passed.");
