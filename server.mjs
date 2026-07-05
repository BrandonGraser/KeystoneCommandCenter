// Local/Docker entry point: static files + auth gate around the shared API
// router (src/routes.mjs). The Vercel deployment wraps the same router in
// api/index.js — all routes live in routes.mjs so the two can't drift.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import "./src/env.mjs";
import { handleApi, sendJson } from "./src/routes.mjs";
import { getAuthedUser, LOGIN_PATH } from "./src/auth.mjs";

const PORT = Number(process.env.PORT || 4242);
const PUBLIC_DIR = join(process.cwd(), "public");

const PUBLIC_PATHS = new Set([LOGIN_PATH, "/api/login", "/healthz", "/api/cron/sync-accounts"]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);

    if (url.pathname === "/healthz") {
      sendJson(response, 200, { ok: true });
      return;
    }

    const currentUser = await getAuthedUser(request.headers.cookie || "");
    if (!PUBLIC_PATHS.has(url.pathname) && !currentUser) {
      if (url.pathname.startsWith("/api/")) {
        sendJson(response, 401, { error: "Not authorized." });
      } else {
        response.writeHead(302, { Location: LOGIN_PATH });
        response.end();
      }
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url, currentUser);
      return;
    }

    await serveStatic(response, url.pathname);
  } catch (error) {
    sendJson(response, error.status || 500, {
      error: error.message || "Something went wrong."
    });
  }
});

server.listen(PORT, () => {
  console.log(`Keystone Task Command Center running at http://localhost:${PORT}`);
});

async function serveStatic(response, pathname) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const target = normalize(join(PUBLIC_DIR, cleanPath));
  if (!target.startsWith(PUBLIC_DIR) || !existsSync(target)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  const body = await readFile(target);
  response.writeHead(200, { "Content-Type": contentType(target) });
  response.end(body);
}

function contentType(path) {
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".gif": "image/gif",
    ".png": "image/png"
  }[extname(path)] || "application/octet-stream";
}
