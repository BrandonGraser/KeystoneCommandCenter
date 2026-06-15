import { isAuthed, LOGIN_PATH } from "./src/auth.mjs";

// Public paths that must stay reachable without a session.
const PUBLIC_PATHS = new Set([
  LOGIN_PATH, "/api/login", "/healthz", "/api/cron/sync-accounts",
  "/api/tiktok/connect", "/api/tiktok/callback"
]);

export default async function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (PUBLIC_PATHS.has(path)) return;

  if (await isAuthed(request.headers.get("cookie") || "")) return;

  // Not signed in: APIs get a 401, page views get sent to the login screen.
  if (path.startsWith("/api/")) {
    return new Response(JSON.stringify({ error: "Not authorized." }), {
      status: 401,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }

  return Response.redirect(new URL(LOGIN_PATH, request.url), 302);
}

export const config = {
  matcher: ["/((?!_vercel|favicon\\.ico).*)"]
};
