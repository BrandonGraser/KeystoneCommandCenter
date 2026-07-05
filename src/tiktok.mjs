// TikTok Login Kit (OAuth) + Display API client.
//
// Per-account connection powers the Accounts tab metrics: video stats via
// /v2/video/list/ and profile stats (followers etc.) via /v2/user/info/.
//
// Credentials come from the environment (never hardcoded). Set:
//   TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET
//   TIKTOK_REDIRECT_URI (optional; defaults to the deployed callback)
//
// Docs: https://developers.tiktok.com/doc/login-kit-web and /display-api.

import { newDailySeries, addToDaily, serializeDaily } from "./metrics.mjs";

const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || "";
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || "";
const REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI || "https://keystone-command-center.vercel.app/api/tiktok/callback";

// user.info.stats unlocks follower/likes/video counts. Accounts connected
// before this scope was added keep working for videos; the user-info call
// just fails until they hit Reconnect and re-authorize.
const SCOPES = "user.info.basic,user.info.stats,video.list";

const VIDEO_FIELDS = "id,create_time,title,duration,cover_image_url,share_url,view_count,like_count,comment_count,share_count";
const USER_FIELDS = "open_id,display_name,avatar_url,follower_count,following_count,likes_count,video_count";

export function isTikTokConfigured() {
  return Boolean(CLIENT_KEY && CLIENT_SECRET);
}

export function getRedirectUri() {
  return REDIRECT_URI;
}

export function buildAuthUrl(state) {
  const params = new URLSearchParams({
    client_key: CLIENT_KEY,
    scope: SCOPES,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    state
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${params}`;
}

// Exchange the auth code for an access token.
export async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_key: CLIENT_KEY,
    client_secret: CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI
  });
  const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
  }
  return data; // { access_token, refresh_token, expires_in, open_id, scope, ... }
}

// Refresh an expired access token. TikTok may rotate the refresh token too.
export async function refreshToken(refresh_token) {
  const body = new URLSearchParams({
    client_key: CLIENT_KEY,
    client_secret: CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token
  });
  const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  }
  return data;
}

// Profile stats: follower/following/likes/video counts. Requires the
// user.info.stats scope — returns null (instead of throwing) when the token
// predates that scope so a video sync can still succeed.
export async function getUserInfo(accessToken) {
  const response = await fetch(
    `https://open.tiktokapis.com/v2/user/info/?fields=${encodeURIComponent(USER_FIELDS)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || (data.error && data.error.code !== "ok")) return null;
  return data.data?.user || null;
}

// Page through the user's videos and return them with their real stats.
// 10 pages × 20 = up to 200 recent videos per sync; older videos keep their
// last-known stats in the tiktok_videos table.
export async function listVideos(accessToken, { maxPages = 10 } = {}) {
  const videos = [];
  let cursor;
  for (let page = 0; page < maxPages; page++) {
    const payload = { max_count: 20 };
    if (cursor) payload.cursor = cursor;
    const response = await fetch(
      `https://open.tiktokapis.com/v2/video/list/?fields=${encodeURIComponent(VIDEO_FIELDS)}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error?.code !== "ok") {
      // Surface TikTok's error so we can see exactly what's wrong.
      throw new Error(`video.list failed: ${JSON.stringify(data.error || data)}`);
    }
    for (const v of data.data?.videos || []) videos.push(v);
    if (!data.data?.has_more) break;
    cursor = data.data.cursor;
  }
  return videos;
}

// Self-contained error page for OAuth callback failures.
export function buildOAuthErrorHtml(error) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  return `<!doctype html><html><head><meta charset="utf-8"><title>TikTok connection failed</title>
    <style>
      body{background:#0a0a0a;color:#e6e6e6;font-family:ui-monospace,Menlo,Consolas,monospace;margin:0;padding:40px;}
      .card{max-width:620px;margin:0 auto;border:1px solid #262626;background:#0e0e0e;padding:24px;}
      h1{font-size:15px;letter-spacing:.08em;text-transform:uppercase;margin:0 0 14px;}
      .muted{color:#8d8d8d;font-size:12px;}
      pre{background:#000;border:1px solid #3f3f3f;padding:10px;overflow:auto;font-size:11px;color:#d8b54a;white-space:pre-wrap;}
      a{color:#6aa0ff;}
    </style></head>
    <body><div class="card">
      <h1>TikTok connection failed</h1>
      <pre>${esc(error)}</pre>
      <p class="muted">If this is a scope or field error, reconnecting the account usually fixes it.</p>
      <p style="margin-top:18px"><a href="/">← Back to app</a></p>
    </div></body></html>`;
}

// Sum stats into the last `days` window and the `days` window before it, so the
// UI can show period-over-period deltas. create_time is unix seconds.
export function aggregateWindows(videos, days = 14) {
  const now = Date.now() / 1000;
  const cutCurrent = now - days * 86400;
  const cutPrevious = now - 2 * days * 86400;
  const daily = newDailySeries(days);
  const blank = () => ({ views: 0, likes: 0, comments: 0, shares: 0, postCount: 0 });
  const current = blank();
  const previous = blank();
  for (const v of videos) {
    const views = Number(v.view_count) || 0;
    const likes = Number(v.like_count) || 0;
    const comments = Number(v.comment_count) || 0;
    const shares = Number(v.share_count) || 0;
    const t = Number(v.create_time) || 0;
    const bucket = t >= cutCurrent ? current : (t >= cutPrevious ? previous : null);
    if (!bucket) continue;
    bucket.postCount += 1;
    bucket.views += views;
    bucket.likes += likes;
    bucket.comments += comments;
    bucket.shares += shares;
    if (bucket === current) addToDaily(daily, t * 1000, views, likes, comments);
  }
  return { ...current, windowDays: days, prev: previous, daily: serializeDaily(daily) };
}
