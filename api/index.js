// Vercel entry point. All /api/* requests are rewritten here (vercel.json);
// auth for page views and API 401s is enforced by middleware.js. Every route
// lives in the shared router (src/routes.mjs) — add new endpoints there.

import { handleApi } from "../src/routes.mjs";
import { getAuthedUser } from "../src/auth.mjs";

export const config = {
  api: { bodyParser: false }
};

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const currentUser = await getAuthedUser(req.headers.cookie || "");
    await handleApi(req, res, url, currentUser);
  } catch (error) {
    res.writeHead(error.status || 500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: error.message || "Something went wrong." }));
  }
}
