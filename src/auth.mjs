// Multi-user login with persistent HttpOnly cookie sessions.
//
// Each user has their own password. The cookie encodes the username and a hash
// so the server can identify who is signed in without server-side session state.
//
// Only Web-standard APIs are used (crypto.subtle, TextEncoder) so this module
// works unchanged in the Edge middleware runtime and in Node 18+.

const USERS = {
  Tommy:   process.env.PASSWORD_TOMMY   || "TommyLikesFish321!",
  Brandon: process.env.PASSWORD_BRANDON || "BrandonLikesFish321!",
  Mac:     process.env.PASSWORD_MAC     || "MacLikesFish321!"
};

const SALT = "keystone-auth-v1";

export const AUTH_COOKIE = "keystone_auth";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const LOGIN_PATH = "/login.html";

function hexHash(data) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(data)).then((digest) =>
    [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}

const _tokenCache = {};

function tokenForUser(username) {
  if (!_tokenCache[username]) {
    const password = USERS[username];
    if (!password) return Promise.resolve(null);
    _tokenCache[username] = hexHash(`${SALT}:${username}:${password}`);
  }
  return _tokenCache[username];
}

export function verifyCredentials(username, password) {
  if (typeof username !== "string" || typeof password !== "string") return null;
  const match = Object.keys(USERS).find((u) => u.toLowerCase() === username.toLowerCase());
  if (!match || USERS[match] !== password) return null;
  return match;
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

export async function getAuthedUser(cookieHeader = "") {
  const raw = parseCookies(cookieHeader)[AUTH_COOKIE];
  if (!raw) return null;
  const sep = raw.indexOf(":");
  if (sep < 0) return null;
  const username = raw.slice(0, sep);
  const hash = raw.slice(sep + 1);
  const expected = await tokenForUser(username);
  if (!expected || hash !== expected) return null;
  return username;
}

export async function isAuthed(cookieHeader = "") {
  return Boolean(await getAuthedUser(cookieHeader));
}

export async function buildAuthCookie({ username, secure = true } = {}) {
  const hash = await tokenForUser(username);
  if (!hash) throw new Error("Unknown user.");
  const token = `${username}:${hash}`;
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
