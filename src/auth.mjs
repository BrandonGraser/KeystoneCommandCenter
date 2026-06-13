// Shared login/session helpers for both the local Node server (server.mjs)
// and the Vercel codepath (middleware.js + api/index.js).
//
// Auth is a single shared password (no username). On a successful login the
// server sets a long-lived, HttpOnly cookie holding a hash of the password, so
// the visitor stays signed in for a year without re-entering it.
//
// Only Web-standard APIs are used (crypto.subtle, TextEncoder) so this module
// works unchanged in the Edge middleware runtime and in Node 18+.

const PASSWORD = process.env.APP_PASSWORD || "BrandonLikesFish321!";
const SALT = "keystone-auth-v1";

export const AUTH_COOKIE = "keystone_auth";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // one year, in seconds
export const LOGIN_PATH = "/login.html";

let _tokenPromise = null;

// The cookie value: a hex SHA-256 of the password (with a salt). Constant for a
// given password, so we can verify a returning visitor without server state.
export function expectedToken() {
  if (!_tokenPromise) {
    const data = new TextEncoder().encode(`${SALT}:${PASSWORD}`);
    _tokenPromise = crypto.subtle.digest("SHA-256", data).then((digest) =>
      [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
    );
  }
  return _tokenPromise;
}

export function verifyPassword(input) {
  return typeof input === "string" && input === PASSWORD;
}

export function parseCookies(header = "") {
  const out = {};
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

export async function isAuthed(cookieHeader = "") {
  const token = parseCookies(cookieHeader)[AUTH_COOKIE];
  return Boolean(token) && token === (await expectedToken());
}

// Build the Set-Cookie header string for a successful login.
export async function buildAuthCookie({ secure = true } = {}) {
  const token = await expectedToken();
  const attrs = [
    `${AUTH_COOKIE}=${token}`,
    "Path=/",
    `Max-Age=${COOKIE_MAX_AGE}`,
    "HttpOnly",
    "SameSite=Lax"
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}
